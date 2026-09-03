import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getServerUser } from '@/lib/auth'
import { puedeVerControlComercial } from '@/lib/control-comercial/permisos'

export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET() {
  const user = await getServerUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!puedeVerControlComercial(user)) return NextResponse.json({ error: 'Sin acceso a Control Comercial' }, { status: 403 })

  const supabase = await createClient()
  const hoy = new Date().toISOString().slice(0, 10)

  // Marca como atrasado cualquier pendiente cuya fecha ya pasó (lectura, no side-effect persistido acá).
  const { data, error } = await supabase
    .from('compromisos_reunion')
    .select('id, periodo_id, responsable, accion, fecha_compromiso, estado, comentario, fecha_cumplimiento, evidencia_url, created_at')
    .order('fecha_compromiso', { ascending: false })
    .limit(100)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const conEstadoDerivado = (data ?? []).map(c => ({
    ...c,
    estado: c.estado === 'pendiente' && c.fecha_compromiso < hoy ? 'atrasado' : c.estado,
  }))

  return NextResponse.json(conEstadoDerivado)
}

export async function POST(req: NextRequest) {
  const user = await getServerUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!puedeVerControlComercial(user)) return NextResponse.json({ error: 'Sin acceso a Control Comercial' }, { status: 403 })

  const body = await req.json()
  const { periodo_id, responsable, accion, fecha_compromiso } = body ?? {}
  if (!responsable || !accion || !fecha_compromiso) {
    return NextResponse.json({ error: 'responsable, accion y fecha_compromiso son obligatorios' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('compromisos_reunion')
    .insert({
      periodo_id: periodo_id ?? null, responsable, accion, fecha_compromiso,
      created_by: UUID_RE.test(user.id) ? user.id : null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const user = await getServerUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!puedeVerControlComercial(user)) return NextResponse.json({ error: 'Sin acceso a Control Comercial' }, { status: 403 })

  const body = await req.json()
  const { id, estado, comentario, evidencia_url } = body ?? {}
  if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (estado) {
    update.estado = estado
    update.fecha_cumplimiento = estado === 'cumplido' ? new Date().toISOString().slice(0, 10) : null
  }
  if (comentario !== undefined) update.comentario = comentario
  if (evidencia_url !== undefined) update.evidencia_url = evidencia_url

  const supabase = await createClient()
  const { data, error } = await supabase.from('compromisos_reunion').update(update).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
