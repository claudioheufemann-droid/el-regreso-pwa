import { getServerUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import FlotaSidebar from '@/components/FlotaSidebar'
import FlotaBottomNav from '@/components/FlotaBottomNav'

export default async function FlotaLayout({ children }: { children: React.ReactNode }) {
  // Acceso total para cualquier trabajador autenticado, sin importar su área.
  const user = await getServerUser()
  if (!user) redirect('/login')

  return (
    <div className="min-h-screen flex" style={{ background: 'var(--bg)' }}>
      <div className="hidden lg:flex">
        <FlotaSidebar />
      </div>
      {/* Sin overflow-y-auto/min-h-screen acá — mismo fix que
          app/ventas/layout.tsx y app/logistica/layout.tsx: un <main> con
          su propio contenedor de scroll anidado impide scrollear (incluso
          en desktop, con Sidebar+TabBar propios). overflow-x-clip, NO
          overflow-x-hidden: 'hidden' fuerza el otro eje a 'auto' y
          reintroduce el mismo contenedor anidado. */}
      <main className="flex-1 min-w-0 flex flex-col overflow-x-clip pb-32 lg:pb-0 mobile-safe-top">
        {children}
      </main>
      <div className="lg:hidden">
        <FlotaBottomNav />
      </div>
    </div>
  )
}
