'use client'

/**
 * NavPill — barra de navegación inferior compartida por todos los módulos.
 * Glass pill flotante, safe-area-aware. Máximo 5 slots visibles:
 * si hay más ítems, muestra 4 + botón "Más" que abre una hoja inferior.
 * Sin scroll horizontal — cada destino siempre visible o a un tap.
 */

import Link from 'next/link'
import { useState } from 'react'
import { MoreHorizontal, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

const G     = '#D4AF37'
const G_RGB = '212,175,55'
const MAX_VISIBLE = 5

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

function isActive(item: NavItem, pathname: string) {
  return item.exact
    ? pathname === item.href
    : pathname === item.href || pathname.startsWith(item.href + '/')
}

const itemStyle = (active: boolean): React.CSSProperties => ({
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
  minWidth:       52,   // touch target ≥ 44px
  minHeight:      52,
  cursor:         'pointer',
  transition:     'all 0.2s cubic-bezier(0.16,1,0.3,1)',
})

function ItemContent({ Icon, label, active }: { Icon: LucideIcon; label: string; active: boolean }) {
  return (
    <>
      <div style={{ position: 'relative' }}>
        <Icon size={20} strokeWidth={active ? 2.5 : 1.8} />
        {active && (
          <div style={{
            position: 'absolute', bottom: -4, left: '50%', transform: 'translateX(-50%)',
            width: 4, height: 4, borderRadius: '50%', background: G, boxShadow: `0 0 6px ${G}`,
          }} />
        )}
      </div>
      <span style={{ fontSize: 9, fontWeight: active ? 700 : 500, letterSpacing: '0.3px', whiteSpace: 'nowrap' }}>
        {label}
      </span>
    </>
  )
}

export function NavPill({ items, pathname }: NavPillProps) {
  const [sheetOpen, setSheetOpen] = useState(false)

  const needsOverflow = items.length > MAX_VISIBLE
  const visible  = needsOverflow ? items.slice(0, MAX_VISIBLE - 1) : items
  const overflow = needsOverflow ? items.slice(MAX_VISIBLE - 1) : []
  const overflowActive = overflow.some(i => isActive(i, pathname))

  return (
    <>
      {/* ── Hoja inferior "Más" ── */}
      {sheetOpen && (
        <div
          onClick={() => setSheetOpen(false)}
          className="lg:hidden"
          style={{
            position: 'fixed', inset: 0, zIndex: 60,
            background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)',
            display: 'flex', alignItems: 'flex-end',
            animation: 'navsheet-fade 0.2s ease',
          }}
        >
          <style>{`
            @keyframes navsheet-fade { from { opacity: 0 } to { opacity: 1 } }
            @keyframes navsheet-up { from { transform: translateY(24px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
          `}</style>
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%',
              background: 'rgba(15,15,15,0.98)',
              backdropFilter: 'blur(24px)',
              borderTop: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '24px 24px 0 0',
              padding: '14px 16px',
              paddingBottom: 'max(20px, env(safe-area-inset-bottom, 20px))',
              boxShadow: '0 -8px 40px rgba(0,0,0,0.6)',
              animation: 'navsheet-up 0.28s cubic-bezier(0.16,1,0.3,1)',
            }}
          >
            {/* Handle + cerrar */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)', letterSpacing: '1px', textTransform: 'uppercase' }}>
                Más secciones
              </span>
              <button
                onClick={() => setSheetOpen(false)}
                style={{ width: 32, height: 32, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
              >
                <X size={16} color="rgba(255,255,255,0.5)" />
              </button>
            </div>
            {/* Grid de ítems overflow */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
              {overflow.map(({ href, icon: Icon, label, exact }) => {
                const active = isActive({ href, icon: Icon, label, exact }, pathname)
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setSheetOpen(false)}
                    style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6,
                      minHeight: 64, padding: '10px 4px', borderRadius: 14, textDecoration: 'none',
                      background: active ? `rgba(${G_RGB},0.12)` : 'rgba(255,255,255,0.03)',
                      border: `1px solid ${active ? `rgba(${G_RGB},0.25)` : 'rgba(255,255,255,0.06)'}`,
                      color: active ? G : 'rgba(255,255,255,0.55)',
                    }}
                  >
                    <Icon size={22} strokeWidth={active ? 2.5 : 1.8} />
                    <span style={{ fontSize: 10, fontWeight: active ? 700 : 500 }}>{label}</span>
                  </Link>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Pill flotante ── */}
      <nav
        className="lg:hidden"
        style={{
          position:  'fixed',
          bottom:    'max(16px, env(safe-area-inset-bottom, 16px))',
          left:      '50%',
          transform: 'translateX(-50%)',
          zIndex:    50,
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
          maxWidth:             'calc(100vw - 24px)',
        }}
      >
        {visible.map(({ href, icon: Icon, label, exact }) => {
          const active = isActive({ href, icon: Icon, label, exact }, pathname)
          return (
            <Link key={href} href={href} style={itemStyle(active)}>
              <ItemContent Icon={Icon} label={label} active={active} />
            </Link>
          )
        })}

        {/* Botón "Más" — solo si hay overflow */}
        {needsOverflow && (
          <button
            onClick={() => setSheetOpen(true)}
            aria-label="Más secciones"
            style={{ ...itemStyle(overflowActive), border: 'none', background: overflowActive ? `rgba(${G_RGB},0.13)` : 'transparent' }}
          >
            <ItemContent Icon={MoreHorizontal} label="Más" active={overflowActive} />
          </button>
        )}
      </nav>
    </>
  )
}
