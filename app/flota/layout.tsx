import FlotaSidebar from '@/components/FlotaSidebar'
import FlotaBottomNav from '@/components/FlotaBottomNav'
import PageTabs from '@/components/PageTabs'
import type { PageTab } from '@/components/PageTabs'

const TABS: PageTab[] = [
  { href: '/flota',         label: 'Vehículos',    exact: true  },
  { href: '/flota/checkin', label: 'Nueva Salida'              },
  { href: '/flota/rutas',   label: 'Rutas'                     },
  { href: '/flota/admin',   label: 'Reportes'                  },
]

const ORANGE = '#F97316'

export default function FlotaLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex" style={{ background: 'var(--bg)' }}>
      <div className="hidden lg:flex">
        <FlotaSidebar />
      </div>
      <main className="flex-1 flex flex-col min-h-screen overflow-y-auto pb-24 lg:pb-0">
        <PageTabs tabs={TABS} accent={ORANGE} />
        {children}
      </main>
      <div className="lg:hidden">
        <FlotaBottomNav />
      </div>
    </div>
  )
}
