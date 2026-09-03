import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getServerUser } from '@/lib/auth'
import { puedeVerControlComercial } from '@/lib/control-comercial/permisos'

export const dynamic = 'force-dynamic'

/** Períodos comerciales (24→23) recientes + próximos, para selectores de Metas/Configuración. */
export async function GET() {
  const user = await getServerUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!puedeVerControlComercial(user)) return NextResponse.json({ error: 'Sin acceso a Control Comercial' }, { status: 403 })

  const supabase = await createClient()
  const hoy = new Date().toISOString().slice(0, 10)
  const desde = new Date()
  desde.setMonth(desde.getMonth() - 13)

  const { data, error } = await supabase
    .from('periodos')
    .select('id, nombre, fecha_inicio, fecha_fin, activo')
    .gte('fecha_fin', desde.toISOString().slice(0, 10))
    .order('fecha_inicio', { ascending: false })
    .limit(24)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ periodos: data ?? [], hoy })
}
