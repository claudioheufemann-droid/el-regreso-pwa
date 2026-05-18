'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BarChart2, TrendingUp, Users, Map, Upload } from 'lucide-react'
import { useUser } from '@/lib/userContext'

export default function BottomNav() {
  const pathname = usePathname()
  const { isAdmin } = useUser()

  const navItems = [
    { href: '/',         icon: <BarChart2 size={21} />, label: 'Hoy' },
    { href: '/acumulado',icon: <TrendingUp size={21} />,label: 'Período' },
    { href: '/clientes', icon: <Users size={21} />,     label: 'Clientes' },
    { href: '/mapa',     icon: <Map size={21} />,       label: 'Mapa' },
    ...(isAdmin ? [{ href: '/admin/cargar', icon: <Upload size={21} />, label: 'Cargar' }] : []),
  ]

  return (
    <nav
      className="lg:hidden fixed bottom-0 left-0 right-0 flex items-center justify-around px-2 pb-safe z-50"
      style={{ background: '#111', borderTop: '1px solid #222', paddingTop: '0.5rem', paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
    >
      {navItems.map(item => {
        const active = pathname === item.href
        return (
          <Link
            key={item.href}
            href={item.href}
            className="flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl transition-all"
            style={{ color: active ? '#F59E0B' : '#666' }}
          >
            {item.icon}
            <span className="text-xs font-medium">{item.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
