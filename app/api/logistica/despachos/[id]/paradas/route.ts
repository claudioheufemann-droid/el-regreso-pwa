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

// PATCH /api/logistica/despachos/[id]/paradas — reordenar la ruta (drag & drop)
// body: { orden: string[] } — ids de despacho_paradas en el nuevo orden
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: despachoId } = await params
  const supabase = await getSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { orden } = await req.json() as { orden: string[] }
  if (!orden?.length) return NextResponse.json({ error: 'orden es obligatorio' }, { status: 400 })

  // Dos pasadas para evitar colisión con el unique index (despacho_id, secuencia):
  // primero se corren todas a un rango temporal alto, luego se fijan en el orden final.
  await Promise.all(orden.map((paradaId, i) =>
    supabase.from('despacho_paradas').update({ secuencia: 1000 + i }).eq('id', paradaId).eq('despacho_id', despachoId)
  ))
  await Promise.all(orden.map((paradaId, i) =>
    supabase.from('despacho_paradas').update({ secuencia: i + 1 }).eq('id', paradaId).eq('despacho_id', despachoId)
  ))

  return NextResponse.json({ ok: true })
}
