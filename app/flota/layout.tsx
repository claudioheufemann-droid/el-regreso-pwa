import { getServerUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import FlotaSidebar from '@/components/FlotaSidebar'
import FlotaBottomNav from '@/components/FlotaBottomNav'
import FlotaTabBar from '@/components/FlotaTabBar'
import type { PageTab } from '@/components/PageTabs'

const TABS: PageTab[] = [
  { href: '/flota',           label: 'Vehículos',    exact: true  },
  { href: '/flota/checkin',   label: 'Nueva Salida'              },
  { href: '/flota/despachos', label: 'Despachos'                 },
  { href: '/flota/historial', label: 'Historial'                 },
  { href: '/flota/kpis',      label: 'KPIs'                      },
  { href: '/flota/admin',     label: 'Reportes'                  },
]

const ORANGE = '#D4AF37'

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
        <div className="hidden lg:block">
          <FlotaTabBar tabs={TABS} accent={ORANGE} />
        </div>
        {children}
      </main>
      <div className="lg:hidden">
        <FlotaBottomNav />
      </div>
    </div>
  )
}
