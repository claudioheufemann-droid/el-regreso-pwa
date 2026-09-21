import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { validarPlanEditable } from '@/lib/terreno/planificacion/validarPlanEditable'

// POST /api/terreno/planificacion/[id]/dias/[diaId]/paradas — agrega una parada.
// Cambiar las paradas de un día invalida su cálculo de ruta (vuelve a
// 'pendiente_de_calculo' hasta el próximo POST a calcular-ruta).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; diaId: string }> }) {
  const { id, diaId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { error: errResp } = await validarPlanEditable(supabase, id, user.id)
  if (errResp) return errResp

  const body = await req.json() as {
    cliente_id?: number
    cliente_terreno_id?: string
    orden?: number
    objetivo_visita?: string
    monto_objetivo_clp?: number
    hora_concertada?: string
    duracion_estimada_min?: number
    observaciones?: string
  }
  if (!body.cliente_id && !body.cliente_terreno_id) {
    return NextResponse.json({ error: 'cliente_id o cliente_terreno_id es obligatorio' }, { status: 400 })
  }
  if (body.cliente_id && body.cliente_terreno_id) {
    return NextResponse.json({ error: 'Sólo uno de cliente_id/cliente_terreno_id' }, { status: 400 })
  }

  const { data: parada, error } = await supabase
    .from('plan_paradas_terreno')
    .insert({ plan_dia_id: diaId, ...body })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Nueva parada => el cálculo de ruta cacheado del día ya no representa la secuencia
  // real; se invalida acá en vez de esperar a que alguien recalcule y note el desfase.
  await supabase.from('plan_ruta_calculos_terreno').update({ vigente: false }).eq('plan_dia_id', diaId)

  return NextResponse.json(parada, { status: 201 })
}
