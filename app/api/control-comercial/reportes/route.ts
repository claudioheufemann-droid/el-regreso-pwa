import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getServerUser } from '@/lib/auth'
import { puedeVerControlComercial } from '@/lib/control-comercial/permisos'

export const dynamic = 'force-dynamic'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET() {
  const user = await getServerUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!puedeVerControlComercial(user)) return NextResponse.json({ error: 'Sin acceso a Control Comercial' }, { status: 403 })

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('reportes_control_comercial')
    .select('id, periodo_nombre, tipo, filtros, snapshot, resumen_texto, creado_por_nombre, destinatarios_email, enviado_email, enviado_whatsapp, created_at')
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const user = await getServerUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!puedeVerControlComercial(user)) return NextResponse.json({ error: 'Sin acceso a Control Comercial' }, { status: 403 })

  const body = await req.json()
  const { periodo_id, periodo_nombre, tipo, filtros, snapshot, resumen_texto } = body ?? {}
  if (!periodo_nombre || !tipo || !snapshot) {
    return NextResponse.json({ error: 'Faltan campos obligatorios' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('reportes_control_comercial')
    .insert({
      periodo_id: periodo_id ?? null, periodo_nombre, tipo, filtros: filtros ?? {}, snapshot, resumen_texto: resumen_texto ?? null,
      creado_por: UUID_RE.test(user.id) ? user.id : null,
      creado_por_nombre: user.nombre,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
