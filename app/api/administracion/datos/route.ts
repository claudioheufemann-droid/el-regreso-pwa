import { NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { ciclosDe, cicloEstaCerrado, DIA_INICIO_CICLO, DIA_FIN_CICLO } from '@/lib/produccion/reglas'
import { categoriaNormalizada, esIngresoReal, type FilaVentaFinanzas } from '@/lib/administracion/finanzas'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('Supabase no configurado')
  return createSupabaseClient(url, key)
}

/**
 * GET /api/administracion/datos
 *
 * Serie histórica de INGRESOS en $ (venta neta, "Total s/imp $") agregada por
 * ciclo interno, para que el script de forecast corra Prophet sobre dinero
 * igual que ya lo corre sobre litros. Gemelo de /api/produccion/datos, con dos
 * diferencias que importan:
 *
 *   · Unidad: `monto` (neto) en vez de litros.
 *   · Población: usa la exclusión de VENTAS, no la de Producción. El consumo
 *     interno (PDV, BaseCamp, feria, mermas, muestras) son litros que hay que
 *     producir, pero NO son plata que alguien vaya a pagar — meterlos inflaría
 *     el forecast de ingresos con venta que no existe.
 *
 * Cuenta por fecha de PEDIDO, igual que el forecast de litros: es la señal más
 * temprana y mantiene "vendido este mes" significando lo mismo en los dos
 * módulos. Cuándo se COBRA esa venta es otra pregunta, y se resuelve aparte en
 * lib/administracion/finanzas.ts (fecha de entrega + días de pago).
 *
 * Autenticación dual, mismo patrón que /api/produccion/datos.
 */
export async function GET(req: Request) {
  const auth = req.headers.get('authorization')
  const secret = process.env.UPLOAD_SECRET_FORECAST
  const esCron = !!secret && auth === `Bearer ${secret}`

  let supabase: ReturnType<typeof getAdminClient>
  try {
    supabase = getAdminClient()
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }

  if (!esCron) {
    const { getServerUser } = await import('@/lib/auth')
    const user = await getServerUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    if (!user.isAdmin) return NextResponse.json({ error: 'Solo administradores' }, { status: 403 })
  }

  // PostgREST corta en 1000 filas por página.
  const PAGE = 1000
  const filas: FilaVentaFinanzas[] = []
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase
      .from('ventas')
      .select('nombre_fantasia, producto, categoria_producto, envase, litros, total_sin_impuesto, fecha_pedido, fecha_entrega, entregado')
      .order('id', { ascending: true })
      .range(offset, offset + PAGE - 1)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data || data.length === 0) break
    filas.push(...(data as FilaVentaFinanzas[]))
    if (data.length < PAGE) break
  }

  const general = new Map<string, number>()
  const porCategoria = new Map<string, Map<string, number>>()
  const mesesConVenta = new Set<string>()
  let excluidasCliente = 0
  let excluidasCicloAbierto = 0
  let montoSinCategoria = 0

  for (const f of filas) {
    if (!f.fecha_pedido) continue
    if (!esIngresoReal(f)) { excluidasCliente++; continue }
    const monto = Number(f.total_sin_impuesto) || 0
    if (monto === 0) continue

    const categoria = categoriaNormalizada(f.producto, f.categoria_producto)
    if (categoria === 'Otros') montoSinCategoria += monto

    let entroAlgunCiclo = false
    for (const ciclo of ciclosDe(f.fecha_pedido)) {
      // Un ciclo abierto entra incompleto y Prophet lo lee como una caída real
      // de ingresos — mismo motivo que en /api/produccion/datos.
      if (!cicloEstaCerrado(ciclo)) continue
      entroAlgunCiclo = true
      mesesConVenta.add(ciclo)
      general.set(ciclo, (general.get(ciclo) ?? 0) + monto)

      if (!porCategoria.has(categoria)) porCategoria.set(categoria, new Map())
      const serie = porCategoria.get(categoria)!
      serie.set(ciclo, (serie.get(ciclo) ?? 0) + monto)
    }
    if (!entroAlgunCiclo) excluidasCicloAbierto++
  }

  const toArray = (m: Map<string, number>) =>
    [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([mes, monto]) => ({ mes, monto: Math.round(monto) }))

  const categoriaObj: Record<string, { mes: string; monto: number }[]> = {}
  for (const [cat, serie] of porCategoria) categoriaObj[cat] = toArray(serie)

  const calidad: { tipo: string; clave: string | null; detalle: string; severidad: 'info' | 'advertencia' }[] = [
    {
      tipo: 'unidad', clave: null,
      detalle: 'La unidad es la venta NETA ("Total s/imp $" del informe del ERP). Lo que entra a la cuenta bancaria es más alto: el bruto agrega IVA (19%) y, en cerveza, ILA (20,5%). La proyección de caja sí muestra el bruto.',
      severidad: 'info',
    },
    {
      tipo: 'ciclo_interno', clave: null,
      detalle: `Los "meses" son ciclos internos: cada uno junta ventas del día ${DIA_INICIO_CICLO} del mes anterior al día ${DIA_FIN_CICLO} del mes que le da nombre. Mismo corte que usa Producción y la tabla de períodos.`,
      severidad: 'info',
    },
    {
      tipo: 'criterio_fecha', clave: null,
      detalle: 'El ingreso se cuenta por fecha de PEDIDO, no de entrega ni de factura — misma señal temprana que el forecast de litros. Cuándo se cobra se calcula aparte, anclando los días de pago del cliente a la fecha de entrega.',
      severidad: 'info',
    },
  ]
  if (excluidasCliente > 0) {
    calidad.push({
      tipo: 'excluido_cliente', clave: null,
      detalle: `${excluidasCliente} filas excluidas por ser consumo interno (PDV, BaseCamp, mermas, muestras, feria) o tours/degustaciones: son litros reales, pero nadie los paga, así que no son ingreso.`,
      severidad: 'info',
    })
  }
  if (montoSinCategoria > 0) {
    calidad.push({
      tipo: 'categoria_otros', clave: null,
      detalle: `$${Math.round(montoSinCategoria).toLocaleString('es-CL')} de venta histórica cae en "Otros" (empaque y distribución, fletes, merch, maquila). Es ingreso real y suma al total, pero no es ni cerveza ni kombucha.`,
      severidad: 'info',
    })
  }
  const serieGeneral = toArray(general)
  if (serieGeneral.length < 6) {
    calidad.push({
      tipo: 'historial_corto', clave: null,
      detalle: `Sólo hay ${serieGeneral.length} ciclo(s) cerrado(s) con venta — el modelo necesita al menos 6 para proyectar.`,
      severidad: 'advertencia',
    })
  }

  return NextResponse.json({
    series: { general: serieGeneral, categoria: categoriaObj },
    calidadDatos: calidad,
    meta: {
      totalFilas: filas.length, excluidasCliente, excluidasCicloAbierto,
      ciclosConVenta: mesesConVenta.size,
    },
  })
}
