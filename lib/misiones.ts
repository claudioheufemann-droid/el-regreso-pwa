// ─────────────────────────────────────────────────────────────────────────────
// Helpers de misiones: agregación de volumen y priorización inteligente.
// Usado por /api/misiones (generar) y /api/misiones/cron.
// ─────────────────────────────────────────────────────────────────────────────

export type VolAgg = { volumen_promedio: number; litros_ultima_compra: number; fecha_ultima_compra: string | null }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any

// Nº de pedidos recientes considerados para el volumen promedio
const ULTIMOS_PEDIDOS = 8

/**
 * Calcula, mirando TODO el histórico de cada cliente:
 *   - litros y fecha del ÚLTIMO pedido real (sin importar cuánto tiempo atrás)
 *   - volumen promedio de sus últimos pedidos (recencia, no diluido por años)
 * Recorre las ventas ordenadas por fecha DESC y se queda con los pedidos más
 * recientes de cada cliente, así que captura el último pedido aunque sea antiguo.
 */
export async function calcularVolumen(
  supabase: SupabaseLike,
  nombres: string[],
): Promise<Map<string, VolAgg>> {
  const out = new Map<string, VolAgg>()
  if (!nombres.length) return out

  // pedido → litros (agrupado), por cliente — solo los más recientes
  const porCliente = new Map<string, Map<string, { fecha: string; litros: number }>>()

  const LOTE = 200
  for (let i = 0; i < nombres.length; i += LOTE) {
    const sub = nombres.slice(i, i + LOTE)
    let offset = 0
    while (true) {
      const { data } = await supabase
        .from('ventas')
        .select('nombre_fantasia, litros, pedido, fecha_pedido')
        .in('nombre_fantasia', sub)
        .order('fecha_pedido', { ascending: false }) // más reciente primero → histórico completo
        .range(offset, offset + 999)
      if (!data || data.length === 0) break

      let todosCompletos = true
      for (const v of data as { nombre_fantasia: string | null; litros: number | null; pedido: string | null; fecha_pedido: string }[]) {
        if (!v.nombre_fantasia) continue
        if (!porCliente.has(v.nombre_fantasia)) porCliente.set(v.nombre_fantasia, new Map())
        const m = porCliente.get(v.nombre_fantasia)!
        const pedKey = v.pedido ?? `${v.fecha_pedido}`
        // Ya tenemos suficientes pedidos recientes de este cliente: ignorar el resto
        if (!m.has(pedKey) && m.size >= ULTIMOS_PEDIDOS) continue
        const prev = m.get(pedKey)
        m.set(pedKey, { fecha: v.fecha_pedido, litros: (prev?.litros ?? 0) + (v.litros ?? 0) })
        if (m.size < ULTIMOS_PEDIDOS) todosCompletos = false
      }
      // Si toda la página ya era de clientes "completos" y no es la primera, podemos parar
      if (data.length < 1000) break
      if (todosCompletos && offset > 0) break
      offset += 1000
    }
  }

  for (const [nombre, pedidos] of porCliente) {
    const arr = [...pedidos.values()].sort((a, b) => (a.fecha < b.fecha ? 1 : -1)) // desc
    if (!arr.length) continue
    const ultimo = arr[0] // el más reciente = última compra real (histórico)
    const totalLitros = arr.reduce((s, p) => s + p.litros, 0)
    out.set(nombre, {
      volumen_promedio: Math.round((totalLitros / arr.length) * 10) / 10,
      litros_ultima_compra: Math.round(ultimo.litros * 10) / 10,
      fecha_ultima_compra: ultimo.fecha,
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
