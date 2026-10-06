import { NextRequest, NextResponse } from 'next/server'
import { getServerUser } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  archivarConversacion, conversacionMasReciente, mensajesParaMostrar, obtenerConversacion,
} from '@/lib/agente/memoria'
import { accionesDeConversacion, correosDeConversacion } from '@/lib/agente/correos'
import { accesoAsistente } from '@/lib/agente/alcance'

export const dynamic = 'force-dynamic'

/** Admins, usuarios con puede_usar_asistente y vendedores con cartera (el asistente en modo cartera, ver lib/agente/alcance.ts). Cada uno ve sólo sus conversaciones. */
async function adminActual() {
  const user = await getServerUser()
  if (!user) return { error: NextResponse.json({ error: 'No autenticado' }, { status: 401 }) } as const
  if (!accesoAsistente(user)) return { error: NextResponse.json({ error: 'Sin permiso' }, { status: 403 }) } as const
  return { user } as const
}

/** GET /api/agente/conversacion[?id=]  → la conversación pedida, o la más reciente del usuario, con sus mensajes. */
export async function GET(req: NextRequest) {
  const a = await adminActual()
  if ('error' in a) return a.error
  const admin = createAdminClient()

  const id = req.nextUrl.searchParams.get('id')
  const conv = id ? await obtenerConversacion(admin, a.user.id, id) : await conversacionMasReciente(admin, a.user.id)
  if (!conv) return NextResponse.json({ conversacion_id: null, mensajes: [] })

  const [mensajes, correos, acciones] = await Promise.all([
    mensajesParaMostrar(admin, conv.id),
    correosDeConversacion(admin, conv.id, a.user.id),
    accionesDeConversacion(admin, conv.id, a.user.id),
  ])
  return NextResponse.json({
    conversacion_id: conv.id,
    mensajes: mensajes.map(m => ({ rol: m.rol, texto: m.texto, herramientas: m.herramientas, error: m.error })),
    correos,
    acciones,
  })
}

/** PATCH /api/agente/conversacion { id }  → archiva (la "nueva conversación" del chat). El historial se conserva en la base. */
export async function PATCH(req: NextRequest) {
  const a = await adminActual()
  if ('error' in a) return a.error
  const body = await req.json().catch(() => null) as { id?: unknown } | null
  if (typeof body?.id !== 'string') return NextResponse.json({ error: 'Falta id.' }, { status: 400 })
  await archivarConversacion(createAdminClient(), a.user.id, body.id)
  return NextResponse.json({ ok: true })
}
