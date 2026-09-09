import { NextResponse } from 'next/server'
import { getServerUser } from '@/lib/auth'

const COOKIE = 'impersonar_vendedor'

// "Ver como vendedor" — cambia la interfaz de un admin real para que se
// comporte como la de un vendedor puntual (QA/soporte), sin dejar de ser
// admin de fondo. Ver lib/auth.ts (getServerUser) para el detalle completo.
export async function POST(req: Request) {
  const user = await getServerUser()
  // esAdminReal (no isAdmin): si ya estaba impersonando a otro vendedor y
  // quiere cambiar de vista, isAdmin está apagado a propósito pero sigue
  // siendo admin real — debe poder seguir usando el selector.
  //
  // sesionReal además: mientras LOGIN_DESACTIVADO_TEMPORAL esté activo
  // (lib/auth.ts), el "Invitado" del bypass también tiene esAdminReal=true
  // — sin este chequeo, cualquiera con el link (sin cuenta) podría
  // impersonar a CUALQUIER vendedor sin restricción, comisión incluida. Un
  // vendedor que quiera verse a sí mismo usa /identificarse (PIN), no esto.
  if (!user?.esAdminReal || !user.sesionReal) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const { vendedorId } = await req.json()
  if (!vendedorId || typeof vendedorId !== 'string') {
    return NextResponse.json({ error: 'Falta vendedorId' }, { status: 400 })
  }

  const res = NextResponse.json({ ok: true })
  res.cookies.set(COOKIE, vendedorId, {
    httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 30,
  })
  return res
}

// Salir del modo "ver como vendedor" y volver a la vista de admin normal.
export async function DELETE() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(COOKIE, '', { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 0 })
  return res
}
