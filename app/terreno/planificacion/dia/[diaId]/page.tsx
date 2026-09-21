import { createClient } from '@/lib/supabase/server'
import { getServerUser } from '@/lib/auth'
import { redirect, notFound } from 'next/navigation'
import DiaClient from './DiaClient'
import { politicaVigente, politicaPorId } from '@/lib/terreno/planificacion/politicaVigente'

export const dynamic = 'force-dynamic'

export default async function DiaPage({ params }: { params: Promise<{ diaId: string }> }) {
  const { diaId } = await params
  const user = await getServerUser()
  if (!user) redirect('/login')

  const supabase = await createClient()

  const { data: dia } = await supabase.from('plan_dias_terreno').select('*').eq('id', diaId).maybeSingle()
  if (!dia) notFound()

  const { data: plan } = await supabase.from('planes_semanales_terreno').select('*').eq('id', dia.plan_id).maybeSingle()
  if (!plan) notFound()
  if (plan.vendedor_id !== user.id) redirect('/terreno/planificacion')

  const { data: paradas } = await supabase
    .from('plan_paradas_terreno')
    .select('*')
    .eq('plan_dia_id', diaId)
    .order('orden', { ascending: true })

  interface ClienteFila { id: number; nombre_fantasia: string; direccion: string | null; localidad: string | null; lat: number | null; lng: number | null }
  interface ClienteTerrenoFila { id: string; nombre_fantasia: string; direccion: string | null; lat: number | null; lng: number | null }

  const clienteIds = (paradas ?? []).filter(p => p.cliente_id != null).map(p => p.cliente_id)
  const clienteTerrenoIds = (paradas ?? []).filter(p => p.cliente_terreno_id != null).map(p => p.cliente_terreno_id)

  const [{ data: clientes }, { data: clientesTerreno }] = await Promise.all([
    clienteIds.length
      ? supabase.from('clientes').select('id, nombre_fantasia, direccion, localidad, lat, lng').in('id', clienteIds)
      : Promise.resolve({ data: [] as ClienteFila[] }),
    clienteTerrenoIds.length
      ? supabase.from('clientes_terreno').select('id, nombre_fantasia, direccion, lat, lng').in('id', clienteTerrenoIds)
      : Promise.resolve({ data: [] as ClienteTerrenoFila[] }),
  ])

  const nombrePorCliente = new Map((clientes ?? []).map(c => [c.id, {
    nombre: c.nombre_fantasia as string,
    direccion: [c.direccion, c.localidad].filter(Boolean).join(', '),
    lat: c.lat as number | null, lng: c.lng as number | null,
  }]))
  const nombrePorClienteTerreno = new Map((clientesTerreno ?? []).map(c => [c.id, {
    nombre: c.nombre_fantasia as string, direccion: c.direccion as string | null,
    lat: c.lat as number | null, lng: c.lng as number | null,
  }]))

  const paradasConNombre = (paradas ?? []).map(p => {
    const info = p.cliente_id != null ? nombrePorCliente.get(p.cliente_id) : nombrePorClienteTerreno.get(p.cliente_terreno_id)
    return {
      ...p,
      nombreCliente: info?.nombre ?? '(cliente eliminado)',
      direccionCliente: info?.direccion ?? null,
      lat: info?.lat ?? null,
      lng: info?.lng ?? null,
    }
  })

  const fechaAnterior = (() => {
    const [Y, M, D] = (dia.fecha as string).split('-').map(Number)
    return new Date(Date.UTC(Y, M - 1, D - 1)).toISOString().slice(0, 10)
  })()
  const { data: diaAnterior } = await supabase
    .from('plan_dias_terreno').select('pernocta').eq('plan_id', dia.plan_id).eq('fecha', fechaAnterior).maybeSingle()
  const durmioFueraNocheAnterior = !!diaAnterior?.pernocta

  const { data: rutaVigente } = await supabase
    .from('plan_ruta_calculos_terreno')
    .select('*')
    .eq('plan_dia_id', diaId)
    .eq('vigente', true)
    .maybeSingle()

  const politica = plan.politica_gastos_id ? await politicaPorId(supabase, plan.politica_gastos_id) : await politicaVigente(supabase, plan.semana_lunes)

  return (
    <DiaClient
      dia={dia}
      plan={plan}
      paradasIniciales={paradasConNombre}
      rutaVigente={rutaVigente}
      politica={politica}
      editable={['borrador', 'devuelto'].includes(plan.estado_plan)}
      durmioFueraNocheAnterior={durmioFueraNocheAnterior}
      userId={user.id}
    />
  )
}
