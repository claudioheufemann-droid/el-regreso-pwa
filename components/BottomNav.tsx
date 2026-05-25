'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BarChart2, TrendingUp, Users, Map, Upload, Home } from 'lucide-react'
import { useUser } from '@/lib/userContext'

export default function BottomNav() {
  const pathname = usePathname()
  const { isAdmin } = useUser()

  const navItems = [
    { href: '/',                    icon: Home,       label: 'Inicio',  exact: true  },
    { href: '/ventas',              icon: BarChart2,  label: 'Hoy',     exact: true  },
    { href: '/ventas/acumulado',    icon: TrendingUp, label: 'Período', exact: false },
    { href: '/ventas/clientes',     icon: Users,      label: 'Clientes',exact: false },
    { href: '/ventas/mapa',         icon: Map,        label: 'Mapa',    exact: false },
    ...(isAdmin ? [{ href: '/ventas/admin/cargar', icon: Upload, label: 'Cargar', exact: false }] : []),
  ]

  return (
    <nav
      className="lg:hidden fixed bottom-0 left-0 right-0 flex items-center justify-around px-2 z-50"
      style={{
        background: 'var(--surface)',
        borderTop: '1px solid var(--border)',
        paddingTop: '0.5rem',
        paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))',
      }}
    >
      {navItems.map(({ href, icon: Icon, label, exact }) => {
        const active = exact ? pathname === href : pathname === href || pathname.startsWith(href + '/')
        return (
          <Link
            key={href}
            href={href}
            className="flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl transition-all"
            style={{ color: active ? 'var(--gold)' : 'var(--muted)' }}
          >
            <Icon size={21} />
            <span className="text-xs font-medium">{label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
