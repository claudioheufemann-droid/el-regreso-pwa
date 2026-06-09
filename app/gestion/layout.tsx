import { getServerUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import GestionSidebar from '@/components/GestionSidebar'
import GestionBottomNav from '@/components/GestionBottomNav'
import PageTabs from '@/components/PageTabs'
import type { PageTab } from '@/components/PageTabs'

const TABS: PageTab[] = [
  { href: '/gestion',                label: 'Hub',           exact: true },
  { href: '/gestion/comercial',      label: 'Comercial'                  },
  { href: '/gestion/administracion', label: 'Administración'              },
  { href: '/gestion/produccion',     label: 'Producción'                  },
]

export default async function GestionLayout({ children }: { children: React.ReactNode }) {
  const user = await getServerUser()
  if (!user) redirect('/login')
  if (!user.isAdmin) redirect('/ventas')

  return (
    <div className="min-h-screen flex" style={{ background: 'var(--bg)' }}>
      <div className="hidden lg:flex">
        <GestionSidebar />
      </div>
      <main className="flex-1 min-w-0 flex flex-col min-h-screen overflow-y-auto overflow-x-hidden pb-24 lg:pb-0 mobile-safe-top">
        <div className="hidden lg:block">
          <PageTabs tabs={TABS} />
        </div>
        {children}
      </main>
      <div className="lg:hidden">
        <GestionBottomNav />
      </div>
    </div>
  )
}
