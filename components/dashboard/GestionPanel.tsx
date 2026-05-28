'use client'

import { useState, useEffect, useMemo } from 'react'
import { RcTask, RcUser, AREA_CFG, MACRO_AREAS, MacroKey, STATUS_CFG } from '@/lib/gestion-types'
import NewTaskModal from '@/components/modals/NewTaskModal'

interface Props {
  tasks: RcTask[]
  users: RcUser[]
  isAdmin: boolean
  userName: string
  currentUserId: string
  onTaskClick: (t: RcTask) => void
  onTaskCreated: (t: RcTask) => void
  filterMacro?: MacroKey | null
}

function DonutChart({ segments, size = 110, stroke = 18, label, sub }: {
  segments: { value: number; color: string }[]
  size?: number; stroke?: number; label: string; sub: string
}) {
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const total = segments.reduce((s, seg) => s + seg.value, 0)
  let offset = 0
  const arcs = segments.map(seg => {
    const dash = total > 0 ? (seg.value / total) * circ : 0
    const arc = { dash, offset: circ - offset, color: seg.color }
    offset += dash
    return arc
  })
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(128,128,128,0.1)" strokeWidth={stroke} />
        {arcs.map((arc, i) => (
          <circle key={i} cx={size/2} cy={size/2} r={r} fill="none"
            stroke={arc.color} strokeWidth={stroke}
            strokeDasharray={`${arc.dash} ${circ}`}
            strokeDashoffset={arc.offset} strokeLinecap="butt" />
        ))}
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--cream)', lineHeight: 1 }}>{label}</div>
        <div style={{ fontSize: 9, color: 'var(--muted)', marginTop: 2 }}>{sub}</div>
      </div>
    </div>
  )
}

function GaugeChart({ pct, size = 110, stroke = 16 }: { pct: number; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2
  const circ = Math.PI * r
  const filled = (pct / 100) * circ
  const color = pct >= 80 ? '#4A7A3A' : pct >= 50 ? '#D4AF37' : '#E74C3C'
  return (
    <div style={{ position: 'relative', width: size, height: size / 2 + stroke / 2, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ marginTop: -size / 2 }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(128,128,128,0.1)" strokeWidth={stroke}
          strokeDasharray={`${circ} ${circ}`}
          style={{ transform: 'rotate(180deg)', transformOrigin: '50% 50%' }} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={`${filled} ${circ}`} strokeLinecap="round"
          style={{ transform: 'rotate(180deg)', transformOrigin: '50% 50%', transition: 'stroke-dasharray 0.6s ease' }} />
      </svg>
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ fontSize: 26, fontWeight: 900, color, lineHeight: 1 }}>{pct}%</div>
        <div style={{ fontSize: 9, color: '#4A7A3A', marginTop: 3, fontWeight: 700 }}>Cumplimiento general</div>
      </div>
    </div>
  )
}

function PriorityBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ fontSize: 11, color: 'var(--muted)', width: 38, flexShrink: 0 }}>{label}</div>
      <div style={{ flex: 1, height: 8, background: 'rgba(128,128,128,0.1)', borderRadius: 8, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 8, transition: 'width 0.5s ease' }} />
      </div>
      <div style={{ fontSize: 11, fontWeight: 700, color, width: 18, textAlign: 'right' }}>{value}</div>
    </div>
  )
}

function StateBadge({ estado }: { estado: string }) {
  const cfg = STATUS_CFG[estado as keyof typeof STATUS_CFG] ?? { color: '#888', bg: '#111' }
  return (
    <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
      background: `${cfg.color}18`, color: cfg.color, border: `1px solid ${cfg.color}30`, whiteSpace: 'nowrap' }}>
      {estado}
    </span>
  )
}

function PriorityBadge({ high }: { high: boolean }) {
  return (
    <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
      background: high ? 'rgba(220,38,38,0.12)' : 'rgba(212,175,55,0.1)',
      color: high ? '#DC2626' : '#D4AF37',
      border: `1px solid ${high ? 'rgba(220,38,38,0.25)' : 'rgba(212,175,55,0.2)'}` }}>
      {high ? 'Alta' : 'Media'}
    </span>
  )
}

function ProgressCell({ pct }: { pct: number }) {
  const color = pct >= 80 ? '#4A7A3A' : pct >= 40 ? '#D4AF37' : '#5B8AA8'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ flex: 1, height: 5, background: 'rgba(128,128,128,0.1)', borderRadius: 5, overflow: 'hidden', minWidth: 50 }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 5 }} />
      </div>
      <span style={{ fontSize: 10, color: 'var(--muted)', flexShrink: 0 }}>{pct}%</span>
    </div>
  )
}

type TabKey = 'todas' | 'en-proceso' | 'atrasadas' | 'sin-iniciar' | 'completadas'

function getTimeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 60)    return 'hace un momento'
  if (diff < 3600)  return `hace ${Math.floor(diff / 60)} min`
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)}h`
  return `hace ${Math.floor(diff / 86400)}d`
}

export default function GestionPanel({ tasks, users, isAdmin, userName, currentUserId, onTaskClick, onTaskCreated, filterMacro }: Props) {
  const [activeTab, setActiveTab] = useState<TabKey>('todas')
  const [search, setSearch] = useState('')
  const [showNewTask, setShowNewTask] = useState(false)
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({})

  useEffect(() => {
    fetch('/api/analytics').then(r => r.json()).then(d => setCommentCounts(d ?? {})).catch(() => {})
  }, [])

  const today = new Date()
  const dayName = ['Domingo','Lunes','Martes','Miercoles','Jueves','Viernes','Sabado'][today.getDay()]
  const monthName = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'][today.getMonth()]
  const dateStr = `${dayName} ${today.getDate()} de ${monthName} de ${today.getFullYear()}`
  const firstName = userName.split(' ')[0]

  const macroConfig = filterMacro ? MACRO_AREAS[filterMacro] : null
  const macroAreaNames = macroConfig ? (macroConfig.areas as readonly string[]) : null
  const activeTasks = tasks.filter(t =>
    t.area !== 'Mi Cerebro' &&
    (macroAreaNames === null || macroAreaNames.includes(t.area))
  )

  const kpiAsignadas   = activeTasks.filter(t => t.estado === 'Asignada').length
  const kpiEnProceso   = activeTasks.filter(t => t.estado === 'En Proceso').length
  const kpiCompletadas = activeTasks.filter(t => t.estado === 'Completada').length
  const kpiAtrasadas   = activeTasks.filter(t => t.estado === 'Atrasada').length
  const kpiAprobar     = activeTasks.filter(t => t.estado === 'Por Aprobar').length
  const kpiSinIniciar  = kpiAsignadas
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
    .slice(0, 5), [activeTasks, todayStr])

  const recentActivity = useMemo(() => {
    return [...activeTasks]
      .sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))
      .slice(0, 6)
      .map(t => {
        const user = users.find(u => u.id === t.responsable_id)
        const who = user?.nombre ?? 'Alguien'
        const time = t.created_at ? getTimeAgo(t.created_at) : 'hace un momento'
        const type = t.estado === 'Completada' ? 'completada' : t.estado === 'En Proceso' ? 'proceso' : 'asignada'
        return { type, task: t, who, time }
      })
  }, [activeTasks, users])

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
    return list.sort((a, b) => a.plazo.localeCompare(b.plazo))
  }, [activeTasks, activeTab, search])

  function daysLabel(plazo: string) {
    const diff = Math.ceil((new Date(plazo).getTime() - today.getTime()) / 86400000)
    if (diff < 0)   return { label: `Hace ${Math.abs(diff)}d`, urgent: true }
    if (diff === 0) return { label: 'Hoy', urgent: true }
    if (diff === 1) return { label: 'Manana', urgent: true }
    return { label: `${diff} dias`, urgent: false }
  }

  function vencimientoColor(plazo: string): string {
    const diff = Math.ceil((new Date(plazo).getTime() - today.getTime()) / 86400000)
    if (diff < 0) return '#FF4444'
    if (diff <= 1) return '#E67E22'
    if (diff <= 3) return '#D4AF37'
    return 'var(--muted)'
  }

  function formatPlazo(plazo: string): string {
    const [, m, d] = plazo.split('-')
    const MONTHS = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
    return `${parseInt(d)} ${MONTHS[parseInt(m)-1]}`
  }

  const kpis = [
    { label: 'Asignadas',   value: kpiAsignadas,   color: '#5B8AA8', bg: 'rgba(91,138,168,0.08)',  border: 'rgba(91,138,168,0.25)',  icon: '📋', tab: null as TabKey | null },
    { label: 'En Proceso',  value: kpiEnProceso,   color: '#E67E22', bg: 'rgba(230,126,34,0.08)',  border: 'rgba(230,126,34,0.25)',  icon: '🔄', tab: 'en-proceso' as TabKey },
    { label: 'Completadas', value: kpiCompletadas, color: '#4A7A3A', bg: 'rgba(74,122,58,0.08)',   border: 'rgba(74,122,58,0.25)',   icon: '✅', tab: 'completadas' as TabKey },
    { label: 'Atrasadas',   value: kpiAtrasadas,   color: '#E74C3C', bg: 'rgba(231,76,60,0.08)',   border: 'rgba(231,76,60,0.25)',   icon: '⚠', tab: 'atrasadas' as TabKey },
    { label: 'Por Aprobar', value: kpiAprobar,     color: '#9B59B6', bg: 'rgba(155,89,182,0.08)',  border: 'rgba(155,89,182,0.25)',  icon: '👁', tab: null as TabKey | null },
    { label: 'Sin Iniciar', value: kpiSinIniciar,  color: '#D4AF37', bg: 'rgba(212,175,55,0.08)',  border: 'rgba(212,175,55,0.25)',  icon: '⏳', tab: 'sin-iniciar' as TabKey },
  ]

  const activityIcon: Record<string, string>          = { completada: '✅', proceso: '🔄', asignada: '👤' }
  const activityText: Record<string, (w: string) => string> = {
    completada: w => `${w} completo`,
    proceso: w => `${w} inicio`,
    asignada: w => `Tarea asignada a ${w}`,
  }

  const newTaskDefaultArea = macroConfig ? (macroConfig.areas[0] as string) : 'Ventas'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, minHeight: 0 }}>

      {/* HEADER */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          {macroConfig ? (
            <>
              <div style={{ fontSize: 10, fontWeight: 700, color: macroConfig.color, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 6 }}>
                Dashboard · {macroConfig.code}
              </div>
              <div style={{ fontSize: 26, fontWeight: 900, color: 'var(--cream)', letterSpacing: -0.5, lineHeight: 1 }}>
                {macroConfig.label}
              </div>
            </>
          ) : (
            <div style={{ fontSize: 26, fontWeight: 900, color: 'var(--cream)', letterSpacing: -0.5, lineHeight: 1 }}>
              Buenos dias, {firstName}! 👋
            </div>
          )}
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6, textTransform: 'capitalize' }}>{dateStr}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button style={{ position: 'relative', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 16 }}>
            🔔
          </button>
          <button onClick={() => setShowNewTask(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', background: 'var(--gold)', color: '#0A0A0A', border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 800 }}>
            <span style={{ fontSize: 16 }}>+</span> Nueva tarea
          </button>
        </div>
      </div>

      {/* KPI TILES */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10, marginBottom: 20 }}>
        {kpis.map(k => (
          <button key={k.label} onClick={() => k.tab && setActiveTab(k.tab)}
            style={{ background: k.value > 0 ? k.bg : 'var(--surface)',
              border: `1px solid ${k.value > 0 ? k.border : 'rgba(128,128,128,0.12)'}`,
              borderTop: `3px solid ${k.value > 0 ? k.color : 'rgba(128,128,128,0.15)'}`,
              borderRadius: 14, padding: '18px 12px 14px',
              cursor: k.tab ? 'pointer' : 'default', textAlign: 'center',
              boxShadow: k.value > 0 ? `0 2px 16px ${k.color}10` : 'none', transition: 'all 0.15s' }}>
            <div style={{ fontSize: 9, color: k.value > 0 ? k.color : 'rgba(128,128,128,0.4)', letterSpacing: 1.2, textTransform: 'uppercase', fontWeight: 700, marginBottom: 8 }}>{k.icon}</div>
            <div style={{ fontSize: 30, fontWeight: 900, lineHeight: 1, letterSpacing: -1, color: k.value > 0 ? k.color : 'rgba(128,128,128,0.2)' }}>{k.value}</div>
            <div style={{ fontSize: 9, letterSpacing: 1, marginTop: 6, textTransform: 'uppercase', fontWeight: 700, color: k.value > 0 ? k.color : 'rgba(128,128,128,0.3)', opacity: 0.85 }}>{k.label}</div>
            {k.tab && k.value > 0 && <div style={{ fontSize: 8, color: k.color, marginTop: 6, opacity: 0.7 }}>Ver todas →</div>}
          </button>
        ))}
      </div>

      {/* MAIN GRID */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 270px', gap: 16, marginBottom: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Analytics row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
            {/* Resumen */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: '18px 18px 14px' }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--cream)', marginBottom: 14 }}>Resumen de tareas</div>
              <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                <DonutChart size={100} stroke={16} label={String(kpiTotal)} sub="Total"
                  segments={[
                    { value: kpiCompletadas, color: '#4A7A3A' },
                    { value: kpiEnProceso,   color: '#E67E22' },
                    { value: kpiAtrasadas,   color: '#E74C3C' },
                    { value: kpiAsignadas,   color: '#5B8AA8' },
                    { value: kpiAprobar,     color: '#9B59B6' },
                  ]} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
                  {[
                    { label: 'Completadas', n: kpiCompletadas, color: '#4A7A3A' },
                    { label: 'En proceso',  n: kpiEnProceso,   color: '#E67E22' },
                    { label: 'Atrasadas',   n: kpiAtrasadas,   color: '#E74C3C' },
                    { label: 'Pendientes',  n: kpiAsignadas + kpiAprobar, color: '#5B8AA8' },
                  ].map(s => (
                    <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 7, height: 7, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
                      <span style={{ fontSize: 10, color: 'var(--muted)', flex: 1 }}>{s.label}</span>
                      <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--cream)' }}>{s.n}</span>
                      <span style={{ fontSize: 9, color: 'var(--muted)', width: 28, textAlign: 'right' }}>{kpiTotal > 0 ? Math.round(s.n / kpiTotal * 100) : 0}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Prioridad */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: '18px 18px 14px' }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--cream)', marginBottom: 18 }}>Tareas por prioridad</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <PriorityBar label="Alta"  value={priAlta}  max={priMax} color="#E74C3C" />
                <PriorityBar label="Media" value={priMedia} max={priMax} color="#D4AF37" />
                <PriorityBar label="Baja"  value={priBaja}  max={priMax} color="#4A7A3A" />
              </div>
            </div>

            {/* Cumplimiento */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: '18px 18px 14px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--cream)', marginBottom: 14, alignSelf: 'flex-start' }}>Cumplimiento</div>
              <GaugeChart pct={cumplimiento} size={120} stroke={14} />
            </div>
          </div>

          {/* Status panels */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
            <button onClick={() => setActiveTab('atrasadas')}
              style={{ background: kpiAtrasadas > 0 ? 'rgba(231,76,60,0.06)' : 'var(--surface)', border: `1px solid ${kpiAtrasadas > 0 ? 'rgba(231,76,60,0.25)' : 'var(--border)'}`, borderRadius: 14, padding: '16px 18px', cursor: 'pointer', textAlign: 'left' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: kpiAtrasadas > 0 ? '#E74C3C' : 'var(--muted)' }}>Tareas atrasadas</div>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: kpiAtrasadas > 0 ? 'rgba(231,76,60,0.12)' : 'rgba(128,128,128,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>{kpiAtrasadas > 0 ? '✕' : '✓'}</div>
              </div>
              <div style={{ fontSize: 28, fontWeight: 900, color: kpiAtrasadas > 0 ? '#E74C3C' : '#4A7A3A', lineHeight: 1, marginBottom: 6 }}>{kpiAtrasadas}</div>
              <div style={{ fontSize: 10, color: 'var(--muted)' }}>{kpiAtrasadas > 0 ? 'Requieren atencion inmediata' : 'Sin atrasos activos'}</div>
              <div style={{ marginTop: 10, fontSize: 10, color: '#E74C3C', fontWeight: 700 }}>Ver todas →</div>
            </button>

            <button onClick={() => setActiveTab('sin-iniciar')}
              style={{ background: kpiSinIniciar > 0 ? 'rgba(212,175,55,0.06)' : 'var(--surface)', border: `1px solid ${kpiSinIniciar > 0 ? 'rgba(212,175,55,0.25)' : 'var(--border)'}`, borderRadius: 14, padding: '16px 18px', cursor: 'pointer', textAlign: 'left' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: kpiSinIniciar > 0 ? '#D4AF37' : 'var(--muted)' }}>Tareas sin iniciar</div>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(212,175,55,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>🕐</div>
              </div>
              <div style={{ fontSize: 28, fontWeight: 900, color: kpiSinIniciar > 0 ? '#D4AF37' : 'var(--muted)', lineHeight: 1, marginBottom: 6 }}>{kpiSinIniciar}</div>
              <div style={{ fontSize: 10, color: 'var(--muted)' }}>Aun no han sido iniciadas</div>
              <div style={{ marginTop: 10, fontSize: 10, color: '#D4AF37', fontWeight: 700 }}>Ver todas →</div>
            </button>

            <div style={{ background: 'rgba(91,138,168,0.06)', border: '1px solid rgba(91,138,168,0.2)', borderRadius: 14, padding: '16px 18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#5B8AA8' }}>Recordatorios activos</div>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(91,138,168,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>🔔</div>
              </div>
              <div style={{ fontSize: 28, fontWeight: 900, color: '#5B8AA8', lineHeight: 1, marginBottom: 6 }}>
                {activeTasks.filter(t => t.estado === 'Asignada' || t.estado === 'En Proceso').length}
              </div>
              <div style={{ fontSize: 10, color: 'var(--muted)' }}>Tareas con recordatorios programados</div>
              <div style={{ marginTop: 10, fontSize: 10, color: '#5B8AA8', fontWeight: 700 }}>Ver todos →</div>
            </div>
          </div>
        </div>

        {/* RIGHT sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Proximos vencimientos */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: '16px 16px 12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--cream)' }}>Proximos vencimientos</div>
              <span style={{ fontSize: 10, color: 'var(--gold)', fontWeight: 700 }}>Ver calendario</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {proximos.length === 0 && <div style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'center', padding: '12px 0' }}>Sin vencimientos proximos</div>}
              {proximos.map(t => {
                const [, m, d] = t.plazo.split('-')
                const MS = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
                const vColor = vencimientoColor(t.plazo)
                return (
                  <div key={t.id} onClick={() => onTaskClick(t)}
                    style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer', padding: '6px 8px', borderRadius: 10, transition: 'background 0.15s' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(128,128,128,0.06)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <div style={{ textAlign: 'center', minWidth: 36, flexShrink: 0 }}>
                      <div style={{ fontSize: 18, fontWeight: 900, color: vColor, lineHeight: 1 }}>{parseInt(d)}</div>
                      <div style={{ fontSize: 8, color: 'var(--muted)', textTransform: 'uppercase' }}>{MS[parseInt(m)-1]}</div>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--cream)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.titulo}</div>
                      <div style={{ fontSize: 9, color: 'var(--muted)', marginTop: 2 }}>Vence {daysLabel(t.plazo).label}</div>
                    </div>
                    <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 10, background: t.prioridad_maxima ? 'rgba(231,76,60,0.12)' : 'rgba(212,175,55,0.1)', color: t.prioridad_maxima ? '#E74C3C' : '#D4AF37', fontWeight: 700, flexShrink: 0 }}>
                      {t.prioridad_maxima ? 'Alta' : 'Media'}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Actividad reciente */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: '16px 16px 12px', flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--cream)' }}>Actividad reciente</div>
              <span style={{ fontSize: 10, color: 'var(--gold)', fontWeight: 700 }}>Ver toda</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {recentActivity.length === 0 && <div style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'center', padding: '12px 0' }}>Sin actividad reciente</div>}
              {recentActivity.map((item, idx) => (
                <div key={item.task.id + idx} onClick={() => onTaskClick(item.task)}
                  style={{ display: 'flex', gap: 10, padding: '8px 0', borderBottom: idx < recentActivity.length - 1 ? '1px solid rgba(128,128,128,0.06)' : 'none', cursor: 'pointer' }}>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(128,128,128,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, flexShrink: 0 }}>
                    {activityIcon[item.type] ?? '📝'}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 10, color: 'var(--muted)', lineHeight: 1.4 }}>
                      {activityText[item.type]?.(item.who) ?? item.who}{' '}
                      <span style={{ color: 'var(--gold)', fontWeight: 700 }}>
                        {item.task.titulo.length > 26 ? item.task.titulo.slice(0, 26) + '...' : item.task.titulo}
                      </span>
                    </div>
                    <div style={{ fontSize: 9, color: 'rgba(128,128,128,0.5)', marginTop: 2 }}>{item.time}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* TASK TABLE */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px 0', borderBottom: '1px solid rgba(128,128,128,0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--cream)' }}>Mis tareas</div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(128,128,128,0.06)', border: '1px solid rgba(128,128,128,0.12)', borderRadius: 8, padding: '6px 12px' }}>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>🔍</span>
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar tarea..."
                  style={{ background: 'none', border: 'none', outline: 'none', fontSize: 12, color: 'var(--cream)', width: 140 }} />
              </div>
              <button style={{ padding: '6px 14px', background: 'rgba(128,128,128,0.06)', border: '1px solid rgba(128,128,128,0.12)', borderRadius: 8, cursor: 'pointer', fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>Filtros</button>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 0 }}>
            {([
              { key: 'todas',       label: 'Todas',       n: activeTasks.length },
              { key: 'en-proceso',  label: 'En proceso',  n: kpiEnProceso },
              { key: 'atrasadas',   label: 'Atrasadas',   n: kpiAtrasadas },
              { key: 'sin-iniciar', label: 'Sin iniciar', n: kpiSinIniciar },
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

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 80px 100px 110px 110px 60px 50px', gap: 8, padding: '10px 20px', background: 'rgba(128,128,128,0.02)', borderBottom: '1px solid rgba(128,128,128,0.08)' }}>
          {['TAREA','RESPONSABLE','PRIORIDAD','VENCE','ESTADO','PROGRESO','COM.','ARCH.'].map((h, i) => (
            <div key={i} style={{ fontSize: 9, fontWeight: 800, color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase' }}>{h}</div>
          ))}
        </div>

        <div style={{ maxHeight: 340, overflowY: 'auto' }}>
          {tableTasks.length === 0 && (
            <div style={{ textAlign: 'center', padding: '32px 20px' }}>
              <div style={{ fontSize: 32, marginBottom: 10 }}>✅</div>
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>No hay tareas en esta categoria</div>
            </div>
          )}
          {tableTasks.map((t, idx) => {
            const user = t.responsable ?? users.find(u => u.id === t.responsable_id)
            const cfg = AREA_CFG[t.area] ?? { color: '#888', code: '??' }
            const vColor = vencimientoColor(t.plazo)
            const progPct = t.estado === 'Completada' ? 100 : t.estado === 'En Proceso' ? 50 : t.estado === 'Por Aprobar' ? 80 : 0
            const comments = commentCounts[t.id] ?? 0
            return (
              <div key={t.id} onClick={() => onTaskClick(t)}
                style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 80px 100px 110px 110px 60px 50px', gap: 8, padding: '12px 20px', borderBottom: idx < tableTasks.length - 1 ? '1px solid rgba(128,128,128,0.06)' : 'none', cursor: 'pointer', transition: 'background 0.12s', alignItems: 'center' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(128,128,128,0.04)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', minWidth: 0 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: t.estado === 'Atrasada' ? '#E74C3C' : t.estado === 'En Proceso' ? '#E67E22' : t.estado === 'Completada' ? '#4A7A3A' : '#5B8AA8', flexShrink: 0, marginTop: 4 }} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--cream)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.titulo}</div>
                    {t.descripcion && <div style={{ fontSize: 10, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 2 }}>{t.descripcion}</div>}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 24, height: 24, borderRadius: '50%', background: cfg.color + '22', border: `1px solid ${cfg.color}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 800, color: cfg.color, flexShrink: 0 }}>
                    {user?.iniciales ?? '??'}
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user?.nombre?.split(' ')[0] ?? 'Sin asignar'}</span>
                </div>
                <div><PriorityBadge high={t.prioridad_maxima} /></div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: vColor }}>{formatPlazo(t.plazo)}</div>
                  <div style={{ fontSize: 9, color: 'var(--muted)' }}>{daysLabel(t.plazo).label}</div>
                </div>
                <div><StateBadge estado={t.estado} /></div>
                <ProgressCell pct={progPct} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontSize: 10 }}>💬</span>
                  <span style={{ fontSize: 10, color: 'var(--muted)' }}>{comments}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontSize: 10 }}>📎</span>
                  <span style={{ fontSize: 10, color: 'var(--muted)' }}>{t.evidencia_url || t.foto_antes_url ? 1 : 0}</span>
                </div>
              </div>
            )
          })}
        </div>

        <div style={{ padding: '12px 20px', borderTop: '1px solid rgba(128,128,128,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <button onClick={() => setActiveTab('todas')} style={{ fontSize: 12, color: 'var(--gold)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}>
            Ver todas las tareas →
          </button>
        </div>
      </div>

      {showNewTask && (
        <NewTaskModal
          defaultArea={newTaskDefaultArea}
          availableAreas={macroAreaNames ? [...macroAreaNames] : Object.values(MACRO_AREAS).flatMap(m => [...m.areas])}
          users={users}
          onClose={() => setShowNewTask(false)}
          onCreated={t => { onTaskCreated(t); setShowNewTask(false) }}
        />
      )}
    </div>
  )
}
