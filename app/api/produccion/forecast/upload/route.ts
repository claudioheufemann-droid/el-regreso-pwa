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
    await supabase.from('erp_sync_log').insert({ fuente: 'forecast_produccion', ...params })
  } catch {
    // El log es informativo — nunca debe tumbar la carga real.
  }
}

interface ForecastFila {
  nivel: string; clave: string | null; mes: string; tipo: 'historico' | 'forecast'
  litros: number; litrosMin?: number | null; litrosMax?: number | null
  /** Descomposición del modelo: litros = tendencia + estacionalidad. */
  tendencia?: number | null; estacionalidad?: number | null
}
interface ValidacionFila { nivel: string; clave: string | null; mae: number | null; mape: number | null; mesesEvaluados: number; mesesHistorial: number }
interface CalidadFila { tipo: string; clave: string | null; detalle: string; severidad: 'info' | 'advertencia' }

/**
 * POST /api/produccion/forecast/upload
 *
 * Recibe el resultado completo de una corrida del modelo (Prophet, corrido
 * por scripts/forecast/generar_forecast.py vía GitHub Actions): la proyección
 * a 8 meses, la validación (backtest) de cada serie, y las notas de calidad
 * de datos. Reemplazo total en las 3 tablas — cada corrida es la foto vigente,
 * igual que el resto de los sync del ERP (ver /api/barriles/upload).
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

  let body: { forecast: ForecastFila[]; validacion: ValidacionFila[]; calidad: CalidadFila[] }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }
  const { forecast, validacion, calidad } = body
  if (!Array.isArray(forecast) || forecast.length === 0) {
    return NextResponse.json({ error: 'Sin filas de forecast' }, { status: 400 })
  }

  const origen = esCron ? 'automatico' as const : 'manual' as const

  const forecastRows = forecast.map(f => ({
    nivel: f.nivel, clave: f.clave, mes: f.mes, tipo: f.tipo,
    litros: f.litros, litros_min: f.litrosMin ?? null, litros_max: f.litrosMax ?? null,
    tendencia: f.tendencia ?? null, estacionalidad: f.estacionalidad ?? null,
  }))
  const validacionRows = (validacion ?? []).map(v => ({
    nivel: v.nivel, clave: v.clave, mae: v.mae, mape: v.mape,
    meses_evaluados: v.mesesEvaluados, meses_historial: v.mesesHistorial,
  }))
  const calidadRows = (calidad ?? []).map(c => ({
    tipo: c.tipo, clave: c.clave, detalle: c.detalle, severidad: c.severidad,
  }))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function reemplazarTabla(tabla: string, rows: any[]): Promise<string | null> {
    const { error: delError } = await supabase.from(tabla).delete().neq('id', 0)
    if (delError) return `${tabla}: ${delError.message}`
    // Insertar en lotes: una corrida con muchos productos × 8 meses puede
    // superar cómodo las filas que Supabase acepta en un solo insert.
    for (let i = 0; i < rows.length; i += 500) {
      const { error: insError } = await supabase.from(tabla).insert(rows.slice(i, i + 500))
      if (insError) return `${tabla}: ${insError.message}`
    }
    return null
  }

  for (const [tabla, rows] of [
    ['forecast_produccion', forecastRows],
    ['forecast_validacion', validacionRows],
    ['forecast_calidad_datos', calidadRows],
  ] as const) {
    const err = await reemplazarTabla(tabla, rows)
    if (err) {
      await logSync(supabase, { origen, ok: false, mensaje: err })
      return NextResponse.json({ error: err }, { status: 500 })
    }
  }

  await logSync(supabase, { origen, ok: true, total: forecastRows.length })

  return NextResponse.json({ ok: true, forecast: forecastRows.length, validacion: validacionRows.length, calidad: calidadRows.length })
}
