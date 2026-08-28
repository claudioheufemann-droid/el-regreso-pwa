import { redirect } from 'next/navigation'
import { getServerUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { puedeVerComisionesEquipo } from '@/lib/comisiones'
import { periodoActual } from '@/lib/periodos'
import ComisionesClient, { type PeriodoLigero } from './ComisionesClient'

export const dynamic = 'force-dynamic'

export default async function ComisionesPage() {
  const user = await getServerUser()
  if (!user) redirect('/login')
  // Acceso puntual, aparte de Rentabilidad — es remuneración de personas, no
  // un KPI del equipo. Si no tiene el permiso, ni siquiera debe saber que
  // esta ruta existe, así que se manda directo al Hub. Ver lib/comisiones.ts.
  if (!puedeVerComisionesEquipo(user)) redirect('/ventas')

  const periodo = periodoActual()

  // Todos los períodos de venta 24→23 que existen hasta hoy, para el
  // selector — mismo criterio que el selector de /ventas (hoyData.ts). Cada
  // tarjeta (MiComision / MiComisionVendedor) pide sus propios datos al
  // cambiar de período, así que acá sólo hace falta la lista liviana.
  const supabase = await createClient()
  const hoyIso = new Date().toISOString().slice(0, 10)
  const { data: periodosRaw } = await supabase
    .from('periodos')
    .select('id, nombre, fecha_inicio, fecha_fin, activo')
    .lte('fecha_inicio', hoyIso)
    .order('fecha_inicio', { ascending: false })

  const periodosDisponibles: PeriodoLigero[] = ((periodosRaw ?? []) as {
    id: number; nombre: string; fecha_inicio: string; fecha_fin: string; activo: boolean
  }[]).map(p => ({ id: p.id, nombre: p.nombre, inicio: p.fecha_inicio, fin: p.fecha_fin, activo: p.activo }))

  return (
    <ComisionesClient
      user={user}
      periodoInicial={{ desde: periodo.inicio, hasta: periodo.fin, nombre: periodo.nombre }}
      periodosDisponibles={periodosDisponibles}
    />
  )
}
