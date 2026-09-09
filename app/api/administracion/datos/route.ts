import { NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { DIA_INICIO_CICLO, DIA_FIN_CICLO } from '@/lib/produccion/reglas'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('Supabase no configurado')
  return createSupabaseClient(url, key)
}

/**
 * GET /api/administracion/datos
 *
 * Serie histórica de INGRESOS en $ (venta neta, "Total s/imp $") por ciclo
 * interno y categoría, para que el script de forecast corra Prophet sobre
 * dinero igual que ya lo corre sobre litros.
 *
 * El agregado lo hace la función `ingresos_por_ciclo()` en Postgres, no este
 * endpoint: la primera versión paginaba la tabla `ventas` entera (100k+ filas,
 * 100+ viajes encadenados a PostgREST) y se pasaba del timeout de la función
 * serverless. Además, al vivir en SQL reutiliza _excluir_cliente /
 * _excluir_producto / _categoria_normalizada — las MISMAS que usan los RPC del
 * dashboard de Ventas —, así que el histórico de ingresos no puede
 * desalinearse de lo que Ventas reporta.
 *
 * Ojo con la población: excluye el consumo interno (PDV, BaseCamp, feria,
 * mermas). Son litros que Producción sí tiene que fabricar, pero nadie los
 * paga: contarlos acá inflaría el forecast de ingresos con venta inexistente.
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

  const { data, error } = await supabase.rpc('ingresos_por_ciclo')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const filas = (data ?? []) as { ciclo: string; categoria: string; monto: number }[]

  const general = new Map<string, number>()
  const porCategoria = new Map<string, Map<string, number>>()
  let montoOtros = 0

  for (const f of filas) {
    const mes = String(f.ciclo).slice(0, 10)
    const monto = Number(f.monto) || 0
    general.set(mes, (general.get(mes) ?? 0) + monto)
    if (!porCategoria.has(f.categoria)) porCategoria.set(f.categoria, new Map())
    porCategoria.get(f.categoria)!.set(mes, monto)
    if (f.categoria === 'Otros') montoOtros += monto
  }

  const toArray = (m: Map<string, number>) =>
    [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([mes, monto]) => ({ mes, monto: Math.round(monto) }))

  const categoriaObj: Record<string, { mes: string; monto: number }[]> = {}
  for (const [cat, serie] of porCategoria) categoriaObj[cat] = toArray(serie)

  const serieGeneral = toArray(general)

  const calidad: { tipo: string; clave: string | null; detalle: string; severidad: 'info' | 'advertencia' }[] = [
    {
      tipo: 'unidad', clave: null,
      detalle: 'La unidad es la venta NETA ("Total s/imp $" del informe del ERP). Lo que entra a la cuenta bancaria es más alto: el bruto agrega IVA (19%) y, en cerveza, ILA (20,5%). La proyección de caja sí muestra el bruto.',
      severidad: 'info',
    },
    {
      tipo: 'ciclo_interno', clave: null,
      detalle: `Los "meses" son ciclos internos: cada uno junta ventas del día ${DIA_INICIO_CICLO} del mes anterior al día ${DIA_FIN_CICLO} del mes que le da nombre. Mismo corte que Producción y la tabla de períodos.`,
      severidad: 'info',
    },
    {
      tipo: 'criterio_fecha', clave: null,
      detalle: 'El ingreso se cuenta por fecha de PEDIDO, no de entrega ni de factura — misma señal temprana que el forecast de litros. Cuándo se cobra se calcula aparte, anclando los días de pago del cliente a la fecha de entrega.',
      severidad: 'info',
    },
    {
      tipo: 'excluido_cliente', clave: null,
      detalle: 'Se excluye el consumo interno (PDV, BaseCamp, mermas, muestras, feria) y los tours/degustaciones: son litros reales, pero nadie los paga, así que no son ingreso.',
      severidad: 'info',
    },
  ]
  if (montoOtros > 0) {
    calidad.push({
      tipo: 'categoria_otros', clave: null,
      detalle: `$${Math.round(montoOtros).toLocaleString('es-CL')} de venta histórica cae en "Otros" (empaque y distribución, fletes, merch, maquila). Es ingreso real y suma al total, pero no es ni cerveza ni kombucha.`,
      severidad: 'info',
    })
  }
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
    meta: { ciclosConVenta: serieGeneral.length, categorias: Object.keys(categoriaObj) },
  })
}
