/**
 * Detección de "este cliente ya compró" para el motor de misiones.
 *
 * Vive aparte porque lo usan los DOS generadores (el manual de admin en
 * app/api/misiones/route.ts y el automático en app/api/misiones/cron/route.ts),
 * que históricamente son código duplicado. Si la regla queda sólo en uno, el
 * otro vuelve a crear la misión del cliente que ya compró.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = any

/**
 * Litros comprados por cliente desde `desde` (inclusive), por FECHA DE PEDIDO.
 *
 * Se usa fecha_pedido y no fecha_entrega a propósito: la misión es "contactar
 * para que compre", así que se cumple cuando el cliente PIDE, sin esperar a
 * que el camión llegue. (El dashboard sí mide por entrega, es otra pregunta.)
 */
export async function getComprasDesde(
  supabase: Supa,
  desde: string,
  nombres?: string[],
): Promise<Map<string, number>> {
  let q = supabase
    .from('ventas')
    .select('nombre_fantasia, litros')
    .gte('fecha_pedido', desde)
  if (nombres?.length) q = q.in('nombre_fantasia', nombres)

  const { data } = await q
  const map = new Map<string, number>()
  for (const v of (data ?? []) as { nombre_fantasia: string | null; litros: number | null }[]) {
    if (!v.nombre_fantasia) continue
    map.set(v.nombre_fantasia, (map.get(v.nombre_fantasia) ?? 0) + (v.litros ?? 0))
  }
  return map
}

/**
 * Cierra como 'auto_completado' las misiones de la semana cuyo cliente ya
 * compró. Devuelve cuántas cerró.
 *
 * Se llama al generar (antes de la limpieza) para que esas misiones no queden
 * como 'pendiente' — si se las deja, la limpieza posterior las BORRA y se
 * pierde el registro de que el cliente sí compró.
 */
export async function cerrarMisionesConCompra(
  supabase: Supa,
  semana: string,
  compras: Map<string, number>,
): Promise<number> {
  if (compras.size === 0) return 0

  const { data: activas } = await supabase
    .from('misiones')
    .select('id, nombre_fantasia')
    .eq('semana', semana)
    .in('estado', ['pendiente', 'sin_respuesta', 'contactado_sin_pedido', 'pospuesto'])
    .in('nombre_fantasia', [...compras.keys()])

  let cerradas = 0
  for (const m of (activas ?? []) as { id: string; nombre_fantasia: string }[]) {
    const litros = compras.get(m.nombre_fantasia) ?? 0
    if (litros <= 0) continue
    const { error } = await supabase
      .from('misiones')
      .update({
        estado: 'auto_completado',
        completado_at: new Date().toISOString(),
        completado_canal: 'auto',
        resultado_litros: Math.round(litros * 10) / 10,
      })
      .eq('id', m.id)
    if (!error) cerradas++
  }
  return cerradas
}
