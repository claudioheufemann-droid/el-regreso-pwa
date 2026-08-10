import { cache } from 'react'
import { createClient } from './supabase/server'

export interface AppUser {
  id: string
  nombre: string
  email: string
  isAdmin: boolean
  iniciales: string
  macroArea: string | null   // null = admin global (ve todo)
  avatarUrl: string | null
  region: string | null      // null = sin scope geográfico (admin); ej: 'Los Ríos'
  /** Acceso al módulo Rentabilidad (costos/márgenes internos) — separado de isAdmin, solo Claudio/Benja/Douglas. */
  puedeVerMargenes: boolean
  /** Acceso a su propia remuneración variable (contrato). Ver lib/comisiones.ts. */
  veComisionGerente: boolean
  /**
   * Nombres con que este usuario aparece en el ERP (ventas.vendedor_actual /
   * misiones.vendedor). Vacío = no es vendedor de terreno.
   *
   * Existe porque el nombre de login y el del ERP casi nunca coinciden
   * ('Claudio H.' vs 'Claudio Heufemann', 'Yadro Favijancic' vs
   * '...Fabijancic'), y comparar por nombre hacía que las misiones nunca se
   * cerraran ni se segmentaran por vendedor.
   */
  vendedoresErp: string[]
}

// Memoizado por request: layout + página comparten una sola validación de auth
export const getServerUser = cache(async (): Promise<AppUser | null> => {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    // Primary lookup: by auth UUID
    let { data: profile } = await supabase
      .from('users')
      .select('nombre, iniciales, is_admin, email, macro_area, avatar_url, region, vendedores_erp, puede_ver_margenes, ve_comision_gerente')
      .eq('id', user.id)
      .maybeSingle()

    // Fallback: by email (handles any future UUID drift)
    if (!profile && user.email) {
      const res = await supabase
        .from('users')
        .select('nombre, iniciales, is_admin, email, macro_area, avatar_url, region, vendedores_erp, puede_ver_margenes, ve_comision_gerente')
        .eq('email', user.email)
        .maybeSingle()
      profile = res.data
    }

    if (!profile) return null

    return {
      id: user.id,
      nombre: profile.nombre,
      email: profile.email ?? user.email ?? '',
      isAdmin: !!profile.is_admin,
      iniciales: profile.iniciales ?? '',
      macroArea: profile.macro_area ?? null,
      avatarUrl: profile.avatar_url ?? null,
      region: profile.region ?? null,
      vendedoresErp: profile.vendedores_erp ?? [],
      puedeVerMargenes: !!profile.puede_ver_margenes,
      veComisionGerente: !!profile.ve_comision_gerente,
    }
  } catch {
    return null
  }
})
