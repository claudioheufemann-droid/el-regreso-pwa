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

  // getSession() en vez de getUser(): getUser() valida el JWT contra el
  // servidor de Auth de Supabase con una llamada de red EN CADA navegación
  // (desde el edge de Vercel). Cuando esa llamada falla o tarda por
  // cualquier motivo transitorio, este gate trataba a un usuario con sesión
  // válida como si no la tuviera y lo mandaba a /login — que un instante
  // después lo rebotaba de vuelta a "/" al releer la cookie (sí válida),
  // dando el "pestañea y vuelve a la selección de módulo" reportado.
  // getSession() solo decodifica la cookie localmente, sin red: es la
  // verificación correcta para este gate, que es un filtro grueso de UX
  // (¿hay sesión o no?), no la autorización real — esa ya la revalida
  // getServerUser() (que sí usa getUser()) en cada layout de módulo antes
  // de mostrar cualquier dato.
  const { data: { session } } = await supabase.auth.getSession()

  // /auth/callback debe pasar sin sesión: recién ahí se intercambia el
  // "code" de Google por la cookie de sesión (exchangeCodeForSession). Si el
  // proxy lo bloquea aquí, redirige a /login ANTES de que eso ocurra y se
  // pierde el parámetro ?code= — el login con Google nunca terminaba de
  // completarse.
  if (!session && pathname !== '/login' && pathname !== '/auth/callback') {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (session && pathname === '/login') {
    return NextResponse.redirect(new URL('/', request.url))
  }

  return response
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon\\.ico|sw\\.js|manifest\\.json|icons|.*\\.png$|.*\\.jpg$|.*\\.svg$|.*\\.webp$).*)',
  ],
}
