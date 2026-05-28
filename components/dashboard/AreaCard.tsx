'use client'

import { RcTask, AREA_CFG, STATUS_CFG, TaskStatus } from '@/lib/gestion-types'
import ProgressStrip from '@/components/ui/ProgressStrip'

const STATUS_DOTS: TaskStatus[] = ['Asignada', 'En Proceso', 'Por Aprobar', 'Atrasada', 'Completada']

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function getUrgency(tasks: RcTask[]): { label: string; color: string } | null {
  const active = tasks.filter(t => t.estado !== 'Completada' && t.estado !== 'Rechazada')
  if (!active.length) return null
  const today    = toDateStr(new Date())
  const tomorrow = toDateStr(new Date(Date.now() + 86400000))
  const in3days  = toDateStr(new Date(Date.now() + 3 * 86400000))
  if (active.some(t => t.plazo < today))       return null // overdue shown via ⚠ badge
  if (active.some(t => t.plazo === today))     return { label: 'HOY',    color: '#FF4D4D' }
  if (active.some(t => t.plazo === tomorrow))  return { label: 'MAÑANA', color: '#E67E22' }
  if (active.some(t => t.plazo === in3days))   return { label: '3 DÍAS', color: '#D4AF37' }
  return null
}

export default function AreaCard({ area, tasks, onClick }: { area: string; tasks: RcTask[]; onClick: () => void }) {
  const cfg        = AREA_CFG[area] ?? { color: '#D4AF37', dim: '#141007', code: '??' }
  const atrasadas  = tasks.filter(t => t.estado === 'Atrasada').length
  const activas    = tasks.filter(t => t.estado !== 'Completada' && t.estado !== 'Rechazada').length
  const completadas = tasks.filter(t => t.estado === 'Completada').length
  const pct        = tasks.length > 0 ? Math.round((completadas / tasks.length) * 100) : 0
  const urgency    = getUrgency(tasks)
  const barColor   = pct >= 80 ? '#4A7A3A' : pct >= 50 ? '#D4AF37' : cfg.color

  return (
    <div
      onClick={onClick}
      className="touch-active cursor-pointer card-hover"
      style={{
        background: 'var(--surface)',
        border: `1px solid ${atrasadas > 0 ? 'rgba(255,77,77,0.22)' : cfg.color + '20'}`,
        borderRadius: 22,
        padding: '22px 20px 16px',
        position: 'relative',
        overflow: 'hidden',
        transition: 'border-color 0.15s, box-shadow 0.15s, transform 0.15s',
      }}
      onMouseEnter={e => {
        const el = e.currentTarget as HTMLDivElement
        el.style.borderColor = atrasadas > 0 ? 'rgba(255,77,77,0.5)' : `${cfg.color}55`
        el.style.boxShadow = `0 4px 24px ${cfg.color}18`
      }}
      onMouseLeave={e => {
        const el = e.currentTarget as HTMLDivElement
        el.style.borderColor = atrasadas > 0 ? 'rgba(255,77,77,0.22)' : `${cfg.color}20`
        el.style.boxShadow = ''
      }}
    >
      {/* Accent top line */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 2,
        background: `linear-gradient(90deg, ${cfg.color}70, transparent)`,
      }} />

      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 18 }}>
        {/* Squircle icon */}
        <div style={{
          width: 44, height: 44, borderRadius: 16,
          background: cfg.dim, border: `1px solid ${cfg.color}30`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 12, fontWeight: 900, color: cfg.color, flexShrink: 0,
          letterSpacing: 0.5,
        }}>
          {cfg.code}
        </div>

        {/* Badge: overdue > urgency > done */}
        {atrasadas > 0 ? (
          <div className="pulse" style={{
            fontSize: 9, fontWeight: 700, color: '#FF4D4D',
            background: 'rgba(255,77,77,0.1)', border: '1px solid rgba(255,77,77,0.25)',
            borderRadius: 'var(--radius-pill)', padding: '3px 8px',
          }}>
            {atrasadas} ⚠
          </div>
        ) : urgency ? (
          <div style={{
            fontSize: 9, fontWeight: 800, color: urgency.color,
            background: `${urgency.color}15`, border: `1px solid ${urgency.color}30`,
            borderRadius: 'var(--radius-pill)', padding: '3px 9px',
            letterSpacing: 0.8,
          }}>
            {urgency.label}
          </div>
        ) : pct === 100 && tasks.length > 0 ? (
          <span style={{ fontSize: 15 }}>✅</span>
        ) : null}
      </div>

      {/* Area name + count */}
      <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--cream)', marginBottom: 4, letterSpacing: -0.4 }}>
        {area}
      </div>
      <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 16 }}>
        {activas} activa{activas !== 1 ? 's' : ''} · {completadas} lista{completadas !== 1 ? 's' : ''}
      </div>

      {/* Progress strip */}
      <ProgressStrip tasks={tasks} />

      {/* Footer: dots + percentage */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {STATUS_DOTS.map(s => {
            const count = tasks.filter(t => t.estado === s).length
            if (count === 0) return null
            return (
              <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                <div style={{ width: 5, height: 5, borderRadius: '50%', background: STATUS_CFG[s].color }} />
                <span style={{ fontSize: 9, color: 'var(--muted)' }}>{count}</span>
              </div>
            )
          })}
        </div>
        <span style={{
          fontSize: 14, fontWeight: 900, letterSpacing: -0.5,
          color: pct > 0 ? barColor : 'rgba(128,128,128,0.2)',
        }}>{pct}%</span>
      </div>

      {/* CTA */}
      <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${cfg.color}12`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: cfg.color, opacity: 0.65, letterSpacing: 0.5 }}>Ver área</span>
        <span style={{ fontSize: 12, color: cfg.color, opacity: 0.5 }}>→</span>
      </div>
    </div>
  )
}
