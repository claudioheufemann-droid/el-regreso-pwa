import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        // Fix: set all cookies on ONE new response, not one per cookie
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // getUser() (no getSession()): a diferencia de getSession() — que solo
  // decodifica la cookie local sin tocar red — getUser() es lo que dispara
  // el REFRESCO del access token contra Supabase cuando ya venció, y ese
  // refresco se persiste acá mismo vía el callback setAll() de arriba. Si
  // el proxy usa solo getSession(), el token nunca se refresca en el punto
  // correcto: la cookie queda "vieja pero con pinta de válida" para este
  // gate, mientras que getServerUser() (en cada layout de módulo, que SÍ usa
  // getUser()) la rechaza por vencida — resultado: el layout manda a
  // /login, el proxy (con la cookie sin refrescar) te rebota de vuelta a
  // "/", y así en loop infinito ("ERR_TOO_MANY_REDIRECTS"). Confirmado:
  // pasó exactamente eso al cambiar esto a getSession() por error.
  const { data: { user } } = await supabase.auth.getUser()

  // 🔓 TEMPORAL (pedido de Claudio, 2026-08-26): login desactivado para dejar
  // la app abierta durante una prueba. Poner en `false` cuando Claudio avise
  // que hay que restaurar el login.
  const LOGIN_DESACTIVADO_TEMPORAL = true

  // /auth/callback debe pasar sin sesión: recién ahí se intercambia el
  // "code" de Google por la cookie de sesión (exchangeCodeForSession). Si el
  // proxy lo bloquea aquí, redirige a /login ANTES de que eso ocurra y se
  // pierde el parámetro ?code= — el login con Google nunca terminaba de
  // completarse.
  if (!user && pathname !== '/login' && pathname !== '/auth/callback' && !LOGIN_DESACTIVADO_TEMPORAL) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (user && pathname === '/login') {
    return NextResponse.redirect(new URL('/', request.url))
  }

  return response
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon\\.ico|sw\\.js|manifest\\.json|icons|.*\\.png$|.*\\.jpg$|.*\\.svg$|.*\\.webp$).*)',
  ],
}
