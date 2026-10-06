import { NextRequest, NextResponse } from 'next/server'
import { getServerUser } from '@/lib/auth'
import { accesoAsistente } from '@/lib/agente/alcance'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/**
 * PATCH /api/agente/listas/[id]  { item: string, hecho: boolean }
 *
 * Marca o desmarca un ítem de una lista de chequeo del asistente (ej. pedido
 * cargado en el camión). Sólo quien la creó. La actualización es atómica en la
 * base (agente_lista_marcar): dos marcas casi simultáneas no se pisan.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getServerUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!accesoAsistente(user)) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const { id } = await params
  const body = await req.json().catch(() => null) as { item?: unknown; hecho?: unknown } | null
  if (typeof body?.item !== 'string' || typeof body?.hecho !== 'boolean') return NextResponse.json({ error: 'Datos inválidos.' }, { status: 400 })

  const admin = createAdminClient()
  const { data: lista } = await admin.from('agente_listas').select('creado_por').eq('id', id).maybeSingle()
  if (!lista || lista.creado_por !== user.id) return NextResponse.json({ error: 'Lista no encontrada.' }, { status: 404 })

  const { data: items, error } = await admin.rpc('agente_lista_marcar', { p_lista: id, p_item: body.item, p_hecho: body.hecho, p_por: user.nombre })
  if (error) return NextResponse.json({ error: 'No se pudo guardar la marca.' }, { status: 500 })
  return NextResponse.json({ ok: true, items })
}
