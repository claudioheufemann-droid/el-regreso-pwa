import { createClient } from '@/lib/supabase/server'
import { getServerUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import AgendaClient from './AgendaClient'

export const dynamic = 'force-dynamic'

export default async function AgendaPage() {
  const user = await getServerUser()
  if (!user) redirect('/login')

  const supabase = await createClient()

  let query = supabase
    .from('seguimientos')
    .select('id, visita_id, vendedor_id, cliente_nombre, tipo_accion, fecha_hora_compromiso, nota, estado, realizado_at, created_at')
    .order('fecha_hora_compromiso', { ascending: true, nullsFirst: false })
    .limit(500)

  if (!user.isAdmin) query = query.eq('vendedor_id', user.id)

  const { data: seguimientos } = await query

  const clienteNombres = [...new Set((seguimientos ?? []).map(s => s.cliente_nombre).filter(Boolean))]

  const [vendedoresRes, clientesRes] = await Promise.all([
    user.isAdmin
      ? supabase.from('users').select('id, nombre').order('nombre')
      : Promise.resolve({ data: [] }),
    clienteNombres.length
      ? supabase.from('clientes').select('nombre_fantasia, telefono, email').in('nombre_fantasia', clienteNombres)
      : Promise.resolve({ data: [] }),
  ])

  return (
    <AgendaClient
      user={user}
      seguimientos={seguimientos ?? []}
      vendedores={vendedoresRes.data ?? []}
      clientes={clientesRes.data ?? []}
    />
  )
}
