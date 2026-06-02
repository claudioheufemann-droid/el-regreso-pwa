'use client'

import { ChevronLeft } from 'lucide-react'

const F = '#F97316'

interface FlotaPageHeaderProps {
  title: string
  subtitle?: string
  onBack: () => void
  backLabel?: string
  /** Contenido extra bajo el título (ej: StepBar) */
  children?: React.ReactNode
}

export default function FlotaPageHeader({ title, subtitle, onBack, backLabel = 'Volver', children }: FlotaPageHeaderProps) {
  return (
    <div style={{
      background: '#0A0A0A',
      borderBottom: '1px solid rgba(249,115,22,0.18)',
      padding: '0 16px',
    }}>
      {/* Fila principal */}
      <div style={{ display: 'flex', alignItems: 'center', height: 52 }}>
        <button
          onClick={onBack}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: F, display: 'flex', alignItems: 'center', gap: 4,
            fontSize: 14, fontWeight: 600, padding: 0,
            minWidth: 70, flexShrink: 0,
          }}
        >
          <ChevronLeft size={18} strokeWidth={2.5} />
          {backLabel}
        </button>

        <div style={{ flex: 1, textAlign: 'center', minWidth: 0 }}>
          <p style={{ fontSize: 14, fontWeight: 800, color: '#F4EEDF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {title}
          </p>
          {subtitle && (
            <p style={{ fontSize: 10, color: 'var(--muted)', marginTop: 1 }}>{subtitle}</p>
          )}
        </div>

        {/* Espaciador para centrar el título */}
        <div style={{ minWidth: 70, flexShrink: 0 }} />
      </div>

      {/* Contenido extra (ej: StepBar, barra de progreso) */}
      {children && (
        <div style={{ paddingBottom: 10 }}>
          {children}
        </div>
      )}
    </div>
  )
}
