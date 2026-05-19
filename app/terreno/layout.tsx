import { getServerUser } from '@/lib/auth'
import { redirect } from 'next/navigation'

export default async function TerrenoLayout({ children }: { children: React.ReactNode }) {
  const user = await getServerUser()
  if (!user) redirect('/login')
  return <>{children}</>
}
