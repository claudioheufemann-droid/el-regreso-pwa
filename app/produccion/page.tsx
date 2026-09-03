import { redirect } from 'next/navigation'
import { getServerUser } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import ProduccionClient from './ProduccionClient'

export const dynamic = 'force-dynamic'

export interface PuntoForecast {
  mes: string
  tipo: 'historico' | 'forecast'
  litros: number
  litrosMin: number | null
  litrosMax: number | null
}

export interface SerieForecast {
  nivel: 'general' | 'producto' | 'envase'
  clave: string | null
  puntos: PuntoForecast[]
}

export interface ValidacionSerie {
  nivel: string
  clave: string | null
  mae: number | null
  mape: number | null
  mesesEvaluados: number
  mesesHistorial: number
}

export interface CalidadItem {
  tipo: string
  clave: string | null
  detalle: string
  severidad: 'info' | 'advertencia'
}

export default async function ProduccionPage() {
  const user = await getServerUser()
  if (!user) redirect('/login')
  // Mismo criterio que Rentabilidad (lib/auth.ts puedeVerMargenes): si no
  // tiene acceso, rebota al Hub sin mostrar que la ruta existe.
  if (!user.isAdmin && user.macroArea !== 'produccion') redirect('/')

  // Service-role a propósito (lib/supabase/admin.ts): forecast_* exige RLS
  // authenticated y en modo demo no hay sesión real — mismo gap ya resuelto
  // para stock_productos/deudores/users.
  const admin = createAdminClient()

  const [{ data: forecastRaw }, { data: validacionRaw }, { data: calidadRaw }] = await Promise.all([
    admin.from('forecast_produccion').select('nivel, clave, mes, tipo, litros, litros_min, litros_max').order('mes', { ascending: true }),
    admin.from('forecast_validacion').select('nivel, clave, mae, mape, meses_evaluados, meses_historial'),
    admin.from('forecast_calidad_datos').select('tipo, clave, detalle, severidad, generado_at').order('generado_at', { ascending: false }),
  ])

  const seriesMap = new Map<string, SerieForecast>()
  for (const f of forecastRaw ?? []) {
    const key = `${f.nivel}::${f.clave ?? ''}`
    if (!seriesMap.has(key)) seriesMap.set(key, { nivel: f.nivel as SerieForecast['nivel'], clave: f.clave, puntos: [] })
    seriesMap.get(key)!.puntos.push({
      mes: f.mes, tipo: f.tipo as 'historico' | 'forecast', litros: Number(f.litros),
      litrosMin: f.litros_min != null ? Number(f.litros_min) : null,
      litrosMax: f.litros_max != null ? Number(f.litros_max) : null,
    })
  }
  const series = [...seriesMap.values()]

  const validacion = (validacionRaw ?? []).map(v => ({
    nivel: v.nivel, clave: v.clave,
    mae: v.mae != null ? Number(v.mae) : null,
    mape: v.mape != null ? Number(v.mape) : null,
    mesesEvaluados: v.meses_evaluados, mesesHistorial: v.meses_historial,
  })) as ValidacionSerie[]

  const calidad = (calidadRaw ?? []) as CalidadItem[]
  const ultimaCorrida = calidadRaw?.[0]
    ? (calidadRaw[0] as unknown as { generado_at: string }).generado_at
    : (forecastRaw?.find(f => f.tipo === 'forecast') as { mes: string } | undefined)?.mes ?? null

  return <ProduccionClient series={series} validacion={validacion} calidad={calidad} ultimaCorrida={ultimaCorrida} />
}
