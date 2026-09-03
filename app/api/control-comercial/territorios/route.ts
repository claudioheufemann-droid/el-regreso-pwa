import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getServerUser } from '@/lib/auth'
import { puedeVerControlComercial } from '@/lib/control-comercial/permisos'

export const dynamic = 'force-dynamic'

/** Territorios/canales vigentes hoy — para poblar el filtro global (spec §8). Administrable, no hardcodeado. */
export async function GET() {
  const user = await getServerUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!puedeVerControlComercial(user)) return NextResponse.json({ error: 'Sin acceso a Control Comercial' }, { status: 403 })

  const supabase = await createClient()
  const hoy = new Date().toISOString().slice(0, 10)
  const { data, error } = await supabase
    .from('territorios_responsables')
    .select('territorio, tipo, responsable, vigente_desde, vigente_hasta')
    .lte('vigente_desde', hoy)
    .or(`vigente_hasta.is.null,vigente_hasta.gte.${hoy}`)
    .order('tipo')
    .order('territorio')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
