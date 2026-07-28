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
    <div className="h-dvh flex" style={{ background: 'var(--bg)' }}>
      <div className="hidden lg:flex">
        <FlotaSidebar />
      </div>
      {/* h-full (no min-h-screen): el padre ahora tiene una altura ACOTADA
          (h-dvh), así este <main> se recorta a esa altura y overflow-y-auto
          scrollea de verdad su propio contenido, en vez de delegar al
          documento (html/body) — que es la causa real reportada de que la
          pantalla de Flota no permitía hacer scroll. */}
      <main className="flex-1 flex flex-col h-full overflow-y-auto pb-32 lg:pb-0 mobile-safe-top">
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
