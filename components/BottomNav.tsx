'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BarChart2, TrendingUp, Users, Map, Upload, Home, Target, Trophy } from 'lucide-react'
import { useUser } from '@/lib/userContext'

const G = '#D4AF37'
const G_RGB = '212,175,55'

export default function BottomNav() {
  const pathname = usePathname()
  const { isAdmin } = useUser()

  const navItems = [
    { href: '/',                    icon: Home,       label: 'Inicio',   exact: true  },
    { href: '/ventas',              icon: BarChart2,  label: 'Hoy',      exact: true  },
    { href: '/ventas/acumulado',    icon: TrendingUp, label: 'Período',  exact: false },
    { href: '/ventas/misiones',     icon: Target,     label: 'Misiones', exact: false },
    { href: '/ventas/clientes',     icon: Users,      label: 'Clientes', exact: false },
    { href: '/ventas/mapa',         icon: Map,        label: 'Mapa',     exact: false },
    { href: '/ventas/metas',        icon: Trophy,     label: 'Metas',    exact: false },
    ...(isAdmin ? [{ href: '/ventas/admin/cargar', icon: Upload, label: 'Cargar', exact: false }] : []),
  ]

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
        gap: 2,
        background: 'rgba(10, 10, 10, 0.88)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 100,
        padding: '8px 10px',
        boxShadow: '0 8px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04)',
        zIndex: 50,
        maxWidth: 'calc(100vw - 32px)',
      } as React.CSSProperties}
    >
      {navItems.map(({ href, icon: Icon, label, exact }) => {
        const active = exact ? pathname === href : pathname === href || pathname.startsWith(href + '/')
        return (
          <Link key={href} href={href} style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
            padding: '6px 10px', borderRadius: 80, textDecoration: 'none',
            background: active ? `rgba(${G_RGB}, 0.12)` : 'transparent',
            border: active ? `1px solid rgba(${G_RGB}, 0.2)` : '1px solid transparent',
            transition: 'all 0.2s ease',
            color: active ? G : 'rgba(255,255,255,0.35)',
            flexShrink: 0,
          }}>
            <div style={{ position: 'relative' }}>
              <Icon size={18} strokeWidth={active ? 2.5 : 1.8} />
              {active && (
                <div style={{
                  position: 'absolute', bottom: -2, left: '50%', transform: 'translateX(-50%)',
                  width: 4, height: 4, borderRadius: '50%', background: G,
                  boxShadow: `0 0 6px ${G}`,
                }} />
              )}
            </div>
            <span style={{ fontSize: 8, fontWeight: active ? 700 : 500, letterSpacing: '0.3px', whiteSpace: 'nowrap' }}>
              {label}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}
