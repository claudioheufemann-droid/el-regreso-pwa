import { getServerUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import EntregasAdminClient from './EntregasAdminClient'

export const dynamic = 'force-dynamic'

export default async function EntregasAdminPage() {
  const user = await getServerUser()
  if (!user) redirect('/login')
  if (!user.isAdmin) redirect('/flota')

  return <EntregasAdminClient />
}
