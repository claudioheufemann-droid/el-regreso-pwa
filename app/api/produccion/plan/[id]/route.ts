import { NextResponse } from 'next/server'
import { getServerUser } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'

function puedeGestionar(user: { isAdmin: boolean; macroArea: string | null }) {
  return user.isAdmin || user.macroArea === 'produccion'
}

/** PATCH: cambiar estado, fecha o litros de una fila puntual — NO toca
 *  prioridad (eso vive en /api/produccion/plan/reordenar, que reescribe la
 *  secuencia completa y evita choques con esta ruta). */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getServerUser()
  if (!user || !puedeGestionar(user)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  let body: Partial<{
    estado: 'planificado' | 'en_curso' | 'completado' | 'cancelado'
    litrosPlanificados: number
    fechaPlanificada: string
    observaciones: string | null
  }>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const cambios: Record<string, unknown> = { actualizado_at: new Date().toISOString() }
  if (body.estado) cambios.estado = body.estado
  if (body.litrosPlanificados != null) cambios.litros_planificados = body.litrosPlanificados
  if (body.fechaPlanificada) cambios.fecha_planificada = body.fechaPlanificada
  if (body.observaciones !== undefined) cambios.observaciones = body.observaciones

  const admin = createAdminClient()
  const { data, error } = await admin.from('plan_produccion').update(cambios).eq('id', id).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getServerUser()
  if (!user || !puedeGestionar(user)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  const admin = createAdminClient()
  const { error } = await admin.from('plan_produccion').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
