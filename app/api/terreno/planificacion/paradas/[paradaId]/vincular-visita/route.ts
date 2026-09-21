import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * PATCH /api/terreno/planificacion/paradas/[paradaId]/vincular-visita — enlaza la visita
 * recién creada/cerrada en Nueva Visita con la parada planificada de la que se originó.
 * A propósito NO pasa por validarPlanEditable: esto ocurre normalmente con el plan ya
 * APROBADO (la semana ya se está ejecutando), no en borrador — es un vínculo de
 * ejecución, no una edición del contenido/presupuesto del plan. RLS ya limita esto al
 * dueño del plan sin importar su estado (ver policy plan_paradas_write).
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ paradaId: string }> }) {
  const { paradaId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const body = await req.json() as { visita_id: string }
  if (!body.visita_id) return NextResponse.json({ error: 'visita_id es obligatorio' }, { status: 400 })

  const { data: visita } = await supabase.from('visitas_terreno').select('id, vendedor_id').eq('id', body.visita_id).maybeSingle()
  if (!visita || visita.vendedor_id !== user.id) {
    return NextResponse.json({ error: 'La visita no existe o no te pertenece' }, { status: 403 })
  }

  const { data: parada, error } = await supabase
    .from('plan_paradas_terreno')
    .update({ visita_id: body.visita_id })
    .eq('id', paradaId)
    .is('visita_id', null) // no pisar un vínculo ya hecho (ej. reintento offline)
    .select('id')
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ vinculado: !!parada })
}
