'use client'

import { useRouter } from 'next/navigation'
import { ChevronRight, Lock, Home } from 'lucide-react'
import { useIsDesktop } from '@/lib/useIsDesktop'

interface AreaCard {
  key: string
  label: string
  description: string
  color: string
  code: string
  href?: string
  disabled?: boolean
}

const AREAS: AreaCard[] = [
  {
    key: 'comercial',
    label: 'Área Comercial',
    description: 'Ventas · Terreno · Metas · Mermas',
    color: '#E67E22',
    code: 'AC',
    href: '/gestion/comercial',
  },
  {
    key: 'administracion',
    label: 'Administración',
    description: 'Finanzas · Legal · Recursos Humanos',
    color: '#5B8AA8',
    code: 'AD',
    href: '/gestion/administracion',
  },
  {
    key: 'produccion',
    label: 'Área de Producción',
    description: 'Estructura base — en desarrollo',
    color: '#4A4A4A',
    code: 'PR',
    disabled: true,
  },
]

interface Props {
  userName: string
  taskCounts: Record<string, number>
}

export default function GestionHubClient({ userName, taskCounts }: Props) {
  const isDesktop = useIsDesktop()
  const router = useRouter()

  return (
    <div style={{ padding: isDesktop ? 'var(--sp-3)' : '16px 14px 80px', maxWidth: 640, margin: '0 auto', width: '100%' }}>
      {/* Header */}
      <div style={{ marginBottom: isDesktop ? 28 : 16 }}>
        <p style={{ fontSize: isDesktop ? 11 : 9, fontWeight: 700, color: 'var(--muted)', letterSpacing: '1.2px', textTransform: 'uppercase', marginBottom: isDesktop ? 4 : 3 }}>
          {new Date().toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h1 style={{ fontSize: isDesktop ? 'var(--fs-title)' : 20, fontWeight: 900, color: 'var(--cream)', letterSpacing: '-0.5px' }}>
            Gestión
          </h1>
          <button
            onClick={() => router.push('/')}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'var(--gold)', border: 'none', borderRadius: 10,
              padding: '8px 14px', cursor: 'pointer',
              fontSize: 11, fontWeight: 800, color: '#0A0A0A',
              letterSpacing: '0.5px', textTransform: 'uppercase',
              flexShrink: 0,
            }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#C9A430'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'var(--gold)'}
          >
            <Home size={13} />
            Módulos
          </button>
        </div>
      </div>

      {/* Area cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {AREAS.map(area => (
          <div
            key={area.key}
            onClick={() => !area.disabled && area.href && router.push(area.href)}
            style={{
              background: 'var(--surface2)',
              border: `1px solid ${area.disabled ? 'rgba(255,255,255,0.06)' : `${area.color}40`}`,
              borderRadius: 16,
              padding: '20px 20px',
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              cursor: area.disabled ? 'default' : 'pointer',
              opacity: area.disabled ? 0.45 : 1,
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => { if (!area.disabled) (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.04)' }}
            onMouseLeave={e => { if (!area.disabled) (e.currentTarget as HTMLDivElement).style.background = 'var(--surface2)' }}
          >
            {/* Code badge */}
            <div style={{
              width: 52, height: 52, borderRadius: 14, flexShrink: 0,
              background: area.disabled ? 'rgba(255,255,255,0.04)' : `${area.color}18`,
              border: `1px solid ${area.disabled ? 'rgba(255,255,255,0.08)' : `${area.color}35`}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 900,
              color: area.disabled ? 'var(--muted)' : area.color,
              letterSpacing: 0.5,
            }}>
              {area.code}
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <p style={{ fontSize: 16, fontWeight: 800, color: area.disabled ? 'var(--muted)' : 'var(--cream)' }}>
                  {area.label}
                </p>
                {area.disabled && (
                  <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--muted)', background: 'rgba(255,255,255,0.05)', padding: '2px 7px', borderRadius: 20, textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                    Próximamente
                  </span>
                )}
              </div>
              <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: !area.disabled && taskCounts[area.key] ? 8 : 0 }}>
                {area.description}
              </p>
              {!area.disabled && taskCounts[area.key] !== undefined && taskCounts[area.key] > 0 && (
                <span style={{ fontSize: 10, fontWeight: 700, color: area.color, background: `${area.color}15`, padding: '3px 9px', borderRadius: 20 }}>
                  {taskCounts[area.key]} tareas activas
                </span>
              )}
            </div>

            {!area.disabled
              ? <ChevronRight size={18} color={area.color} style={{ flexShrink: 0 }} />
              : <Lock size={15} color="var(--muted)" style={{ flexShrink: 0 }} />
            }
          </div>
        ))}
      </div>
    </div>
  )
}
