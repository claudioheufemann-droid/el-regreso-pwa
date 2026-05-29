export interface FrequencyStat {
  ultima_compra: string | null
  dias_sin_compra: number | null
  ciclo_promedio_dias: number | null
  total_pedidos: number
  alert_level: 'ok' | 'proximo' | 'vencido' | 'critico' | 'sin_historial'
  dias_para_siguiente: number | null
  siguiente_compra_estimada: string | null
  // Scoring fields (populated by calcScore)
  score?: number
  segmento?: 'A' | 'B' | 'C' | 'D' | 'E'
  litros_totales?: number
  revenue_total?: number
  pedidos_por_mes?: number
}

/** Segmento A-E basado en score 0-100 */
export function getSegmento(score: number): 'A' | 'B' | 'C' | 'D' | 'E' {
  if (score >= 80) return 'A'
  if (score >= 60) return 'B'
  if (score >= 40) return 'C'
  if (score >= 20) return 'D'
  return 'E'
}

export interface ClientScore {
  nombre_fantasia: string
  vendedor_actual: string
  score: number           // 0-100
  segmento: 'A' | 'B' | 'C' | 'D' | 'E'
  alert_level: 'ok' | 'proximo' | 'vencido' | 'critico' | 'sin_historial'
  litros_totales: number
  revenue_total: number
  total_pedidos: number
  pedidos_por_mes: number
  ciclo_promedio_dias: number | null
  dias_sin_compra: number
  siguiente_compra_estimada: string | null
  confianza_score: 'alta' | 'media' | 'baja'
  // Score components (0-100 each)
  score_volumen: number
  score_frecuencia: number
  score_revenue: number
}

/**
 * Calcula estadísticas de frecuencia de compra por cliente a partir de
 * un listado plano de { nombre_fantasia, fecha_pedido }.
 * Retorna un Map<nombre_fantasia, FrequencyStat>.
 */
export function calcFrecuencia(
  orders: { nombre_fantasia: string | null; fecha_pedido: string | null }[]
): Map<string, FrequencyStat> {
  // Agrupar fechas únicas por cliente
  const byClient = new Map<string, Set<string>>()
  for (const o of orders) {
    if (!o.nombre_fantasia || !o.fecha_pedido) continue
    if (!byClient.has(o.nombre_fantasia)) byClient.set(o.nombre_fantasia, new Set())
    byClient.get(o.nombre_fantasia)!.add(o.fecha_pedido)
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const stats = new Map<string, FrequencyStat>()

  for (const [client, dateSet] of byClient) {
    const sorted = [...dateSet].sort()
    const lastDate = sorted[sorted.length - 1]
    const lastMs = new Date(lastDate + 'T00:00:00').getTime()
    const diasSin = Math.floor((today.getTime() - lastMs) / 86400000)

    if (sorted.length < 2) {
      stats.set(client, {
        ultima_compra: lastDate,
        dias_sin_compra: diasSin,
        ciclo_promedio_dias: null,
        total_pedidos: sorted.length,
        alert_level: 'sin_historial',
        dias_para_siguiente: null,
        siguiente_compra_estimada: null,
      })
      continue
    }

    // Calcular gaps entre fechas consecutivas
    let totalGap = 0
    for (let i = 1; i < sorted.length; i++) {
      const a = new Date(sorted[i - 1] + 'T00:00:00').getTime()
      const b = new Date(sorted[i] + 'T00:00:00').getTime()
      totalGap += Math.floor((b - a) / 86400000)
    }
    const ciclo = Math.round(totalGap / (sorted.length - 1))

    let alertLevel: FrequencyStat['alert_level']
    if (diasSin >= Math.round(ciclo * 1.5)) alertLevel = 'critico'
    else if (diasSin >= ciclo) alertLevel = 'vencido'
    else if (diasSin >= Math.round(ciclo * 0.8)) alertLevel = 'proximo'
    else alertLevel = 'ok'

    const siguiente = new Date(lastMs + ciclo * 86400000).toISOString().split('T')[0]

    stats.set(client, {
      ultima_compra: lastDate,
      dias_sin_compra: diasSin,
      ciclo_promedio_dias: ciclo,
      total_pedidos: sorted.length,
      alert_level: alertLevel,
      dias_para_siguiente: Math.max(0, ciclo - diasSin),
      siguiente_compra_estimada: siguiente,
    })
  }

  return stats
}

/**
 * Calcula scores 0-100 para todos los clientes usando modelo RFM ponderado.
 *
 * Fórmula:
 *   ScoreBase = 0.35 × pct_rank(litros) + 0.30 × pct_rank(pedidos/mes) + 0.35 × pct_rank(revenue)
 *   RecencyFactor = 0.90 si crítico | 0.95 si vencido | 1.0 resto
 *   ScoreFinal = CLAMP(0, 100, ROUND(ScoreBase × RecencyFactor × 100))
 *
 * Usa PERCENT_RANK para robustez ante outliers: un cliente con 10× más volumen
 * no "aplasta" a los demás. La posición relativa define el score, no la magnitud.
 */
export function calcScores(
  orders: { nombre_fantasia: string | null; fecha_pedido: string | null; litros: number | null; total_sin_impuesto: number | null; vendedor_actual: string | null }[]
): ClientScore[] {
  const EXCLUIR = new Set([
    'Cliente Ventas (Javier)', 'Cliente Ventas (Charly)',
    'Cliente Ventas (Carlos)', 'Cliente PDV', 'Cliente Merma PDV',
  ])

  // ── 1. Agregar métricas por cliente ─────────────────────────────────────
  type Agg = {
    vendedor: string
    litros: number
    revenue: number
    fechas: Set<string>
    primera: string
    ultima: string
  }
  const agg = new Map<string, Agg>()

  for (const o of orders) {
    if (!o.nombre_fantasia || !o.fecha_pedido) continue
    if (EXCLUIR.has(o.nombre_fantasia)) continue
    if (!agg.has(o.nombre_fantasia)) {
      agg.set(o.nombre_fantasia, {
        vendedor: o.vendedor_actual ?? '',
        litros: 0, revenue: 0,
        fechas: new Set(),
        primera: o.fecha_pedido,
        ultima: o.fecha_pedido,
      })
    }
    const c = agg.get(o.nombre_fantasia)!
    c.litros  += o.litros ?? 0
    c.revenue += o.total_sin_impuesto ?? 0
    c.fechas.add(o.fecha_pedido)
    if (o.fecha_pedido < c.primera) c.primera = o.fecha_pedido
    if (o.fecha_pedido > c.ultima)  c.ultima  = o.fecha_pedido
    if (o.vendedor_actual) c.vendedor = o.vendedor_actual  // toma el último
  }

  // ── 2. Calcular métricas derivadas ──────────────────────────────────────
  const today = new Date(); today.setHours(0,0,0,0)

  type Derived = {
    nombre: string; vendedor: string
    litros: number; revenue: number
    totalPedidos: number; pedidosPorMes: number
    ciclo: number | null; diasSin: number
    alertLevel: FrequencyStat['alert_level']
    siguiente: string | null
  }

  const derived: Derived[] = []

  for (const [nombre, c] of agg) {
    const sorted = [...c.fechas].sort()
    const totalPedidos = sorted.length
    const diasPeriodo = Math.max(1, Math.round((new Date(c.ultima + 'T00:00:00').getTime() - new Date(c.primera + 'T00:00:00').getTime()) / 86400000))
    const mesesActivo = Math.max(1, Math.round(diasPeriodo / 30.4375))
    const pedidosPorMes = totalPedidos / mesesActivo

    // Ciclo promedio
    let ciclo: number | null = null
    if (sorted.length >= 2) {
      let totalGap = 0
      for (let i = 1; i < sorted.length; i++) {
        totalGap += Math.round((new Date(sorted[i] + 'T00:00:00').getTime() - new Date(sorted[i-1] + 'T00:00:00').getTime()) / 86400000)
      }
      ciclo = Math.round(totalGap / (sorted.length - 1))
    }

    const ultimaMs = new Date(c.ultima + 'T00:00:00').getTime()
    const diasSin = Math.floor((today.getTime() - ultimaMs) / 86400000)

    let alertLevel: FrequencyStat['alert_level'] = 'sin_historial'
    if (ciclo !== null) {
      if (diasSin >= Math.round(ciclo * 1.5)) alertLevel = 'critico'
      else if (diasSin >= ciclo)              alertLevel = 'vencido'
      else if (diasSin >= Math.round(ciclo * 0.8)) alertLevel = 'proximo'
      else                                    alertLevel = 'ok'
    }

    const siguiente = ciclo ? new Date(ultimaMs + ciclo * 86400000).toISOString().split('T')[0] : null

    derived.push({ nombre, vendedor: c.vendedor, litros: c.litros, revenue: c.revenue, totalPedidos, pedidosPorMes, ciclo, diasSin, alertLevel, siguiente })
  }

  if (derived.length === 0) return []

  // ── 3. PERCENT_RANK por cada eje (posición relativa 0-1) ────────────────
  const percentRank = (arr: number[], val: number): number => {
    const below = arr.filter(v => v < val).length
    return below / Math.max(1, arr.length - 1)
  }

  const allLitros  = derived.map(d => d.litros)
  const allFreq    = derived.map(d => d.pedidosPorMes)
  const allRevenue = derived.map(d => d.revenue)

  // ── 4. Score ponderado con recency penalty ──────────────────────────────
  const WEIGHTS = { volumen: 0.35, frecuencia: 0.30, revenue: 0.35 }

  return derived.map(d => {
    const pctV = percentRank(allLitros,  d.litros)
    const pctF = percentRank(allFreq,    d.pedidosPorMes)
    const pctM = percentRank(allRevenue, d.revenue)

    const scoreBase = WEIGHTS.volumen * pctV + WEIGHTS.frecuencia * pctF + WEIGHTS.revenue * pctM
    const recencyFactor = d.alertLevel === 'critico' ? 0.90 : d.alertLevel === 'vencido' ? 0.95 : 1.0
    const score = Math.min(100, Math.max(0, Math.round(scoreBase * recencyFactor * 100 * 10) / 10))

    const confianza: 'alta' | 'media' | 'baja' =
      d.totalPedidos >= 12 ? 'alta' : d.totalPedidos >= 4 ? 'media' : 'baja'

    return {
      nombre_fantasia: d.nombre,
      vendedor_actual: d.vendedor,
      score,
      segmento: getSegmento(score),
      alert_level: d.alertLevel,
      litros_totales: Math.round(d.litros * 10) / 10,
      revenue_total: Math.round(d.revenue),
      total_pedidos: d.totalPedidos,
      pedidos_por_mes: Math.round(d.pedidosPorMes * 100) / 100,
      ciclo_promedio_dias: d.ciclo,
      dias_sin_compra: d.diasSin,
      siguiente_compra_estimada: d.siguiente,
      confianza_score: confianza,
      score_volumen:   Math.round(pctV * 100 * 10) / 10,
      score_frecuencia: Math.round(pctF * 100 * 10) / 10,
      score_revenue:   Math.round(pctM * 100 * 10) / 10,
    }
  }).sort((a, b) => b.score - a.score)
}
