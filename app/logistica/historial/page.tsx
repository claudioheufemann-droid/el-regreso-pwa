import { getServerUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import HistorialClient from './HistorialClient'

export const dynamic = 'force-dynamic'

export default async function HistorialPage() {
  const user = await getServerUser()
  if (!user) redirect('/login')
  return <HistorialClient user={user} />
}
