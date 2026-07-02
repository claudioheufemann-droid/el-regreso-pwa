'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, LogOut, LucideIcon } from 'lucide-react'
import { useUser } from '@/lib/userContext'
import { ReactNode } from 'react'
import Logo from '@/components/ui/Logo'
import Avatar from '@/components/ui/Avatar'

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
      <div style={{ padding: '14px 16px 12px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <Logo size={28} />
          <div>
            <p style={{ fontSize: 12, fontWeight: 800, color: 'var(--cream)', letterSpacing: '-0.3px', lineHeight: 1.1 }}>
              El Regreso
            </p>
            <p style={{ fontSize: 9, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.8px', textTransform: 'uppercase' }}>
              {moduleName}
            </p>
          </div>
        </div>
        <Link
          href="/"
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '6px 10px', borderRadius: 9,
            background: 'rgba(212,175,55,0.06)',
            border: '1px solid rgba(212,175,55,0.12)',
            color: '#A08830', fontSize: 11, fontWeight: 600,
            textDecoration: 'none', transition: 'background 0.12s',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(212,175,55,0.12)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'rgba(212,175,55,0.06)')}
        >
          <Home size={12} />
          Cambiar módulo
        </Link>
      </div>

      {/* Navigation */}
      <nav style={{ padding: '10px 8px', flex: 1, overflowY: 'auto' }}>
        <p style={{ fontSize: 8, fontWeight: 700, color: 'var(--muted)', letterSpacing: '1.5px', textTransform: 'uppercase', padding: '3px 10px 6px' }}>
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
                display: 'flex', alignItems: 'center', gap: 9,
                padding: '8px 12px', borderRadius: 10, marginBottom: 2,
                color: active ? 'var(--gold)' : 'var(--muted)',
                background: active ? 'var(--gold-dim)' : 'transparent',
                fontWeight: active ? 700 : 600, fontSize: 12,
                textDecoration: 'none', transition: 'background 0.12s, color 0.12s',
              }}
              onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'var(--gold-hover)' }}
              onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
            >
              <Icon size={16} />
              {label}
            </Link>
          )
        })}
        {cta}
      </nav>

      {/* Footer */}
      <div style={{ padding: '10px 14px', borderTop: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
            {user && (
              <Avatar
                iniciales={user.iniciales}
                userId={user.id}
                size={34}
                avatarUrl={user.avatarUrl}
              />
            )}
            <div style={{ minWidth: 0 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--cream)', letterSpacing: '-0.2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {user?.nombre}
              </p>
              <p style={{ fontSize: 9, color: isAdmin ? '#A78BFA' : 'var(--muted)', fontWeight: 600, marginTop: 1 }}>
                {isAdmin ? 'Administrador' : 'Vendedor'}
              </p>
            </div>
          </div>
          <button
            onClick={logout}
            title="Cerrar sesión"
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--muted)', padding: 6, borderRadius: 8,
              display: 'flex', alignItems: 'center', flexShrink: 0,
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
