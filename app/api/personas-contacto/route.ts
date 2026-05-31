import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getServerUser } from '@/lib/auth'

// GET — personas de contacto de un cliente
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const user = await getServerUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const cliente = searchParams.get('cliente')
  if (!cliente) return NextResponse.json({ error: 'Falta cliente' }, { status: 400 })

  const { data, error } = await supabase
    .from('personas_contacto')
    .select('id, nombre, cargo, telefono, email, es_decisor, notas, created_at')
    .eq('cliente_nombre_fantasia', cliente)
    .order('es_decisor', { ascending: false })
    .order('nombre')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// POST — agregar persona de contacto
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const user = await getServerUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { cliente_nombre_fantasia, nombre, cargo, telefono, email, es_decisor, notas } = body

  if (!cliente_nombre_fantasia || !nombre?.trim()) {
    return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('personas_contacto')
    .insert({ cliente_nombre_fantasia, nombre: nombre.trim(), cargo: cargo?.trim() || null, telefono: telefono?.trim() || null, email: email?.trim() || null, es_decisor: !!es_decisor, notas: notas?.trim() || null })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// PATCH — actualizar persona de contacto
export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const user = await getServerUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, ...updates } = await req.json()
  if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })

  const allowed = ['nombre', 'cargo', 'telefono', 'email', 'es_decisor', 'notas']
  const clean: Record<string, unknown> = {}
  for (const k of allowed) if (k in updates) clean[k] = updates[k]

  const { error } = await supabase.from('personas_contacto').update(clean).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE — eliminar persona de contacto
export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const user = await getServerUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })

  const { error } = await supabase.from('personas_contacto').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
