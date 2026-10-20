import { NextResponse } from 'next/server'
import { getServerUser } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'

const ETAPAS = ['coccion', 'fermentacion', 'maduracion', 'listo', 'envasado', 'finalizado'] as const
type Etapa = (typeof ETAPAS)[number]

function puedeGestionar(user: { isAdmin: boolean; macroArea: string | null }) {
  return user.isAdmin || user.macroArea === 'produccion'
}

/** GET: un lote con su historial de etapas, insumos consumidos y envasado. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getServerUser()
  if (!user || !puedeGestionar(user)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { id } = await params

  const admin = createAdminClient()
  const [lote, etapas, insumos, envasado] = await Promise.all([
    admin.from('lotes').select('*').eq('id', id).single(),
    admin.from('lote_etapas').select('*').eq('lote_id', id).order('fecha_inicio'),
    admin.from('lote_insumos').select('*, insumos(nombre, unidad_base)').eq('lote_id', id),
    admin.from('lote_envasado').select('*').eq('lote_id', id).order('fecha'),
  ])
  if (lote.error) return NextResponse.json({ error: lote.error.message }, { status: lote.error.code === 'PGRST116' ? 404 : 500 })
  return NextResponse.json({ lote: lote.data, etapas: etapas.data ?? [], insumos: insumos.data ?? [], envasado: envasado.data ?? [] })
}

/** PATCH: pasar de etapa (cierra la etapa abierta y abre la nueva), anotar
 *  merma, cambiar de tanque, observaciones o estado. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getServerUser()
  if (!user || !puedeGestionar(user)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { id } = await params

  let body: Partial<{
    etapa: Etapa; litrosMerma: number; fermentadorId: string | null; observaciones: string | null
    estado: 'activo' | 'finalizado' | 'desactivado'; mediciones: Record<string, number>
  }>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const admin = createAdminClient()
  const cambios: Record<string, unknown> = { actualizado_at: new Date().toISOString() }

  if (body.litrosMerma !== undefined) {
    if (!(typeof body.litrosMerma === 'number' && body.litrosMerma >= 0)) return NextResponse.json({ error: 'Merma inválida' }, { status: 400 })
    cambios.litros_merma = body.litrosMerma
  }
  if (body.fermentadorId !== undefined) cambios.fermentador_id = body.fermentadorId
  if (body.observaciones !== undefined) cambios.observaciones = body.observaciones
  if (body.estado) cambios.estado = body.estado

  if (body.etapa) {
    if (!ETAPAS.includes(body.etapa)) return NextResponse.json({ error: 'Etapa inválida' }, { status: 400 })
    cambios.etapa_actual = body.etapa
    if (body.etapa === 'finalizado') cambios.estado = 'finalizado'
  }

  const { data, error } = await admin.from('lotes').update(cambios).eq('id', id).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: error.code === 'PGRST116' ? 404 : 500 })

  if (body.etapa) {
    const ahora = new Date().toISOString()
    await admin.from('lote_etapas').update({ fecha_fin: ahora }).eq('lote_id', id).is('fecha_fin', null)
    await admin.from('lote_etapas').insert({
      lote_id: id,
      etapa: body.etapa,
      fecha_inicio: ahora,
      fecha_fin: body.etapa === 'finalizado' ? ahora : null,
      mediciones: body.mediciones ?? {},
      registrado_por: user.id,
    })
  }
  return NextResponse.json(data)
}
