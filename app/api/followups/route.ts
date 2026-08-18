import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getServerUser } from '@/lib/auth'

// GET — obtener follow-ups del vendedor (o de un cliente específico)
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const user = await getServerUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const cliente = searchParams.get('cliente')
  const solo_pendientes = searchParams.get('pendientes') === '1'

  let query = supabase
    .from('followups')
    .select('id, cliente_nombre_fantasia, vendedor, nota, fecha_recordatorio, estado, completado_at, created_at')
    .order('fecha_recordatorio', { ascending: true })

  // Vendedor solo ve los suyos; admin puede filtrar
  if (!user.isAdmin) {
    query = query.eq('vendedor', user.nombre)
  }
  if (cliente) query = query.eq('cliente_nombre_fantasia', cliente)
  if (solo_pendientes) query = query.eq('estado', 'pendiente')

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// POST — crear un follow-up
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const user = await getServerUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { cliente_nombre_fantasia, nota, fecha_recordatorio } = body

  if (!cliente_nombre_fantasia || !nota?.trim() || !fecha_recordatorio) {
    return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('followups')
    .insert({ cliente_nombre_fantasia, vendedor: user.nombre, nota: nota.trim(), fecha_recordatorio })
    .select('id, cliente_nombre_fantasia, vendedor, nota, fecha_recordatorio, estado, created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// PATCH — marcar como completado o deshacer
export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const user = await getServerUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, estado } = await req.json()
  if (!id || !['pendiente', 'completado'].includes(estado)) {
    return NextResponse.json({ error: 'Parámetros inválidos' }, { status: 400 })
  }

  // Verificar propiedad
  const { data: fu } = await supabase.from('followups').select('vendedor').eq('id', id).single()
  if (!fu) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  if (!user.isAdmin && fu.vendedor !== user.nombre) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const { error } = await supabase
    .from('followups')
    .update({ estado, completado_at: estado === 'completado' ? new Date().toISOString() : null })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE — eliminar un follow-up
export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const user = await getServerUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })

  const { data: fu } = await supabase.from('followups').select('vendedor').eq('id', id).single()
  if (!fu) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  if (!user.isAdmin && fu.vendedor !== user.nombre) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const { error } = await supabase.from('followups').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
