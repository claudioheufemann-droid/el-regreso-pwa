import { getServerUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import LogisticaSidebar from '@/components/LogisticaSidebar'
import LogisticaBottomNav from '@/components/LogisticaBottomNav'

export default async function LogisticaLayout({ children }: { children: React.ReactNode }) {
  // Acceso total para cualquier trabajador autenticado, sin importar su área.
  const user = await getServerUser()
  if (!user) redirect('/login')

  return (
    <div className="min-h-screen flex" style={{ background: 'var(--bg)' }}>
      <div className="hidden lg:flex">
        <LogisticaSidebar />
      </div>
      <main className="flex-1 flex flex-col min-h-screen overflow-y-auto pb-32 lg:pb-0 mobile-safe-top">
        {children}
      </main>
      <div className="lg:hidden">
        <LogisticaBottomNav />
      </div>
    </div>
  )
}
