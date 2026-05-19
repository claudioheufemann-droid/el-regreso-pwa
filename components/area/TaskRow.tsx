import { RcTask, STATUS_CFG, AREA_CFG } from '@/lib/gestion-types'
import Avatar from '@/components/ui/Avatar'
import { formatPlazo } from '@/lib/format'

interface Props {
  task: RcTask
  onClick: () => void
  selectable?: boolean
  selected?: boolean
  onToggle?: (id: string) => void
  showMeta?: boolean   // muestra área + todos los responsables
}

export default function TaskRow({ task, onClick, selectable, selected, onToggle, showMeta }: Props) {
  const plazo = formatPlazo(task.plazo)
  const done = task.estado === 'Completada'
  const sCfg = STATUS_CFG[task.estado]
  const hasEvidence = task.foto_antes_url || task.foto_despues_url
  const areaCfg = AREA_CFG[task.area]
  // Todos los responsables únicos
  const allResponsables = task.responsables && task.responsables.length > 0
    ? task.responsables
    : task.responsable ? [task.responsable] : []

  function handleClick() {
    if (selectable && onToggle) {
      onToggle(task.id)
    } else {
      onClick()
    }
  }

  return (
    <div
      onClick={handleClick}
      className="touch-active cursor-pointer task-row"
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 14,
        padding: '18px 20px 16px',
        background: selected ? 'rgba(212,175,55,0.06)' : 'var(--surface)',
        border: `1px solid var(--border)`,
        borderLeft: `4px solid ${selected ? '#D4AF37' : sCfg.color}`,
        borderRadius: 16,
        boxShadow: 'var(--card-shadow, none)',
        opacity: done && !selectable ? 0.45 : 1,
        transition: 'background 0.15s, box-shadow 0.15s',
      }}
    >
      {/* Checkbox (modo selección) o Status dot */}
      {selectable ? (
        <div style={{
          width: 22, height: 22, borderRadius: 7, flexShrink: 0,
          background: selected ? '#D4AF37' : 'transparent',
          border: `2px solid ${selected ? '#D4AF37' : 'rgba(128,128,128,0.25)'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 12, color: '#0A0A0A', fontWeight: 900,
          transition: 'all 0.15s',
        }}>
          {selected && '✓'}
        </div>
      ) : (
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: sCfg.color, flexShrink: 0, boxShadow: `0 0 6px ${sCfg.color}60` }} />
      )}

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Título — elemento dominante */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          {task.prioridad_maxima && <span style={{ fontSize: 13 }}>⚡</span>}
          <div style={{
            fontSize: 17, fontWeight: 800, color: done ? 'var(--muted)' : 'var(--cream)',
            textDecoration: done ? 'line-through' : 'none',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            letterSpacing: -0.4, lineHeight: 1.2,
          }}>
            {task.titulo}
          </div>
        </div>
        {/* Tags secundarios — claramente más pequeños */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, background: sCfg.bg, color: sCfg.color, fontWeight: 700, letterSpacing: 0.3, border: `1px solid ${sCfg.color}35` }}>
            {task.estado}
          </span>
          {task.sub_area && <span style={{ fontSize: 10, color: 'var(--muted)' }}>{task.sub_area}</span>}
          {hasEvidence && <span style={{ fontSize: 10, color: '#4A7A3A' }}>📸</span>}
          {task.nota_admin && <span style={{ fontSize: 10, color: '#D4AF37' }}>★</span>}
        </div>

        {/* Meta: área + responsables — solo cuando showMeta */}
        {showMeta && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 7, flexWrap: 'wrap' }}>
            {/* Área */}
            {areaCfg && (
              <span style={{
                fontSize: 8, fontWeight: 700, letterSpacing: 0.8,
                padding: '2px 6px', borderRadius: 6,
                background: `${areaCfg.color}18`, color: areaCfg.color,
                border: `1px solid ${areaCfg.color}30`,
              }}>
                {task.area}
              </span>
            )}
            {/* Responsables */}
            {allResponsables.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {allResponsables.slice(0, 3).map(r => (
                  <span key={r.id} style={{
                    fontSize: 8, fontWeight: 700,
                    padding: '2px 6px', borderRadius: 6,
                    background: 'rgba(128,128,128,0.1)', color: 'var(--muted)',
                    border: '1px solid rgba(128,128,128,0.15)',
                    whiteSpace: 'nowrap',
                  }}>
                    {r.nombre.split(' ')[0]}
                  </span>
                ))}
                {allResponsables.length > 3 && (
                  <span style={{ fontSize: 8, color: 'var(--muted)' }}>+{allResponsables.length - 3}</span>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right side */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5, flexShrink: 0 }}>
        <span style={{ fontSize: 10, fontWeight: 600, color: plazo.urgent ? '#FF6666' : 'var(--muted)', whiteSpace: 'nowrap' }}>
          {plazo.text}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          {task.contador_retrasos > 0 && (
            <span style={{ fontSize: 9, color: '#C8542A', background: 'rgba(200,84,42,0.1)', border: '1px solid rgba(200,84,42,0.2)', borderRadius: 8, padding: '1px 6px' }}>
              {task.contador_retrasos}R
            </span>
          )}
          {task.responsable && (
            <Avatar iniciales={task.responsable.iniciales} userId={task.responsable_id} size={24} />
          )}
        </div>
      </div>
    </div>
  )
}
