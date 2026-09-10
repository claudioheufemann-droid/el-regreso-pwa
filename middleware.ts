import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Sin este middleware, el refresh del token de sesión sólo podía intentarse
 * dentro de getServerUser() (Server Component), donde Next.js NO permite
 * escribir cookies — lib/supabase/server.ts silenciaba ese error con un
 * try/catch vacío. Como Supabase rota el refresh token en cada uso (de un
 * solo uso), el token rotado se generaba pero nunca se guardaba de vuelta en
 * el browser: el browser seguía mandando el refresh token VIEJO, que
 * Supabase ya había invalidado. En cuanto el access token expiraba (¬1h) y
 * hacía falta ese refresh —típicamente al reabrir la app después de un
 * rato cerrada—, el intento de refresco fallaba y la sesión quedaba
 * muerta: de ahí el "cada vez que cierro la app me pide loguearme de
 * nuevo" (10-sep-2026).
 *
 * Este middleware corre en CADA request y sí puede escribir cookies (vía
 * NextResponse), así que el refresh queda persistido de verdad — patrón
 * estándar de Supabase para Next.js App Router.
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co'
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder'

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
      },
    },
  })

  // No se puede omitir esta llamada: es la que dispara el refresh (y la
  // reescritura de cookies de arriba) cuando el access token ya venció.
  await supabase.auth.getUser()

  return response
}

export const config = {
  matcher: [
    /*
     * Corre en todo menos assets estáticos y el manifest/service worker de
     * la PWA — no hay sesión que refrescar ahí y sumaría latencia gratis.
     */
    '/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
