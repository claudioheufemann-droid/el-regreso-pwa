import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// POST /api/terreno/planificacion/[id]/rendicion/items — agrega una partida de gasto
// con su comprobante. Sólo mientras la rendición está pendiente/observada (RLS deja
// escribir al dueño del plan o a gestión; acá se valida además el estado).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data: rendicion } = await supabase.from('plan_rendiciones_terreno').select('id, estado').eq('plan_id', id).maybeSingle()
  if (!rendicion) return NextResponse.json({ error: 'Primero hay que crear la rendición (POST /rendicion)' }, { status: 400 })
  if (!['pendiente', 'observada'].includes(rendicion.estado)) {
    return NextResponse.json({ error: `La rendición está en estado "${rendicion.estado}", no admite nuevas partidas` }, { status: 400 })
  }

  const body = await req.json() as {
    plan_dia_id?: string
    tipo: 'km' | 'peaje' | 'almuerzo' | 'desayuno' | 'once_cena' | 'alojamiento' | 'otro'
    monto_clp: number
    comprobante_url?: string
    comprobante_hash?: string
  }
  if (!body.tipo || body.monto_clp == null) {
    return NextResponse.json({ error: 'tipo y monto_clp son obligatorios' }, { status: 400 })
  }

  const { data: item, error } = await supabase
    .from('plan_rendicion_items_terreno')
    .insert({
      rendicion_id: rendicion.id,
      plan_dia_id: body.plan_dia_id ?? null,
      tipo: body.tipo,
      monto_clp: body.monto_clp,
      comprobante_url: body.comprobante_url ?? null,
      comprobante_hash: body.comprobante_hash ?? null,
    })
    .select('*')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(item, { status: 201 })
}
