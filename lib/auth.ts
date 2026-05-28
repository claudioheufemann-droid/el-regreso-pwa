import { createClient } from './supabase/server'

export interface AppUser {
  id: string
  nombre: string
  email: string
  isAdmin: boolean
  iniciales: string
  macroArea: string | null   // null = admin global (ve todo)
}

export async function getServerUser(): Promise<AppUser | null> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    // Primary lookup: by auth UUID
    let { data: profile } = await supabase
      .from('users')
      .select('nombre, iniciales, is_admin, email, macro_area')
      .eq('id', user.id)
      .maybeSingle()

    // Fallback: by email (handles any future UUID drift)
    if (!profile && user.email) {
      const res = await supabase
        .from('users')
        .select('nombre, iniciales, is_admin, email, macro_area')
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
    }
  } catch {
    return null
  }
}
