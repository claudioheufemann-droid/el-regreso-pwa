'use client'

import { useState } from 'react'
import { useUser } from '@/lib/userContext'
import SettingsPanel from '@/components/ui/SettingsPanel'

/**
 * Header estándar de El Regreso Control — mismo en todos los módulos y submenús.
 * Izquierda: eyebrow (fecha/módulo) + título. Derecha: avatar del usuario.
 * Tocar el avatar abre la configuración de la app.
 * El saludo "Hola, X" NO va aquí: solo en el home tras iniciar sesión.
 */
interface AppHeaderProps {
  /** Línea pequeña superior: fecha o módulo */
  eyebrow?: string
  /** Título de la sección */
  title: string
  /** Acción extra opcional a la izquierda del avatar (ej. botón filtros) */
  extraAction?: React.ReactNode
}

export default function AppHeader({ eyebrow, title, extraAction }: AppHeaderProps) {
  const { user } = useUser()
  const [showSettings, setShowSettings] = useState(false)

  const initials = user?.iniciales ?? (user?.nombre?.slice(0, 2).toUpperCase() ?? '··')

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, paddingTop: 'env(safe-area-inset-top, 0px)', marginBottom: 14 }}>
        <div style={{ minWidth: 0, overflow: 'hidden' }}>
          {eyebrow && (
            <p style={{ fontSize: 10, fontWeight: 500, color: 'rgba(255,255,255,0.28)', letterSpacing: '0.4px', marginBottom: 4, textTransform: 'capitalize', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {eyebrow}
            </p>
          )}
          <h1 style={{ fontSize: 26, fontWeight: 900, color: 'var(--cream)', letterSpacing: '-0.8px', lineHeight: 1.1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {title}
          </h1>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          {extraAction}
          {/* Avatar → configuración */}
          <button
            onClick={() => setShowSettings(true)}
            aria-label="Configuración"
            style={{
              width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
              border: '1.5px solid rgba(212,175,55,0.4)', cursor: 'pointer', padding: 0,
              background: user?.avatarUrl ? 'transparent' : 'linear-gradient(135deg, #D4AF37, #B8962E)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              overflow: 'hidden', position: 'relative',
              boxShadow: '0 2px 12px rgba(212,175,55,0.2)',
            }}
          >
            {user?.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.avatarUrl} alt={user.nombre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <span style={{ fontSize: 13, fontWeight: 900, color: '#0A0A0A' }}>{initials}</span>
            )}
          </button>
        </div>
      </div>

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
