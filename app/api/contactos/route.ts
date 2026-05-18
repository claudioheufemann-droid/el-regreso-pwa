import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// POST — registrar un contacto
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const body = await req.json()

  const { cliente_nombre_fantasia, vendedor, tipo, notas } = body

  if (!cliente_nombre_fantasia || !vendedor || !tipo) {
    return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('contactos')
    .insert({ cliente_nombre_fantasia, vendedor, tipo: tipo ?? 'whatsapp', notas: notas ?? null })
    .select('id, fecha_hora')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// GET — obtener contactos (para reporte)
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { searchParams } = new URL(req.url)
  const vendedor = searchParams.get('vendedor')
  const desde = searchParams.get('desde') // YYYY-MM-DD
  const cliente = searchParams.get('cliente')

  let query = supabase
    .from('contactos')
    .select('id, cliente_nombre_fantasia, vendedor, tipo, fecha_hora, notas')
    .order('fecha_hora', { ascending: false })
    .limit(2000)

  if (vendedor && vendedor !== 'all') query = query.eq('vendedor', vendedor)
  if (desde) query = query.gte('fecha_hora', desde)
  if (cliente) query = query.eq('cliente_nombre_fantasia', cliente)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
