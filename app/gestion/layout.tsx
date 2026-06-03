import { getServerUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import GestionBottomNav from '@/components/GestionBottomNav'

export default async function GestionLayout({ children }: { children: React.ReactNode }) {
  const user = await getServerUser()
  if (!user) redirect('/login')
  if (!user.isAdmin) redirect('/ventas')

  return (
    <>
      {children}
      <GestionBottomNav />
    </>
  )
}
