'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Truck, Plus, Map, BarChart3 } from 'lucide-react'

const F = '#3B82F6'

const items = [
  { href: '/flota',         icon: Truck,     label: 'Flota',    exact: true  },
  { href: '/flota/checkin', icon: Plus,      label: 'Salida',   exact: false },
  { href: '/flota/rutas',   icon: Map,       label: 'Rutas',    exact: false },
  { href: '/flota/admin',   icon: BarChart3, label: 'Reportes', exact: false },
]

export default function FlotaBottomNav() {
  const pathname = usePathname()
  return (
    <nav
      className="lg:hidden fixed bottom-0 left-0 right-0 flex items-center justify-around px-2 z-50"
      style={{ background: 'var(--surface)', borderTop: '1px solid var(--border)', paddingTop: '0.5rem', paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
    >
      {items.map(({ href, icon: Icon, label, exact }) => {
        const active = exact ? pathname === href : pathname.startsWith(href)
        return (
          <Link key={href} href={href} className="flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl" style={{ color: active ? F : 'var(--muted)' }}>
            <Icon size={21} />
            <span className="text-xs font-medium">{label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
