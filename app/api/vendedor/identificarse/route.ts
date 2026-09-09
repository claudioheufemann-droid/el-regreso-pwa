import { NextResponse } from 'next/server'
import { createClient as createSbClient } from '@supabase/supabase-js'
import { SUPABASE_URL } from '@/lib/supabase/config'

export const dynamic = 'force-dynamic'

// Mismo nombre de cookie que /api/admin/impersonar — lib/auth.ts la lee tal
// cual (resolverImpersonacion) sin importar por cuál de los dos endpoints se
// haya puesto, así que activarse acá deja al vendedor viendo exactamente su
// propia interfaz (cartera, comisión, misiones) tal como ya lo hace "Ver como
// vendedor" para un admin.
const COOKIE = 'impersonar_vendedor'
const MAX_INTENTOS = 5

/**
 * POST /api/vendedor/identificarse
 *
 * Reemplazo de login SOLO para el período con LOGIN_DESACTIVADO_TEMPORAL
 * activo (ver lib/auth.ts): mientras no hay sesión real, cualquiera que
 * entra al link queda como "Invitado" sin vendedoresErp, así que no ve su
 * propia comisión ni puede quedar restringido a ella. Acá el vendedor elige
 * su nombre (de /api/vendedor/lista-identificacion, sólo quienes tienen PIN)
 * e ingresa su PIN de 4 dígitos — si calza, se activa la MISMA cookie de
 * impersonación que usa un admin, pero sin pasar por el gate de esAdminReal:
 * el PIN es el control de acceso acá.
 *
 * Bloqueo tras MAX_INTENTOS fallidos consecutivos (pin_intentos_fallidos) —
 * un PIN de 4 dígitos es adivinable por fuerza bruta sin esto. El reseteo
 * es manual (pedirle a Claudio), no hay auto-desbloqueo por tiempo.
 */
export async function POST(req: Request) {
  let body: { vendedorId?: unknown; pin?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }
  const { vendedorId, pin } = body
  if (typeof vendedorId !== 'string' || !vendedorId || typeof pin !== 'string' || !pin) {
    return NextResponse.json({ error: 'Faltan datos' }, { status: 400 })
  }

  const key = process.env.SUPABASE_SERVICE_KEY
  if (!SUPABASE_URL || !key) return NextResponse.json({ error: 'Supabase no configurado' }, { status: 500 })
  const admin = createSbClient(SUPABASE_URL, key)

  const { data: target } = await admin
    .from('users')
    .select('id, nombre, pin_identificacion, pin_intentos_fallidos')
    .eq('id', vendedorId)
    .eq('is_admin', false)
    .not('pin_identificacion', 'is', null)
    .maybeSingle()

  if (!target) return NextResponse.json({ error: 'Vendedor inválido' }, { status: 400 })

  const intentos = target.pin_intentos_fallidos ?? 0
  if (intentos >= MAX_INTENTOS) {
    return NextResponse.json(
      { error: 'Demasiados intentos fallidos. Pide a Claudio que te reactive el acceso.' },
      { status: 423 },
    )
  }

  if (target.pin_identificacion !== pin) {
    await admin.from('users').update({ pin_intentos_fallidos: intentos + 1 }).eq('id', vendedorId)
    const restantes = MAX_INTENTOS - (intentos + 1)
    return NextResponse.json(
      { error: restantes > 0 ? `PIN incorrecto. Te quedan ${restantes} intentos.` : 'PIN incorrecto. Acceso bloqueado.' },
      { status: 401 },
    )
  }

  if (intentos > 0) {
    await admin.from('users').update({ pin_intentos_fallidos: 0 }).eq('id', vendedorId)
  }

  const res = NextResponse.json({ ok: true, nombre: target.nombre })
  res.cookies.set(COOKIE, vendedorId, {
    httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 30,
  })
  return res
}

// Salir de la identificación (mismo efecto que "Salir" de Ver como vendedor).
export async function DELETE() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(COOKIE, '', { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 0 })
  return res
}
