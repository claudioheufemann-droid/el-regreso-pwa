import { getServerUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import LeadsClient from './LeadsClient'

export default async function LeadsPage() {
  const user = await getServerUser()
  if (!user) redirect('/login')
  return <LeadsClient isAdmin={user.isAdmin} />
}
