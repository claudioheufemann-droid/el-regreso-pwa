import { redirect } from 'next/navigation'
import { getServerUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import HubClient from '@/components/ui/HubClient'

export const dynamic = 'force-dynamic'

export default async function HubPage() {
  // getServerUser() (no una consulta de auth propia acá): ya trae el
  // reintento ante blips de red y el fallback por email para Google — antes
  // esta página duplicaba la lógica sin ninguno de los dos, era otro punto
  // donde un usuario real podía terminar rebotado a /login.
  const user = await getServerUser()
  if (!user) redirect('/login')

  const resumenEjecutivo = user.isAdmin ? await cargarResumenEjecutivo() : null

  return <HubClient isAdmin={user.isAdmin} nombre={user.nombre} macroArea={user.macroArea} resumenEjecutivo={resumenEjecutivo} />
}

/**
 * "Atención requerida" del Home — antes el hub de administrador/gerencia
 * era un puro selector de módulos, sin ningún número: había que entrar a
 * Gestión, a Clientes y a Deudores por separado sólo para saber si algo
 * necesitaba atención hoy. Son 3 conteos/sumas baratos (COUNT y una suma
 * de una sola columna), no listas — no repite el anti-patrón de mandar
 * cientos de filas que se corrigió en el resto de la app esta sesión.
 */
export interface ResumenEjecutivo {
  tareasAtrasadas: number
  clientesEnRiesgo: number
  deudaVencida: number
}

async function cargarResumenEjecutivo(): Promise<ResumenEjecutivo> {
  const supabase = await createClient()

  const [{ count: tareasAtrasadas }, { count: clientesEnRiesgo }, { data: deudas }] = await Promise.all([
    supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('estado', 'Atrasada'),
    supabase.from('client_scores').select('nombre_fantasia', { count: 'exact', head: true }).in('alert_level', ['critico', 'vencido']),
    supabase.from('deudores').select('deuda_vencida').gt('deuda_vencida', 0),
  ])

  const deudaVencida = (deudas ?? []).reduce((s, d) => s + (d.deuda_vencida ?? 0), 0)

  return {
    tareasAtrasadas: tareasAtrasadas ?? 0,
    clientesEnRiesgo: clientesEnRiesgo ?? 0,
    deudaVencida,
  }
}
