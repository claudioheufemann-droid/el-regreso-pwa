/**
 * Tokens de color centralizados para toda la app.
 * Fuente única de verdad — antes estaban duplicados/divergentes en 10+ archivos
 * (Carlos aparecía dorado, verde o azul según la vista).
 *
 * Canon de vendedores: igual que la vista Mapa (la que tiene leyenda dedicada).
 *   Javier Badilla → ámbar   #F59E0B
 *   Carlos Urrejola → azul   #60A5FA
 */

// ── Color por vendedor ──────────────────────────────────────────────────────
export const VEND_COLOR: Record<string, string> = {
  'Javier Badilla':  '#F59E0B',
  'Carlos Urrejola': '#60A5FA',
}

/** Color del vendedor con fallback estable (no usar índices ni azar). */
export function vendColor(nombre: string | null | undefined): string {
  if (!nombre) return '#A78BFA'
  return VEND_COLOR[nombre] ?? '#A78BFA'
}

// ── Color por segmento RFM (A = mejor … E = peor) ───────────────────────────
export const SEG_COLOR: Record<string, string> = {
  A: '#D4AF37', // oro
  B: '#34D399', // verde
  C: '#60A5FA', // azul
  D: '#F59E0B', // ámbar
  E: '#F87171', // rojo
}

export function segColor(seg: string | null | undefined): string {
  if (!seg) return '#6B7280'
  return SEG_COLOR[seg] ?? '#6B7280'
}
