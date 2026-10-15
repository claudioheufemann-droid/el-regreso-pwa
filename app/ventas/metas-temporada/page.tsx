import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getServerUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { TEMPORADA, normalizarFila, type FilaVista } from './tipos'
import MetasTemporadaClient from './MetasTemporadaClient'

export const dynamic = 'force-dynamic'

export default async function MetasTemporadaPage() {
  const user = await getServerUser()
  if (!user) redirect('/login')

  // Cliente de SESIÓN (no service-role): el scope lo pone la RLS de
  // plan_metas_semanales — vendedor = sus filas, admin = todas.
  const supabase = await createClient()
  let query = supabase
    .from('plan_metas_avance')
    .select('*')
    .eq('temporada', TEMPORADA)
    .order('territorio')
    .order('semana')

  // "Ver como vendedor": la sesión sigue siendo la del admin, así que la RLS
  // devolvería las cuatro carteras. Se acota al vendedor simulado para que la
  // pantalla sea exactamente la que él/ella ve.
  if (user.impersonando) {
    const impersonadoId = (await cookies()).get('impersonar_vendedor')?.value
    if (impersonadoId) query = query.eq('user_id', impersonadoId)
  }

  const { data, error } = await query

  // Fecha de hoy en Chile, calculada una sola vez en el servidor para que el
  // render del cliente no dependa de la zona horaria del teléfono.
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date())

  return (
    <MetasTemporadaClient
      filas={(data ?? []).map(r => normalizarFila(r as FilaVista))}
      esAdmin={user.isAdmin}
      hoy={hoy}
      error={error ? error.message : null}
    />
  )
}
