'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { RcTask, RcUser, CEREBRO_AREA, AREA_CFG, MACRO_AREAS, MacroKey, getMacroKey } from '@/lib/gestion-types'
import { useIsDesktop } from '@/lib/useIsDesktop'
import { createClient } from '@/lib/supabase/client'
import AreaCard from './AreaCard'
import TaskDetailModal from '@/components/modals/TaskDetailModal'
import TaskCalendar from '@/components/calendar/TaskCalendar'
import TaskRow from '@/components/area/TaskRow'
import AppHeader from '@/components/ui/AppHeader'
import Avatar from '@/components/ui/Avatar'
import GestionPanel from '@/components/dashboard/GestionPanel'
import HomeDashboard from '@/components/dashboard/HomeDashboard'
import NewTaskModal from '@/components/modals/NewTaskModal'
import { LayoutGrid, User, Users, CalendarDays, BarChart3, History, RefreshCw, type LucideIcon } from 'lucide-react'

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

type View = 'home' | 'mis-tareas' | 'equipo' | 'calendar' | 'filter' | 'analytics' | 'historial'
type FilterKey = 'activas' | 'en-proceso' | 'aprobar' | 'atraso'

export default function Dashboard({ initialTasks, users, userName, userEmail, isAdmin, currentUserId, currentMacroArea, backHref = '/' }: Props) {
  const router = useRouter()
  const isDesktop = useIsDesktop()
  const [tasks, setTasks] = useState(initialTasks)
  const [selectedTask, setSelectedTask] = useState<RcTask | null>(null)
  // Resumen es la puerta de entrada del módulo: KPIs de la sección + el CTA
  // de Nueva Tarea (crear y asignar). Todos aterrizan ahí, admin o no.
  const [view, setView] = useState<View>('home')
  // Cuando se navega desde Equipo hacia las tareas de otra persona (null = uno mismo)
  const [viewedUserId, setViewedUserId] = useState<string | null>(null)
  // Equipo necesita ver las 3 macro-áreas a la vez, no solo la del dashboard activo —
  // se carga una vez, sin scope, y se reutiliza en "Mis Tareas" al ver a un compañero.
  const [allTasks, setAllTasks] = useState<RcTask[] | null>(null)
  const [filterKey, setFilterKey] = useState<FilterKey>('activas')
  const [showNewTask, setShowNewTask] = useState(false)
  // Áreas disponibles para crear tareas: SIEMPRE todas (cualquiera puede asignar a cualquier área),
  // con las de la sección actual primero para que el default tenga sentido según el módulo activo.
  const availableTaskAreas: string[] = (() => {
    const current =
      currentMacroArea === 'administracion' ? [...MACRO_AREAS.administracion.areas] :
      currentMacroArea === 'comercial'      ? [...MACRO_AREAS.comercial.areas] :
      currentMacroArea === 'produccion'     ? [...MACRO_AREAS.produccion.areas] :
      []
    const all = [...MACRO_AREAS.comercial.areas, ...MACRO_AREAS.administracion.areas, ...MACRO_AREAS.produccion.areas]
    return [...new Set([...current, ...all])]
  })()
  const defaultNewTaskArea = availableTaskAreas[0] ?? 'Ventas'
  // Collapsible macro sections — default: all expanded
  const [expandedMacros, setExpandedMacros] = useState<Set<MacroKey>>(
    () => new Set(Object.keys(MACRO_AREAS) as MacroKey[])
  )
  function toggleMacro(key: MacroKey) {
    setExpandedMacros(prev => {
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
    if (currentMacroArea === 'produccion') return [...MACRO_AREAS.produccion.areas]
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
    setAllTasks(prev => prev ? prev.map(t => t.id === updated.id ? updated : t) : prev)
  }, [])
  const handleDelete = useCallback((id: string) => {
    setTasks(prev => prev.filter(t => t.id !== id))
    setAllTasks(prev => prev ? prev.filter(t => t.id !== id) : prev)
    setSelectedTask(null)
  }, [])

  // Carga perezosa: solo al entrar a Equipo/Historial por primera vez, todas las tareas de la empresa
  useEffect(() => {
    if ((view !== 'equipo' && view !== 'historial') || allTasks !== null) return
    fetch('/api/tasks', { cache: 'no-store' })
      .then(r => r.json())
      .then(data => setAllTasks(Array.isArray(data) ? data : []))
      .catch(() => setAllTasks([]))
  }, [view, allTasks])

  // Sincronizar eliminaciones en tiempo real entre todas las ventanas/usuarios —
  // sin esto, borrar una tarea solo la quitaba de la sesión que hizo la acción;
  // el resto veía la tarea "fantasma" hasta refrescar o recuperar el foco.
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel('tasks-delete-sync')
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'tasks' }, (payload) => {
        const deletedId = (payload.old as { id?: string })?.id
        if (!deletedId) return
        setTasks(prev => prev.filter(t => t.id !== deletedId))
        setAllTasks(prev => prev ? prev.filter(t => t.id !== deletedId) : prev)
        setSelectedTask(prev => (prev && prev.id === deletedId) ? null : prev)
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
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

  // ── Deep link: abrir tarea desde notificación push (?task=<id>) ──
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const taskId = params.get('task')
    if (!taskId) return

    // Limpiar el badge del ícono
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_BADGE' })
    }
    if ('clearAppBadge' in navigator) {
      (navigator as Navigator & { clearAppBadge: () => Promise<void> }).clearAppBadge().catch(() => {})
    }

    // Buscar la tarea en el estado local primero
    const found = tasks.find(t => t.id === taskId)
    if (found) {
      setSelectedTask(found)
      // Limpiar el param de la URL sin recargar
      const url = new URL(window.location.href)
      url.searchParams.delete('task')
      window.history.replaceState({}, '', url.toString())
      return
    }

    // Si no está en estado local, fetchearla
    fetch(`/api/tasks?id=${taskId}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(data => {
        const task = Array.isArray(data) ? data.find((t: { id: string }) => t.id === taskId) : data
        if (task) setSelectedTask(task)
      })
      .catch(() => {})

    const url = new URL(window.location.href)
    url.searchParams.delete('task')
    window.history.replaceState({}, '', url.toString())
  }, [tasks])

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

  // ─────────────────────────────────────────────
  // CONTENIDO PRINCIPAL (compartido mobile/desktop)
  // ─────────────────────────────────────────────
  const navItems: { key: View; icon: LucideIcon; label: string; adminOnly?: boolean }[] = [
    { key: 'home',       icon: LayoutGrid,   label: 'Gestión' },
    { key: 'mis-tareas', icon: User,         label: 'Mis Tareas' },
    { key: 'equipo',     icon: Users,        label: 'Equipo' },
    { key: 'calendar',   icon: CalendarDays, label: 'Calendario' },
    { key: 'historial',  icon: History,      label: 'Historial' },
    { key: 'analytics',  icon: BarChart3,    label: 'Análisis', adminOnly: true },
  ]
  const visibleNavItems = navItems.filter(n => !n.adminOnly || isAdmin)

  function isNavActive(key: View): boolean {
    if (key === 'home')       return view === 'home' || view === 'filter'
    if (key === 'mis-tareas') return view === 'mis-tareas' && viewedUserId === null
    if (key === 'equipo')     return view === 'equipo' || (view === 'mis-tareas' && viewedUserId !== null)
    return view === key
  }
  function goToNav(key: View) {
    if (key === 'mis-tareas') setViewedUserId(null)
    setView(key)
  }

  function ContentArea() {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* ── Tabs de vista — solo desktop ── */}
        <div className="hidden lg:flex" style={{
          borderBottom: '1px solid var(--border)',
          padding: '0 24px',
          flexShrink: 0,
        }}>
          <button
            onClick={() => router.push(backHref ?? '/gestion')}
            style={{ padding: '10px 14px', fontSize: 12, fontWeight: 500, color: 'var(--muted)', cursor: 'pointer', background: 'none', border: 'none', borderBottom: '2px solid transparent' }}
          >
            ← Hub
          </button>
          {visibleNavItems.map(item => {
            const active = isNavActive(item.key)
            return (
              <button key={item.key} onClick={() => goToNav(item.key)} style={{
                padding: '10px 14px', fontSize: 12,
                fontWeight: active ? 700 : 500,
                color: active ? 'var(--gold)' : 'var(--muted)',
                cursor: 'pointer', background: 'none', border: 'none',
                borderBottom: active ? '2px solid var(--gold)' : '2px solid transparent',
                transition: 'color 0.15s',
              }}>
                {item.label}
              </button>
            )
          })}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}>
        <div style={{
          padding: isDesktop ? '24px 40px 80px' : '16px 14px 100px',
          maxWidth: isDesktop ? (view === 'calendar' ? 1200 : view === 'home' ? 1300 : 860) : 600,
          margin: '0 auto',
          width: '100%',
        }}>

          {/* ── HOME VIEW ── */}
          {view === 'home' && (
            <HomeDashboard
              tasks={tasks}
              users={users}
              userName={userName}
              isAdmin={isAdmin}
              currentUserId={currentUserId}
              currentMacroArea={currentMacroArea}
              availableAreas={availableTaskAreas}
              backHref={backHref}
              onTaskUpdated={handleUpdate}
              onTaskDeleted={handleDelete}
              onTaskCreated={t => setTasks(prev => [t, ...prev])}
              onNavigate={(v) => {
                // Soporte para 'filter:atrasadas', 'filter:en-proceso', etc.
                if (v.startsWith('filter:')) {
                  const fk = v.replace('filter:', '') as FilterKey
                  setFilterKey(fk)
                  setView('filter')
                } else {
                  setView(v as View)
                }
              }}
            />
          )}

                    {/* ── MIS TAREAS VIEW (o tareas de un compañero, visto desde Equipo) ── */}
          {view === 'mis-tareas' && (() => {
            const targetUserId = viewedUserId ?? currentUserId
            const targetUser = viewedUserId ? users.find(u => u.id === viewedUserId) : null
            const misTareas = (allTasks ?? tasks).filter(t =>
              t.responsable_id === targetUserId ||
              (t.responsable_ids ?? []).includes(targetUserId)
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
                  {targetUser && (
                    <button onClick={() => { setViewedUserId(null); setView('equipo') }} className="touch-active"
                      style={{ background: 'none', border: 'none', color: 'var(--gold)', fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: 0, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                      ← Equipo
                    </button>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                    {targetUser && <Avatar iniciales={targetUser.iniciales} userId={targetUser.id} size={isDesktop ? 32 : 28} avatarUrl={targetUser.avatar_url} />}
                    <div style={{ fontSize: isDesktop ? 28 : 22, fontWeight: 900, color: 'var(--cream)' }}>
                      {targetUser ? `Tareas de ${targetUser.nombre.split(' ')[0]}` : 'Mis Tareas'}
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>{pendientes.length} pendiente{pendientes.length !== 1 ? 's' : ''} · {completadas.length} completada{completadas.length !== 1 ? 's' : ''}</div>
                </div>
                {misTareas.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '48px 20px' }}>
                    <div style={{ fontSize: 36, marginBottom: 12 }}>✅</div>
                    <div style={{ fontSize: 14, color: 'var(--muted)' }}>{targetUser ? `${targetUser.nombre.split(' ')[0]} no tiene` : 'No tienes'} tareas asignadas</div>
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

          {/* ── EQUIPO VIEW — las 3 áreas por separado, con sus responsables debajo ── */}
          {view === 'equipo' && (() => {
            const source = (allTasks ?? tasks).filter(t => t.area !== CEREBRO_AREA)
            const macroEntries = Object.entries(MACRO_AREAS) as [MacroKey, typeof MACRO_AREAS[MacroKey]][]

            const sections = macroEntries.map(([macroKey, macro]) => {
              const macroAreaList = macro.areas as readonly string[]
              const macroTasks = source.filter(t => macroAreaList.includes(t.area))
              const teamUserIds = [...new Set(
                macroTasks.flatMap(t => [t.responsable_id, ...(t.responsable_ids ?? [])].filter(Boolean))
              )]
              const teamStats = users.filter(u => teamUserIds.includes(u.id)).map(u => {
                const myTasks = macroTasks.filter(t => t.responsable_id === u.id || (t.responsable_ids ?? []).includes(u.id))
                const comp = myTasks.filter(t => t.estado === 'Completada').length
                const atr = myTasks.filter(t => t.estado === 'Atrasada').length
                const enProceso = myTasks.filter(t => t.estado === 'En Proceso').length
                const porApr = myTasks.filter(t => t.estado === 'Por Aprobar').length
                const pct = myTasks.length > 0 ? Math.round((comp / myTasks.length) * 100) : 0
                const color = pct >= 80 ? '#4A7A3A' : pct >= 50 ? '#D4AF37' : atr > 0 ? '#FF6B6B' : '#5B8AA8'
                return { user: u, total: myTasks.length, comp, atr, enProceso, porApr, pct, color }
              }).filter(s => s.total > 0).sort((a, b) => b.pct - a.pct)
              return { macroKey, macro, teamStats }
            })

            return (
              <>
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: isDesktop ? 28 : 22, fontWeight: 900, color: 'var(--cream)', marginBottom: 4 }}>Equipo</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>Carga de tareas de toda la empresa, por área</div>
                </div>

                {allTasks === null ? (
                  <div style={{ textAlign: 'center', padding: '48px 20px', fontSize: 12, color: 'var(--muted)' }}>Cargando equipo…</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
                    {sections.map(({ macroKey, macro, teamStats }) => (
                      <div key={macroKey}>
                        {/* Título de la sección/área */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, paddingBottom: 10, borderBottom: `1px solid ${macro.color}25` }}>
                          <div style={{ width: 30, height: 30, borderRadius: 9, flexShrink: 0, background: `${macro.color}18`, border: `1px solid ${macro.color}35`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 900, color: macro.color }}>{macro.code}</div>
                          <div style={{ fontSize: isDesktop ? 17 : 15, fontWeight: 900, color: macro.color, letterSpacing: -0.3 }}>{macro.label}</div>
                          <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                            {teamStats.length > 0 ? `${teamStats.length} responsable${teamStats.length !== 1 ? 's' : ''}` : 'sin tareas asignadas'}
                          </div>
                        </div>

                        {/* Responsables de esta área */}
                        {teamStats.length === 0 ? (
                          <div style={{ fontSize: 12, color: 'var(--muted)', paddingLeft: 4 }}>Nadie tiene tareas asignadas en esta área todavía</div>
                        ) : (
                          <div style={{ display: 'grid', gridTemplateColumns: isDesktop ? 'repeat(2, 1fr)' : '1fr', gap: 12 }}>
                            {teamStats.map(({ user: u, total, comp, atr, enProceso, porApr, pct, color }) => (
                              <div key={u.id}
                                className="touch-active cursor-pointer"
                                onClick={() => { setViewedUserId(u.id); setView('mis-tareas') }}
                                style={{ background: 'var(--surface)', border: '1px solid rgba(128,128,128,0.1)', borderRadius: 16, padding: 16, borderLeft: `3px solid ${color}` }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                                  <Avatar iniciales={u.iniciales} userId={u.id} size={42} avatarUrl={u.avatar_url} />
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--cream)' }}>{u.nombre}</div>
                                    <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 1 }}>{u.rol}</div>
                                  </div>
                                  <div style={{ textAlign: 'right' }}>
                                    <div style={{ fontSize: 24, fontWeight: 900, color, lineHeight: 1 }}>{pct}%</div>
                                    <div style={{ fontSize: 10, color: 'var(--muted)' }}>{comp}/{total}</div>
                                  </div>
                                </div>
                                <div style={{ height: 6, background: 'rgba(128,128,128,0.15)', borderRadius: 6, overflow: 'hidden', marginBottom: 12 }}>
                                  <div style={{ height: '100%', width: `${pct}%`, background: `linear-gradient(90deg, ${color}80, ${color})`, borderRadius: 6, transition: 'width 0.6s ease' }} />
                                </div>
                                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                  {[
                                    { label: 'Completadas', val: comp, color: '#4A7A3A' },
                                    { label: 'En Proceso', val: enProceso, color: '#E67E22' },
                                    { label: 'Por Aprobar', val: porApr, color: '#D4AF37' },
                                    { label: 'Atrasadas', val: atr, color: '#FF6B6B' },
                                  ].filter(s => s.val > 0).map(s => (
                                    <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 10, background: `${s.color}12`, border: `1px solid ${s.color}25` }}>
                                      <div style={{ width: 5, height: 5, borderRadius: '50%', background: s.color }} />
                                      <span style={{ fontSize: 10, color: s.color, fontWeight: 600 }}>{s.val} {s.label}</span>
                                    </div>
                                  ))}
                                </div>
                                <div style={{ marginTop: 10, fontSize: 9, color: 'var(--muted)', letterSpacing: 1 }}>TOCA PARA VER SUS TAREAS →</div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )
          })()}

          {/* ── HISTORIAL VIEW — todas las tareas completadas de la empresa ── */}
          {view === 'historial' && (() => {
            const source = (allTasks ?? tasks).filter(t => t.estado === 'Completada')
            const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']
            // No existe un timestamp de "completada el", se agrupa por la fecha de vencimiento (plazo)
            const sorted = [...source].sort((a, b) => b.plazo.localeCompare(a.plazo))
            const groups: { label: string; items: RcTask[] }[] = []
            for (const t of sorted) {
              const d = new Date(t.plazo + 'T12:00:00')
              const label = `${MESES[d.getMonth()]} ${d.getFullYear()}`
              const existing = groups.find(g => g.label === label)
              if (existing) existing.items.push(t)
              else groups.push({ label, items: [t] })
            }

            return (
              <>
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: isDesktop ? 28 : 22, fontWeight: 900, color: 'var(--cream)', marginBottom: 4 }}>Historial</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>{source.length} tarea{source.length !== 1 ? 's' : ''} completada{source.length !== 1 ? 's' : ''} en total</div>
                </div>
                {allTasks === null ? (
                  <div style={{ textAlign: 'center', padding: '48px 20px', fontSize: 12, color: 'var(--muted)' }}>Cargando historial…</div>
                ) : source.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '48px 20px' }}>
                    <div style={{ fontSize: 36, marginBottom: 12 }}>🗂️</div>
                    <div style={{ fontSize: 14, color: 'var(--muted)' }}>Todavía no hay tareas completadas</div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                    {groups.map(g => (
                      <div key={g.label}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 10 }}>
                          {g.label} · {g.items.length}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                          {g.items.map(t => (
                            <TaskRow key={t.id} task={t} onClick={() => setSelectedTask(t)} showMeta />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
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
            <TaskCalendar tasks={tasks} onTaskClick={setSelectedTask} onNewTask={() => setShowNewTask(true)} />
          )}

          {/* ── ANALYTICS VIEW ── */}
          {view === 'analytics' && isAdmin && (
            <GestionPanel tasks={tasks} />
          )}

        </div>
        </div>
      </div>
    )
  }

  // ─────────────────────────────────────────────
  // LAYOUT MOBILE — topbar + tabs + contenido
  // ─────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg)' }}>

      {/* ── Header estándar — igual que todos los módulos ── */}
      <div style={{ padding: '0 18px', flexShrink: 0 }}>
        <AppHeader
          eyebrow={new Date().toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })}
          title={currentMacroArea
            ? (Object.entries(MACRO_AREAS).find(([k]) => k === currentMacroArea)?.[1]?.label ?? 'Gestión')
            : 'Gestión'
          }
          backHref={backHref}
          extraAction={
            <button
              onClick={refreshTasks}
              title="Actualizar"
              style={{
                width: 38, height: 38,
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 12,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', color: 'var(--muted)',
              }}
            >
              <RefreshCw size={17} />
            </button>
          }
        />
      </div>

      <ContentArea />

      {/* ── Bottom nav flotante — solo mobile, desktop usa tabs ── */}
      <nav className="lg:hidden" style={{
        position: 'fixed',
        display: showNewTask ? 'none' : 'flex',
        bottom: 'max(16px, env(safe-area-inset-bottom))',
        left: '50%',
        transform: 'translateX(-50%)',
        alignItems: 'center',
        gap: 4,
        background: 'rgba(10,10,10,0.88)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 100,
        padding: '8px 12px',
        boxShadow: '0 8px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04)',
        zIndex: showNewTask ? -1 : 50,
        justifyContent: 'space-around',
      } as React.CSSProperties}>
        {visibleNavItems.map(({ key, icon: Icon, label }) => {
          const active = isNavActive(key)
          return (
            <button key={key} onClick={() => goToNav(key)} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
              padding: '6px 14px', borderRadius: 80, border: 'none', cursor: 'pointer',
              background: active ? 'rgba(212,175,55,0.12)' : 'transparent',
              outline: active ? '1px solid rgba(212,175,55,0.2)' : '1px solid transparent',
              transition: 'all 0.2s ease',
              color: active ? '#D4AF37' : 'rgba(255,255,255,0.35)',
              minWidth: 52,
            }}>
              <div style={{ position: 'relative' }}>
                <Icon size={19} strokeWidth={active ? 2.5 : 1.8} />
                {active && (
                  <div style={{ position: 'absolute', bottom: -2, left: '50%', transform: 'translateX(-50%)', width: 4, height: 4, borderRadius: '50%', background: '#D4AF37', boxShadow: '0 0 6px #D4AF37' }} />
                )}
              </div>
              <span style={{ fontSize: 9, fontWeight: active ? 700 : 500, letterSpacing: '0.3px', whiteSpace: 'nowrap' }}>{label}</span>
            </button>
          )
        })}
      </nav>

      {selectedTask && <TaskDetailModal task={selectedTask} onClose={() => setSelectedTask(null)} onUpdate={handleUpdate} onDelete={handleDelete} isAdmin={isAdmin} currentUserId={currentUserId} />}
      {showNewTask && <NewTaskModal defaultArea={defaultNewTaskArea} availableAreas={availableTaskAreas} users={users} onClose={() => setShowNewTask(false)} onCreated={(t) => { setTasks(prev => [t, ...prev]); setShowNewTask(false) }} />}
    </div>
  )
}
