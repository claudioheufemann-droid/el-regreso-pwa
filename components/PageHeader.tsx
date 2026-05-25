'use client'

import { ReactNode } from 'react'

interface Props {
  title: string
  subtitle?: string
  actions?: ReactNode
}

export default function PageHeader({ title, subtitle, actions }: Props) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      minHeight: 64,
      padding: '0 var(--sp-3)',
      borderBottom: '1px solid rgba(255,255,255,0.06)',
    }}>
      <div>
        {subtitle && (
          <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', letterSpacing: '1.2px', textTransform: 'uppercase', marginBottom: 3 }}>
            {subtitle}
          </p>
        )}
        <h1 style={{
          fontSize: 'clamp(20px, 4vw, var(--fs-title))',
          fontWeight: 900,
          color: 'var(--cream)',
          letterSpacing: '-0.5px',
          lineHeight: 1,
        }}>
          {title}
        </h1>
      </div>
      {actions && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {actions}
        </div>
      )}
    </div>
  )
}
