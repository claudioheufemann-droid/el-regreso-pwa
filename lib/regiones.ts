/**
 * Regiones — mapeo provincia ↔ región para el scoping de datos del vendedor.
 *
 * La tabla `clientes` NO tiene columna `region`, solo `provincia`. Por eso
 * la región se DERIVA de la provincia. Este archivo es la fuente única de
 * verdad para ese mapeo, usado tanto en queries server-side (scoping) como
 * en la UI.
 *
 * Un vendedor con `region` asignada solo ve misiones/clientes-por-llamar/
 * métricas de las provincias de su región. Si `region` es null → ve todo
 * (comportamiento admin).
 */

export const REGIONES_OPERATIVAS = [
  'Metropolitana',
  'La Araucanía',
  'Los Ríos',
  'Los Lagos',
] as const

export type RegionOperativa = typeof REGIONES_OPERATIVAS[number]

/**
 * Provincias que componen cada región operativa.
 * Los nombres deben coincidir con los valores reales de `clientes.provincia`.
 * Incluimos variantes ("Ranco" / "Provincia del Ranco") para robustez.
 */
export const PROVINCIAS_POR_REGION: Record<RegionOperativa, string[]> = {
  'Metropolitana': ['Santiago', 'Chacabuco', 'Cordillera', 'Maipo', 'Melipilla', 'Talagante'],
  'La Araucanía':  ['Cautín', 'Malleco'],
  'Los Ríos':      ['Valdivia', 'Ranco', 'Provincia del Ranco', 'Del Ranco'],
  'Los Lagos':     ['Llanquihue', 'Osorno', 'Chiloé', 'Palena'],
}

/** Normaliza para comparar sin acentos ni mayúsculas */
function norm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

/** Devuelve la región operativa de una provincia, o null si no pertenece a ninguna */
export function regionDeProvincia(provincia: string | null | undefined): RegionOperativa | null {
  if (!provincia) return null
  const p = norm(provincia)
  for (const region of REGIONES_OPERATIVAS) {
    if (PROVINCIAS_POR_REGION[region].some(pr => norm(pr) === p)) return region
  }
  return null
}

/**
 * Lista de provincias (valores tal cual en BD) para filtrar por región.
 * Úsalo en queries: `.in('provincia', provinciasDeRegion(region))`
 */
export function provinciasDeRegion(region: string | null | undefined): string[] {
  if (!region) return []
  const r = REGIONES_OPERATIVAS.find(x => norm(x) === norm(region))
  return r ? PROVINCIAS_POR_REGION[r] : []
}

/** ¿Es una región operativa válida? */
export function esRegionValida(region: string | null | undefined): region is RegionOperativa {
  if (!region) return false
  return REGIONES_OPERATIVAS.some(r => norm(r) === norm(region))
}
