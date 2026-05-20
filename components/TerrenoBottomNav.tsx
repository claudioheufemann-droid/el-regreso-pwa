'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, MapPin, History, Plus } from 'lucide-react'

const G = '#D4AF37'

export default function TerrenoBottomNav() {
  const pathname = usePathname()

  const items = [
    { href: '/',                  icon: Home,    label: 'Inicio',    exact: true  },
    { href: '/terreno',           icon: MapPin,  label: 'Hub',       exact: true  },
    { href: '/terreno/historial', icon: History, label: 'Historial', exact: false },
  ]

  return (
    <nav
      className="lg:hidden fixed bottom-0 left-0 right-0 flex items-center justify-around px-2 z-50"
      style={{
        background: 'var(--surface)', borderTop: '1px solid var(--border)',
        paddingTop: '0.5rem',
        paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))',
      }}
    >
      {items.map(({ href, icon: Icon, label, exact }) => {
        const active = exact ? pathname === href : pathname.startsWith(href)
        return (
          <Link
            key={href}
            href={href}
            className="flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl"
            style={{ color: active ? G : 'var(--muted)' }}
          >
            <Icon size={21} />
            <span className="text-xs font-medium">{label}</span>
          </Link>
        )
      })}

      {/* CTA central */}
      <Link
        href="/terreno/nueva-visita"
        className="flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl"
        style={{ color: pathname.startsWith('/terreno/nueva-visita') ? G : 'var(--muted)' }}
      >
        <Plus size={21} />
        <span className="text-xs font-medium">Visita</span>
      </Link>
    </nav>
  )
}
