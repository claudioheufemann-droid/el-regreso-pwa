import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

async function requireAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'No autenticado' }, { status: 401 }), user: null }

  const { data: profile } = await supabase.from('users').select('id, is_admin').eq('email', user.email!).single()
  if (!profile?.is_admin) return { error: NextResponse.json({ error: 'Sin permisos' }, { status: 403 }), user: null }
  return { error: null, user: profile }
}

// GET /api/admin/jornadas/[id] — detalle de una jornada: vendedor, visitas (ruta) y cargas de combustible
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { error: authError } = await requireAdmin(supabase)
  if (authError) return authError

  const { data: jornada, error } = await supabase
    .from('jornadas_terreno')
    .select('*, vendedor:users!jornadas_terreno_vendedor_id_fkey(nombre, iniciales, tarifa_reembolso_km, rendimiento_kml, vehiculo_tipo), revisor:users!jornadas_terreno_revisada_por_fkey(nombre)')
    .eq('id', id)
    .single()

  if (error || !jornada) return NextResponse.json({ error: 'Jornada no encontrada' }, { status: 404 })

  const { data: visitas } = await supabase
    .from('visitas_terreno')
    .select('id, cliente_nombre, es_cliente_nuevo, lat, lng, direccion_gps, foto_exterior, foto_exhibicion, foto_competencia, distancia_cliente_m, dentro_geofence, total_pedido, tiene_venta, iniciada_at')
    .eq('jornada_id', id)
    .order('iniciada_at', { ascending: true })

  const { data: cargas } = await supabase
    .from('cargas_combustible_terreno')
    .select('*')
    .eq('jornada_id', id)
    .order('registrado_at', { ascending: true })

  return NextResponse.json({ jornada, visitas: visitas ?? [], cargas: cargas ?? [] })
}

// PATCH /api/admin/jornadas/[id] — aprobar o rechazar la jornada con nota
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { error: authError, user: admin } = await requireAdmin(supabase)
  if (authError) return authError

  const body = await req.json() as { estado: 'aprobada' | 'rechazada'; nota_revision?: string }
  if (!['aprobada', 'rechazada'].includes(body.estado)) {
    return NextResponse.json({ error: 'estado inválido' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('jornadas_terreno')
    .update({
      estado: body.estado,
      nota_revision: body.nota_revision?.trim() || null,
      revisada_por: admin!.id,
      revisada_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
