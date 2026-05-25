'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, LogOut, LucideIcon } from 'lucide-react'
import { useUser } from '@/lib/userContext'
import { ReactNode } from 'react'
import Logo from '@/components/ui/Logo'

export interface SidebarNavItem {
  href: string
  icon: LucideIcon
  label: string
  exact?: boolean
  adminOnly?: boolean
}

interface SidebarShellProps {
  moduleName: string
  sectionLabel: string
  navItems: SidebarNavItem[]
  cta?: ReactNode
}

export default function SidebarShell({ moduleName, sectionLabel, navItems, cta }: SidebarShellProps) {
  const pathname = usePathname()
  const { user, isAdmin, logout } = useUser()

  const visibleItems = navItems.filter(item => !item.adminOnly || isAdmin)

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
      {/* Header */}
      <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <Logo size={36} />
          <div>
            <p style={{ fontSize: 13, fontWeight: 800, color: 'var(--cream)', letterSpacing: '-0.3px', lineHeight: 1.1 }}>
              El Regreso
            </p>
            <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.8px', textTransform: 'uppercase' }}>
              {moduleName}
            </p>
          </div>
        </div>
        <Link
          href="/"
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '7px 10px', borderRadius: 9,
            background: 'rgba(212,175,55,0.06)',
            border: '1px solid rgba(212,175,55,0.12)',
            color: '#A08830', fontSize: 12, fontWeight: 600,
            textDecoration: 'none', transition: 'background 0.12s',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(212,175,55,0.12)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'rgba(212,175,55,0.06)')}
        >
          <Home size={13} />
          Cambiar módulo
        </Link>
      </div>

      {/* Navigation */}
      <nav style={{ padding: '12px 10px', flex: 1, overflowY: 'auto' }}>
        <p style={{ fontSize: 9, fontWeight: 700, color: 'var(--muted)', letterSpacing: '1.5px', textTransform: 'uppercase', padding: '4px 10px 8px' }}>
          {sectionLabel}
        </p>
        {visibleItems.map(({ href, icon: Icon, label, exact }) => {
          const active = exact
            ? pathname === href
            : pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '9px 12px', borderRadius: 10, marginBottom: 2,
                color: active ? 'var(--gold)' : 'var(--muted)',
                background: active ? 'var(--gold-dim)' : 'transparent',
                fontWeight: active ? 700 : 600, fontSize: 'var(--fs-body)',
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
        {cta}
      </nav>

      {/* Footer */}
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
            title="Cerrar sesión"
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
