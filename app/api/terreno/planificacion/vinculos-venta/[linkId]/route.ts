import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// PATCH /api/terreno/planificacion/vinculos-venta/[linkId] — confirma o descarta una
// sugerencia. Sólo esto (no la sola sugerencia) cuenta como venta vinculada en reportes
// de conversión — ver comentario de la tabla plan_venta_visita_links_terreno.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ linkId: string }> }) {
  const { linkId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const body = await req.json() as { tipo_vinculo: 'confirmado' | 'descartado' }
  if (!['confirmado', 'descartado'].includes(body.tipo_vinculo)) {
    return NextResponse.json({ error: 'tipo_vinculo inválido' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('plan_venta_visita_links_terreno')
    .update({ tipo_vinculo: body.tipo_vinculo, confirmado_por: user.id, confirmado_at: new Date().toISOString() })
    .eq('id', linkId)
    .select('*')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data)
}
