import { getServerUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import AppContent from '@/components/AppContent'

export default async function VentasLayout({ children }: { children: React.ReactNode }) {
  const user = await getServerUser()
  if (!user) redirect('/login')

  return <AppContent>{children}</AppContent>
}
