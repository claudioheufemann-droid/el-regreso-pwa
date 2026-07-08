import { getServerUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import LogisticaSidebar from '@/components/LogisticaSidebar'
import LogisticaBottomNav from '@/components/LogisticaBottomNav'

export default async function LogisticaLayout({ children }: { children: React.ReactNode }) {
  // Acceso: admin, Logística (Matías) o Producción (declara los lotes que Logística recibe).
  const user = await getServerUser()
  if (!user) redirect('/login')
  const permitido = user.isAdmin || user.macroArea === 'logistica' || user.macroArea === 'produccion'
  if (!permitido) redirect('/')

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
