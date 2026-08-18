import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supabase/config'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url)
  const code  = searchParams.get('code')
  const next  = searchParams.get('next') ?? '/'

  if (!code) return NextResponse.redirect(`${origin}/login?error=no_code`)

  const cookieStore = await cookies()
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll:  () => cookieStore.getAll(),
      setAll: (list) => { try { list.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } catch {} },
    },
  })

  const { data, error } = await supabase.auth.exchangeCodeForSession(code)
  if (error || !data.user) return NextResponse.redirect(`${origin}/login?error=auth_failed`)

  const user = data.user

  // Obtener foto de Google desde los metadatos de auth
  const googleAvatar =
    user.user_metadata?.avatar_url  ??
    user.user_metadata?.picture     ??
    null

  // Obtener perfil público del usuario
  const { data: profile } = await supabase
    .from('users')
    .select('id, avatar_url')
    .eq('email', user.email!)
    .maybeSingle()

  if (profile) {
    // Solo actualizar si no tiene foto propia ya o si cambió
    if (googleAvatar && profile.avatar_url !== googleAvatar) {
      await supabase
        .from('users')
        .update({ avatar_url: googleAvatar })
        .eq('id', profile.id)
    }
  }

  return NextResponse.redirect(`${origin}${next}`)
}
