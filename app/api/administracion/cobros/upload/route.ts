import { NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import * as XLSX from 'xlsx'
import { getServerUser } from '@/lib/auth'
import { parsearMovimientos, comportamientoPorCliente } from '@/lib/administracion/movimientosCtaCte'
import { normalizarNombreCliente } from '@/lib/administracion/finanzas'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('Supabase no configurado')
  return createSupabaseClient(url, key)
}

/**
 * POST /api/administracion/cobros/upload
 *
 * Carga el informe "Movimientos Cta. Cte." del ERP a `cobros_erp`: la plata
 * que EFECTIVAMENTE entró, con fecha, monto y método de pago. Es la única
 * fuente de pagos del sistema — antes de esto Finanzas sólo sabía qué se
 * despachó y cuánta deuda quedaba, nunca cuándo se cobró.
 *
 * Además refresca `clientes.dias_pago_real_mediana/muestras/actualizado`, que
 * es lo que la proyección de caja ya consulta (app/administracion/page.tsx):
 * hasta ahora ese cálculo se había hecho UNA sola vez a mano (10-sep-2026) y
 * quedó congelado. Con esta ruta se recalcula en cada carga.
 *
 * Es seguro repetir la carga: borra el rango de fechas que trae el archivo
 * antes de insertar, así que volver a subir el mismo informe (o uno más
 * nuevo que lo solape) reemplaza en vez de duplicar. Se borra por RANGO y no
 * la tabla entera para que un export parcial no se lleve puesto el historial
 * que ya estaba cargado.
 */
export async function POST(req: Request) {
  const user = await getServerUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!user.isAdmin) return NextResponse.json({ error: 'Sólo administradores' }, { status: 403 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No se recibió archivo' }, { status: 400 })

  const buffer = await file.arrayBuffer()
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true })
  // El ERP exporta dos hojas con los mismos datos: "Sheet1" (encabezados en
  // español, con acentos que a veces llegan rotos) y "Datos" (normalizados).
  // Se prefiere "Datos" por ser más estable de matchear.
  const nombreHoja = wb.SheetNames.includes('Datos') ? 'Datos' : wb.SheetNames[0]
  const filas = XLSX.utils.sheet_to_json(wb.Sheets[nombreHoja], {
    defval: null, header: 1,
  }) as unknown[][]

  const parseado = parsearMovimientos(filas)
  if ('error' in parseado) return NextResponse.json({ error: parseado.error }, { status: 400 })

  const { cobros, diagnostico } = parseado
  const admin = getAdminClient()

  // Reemplazo por rango: el informe es una ventana continua de fechas, así
  // que todo lo que caiga dentro se regraba con lo que trae el archivo.
  const { error: errBorrado } = await admin
    .from('cobros_erp')
    .delete()
    .gte('fecha', diagnostico.desde!)
    .lte('fecha', diagnostico.hasta!)
  if (errBorrado) return NextResponse.json({ error: errBorrado.message }, { status: 500 })

  const filasInsert = cobros.map(c => ({
    fecha: c.fecha,
    cliente: c.cliente,
    monto: c.monto,
    metodo: c.metodo,
    guia: c.guia,
    factura: c.factura,
    fecha_guia: c.fechaGuia,
    dias_pago: c.diasPago,
  }))

  for (let i = 0; i < filasInsert.length; i += 500) {
    const { error } = await admin.from('cobros_erp').insert(filasInsert.slice(i, i + 500))
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  /* ── Refresco del comportamiento de pago real ───────────────────────────
     Se escribe sobre `clientes` para no tener que tocar la proyección de
     caja, que ya lee esos campos. Sólo clientes con 3+ pagos cruzados: con
     menos muestras la mediana es ruido y la propia proyección la descarta. */
  const comportamiento = comportamientoPorCliente(cobros).filter(c => c.muestras >= 3)

  const { data: clientesRaw } = await admin.from('clientes').select('id, nombre_fantasia')
  const idPorNombre = new Map<string, string>()
  for (const c of clientesRaw ?? []) {
    const k = normalizarNombreCliente(c.nombre_fantasia as string | null)
    if (k && !idPorNombre.has(k)) idPorNombre.set(k, c.id as string)
  }

  const hoy = new Date().toISOString().slice(0, 10)
  const actualizaciones: { id: string; mediana: number; muestras: number }[] = []
  let sinFichaDeCliente = 0
  for (const c of comportamiento) {
    const id = idPorNombre.get(normalizarNombreCliente(c.cliente))
    if (!id) { sinFichaDeCliente++; continue }
    actualizaciones.push({ id, mediana: c.mediana, muestras: c.muestras })
  }

  for (const a of actualizaciones) {
    await admin.from('clientes').update({
      dias_pago_real_mediana: a.mediana,
      dias_pago_real_muestras: a.muestras,
      dias_pago_real_actualizado: hoy,
    }).eq('id', a.id)
  }

  return NextResponse.json({
    ok: true,
    cobros: cobros.length,
    montoTotal: Math.round(cobros.reduce((s, c) => s + c.monto, 0)),
    clientesActualizados: actualizaciones.length,
    clientesSinFicha: sinFichaDeCliente,
    ...diagnostico,
  })
}
