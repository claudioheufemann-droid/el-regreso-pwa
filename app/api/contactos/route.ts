import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getServerUser } from '@/lib/auth'

const TIPOS_VALIDOS = ['visita', 'llamada', 'whatsapp', 'nota']
const RESULTADOS_VALIDOS = ['pedido', 'sin_pedido', 'no_estaba', 'reclamo', 'seguimiento']

// POST — registrar un contacto / interacción / nota
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const user = await getServerUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { cliente_nombre_fantasia, tipo, resultado, notas } = body

  if (!cliente_nombre_fantasia || !tipo) {
    return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 })
  }
  if (!TIPOS_VALIDOS.includes(tipo)) {
    return NextResponse.json({ error: 'Tipo inválido' }, { status: 400 })
  }
  if (resultado && !RESULTADOS_VALIDOS.includes(resultado)) {
    return NextResponse.json({ error: 'Resultado inválido' }, { status: 400 })
  }

  // El vendedor se deriva de la sesión (no se confía en el body).
  // Admin puede registrar a nombre del vendedor del cliente; un vendedor solo a su nombre.
  const vendedor = user.nombre

  const { data, error } = await supabase
    .from('contactos')
    .insert({
      cliente_nombre_fantasia,
      vendedor,
      tipo,
      resultado: resultado ?? null,
      notas: notas ?? null,
    })
    .select('id, fecha_hora, tipo, resultado, notas, vendedor')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// GET — obtener contactos (para reporte / timeline)
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const user = await getServerUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const vendedor = searchParams.get('vendedor')
  const desde = searchParams.get('desde') // YYYY-MM-DD
  const cliente = searchParams.get('cliente')

  let query = supabase
    .from('contactos')
    .select('id, cliente_nombre_fantasia, vendedor, tipo, resultado, fecha_hora, notas')
    .order('fecha_hora', { ascending: false })
    .limit(2000)

  // Si no es admin, solo ve sus propios contactos
  if (!user.isAdmin) {
    query = query.eq('vendedor', user.nombre)
  } else if (vendedor && vendedor !== 'all') {
    query = query.eq('vendedor', vendedor)
  }

  if (desde) query = query.gte('fecha_hora', desde)
  if (cliente) query = query.eq('cliente_nombre_fantasia', cliente)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
