import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supabase/config'

async function getSupabase() {
  const cookieStore = await cookies()
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (list) => { try { list.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } catch {} },
    },
  })
}

interface LoteItemInput {
  producto: string
  envase: string
  cantidad_declarada: number
}

// GET /api/logistica/lotes?estado=declarado — lista de lotes (filtro opcional por estado)
export async function GET(req: NextRequest) {
  const supabase = await getSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const estado = req.nextUrl.searchParams.get('estado')

  let query = supabase
    .from('lotes_produccion')
    .select('*, items:lotes_produccion_items(*), declarante:users!lotes_produccion_declarado_por_fkey(nombre)')
    .order('created_at', { ascending: false })

  if (estado) query = query.eq('estado', estado)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST /api/logistica/lotes — Producción declara un lote con sus items y ETA
export async function POST(req: NextRequest) {
  const supabase = await getSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data: profile } = await supabase.from('users').select('id').eq('email', user.email!).single()
  if (!profile) return NextResponse.json({ error: 'Perfil no encontrado' }, { status: 404 })

  const body = await req.json() as {
    codigo_lote: string
    eta_entrega: string
    observaciones?: string
    items: LoteItemInput[]
  }

  if (!body.codigo_lote || !body.eta_entrega || !body.items?.length) {
    return NextResponse.json({ error: 'codigo_lote, eta_entrega e items son obligatorios' }, { status: 400 })
  }

  const { data: lote, error: loteErr } = await supabase
    .from('lotes_produccion')
    .insert({
      codigo_lote: body.codigo_lote,
      eta_entrega: body.eta_entrega,
      observaciones: body.observaciones ?? null,
      declarado_por: profile.id,
    })
    .select('*')
    .single()

  if (loteErr) return NextResponse.json({ error: loteErr.message }, { status: 500 })

  const { error: itemsErr } = await supabase
    .from('lotes_produccion_items')
    .insert(body.items.map(it => ({
      lote_id: lote.id,
      producto: it.producto,
      envase: it.envase,
      cantidad_declarada: it.cantidad_declarada,
    })))

  if (itemsErr) return NextResponse.json({ error: itemsErr.message }, { status: 500 })

  return NextResponse.json(lote, { status: 201 })
}
