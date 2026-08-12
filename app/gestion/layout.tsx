import { getServerUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import GestionSidebar from '@/components/GestionSidebar'
import GestionBottomNav from '@/components/GestionBottomNav'

export default async function GestionLayout({ children }: { children: React.ReactNode }) {
  const user = await getServerUser()
  if (!user) redirect('/login')
  // Gestión accesible para vendedores y admin (módulo habilitado para el rol vendedor)

  return (
    <div className="min-h-screen flex" style={{ background: 'var(--bg)' }}>
      <div className="hidden lg:flex">
        <GestionSidebar />
      </div>
      {/* Sin overflow-y-auto/min-h-screen acá — mismo fix que
          app/ventas/layout.tsx, app/logistica/layout.tsx,
          app/flota/layout.tsx y app/terreno/layout.tsx: un <main> con su
          propio contenedor de scroll anidado impide scrollear.
          overflow-x-clip, NO overflow-x-hidden: 'hidden' fuerza el otro
          eje (overflow-y) a 'auto' automáticamente y reintroduce el mismo
          contenedor anidado — que era exactamente el problema acá, con
          los dos ejes puestos a mano. */}
      <main className="flex-1 min-w-0 flex flex-col overflow-x-clip pb-24 lg:pb-0 mobile-safe-top">
        {children}
      </main>
      <div className="lg:hidden">
        <GestionBottomNav />
      </div>
    </div>
  )
}
