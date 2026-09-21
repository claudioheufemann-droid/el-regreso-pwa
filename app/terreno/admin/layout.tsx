import { getServerUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AdminShell from './AdminShell'

export const dynamic = 'force-dynamic'

export default async function TerrenoAdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getServerUser()
  if (!user) redirect('/login')
  if (!user.isAdmin) redirect('/terreno')

  const supabase = await createClient()
  const { count } = await supabase
    .from('visitas_terreno')
    .select('id', { count: 'exact', head: true })
    .eq('estado_presencia', 'pendiente_revision')

  return (
    <AdminShell nombre={user.nombre} email={user.email} avatarUrl={user.avatarUrl} pendientesRevision={count ?? 0}>
      {children}
    </AdminShell>
  )
}
