import { NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { getServerUser } from '@/lib/auth'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('Supabase no configurado')
  return createSupabaseClient(url, key)
}

export async function GET() {
  // Este endpoint usa service role (bypassa RLS) y devuelve la cartera
  // completa: razón social, contacto y deuda de cada cliente. Sin este gate
  // queda expuesta a cualquiera que sepa la URL.
  if (!await getServerUser()) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  try {
    let supabase: ReturnType<typeof getAdminClient>
    try {
      supabase = getAdminClient()
    } catch (e: unknown) {
      return NextResponse.json({ error: String(e) }, { status: 500 })
    }

    const { data: deudores, error } = await supabase
      .from('deudores')
      .select('*')
      .order('deuda_vencida', { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(deudores ?? [])
  } catch (error: unknown) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
