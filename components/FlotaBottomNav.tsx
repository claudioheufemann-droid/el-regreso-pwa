'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Truck, Plus, History, BarChart3 } from 'lucide-react'

const G = '#F97316'
const G_RGB = '249,115,22'

const items = [
  { href: '/flota',           icon: Truck,    label: 'Flota',     exact: true  },
  { href: '/flota/checkin',   icon: Plus,     label: 'Salida',    exact: false },
  { href: '/flota/historial', icon: History,  label: 'Historial', exact: false },
  { href: '/flota/admin',     icon: BarChart3,label: 'Reportes',  exact: false },
]

export default function FlotaBottomNav() {
  const pathname = usePathname()
  return (
    <nav
      className="lg:hidden"
      style={{
        position: 'fixed',
        bottom: 'max(16px, env(safe-area-inset-bottom))',
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        background: 'rgba(10, 10, 10, 0.88)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 100,
        padding: '8px 12px',
        boxShadow: '0 8px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04)',
        zIndex: 50,
        minWidth: 280,
        justifyContent: 'space-around',
      } as React.CSSProperties}
    >
      {items.map(({ href, icon: Icon, label, exact }) => {
        const active = exact ? pathname === href : pathname === href || pathname.startsWith(href + '/')
        return (
          <Link key={href} href={href} style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
            padding: '6px 14px', borderRadius: 80, textDecoration: 'none',
            background: active ? `rgba(${G_RGB}, 0.12)` : 'transparent',
            border: active ? `1px solid rgba(${G_RGB}, 0.2)` : '1px solid transparent',
            transition: 'all 0.2s ease',
            color: active ? G : 'rgba(255,255,255,0.35)',
            minWidth: 52,
          }}>
            <div style={{ position: 'relative' }}>
              <Icon size={19} strokeWidth={active ? 2.5 : 1.8} />
              {active && (
                <div style={{
                  position: 'absolute', bottom: -2, left: '50%', transform: 'translateX(-50%)',
                  width: 4, height: 4, borderRadius: '50%', background: G,
                  boxShadow: `0 0 6px ${G}`,
                }} />
              )}
            </div>
            <span style={{ fontSize: 9, fontWeight: active ? 700 : 500, letterSpacing: '0.3px' }}>
              {label}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}
