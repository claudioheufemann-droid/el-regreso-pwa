// ─────────────────────────────────────────────────────────────────────────────
// Helpers de misiones: agregación de volumen y priorización inteligente.
// Usado por /api/misiones (generar) y /api/misiones/cron.
// ─────────────────────────────────────────────────────────────────────────────

export type VolAgg = { volumen_promedio: number; litros_ultima_compra: number }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any

/**
 * Calcula volumen promedio por pedido y litros del último pedido, por cliente.
 * Ventana acotada (últimos `dias`) para mantener el costo bajo.
 */
export async function calcularVolumen(
  supabase: SupabaseLike,
  nombres: string[],
  dias = 150,
): Promise<Map<string, VolAgg>> {
  const out = new Map<string, VolAgg>()
  if (!nombres.length) return out

  const desde = new Date(); desde.setDate(desde.getDate() - dias)
  const desdeStr = desde.toISOString().split('T')[0]

  // pedido → { fecha, litros } por cliente
  const porCliente = new Map<string, Map<string, { fecha: string; litros: number }>>()

  // Procesar en lotes de nombres para no exceder límites de la cláusula IN
  const LOTE = 200
  for (let i = 0; i < nombres.length; i += LOTE) {
    const sub = nombres.slice(i, i + LOTE)
    let offset = 0
    while (true) {
      const { data } = await supabase
        .from('ventas')
        .select('nombre_fantasia, litros, pedido, fecha_pedido')
        .in('nombre_fantasia', sub)
        .gte('fecha_pedido', desdeStr)
        .range(offset, offset + 999)
      if (!data || data.length === 0) break
      for (const v of data as { nombre_fantasia: string | null; litros: number | null; pedido: string | null; fecha_pedido: string }[]) {
        if (!v.nombre_fantasia) continue
        if (!porCliente.has(v.nombre_fantasia)) porCliente.set(v.nombre_fantasia, new Map())
        const pedKey = v.pedido ?? `${v.fecha_pedido}`
        const m = porCliente.get(v.nombre_fantasia)!
        const prev = m.get(pedKey)
        m.set(pedKey, { fecha: v.fecha_pedido, litros: (prev?.litros ?? 0) + (v.litros ?? 0) })
      }
      if (data.length < 1000) break
      offset += 1000
    }
  }

  for (const [nombre, pedidos] of porCliente) {
    const arr = [...pedidos.values()]
    if (!arr.length) continue
    const totalLitros = arr.reduce((s, p) => s + p.litros, 0)
    const volumen_promedio = totalLitros / arr.length
    const ultimo = arr.reduce((a, b) => (a.fecha >= b.fecha ? a : b))
    out.set(nombre, {
      volumen_promedio: Math.round(volumen_promedio * 10) / 10,
      litros_ultima_compra: Math.round(ultimo.litros * 10) / 10,
    })
  }
  return out
}

/**
 * Score de prioridad combinando urgencia (50%), volumen (35%) y valor del cliente (15%).
 * `maxVol` = volumen promedio máximo del lote, para normalizar.
 */
export function calcularPrioridad(
  a: { alert_level: string; dias_sin_compra: number | null; ciclo_promedio_dias: number | null; score: number | null },
  volumenPromedio: number,
  maxVol: number,
): number {
  const diasVencido = Math.max(0, (a.dias_sin_compra ?? 0) - (a.ciclo_promedio_dias ?? 0))
  const baseUrg = a.alert_level === 'critico' ? 70 : a.alert_level === 'vencido' ? 55 : 30
  const urgencia = Math.min(100, baseUrg + diasVencido * 1.5)
  const volNorm  = maxVol > 0 ? (volumenPromedio / maxVol) * 100 : 0
  const valor    = Math.min(100, Math.max(0, a.score ?? 0))
  return Math.round(0.5 * urgencia + 0.35 * volNorm + 0.15 * valor)
}
