'use client'

/**
 * Header estándar mobile de El Regreso Control.
 * Mismo lenguaje visual en toda la app: eyebrow + título grande + acción opcional.
 * El safe-area del notch lo provee el layout (.mobile-safe-top); aquí solo spacing.
 */
interface MobileHeaderProps {
  /** Línea pequeña superior: fecha, módulo o área activa */
  eyebrow?: string
  /** Título principal */
  title: string
  /** Parte del título en dorado (ej. el nombre) */
  titleAccent?: string
  /** Emoji opcional al final del título */
  emoji?: string
  /** Subtítulo discreto bajo el título */
  subtitle?: string
  /** Acción a la derecha (botón, ícono) */
  action?: React.ReactNode
  /** Arte/hero opcional en esquina superior derecha (detrás de la acción) */
  hero?: React.ReactNode
}

export default function MobileHeader({ eyebrow, title, titleAccent, emoji, subtitle, action, hero }: MobileHeaderProps) {
  return (
    <div style={{ position: 'relative', padding: '4px 16px 0', marginBottom: 20 }}>
      {hero && (
        <div style={{ position: 'absolute', top: 0, right: 16, opacity: 0.9, pointerEvents: 'none' }}>
          {hero}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, position: 'relative', zIndex: 2 }}>
        <div style={{ minWidth: 0 }}>
          {eyebrow && (
            <p style={{ fontSize: 11, fontWeight: 500, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.4px', marginBottom: 6, textTransform: 'capitalize' }}>
              {eyebrow}
            </p>
          )}
          <h1 style={{ fontSize: 28, fontWeight: 900, color: '#F4EEDF', letterSpacing: '-1px', lineHeight: 1.1 }}>
            {title}
            {titleAccent && <span style={{ color: '#D4AF37' }}> {titleAccent}</span>}
            {emoji && <span> {emoji}</span>}
          </h1>
          {subtitle && (
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.32)', fontWeight: 400, marginTop: 6, maxWidth: 240, lineHeight: 1.5 }}>
              {subtitle}
            </p>
          )}
        </div>

        {action && <div style={{ flexShrink: 0 }}>{action}</div>}
      </div>
    </div>
  )
}
