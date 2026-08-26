/**
 * Tokens de color centralizados para toda la app.
 */

// ── Color por vendedor ──────────────────────────────────────────────────────
export const VEND_COLOR: Record<string, string> = {
  'Equipo Ventas':   '#D4AF37',
  'Vendedor 1':      '#D4AF37',
  // Vendedores regionales activos (ver VENDEDORES_CARTERA_ACTIVAS en lib/types.ts)
  'Nicol Delgado':    '#60A5FA',
  'Marion Meza':      '#34D399',
  'Marcelo Diaz':     '#F59E0B',
  'Yadro Fabijancic': '#F472B6',
}

/** Color del vendedor con fallback estable (no usar índices ni azar). */
export function vendColor(nombre: string | null | undefined): string {
  if (!nombre) return '#6B7280'
  return VEND_COLOR[nombre] ?? '#6B7280'
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
