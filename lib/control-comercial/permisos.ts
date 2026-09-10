import type { AppUser } from '@/lib/auth'

/** Acceso al módulo Control Comercial completo (Gerente General/Comercial + Analista Control de Gestión). */
export function puedeVerControlComercial(user: AppUser | null): boolean {
  return !!user?.puedeVerControlComercial
}

/**
 * Visibilidad de costos/márgenes/rentabilidad DENTRO de Control Comercial.
 * Deliberadamente separado de puedeVerControlComercial: da acceso al módulo,
 * no a la data de costos — hoy coinciden en las mismas 3 personas, pero son
 * permisos distintos (spec §3) y pueden divergir (ej. un Analista de Control
 * de Gestión que vea el módulo pero no costos internos).
 */
export function puedeVerCostosControlComercial(user: AppUser | null): boolean {
  return !!user?.puedeVerMargenes
}
