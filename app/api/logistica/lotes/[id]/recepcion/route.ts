import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supabase/config'
import { sendPushToUsers } from '@/lib/push'

async function getSupabase() {
  const cookieStore = await cookies()
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (list) => { try { list.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } catch {} },
    },
  })
}

interface RecepcionInput {
  item_id: string
  cantidad_recibida: number
}

// POST /api/logistica/lotes/[id]/recepcion — Logística confirma cantidades recibidas por item.
// El trigger fn_check_discrepancia_lote genera la alerta automáticamente si no calza.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: loteId } = await params
  const supabase = await getSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data: profile } = await supabase.from('users').select('id').eq('email', user.email!).single()
  if (!profile) return NextResponse.json({ error: 'Perfil no encontrado' }, { status: 404 })

  const body = await req.json() as { items: RecepcionInput[] }
  if (!body.items?.length) return NextResponse.json({ error: 'items es obligatorio' }, { status: 400 })

  const { error: insertErr } = await supabase
    .from('lotes_recepcion_items')
    .insert(body.items.map(it => ({
      lote_id: loteId,
      item_id: it.item_id,
      cantidad_recibida: it.cantidad_recibida,
      recibido_por: profile.id,
    })))

  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })

  // Releer estado del lote (el trigger pudo haberlo marcado 'con_discrepancia')
  const { data: lote } = await supabase.from('lotes_produccion').select('*').eq('id', loteId).single()

  if (lote?.estado === 'declarado' || lote?.estado === 'enviado') {
    await supabase.from('lotes_produccion').update({ estado: 'recibido' }).eq('id', loteId)
  }

  // Si quedó con discrepancia, avisar a Producción y Logística de inmediato
  if (lote?.estado === 'con_discrepancia') {
    const { data: destinatarios } = await supabase
      .from('users')
      .select('id')
      .in('macro_area', ['produccion', 'logistica'])
    if (destinatarios?.length) {
      sendPushToUsers(destinatarios.map(d => d.id), {
        title: '⚠️ Descuadre de inventario',
        body: 'Lo recibido en bodega no coincide con lo declarado.',
        url: '/logistica/alertas',
        tag: `alerta-lote-${lote.id}`,
        requireInteraction: true,
      }).catch(() => {})
    }
  }

  return NextResponse.json({ ok: true, estado: lote?.estado })
}
