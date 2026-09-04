'use client'

/**
 * Header de Control Comercial.
 *
 * No usa AppHeader: ese está construido con literales blancos sobre fondo
 * oscuro y acá el módulo es claro. Mantiene el mismo comportamiento (volver,
 * campana, avatar → configuración) con la jerarquía del rediseño:
 * eyebrow dorado · título grande · subtítulo de período.
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { useUser } from '@/lib/userContext'
import SettingsPanel from '@/components/ui/SettingsPanel'
import NotificationsBell from '@/components/ui/NotificationsBell'

interface Props {
  eyebrow?: string
  title: string
  /** Línea de contexto bajo el título: período, alcance, estado. */
  subtitle?: string
  /** Fragmento resaltado al final del subtítulo (ej. "En curso"). */
  subtitleTag?: string
  backHref?: string
}

export default function CCHeader({ eyebrow = 'Control Comercial', title, subtitle, subtitleTag, backHref = '/' }: Props) {
  const { user } = useUser()
  const router = useRouter()
  const [showSettings, setShowSettings] = useState(false)
  const initials = user?.iniciales ?? user?.nombre?.slice(0, 2).toUpperCase() ?? '··'

  return (
    <>
      <header style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 10px)', paddingBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, minWidth: 0 }}>
          <button
            onClick={() => router.push(backHref)}
            aria-label="Volver"
            className="cc-tap"
            style={{
              width: 44, height: 44, borderRadius: 15, flexShrink: 0, marginTop: 2,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'var(--cc-card)', border: '1px solid var(--cc-line)',
              boxShadow: 'var(--cc-shadow)', cursor: 'pointer', padding: 0,
            }}
          >
            <ChevronLeft size={21} strokeWidth={2.4} color="var(--cc-ink)" />
          </button>

          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--cc-gold)', letterSpacing: '-0.1px', marginBottom: 1 }}>
              {eyebrow}
            </p>
            <h1
              style={{
                fontSize: 28, fontWeight: 800, color: 'var(--cc-ink)', letterSpacing: '-1px', lineHeight: 1.08,
                overflow: 'hidden', textOverflow: 'ellipsis',
              }}
            >
              {title}
            </h1>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, marginTop: 2 }}>
            <NotificationsBell inline variant="light" />
            <button
              onClick={() => setShowSettings(true)}
              aria-label="Configuración"
              className="cc-tap"
              style={{
                width: 44, height: 44, borderRadius: '50%', flexShrink: 0, padding: 0, overflow: 'hidden',
                border: '1.5px solid var(--cc-gold-line)', cursor: 'pointer',
                background: user?.avatarUrl ? 'transparent' : 'linear-gradient(135deg, #D4AF37, #B8962E)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              {user?.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.avatarUrl} alt={user.nombre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <span style={{ fontSize: 13, fontWeight: 900, color: 'var(--cc-ink)' }}>{initials}</span>
              )}
            </button>
          </div>
        </div>

        {subtitle && (
          <p style={{ fontSize: 12.5, color: 'var(--cc-ink-3)', marginTop: 6, paddingLeft: 56, lineHeight: 1.4 }}>
            {subtitle}
            {subtitleTag && <span style={{ color: 'var(--cc-gold)', fontWeight: 700 }}> · {subtitleTag}</span>}
          </p>
        )}
      </header>

      {showSettings && (
        <SettingsPanel
          onClose={() => setShowSettings(false)}
          userName={user?.nombre ?? ''}
          userEmail={user?.email ?? ''}
          avatarUrl={user?.avatarUrl}
        />
      )}
    </>
  )
}
