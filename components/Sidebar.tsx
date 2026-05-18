'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BarChart2, TrendingUp, Target, Upload, Beer, Map, Users, BarChart, LogOut } from 'lucide-react'
import { useUser } from '@/lib/userContext'

const navItems = [
  { href: '/',             icon: BarChart2,  label: 'Hoy',       adminOnly: false },
  { href: '/acumulado',    icon: TrendingUp, label: 'Período',   adminOnly: false },
  { href: '/clientes',     icon: Users,      label: 'Clientes',  adminOnly: false },
  { href: '/mapa',         icon: Map,        label: 'Mapa',      adminOnly: false },
  { href: '/metas',        icon: Target,     label: 'Metas',     adminOnly: false },
  { href: '/admin/cargar', icon: Upload,     label: 'Cargar',    adminOnly: true  },
  { href: '/admin/reportes', icon: BarChart, label: 'Reportes',  adminOnly: true  },
]

export default function Sidebar() {
  const pathname = usePathname()
  const { user, isAdmin, logout } = useUser()

  return (
    <aside style={{
      width: 'var(--sidebar-w)',
      minWidth: 'var(--sidebar-w)',
      background: 'var(--surface)',
      borderRight: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      position: 'sticky',
      top: 0,
    }}>
      {/* Logo */}
      <div style={{ padding: '28px 20px 24px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 36, height: 36,
            background: 'var(--gold)',
            borderRadius: 10,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <Beer size={18} color="#080808" />
          </div>
          <div>
            <p style={{ fontSize: 13, fontWeight: 800, color: 'var(--cream)', letterSpacing: '-0.3px', lineHeight: 1.1 }}>
              El Regreso
            </p>
            <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.8px', textTransform: 'uppercase' }}>
              Ventas
            </p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav style={{ padding: '12px 10px', flex: 1, overflowY: 'auto' }}>
        <p style={{ fontSize: 9, fontWeight: 700, color: 'var(--muted)', letterSpacing: '1.5px', textTransform: 'uppercase', padding: '4px 10px 8px' }}>
          Panel
        </p>
        {navItems.filter(item => !item.adminOnly || isAdmin).map(({ href, icon: Icon, label }) => {
          const active = href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '9px 12px', borderRadius: 10, marginBottom: 2,
                color: active ? 'var(--gold)' : 'var(--muted)',
                background: active ? 'var(--gold-dim)' : 'transparent',
                fontWeight: active ? 700 : 600, fontSize: 14,
                textDecoration: 'none', transition: 'background 0.12s, color 0.12s',
              }}
              onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'var(--gold-hover)' }}
              onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
            >
              <Icon size={17} />
              {label}
            </Link>
          )
        })}
      </nav>

      {/* Usuario actual + logout */}
      <div style={{ padding: '14px 16px', borderTop: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--cream)', letterSpacing: '-0.2px' }}>
              {user?.nombre}
            </p>
            <p style={{ fontSize: 10, color: isAdmin ? '#A78BFA' : 'var(--muted)', fontWeight: 600, marginTop: 1 }}>
              {isAdmin ? 'Administrador' : 'Vendedor'}
            </p>
          </div>
          <button
            onClick={logout}
            title="Cambiar usuario"
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--muted)', padding: 6, borderRadius: 8,
              display: 'flex', alignItems: 'center',
            }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = '#F87171'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--muted)'}
          >
            <LogOut size={15} />
          </button>
        </div>
      </div>
    </aside>
  )
}
