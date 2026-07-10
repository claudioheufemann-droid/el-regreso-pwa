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

// GET /api/logistica/lotes/[id] — Detalle de un envío con sus items
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await getSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data: lote, error } = await supabase
    .from('lotes_produccion')
    .select('*, items:lotes_produccion_items(*)')
    .eq('id', id)
    .single()

  if (error || !lote) return NextResponse.json({ error: error?.message ?? 'Envío no encontrado' }, { status: 404 })
  return NextResponse.json(lote)
}

// DELETE /api/logistica/lotes/[id] — Producción elimina un envío que aún no salió a bodega
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await getSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { error, count } = await supabase
    .from('lotes_produccion')
    .delete({ count: 'exact' })
    .eq('id', id)
    .eq('estado', 'declarado')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!count) return NextResponse.json({ error: 'No se encontró el envío o ya salió a bodega' }, { status: 400 })

  return NextResponse.json({ ok: true })
}
