import { NextRequest, NextResponse } from 'next/server'
import { getServerUser } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

const TIPOS = ['regla', 'alias', 'esquema', 'preferencia', 'dato']

async function adminActual() {
  const user = await getServerUser()
  if (!user) return { error: NextResponse.json({ error: 'No autenticado' }, { status: 401 }) } as const
  if (!user.isAdmin) return { error: NextResponse.json({ error: 'Sin permiso' }, { status: 403 }) } as const
  return { user } as const
}

/**
 * GET /api/agente/memoria → memoria visible para este admin (global + la suya),
 * propuestas pendientes, y el uso de tokens de los últimos 7 días.
 */
export async function GET() {
  const a = await adminActual()
  if ('error' in a) return a.error
  const admin = createAdminClient()

  const desde = new Date(Date.now() - 7 * 86_400_000).toISOString()
  const [{ data: memorias }, { data: log }] = await Promise.all([
    admin.from('agente_memoria').select('id, ambito, usuario_id, tipo, contenido, estado, fuente, created_at')
      .in('estado', ['pendiente', 'activa']).or(`ambito.eq.global,usuario_id.eq.${a.user.id}`)
      .order('created_at', { ascending: false }).limit(300),
    admin.from('agente_consultas_log').select('tokens_entrada, tokens_salida, tokens_cacheados, modelo, respondio, duracion_ms')
      .gte('created_at', desde).limit(5000),
  ])

  const filas = log ?? []
  const conTokens = filas.filter(f => f.tokens_entrada != null)
  const suma = (k: 'tokens_entrada' | 'tokens_salida' | 'tokens_cacheados') => conTokens.reduce((s, f) => s + (Number(f[k]) || 0), 0)
  const porModelo = new Map<string, number>()
  for (const f of conTokens) if (f.modelo) porModelo.set(f.modelo, (porModelo.get(f.modelo) ?? 0) + 1)

  return NextResponse.json({
    memorias: (memorias ?? []).map(m => ({ ...m, propia: m.usuario_id === a.user.id, usuario_id: undefined })),
    uso: {
      dias: 7,
      preguntas: filas.length,
      sin_respuesta: filas.filter(f => !f.respondio).length,
      tokens_entrada: suma('tokens_entrada'),
      tokens_salida: suma('tokens_salida'),
      tokens_cacheados: suma('tokens_cacheados'),
      promedio_por_pregunta: conTokens.length ? Math.round((suma('tokens_entrada') + suma('tokens_salida')) / conTokens.length) : null,
      modelos: [...porModelo.entries()].sort((x, y) => y[1] - x[1]).map(([modelo, preguntas]) => ({ modelo, preguntas })),
    },
  })
}

/** POST { contenido, tipo?, ambito? } → un admin agrega conocimiento a mano: queda activo de inmediato. */
export async function POST(req: NextRequest) {
  const a = await adminActual()
  if ('error' in a) return a.error
  const b = await req.json().catch(() => null) as { contenido?: unknown; tipo?: unknown; ambito?: unknown } | null
  const contenido = typeof b?.contenido === 'string' ? b.contenido.trim() : ''
  if (contenido.length < 5 || contenido.length > 500) return NextResponse.json({ error: 'El texto debe tener entre 5 y 500 caracteres.' }, { status: 400 })
  const tipo = TIPOS.includes(String(b?.tipo)) ? String(b?.tipo) : 'regla'
  const global = b?.ambito === 'global'

  const { error } = await createAdminClient().from('agente_memoria').insert({
    ambito: global ? 'global' : 'usuario', usuario_id: global ? null : a.user.id, tipo, contenido,
    estado: 'activa', fuente: 'admin', propuesta_por: a.user.id,
  })
  if (error) return NextResponse.json({ error: 'No se pudo guardar.' }, { status: 500 })
  return NextResponse.json({ ok: true })
}

/** PATCH { id, estado: 'activa' | 'rechazada' } → aprobar o rechazar una propuesta pendiente. */
export async function PATCH(req: NextRequest) {
  const a = await adminActual()
  if ('error' in a) return a.error
  const b = await req.json().catch(() => null) as { id?: unknown; estado?: unknown } | null
  if (typeof b?.id !== 'number' || (b.estado !== 'activa' && b.estado !== 'rechazada')) return NextResponse.json({ error: 'Datos inválidos.' }, { status: 400 })

  const admin = createAdminClient()
  const { data } = await admin.from('agente_memoria').select('id, ambito, usuario_id, estado').eq('id', b.id).maybeSingle()
  if (!data || data.estado !== 'pendiente' || (data.ambito === 'usuario' && data.usuario_id !== a.user.id)) {
    return NextResponse.json({ error: 'No se puede modificar.' }, { status: 404 })
  }
  await admin.from('agente_memoria').update({ estado: b.estado }).eq('id', b.id)
  return NextResponse.json({ ok: true })
}

/** DELETE ?id= → borra una memoria global (cualquier admin) o personal (sólo su dueño). */
export async function DELETE(req: NextRequest) {
  const a = await adminActual()
  if ('error' in a) return a.error
  const id = Number(req.nextUrl.searchParams.get('id'))
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'Falta id.' }, { status: 400 })

  const admin = createAdminClient()
  const { data } = await admin.from('agente_memoria').select('ambito, usuario_id').eq('id', id).maybeSingle()
  if (!data || (data.ambito === 'usuario' && data.usuario_id !== a.user.id)) return NextResponse.json({ error: 'No se puede borrar.' }, { status: 404 })
  await admin.from('agente_memoria').delete().eq('id', id)
  return NextResponse.json({ ok: true })
}
