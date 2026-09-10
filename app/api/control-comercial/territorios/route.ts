import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getServerUser } from '@/lib/auth'
import { puedeVerControlComercial } from '@/lib/control-comercial/permisos'

export const dynamic = 'force-dynamic'

/** Territorios/canales — con `todos=1` devuelve también el histórico (Configuración); si no, solo los vigentes hoy. */
export async function GET(req: NextRequest) {
  const user = await getServerUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!puedeVerControlComercial(user)) return NextResponse.json({ error: 'Sin acceso a Control Comercial' }, { status: 403 })

  const supabase = await createClient()
  const hoy = new Date().toISOString().slice(0, 10)
  const todos = req.nextUrl.searchParams.get('todos') === '1'

  let query = supabase
    .from('territorios_responsables')
    .select('id, territorio, tipo, responsable, nombres_erp, vigente_desde, vigente_hasta')
    .order('territorio')
    .order('vigente_desde', { ascending: false })

  if (!todos) {
    query = query.lte('vigente_desde', hoy).or(`vigente_hasta.is.null,vigente_hasta.gte.${hoy}`)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const user = await getServerUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!puedeVerControlComercial(user)) return NextResponse.json({ error: 'Sin acceso a Control Comercial' }, { status: 403 })

  const body = await req.json()
  const { territorio, tipo, responsable, nombres_erp, vigente_desde } = body ?? {}
  if (!territorio || !tipo || !responsable || !vigente_desde) {
    return NextResponse.json({ error: 'territorio, tipo, responsable y vigente_desde son obligatorios' }, { status: 400 })
  }
  if (!Array.isArray(nombres_erp) || nombres_erp.length === 0) {
    return NextResponse.json({ error: 'nombres_erp debe tener al menos un nombre (valores de ventas.vendedor_actual)' }, { status: 400 })
  }

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('territorios_responsables')
    .insert({ territorio, tipo, responsable, nombres_erp, vigente_desde, created_by: UUID_RE.test(user.id) ? user.id : null })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

/** Cierra la vigencia de una asignación (para reasignar sin borrar histórico). */
export async function PATCH(req: NextRequest) {
  const user = await getServerUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!puedeVerControlComercial(user)) return NextResponse.json({ error: 'Sin acceso a Control Comercial' }, { status: 403 })

  const body = await req.json()
  const { id, vigente_hasta } = body ?? {}
  if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })

  const supabase = await createClient()
  const { error } = await supabase
    .from('territorios_responsables')
    .update({ vigente_hasta: vigente_hasta ?? new Date().toISOString().slice(0, 10) })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
