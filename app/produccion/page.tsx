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

/** Una serie lista para graficar: sus puntos + qué tan confiable resultó en
 *  el backtest. El cliente sólo elige cuál mostrar, no vuelve a cruzar nada. */
export interface SerieForecast {
  id: string
  nivel: 'general' | 'producto' | 'envase'
  clave: string | null
  label: string
  puntos: PuntoForecast[]
  mae: number | null
  mape: number | null
  mesesHistorial: number | null
}

export interface CalidadItem {
  tipo: string
  clave: string | null
  detalle: string
  severidad: 'info' | 'advertencia'
}

export interface StockItem {
  producto: string
  categoria: string | null
  tipo: string
  cantidad: number
  litros: number | null
}

const ENVASE_LABEL: Record<string, string> = {
  barril_30: 'Barril 30L',
  barril_50: 'Barril 50L',
  lata_354: 'Lata 354ml',
  lata_473: 'Lata 473ml',
  otros: 'Otros formatos',
}

export default async function ProduccionPage() {
  const user = await getServerUser()
  if (!user) redirect('/login')
  // Mismo criterio que Rentabilidad: si no tiene acceso rebota al Hub sin
  // revelar que la ruta existe. Admins + equipo de Producción.
  if (!user.isAdmin && user.macroArea !== 'produccion') redirect('/')

  // Service-role a propósito (lib/supabase/admin.ts): las tablas forecast_*
  // exigen RLS authenticated y en modo demo no hay sesión real — mismo gap ya
  // resuelto para stock_productos/deudores/users.
  const admin = createAdminClient()

  const [{ data: forecastRaw }, { data: validacionRaw }, { data: calidadRaw }, { data: stockRaw }] = await Promise.all([
    admin.from('forecast_produccion').select('nivel, clave, mes, tipo, litros, litros_min, litros_max').order('mes', { ascending: true }),
    admin.from('forecast_validacion').select('nivel, clave, mae, mape, meses_historial'),
    admin.from('forecast_calidad_datos').select('tipo, clave, detalle, severidad, generado_at').order('generado_at', { ascending: false }),
    admin.from('stock_productos').select('producto, categoria, tipo, cantidad, litros').order('cantidad', { ascending: false }),
  ])

  // Índice de validación por serie, para colgarle su MAPE a cada una.
  const validacionPorSerie = new Map(
    (validacionRaw ?? []).map(v => [`${v.nivel}::${v.clave ?? ''}`, v])
  )

  const seriesMap = new Map<string, SerieForecast>()
  for (const f of forecastRaw ?? []) {
    const id = `${f.nivel}::${f.clave ?? ''}`
    if (!seriesMap.has(id)) {
      const val = validacionPorSerie.get(id)
      seriesMap.set(id, {
        id,
        nivel: f.nivel as SerieForecast['nivel'],
        clave: f.clave,
        label: f.nivel === 'general'
          ? 'Todos los productos (consolidado)'
          : f.nivel === 'envase'
            ? (ENVASE_LABEL[f.clave ?? ''] ?? f.clave ?? '')
            : (f.clave ?? ''),
        puntos: [],
        mae: val?.mae != null ? Number(val.mae) : null,
        mape: val?.mape != null ? Number(val.mape) : null,
        mesesHistorial: val?.meses_historial ?? null,
      })
    }
    seriesMap.get(id)!.puntos.push({
      mes: f.mes,
      tipo: f.tipo as 'historico' | 'forecast',
      litros: Number(f.litros),
      litrosMin: f.litros_min != null ? Number(f.litros_min) : null,
      litrosMax: f.litros_max != null ? Number(f.litros_max) : null,
    })
  }

  // Orden: general primero, después productos por volumen histórico, después
  // envases — es el orden en que tiene sentido recorrerlos en el selector.
  const volumen = (s: SerieForecast) => s.puntos.filter(p => p.tipo === 'historico').reduce((a, p) => a + p.litros, 0)
  const series = [...seriesMap.values()].sort((a, b) => {
    const peso = { general: 0, producto: 1, envase: 2 }
    if (peso[a.nivel] !== peso[b.nivel]) return peso[a.nivel] - peso[b.nivel]
    return volumen(b) - volumen(a)
  })

  const calidad = (calidadRaw ?? []).map(c => ({
    tipo: c.tipo, clave: c.clave, detalle: c.detalle, severidad: c.severidad,
  })) as CalidadItem[]

  const ultimaCorrida = (calidadRaw?.[0] as { generado_at?: string } | undefined)?.generado_at ?? null

  const stock = (stockRaw ?? []).map(s => ({
    producto: s.producto, categoria: s.categoria, tipo: s.tipo,
    cantidad: Number(s.cantidad), litros: s.litros != null ? Number(s.litros) : null,
  })) as StockItem[]

  return (
    <ProduccionClient
      series={series}
      calidad={calidad}
      stock={stock}
      ultimaCorrida={ultimaCorrida}
      nombreUsuario={user.nombre}
      inicialesUsuario={user.iniciales}
    />
  )
}
