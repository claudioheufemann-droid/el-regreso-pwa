'use client'

import { useState, useEffect, useMemo } from 'react'
import { RcTask, RcUser, AREA_CFG, MACRO_AREAS, MacroKey, STATUS_CFG } from '@/lib/gestion-types'
import NewTaskModal from '@/components/modals/NewTaskModal'
import TaskDetailModal from '@/components/modals/TaskDetailModal'
import useIsDesktop from '@/lib/useIsDesktop'

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
    ? '0,30 10,26 20,24 30,20 40,22 50,16 60,12 70,10 80,14 90,8 100,6'
    : '0,8 10,12 20,10 30,16 40,14 50,20 60,22 70,20 80,24 90,26 100,28'
  return (
    <svg width={100} height={36} style={{ opacity: 0.5 }}>
      <defs>
        <linearGradient id={`sgf-${color.replace('#','')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function DonutChart({ segments, size = 120, stroke = 16, label, sub }: {
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
        <div style={{ fontSize: 24, fontWeight: 900, color: 'var(--cream)', lineHeight: 1 }}>{label}</div>
        <div style={{ fontSize: 9, color: 'var(--muted)', marginTop: 3, textTransform: 'uppercase', letterSpacing: 0.5 }}>{sub}</div>
      </div>
    </div>
  )
}

function RingChart({ pct }: { pct: number }) {
  const size = 150, stroke = 16
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const filled = (pct / 100) * circ
  const color = pct >= 80 ? '#22C55E' : pct >= 50 ? '#D4AF37' : '#E74C3C'
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(128,128,128,0.08)" strokeWidth={stroke} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={`${filled} ${circ - filled}`} strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 0.6s', filter: `drop-shadow(0 0 8px ${color}70)` }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: 32, fontWeight: 900, color, lineHeight: 1 }}>{pct}%</div>
      </div>
    </div>
  )
}

type TabKey = 'todas' | 'en-proceso' | 'atrasadas' | 'sin-iniciar' | 'completadas'

/* ─── KPI card helper ─── */
interface KpiCardProps {
  value: number; label: string; sub: string
  color: string; bg: string; border: string; glow: string
  icon: React.ReactNode; up?: boolean
  onClick?: () => void
}
function KpiCard({ value, label, sub, color, bg, border, glow, icon, up = true, onClick }: KpiCardProps) {
  // isDesktop is not available here since this is outside the main component,
  // so we pass compact via a data attribute workaround — instead we just use responsive values inline
  return (
    <div onClick={onClick} style={{
      borderRadius: 16, padding: '16px 16px 12px', position: 'relative', overflow: 'hidden',
      background: bg, border: `1px solid ${border}`,
      boxShadow: `0 4px 28px ${glow}`,
      cursor: onClick ? 'pointer' : 'default', minHeight: 140,
      display: 'flex', flexDirection: 'column',
    }}>
      {/* top row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ width: 36, height: 36, borderRadius: 11, background: `${color}22`, border: `1px solid ${color}40`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {icon}
        </div>
        <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>→</div>
      </div>
      {/* number */}
      <div style={{ fontSize: 42, fontWeight: 900, color, lineHeight: 1, letterSpacing: -2, marginBottom: 6 }}>{value}</div>
      {/* label */}
      <div style={{ fontSize: 9, fontWeight: 800, color, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 3 }}>{label}</div>
      {/* sub */}
      <div style={{ fontSize: 9, color: `${color}88`, display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6 }}>
        <span style={{ width: 4, height: 4, borderRadius: '50%', background: color, flexShrink: 0 }} />
        {sub}
      </div>
      {/* sparkline — en flujo, no superpuesta */}
      <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'flex-end', pointerEvents: 'none' }}>
        <Sparkline color={color} up={up} />
      </div>
    </div>
  )
}

export default function HomeDashboard({ tasks, users, userName, isAdmin, currentUserId, currentMacroArea, availableAreas, onTaskUpdated, onTaskDeleted, onTaskCreated, onNavigate }: Props) {
  const isDesktop = useIsDesktop()
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
      const nombre = user?.nombre?.split(' ').slice(0,2).map((w,i) => i===0 ? w : w[0]+'.').join(' ') ?? 'Alguien'
      const type = t.estado === 'Completada' ? 'completada' : t.estado === 'En Proceso' ? 'proceso' : 'asignada'
      return { type, task: t, who: nombre, time: t.created_at ? getTimeAgo(t.created_at) : 'hace un momento' }
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
    if (diff < 0) return '#FF4444'; if (diff <= 1) return '#E67E22'
    if (diff <= 3) return '#D4AF37'; return 'var(--muted)'
  }
  function daysLabel(plazo: string): string {
    const diff = Math.ceil((new Date(plazo).getTime() - today.getTime()) / 86400000)
    if (diff < 0) return `Hace ${Math.abs(diff)}d`; if (diff === 0) return 'Hoy'
    if (diff === 1) return 'Mañana'; return `${diff} días`
  }
  function formatPlazo(plazo: string): string {
    const [, m, d] = plazo.split('-')
    return `${parseInt(d)} ${['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'][parseInt(m)-1]}`
  }
  function formatPlazoDay(plazo: string) {
    const [, m, d] = plazo.split('-')
    return { day: parseInt(d), month: ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'][parseInt(m)-1] }
  }

  const semanaVencen = activeTasks.filter(t => {
    const diff = Math.ceil((new Date(t.plazo).getTime() - today.getTime()) / 86400000)
    return diff >= 0 && diff <= 7 && t.estado !== 'Completada'
  }).length

  const avgDays = useMemo(() => {
    const c = activeTasks.filter(t => t.estado === 'Completada' && t.created_at && t.plazo)
    if (!c.length) return 0
    return Math.round(c.reduce((s,t) => s + Math.abs((new Date(t.plazo).getTime() - new Date(t.created_at!).getTime()) / 86400000), 0) / c.length * 10) / 10
  }, [activeTasks])

  const areaStats = Object.values(MACRO_AREAS).flatMap(m => [...m.areas])
    .filter(area => activeTasks.some(t => t.area === area))
    .map(area => {
      const ac = AREA_CFG[area]; const total = activeTasks.filter(t => t.area === area).length
      return { area, ac, total, done: activeTasks.filter(t => t.area === area && t.estado === 'Completada').length }
    })

  const CARD: React.CSSProperties = { background: 'var(--surface)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 20, padding: '22px 24px' }
  const actColor: Record<string,string> = { completada:'#22C55E', proceso:'#E67E22', asignada:'#5B8AA8' }
  const actIcon:  Record<string,string> = { completada:'✓', proceso:'↻', asignada:'↗' }
  const actVerb:  Record<string,string> = { completada:'completó', proceso:'inició', asignada:'asignó' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* HEADER */}
      <div style={{ display: 'flex', alignItems: isDesktop ? 'center' : 'flex-start', justifyContent: 'space-between', flexDirection: isDesktop ? 'row' : 'column', gap: isDesktop ? 0 : 10 }}>
        <div>
          {macroConfig && <div style={{ fontSize: 10, fontWeight: 700, color: macroConfig.color, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4 }}>{macroConfig.code} · {macroConfig.label}</div>}
          <div style={{ fontSize: isDesktop ? 26 : 20, fontWeight: 900, color: 'var(--cream)', letterSpacing: -0.5 }}>¡Buenos días, {firstName}! 👋</div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3, textTransform: 'capitalize' }}>{dateStr}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignSelf: isDesktop ? 'auto' : 'flex-end' }}>
          <div style={{ position: 'relative' }}>
            <button style={{ background: 'var(--surface)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 15 }}>🔔</button>
            {(kpiAtrasadas + kpiAprobar) > 0 && <span style={{ position: 'absolute', top: -4, right: -4, background: '#E74C3C', color: '#fff', borderRadius: '50%', width: 16, height: 16, fontSize: 8, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{kpiAtrasadas + kpiAprobar}</span>}
          </div>
          <button onClick={() => setShowNewTask(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: isDesktop ? '10px 20px' : '8px 14px', background: 'var(--gold)', color: '#0A0A0A', border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: isDesktop ? 13 : 12, fontWeight: 800 }}>+ Nueva tarea</button>
        </div>
      </div>

      {/* ── LAYOUT MASTER: izquierda 1fr + sidebar derecho 280px (filas 1+2+3) ── */}
      <div style={{ display: 'grid', gridTemplateColumns: isDesktop ? '1fr 280px' : '1fr', gap: 14, alignItems: 'stretch' }}>

        {/* COLUMNA IZQUIERDA */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Fila 1 izquierda: 4 KPI cards (2x2 en mobile) */}
          <div style={{ display: 'grid', gridTemplateColumns: isDesktop ? 'repeat(4, 1fr)' : 'repeat(2, 1fr)', gap: 14 }}>
            <KpiCard value={kpiAsignadas} label="Asignadas" sub="Requieren tu atención"
              color="#5B8AA8" bg="linear-gradient(145deg,#0d1e36,#091425)" border="rgba(91,138,168,0.28)" glow="rgba(91,138,168,0.1)"
              icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#5B8AA8" strokeWidth="2" strokeLinecap="round"><rect x="9" y="2" width="6" height="4" rx="1"/><path d="M3 6h18v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="8" y1="16" x2="12" y2="16"/></svg>}
              up onClick={() => setActiveTab('todas')} />
            <KpiCard value={kpiEnProceso} label="En Proceso" sub="En ejecución activa"
              color="#E67E22" bg="linear-gradient(145deg,#261400,#170d00)" border="rgba(230,126,34,0.28)" glow="rgba(230,126,34,0.1)"
              icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#E67E22" strokeWidth="2" strokeLinecap="round"><path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>}
              up />
            <KpiCard value={kpiCompletadas} label="Completadas" sub="Completadas exitosamente"
              color="#22C55E" bg="linear-gradient(145deg,#081f0f,#041309)" border="rgba(34,197,94,0.28)" glow="rgba(34,197,94,0.08)"
              icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>}
              up />
            <KpiCard value={kpiAtrasadas} label="Atrasadas" sub="Requieren acción inmediata"
              color="#E74C3C" bg={kpiAtrasadas>0?"linear-gradient(145deg,#250a0a,#160505)":"linear-gradient(145deg,#181010,#100a0a)"} border="rgba(231,76,60,0.28)" glow="rgba(231,76,60,0.08)"
              icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#E74C3C" strokeWidth="2" strokeLinecap="round"><path d="m10.29 3.86-8.26 14.28A1 1 0 0 0 2.9 20h16.2a1 1 0 0 0 .87-1.5L11.71 3.86a1 1 0 0 0-1.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>}
              up={false} />
          </div>

          {/* Fila 2 izquierda: 3 analytics */}
          <div style={{ display: 'grid', gridTemplateColumns: isDesktop ? 'repeat(3, 1fr)' : '1fr', gap: 14 }}>

            {/* Resumen */}
            <div style={CARD}>
              <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--cream)', marginBottom: 18 }}>Resumen de tareas</div>
              <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                <DonutChart size={110} stroke={15} label={String(kpiTotal)} sub="Total"
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
                    <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
                      <span style={{ fontSize: 10, color: 'var(--muted)', flex: 1 }}>{s.label}</span>
                      <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--cream)' }}>{s.n}</span>
                      <span style={{ fontSize: 9, color: 'var(--muted)', width: 28, textAlign: 'right' }}>{kpiTotal>0?Math.round(s.n/kpiTotal*100):0}%</span>
                    </div>
                  ))}
                </div>
              </div>
              <button style={{ marginTop: 14, fontSize: 11, color: 'var(--gold)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                Ver detalle completo →
              </button>
            </div>

            {/* Prioridad */}
            <div style={CARD}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--cream)' }}>Tareas por prioridad</div>
                <span style={{ fontSize: 18, color: 'var(--muted)', cursor: 'pointer' }}>⋯</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                {[
                  { label: 'Alta',  value: priAlta,  color: '#E74C3C' },
                  { label: 'Media', value: priMedia, color: '#E67E22' },
                  { label: 'Baja',  value: priBaja,  color: '#22C55E' },
                ].map(p => (
                  <div key={p.label}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ fontSize: 11, color: 'var(--muted)' }}>{p.label}</span>
                      <span style={{ fontSize: 12, fontWeight: 800, color: p.color }}>{p.value}</span>
                    </div>
                    <div style={{ height: 8, background: 'rgba(128,128,128,0.08)', borderRadius: 6, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${priMax>0?Math.round(p.value/priMax*100):0}%`, background: `linear-gradient(90deg,${p.color}55,${p.color})`, borderRadius: 6, transition: 'width 0.5s' }} />
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 18, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>Total</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--cream)' }}>{kpiTotal} tareas</span>
              </div>
            </div>

            {/* Cumplimiento */}
            <div style={{ ...CARD, display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--cream)', marginBottom: 14 }}>Cumplimiento general</div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <RingChart pct={cumplimiento} />
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>de tareas completadas</div>
              </div>
              <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 7 }}>
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>Meta mensual</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--cream)' }}>{cumplimiento}% / 100%</span>
                </div>
                <div style={{ height: 6, background: 'rgba(128,128,128,0.08)', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${cumplimiento}%`, background: cumplimiento>=80?'#22C55E':cumplimiento>=50?'#D4AF37':'#E74C3C', borderRadius: 4 }} />
                </div>
              </div>
            </div>

          </div>

          {/* Fila 3 izquierda: Atrasadas + Por área + Recordatorios (mismo grid 3 cols) */}
          <div style={{ display: 'grid', gridTemplateColumns: isDesktop ? 'repeat(3, 1fr)' : '1fr', gap: 14 }}>

            {/* Tareas atrasadas */}
            <div style={{
              ...CARD,
              background: kpiAtrasadas>0 ? 'linear-gradient(145deg,#1e0909,#120505)' : 'var(--surface)',
              border: `1px solid ${kpiAtrasadas>0 ? 'rgba(231,76,60,0.25)' : 'rgba(255,255,255,0.06)'}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 9, background: 'rgba(231,76,60,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#E74C3C" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 800, color: kpiAtrasadas>0 ? '#E74C3C' : 'var(--muted)' }}>Tareas atrasadas</span>
                </div>
                <div style={{ width: 28, height: 28, borderRadius: 8, background: kpiAtrasadas>0 ? 'rgba(231,76,60,0.12)' : 'rgba(128,128,128,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15 }}>
                  {kpiAtrasadas > 0 ? '⚠' : '✓'}
                </div>
              </div>
              <div style={{ fontSize: 48, fontWeight: 900, color: kpiAtrasadas>0 ? '#E74C3C' : '#22C55E', lineHeight: 1, marginBottom: 8 }}>{kpiAtrasadas}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>{kpiAtrasadas > 0 ? 'Requieren atención inmediata' : 'Sin atrasos activos'}</div>
              {kpiAtrasadas > 0 && (
                <div style={{ marginTop: 14 }}>
                  <svg width="100%" height="32" viewBox="0 0 240 32" preserveAspectRatio="none">
                    {Array.from({ length: 14 }, (_, i) => (
                      <circle key={i} cx={8+i*17} cy={16+Math.sin(i*0.9)*8} r={2.5} fill="rgba(231,76,60,0.35)" />
                    ))}
                  </svg>
                </div>
              )}
            </div>

            {/* Tareas por área */}
            <div style={CARD}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--cream)' }}>Tareas por área</div>
                <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(212,175,55,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>◈</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {areaStats.length === 0 && <div style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'center', padding: '14px 0' }}>Sin tareas activas</div>}
                {areaStats.slice(0, 5).map(({ area, ac, total, done }) => {
                  const pct = total > 0 ? Math.round(done/total*100) : 0
                  return (
                    <div key={area}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 5 }}>
                        <div style={{ width: 24, height: 24, borderRadius: 7, flexShrink: 0, background: `${ac.color}18`, border: `1px solid ${ac.color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 900, color: ac.color }}>{ac.code}</div>
                        <span style={{ fontSize: 11, color: 'var(--muted)', flex: 1 }}>{area}</span>
                        <span style={{ fontSize: 12, fontWeight: 800, color: ac.color }}>{total}</span>
                      </div>
                      <div style={{ height: 5, background: 'rgba(128,128,128,0.08)', borderRadius: 4, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: `linear-gradient(90deg,${ac.color}55,${ac.color})`, borderRadius: 4, transition: 'width 0.4s' }} />
                      </div>
                    </div>
                  )
                })}
              </div>
              <button style={{ marginTop: 14, fontSize: 11, color: 'var(--gold)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}>Ver todas las áreas →</button>
            </div>

            {/* Recordatorios activos — 3ra columna de fila 3, mismo porte que Cumplimiento */}
            <div style={{ ...CARD, position: 'relative', overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#5B8AA8' }}>Recordatorios activos</div>
                <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(91,138,168,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#5B8AA8" strokeWidth="2" strokeLinecap="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
                </div>
              </div>
              <div style={{ fontSize: 52, fontWeight: 900, color: '#5B8AA8', lineHeight: 1, marginBottom: 8 }}>
                {activeTasks.filter(t => ['Asignada','En Proceso'].includes(t.estado)).length}
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 16 }}>Tareas con recordatorios programados</div>
              <div style={{ position: 'absolute', bottom: -16, right: -10, fontSize: 100, opacity: 0.05, transform: 'rotate(12deg)', pointerEvents: 'none', lineHeight: 1 }}>🔔</div>
              <button style={{ fontSize: 11, color: '#5B8AA8', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}>Ver todos →</button>
            </div>

          </div>
        </div>

        {/* SIDEBAR DERECHO: Próximos + Recordatorios — oculto en mobile (se renderizan debajo) */}
        <div style={{ display: isDesktop ? 'flex' : 'none', flexDirection: 'column', gap: 14 }}>

          {/* Próximos vencimientos */}
          <div style={{ ...CARD, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--cream)' }}>Próximos vencimientos</div>
              <button onClick={() => onNavigate('calendar')} style={{ fontSize: 10, color: 'var(--gold)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700, whiteSpace: 'nowrap' }}>Ver calendario →</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {proximos.length === 0 && <div style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'center', padding: '20px 0' }}>Sin vencimientos próximos</div>}
              {proximos.map(t => {
                const { day, month } = formatPlazoDay(t.plazo)
                const vColor = vencimientoColor(t.plazo)
                const cfg = AREA_CFG[t.area] ?? { color: '#888', code: '??' }
                const resps = (t.responsables ?? [users.find(u => u.id === t.responsable_id)].filter(Boolean)) as RcUser[]
                return (
                  <div key={t.id} onClick={() => setSelectedTask(t)} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer', padding: '7px 8px', borderRadius: 10, transition: 'background 0.15s' }}
                    onMouseEnter={e => (e.currentTarget.style.background='rgba(128,128,128,0.07)')}
                    onMouseLeave={e => (e.currentTarget.style.background='transparent')}>
                    <div style={{ textAlign: 'center', minWidth: 40, background: `${vColor}14`, border: `1px solid ${vColor}28`, borderRadius: 9, padding: '5px 0', flexShrink: 0 }}>
                      <div style={{ fontSize: 20, fontWeight: 900, color: vColor, lineHeight: 1 }}>{day}</div>
                      <div style={{ fontSize: 7, color: vColor, fontWeight: 700 }}>{month}</div>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--cream)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 4 }}>{t.titulo}</div>
                      <div style={{ fontSize: 9, color: 'var(--muted)', marginBottom: 5 }}>Vence {daysLabel(t.plazo)} · {formatPlazo(t.plazo)}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 7, background: t.prioridad_maxima?'rgba(220,38,38,0.12)':'rgba(212,175,55,0.1)', color: t.prioridad_maxima?'#DC2626':'#D4AF37', fontWeight: 700 }}>{t.prioridad_maxima?'Alta':'Media'}</span>
                        <div style={{ display: 'flex' }}>
                          {resps.slice(0,3).map((u,i) => (
                            <div key={u.id} style={{ width: 18, height: 18, borderRadius: '50%', background: `${cfg.color}30`, border: `1.5px solid ${cfg.color}50`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 6, fontWeight: 800, color: cfg.color, marginLeft: i>0?-5:0 }}>{u.iniciales}</div>
                          ))}
                          {resps.length>3 && <div style={{ width: 18, height: 18, borderRadius: '50%', background: 'rgba(128,128,128,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 6, color: 'var(--muted)', marginLeft: -5 }}>+{resps.length-3}</div>}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
            <button onClick={() => onNavigate('calendar')} style={{ marginTop: 10, fontSize: 11, color: 'var(--gold)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}>Ver todos los vencimientos →</button>
          </div>

          {/* Actividad reciente — sidebar, cubre más hacia abajo */}
          <div style={{ ...CARD, display: 'flex', flexDirection: 'column', flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--cream)' }}>Actividad reciente</div>
              <button style={{ fontSize: 11, color: 'var(--gold)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}>Ver toda →</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
              {recentActivity.map((item, idx) => {
                const c = actColor[item.type]
                const cfg = AREA_CFG[item.task.area] ?? { color: '#888' }
                return (
                  <div key={item.task.id+idx} onClick={() => setSelectedTask(item.task)}
                    style={{ display: 'flex', gap: 10, padding: '8px 0', borderBottom: idx<recentActivity.length-1?'1px solid rgba(255,255,255,0.04)':'none', cursor: 'pointer', alignItems: 'flex-start' }}>
                    <div style={{ width: 26, height: 26, borderRadius: 8, background: `${c}18`, border: `1px solid ${c}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: c, fontWeight: 900, flexShrink: 0, marginTop: 1 }}>
                      {actIcon[item.type]}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.4 }}>
                        <span style={{ fontWeight: 600, color: 'var(--cream)' }}>{item.who}</span>
                        {' '}{actVerb[item.type]}{' '}
                        <span style={{ fontWeight: 700, color: cfg.color }}>{item.task.titulo.length>22?item.task.titulo.slice(0,22)+'…':item.task.titulo}</span>
                      </div>
                      <div style={{ fontSize: 9, color: 'rgba(128,128,128,0.4)', marginTop: 2 }}>{item.time}</div>
                    </div>
                  </div>
                )
              })}
            </div>
            <button style={{ marginTop: 10, fontSize: 11, color: 'var(--gold)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}>Ver toda la actividad →</button>
          </div>

        </div>
      </div>

      {/* ── SIDEBAR CARDS EN MOBILE (Próximos vencimientos + Actividad reciente) ── */}
      {!isDesktop && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Próximos vencimientos */}
          <div style={{ ...CARD, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--cream)' }}>Próximos vencimientos</div>
              <button onClick={() => onNavigate('calendar')} style={{ fontSize: 10, color: 'var(--gold)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700, whiteSpace: 'nowrap' }}>Ver calendario →</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {proximos.length === 0 && <div style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'center', padding: '20px 0' }}>Sin vencimientos próximos</div>}
              {proximos.map(t => {
                const { day, month: mn } = formatPlazoDay(t.plazo)
                const vColor = vencimientoColor(t.plazo)
                const cfg2 = AREA_CFG[t.area] ?? { color: '#888', code: '??' }
                const resps = (t.responsables ?? [users.find(u => u.id === t.responsable_id)].filter(Boolean)) as RcUser[]
                return (
                  <div key={t.id} onClick={() => setSelectedTask(t)} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer', padding: '7px 8px', borderRadius: 10, transition: 'background 0.15s' }}
                    onMouseEnter={e => (e.currentTarget.style.background='rgba(128,128,128,0.07)')}
                    onMouseLeave={e => (e.currentTarget.style.background='transparent')}>
                    <div style={{ textAlign: 'center', minWidth: 40, background: `${vColor}14`, border: `1px solid ${vColor}28`, borderRadius: 9, padding: '5px 0', flexShrink: 0 }}>
                      <div style={{ fontSize: 20, fontWeight: 900, color: vColor, lineHeight: 1 }}>{day}</div>
                      <div style={{ fontSize: 7, color: vColor, fontWeight: 700 }}>{mn}</div>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--cream)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 4 }}>{t.titulo}</div>
                      <div style={{ fontSize: 9, color: 'var(--muted)', marginBottom: 5 }}>Vence {daysLabel(t.plazo)} · {formatPlazo(t.plazo)}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 7, background: t.prioridad_maxima?'rgba(220,38,38,0.12)':'rgba(212,175,55,0.1)', color: t.prioridad_maxima?'#DC2626':'#D4AF37', fontWeight: 700 }}>{t.prioridad_maxima?'Alta':'Media'}</span>
                        <div style={{ display: 'flex' }}>
                          {resps.slice(0,3).map((u,i) => (
                            <div key={u.id} style={{ width: 18, height: 18, borderRadius: '50%', background: `${cfg2.color}30`, border: `1.5px solid ${cfg2.color}50`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 6, fontWeight: 800, color: cfg2.color, marginLeft: i>0?-5:0 }}>{u.iniciales}</div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
            <button onClick={() => onNavigate('calendar')} style={{ marginTop: 10, fontSize: 11, color: 'var(--gold)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}>Ver todos los vencimientos →</button>
          </div>

          {/* Actividad reciente */}
          <div style={{ ...CARD, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--cream)' }}>Actividad reciente</div>
              <button style={{ fontSize: 11, color: 'var(--gold)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}>Ver toda →</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {recentActivity.map((item, idx) => {
                const c = actColor[item.type]
                const cfg2 = AREA_CFG[item.task.area] ?? { color: '#888' }
                return (
                  <div key={item.task.id+idx} onClick={() => setSelectedTask(item.task)}
                    style={{ display: 'flex', gap: 10, padding: '8px 0', borderBottom: idx<recentActivity.length-1?'1px solid rgba(255,255,255,0.04)':'none', cursor: 'pointer', alignItems: 'flex-start' }}>
                    <div style={{ width: 26, height: 26, borderRadius: 8, background: `${c}18`, border: `1px solid ${c}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: c, fontWeight: 900, flexShrink: 0, marginTop: 1 }}>
                      {actIcon[item.type]}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.4 }}>
                        <span style={{ fontWeight: 600, color: 'var(--cream)' }}>{item.who}</span>
                        {' '}{actVerb[item.type]}{' '}
                        <span style={{ fontWeight: 700, color: cfg2.color }}>{item.task.titulo.length>22?item.task.titulo.slice(0,22)+'…':item.task.titulo}</span>
                      </div>
                      <div style={{ fontSize: 9, color: 'rgba(128,128,128,0.4)', marginTop: 2 }}>{item.time}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── TABLA TAREAS ── */}
      <div style={{ background: 'var(--surface)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 20, overflow: 'hidden' }}>
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--cream)' }}>Mis tareas</div>
            <div style={{ position: 'relative' }}>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar tarea..."
                style={{ borderRadius: 10, paddingLeft: 32, fontSize: 12, width: 200 }} />
              <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: 'var(--muted)', pointerEvents: 'none' }}>🔍</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid rgba(255,255,255,0.05)', marginBottom: -16 }}>
            {([
              { key: 'todas', label: 'Todas', n: activeTasks.length },
              { key: 'en-proceso', label: 'En proceso', n: kpiEnProceso },
              { key: 'atrasadas', label: 'Atrasadas', n: kpiAtrasadas },
              { key: 'sin-iniciar', label: 'Sin iniciar', n: kpiAsignadas },
              { key: 'completadas', label: 'Completadas', n: kpiCompletadas },
            ] as { key: TabKey; label: string; n: number }[]).map(tab => (
              <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                style={{ padding: '8px 14px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: activeTab===tab.key?700:500, color: activeTab===tab.key?'var(--cream)':'var(--muted)', borderBottom: activeTab===tab.key?'2px solid var(--gold)':'2px solid transparent', marginBottom: -1, transition: 'all 0.15s' }}>
                {tab.label} <span style={{ fontSize: 10, opacity: 0.7 }}>{tab.n}</span>
              </button>
            ))}
          </div>
        </div>
        {/* Encabezados tabla */}
        <div style={{ display: 'grid', gridTemplateColumns: isDesktop ? '2fr 1fr 90px 80px 120px 110px 110px 55px 45px' : '2fr 1fr 100px 80px', gap: 8, padding: '9px 16px', background: 'rgba(128,128,128,0.02)', borderBottom: '1px solid rgba(128,128,128,0.07)' }}>
          {(isDesktop
            ? ['TAREA','RESPONSABLE','ÁREA','PRIORIDAD','VENCE','ESTADO','PROGRESO','COM.','ARCH.']
            : ['TAREA','RESPONSABLE','VENCE','ESTADO']
          ).map((h, i) => (
            <div key={i} style={{ fontSize: 8, fontWeight: 800, color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase' }}>{h}</div>
          ))}
        </div>
        <div style={{ maxHeight: 280, overflowY: 'auto' }}>
          {tableTasks.length === 0 && (
            <div style={{ textAlign: 'center', padding: '28px 20px' }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>✅</div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>No hay tareas en esta categoría</div>
            </div>
          )}
          {tableTasks.map((t, idx) => {
            const user = t.responsable ?? users.find(u => u.id === t.responsable_id)
            const cfg = AREA_CFG[t.area] ?? { color: '#888', code: '??' }
            const vColor = vencimientoColor(t.plazo)
            const progPct = t.estado==='Completada'?100:t.estado==='En Proceso'?50:t.estado==='Por Aprobar'?80:0
            const stCfg = STATUS_CFG[t.estado as keyof typeof STATUS_CFG] ?? { color: '#888' }
            return (
              <div key={t.id} onClick={() => setSelectedTask(t)}
                style={{ display: 'grid', gridTemplateColumns: isDesktop ? '2fr 1fr 90px 80px 120px 110px 110px 55px 45px' : '2fr 1fr 100px 80px', gap: 8, padding: isDesktop ? '11px 24px' : '10px 16px', borderBottom: idx<tableTasks.length-1?'1px solid rgba(128,128,128,0.05)':'none', cursor: 'pointer', transition: 'background 0.12s', alignItems: 'center' }}
                onMouseEnter={e => (e.currentTarget.style.background='rgba(128,128,128,0.04)')}
                onMouseLeave={e => (e.currentTarget.style.background='transparent')}>
                {/* TAREA */}
                <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start', minWidth: 0 }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: t.estado==='Atrasada'?'#E74C3C':t.estado==='En Proceso'?'#E67E22':t.estado==='Completada'?'#22C55E':'#5B8AA8', flexShrink: 0, marginTop: 4 }} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--cream)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.titulo}</div>
                    {t.descripcion && <div style={{ fontSize: 10, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 1 }}>{t.descripcion}</div>}
                  </div>
                </div>
                {/* RESPONSABLE */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 22, height: 22, borderRadius: '50%', background: cfg.color+'22', border: `1px solid ${cfg.color}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 800, color: cfg.color, flexShrink: 0 }}>{user?.iniciales??'??'}</div>
                  <span style={{ fontSize: 11, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.nombre?.split(' ')[0]??'—'}</span>
                </div>
                {/* ÁREA — solo desktop */}
                {isDesktop && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <div style={{ width: 18, height: 18, borderRadius: 5, flexShrink: 0, background: `${cfg.color}18`, border: `1px solid ${cfg.color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 7, fontWeight: 900, color: cfg.color }}>{cfg.code}</div>
                    <span style={{ fontSize: 10, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.area}</span>
                  </div>
                )}
                {/* PRIORIDAD — solo desktop */}
                {isDesktop && (
                  <div>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: t.prioridad_maxima?'rgba(220,38,38,0.12)':'rgba(212,175,55,0.1)', color: t.prioridad_maxima?'#DC2626':'#D4AF37', border: `1px solid ${t.prioridad_maxima?'rgba(220,38,38,0.25)':'rgba(212,175,55,0.2)'}` }}>
                      {t.prioridad_maxima?'Alta':'Media'}
                    </span>
                  </div>
                )}
                {/* VENCE */}
                <div>
                  <div style={{ fontSize: 12, fontWeight: 800, color: vColor }}>{formatPlazo(t.plazo)}</div>
                  <div style={{ fontSize: 9, color: vColor, opacity: 0.75, marginTop: 1 }}>{daysLabel(t.plazo)}</div>
                  {isDesktop && t.created_at && <div style={{ fontSize: 8, color: 'rgba(128,128,128,0.4)', marginTop: 2 }}>Inicio {formatPlazo(t.created_at.split('T')[0])}</div>}
                </div>
                {/* ESTADO */}
                <div>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 20, background: `${stCfg.color}18`, color: stCfg.color, border: `1px solid ${stCfg.color}30`, whiteSpace: 'nowrap' }}>{t.estado}</span>
                </div>
                {/* PROGRESO — solo desktop */}
                {isDesktop && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <div style={{ flex: 1, height: 4, background: 'rgba(128,128,128,0.1)', borderRadius: 4, overflow: 'hidden', minWidth: 40 }}>
                      <div style={{ height: '100%', width: `${progPct}%`, background: progPct>=80?'#22C55E':progPct>=40?'#D4AF37':'#5B8AA8', borderRadius: 4 }} />
                    </div>
                    <span style={{ fontSize: 9, color: 'var(--muted)', flexShrink: 0 }}>{progPct}%</span>
                  </div>
                )}
                {/* COM. — solo desktop */}
                {isDesktop && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                    <span style={{ fontSize: 10 }}>💬</span>
                    <span style={{ fontSize: 10, color: 'var(--muted)' }}>{commentCounts[t.id]??0}</span>
                  </div>
                )}
                {/* ARCH. — solo desktop */}
                {isDesktop && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                    <span style={{ fontSize: 10 }}>📎</span>
                    <span style={{ fontSize: 10, color: 'var(--muted)' }}>{t.evidencia_url||t.foto_antes_url?1:0}</span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
        <div style={{ padding: '12px 24px', borderTop: '1px solid rgba(128,128,128,0.06)', textAlign: 'center' }}>
          <button onClick={() => setActiveTab('todas')} style={{ fontSize: 12, color: 'var(--gold)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}>Ver todas las tareas →</button>
        </div>
      </div>

      {/* ── BOTTOM STATUS BAR ── */}
      <div style={{ borderRadius: 20, padding: isDesktop ? '20px 28px' : '16px 20px', background: 'linear-gradient(145deg,#0e0e14,#0a0a10)', border: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: isDesktop ? 'row' : 'column', alignItems: isDesktop ? 'center' : 'stretch', gap: isDesktop ? 0 : 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flex: isDesktop ? 1.6 : undefined, paddingRight: isDesktop ? 32 : 0, paddingBottom: isDesktop ? 0 : 14, borderRight: isDesktop ? '1px solid rgba(255,255,255,0.06)' : 'none', borderBottom: isDesktop ? 'none' : '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ width: 46, height: 46, borderRadius: 14, background: 'linear-gradient(135deg,#1a1060,#0a0830)', border: '1px solid rgba(91,138,168,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>⚡</div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--cream)' }}>Todo <span style={{ color: '#5B8AA8' }}>bajo control</span></div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>Mantén el ritmo, tu equipo va por buen camino.</div>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: isDesktop ? 'none' : 'repeat(2, 1fr)', flex: isDesktop ? undefined : undefined, gap: isDesktop ? 0 : 10 }}>
        {[
          { icon: '📋', value: String(kpiTotal), label: 'Total tareas', color: 'var(--cream)' },
          { icon: '🕐', value: `${avgDays} días`, label: 'Tiempo promedio', color: 'var(--cream)' },
          { icon: '✓',  value: `${cumplimiento}%`, label: 'Cumplimiento', color: cumplimiento>=80?'#22C55E':cumplimiento>=50?'#D4AF37':'#E74C3C' },
          { icon: '📅', value: String(semanaVencen), label: 'Vencen esta semana', color: semanaVencen>0?'#E67E22':'var(--cream)' },
        ].map((stat, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: isDesktop ? 14 : 10, paddingLeft: isDesktop ? 32 : 0, borderRight: isDesktop && i<3 ? '1px solid rgba(255,255,255,0.06)' : 'none', flex: isDesktop ? 1 : undefined }}>
            <div style={{ width: isDesktop ? 38 : 32, height: isDesktop ? 38 : 32, borderRadius: 11, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: isDesktop ? 17 : 15, flexShrink: 0 }}>{stat.icon}</div>
            <div>
              <div style={{ fontSize: isDesktop ? 22 : 18, fontWeight: 900, color: stat.color, lineHeight: 1 }}>{stat.value}</div>
              <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 3 }}>{stat.label}</div>
            </div>
          </div>
        ))}
        </div>
      </div>

      {showNewTask && (
        <NewTaskModal defaultArea={availableAreas[0]??'Ventas'} availableAreas={availableAreas}
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
