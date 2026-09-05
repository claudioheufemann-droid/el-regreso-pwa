import { NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('Supabase no configurado')
  return createSupabaseClient(url, key)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function logSync(supabase: any, params: { origen: 'automatico' | 'manual'; ok: boolean; mensaje?: string; total?: number }) {
  try {
    await supabase.from('erp_sync_log').insert({ fuente: 'stock_seguridad', ...params })
  } catch {
    // El log es informativo — nunca debe tumbar la carga real.
  }
}

interface FilaStockSeguridad {
  nivel: 'producto' | 'producto_envase'
  producto: string
  envase: string | null
  categoria: 'cerveza' | 'kombucha'
  mes: string
  leadTimeSemanas: number
  periodoRevisionSemanas: number
  sigmaLeadTimeSemanas: number
  demandaMensualProyectada: number
  demandaEnVentana: number
  sigmaSemanal: number
  z: number
  stockSeguridadLitros: number
  puntoReordenLitros: number
  confianza: 'alta' | 'media' | 'baja'
  mapeBacktest: number | null
  mesesHistorial: number | null
  /** 'propio': Prophet entrenado sobre esta serie. 'derivado': se repartió
   *  el forecast del producto por su proporción reciente de formato (poca
   *  historia propia o MAPE propio demasiado alto). */
  metodo?: 'propio' | 'derivado'
}

/**
 * POST /api/produccion/stock-seguridad/upload
 *
 * Recibe el stock de seguridad calculado por
 * scripts/forecast/calcular_stock_seguridad.py: Z·σ_semanal·√LT, con σ
 * calculado por mes calendario (estacional) reusando la misma serie mensual
 * por producto que ya arma /api/produccion/datos. Reemplazo total — misma
 * corrida mensual que el forecast.
 */
export async function POST(req: Request) {
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
    const { createClient: createServerClient } = await import('@/lib/supabase/server')
    const sessionClient = await createServerClient()
    const { data: { user } } = await sessionClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  let body: { filas: FilaStockSeguridad[] }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }
  const { filas } = body
  if (!Array.isArray(filas) || filas.length === 0) {
    return NextResponse.json({ error: 'Sin filas' }, { status: 400 })
  }

  const origen = esCron ? 'automatico' as const : 'manual' as const

  const rows = filas.map(f => ({
    nivel: f.nivel, producto: f.producto, envase: f.envase, categoria: f.categoria,
    mes: f.mes,
    lead_time_semanas: f.leadTimeSemanas,
    periodo_revision_semanas: f.periodoRevisionSemanas,
    sigma_lead_time_semanas: f.sigmaLeadTimeSemanas,
    demanda_mensual_proyectada: f.demandaMensualProyectada,
    demanda_en_ventana: f.demandaEnVentana,
    sigma_semanal: f.sigmaSemanal, z: f.z,
    stock_seguridad_litros: f.stockSeguridadLitros, punto_reorden_litros: f.puntoReordenLitros,
    confianza: f.confianza, mape_backtest: f.mapeBacktest, meses_historial: f.mesesHistorial,
    metodo: f.metodo ?? 'propio',
  }))

  const { error: delError } = await supabase.from('stock_seguridad').delete().neq('id', 0)
  if (delError) {
    await logSync(supabase, { origen, ok: false, mensaje: delError.message })
    return NextResponse.json({ error: delError.message }, { status: 500 })
  }
  for (let i = 0; i < rows.length; i += 500) {
    const { error: insError } = await supabase.from('stock_seguridad').insert(rows.slice(i, i + 500))
    if (insError) {
      await logSync(supabase, { origen, ok: false, mensaje: insError.message })
      return NextResponse.json({ error: insError.message }, { status: 500 })
    }
  }

  await logSync(supabase, { origen, ok: true, total: rows.length })
  return NextResponse.json({ ok: true, filas: rows.length })
}
