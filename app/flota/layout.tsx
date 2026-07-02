import { getServerUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import FlotaSidebar from '@/components/FlotaSidebar'
import FlotaBottomNav from '@/components/FlotaBottomNav'
import FlotaTabBar from '@/components/FlotaTabBar'
import type { PageTab } from '@/components/PageTabs'

const TABS: PageTab[] = [
  { href: '/flota',           label: 'Vehículos',    exact: true  },
  { href: '/flota/checkin',   label: 'Nueva Salida'              },
  { href: '/flota/historial', label: 'Historial'                 },
  { href: '/flota/admin',     label: 'Reportes'                  },
]

const ORANGE = '#D4AF37'

export default async function FlotaLayout({ children }: { children: React.ReactNode }) {
  // Logística es exclusiva de administración. El vendedor ve el módulo en el
  // Hub (bloqueado) pero no puede entrar — ni por la tarjeta ni tecleando la URL.
  const user = await getServerUser()
  if (!user) redirect('/login')
  if (!user.isAdmin) redirect('/')

  return (
    <div className="min-h-screen flex" style={{ background: 'var(--bg)' }}>
      <div className="hidden lg:flex">
        <FlotaSidebar />
      </div>
      <main className="flex-1 flex flex-col min-h-screen overflow-y-auto pb-32 lg:pb-0 mobile-safe-top">
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
