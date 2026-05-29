'use client'

import { useState, useEffect, useMemo } from 'react'
import { RcTask, RcUser, AREA_CFG, MACRO_AREAS, MacroKey, STATUS_CFG } from '@/lib/gestion-types'
import NewTaskModal from '@/components/modals/NewTaskModal'
import TaskDetailModal from '@/components/modals/TaskDetailModal'

interface Props {
  tasks: RcTask[]
  users: RcUser[]
  userName: string
  isAdmin: boolean
  currentUserId: string
  currentMacroArea: string | null
  availableAreas: string[]
  onTaskUpdated: (t: RcTask) => void
  onTaskDeleted: (id: string) => void
  onTaskCreated: (t: RcTask) => void
  onNavigate: (view: string) => void
}

function getTimeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 60)    return 'hace un momento'
  if (diff < 3600)  return `hace ${Math.floor(diff / 60)} min`
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)}h`
  return `hace ${Math.floor(diff / 86400)}d`
}

function Sparkline({ color, up = true }: { color: string; up?: boolean }) {
  const pts = up
    ? '0,28 8,24 16,22 24,18 32,20 40,14 48,10 56,8 64,12 72,6'
    : '0,10 8,14 16,12 24,18 32,16 40,20 48,22 56,20 64,24 72,28'
  return (
    <svg width={72} height={36} style={{ opacity: 0.55 }}>
      <defs>
        <linearGradient id={`sg-${color.replace('#','')}`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={color} stopOpacity="0.4" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function DonutChart({ segments, size = 100, stroke = 14, label, sub }: {
  segments: { value: number; color: string }[]
  size?: number; stroke?: number; label: string; sub: string
}) {
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const total = segments.reduce((s, x) => s + x.value, 0)
  let offset = 0
  const arcs = segments.map(x => {
    const dash = total > 0 ? (x.value / total) * circ : 0
    const arc = { dash, offset: circ - offset, color: x.color }
    offset += dash
    return arc
  })
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(128,128,128,0.08)" strokeWidth={stroke} />
        {arcs.map((arc, i) => (
          <circle key={i} cx={size/2} cy={size/2} r={r} fill="none"
            stroke={arc.color} strokeWidth={stroke}
            strokeDasharray={`${arc.dash} ${circ}`}
            strokeDashoffset={arc.offset} strokeLinecap="butt" />
        ))}
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: 20, fontWeight: 900, color: 'var(--cream)', lineHeight: 1 }}>{label}</div>
        <div style={{ fontSize: 8, color: 'var(--muted)', marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.5 }}>{sub}</div>
      </div>
    </div>
  )
}

function RingChart({ pct }: { pct: number }) {
  const size = 130, stroke = 14
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const filled = (pct / 100) * circ
  const color = pct >= 80 ? '#22C55E' : pct >= 50 ? '#D4AF37' : '#E74C3C'
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(128,128,128,0.08)" strokeWidth={stroke} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={`${filled} ${circ - filled}`} strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 0.6s ease', filter: `drop-shadow(0 0 6px ${color}60)` }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: 26, fontWeight: 900, color, lineHeight: 1 }}>{pct}%</div>
      </div>
    </div>
  )
}

type TabKey = 'todas' | 'en-proceso' | 'atrasadas' | 'sin-iniciar' | 'completadas'

export default function HomeDashboard({ tasks, users, userName, isAdmin, currentUserId, currentMacroArea, availableAreas, onTaskUpdated, onTaskDeleted, onTaskCreated, onNavigate }: Props) {
  const [activeTab, setActiveTab] = useState<TabKey>('todas')
  const [search, setSearch] = useState('')
  const [showNewTask, setShowNewTask] = useState(false)
  const [selectedTask, setSelectedTask] = useState<RcTask | null>(null)
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({})

  useEffect(() => {
    fetch('/api/analytics').then(r => r.json()).then(d => setCommentCounts(d ?? {})).catch(() => {})
  }, [])

  const today = new Date()
  const dayName = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'][today.getDay()]
  const monthName = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'][today.getMonth()]
  const dateStr = `${dayName} ${today.getDate()} de ${monthName} de ${today.getFullYear()}`
  const firstName = userName.split(' ')[0]

  const macroConfig = currentMacroArea ? MACRO_AREAS[currentMacroArea as MacroKey] : null
  const activeTasks = tasks.filter(t => t.area !== 'Mi Cerebro')

  const kpiAsignadas   = activeTasks.filter(t => t.estado === 'Asignada').length
  const kpiEnProceso   = activeTasks.filter(t => t.estado === 'En Proceso').length
  const kpiCompletadas = activeTasks.filter(t => t.estado === 'Completada').length
  const kpiAtrasadas   = activeTasks.filter(t => t.estado === 'Atrasada').length
  const kpiAprobar     = activeTasks.filter(t => t.estado === 'Por Aprobar').length
  const kpiTotal       = activeTasks.length
  const cumplimiento   = kpiTotal > 0 ? Math.round((kpiCompletadas / kpiTotal) * 100) : 0

  const priAlta  = activeTasks.filter(t => t.prioridad_maxima && t.estado !== 'Completada').length
  const priMedia = activeTasks.filter(t => !t.prioridad_maxima && t.estado !== 'Completada' && t.estado !== 'Rechazada').length
  const priBaja  = kpiCompletadas
  const priMax   = Math.max(priAlta, priMedia, priBaja, 1)

  const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`

  const proximos = useMemo(() => [...activeTasks]
    .filter(t => t.estado !== 'Completada' && t.estado !== 'Rechazada' && t.plazo >= todayStr)
    .sort((a, b) => a.plazo.localeCompare(b.plazo))
    .slice(0, 3), [activeTasks, todayStr])

  const recentActivity = useMemo(() => [...activeTasks]
    .sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))
    .slice(0, 6)
    .map(t => {
      const user = users.find(u => u.id === t.responsable_id)
      const type = t.estado === 'Completada' ? 'completada' : t.estado === 'En Proceso' ? 'proceso' : 'asignada'
      return { type, task: t, who: user?.nombre?.split(' ').map((w,i) => i === 0 ? w : w[0]+'.').join(' ') ?? 'Alguien', time: t.created_at ? getTimeAgo(t.created_at) : 'hace un momento' }
    }), [activeTasks, users])

  const tableTasks = useMemo(() => {
    let list = [...activeTasks]
    if (activeTab === 'en-proceso')  list = list.filter(t => t.estado === 'En Proceso')
    if (activeTab === 'atrasadas')   list = list.filter(t => t.estado === 'Atrasada')
    if (activeTab === 'sin-iniciar') list = list.filter(t => t.estado === 'Asignada')
    if (activeTab === 'completadas') list = list.filter(t => t.estado === 'Completada')
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(t => t.titulo.toLowerCase().includes(q) || t.area.toLowerCase().includes(q))
    }
    return list.sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))
  }, [activeTasks, activeTab, search])

  function vencimientoColor(plazo: string): string {
    const diff = Math.ceil((new Date(plazo).getTime() - today.getTime()) / 86400000)
    if (diff < 0) return '#FF4444'
    if (diff <= 1) return '#E67E22'
    if (diff <= 3) return '#D4AF37'
    return 'var(--muted)'
  }

  function daysLabel(plazo: string): string {
    const diff = Math.ceil((new Date(plazo).getTime() - today.getTime()) / 86400000)
    if (diff < 0)   return `Hace ${Math.abs(diff)}d`
    if (diff === 0) return 'Hoy'
    if (diff === 1) return 'Mañana'
    return `${diff} días`
  }

  function formatPlazo(plazo: string): string {
    const [, m, d] = plazo.split('-')
    const MONTHS = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
    return `${parseInt(d)} ${MONTHS[parseInt(m)-1]}`
  }

  function formatPlazoDay(plazo: string) {
    const [, m, d] = plazo.split('-')
    const MONTHS = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC']
    return { day: parseInt(d), month: MONTHS[parseInt(m)-1] }
  }

  const semanaVencen = activeTasks.filter(t => {
    const diff = Math.ceil((new Date(t.plazo).getTime() - today.getTime()) / 86400000)
    return diff >= 0 && diff <= 7 && t.estado !== 'Completada'
  }).length

  const avgDays = useMemo(() => {
    const completadas = activeTasks.filter(t => t.estado === 'Completada' && t.created_at && t.plazo)
    if (completadas.length === 0) return 0
    const total = completadas.reduce((s, t) => {
      const diff = (new Date(t.plazo).getTime() - new Date(t.created_at!).getTime()) / 86400000
      return s + Math.abs(diff)
    }, 0)
    return Math.round(total / completadas.length * 10) / 10
  }, [activeTasks])

  const activityColor: Record<string, string> = { completada: '#22C55E', proceso: '#E67E22', asignada: '#5B8AA8' }
  const activityIcon: Record<string, string> = { completada: '✓', proceso: '↻', asignada: '↗' }
  const activityText: Record<string, (w: string) => string> = {
    completada: w => `${w} completó`,
    proceso: w => `${w} inició`,
    asignada: w => `Tarea asignada a ${w}`,
  }

  const areaStats = Object.values(MACRO_AREAS).flatMap(m => [...m.areas])
    .filter(area => activeTasks.some(t => t.area === area))
    .map(area => {
      const ac = AREA_CFG[area]
      const total = activeTasks.filter(t => t.area === area).length
      const done  = activeTasks.filter(t => t.area === area && t.estado === 'Completada').length
      return { area, ac, total, done }
    })

  const card: React.CSSProperties = {
    background: 'var(--surface)',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: 20,
    padding: '20px 22px',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* HEADER */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          {macroConfig && (
            <div style={{ fontSize: 10, fontWeight: 700, color: macroConfig.color, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4 }}>
              {macroConfig.code} · {macroConfig.label}
            </div>
          )}
          <div style={{ fontSize: 26, fontWeight: 900, color: 'var(--cream)', letterSpacing: -0.5, lineHeight: 1 }}>
            ¡Buenos días, {firstName}! 👋
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4, textTransform: 'capitalize' }}>{dateStr}</div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ position: 'relative' }}>
            <button style={{ background: 'var(--surface)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 16 }}>🔔</button>
            {(kpiAtrasadas + kpiAprobar) > 0 && (
              <span style={{ position: 'absolute', top: -4, right: -4, background: '#E74C3C', color: '#fff', borderRadius: '50%', width: 16, height: 16, fontSize: 8, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {kpiAtrasadas + kpiAprobar}
              </span>
            )}
          </div>
          <button onClick={() => setShowNewTask(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', background: 'var(--gold)', color: '#0A0A0A', border: 'none', borderRadius: 12, cursor: 'pointer', fontSize: 13, fontWeight: 800 }}>
            + Nueva tarea
          </button>
        </div>
      </div>

      {/* ── TOP ROW: 5 KPI CARDS ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1.1fr', gap: 14 }}>

        {/* Asignadas */}
        <div style={{
          borderRadius: 20, padding: '18px 20px', cursor: 'pointer', position: 'relative', overflow: 'hidden',
          background: 'linear-gradient(135deg, #0f1f3d 0%, #0a1628 100%)',
          border: '1px solid rgba(91,138,168,0.3)',
          boxShadow: '0 4px 24px rgba(91,138,168,0.12)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ width: 38, height: 38, borderRadius: 12, background: 'rgba(91,138,168,0.2)', border: '1px solid rgba(91,138,168,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5B8AA8" strokeWidth="2" strokeLinecap="round"><rect x="9" y="2" width="6" height="4" rx="1"/><path d="M3 6h18v16H3z"/><path d="M8 12h8M8 16h5"/></svg>
            </div>
            <button onClick={() => setActiveTab('todas')} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(91,138,168,0.12)', border: '1px solid rgba(91,138,168,0.2)', borderRadius: 8, padding: '4px 10px', cursor: 'pointer', fontSize: 10, color: '#5B8AA8', fontWeight: 700 }}>
              Ver todas →
            </button>
          </div>
          <div style={{ fontSize: 48, fontWeight: 900, color: '#5B8AA8', lineHeight: 1, marginBottom: 6, letterSpacing: -2 }}>{kpiAsignadas}</div>
          <div style={{ fontSize: 10, fontWeight: 800, color: '#5B8AA8', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 3 }}>Asignadas</div>
          <div style={{ fontSize: 10, color: 'rgba(91,138,168,0.65)' }}>• Requieren tu atención</div>
          <div style={{ position: 'absolute', bottom: 14, right: 16 }}><Sparkline color="#5B8AA8" up /></div>
        </div>

        {/* En proceso */}
        <div style={{
          borderRadius: 20, padding: '18px 20px', cursor: 'pointer', position: 'relative', overflow: 'hidden',
          background: 'linear-gradient(135deg, #2a1500 0%, #1a0e00 100%)',
          border: '1px solid rgba(230,126,34,0.3)',
          boxShadow: '0 4px 24px rgba(230,126,34,0.12)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ width: 38, height: 38, borderRadius: 12, background: 'rgba(230,126,34,0.2)', border: '1px solid rgba(230,126,34,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#E67E22" strokeWidth="2" strokeLinecap="round"><path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
            </div>
            <button style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(230,126,34,0.12)', border: '1px solid rgba(230,126,34,0.2)', borderRadius: 8, padding: '4px 10px', cursor: 'pointer', fontSize: 10, color: '#E67E22', fontWeight: 700 }}>
              Ver todas →
            </button>
          </div>
          <div style={{ fontSize: 48, fontWeight: 900, color: '#E67E22', lineHeight: 1, marginBottom: 6, letterSpacing: -2 }}>{kpiEnProceso}</div>
          <div style={{ fontSize: 10, fontWeight: 800, color: '#E67E22', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 3 }}>En Proceso</div>
          <div style={{ fontSize: 10, color: 'rgba(230,126,34,0.65)' }}>• En ejecución activa</div>
          <div style={{ position: 'absolute', bottom: 14, right: 16 }}><Sparkline color="#E67E22" up /></div>
        </div>

        {/* Completadas */}
        <div style={{
          borderRadius: 20, padding: '18px 20px', cursor: 'pointer', position: 'relative', overflow: 'hidden',
          background: 'linear-gradient(135deg, #0a1f0e 0%, #061209 100%)',
          border: '1px solid rgba(34,197,94,0.3)',
          boxShadow: '0 4px 24px rgba(34,197,94,0.10)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ width: 38, height: 38, borderRadius: 12, background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>
            </div>
            <button style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(34,197,94,0.10)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 8, padding: '4px 10px', cursor: 'pointer', fontSize: 10, color: '#22C55E', fontWeight: 700 }}>
              Ver todas →
            </button>
          </div>
          <div style={{ fontSize: 48, fontWeight: 900, color: '#22C55E', lineHeight: 1, marginBottom: 6, letterSpacing: -2 }}>{kpiCompletadas}</div>
          <div style={{ fontSize: 10, fontWeight: 800, color: '#22C55E', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 3 }}>Completadas</div>
          <div style={{ fontSize: 10, color: 'rgba(34,197,94,0.65)' }}>• Completadas exitosamente</div>
          <div style={{ position: 'absolute', bottom: 14, right: 16 }}><Sparkline color="#22C55E" up /></div>
        </div>

        {/* Atrasadas */}
        <div style={{
          borderRadius: 20, padding: '18px 20px', cursor: 'pointer', position: 'relative', overflow: 'hidden',
          background: kpiAtrasadas > 0
            ? 'linear-gradient(135deg, #2a0808 0%, #1a0404 100%)'
            : 'linear-gradient(135deg, #1a0f0f 0%, #110a0a 100%)',
          border: `1px solid ${kpiAtrasadas > 0 ? 'rgba(231,76,60,0.35)' : 'rgba(231,76,60,0.15)'}`,
          boxShadow: kpiAtrasadas > 0 ? '0 4px 24px rgba(231,76,60,0.15)' : 'none',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ width: 38, height: 38, borderRadius: 12, background: 'rgba(231,76,60,0.15)', border: '1px solid rgba(231,76,60,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#E74C3C" strokeWidth="2" strokeLinecap="round"><path d="m10.29 3.86-8.26 14.28A1 1 0 0 0 2.9 20h16.2a1 1 0 0 0 .87-1.5L11.71 3.86a1 1 0 0 0-1.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            </div>
            <button style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(231,76,60,0.10)', border: '1px solid rgba(231,76,60,0.2)', borderRadius: 8, padding: '4px 10px', cursor: 'pointer', fontSize: 10, color: '#E74C3C', fontWeight: 700 }}>
              Ver todas →
            </button>
          </div>
          <div style={{ fontSize: 48, fontWeight: 900, color: kpiAtrasadas > 0 ? '#E74C3C' : 'rgba(231,76,60,0.35)', lineHeight: 1, marginBottom: 6, letterSpacing: -2 }}>{kpiAtrasadas}</div>
          <div style={{ fontSize: 10, fontWeight: 800, color: '#E74C3C', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 3 }}>Atrasadas</div>
          <div style={{ fontSize: 10, color: 'rgba(231,76,60,0.6)' }}>• {kpiAtrasadas > 0 ? 'Requieren acción inmediata' : 'Sin atrasos activos'}</div>
          <div style={{ position: 'absolute', bottom: 14, right: 16 }}><Sparkline color="#E74C3C" up={false} /></div>
        </div>

        {/* Próximos vencimientos */}
        <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--cream)' }}>Próximos vencimientos</div>
            <button onClick={() => onNavigate('calendar')} style={{ fontSize: 10, color: 'var(--gold)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}>Ver calendario →</button>
          </div>
          {proximos.length === 0 && (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'center' }}>Sin vencimientos próximos</div>
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {proximos.map(t => {
              const { day, month } = formatPlazoDay(t.plazo)
              const vColor = vencimientoColor(t.plazo)
              const cfg = AREA_CFG[t.area] ?? { color: '#888', code: '??' }
              const resps = (t.responsables ?? [users.find(u => u.id === t.responsable_id)].filter(Boolean)) as RcUser[]
              return (
                <div key={t.id} onClick={() => setSelectedTask(t)} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', cursor: 'pointer', padding: '8px 10px', borderRadius: 12, transition: 'background 0.15s' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(128,128,128,0.06)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <div style={{ textAlign: 'center', minWidth: 40, background: `${vColor}15`, border: `1px solid ${vColor}30`, borderRadius: 10, padding: '6px 4px', flexShrink: 0 }}>
                    <div style={{ fontSize: 20, fontWeight: 900, color: vColor, lineHeight: 1 }}>{day}</div>
                    <div style={{ fontSize: 8, color: vColor, fontWeight: 700, letterSpacing: 0.5 }}>{month}</div>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--cream)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: 4 }}>{t.titulo}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 8, background: t.prioridad_maxima ? 'rgba(220,38,38,0.12)' : 'rgba(212,175,55,0.1)', color: t.prioridad_maxima ? '#DC2626' : '#D4AF37', fontWeight: 700, border: `1px solid ${t.prioridad_maxima ? 'rgba(220,38,38,0.2)' : 'rgba(212,175,55,0.2)'}` }}>
                        {t.prioridad_maxima ? 'Alta' : 'Media'}
                      </span>
                      <div style={{ display: 'flex' }}>
                        {resps.slice(0, 3).map((u, i) => (
                          <div key={u.id} style={{ width: 18, height: 18, borderRadius: '50%', background: `${cfg.color}30`, border: `1.5px solid ${cfg.color}50`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 7, fontWeight: 800, color: cfg.color, marginLeft: i > 0 ? -5 : 0, zIndex: 10 - i }}>
                            {u.iniciales}
                          </div>
                        ))}
                        {resps.length > 3 && <div style={{ width: 18, height: 18, borderRadius: '50%', background: 'rgba(128,128,128,0.15)', border: '1.5px solid rgba(128,128,128,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 7, color: 'var(--muted)', marginLeft: -5 }}>+{resps.length - 3}</div>}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          {proximos.length > 0 && (
            <button onClick={() => onNavigate('calendar')} style={{ marginTop: 8, fontSize: 11, color: 'var(--gold)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700, textAlign: 'left' }}>
              Ver todos los vencimientos →
            </button>
          )}
        </div>
      </div>

      {/* ── SECOND ROW: ANALYTICS ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1.1fr', gap: 14 }}>

        {/* Resumen de tareas */}
        <div style={card}>
          <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--cream)', marginBottom: 16 }}>Resumen de tareas</div>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
            <DonutChart size={100} stroke={13} label={String(kpiTotal)} sub="Total"
              segments={[
                { value: kpiCompletadas, color: '#22C55E' },
                { value: kpiEnProceso,   color: '#E67E22' },
                { value: kpiAtrasadas,   color: '#E74C3C' },
                { value: kpiAsignadas,   color: '#5B8AA8' },
                { value: kpiAprobar,     color: '#9B59B6' },
              ]} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, flex: 1 }}>
              {[
                { label: 'Completadas', n: kpiCompletadas, color: '#22C55E' },
                { label: 'En proceso',  n: kpiEnProceso,   color: '#E67E22' },
                { label: 'Atrasadas',   n: kpiAtrasadas,   color: '#E74C3C' },
                { label: 'Pendientes',  n: kpiAsignadas + kpiAprobar, color: '#5B8AA8' },
              ].map(s => (
                <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 10, color: 'var(--muted)', flex: 1 }}>{s.label}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--cream)' }}>{s.n}</span>
                  <span style={{ fontSize: 9, color: 'var(--muted)', width: 28, textAlign: 'right' }}>{kpiTotal > 0 ? Math.round(s.n / kpiTotal * 100) : 0}%</span>
                </div>
              ))}
            </div>
          </div>
          <button style={{ marginTop: 14, fontSize: 11, color: 'var(--gold)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
            Ver detalle completo →
          </button>
        </div>

        {/* Tareas por prioridad */}
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--cream)' }}>Tareas por prioridad</div>
            <div style={{ color: 'var(--muted)', fontSize: 16, cursor: 'pointer' }}>⋯</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {[
              { label: 'Alta',  value: priAlta,  color: '#E74C3C', bg: 'rgba(231,76,60,0.15)' },
              { label: 'Media', value: priMedia, color: '#E67E22', bg: 'rgba(230,126,34,0.15)' },
              { label: 'Baja',  value: priBaja,  color: '#22C55E', bg: 'rgba(34,197,94,0.15)' },
            ].map(p => (
              <div key={p.label}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>{p.label}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: p.color }}>{p.value}</span>
                </div>
                <div style={{ height: 7, background: 'rgba(128,128,128,0.1)', borderRadius: 6, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${priMax > 0 ? Math.round(p.value / priMax * 100) : 0}%`, background: `linear-gradient(90deg, ${p.bg}, ${p.color})`, borderRadius: 6, transition: 'width 0.5s ease' }} />
                </div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 10, color: 'var(--muted)' }}>Total</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--cream)' }}>{kpiTotal} tareas</span>
          </div>
        </div>

        {/* Cumplimiento general */}
        <div style={{ ...card, display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--cream)', marginBottom: 16 }}>Cumplimiento general</div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
            <RingChart pct={cumplimiento} />
            <div style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'center' }}>de tareas completadas</div>
          </div>
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 10, color: 'var(--muted)' }}>Meta mensual</span>
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--cream)' }}>{cumplimiento}% / 100%</span>
            </div>
            <div style={{ height: 5, background: 'rgba(128,128,128,0.1)', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${cumplimiento}%`, background: cumplimiento >= 80 ? '#22C55E' : cumplimiento >= 50 ? '#D4AF37' : '#E74C3C', borderRadius: 4 }} />
            </div>
          </div>
        </div>

        {/* Actividad reciente */}
        <div style={{ ...card, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--cream)' }}>Actividad reciente</div>
            <button style={{ fontSize: 10, color: 'var(--gold)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}>Ver toda →</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0, flex: 1 }}>
            {recentActivity.length === 0 && <div style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'center', padding: '20px 0' }}>Sin actividad reciente</div>}
            {recentActivity.map((item, idx) => {
              const color = activityColor[item.type]
              const icon = activityIcon[item.type]
              const cfg = AREA_CFG[item.task.area] ?? { color: '#888' }
              return (
                <div key={item.task.id + idx} onClick={() => setSelectedTask(item.task)}
                  style={{ display: 'flex', gap: 10, padding: '7px 0', borderBottom: idx < recentActivity.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none', cursor: 'pointer', alignItems: 'flex-start' }}>
                  <div style={{ width: 26, height: 26, borderRadius: 8, background: `${color}18`, border: `1px solid ${color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color, fontWeight: 900, flexShrink: 0, marginTop: 1 }}>
                    {icon}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.3 }}>
                      <span style={{ fontWeight: 600, color: 'var(--cream)' }}>{item.who}</span>
                      {' '}{item.type === 'completada' ? 'completó' : item.type === 'proceso' ? 'inició' : 'asignó'}
                      {' '}<span style={{ fontWeight: 700, color: cfg.color }}>{item.task.titulo.length > 22 ? item.task.titulo.slice(0, 22) + '…' : item.task.titulo}</span>
                    </div>
                    <div style={{ fontSize: 9, color: 'rgba(128,128,128,0.4)', marginTop: 2 }}>{item.time}</div>
                  </div>
                </div>
              )
            })}
          </div>
          <button style={{ marginTop: 10, fontSize: 11, color: 'var(--gold)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700, textAlign: 'left' }}>
            Ver toda la actividad →
          </button>
        </div>
      </div>

      {/* ── THIRD ROW: OPERATIONAL ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>

        {/* Tareas atrasadas */}
        <div style={{
          ...card,
          background: kpiAtrasadas > 0 ? 'linear-gradient(135deg, #1f0a0a 0%, #130606 100%)' : 'var(--surface)',
          border: `1px solid ${kpiAtrasadas > 0 ? 'rgba(231,76,60,0.25)' : 'rgba(255,255,255,0.06)'}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(231,76,60,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>🕐</div>
              <span style={{ fontSize: 12, fontWeight: 800, color: kpiAtrasadas > 0 ? '#E74C3C' : 'var(--muted)' }}>Tareas atrasadas</span>
            </div>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: kpiAtrasadas > 0 ? 'rgba(231,76,60,0.12)' : 'rgba(128,128,128,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>
              {kpiAtrasadas > 0 ? '⚠' : '✓'}
            </div>
          </div>
          <div style={{ fontSize: 44, fontWeight: 900, color: kpiAtrasadas > 0 ? '#E74C3C' : '#22C55E', lineHeight: 1, marginBottom: 6 }}>{kpiAtrasadas}</div>
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>{kpiAtrasadas > 0 ? 'Requieren atención inmediata' : 'Sin atrasos activos'}</div>
          {kpiAtrasadas > 0 && (
            <div style={{ marginTop: 12 }}>
              {/* Mini scatter plot decoration */}
              <svg width="100%" height="36" viewBox="0 0 200 36">
                {Array.from({ length: 12 }, (_, i) => (
                  <circle key={i} cx={10 + i * 16} cy={18 + (Math.sin(i * 1.3) * 10)} r={2 + Math.random() * 2} fill="rgba(231,76,60,0.3)" />
                ))}
              </svg>
            </div>
          )}
        </div>

        {/* Tareas por área */}
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--cream)' }}>Tareas por área</div>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(212,175,55,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>◈</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {areaStats.length === 0 && <div style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'center', padding: '12px 0' }}>Sin tareas activas</div>}
            {areaStats.slice(0, 5).map(({ area, ac, total, done }) => {
              const pct = total > 0 ? Math.round((done / total) * 100) : 0
              return (
                <div key={area}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                    <div style={{ width: 22, height: 22, borderRadius: 6, flexShrink: 0, background: `${ac.color}18`, border: `1px solid ${ac.color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 7, fontWeight: 900, color: ac.color }}>
                      {ac.code}
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--muted)', flex: 1 }}>{area}</span>
                    <span style={{ fontSize: 11, fontWeight: 800, color: ac.color }}>{total}</span>
                  </div>
                  <div style={{ height: 5, background: 'rgba(128,128,128,0.08)', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: `linear-gradient(90deg, ${ac.color}60, ${ac.color})`, borderRadius: 4, transition: 'width 0.4s ease' }} />
                  </div>
                </div>
              )
            })}
          </div>
          <button style={{ marginTop: 14, fontSize: 11, color: 'var(--gold)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}>
            Ver todas las áreas →
          </button>
        </div>

        {/* Recordatorios activos */}
        <div style={{ ...card, position: 'relative', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#5B8AA8' }}>Recordatorios activos</div>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(91,138,168,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>🔔</div>
          </div>
          <div style={{ fontSize: 44, fontWeight: 900, color: '#5B8AA8', lineHeight: 1, marginBottom: 6 }}>
            {activeTasks.filter(t => ['Asignada', 'En Proceso'].includes(t.estado)).length}
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 12 }}>Tareas con recordatorios programados</div>
          {/* Bell decoration */}
          <div style={{ position: 'absolute', bottom: -10, right: -10, fontSize: 80, opacity: 0.06, transform: 'rotate(15deg)', pointerEvents: 'none' }}>🔔</div>
          <button style={{ fontSize: 11, color: '#5B8AA8', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}>
            Ver todos →
          </button>
        </div>
      </div>

      {/* ── TABLA DE TAREAS ── */}
      <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
        {/* Tabla header */}
        <div style={{ padding: '18px 24px 14px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--cream)' }}>Mis tareas</div>
            <div style={{ position: 'relative' }}>
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Buscar tarea..."
                style={{ borderRadius: 10, paddingLeft: 32, fontSize: 12, width: 200 }} />
              <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: 'var(--muted)', pointerEvents: 'none' }}>🔍</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid rgba(255,255,255,0.05)', marginBottom: -14 }}>
            {([
              { key: 'todas', label: 'Todas', n: activeTasks.length },
              { key: 'en-proceso', label: 'En proceso', n: kpiEnProceso },
              { key: 'atrasadas', label: 'Atrasadas', n: kpiAtrasadas },
              { key: 'sin-iniciar', label: 'Sin iniciar', n: kpiAsignadas },
              { key: 'completadas', label: 'Completadas', n: kpiCompletadas },
            ] as { key: TabKey; label: string; n: number }[]).map(tab => (
              <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                style={{ padding: '8px 14px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12,
                  fontWeight: activeTab === tab.key ? 700 : 500,
                  color: activeTab === tab.key ? 'var(--cream)' : 'var(--muted)',
                  borderBottom: activeTab === tab.key ? '2px solid var(--gold)' : '2px solid transparent',
                  marginBottom: -1, transition: 'all 0.15s' }}>
                {tab.label} <span style={{ fontSize: 10, opacity: 0.7 }}>{tab.n}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Columnas */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 90px 80px 120px 110px 110px 55px 45px', gap: 8, padding: '9px 24px', background: 'rgba(128,128,128,0.02)', borderBottom: '1px solid rgba(128,128,128,0.07)' }}>
          {['TAREA','RESPONSABLE','ÁREA','PRIORIDAD','VENCE','ESTADO','PROGRESO','COM.','ARCH.'].map((h, i) => (
            <div key={i} style={{ fontSize: 8, fontWeight: 800, color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase' }}>{h}</div>
          ))}
        </div>

        <div style={{ maxHeight: 300, overflowY: 'auto' }}>
          {tableTasks.length === 0 && (
            <div style={{ textAlign: 'center', padding: '32px 20px' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>No hay tareas en esta categoría</div>
            </div>
          )}
          {tableTasks.map((t, idx) => {
            const user = t.responsable ?? users.find(u => u.id === t.responsable_id)
            const cfg = AREA_CFG[t.area] ?? { color: '#888', code: '??' }
            const vColor = vencimientoColor(t.plazo)
            const progPct = t.estado === 'Completada' ? 100 : t.estado === 'En Proceso' ? 50 : t.estado === 'Por Aprobar' ? 80 : 0
            const comments = commentCounts[t.id] ?? 0
            const stCfg = STATUS_CFG[t.estado as keyof typeof STATUS_CFG] ?? { color: '#888' }
            return (
              <div key={t.id} onClick={() => setSelectedTask(t)}
                style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 90px 80px 120px 110px 110px 55px 45px', gap: 8, padding: '11px 24px', borderBottom: idx < tableTasks.length - 1 ? '1px solid rgba(128,128,128,0.05)' : 'none', cursor: 'pointer', transition: 'background 0.12s', alignItems: 'center' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(128,128,128,0.04)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                {/* Tarea */}
                <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start', minWidth: 0 }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: t.estado === 'Atrasada' ? '#E74C3C' : t.estado === 'En Proceso' ? '#E67E22' : t.estado === 'Completada' ? '#22C55E' : '#5B8AA8', flexShrink: 0, marginTop: 4 }} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--cream)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.titulo}</div>
                    {t.descripcion && <div style={{ fontSize: 10, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 1 }}>{t.descripcion}</div>}
                  </div>
                </div>
                {/* Responsable */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 22, height: 22, borderRadius: '50%', background: cfg.color + '22', border: `1px solid ${cfg.color}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 800, color: cfg.color, flexShrink: 0 }}>{user?.iniciales ?? '??'}</div>
                  <span style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user?.nombre?.split(' ')[0] ?? '—'}</span>
                </div>
                {/* Área */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <div style={{ width: 18, height: 18, borderRadius: 5, flexShrink: 0, background: `${cfg.color}18`, border: `1px solid ${cfg.color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 7, fontWeight: 900, color: cfg.color }}>{cfg.code}</div>
                  <span style={{ fontSize: 10, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.area}</span>
                </div>
                {/* Prioridad */}
                <div>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: t.prioridad_maxima ? 'rgba(220,38,38,0.12)' : 'rgba(212,175,55,0.1)', color: t.prioridad_maxima ? '#DC2626' : '#D4AF37', border: `1px solid ${t.prioridad_maxima ? 'rgba(220,38,38,0.25)' : 'rgba(212,175,55,0.2)'}` }}>
                    {t.prioridad_maxima ? 'Alta' : 'Media'}
                  </span>
                </div>
                {/* Vence */}
                <div>
                  <div style={{ fontSize: 12, fontWeight: 800, color: vColor, lineHeight: 1.2 }}>{formatPlazo(t.plazo)}</div>
                  <div style={{ fontSize: 9, color: vColor, opacity: 0.75, marginTop: 1 }}>{daysLabel(t.plazo)}</div>
                  {t.created_at && <div style={{ fontSize: 8, color: 'rgba(128,128,128,0.4)', marginTop: 2 }}>Inicio {formatPlazo(t.created_at.split('T')[0])}</div>}
                </div>
                {/* Estado */}
                <div>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 20, background: `${stCfg.color}18`, color: stCfg.color, border: `1px solid ${stCfg.color}30`, whiteSpace: 'nowrap' }}>
                    {t.estado}
                  </span>
                </div>
                {/* Progreso */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <div style={{ flex: 1, height: 4, background: 'rgba(128,128,128,0.1)', borderRadius: 4, overflow: 'hidden', minWidth: 40 }}>
                    <div style={{ height: '100%', width: `${progPct}%`, background: progPct >= 80 ? '#22C55E' : progPct >= 40 ? '#D4AF37' : '#5B8AA8', borderRadius: 4 }} />
                  </div>
                  <span style={{ fontSize: 9, color: 'var(--muted)', flexShrink: 0 }}>{progPct}%</span>
                </div>
                {/* Comentarios */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                  <span style={{ fontSize: 10 }}>💬</span>
                  <span style={{ fontSize: 10, color: 'var(--muted)' }}>{comments}</span>
                </div>
                {/* Archivos */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                  <span style={{ fontSize: 10 }}>📎</span>
                  <span style={{ fontSize: 10, color: 'var(--muted)' }}>{t.evidencia_url || t.foto_antes_url ? 1 : 0}</span>
                </div>
              </div>
            )
          })}
        </div>

        <div style={{ padding: '12px 24px', borderTop: '1px solid rgba(128,128,128,0.06)', textAlign: 'center' }}>
          <button onClick={() => setActiveTab('todas')} style={{ fontSize: 12, color: 'var(--gold)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}>
            Ver todas las tareas →
          </button>
        </div>
      </div>

      {/* ── BOTTOM STATUS BAR ── */}
      <div style={{
        borderRadius: 20, padding: '18px 28px',
        background: 'linear-gradient(135deg, #0d0d0d 0%, #111 100%)',
        border: '1px solid rgba(255,255,255,0.06)',
        display: 'flex', alignItems: 'center', gap: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flex: 1.5, paddingRight: 28, borderRight: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ width: 42, height: 42, borderRadius: 12, background: 'linear-gradient(135deg, #1a1060, #0a0830)', border: '1px solid rgba(91,138,168,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>⚡</div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--cream)' }}>
              Todo <span style={{ color: '#5B8AA8' }}>bajo control</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>Mantén el ritmo, tu equipo va por buen camino.</div>
          </div>
        </div>
        {[
          { icon: '📋', value: kpiTotal, label: 'Total tareas' },
          { icon: '🕐', value: `${avgDays}d`, label: 'Tiempo promedio' },
          { icon: '✓', value: `${cumplimiento}%`, label: 'Cumplimiento' },
          { icon: '📅', value: semanaVencen, label: 'Vencen esta semana' },
        ].map((stat, i) => (
          <div key={i} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 12, paddingLeft: 28, borderRight: i < 3 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>
              {stat.icon}
            </div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 900, color: 'var(--cream)', lineHeight: 1 }}>{stat.value}</div>
              <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>{stat.label}</div>
            </div>
          </div>
        ))}
      </div>

      {showNewTask && (
        <NewTaskModal defaultArea={availableAreas[0] ?? 'Ventas'} availableAreas={availableAreas}
          users={users} onClose={() => setShowNewTask(false)}
          onCreated={t => { onTaskCreated(t); setShowNewTask(false) }} />
      )}
      {selectedTask && (
        <TaskDetailModal task={selectedTask} onClose={() => setSelectedTask(null)}
          onUpdate={t => { onTaskUpdated(t); setSelectedTask(null) }}
          onDelete={id => { onTaskDeleted(id); setSelectedTask(null) }}
          isAdmin={isAdmin} currentUserId={currentUserId} />
      )}
    </div>
  )
}
