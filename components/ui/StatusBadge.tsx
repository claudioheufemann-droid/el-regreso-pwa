import { TaskStatus, STATUS_CFG } from '@/lib/gestion-types'

export default function StatusBadge({ status }: { status: TaskStatus }) {
  const cfg = STATUS_CFG[status]
  const isLate = status === 'Atrasada'
  return (
    <span
      className={isLate ? 'pulse' : ''}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: '2px 8px', borderRadius: 2,
        background: cfg.bg, border: `1px solid ${cfg.color}33`,
        fontSize: 9, fontWeight: 600, color: cfg.color, letterSpacing: 0.9,
        textTransform: 'uppercase', whiteSpace: 'nowrap',
      }}>
      {isLate && <span style={{ width: 5, height: 5, borderRadius: '50%', background: cfg.color, display: 'inline-block' }} />}
      {cfg.label}
    </span>
  )
}
