import { getServerUser } from '@/lib/auth'
import { redirect } from 'next/navigation'

export default async function VentasAdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getServerUser()
  if (!user) redirect('/login')
  if (!user.isAdmin) redirect('/ventas')

  return <>{children}</>
}
