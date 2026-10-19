import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getServerUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { TEMPORADA, normalizarFila, normalizarPeriodo, type FilaVista } from './tipos'
import MetasTemporadaClient from './MetasTemporadaClient'

export const dynamic = 'force-dynamic'

export default async function MetasTemporadaPage() {
  const user = await getServerUser()
  if (!user) redirect('/login')

  // Cliente de SESIÓN (no service-role): el scope lo pone la RLS de
  // plan_metas_semanales — vendedor = sus filas, admin = todas.
  const supabase = await createClient()
  // "Ver como vendedor": la sesión sigue siendo la del admin, así que la RLS
  // devolvería las cuatro carteras. Se acota al vendedor simulado para que la
  // pantalla sea exactamente la que él/ella ve.
  const impersonadoId = user.impersonando ? (await cookies()).get('impersonar_vendedor')?.value : undefined

  // Semanas del plan y su suma por período comercial 24→23 (vista hermana,
  // misma RLS). Se piden juntas: el selector cambia de escala sin recargar.
  let semanal = supabase.from('plan_metas_avance').select('*').eq('temporada', TEMPORADA).order('territorio').order('semana')
  let mensual = supabase.from('plan_metas_periodo_avance').select('*').eq('temporada', TEMPORADA).order('territorio').order('periodo')
  if (impersonadoId) {
    semanal = semanal.eq('user_id', impersonadoId)
    mensual = mensual.eq('user_id', impersonadoId)
  }
  const [{ data, error }, { data: dataPeriodos }] = await Promise.all([semanal, mensual])

  // Fecha de hoy en Chile, calculada una sola vez en el servidor para que el
  // render del cliente no dependa de la zona horaria del teléfono.
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date())

  return (
    <MetasTemporadaClient
      filas={(data ?? []).map(r => normalizarFila(r as FilaVista))}
      periodos={(dataPeriodos ?? []).map(r => normalizarPeriodo(r as FilaVista))}
      esAdmin={user.isAdmin}
      hoy={hoy}
      error={error ? error.message : null}
    />
  )
}
