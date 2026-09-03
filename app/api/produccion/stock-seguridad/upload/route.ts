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
  producto: string
  categoria: 'cerveza' | 'kombucha'
  mesCalendario: number
  leadTimeSemanas: number
  demandaSemanalPromedio: number
  sigmaSemanal: number
  z: number
  stockSeguridadLitros: number
  puntoReordenLitros: number
  confianza: 'alta' | 'baja'
  mesesHistorialMes: number
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
    producto: f.producto, categoria: f.categoria, mes_calendario: f.mesCalendario,
    lead_time_semanas: f.leadTimeSemanas, demanda_semanal_promedio: f.demandaSemanalPromedio,
    sigma_semanal: f.sigmaSemanal, z: f.z,
    stock_seguridad_litros: f.stockSeguridadLitros, punto_reorden_litros: f.puntoReordenLitros,
    confianza: f.confianza, meses_historial_mes: f.mesesHistorialMes,
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
