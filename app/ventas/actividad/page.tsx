import { createClient } from '@/lib/supabase/server'
import { getServerUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import ActividadClient from './ActividadClient'

export const dynamic = 'force-dynamic'

export interface EventoActividad {
  tipo: 'visita' | 'venta' | 'mision' | 'viaje'
  ts: string
  titulo: string
  subtitulo: string
  monto: number | null
  estado: string
}

export default async function ActividadPage() {
  const user = await getServerUser()
  if (!user) redirect('/login')

  const supabase = await createClient()

  // RPC SECURITY INVOKER: respeta RLS — vendedor ve su región, admin ve todo.
  const { data: rpcRows } = await supabase.rpc('actividad_reciente', { p_dias: 14 })
  const eventos: EventoActividad[] = (rpcRows ?? []) as EventoActividad[]

  // Flota (viajes) es admin-only por diseño — se trae aparte, nunca para vendedor.
  if (user.isAdmin) {
    const { data: viajes } = await supabase
      .from('viajes_flota')
      .select('iniciado_at, completado_at, estado, tipo, motivo, destino_declarado, vehiculo:vehiculos(nombre)')
      .gte('iniciado_at', new Date(Date.now() - 14 * 86400000).toISOString())
      .order('iniciado_at', { ascending: false })
      .limit(100)

    for (const v of viajes ?? []) {
      const vehiculoRaw = v.vehiculo as unknown
      const vehiculoNombre = (Array.isArray(vehiculoRaw) ? vehiculoRaw[0]?.nombre : (vehiculoRaw as { nombre?: string } | null)?.nombre) ?? 'Vehículo'
      eventos.push({
        tipo: 'viaje',
        ts: v.iniciado_at,
        titulo: vehiculoNombre,
        subtitulo: v.estado === 'completado'
          ? 'Viaje completado'
          : `En curso · ${v.tipo === 'reparto' ? 'Reparto' : v.motivo ?? 'Viaje'}`,
        monto: null,
        estado: v.estado,
      })
    }
    eventos.sort((a, b) => b.ts.localeCompare(a.ts))
  }

  return <ActividadClient eventos={eventos} isAdmin={user.isAdmin} />
}
