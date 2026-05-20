import { getServerUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import TerrenoSidebar from '@/components/TerrenoSidebar'
import TerrenoBottomNav from '@/components/TerrenoBottomNav'

export default async function TerrenoLayout({ children }: { children: React.ReactNode }) {
  const user = await getServerUser()
  if (!user) redirect('/login')

  return (
    <div className="min-h-screen flex" style={{ background: 'var(--bg)' }}>
      <div className="hidden lg:flex">
        <TerrenoSidebar />
      </div>
      <main className="flex-1 flex flex-col min-h-screen overflow-y-auto pb-24 lg:pb-0">
        {children}
      </main>
      <div className="lg:hidden">
        <TerrenoBottomNav />
      </div>
    </div>
  )
}
