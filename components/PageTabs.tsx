'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useUser } from '@/lib/userContext'

export interface PageTab {
  href: string
  label: string
  exact?: boolean
  adminOnly?: boolean
}

interface Props {
  tabs: PageTab[]
  accent?: string
}

export default function PageTabs({ tabs, accent = 'var(--gold)' }: Props) {
  const pathname = usePathname()
  const { isAdmin } = useUser()

  const visibleTabs = tabs.filter(t => !t.adminOnly || isAdmin)

  return (
    <div style={{
      position: 'sticky',
      top: 0,
      zIndex: 10,
      background: 'var(--bg)',
      borderBottom: '1px solid rgba(255,255,255,0.06)',
      display: 'flex',
      overflowX: 'auto',
      scrollbarWidth: 'none',
      WebkitOverflowScrolling: 'touch' as React.CSSProperties['WebkitOverflowScrolling'],
      msOverflowStyle: 'none' as React.CSSProperties['msOverflowStyle'],
      paddingLeft: 'var(--sp-3)',
    }}>
      {visibleTabs.map(tab => {
        const isActive = tab.exact
          ? pathname === tab.href
          : pathname === tab.href || pathname.startsWith(tab.href + '/')

        return (
          <Link
            key={tab.href}
            href={tab.href}
            style={{
              textDecoration: 'none',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              height: 40,
              padding: '0 13px',
              fontSize: 13,
              fontWeight: isActive ? 700 : 500,
              color: isActive ? accent : 'var(--muted)',
              borderBottom: isActive ? `2px solid ${accent}` : '2px solid transparent',
              transition: 'color 0.15s, border-color 0.15s',
              whiteSpace: 'nowrap',
              marginBottom: -1,
            }}
          >
            {tab.label}
          </Link>
        )
      })}
    </div>
  )
}
