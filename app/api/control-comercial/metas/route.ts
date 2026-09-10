import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getServerUser } from '@/lib/auth'
import { puedeVerControlComercial } from '@/lib/control-comercial/permisos'

export const dynamic = 'force-dynamic'

const KPI_TYPES = new Set([
  'ventas_clp', 'litros_total', 'litros_cerveza', 'litros_kombucha',
  'nuevos_clientes', 'reactivaciones', 'cobranza_recuperada',
  'cuentas_regularizadas', 'barriles_recuperados',
])
const SCOPE_TYPES = new Set(['compania', 'territorio', 'vendedor'])

export async function GET(req: NextRequest) {
  const user = await getServerUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!puedeVerControlComercial(user)) return NextResponse.json({ error: 'Sin acceso a Control Comercial' }, { status: 403 })

  const periodoId = req.nextUrl.searchParams.get('periodo_id')
  if (!periodoId) return NextResponse.json({ error: 'Falta periodo_id' }, { status: 400 })

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('metas_comerciales')
    .select('id, periodo_id, scope_type, scope_value, kpi_type, valor_meta')
    .eq('periodo_id', periodoId)
    .order('scope_type')
    .order('scope_value')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const user = await getServerUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!puedeVerControlComercial(user)) return NextResponse.json({ error: 'Sin acceso a Control Comercial' }, { status: 403 })

  const body = await req.json()
  const { periodo_id, scope_type, scope_value, kpi_type, valor_meta } = body ?? {}

  if (!periodo_id || !SCOPE_TYPES.has(scope_type) || !KPI_TYPES.has(kpi_type) || typeof valor_meta !== 'number') {
    return NextResponse.json({ error: 'Datos de meta inválidos' }, { status: 400 })
  }
  if (scope_type !== 'compania' && !scope_value) {
    return NextResponse.json({ error: 'scope_value es obligatorio salvo para scope_type=compania' }, { status: 400 })
  }

  // user.id es 'demo' (no un uuid real) mientras LOGIN_DESACTIVADO_TEMPORAL esté activo —
  // created_by es nullable, así que se omite en vez de romper el insert.
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  const createdBy = UUID_RE.test(user.id) ? user.id : null

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('metas_comerciales')
    .upsert(
      { periodo_id, scope_type, scope_value: scope_type === 'compania' ? null : scope_value, kpi_type, valor_meta, created_by: createdBy, updated_at: new Date().toISOString() },
      { onConflict: 'periodo_id,scope_type,scope_value,kpi_type' },
    )
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const user = await getServerUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!puedeVerControlComercial(user)) return NextResponse.json({ error: 'Sin acceso a Control Comercial' }, { status: 403 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })

  const supabase = await createClient()
  const { error } = await supabase.from('metas_comerciales').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
