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
      {/* Sin overflow-y-auto/min-h-screen acá — mismo fix que
          app/ventas/layout.tsx, app/logistica/layout.tsx y
          app/flota/layout.tsx: un <main> con su propio contenedor de
          scroll anidado impide scrollear. overflow-x-clip, NO
          overflow-x-hidden: 'hidden' fuerza el otro eje a 'auto' y
          reintroduce el mismo contenedor anidado. */}
      <main className="flex-1 min-w-0 flex flex-col overflow-x-clip pb-28 lg:pb-0 mobile-safe-top">
        {children}
      </main>
      <div className="lg:hidden">
        <TerrenoBottomNav />
      </div>
    </div>
  )
}
