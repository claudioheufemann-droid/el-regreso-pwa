'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { useUser } from '@/lib/userContext'
import SettingsPanel from '@/components/ui/SettingsPanel'
import NotificationsBell from '@/components/ui/NotificationsBell'

/**
 * Header estándar de El Regreso Control — mismo en todos los módulos y submenús.
 * Arriba del todo: botón "Volver" que lleva directo al menú principal de la app.
 * Debajo: eyebrow (fecha/módulo) + título a la izquierda, campana de
 * notificaciones + avatar a la derecha. Tocar el avatar abre la configuración.
 * El saludo "Hola, X" NO va aquí: solo en el home tras iniciar sesión.
 */
interface AppHeaderProps {
  /** Línea pequeña superior: fecha o módulo */
  eyebrow?: string
  /** Título de la sección */
  title: string
  /** Acción extra opcional a la izquierda del avatar (ej. botón filtros) */
  extraAction?: React.ReactNode
  /** Ocultar el botón Volver (por defecto se muestra en todas las pantallas) */
  hideBack?: boolean
  /** A dónde navega "Volver" (por defecto al inicio de la app) */
  backHref?: string
}

export default function AppHeader({ eyebrow, title, extraAction, hideBack, backHref = '/' }: AppHeaderProps) {
  const { user } = useUser()
  const router = useRouter()
  const [showSettings, setShowSettings] = useState(false)

  const initials = user?.iniciales ?? (user?.nombre?.slice(0, 2).toUpperCase() ?? '··')

  return (
    <>
      {!hideBack && (
        <div style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
          <button
            onClick={() => router.push(backHref)}
            aria-label="Volver"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 100, padding: '7px 14px 7px 10px', marginTop: 8, marginBottom: 4,
              color: 'var(--cream)', fontSize: 13, fontWeight: 700, cursor: 'pointer',
              minHeight: 36,
            }}
          >
            <ChevronLeft size={17} strokeWidth={2.5} color="#D4AF37" />
            Volver
          </button>
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, paddingTop: hideBack ? 'env(safe-area-inset-top, 0px)' : 0, marginBottom: 14 }}>
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
          <NotificationsBell inline variant="dark" />
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
