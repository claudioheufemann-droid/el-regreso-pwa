import { RcTask } from '@/lib/gestion-types'

export default function ProgressStrip({ tasks }: { tasks: RcTask[] }) {
  const total = tasks.length
  if (total === 0) return <div style={{ height: 3, background: '#1A1A1A', borderRadius: 2 }} />

  const segments = [
    { statuses: ['Completada'], color: '#4A7A3A' },
    { statuses: ['En Proceso'], color: '#E67E22' },
    { statuses: ['Por Aprobar'], color: '#D4AF37' },
    { statuses: ['Atrasada'], color: '#FF4444' },
    { statuses: ['Asignada', 'Rechazada'], color: '#2A2522' },
  ]

  return (
    <div style={{ display: 'flex', height: 3, borderRadius: 2, overflow: 'hidden', gap: 1 }}>
      {segments.map(({ statuses, color }) => {
        const count = tasks.filter(t => statuses.includes(t.estado)).length
        if (count === 0) return null
        return (
          <div key={color} style={{ flex: count, background: color, minWidth: 2 }} />
        )
      })}
    </div>
  )
}
