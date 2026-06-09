'use client'

/**
 * NavPill — componente base compartido para todos los BottomNavs de la app.
 * Estilo unificado: glass pill flotante, safe-area-aware, icono + label.
 */

import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'

const G     = '#D4AF37'
const G_RGB = '212,175,55'

export interface NavItem {
  href:  string
  icon:  LucideIcon
  label: string
  exact?: boolean
}

interface NavPillProps {
  items:    NavItem[]
  pathname: string
}

export function NavPill({ items, pathname }: NavPillProps) {
  return (
    <div
      className="lg:hidden"
      style={{
        position:  'fixed',
        bottom:    'max(16px, env(safe-area-inset-bottom, 16px))',
        left:      '50%',
        transform: 'translateX(-50%)',
        zIndex:    50,
        maxWidth:  'calc(100vw - 24px)',
      }}
    >
      {/* Fade lateral derecho — indica overflow scrollable */}
      <div style={{
        position: 'absolute', right: 0, top: 0, bottom: 0, width: 28,
        background: 'linear-gradient(to left, rgba(10,10,10,0.88) 40%, transparent)',
        borderRadius: '0 100px 100px 0',
        pointerEvents: 'none', zIndex: 1,
      }} />
      {/* Fade lateral izquierdo */}
      <div style={{
        position: 'absolute', left: 0, top: 0, bottom: 0, width: 28,
        background: 'linear-gradient(to right, rgba(10,10,10,0.88) 40%, transparent)',
        borderRadius: '100px 0 0 100px',
        pointerEvents: 'none', zIndex: 1,
      }} />

      <nav
        className="navpill-scroll"
        style={{
          display:              'flex',
          alignItems:           'center',
          gap:                  2,
          background:           'rgba(10,10,10,0.90)',
          backdropFilter:       'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          border:               '1px solid rgba(255,255,255,0.08)',
          borderRadius:         100,
          padding:              '6px 8px',
          boxShadow:            '0 8px 40px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.04)',
          overflowX:            'auto',
          scrollbarWidth:       'none',
          msOverflowStyle:      'none',
          WebkitOverflowScrolling: 'touch',
        } as React.CSSProperties}
      >
        <style>{`.navpill-scroll::-webkit-scrollbar{display:none}`}</style>
        {items.map(({ href, icon: Icon, label, exact }) => {
          const active = exact
            ? pathname === href
            : pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              style={{
                display:        'flex',
                flexDirection:  'column',
                alignItems:     'center',
                justifyContent: 'center',
                gap:            3,
                padding:        '8px 12px',
                borderRadius:   80,
                textDecoration: 'none',
                background:     active ? `rgba(${G_RGB},0.13)` : 'transparent',
                border:         active ? `1px solid rgba(${G_RGB},0.22)` : '1px solid transparent',
                color:          active ? G : 'rgba(255,255,255,0.32)',
                flexShrink:     0,
                minWidth:       52,   /* touch target ≥ 44px */
                minHeight:      52,
                transition:     'all 0.2s cubic-bezier(0.16,1,0.3,1)',
              }}
            >
              <div style={{ position: 'relative' }}>
                <Icon size={20} strokeWidth={active ? 2.5 : 1.8} />
                {active && (
                  <div style={{
                    position:     'absolute',
                    bottom:       -4,
                    left:         '50%',
                    transform:    'translateX(-50%)',
                    width:        4,
                    height:       4,
                    borderRadius: '50%',
                    background:   G,
                    boxShadow:    `0 0 6px ${G}`,
                  }} />
                )}
              </div>
              <span style={{
                fontSize:      9,
                fontWeight:    active ? 700 : 500,
                letterSpacing: '0.3px',
                whiteSpace:    'nowrap',
                fontFamily:    'inherit',
              }}>
                {label}
              </span>
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
