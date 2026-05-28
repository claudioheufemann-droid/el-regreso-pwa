'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { RcTask, RcUser, CEREBRO_AREA, AREA_CFG, MACRO_AREAS, MacroKey, getMacroKey } from '@/lib/gestion-types'
import { useIsDesktop } from '@/lib/useIsDesktop'
import AreaCard from './AreaCard'
import TaskDetailModal from '@/components/modals/TaskDetailModal'
import TaskCalendar from '@/components/calendar/TaskCalendar'
import TaskRow from '@/components/area/TaskRow'
import Logo from '@/components/ui/Logo'
import SettingsPanel from '@/components/ui/SettingsPanel'
import GestionPanel from '@/components/dashboard/GestionPanel'
import NewTaskModal from '@/components/modals/NewTaskModal'
import { createClient } from '@/lib/supabase/client'

interface Props {
  initialTasks: RcTask[]
  users: RcUser[]
  userName: string
  userEmail: string
  isAdmin: boolean
  currentUserId: string
  currentMacroArea: string | null   // null = admin global (ve todo)
  backHref?: string                 // where "Cambiar módulo" navigates
}

function toLocalDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function getWeekRange() {
  const now = new Date()
  const day = now.getDay()
  const diffToMon = (day === 0 ? -6 : 1 - day)
  const mon = new Date(now)
  mon.setDate(now.getDate() + diffToMon)
  const sun = new Date(mon)
  sun.setDate(mon.getDate() + 6)
  return { mon, sun, monStr: toLocalDateStr(mon), sunStr: toLocalDateStr(sun) }
}

function WeeklyProgressBar({ tasks }: { tasks: RcTask[] }) {
  const { mon, sun, monStr, sunStr } = getWeekRange()
  const weekTasks = tasks.filter(t =>
    t.plazo >= monStr && t.plazo <= sunStr && t.area !== CEREBRO_AREA
  )
  const completed = weekTasks.filter(t => t.estado === 'Completada').length
  const total = weekTasks.length
  const pct = total === 0 ? 0 : Math.round((completed / total) * 100)
  const MONTHS = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
  const monLabel = `${mon.getDate()} ${MONTHS[mon.getMonth()]}`
  const sunLabel = `${sun.getDate()} ${MONTHS[sun.getMonth()]}`
  const barColor = pct >= 80 ? '#4A7A3A' : pct >= 50 ? '#D4AF37' : '#E67E22'

  return (
    <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 14, padding: '16px 18px', marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--gold)', letterSpacing: 1.8, textTransform: 'uppercase' }}>Progreso Semanal</div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{monLabel} — {sunLabel}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 26, fontWeight: 900, color: barColor, lineHeight: 1 }}>{pct}%</div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{completed}/{total} tareas</div>
        </div>
      </div>
      <div style={{ height: 8, background: 'rgba(128,128,128,0.15)', borderRadius: 8, overflow: 'hidden', marginBottom: 10 }}>
        <div className="progress-bar-fill" style={{ '--pct': `${pct}%`, height: '100%', background: `linear-gradient(90deg, ${barColor}80, ${barColor})`, borderRadius: 8, width: `${pct}%` } as React.CSSProperties} />
      </div>
      {total > 0 && (
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          {[
            { label: 'Completadas', count: completed, color: '#4A7A3A' },
            { label: 'Pendientes', count: weekTasks.filter(t => t.estado !== 'Completada' && t.estado !== 'Atrasada').length, color: '#7BA8C4' },
            { label: 'Atrasadas', count: weekTasks.filter(t => t.estado === 'Atrasada').length, color: '#FF6B6B' },
          ].filter(s => s.count > 0).map(s => (
            <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: s.color }} />
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>{s.count} {s.label.toLowerCase()}</span>
            </div>
          ))}
        </div>
      )}
      {total === 0 && <div style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'center', paddingTop: 4 }}>Sin tareas con plazo esta semana</div>}
    </div>
  )
}

function TodayFocus({ tasks, onTaskClick }: { tasks: RcTask[]; onTaskClick: (t: RcTask) => void }) {
  const todayStr = toLocalDateStr(new Date())
  const todayTasks = tasks
    .filter(t => t.plazo === todayStr && t.estado !== 'Completada' && t.estado !== 'Rechazada' && t.area !== CEREBRO_AREA)
    .sort((a, b) => (b.prioridad_maxima ? 1 : 0) - (a.prioridad_maxima ? 1 : 0))
  if (todayTasks.length === 0) return null
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <div className="pulse" style={{ width: 6, height: 6, borderRadius: '50%', background: '#FF4D4D' }} />
        <span style={{ fontSize: 10, fontWeight: 800, color: '#FF4D4D', letterSpacing: 1.6 }}>
          QUÉ SIGUE HOY · {todayTasks.length} tarea{todayTasks.length > 1 ? 's' : ''}
        </span>
      </div>
      <div className="today-strip">
        {todayTasks.slice(0, 3).map(t => (
          <TaskRow key={t.id} task={t} onClick={() => onTaskClick(t)} showMeta />
        ))}
        {todayTasks.length > 3 && (
          <div style={{ padding: '10px 20px', fontSize: 11, color: '#FF4D4D', textAlign: 'center', fontWeight: 700 }}>
            +{todayTasks.length - 3} más vencen hoy
          </div>
        )}
      </div>
    </div>
  )
}

function MacroProgressBars({ tasks, macroFilter }: { tasks: RcTask[]; macroFilter: string | null }) {
  const entries = (Object.entries(MACRO_AREAS) as [MacroKey, typeof MACRO_AREAS[MacroKey]][])
    .filter(([key]) => macroFilter === null || macroFilter === key)

  if (entries.length === 0) return null

  return (
    <div style={{ display: 'grid', gridTemplateColumns: entries.length > 1 ? 'repeat(2, 1fr)' : '1fr', gap: 10, marginBottom: 20 }}>
      {entries.map(([key, macro]) => {
        const macroTasks = tasks.filter(t => (macro.areas as readonly string[]).includes(t.area))
        const completadas = macroTasks.filter(t => t.estado === 'Completada').length
        const atrasadas = macroTasks.filter(t => t.estado === 'Atrasada').length
        const activas = macroTasks.filter(t => t.estado !== 'Completada' && t.estado !== 'Rechazada').length
        const total = macroTasks.length
        const pct = total === 0 ? 0 : Math.round((completadas / total) * 100)
        const barColor = pct >= 80 ? '#4A7A3A' : pct >= 50 ? '#D4AF37' : macro.color

        return (
          <div key={key} style={{ background: 'var(--surface)', border: `1px solid ${macro.color}22`, borderRadius: 16, padding: '14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <div style={{ width: 22, height: 22, borderRadius: 7, background: `${macro.color}18`, border: `1px solid ${macro.color}35`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 800, color: macro.color, flexShrink: 0 }}>{macro.code}</div>
              <span style={{ fontSize: 10, fontWeight: 700, color: macro.color, letterSpacing: 1.2, flex: 1 }}>{macro.label.toUpperCase()}</span>
              <span style={{ fontSize: 18, fontWeight: 900, color: barColor, lineHeight: 1 }}>{pct}%</span>
            </div>
            <div style={{ height: 6, background: 'rgba(128,128,128,0.15)', borderRadius: 6, overflow: 'hidden', marginBottom: 8 }}>
              <div style={{ height: '100%', width: `${pct}%`, background: `linear-gradient(90deg, ${barColor}80, ${barColor})`, borderRadius: 6, transition: 'width 0.4s ease' }} />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              {[
                { label: 'listas', count: completadas, color: '#4A7A3A' },
                { label: 'activas', count: activas, color: macro.color },
                { label: 'atraso', count: atrasadas, color: '#FF6B6B' },
              ].filter(s => s.count > 0).map(s => (
                <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                  <div style={{ width: 5, height: 5, borderRadius: '50%', background: s.color }} />
                  <span style={{ fontSize: 9, color: 'var(--muted)' }}>{s.count} {s.label}</span>
                </div>
              ))}
              {total === 0 && <span style={{ fontSize: 9, color: 'var(--muted)' }}>Sin tareas</span>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

type View = 'home' | 'mis-tareas' | 'calendar' | 'filter' | 'analytics'
type FilterKey = 'activas' | 'en-proceso' | 'aprobar' | 'atraso'

export default function Dashboard({ initialTasks, users, userName, userEmail, isAdmin, currentUserId, currentMacroArea, backHref = '/' }: Props) {
  const router = useRouter()
  const isDesktop = useIsDesktop()
  const [tasks, setTasks] = useState(initialTasks)
  const [selectedTask, setSelectedTask] = useState<RcTask | null>(null)
  const [view, setView] = useState<View>('home')
  const [filterKey, setFilterKey] = useState<FilterKey>('activas')
  const [showSettings, setShowSettings] = useState(false)
  const [showNewTask, setShowNewTask] = useState(false)
  // Áreas disponibles para crear tareas según el módulo activo
  const availableTaskAreas: string[] = (() => {
    if (currentMacroArea === 'administracion') return [...MACRO_AREAS.administracion.areas]
    if (currentMacroArea === 'comercial')      return [...MACRO_AREAS.comercial.areas]
    if (currentMacroArea === 'produccion')     return [...MACRO_AREAS.produccion.areas]
    // admin global: todas las áreas
    return [...MACRO_AREAS.comercial.areas, ...MACRO_AREAS.administracion.areas, ...MACRO_AREAS.produccion.areas]
  })()
  const defaultNewTaskArea = availableTaskAreas[0] ?? 'Ventas'
  // Collapsible macro sections — default: all expanded
  const [expandedMacros, setExpandedMacros] = useState<Set<MacroKey>>(
    () => new Set(Object.keys(MACRO_AREAS) as MacroKey[])
  )
  const [expandedSidebarMacros, setExpandedSidebarMacros] = useState<Set<MacroKey>>(
    () => new Set(Object.keys(MACRO_AREAS) as MacroKey[])
  )
  function toggleMacro(key: MacroKey) {
    setExpandedMacros(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }
  function toggleSidebarMacro(key: MacroKey) {
    setExpandedSidebarMacros(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  // Derivar nombres de áreas de forma explícita y segura (sin "as" casts)
  const macroAreaNames: string[] | null = (() => {
    if (!currentMacroArea) return null
    if (currentMacroArea === 'comercial') return [...MACRO_AREAS.comercial.areas]
    if (currentMacroArea === 'administracion') return [...MACRO_AREAS.administracion.areas]
    return null
  })()

  // activeTasks: excluye "Mi Cerebro" y restringe a la macro-área activa
  const activeTasks = tasks.filter(t =>
    t.area !== CEREBRO_AREA &&
    (macroAreaNames === null || macroAreaNames.includes(t.area))
  )
  const cerebroTasks = tasks.filter(t => t.area === CEREBRO_AREA)
  const atrasadas = activeTasks.filter(t => t.estado === 'Atrasada').length
  const porAprobar = activeTasks.filter(t => t.estado === 'Por Aprobar').length
  const activas = activeTasks.filter(t => t.estado !== 'Completada').length
  const enProceso = activeTasks.filter(t => t.estado === 'En Proceso').length
  const today = new Date()

  const handleUpdate = useCallback((updated: RcTask) => {
    setTasks(prev => prev.map(t => t.id === updated.id ? updated : t))
  }, [])
  const handleDelete = useCallback((id: string) => {
    setTasks(prev => prev.filter(t => t.id !== id))
    setSelectedTask(null)
  }, [])

  const refreshTasks = useCallback(async () => {
    try {
      // Incluir "Mi Cerebro" para tareas personales; pasar áreas para mantener el scope
      const areasParam = macroAreaNames
        ? `?areas=${[...macroAreaNames, 'Mi Cerebro'].map(encodeURIComponent).join(',')}`
        : ''
      const res = await fetch(`/api/tasks${areasParam}`, { cache: 'no-store' })
      if (res.ok) setTasks(await res.json())
    } catch { /* silencioso */ }
  }, [macroAreaNames])

  useEffect(() => {
    const onFocus = () => refreshTasks()
    window.addEventListener('focus', onFocus)
    const onVisible = () => { if (document.visibilityState === 'visible') refreshTasks() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [refreshTasks])

  // ── Filter view config ──
  const filterMap: Record<FilterKey, { label: string; color: string; items: RcTask[] }> = {
    activas:      { label: 'Tareas Activas', color: 'var(--cream)', items: activeTasks.filter(t => t.estado !== 'Completada' && t.estado !== 'Rechazada') },
    'en-proceso': { label: 'En Proceso',     color: '#E67E22',      items: activeTasks.filter(t => t.estado === 'En Proceso') },
    aprobar:      { label: 'Por Aprobar',    color: '#D4AF37',      items: activeTasks.filter(t => t.estado === 'Por Aprobar') },
    atraso:       { label: 'En Atraso',      color: '#FF6B6B',      items: activeTasks.filter(t => t.estado === 'Atrasada') },
  }
  const currentFilter = filterMap[filterKey]

  const dayName = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'][today.getDay()]
  const monthName = ['enero','feb','marzo','abril','mayo','junio','julio','agosto','sep','octubre','nov','dic'][today.getMonth()]
  const initials = userName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  // ─────────────────────────────────────────────
  // CONTENIDO PRINCIPAL (compartido mobile/desktop)
  // ─────────────────────────────────────────────
  const navItems: { key: View; icon: string; label: string; adminOnly?: boolean }[] = [
    { key: 'home',       icon: '⊞', label: 'Inicio' },
    { key: 'mis-tareas', icon: '👤', label: 'Mis Tareas' },
    { key: 'calendar',   icon: '📅', label: 'Calendario' },
    { key: 'analytics',  icon: '◈',  label: 'Gestión', adminOnly: true },
  ]
  const visibleNavItems = navItems.filter(n => !n.adminOnly || isAdmin)

  function ContentArea() {
    return (
      <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}>
        <div style={{
          padding: isDesktop ? '48px 56px 80px' : '16px 14px 100px',
          maxWidth: isDesktop ? (view === 'calendar' ? 1200 : 860) : 600,
          margin: '0 auto',
          width: '100%',
        }}>

          {/* ── HOME VIEW ── */}
          {view === 'home' && (
            <>
              <div style={{ marginBottom: isDesktop ? 20 : 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: isDesktop ? 6 : 3 }}>
                  <div style={{ fontSize: isDesktop ? 10 : 9, color: 'var(--muted)', letterSpacing: isDesktop ? 2.2 : 1.5, textTransform: 'uppercase' }}>
                    {dayName} {today.getDate()} de {monthName}
                  </div>
                  {isAdmin && (
                    <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--gold)', letterSpacing: 1.2, background: 'rgba(212,175,55,0.08)', border: '1px solid rgba(212,175,55,0.18)', borderRadius: 20, padding: '2px 8px' }}>★ Admin</span>
                  )}
                </div>
                <div style={{ fontSize: isDesktop ? 32 : 20, fontWeight: 900, color: 'var(--cream)', letterSpacing: -1, lineHeight: 1 }}>
                  Hola, {userName.split(' ')[0]}.
                </div>
              </div>

              {/* KPI Semáforo */}
              <div style={{ display: 'grid', gridTemplateColumns: isDesktop ? 'repeat(4,1fr)' : 'repeat(2,1fr)', gap: isDesktop ? 12 : 10, marginBottom: isDesktop ? 12 : 10 }}>
                {([
                  { key: 'activas',    label: 'Activas',    value: activas,    color: '#4A7A9B', bg: 'rgba(74,122,155,0.10)',  border: 'rgba(74,122,155,0.25)'  },
                  { key: 'en-proceso', label: 'En Proceso', value: enProceso,  color: '#D4821A', bg: 'rgba(212,130,26,0.10)',  border: 'rgba(212,130,26,0.30)'  },
                  { key: 'aprobar',    label: 'Aprobar',    value: porAprobar, color: '#B8941F', bg: 'rgba(184,148,31,0.10)',  border: 'rgba(184,148,31,0.30)'  },
                  { key: 'atraso',     label: 'Atraso',     value: atrasadas,  color: '#C0392B', bg: 'rgba(192,57,43,0.10)',   border: 'rgba(192,57,43,0.30)'   },
                ] as { key: FilterKey; label: string; value: number; color: string; bg: string; border: string }[]).map(s => {
                  const active = s.value > 0
                  return (
                    <button key={s.key} onClick={() => { setFilterKey(s.key); setView('filter') }}
                      className="touch-active"
                      style={{
                        background: active ? s.bg : 'var(--surface)',
                        border: `1px solid ${active ? s.border : 'rgba(128,128,128,0.12)'}`,
                        borderTop: `3px solid ${active ? s.color : 'rgba(128,128,128,0.15)'}`,
                        borderRadius: isDesktop ? 16 : 14,
                        padding: isDesktop ? '22px 14px 18px' : '18px 12px 16px',
                        cursor: 'pointer', textAlign: 'center',
                        boxShadow: active ? `0 2px 16px ${s.color}22` : 'none',
                        transition: 'all 0.15s',
                      }}>
                      <div style={{
                        fontSize: isDesktop ? 46 : 38, fontWeight: 900, lineHeight: 1,
                        letterSpacing: -2,
                        color: active ? s.color : 'rgba(128,128,128,0.22)',
                      }}>{s.value}</div>
                      <div style={{
                        fontSize: isDesktop ? 9 : 10, letterSpacing: isDesktop ? 1.5 : 1.2, marginTop: isDesktop ? 8 : 7,
                        textTransform: 'uppercase', fontWeight: 700,
                        color: active ? s.color : 'rgba(128,128,128,0.35)',
                        opacity: active ? 0.85 : 1,
                      }}>{s.label}</div>
                      {active && (
                        <div style={{ fontSize: 8, marginTop: 5, color: s.color, opacity: 0.45, letterSpacing: 0.8 }}>ver →</div>
                      )}
                    </button>
                  )
                })}
              </div>

              {/* Quick actions */}
              <div style={{ display: 'grid', gridTemplateColumns: isAdmin ? 'repeat(3,1fr)' : 'repeat(2,1fr)', gap: isDesktop ? 10 : 8, marginBottom: isDesktop ? 32 : 20 }}>
                <button onClick={() => setShowNewTask(true)} className="touch-active" style={{ padding: isDesktop ? '11px 14px' : '10px 10px', borderRadius: 12, border: '1px solid rgba(212,175,55,0.25)', background: 'rgba(212,175,55,0.06)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span style={{ fontSize: isDesktop ? 15 : 13 }}>⚡</span>
                  <span style={{ fontSize: isDesktop ? 12 : 11, fontWeight: 700, color: 'var(--gold)', lineHeight: 1.2 }}>{isDesktop ? 'Nueva tarea' : 'Nueva\ntarea'}</span>
                </button>
                <button onClick={() => { setFilterKey('aprobar'); setView('filter') }} className="touch-active" style={{ padding: isDesktop ? '11px 14px' : '10px 10px', borderRadius: 12, border: `1px solid ${porAprobar > 0 ? 'rgba(184,148,31,0.35)' : 'rgba(128,128,128,0.12)'}`, background: porAprobar > 0 ? 'rgba(184,148,31,0.07)' : 'rgba(128,128,128,0.03)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span style={{ fontSize: isDesktop ? 15 : 13 }}>✓</span>
                  <span style={{ fontSize: isDesktop ? 12 : 11, fontWeight: 700, color: porAprobar > 0 ? '#D4AF37' : 'var(--muted)', flex: 1, textAlign: 'left' }}>Pendientes</span>
                  {porAprobar > 0 && <span style={{ fontSize: 10, fontWeight: 800, color: '#D4AF37', background: 'rgba(212,175,55,0.15)', borderRadius: 10, padding: '1px 6px', flexShrink: 0 }}>{porAprobar}</span>}
                </button>
                {isAdmin && (
                  <button onClick={() => setView('analytics')} className="touch-active" style={{ padding: isDesktop ? '11px 14px' : '10px 10px', borderRadius: 12, border: '1px solid rgba(91,138,168,0.25)', background: 'rgba(91,138,168,0.06)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7 }}>
                    <span style={{ fontSize: isDesktop ? 15 : 13 }}>◈</span>
                    <span style={{ fontSize: isDesktop ? 12 : 11, fontWeight: 700, color: '#5B8AA8' }}>{isDesktop ? 'Panel KPIs' : 'Panel'}</span>
                  </button>
                )}
              </div>

              <TodayFocus tasks={activeTasks} onTaskClick={setSelectedTask} />

              <MacroProgressBars tasks={tasks} macroFilter={currentMacroArea} />

              {/* ── Macro categorías ── */}
              {(Object.entries(MACRO_AREAS) as [MacroKey, typeof MACRO_AREAS[MacroKey]][])
                .filter(([key]) => currentMacroArea === null || currentMacroArea === key)
                .map(([key, macro]) => {
                  const macroTasks = tasks.filter(t => (macro.areas as readonly string[]).includes(t.area))
                  const macroActivas = macroTasks.filter(t => t.estado !== 'Completada').length
                  const macroAtraso = macroTasks.filter(t => t.estado === 'Atrasada').length
                  const macroCompleted = macroTasks.filter(t => t.estado === 'Completada').length
                  const macroTotal = macroTasks.length
                  const macroPct = macroTotal > 0 ? Math.round((macroCompleted / macroTotal) * 100) : 0
                  const isExpanded = expandedMacros.has(key)
                  const isAdminView = currentMacroArea === null
                  return (
                    <div key={key} style={{ marginBottom: isDesktop ? 28 : 16 }}>
                      {/* Header macro — solo visible para admins, clickable toggle */}
                      {isAdminView && (
                        <div
                          onClick={() => toggleMacro(key)}
                          className="touch-active cursor-pointer"
                          style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: isExpanded ? 14 : 0, padding: '8px 12px', borderRadius: 10, background: `${macro.color}08`, border: `1px solid ${macro.color}20`, transition: 'all 0.15s' }}
                        >
                          {/* Código + label */}
                          <div style={{ width: 24, height: 24, borderRadius: 8, background: `${macro.color}20`, border: `1px solid ${macro.color}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 800, color: macro.color, flexShrink: 0 }}>{macro.code}</div>
                          <span style={{ fontSize: 11, fontWeight: 700, color: macro.color, letterSpacing: 1.5, flex: 1 }}>{macro.label.toUpperCase()}</span>
                          {/* Badges */}
                          {macroAtraso > 0 && <span style={{ fontSize: 9, color: '#FF6B6B', background: 'rgba(255,107,107,0.1)', border: '1px solid rgba(255,107,107,0.25)', borderRadius: 8, padding: '2px 7px' }}>{macroAtraso} ⚠</span>}
                          {macroActivas > 0 && <span style={{ fontSize: 9, color: macro.color, background: `${macro.color}12`, borderRadius: 8, padding: '2px 7px' }}>{macroActivas} activa{macroActivas > 1 ? 's' : ''}</span>}
                          {/* Progress pct */}
                          <span style={{ fontSize: 10, fontWeight: 700, color: macroPct >= 80 ? '#4A7A3A' : macroPct >= 50 ? '#D4AF37' : macro.color, minWidth: 30, textAlign: 'right' }}>{macroPct}%</span>
                          {/* Chevron */}
                          <span style={{ fontSize: 11, color: macro.color, transition: 'transform 0.2s', display: 'inline-block', transform: isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)' }}>▾</span>
                        </div>
                      )}
                      {/* Áreas de esta macro — colapsable */}
                      {(!isAdminView || isExpanded) && (
                        <div style={{ display: 'grid', gridTemplateColumns: isDesktop ? 'repeat(4, 1fr)' : 'repeat(2, 1fr)', gap: isDesktop ? 12 : 8 }}>
                          {macro.areas.map(area => (
                            <AreaCard key={area} area={area} tasks={tasks.filter(t => t.area === area)} onClick={() => router.push(`/gestion/area/${encodeURIComponent(area)}`)} compact={!isDesktop} />
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })
              }

              {cerebroTasks.length > 0 && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: AREA_CFG[CEREBRO_AREA].color, letterSpacing: 2 }}>MI CEREBRO</span>
                    <div style={{ flex: 1, height: 1, background: `${AREA_CFG[CEREBRO_AREA].color}18` }} />
                  </div>
                  <div style={{ border: `1px solid ${AREA_CFG[CEREBRO_AREA].color}18`, borderRadius: 12, overflow: 'hidden' }}>
                    {cerebroTasks.map(t => (
                      <div key={t.id} onClick={() => setSelectedTask(t)} className="touch-active cursor-pointer"
                        style={{ padding: '14px 16px', borderBottom: '1px solid rgba(128,128,128,0.08)', display: 'flex', gap: 10, alignItems: 'center' }}>
                        {t.sub_area && <span style={{ fontSize: 9, padding: '2px 8px', borderRadius: 10, background: 'rgba(155,89,182,0.15)', color: '#B07FD4', letterSpacing: 0.8 }}>{t.sub_area}</span>}
                        <span style={{ flex: 1, fontSize: 14, color: 'var(--cream)' }}>{t.titulo}</span>
                        {t.prioridad_maxima && <span>⚡</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── MIS TAREAS VIEW ── */}
          {view === 'mis-tareas' && (() => {
            const misTareas = tasks.filter(t =>
              t.responsable_id === currentUserId ||
              (t.responsable_ids ?? []).includes(currentUserId)
            )
            const pendientes = misTareas.filter(t => !['Completada', 'Rechazada'].includes(t.estado))
            const completadas = misTareas.filter(t => t.estado === 'Completada')
            const grupos = [
              { label: 'Atrasadas',   color: '#FF6B6B', items: misTareas.filter(t => t.estado === 'Atrasada') },
              { label: 'Por Aprobar', color: '#D4AF37', items: misTareas.filter(t => t.estado === 'Por Aprobar') },
              { label: 'En Proceso',  color: '#E67E22', items: misTareas.filter(t => t.estado === 'En Proceso') },
              { label: 'Asignadas',   color: '#5B8AA8', items: misTareas.filter(t => t.estado === 'Asignada') },
              { label: 'Completadas', color: '#4A7A3A', items: completadas },
            ].filter(g => g.items.length > 0)

            return (
              <>
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: isDesktop ? 28 : 22, fontWeight: 900, color: 'var(--cream)', marginBottom: 4 }}>Mis Tareas</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>{pendientes.length} pendiente{pendientes.length !== 1 ? 's' : ''} · {completadas.length} completada{completadas.length !== 1 ? 's' : ''}</div>
                </div>
                {misTareas.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '48px 20px' }}>
                    <div style={{ fontSize: 36, marginBottom: 12 }}>✅</div>
                    <div style={{ fontSize: 14, color: 'var(--muted)' }}>No tienes tareas asignadas</div>
                  </div>
                )}
                {grupos.map(grupo => (
                  <div key={grupo.label} style={{ marginBottom: 20 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: grupo.color }} />
                      <span style={{ fontSize: 10, fontWeight: 700, color: grupo.color, letterSpacing: 1.5 }}>{grupo.label.toUpperCase()} ({grupo.items.length})</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {grupo.items.map(t => (
                        <TaskRow key={t.id} task={t} onClick={() => setSelectedTask(t)} showMeta />
                      ))}
                    </div>
                  </div>
                ))}
              </>
            )
          })()}

          {/* ── FILTER VIEW ── */}
          {view === 'filter' && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 22 }}>
                <button
                  onClick={() => setView('home')}
                  className="touch-active"
                  style={{ background: 'var(--surface2)', border: '1px solid rgba(128,128,128,0.12)', borderRadius: 10, padding: '8px 14px', cursor: 'pointer', fontSize: 13, color: 'var(--cream)', fontWeight: 700 }}
                >
                  ← Volver
                </button>
                <div>
                  <div style={{ fontSize: isDesktop ? 28 : 22, fontWeight: 900, color: currentFilter.color, lineHeight: 1 }}>
                    {currentFilter.items.length}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>{currentFilter.label}</div>
                </div>
              </div>
              {currentFilter.items.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '48px 20px' }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
                  <div style={{ fontSize: 14, color: 'var(--muted)' }}>No hay tareas en esta categoría</div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {[...currentFilter.items]
                    .sort((a, b) => a.plazo.localeCompare(b.plazo))
                    .map(t => (
                      <TaskRow key={t.id} task={t} onClick={() => setSelectedTask(t)} showMeta />
                    ))
                  }
                </div>
              )}
            </>
          )}

          {/* ── CALENDAR VIEW ── */}
          {view === 'calendar' && (
            <TaskCalendar tasks={tasks} onTaskClick={setSelectedTask} />
          )}

          {/* ── ANALYTICS VIEW ── */}
          {view === 'analytics' && isAdmin && (
            <GestionPanel
              tasks={tasks}
              users={users}
              isAdmin={isAdmin}
              userName={userName}
              currentUserId={currentUserId}
              onTaskClick={setSelectedTask}
              onTaskCreated={t => setTasks(prev => [t, ...prev])}
              filterMacro={currentMacroArea as MacroKey | null}
            />
          )}

        </div>
      </div>
    )
  }

  // ─────────────────────────────────────────────
  // LAYOUT DESKTOP — sidebar + contenido
  // ─────────────────────────────────────────────
  if (isDesktop) {
    return (
      <div style={{ display: 'flex', height: '100vh', background: 'var(--bg)' }}>

        {/* Sidebar */}
        <aside style={{
          width: 'var(--sidebar-w)', minWidth: 'var(--sidebar-w)', flexShrink: 0,
          background: 'var(--surface)',
          borderRight: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column',
          overflowY: 'auto',
        }}>
          {/* Logo + título + back to hub */}
          <div style={{ padding: '14px 16px 12px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: currentMacroArea ? 8 : 10 }}>
              <Logo size={28} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 12, fontWeight: 800, color: 'var(--cream)', letterSpacing: '-0.3px', lineHeight: 1.1 }}>El Regreso</p>
                <p style={{ fontSize: 9, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.8px', textTransform: 'uppercase' }}>Gestión</p>
              </div>
            </div>
            {currentMacroArea && (() => {
              const mac = Object.entries(MACRO_AREAS).find(([k]) => k === currentMacroArea)
              if (!mac) return null
              const [, macData] = mac
              return (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px', borderRadius: 8, background: `${macData.color}10`, border: `1px solid ${macData.color}28`, marginBottom: 10 }}>
                  <div style={{ width: 18, height: 18, borderRadius: 5, background: `${macData.color}20`, border: `1px solid ${macData.color}35`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 7, fontWeight: 900, color: macData.color, flexShrink: 0 }}>{macData.code}</div>
                  <span style={{ fontSize: 10, fontWeight: 700, color: macData.color, letterSpacing: '0.6px' }}>{macData.label}</span>
                </div>
              )
            })()}
            <a
              href={backHref}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '6px 10px', borderRadius: 9,
                background: 'rgba(212,175,55,0.06)',
                border: '1px solid rgba(212,175,55,0.12)',
                color: '#A08830', fontSize: 11, fontWeight: 600,
                textDecoration: 'none',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(212,175,55,0.12)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'rgba(212,175,55,0.06)')}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
              {backHref === '/' ? 'Cambiar módulo' : '← Volver'}
            </a>
          </div>

          {/* Nav */}
          <nav style={{ padding: '10px 8px', flex: 1 }}>
            <div style={{ fontSize: 8, color: 'var(--muted)', letterSpacing: 1.8, padding: '2px 10px 6px', textTransform: 'uppercase' }}>Navegación</div>
            {visibleNavItems.map(item => {
              const isActive = view === item.key || (item.key === 'home' && view === 'filter')
              return (
                <button
                  key={item.key}
                  onClick={() => setView(item.key)}
                  className={`sidebar-nav-item${isActive ? ' active' : ''}`}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    width: '100%', padding: '9px 12px', borderRadius: 10,
                    border: 'none', cursor: 'pointer', marginBottom: 2,
                    background: isActive ? 'rgba(212,175,55,0.1)' : 'transparent',
                    textAlign: 'left', transition: 'background 0.15s',
                  }}
                >
                  <span style={{ fontSize: 15, lineHeight: 1 }}>{item.icon}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: isActive ? 'var(--gold)' : 'var(--muted)' }}>
                    {item.label}
                  </span>
                  {item.key === 'home' && (atrasadas + porAprobar) > 0 && (
                    <span style={{ marginLeft: 'auto', fontSize: 9, fontWeight: 700, color: '#FF7070', background: 'rgba(255,68,68,0.12)', border: '1px solid rgba(255,68,68,0.3)', borderRadius: 10, padding: '1px 6px' }}>
                      {atrasadas + porAprobar}
                    </span>
                  )}
                </button>
              )
            })}

            {/* Filtros rápidos */}
            <div style={{ fontSize: 8, color: 'var(--muted)', letterSpacing: 1.8, padding: '10px 10px 6px', textTransform: 'uppercase' }}>Filtros Rápidos</div>
            {([
              { key: 'activas',     label: 'Activas',    value: activas,    color: 'var(--cream)' },
              { key: 'en-proceso',  label: 'En Proceso', value: enProceso,  color: '#E67E22' },
              { key: 'aprobar',     label: 'Por Aprobar',value: porAprobar, color: '#D4AF37' },
              { key: 'atraso',      label: 'En Atraso',  value: atrasadas,  color: '#FF6B6B' },
            ] as { key: FilterKey; label: string; value: number; color: string }[]).map(s => (
              <button
                key={s.key}
                onClick={() => { setFilterKey(s.key); setView('filter') }}
                className="sidebar-nav-item touch-active"
                style={{
                  display: 'flex', alignItems: 'center', gap: 9,
                  width: '100%', padding: '7px 12px', borderRadius: 10,
                  border: 'none', cursor: 'pointer', marginBottom: 2,
                  background: view === 'filter' && filterKey === s.key ? `${s.color}15` : 'transparent',
                  textAlign: 'left', transition: 'background 0.15s',
                }}
              >
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
                <span style={{ fontSize: 11, color: 'var(--muted)', flex: 1 }}>{s.label}</span>
                {s.value > 0 && (
                  <span style={{ fontSize: 10, fontWeight: 700, color: s.color }}>{s.value}</span>
                )}
              </button>
            ))}

            {/* Áreas agrupadas por macro */}
            {(Object.entries(MACRO_AREAS) as [MacroKey, typeof MACRO_AREAS[MacroKey]][])
              .filter(([key]) => currentMacroArea === null || currentMacroArea === key)
              .map(([key, macro]) => {
                const isSidebarExpanded = expandedSidebarMacros.has(key)
                const isAdminView = currentMacroArea === null
                return (
                  <div key={key}>
                    {/* Macro label — clickable for admins */}
                    {isAdminView ? (
                      <button
                        onClick={() => toggleSidebarMacro(key)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 6,
                          width: '100%', padding: '10px 10px 4px', border: 'none',
                          background: 'transparent', cursor: 'pointer', textAlign: 'left',
                        }}
                      >
                        <span style={{ fontSize: 8, color: macro.color, letterSpacing: 1.8, textTransform: 'uppercase', fontWeight: 700, flex: 1 }}>{macro.label}</span>
                        <span style={{ fontSize: 10, color: macro.color, transition: 'transform 0.2s', display: 'inline-block', transform: isSidebarExpanded ? 'rotate(0deg)' : 'rotate(-90deg)' }}>▾</span>
                      </button>
                    ) : (
                      <div style={{ fontSize: 8, color: macro.color, letterSpacing: 1.8, padding: '10px 10px 4px', textTransform: 'uppercase', fontWeight: 700 }}>Áreas</div>
                    )}
                    {(!isAdminView || isSidebarExpanded) && macro.areas.map(area => {
                      const areaCfg = AREA_CFG[area]
                      const count = tasks.filter(t => t.area === area && t.estado !== 'Completada').length
                      return (
                        <button key={area} onClick={() => router.push(`/gestion/area/${encodeURIComponent(area)}`)} className="sidebar-nav-item touch-active"
                          style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '7px 12px', borderRadius: 10, border: 'none', cursor: 'pointer', marginBottom: 2, background: 'transparent', textAlign: 'left', transition: 'background 0.15s' }}>
                          <div style={{ width: 20, height: 20, borderRadius: 6, background: `${areaCfg.color}18`, border: `1px solid ${areaCfg.color}28`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 7, fontWeight: 800, color: areaCfg.color, flexShrink: 0 }}>
                            {areaCfg.code}
                          </div>
                          <span style={{ fontSize: 11, color: 'var(--muted)', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{area}</span>
                          {count > 0 && <span style={{ fontSize: 10, color: areaCfg.color, fontWeight: 700 }}>{count}</span>}
                        </button>
                      )
                    })}
                  </div>
                )
              })
            }
          </nav>

          {/* Footer sidebar: usuario + acciones */}
          <div style={{ borderTop: '1px solid rgba(128,128,128,0.1)', padding: '10px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <div style={{ width: 30, height: 30, borderRadius: '50%', background: isAdmin ? 'var(--gold)' : '#C06A1A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#0A0A0A', flexShrink: 0 }}>
                {initials}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--cream)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{userName}</div>
                <div style={{ fontSize: 9, color: 'var(--muted)' }}>{isAdmin ? '★ Admin' : 'Usuario'}</div>
              </div>
              <button onClick={refreshTasks} className="touch-active" title="Actualizar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 14, padding: 4 }}>↻</button>
            </div>
            <button onClick={() => setShowSettings(true)} className="touch-active" style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 10px', borderRadius: 10, border: 'none', background: 'rgba(128,128,128,0.07)', cursor: 'pointer', marginBottom: 5 }}>
              <span style={{ fontSize: 13 }}>⚙</span>
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>Configuración</span>
            </button>
            <button onClick={handleLogout} className="touch-active" style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 10px', borderRadius: 10, border: 'none', background: 'rgba(255,68,68,0.06)', cursor: 'pointer' }}>
              <span style={{ fontSize: 13 }}>🚪</span>
              <span style={{ fontSize: 11, color: '#FF6B6B' }}>Cerrar Sesión</span>
            </button>
          </div>
        </aside>

        {/* Contenido principal */}
        <ContentArea />

        {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} userName={userName} userEmail={userEmail} />}
        {selectedTask && <TaskDetailModal task={selectedTask} onClose={() => setSelectedTask(null)} onUpdate={handleUpdate} onDelete={handleDelete} isAdmin={isAdmin} currentUserId={currentUserId} />}
        {showNewTask && <NewTaskModal defaultArea={defaultNewTaskArea} availableAreas={availableTaskAreas} users={users} onClose={() => setShowNewTask(false)} onCreated={(t) => { setTasks(prev => [t, ...prev]); setShowNewTask(false) }} />}
      </div>
    )
  }

  // ─────────────────────────────────────────────
  // LAYOUT MOBILE — topbar + tabs + contenido
  // ─────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg)' }}>

      {/* Topbar */}
      <div className="safe-top" style={{ display: 'flex', alignItems: 'center', padding: '8px 16px', gap: 10, background: 'var(--surface)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <Logo size={30} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 900, color: 'var(--cream)', letterSpacing: 0.2, lineHeight: 1.1 }}>Gestión</div>
          {currentMacroArea ? (() => {
            const mac = Object.entries(MACRO_AREAS).find(([k]) => k === currentMacroArea)
            if (!mac) return <div style={{ fontSize: 9, color: 'var(--muted)', letterSpacing: 0.3 }}>El Regreso</div>
            const [, macData] = mac
            return (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 10, height: 10, borderRadius: 3, background: macData.color, flexShrink: 0 }} />
                <span style={{ fontSize: 9, fontWeight: 700, color: macData.color, letterSpacing: 0.5 }}>{macData.label}</span>
              </div>
            )
          })() : <div style={{ fontSize: 9, color: 'var(--muted)', letterSpacing: 0.3 }}>El Regreso</div>}
        </div>
        {(atrasadas + porAprobar) > 0 && (
          <div className="pulse" style={{ flexShrink: 0, padding: '3px 8px', background: 'rgba(255,68,68,0.12)', border: '1px solid rgba(255,68,68,0.35)', borderRadius: 20, display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 4, height: 4, borderRadius: '50%', background: '#FF4444' }} />
            <span style={{ fontSize: 10, fontWeight: 700, color: '#FF7070' }}>{atrasadas + porAprobar}</span>
          </div>
        )}
        <button onClick={refreshTasks} className="touch-active" title="Actualizar"
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '5px 6px', color: 'var(--muted)', fontSize: 15, lineHeight: 1, flexShrink: 0 }}>
          ↻
        </button>
        <a href="/" title="Módulos"
          style={{ background: 'rgba(128,128,128,0.07)', border: '1px solid rgba(128,128,128,0.12)', borderRadius: 8, padding: '5px 8px', color: 'var(--muted)', fontSize: 13, textDecoration: 'none', flexShrink: 0, lineHeight: 1 }}>
          ⌂
        </a>
        <div
          onClick={() => setShowSettings(true)}
          className="touch-active"
          style={{ width: 32, height: 32, borderRadius: '50%', background: isAdmin ? 'var(--gold)' : '#C06A1A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#0A0A0A', flexShrink: 0, cursor: 'pointer', position: 'relative' }}>
          {initials}
          {isAdmin && <div style={{ position: 'absolute', bottom: -2, right: -2, width: 11, height: 11, borderRadius: '50%', background: 'var(--surface)', border: '1px solid var(--gold)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 6 }}>★</div>}
        </div>
      </div>

      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} userName={userName} userEmail={userEmail} />}

      {/* Nav tabs */}
      <div style={{ display: 'flex', background: 'var(--surface)', borderBottom: '1px solid rgba(128,128,128,0.08)', flexShrink: 0 }}>
        {visibleNavItems.map(({ key, label }) => {
          const isActive = view === key || (key === 'home' && view === 'filter')
          return (
            <button key={key} onClick={() => setView(key)} style={{ flex: 1, padding: '8px 4px 6px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 10, fontWeight: isActive ? 700 : 500, color: isActive ? 'var(--gold)' : 'var(--muted)', letterSpacing: 0.3, transition: 'color 0.15s' }}>
              <div>{label}</div>
              <div className={`nav-pill${isActive ? '' : ' inactive'}`} />
            </button>
          )
        })}
      </div>

      <ContentArea />

      {selectedTask && <TaskDetailModal task={selectedTask} onClose={() => setSelectedTask(null)} onUpdate={handleUpdate} onDelete={handleDelete} isAdmin={isAdmin} currentUserId={currentUserId} />}
    </div>
  )
}
