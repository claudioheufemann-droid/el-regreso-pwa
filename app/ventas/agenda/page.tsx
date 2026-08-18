import { createClient } from '@/lib/supabase/server'
import { getServerUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import AgendaClient from './AgendaClient'

export const dynamic = 'force-dynamic'

export default async function AgendaPage() {
  const user = await getServerUser()
  if (!user) redirect('/login')

  const supabase = await createClient()

  // La agenda es PERSONAL: cada usuario ve únicamente sus propios compromisos,
  // sin importar si es admin. Para revisar el equipo está el panel de CRM/efectividad.
  const { data: seguimientos } = await supabase
    .from('seguimientos')
    .select('id, visita_id, vendedor_id, cliente_nombre, tipo_accion, fecha_hora_compromiso, nota, estado, realizado_at, created_at')
    .eq('vendedor_id', user.id)
    .order('fecha_hora_compromiso', { ascending: true, nullsFirst: false })
    .limit(500)

  const clienteNombres = [...new Set((seguimientos ?? []).map(s => s.cliente_nombre).filter(Boolean))]

  const { data: clientes } = clienteNombres.length
    ? await supabase.from('clientes').select('nombre_fantasia, telefono, email').in('nombre_fantasia', clienteNombres)
    : { data: [] }

  return (
    <AgendaClient
      user={user}
      seguimientos={seguimientos ?? []}
      clientes={clientes ?? []}
    />
  )
}
