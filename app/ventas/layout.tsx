import { getServerUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import BottomNav from '@/components/BottomNav'
import PageTabs from '@/components/PageTabs'
import type { PageTab } from '@/components/PageTabs'

const TABS: PageTab[] = [
  { href: '/ventas',                label: 'Hoy',      exact: true  },
  { href: '/ventas/acumulado',      label: 'Período'                },
  { href: '/ventas/clientes',       label: 'Clientes'               },
  { href: '/ventas/mapa',           label: 'Mapa'                   },
  { href: '/ventas/metas',          label: 'Metas'                  },
  { href: '/ventas/admin/cargar',   label: 'Cargar',   adminOnly: true },
  { href: '/ventas/admin/reportes', label: 'Reportes', adminOnly: true },
]

export default async function VentasLayout({ children }: { children: React.ReactNode }) {
  const user = await getServerUser()
  if (!user) redirect('/login')

  return (
    <div className="min-h-screen flex" style={{ background: 'var(--bg)' }}>
      <div className="hidden lg:flex">
        <Sidebar />
      </div>
      <main className="flex-1 flex flex-col min-h-screen overflow-y-auto pb-24 lg:pb-0">
        <PageTabs tabs={TABS} />
        {children}
      </main>
      <div className="lg:hidden">
        <BottomNav />
      </div>
    </div>
  )
}
