import { getServerUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import JornadaClient from './JornadaClient'

export const dynamic = 'force-dynamic'

export default async function JornadaPage() {
  const user = await getServerUser()
  if (!user) redirect('/login')
  return <JornadaClient vendedorId={user.id} />
}
