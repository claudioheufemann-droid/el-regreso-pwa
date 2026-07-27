import { getServerUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import BottomNav from '@/components/BottomNav'
import PageTabs from '@/components/PageTabs'
import type { PageTab } from '@/components/PageTabs'

const TABS: PageTab[] = [
  { href: '/ventas',                      label: 'Hoy',      exact: true  },
  { href: '/ventas/agenda',               label: 'Agenda'                 },
  { href: '/ventas/acumulado',            label: 'Período'                },
  { href: '/ventas/clientes',             label: 'Clientes'               },
  { href: '/ventas/leads',                label: 'Leads'                  },
  { href: '/ventas/misiones',             label: 'Misiones'               },
  { href: '/ventas/ranking',              label: 'Ranking'                },
  { href: '/ventas/actividad',            label: 'Actividad'              },
  { href: '/ventas/mapa',                 label: 'Mapa'                   },
  { href: '/ventas/metas',                label: 'Metas'                  },
  { href: '/ventas/admin',                label: 'Admin',    adminOnly: true },
  { href: '/ventas/admin/reportes',       label: 'Reportes', adminOnly: true },
  { href: '/ventas/admin/rutas-clientes', label: 'Rutas',    adminOnly: true },
]

export default async function VentasLayout({ children }: { children: React.ReactNode }) {
  const user = await getServerUser()
  if (!user) redirect('/login')

  return (
    <div className="min-h-screen flex" style={{ background: 'var(--bg)' }}>
      <div className="hidden lg:flex">
        <Sidebar />
      </div>
      <main className="flex-1 min-w-0 flex flex-col min-h-screen overflow-y-auto overflow-x-hidden pb-24 lg:pb-0 mobile-safe-top">
        <div className="hidden lg:block">
          <PageTabs tabs={TABS} />
        </div>
        {children}
      </main>
      <div className="lg:hidden">
        <BottomNav />
      </div>
    </div>
  )
}
