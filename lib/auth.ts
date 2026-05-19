import { createClient } from './supabase/server'

export interface AppUser {
  id: string
  nombre: string
  email: string
  isAdmin: boolean
  iniciales: string
}

export async function getServerUser(): Promise<AppUser | null> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const { data: profile } = await supabase
      .from('users')
      .select('nombre, iniciales, is_admin, email')
      .eq('id', user.id)
      .single()

    if (!profile) return null

    return {
      id: user.id,
      nombre: profile.nombre,
      email: profile.email ?? user.email ?? '',
      isAdmin: !!profile.is_admin,
      iniciales: profile.iniciales ?? '',
    }
  } catch {
    return null
  }
}
