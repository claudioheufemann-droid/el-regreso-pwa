import { createClient } from '@/lib/supabase/server'
import { getServerUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { semanaLunes, semanaSiguienteLunes } from '@/lib/terreno/planificacion/semana'
import { hoySantiagoISO } from '@/lib/terreno/tiempoChile'
import PlanificacionAdminClient from './PlanificacionAdminClient'

export const dynamic = 'force-dynamic'

// GET /terreno/admin/planificacion?semana=YYYY-MM-DD — Control semanal: vendedores con
// plan esa semana, seleccionable, con acciones de aprobación/fondo/rendición según el
// permiso de quien mira (Claudio aprueba, Mariel paga — independientes).
export default async function PlanificacionAdminPage({ searchParams }: { searchParams: Promise<{ semana?: string; vendedor?: string }> }) {
  const user = await getServerUser()
  if (!user) redirect('/login')
  if (!user.isAdmin && !user.puedeAprobarPlanificacionTerreno && !user.puedePagarPlanificacionTerreno) redirect('/terreno')

  const { semana: semanaParam, vendedor: vendedorParam } = await searchParams
  const semana = semanaParam && semanaParam === semanaLunes(semanaParam) ? semanaParam : semanaSiguienteLunes(hoySantiagoISO())

  const supabase = await createClient()

  const { data: planes } = await supabase
    .from('planes_semanales_terreno')
    .select('*')
    .eq('semana_lunes', semana)
    .order('created_at', { ascending: true })

  const vendedorIds = Array.from(new Set((planes ?? []).map(p => p.vendedor_id)))
  const { data: vendedoresUsers } = vendedorIds.length
    ? await supabase.from('users').select('id, nombre, iniciales').in('id', vendedorIds)
    : { data: [] }

  // También los vendedores activos SIN plan esta semana, para poder verlos igual
  // ("Equipo" siempre visible, no sólo el que ya envió") — mismo criterio que
  // ResumenClient.tsx del resto de Terreno.
  const { data: todosVendedores } = await supabase
    .from('users').select('id, nombre, iniciales').eq('area', 'Comercial').eq('is_admin', false)

  const nombreDeUsuario = new Map([...(vendedoresUsers ?? []), ...(todosVendedores ?? [])].map(u => [u.id, { nombre: u.nombre as string, iniciales: u.iniciales as string }]))
  const planPorVendedor = new Map((planes ?? []).map(p => [p.vendedor_id, p]))

  const vendedores = Array.from(new Set([...(todosVendedores ?? []).map(u => u.id), ...vendedorIds]))
    .map(id => ({
      id,
      nombre: nombreDeUsuario.get(id)?.nombre ?? '(vendedor)',
      iniciales: nombreDeUsuario.get(id)?.iniciales ?? '',
      plan: planPorVendedor.get(id) ?? null,
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre))

  const vendedorSeleccionado = vendedorParam && vendedores.some(v => v.id === vendedorParam)
    ? vendedorParam
    : vendedores.find(v => v.plan)?.id ?? vendedores[0]?.id ?? null

  return (
    <PlanificacionAdminClient
      semana={semana}
      vendedores={vendedores}
      vendedorSeleccionadoId={vendedorSeleccionado}
      puedeAprobar={user.puedeAprobarPlanificacionTerreno}
      puedePagar={user.puedePagarPlanificacionTerreno}
    />
  )
}
