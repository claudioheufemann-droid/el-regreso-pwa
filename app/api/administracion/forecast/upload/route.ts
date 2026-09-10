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
    await supabase.from('erp_sync_log').insert({ fuente: 'forecast_finanzas', ...params })
  } catch {
    // El log es informativo — nunca debe tumbar la carga real.
  }
}

interface ForecastFila {
  nivel: string; clave: string | null; mes: string; tipo: 'historico' | 'forecast'
  monto: number; montoMin?: number | null; montoMax?: number | null
  tendencia?: number | null; estacionalidad?: number | null
}
interface ValidacionFila {
  nivel: string; clave: string | null; mae: number | null; mape: number | null
  mesesEvaluados: number; mesesHistorial: number; metodo?: 'propio' | 'derivado'
}

/**
 * POST /api/administracion/forecast/upload
 *
 * Recibe la corrida del modelo de INGRESOS en $ (Prophet, misma corrida y
 * mismo script que el forecast de litros — ver scripts/forecast/generar_forecast.py).
 * Reemplazo total de las dos tablas: cada corrida es la foto vigente.
 *
 * Comparte `UPLOAD_SECRET_FORECAST` con /api/produccion/forecast/upload y
 * /api/administracion/datos a propósito: es el MISMO productor (una sola
 * corrida del mismo script, en el mismo workflow). Los secrets separados
 * existen para aislar productores distintos, no endpoints distintos del mismo
 * proceso.
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
    const { getServerUser } = await import('@/lib/auth')
    const user = await getServerUser()
    if (!user?.isAdmin) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  let body: { forecast: ForecastFila[]; validacion: ValidacionFila[] }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }
  const { forecast, validacion } = body
  if (!Array.isArray(forecast) || forecast.length === 0) {
    return NextResponse.json({ error: 'Sin filas de forecast' }, { status: 400 })
  }

  const origen = esCron ? 'automatico' as const : 'manual' as const

  const forecastRows = forecast.map(f => ({
    nivel: f.nivel, clave: f.clave, mes: f.mes, tipo: f.tipo,
    monto: f.monto, monto_min: f.montoMin ?? null, monto_max: f.montoMax ?? null,
    tendencia: f.tendencia ?? null, estacionalidad: f.estacionalidad ?? null,
  }))
  const validacionRows = (validacion ?? []).map(v => ({
    nivel: v.nivel, clave: v.clave, mae: v.mae, mape: v.mape,
    meses_evaluados: v.mesesEvaluados, meses_historial: v.mesesHistorial,
    metodo: v.metodo ?? 'propio',
  }))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function reemplazarTabla(tabla: string, rows: any[]): Promise<string | null> {
    const { error: delError } = await supabase.from(tabla).delete().neq('id', 0)
    if (delError) return `${tabla}: ${delError.message}`
    for (let i = 0; i < rows.length; i += 500) {
      const { error: insError } = await supabase.from(tabla).insert(rows.slice(i, i + 500))
      if (insError) return `${tabla}: ${insError.message}`
    }
    return null
  }

  for (const [tabla, rows] of [
    ['forecast_finanzas', forecastRows],
    ['forecast_finanzas_validacion', validacionRows],
  ] as const) {
    const err = await reemplazarTabla(tabla, rows)
    if (err) {
      await logSync(supabase, { origen, ok: false, mensaje: err })
      return NextResponse.json({ error: err }, { status: 500 })
    }
  }

  await logSync(supabase, { origen, ok: true, total: forecastRows.length })

  return NextResponse.json({ ok: true, forecast: forecastRows.length, validacion: validacionRows.length })
}
