import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { validarPlanEditable } from '@/lib/terreno/planificacion/validarPlanEditable'

// POST /api/terreno/planificacion/[id]/dias — agrega un día al plan (borrador/devuelto).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { error: errResp } = await validarPlanEditable(supabase, id, user.id)
  if (errResp) return errResp

  const body = await req.json() as {
    fecha: string
    jornada_tipo?: string
    pernocta?: boolean
    hotel_estimado_clp?: number
    origen?: string; origen_lat?: number; origen_lng?: number
    destino?: string; destino_lat?: number; destino_lng?: number
    regreso_mismo_dia?: boolean
    vehiculo?: 'particular' | 'empresa'
    vehiculo_id?: string
    peajes_estimados_clp?: number
    desayuno_incluido_alojamiento?: boolean
    observaciones?: string
    orden?: number
  }
  if (!body.fecha) return NextResponse.json({ error: 'fecha es obligatoria' }, { status: 400 })

  const { data: dia, error } = await supabase
    .from('plan_dias_terreno')
    .insert({ plan_id: id, ...body })
    .select('*')
    .single()

  if (error) {
    const status = error.code === '23505' ? 409 : 500 // unique(plan_id, fecha)
    return NextResponse.json({ error: error.message }, { status })
  }
  return NextResponse.json(dia, { status: 201 })
}
