'use client'

import { useState, useMemo } from 'react'
import { RcTask, RcUser, AREA_CFG } from '@/lib/gestion-types'
import { getSemaphore } from '@/lib/kpis'
import { useIsDesktop } from '@/lib/useIsDesktop'

interface Props {
  tasks: RcTask[]
  onTaskClick: (task: RcTask) => void
  users?: RcUser[]
  onNewTask?: () => void
}

type CalView = 'month' | 'week' | 'day' | 'agenda'

const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const MONTHS_SHORT = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC']
const DAYS_L = ['LUN','MAR','MIÉ','JUE','VIE','SÁB','DOM']

function toKey(y: number, m: number, d: number) {
  return `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
}

function semColor(t: RcTask): string {
  return getSemaphore(t.plazo, t.estado).hex
}
function semLabel(t: RcTask): string {
  return getSemaphore(t.plazo, t.estado).label
}

function taskIcon(t: RcTask): string {
  if (t.estado === 'Completada') return '✅'
  if (t.estado === 'Atrasada') return '🔴'
  if (t.prioridad_maxima) return '⚡'
  const icons: Record<string,string> = { 'Ventas':'📊','Marketing':'📣','Logística':'🚚','Control de Gestión':'📈','R. Humanos':'👥','Contabilidad':'🧾','Finanzas':'💰','Producción':'⚙','Calidad':'✅','Bodega':'📦' }
  return icons[t.area] ?? '📋'
}

function daysFromNow(plazo: string): number {
  const diff = (new Date(plazo+'T12:00:00').getTime() - Date.now()) / 86400000
  return Math.ceil(diff)
}

function relativeDate(plazo: string): string {
  const d = daysFromNow(plazo)
  if (d < 0) return `Hace ${Math.abs(d)} día${Math.abs(d)!==1?'s':''}`
  if (d === 0) return 'Hoy'
  if (d === 1) return 'Mañana'
  if (d < 7) return `En ${d} días`
  if (d < 14) return 'En 1 semana'
  return `En ${Math.round(d/7)} semanas`
}

function formatDate(plazo: string): string {
  const [,m,d] = plazo.split('-')
  return `${parseInt(d)} ${MONTHS_SHORT[parseInt(m)-1]}`
}

function getTimeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 3600) return `hace ${Math.floor(diff/60)} min`
  if (diff < 86400) return `hace ${Math.floor(diff/3600)}h`
  return `hace ${Math.floor(diff/86400)}d`
}

/* ── Mini task card inside calendar cell ── */
function TaskCard({ task, onClick }: { task: RcTask; onClick: () => void }) {
  const color = semColor(task)
  const resp = task.responsable
  return (
    <div
      onClick={e => { e.stopPropagation(); onClick() }}
      style={{
        display: 'flex', alignItems: 'center', gap: 5,
        padding: '4px 7px', borderRadius: 7, cursor: 'pointer',
        background: `${color}14`, border: `1px solid ${color}35`,
        borderLeft: `3px solid ${color}`,
        flexShrink: 0, overflow: 'hidden',
        transition: 'all 0.1s',
      }}
      onMouseEnter={e => (e.currentTarget.style.background = `${color}25`)}
      onMouseLeave={e => (e.currentTarget.style.background = `${color}14`)}
    >
      <span style={{ fontSize: 9, flexShrink: 0 }}>{taskIcon(task)}</span>
      <span style={{ fontSize: 9, fontWeight: 700, color: '#E5E7EB', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.3 }}>
        {task.titulo}
      </span>
      {resp && (
        <div style={{ width: 14, height: 14, borderRadius: '50%', background: `${color}35`, border: `1px solid ${color}50`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 6, fontWeight: 800, color, flexShrink: 0 }}>
          {resp.iniciales?.slice(0,2) ?? '??'}
        </div>
      )}
    </div>
  )
}

/* ── Day modal ── */
function DayModal({ day, month, year, tasks, onTaskClick, onClose }: { day: number; month: number; year: number; tasks: RcTask[]; onTaskClick: (t: RcTask) => void; onClose: () => void }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#111318', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 20, padding: '22px 20px', width: '100%', maxWidth: 420, maxHeight: '80vh', overflowY: 'auto', boxShadow: '0 32px 80px rgba(0,0,0,0.6)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 900, color: '#F4EEDF' }}>{day} de {MONTHS[month]}</div>
            <div style={{ fontSize: 11, color: '#6B7280', marginTop: 2 }}>{tasks.length} tarea{tasks.length!==1?'s':''}</div>
          </div>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 9, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer', fontSize: 16, color: '#9CA3AF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
        </div>
        {tasks.length === 0
          ? <div style={{ textAlign: 'center', padding: '24px 0', color: '#6B7280', fontSize: 13 }}>Sin tareas este día</div>
          : <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {tasks.map(t => {
                const color = semColor(t)
                const resp = t.responsable
                return (
                  <div key={t.id} onClick={() => { onTaskClick(t); onClose() }}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 12, cursor: 'pointer', background: `${color}12`, border: `1px solid ${color}30`, borderLeft: `3px solid ${color}`, transition: 'opacity 0.1s' }}>
                    <span style={{ fontSize: 16 }}>{taskIcon(t)}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#F4EEDF' }}>{t.titulo}</div>
                      <div style={{ fontSize: 10, color, marginTop: 2 }}>{semLabel(t)} · {t.area}</div>
                    </div>
                    {resp && (
                      <div style={{ width: 26, height: 26, borderRadius: '50%', background: `${color}25`, border: `1.5px solid ${color}50`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 800, color, flexShrink: 0 }}>
                        {resp.iniciales}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
        }
      </div>
    </div>
  )
}

/* ── Main ── */
export default function TaskCalendar({ tasks, onTaskClick, onNewTask }: Props) {
  const isDesktop = useIsDesktop()
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [calView, setCalView] = useState<CalView>('month')
  const [modalDay, setModalDay] = useState<number | null>(null)
  const [weekBase, setWeekBase] = useState<Date>(() => {
    const d = new Date(today); const off = (d.getDay()+6)%7; d.setDate(d.getDate()-off); d.setHours(0,0,0,0); return d
  })
  const [dayBase, setDayBase] = useState<Date>(() => new Date(today.getFullYear(), today.getMonth(), today.getDate()))

  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7
  const daysInMonth = new Date(year, month+1, 0).getDate()

  const tasksByDay = useMemo(() => {
    const map: Record<number, RcTask[]> = {}
    for (const t of tasks) {
      const [ty, tm, td] = t.plazo.slice(0,10).split('-').map(Number)
      if (ty === year && tm === month+1) {
        if (!map[td]) map[td] = []
        map[td].push(t)
      }
    }
    for (const d of Object.keys(map)) {
      map[+d].sort((a,b) => {
        const pri = (t: RcTask) => t.estado==='Atrasada'?0:t.estado==='Por Aprobar'?1:t.estado==='En Proceso'?2:3
        return pri(a)-pri(b)
      })
    }
    return map
  }, [tasks, year, month])

  const cells: (number|null)[] = [...Array(firstWeekday).fill(null), ...Array.from({length:daysInMonth},(_,i)=>i+1)]
  while (cells.length % 7 !== 0) cells.push(null)

  const monthTasks = Object.values(tasksByDay).flat()
  const kpiAtrasadas = monthTasks.filter(t => t.estado==='Atrasada').length
  const kpiCompletadas = monthTasks.filter(t => t.estado==='Completada').length
  const kpiProximas = monthTasks.filter(t => { const d = daysFromNow(t.plazo); return d>=0 && d<=3 && t.estado!=='Completada' }).length
  const kpiTotal = monthTasks.length

  // Sidebar data
  const proxVenc = useMemo(() => [...tasks]
    .filter(t => t.estado!=='Completada' && daysFromNow(t.plazo)>=0)
    .sort((a,b)=>a.plazo.localeCompare(b.plazo))
    .slice(0,3), [tasks])

  const criticas = useMemo(() => [...tasks]
    .filter(t => t.prioridad_maxima && t.estado!=='Completada')
    .sort((a,b)=>a.plazo.localeCompare(b.plazo))
    .slice(0,3), [tasks])

  const recentActivity = useMemo(() => [...tasks]
    .sort((a,b)=>(b.created_at??'').localeCompare(a.created_at??''))
    .slice(0,5)
    .map(t => {
      const type = t.estado==='Completada'?'completada':t.estado==='En Proceso'?'proceso':'asignada'
      const who = t.responsable?.nombre?.split(' ').slice(0,2).map((w,i)=>i===0?w:w[0]+'.').join(' ') ?? 'Alguien'
      return { t, type, who, time: t.created_at ? getTimeAgo(t.created_at) : 'hace un momento' }
    }), [tasks])

  function prev() {
    if (calView==='month') { if (month===0) { setYear(y=>y-1); setMonth(11) } else setMonth(m=>m-1) }
    else if (calView==='week') { const d=new Date(weekBase); d.setDate(d.getDate()-7); setWeekBase(d) }
    else { const d=new Date(dayBase); d.setDate(d.getDate()-1); setDayBase(d) }
  }
  function next() {
    if (calView==='month') { if (month===11) { setYear(y=>y+1); setMonth(0) } else setMonth(m=>m+1) }
    else if (calView==='week') { const d=new Date(weekBase); d.setDate(d.getDate()+7); setWeekBase(d) }
    else { const d=new Date(dayBase); d.setDate(d.getDate()+1); setDayBase(d) }
  }

  const periodLabel = calView==='month' ? `${MONTHS[month]} ${year}`
    : calView==='week' ? (() => { const end=new Date(weekBase); end.setDate(weekBase.getDate()+6); return `${weekBase.getDate()} ${MONTHS[weekBase.getMonth()].slice(0,3)} — ${end.getDate()} ${MONTHS[end.getMonth()].slice(0,3)}` })()
    : `${dayBase.getDate()} de ${MONTHS[dayBase.getMonth()]} ${dayBase.getFullYear()}`

  const actColor: Record<string,string> = { completada:'#22C55E', proceso:'#E67E22', asignada:'#5B8AA8' }
  const actIcon: Record<string,string> = { completada:'✓', proceso:'↻', asignada:'↗' }
  const actVerb: Record<string,string> = { completada:'completó', proceso:'inició', asignada:'asignó a' }

  const CARD: React.CSSProperties = { background: '#111318', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16 }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, height: '100%' }}>

      {/* ── HEADER ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 18 }}>

        {/* Fila 1: nav + title + CTA */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={prev} style={{ width: 36, height: 36, borderRadius: 11, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer', fontSize: 16, color: '#D1D5DB', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>‹</button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: isDesktop ? 26 : 20, fontWeight: 900, color: '#F4EEDF', letterSpacing: -1, lineHeight: 1 }}>{periodLabel}</span>
              <span style={{ fontSize: 14, color: '#6B7280', cursor: 'pointer' }}>▾</span>
            </div>
            <div style={{ fontSize: 10, color: '#6B7280', marginTop: 2 }}>{kpiTotal} tareas este mes</div>
          </div>
          <button onClick={next} style={{ width: 36, height: 36, borderRadius: 11, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer', fontSize: 16, color: '#D1D5DB', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>›</button>
          <div style={{ display: 'flex', borderRadius: 11, overflow: 'hidden', border: '1px solid rgba(212,175,55,0.4)', flexShrink: 0 }}>
            <button onClick={onNewTask} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: isDesktop ? '10px 18px' : '8px 12px', background: '#D4AF37', border: 'none', cursor: 'pointer', fontSize: isDesktop ? 13 : 12, fontWeight: 800, color: '#0A0A0A' }}>
              + Nueva tarea
            </button>
            {isDesktop && <><div style={{ width: 1, background: 'rgba(0,0,0,0.2)' }} />
            <button style={{ padding: '10px 10px', background: '#D4AF37', border: 'none', cursor: 'pointer', fontSize: 12, color: '#0A0A0A' }}>▾</button></>}
          </div>
        </div>

        {/* Fila 2: mini KPIs + tabs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'nowrap', overflowX: isDesktop ? 'visible' : 'auto' }}>
          {/* Mini KPIs — scroll horizontal en mobile */}
          <div style={{ display: 'flex', gap: 8, flex: 1, overflowX: isDesktop ? 'visible' : 'auto', paddingBottom: isDesktop ? 0 : 2 }}>
            {[
              { color: '#DC2626', bg: 'rgba(220,38,38,0.12)', border: 'rgba(220,38,38,0.3)', icon: '🔴', value: kpiAtrasadas, label: 'Atrasadas' },
              { color: '#D97706', bg: 'rgba(217,119,6,0.12)',  border: 'rgba(217,119,6,0.3)',  icon: '🟡', value: kpiProximas,  label: 'Próximas\n(1-3 días)' },
              { color: '#22C55E', bg: 'rgba(34,197,94,0.12)',  border: 'rgba(34,197,94,0.3)',  icon: '✅', value: kpiCompletadas, label: 'Completadas' },
              { color: '#3B82F6', bg: 'rgba(59,130,246,0.12)', border: 'rgba(59,130,246,0.3)', icon: '🔵', value: kpiTotal,     label: 'Total tareas' },
            ].map((k,i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: isDesktop ? 8 : 6, padding: isDesktop ? '7px 14px' : '5px 10px', borderRadius: 10, background: k.bg, border: `1px solid ${k.border}`, flexShrink: 0 }}>
                <span style={{ fontSize: isDesktop ? 13 : 11 }}>{k.icon}</span>
                <div>
                  <div style={{ fontSize: isDesktop ? 18 : 15, fontWeight: 900, color: k.color, lineHeight: 1 }}>{k.value}</div>
                  <div style={{ fontSize: 9, color: '#9CA3AF', lineHeight: 1.2, whiteSpace: 'pre' }}>{k.label}</div>
                </div>
              </div>
            ))}
          </div>
          {/* View tabs */}
          <div style={{ display: 'flex', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 11, padding: 3, gap: 2, flexShrink: 0 }}>
            {(['month','week','day','agenda'] as CalView[]).map(v => {
              const labels: Record<CalView,string> = { month:'Mes', week:'Sem', day:'Día', agenda:'Agenda' }
              return (
                <button key={v} onClick={() => setCalView(v)} style={{ padding: isDesktop ? '7px 14px' : '6px 10px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: isDesktop ? 12 : 11, fontWeight: 700, background: calView===v ? '#D4AF37' : 'transparent', color: calView===v ? '#0A0A0A' : '#9CA3AF', transition: 'all 0.15s' }}>
                  {labels[v]}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── BODY: calendar + sidebar ── */}
      <div style={{ display: 'grid', gridTemplateColumns: isDesktop ? '1fr 280px' : '1fr', gap: 16, flex: 1, alignItems: 'start' }}>

        {/* CALENDAR */}
        <div style={{ background: '#0D0F14', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 18, overflow: 'hidden' }}>

          {/* Day headers */}
          {calView !== 'day' && calView !== 'agenda' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', borderBottom: '1px solid rgba(255,255,255,0.07)', background: '#111318' }}>
              {DAYS_L.map((d,i) => (
                <div key={d} style={{ padding: '13px 10px', fontSize: 11, fontWeight: 800, color: i>=5 ? '#D4AF37' : '#9CA3AF', textAlign: 'center', letterSpacing: 1.2, opacity: i>=5 ? 0.7 : 1 }}>{d}</div>
              ))}
            </div>
          )}

          {/* ── Month view ── */}
          {calView === 'month' && (
            <div>
              {Array.from({length: cells.length/7}, (_,week) => (
                <div key={week} style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', borderBottom: week < cells.length/7-1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                  {cells.slice(week*7, week*7+7).map((day, col) => {
                    const cellMinH = isDesktop ? 110 : 80
                    if (!day) return (
                      <div key={`e-${week}-${col}`} style={{ minHeight: cellMinH, borderRight: col<6 ? '1px solid rgba(255,255,255,0.05)' : 'none', background: col>=5 ? 'rgba(255,255,255,0.008)' : 'transparent' }} />
                    )
                    const dayTasks = tasksByDay[day] ?? []
                    const isToday = day===today.getDate() && month===today.getMonth() && year===today.getFullYear()
                    const isPast = new Date(year,month,day) < new Date(today.getFullYear(),today.getMonth(),today.getDate())
                    const isWknd = col >= 5
                    // En mobile: mostrar solo 1 tarea + dot para overflow
                    const visibleCount = isDesktop ? 3 : 1
                    const visible = dayTasks.slice(0, visibleCount)
                    const overflow = dayTasks.length - visibleCount

                    return (
                      <div key={day} onClick={() => setModalDay(day)}
                        style={{ minHeight: cellMinH, borderRight: col<6?'1px solid rgba(255,255,255,0.05)':'none', padding: isDesktop ? '8px 7px' : '5px 4px', cursor: 'pointer', background: isToday ? 'rgba(212,175,55,0.06)' : isWknd ? 'rgba(255,255,255,0.01)' : 'transparent', display: 'flex', flexDirection: 'column', gap: 3, overflow: 'hidden', transition: 'background 0.1s', position: 'relative' }}
                        onMouseEnter={e => { if (!isToday) e.currentTarget.style.background = 'rgba(255,255,255,0.03)' }}
                        onMouseLeave={e => { e.currentTarget.style.background = isToday ? 'rgba(212,175,55,0.06)' : isWknd ? 'rgba(255,255,255,0.01)' : 'transparent' }}>

                        {/* Day number */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: isDesktop ? 26 : 22, height: isDesktop ? 26 : 22, borderRadius: '50%', background: isToday ? '#D4AF37' : 'transparent', boxShadow: isToday ? '0 0 12px rgba(212,175,55,0.4)' : 'none', marginBottom: 1, flexShrink: 0 }}>
                          <span style={{ fontSize: isDesktop ? 12 : 10, fontWeight: isToday ? 900 : 500, color: isToday ? '#0A0A0A' : isPast ? 'rgba(156,163,175,0.35)' : '#E5E7EB', lineHeight: 1 }}>{day}</span>
                        </div>

                        {/* Task cards */}
                        {visible.map(t => <TaskCard key={t.id} task={t} onClick={() => onTaskClick(t)} />)}

                        {/* +N más / dot en mobile */}
                        {overflow > 0 && (
                          isDesktop
                            ? <div style={{ fontSize: 9, color: '#9CA3AF', fontWeight: 700, paddingLeft: 3 }}>+{overflow} más</div>
                            : <div style={{ display: 'flex', alignItems: 'center', gap: 2, paddingLeft: 2 }}>
                                <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#9CA3AF' }} />
                                <span style={{ fontSize: 8, color: '#9CA3AF', fontWeight: 700 }}>+{overflow}</span>
                              </div>
                        )}

                        {/* Today dot */}
                        {isToday && dayTasks.length === 0 && (
                          <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#D4AF37', margin: '2px auto' }} />
                        )}
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          )}

          {/* ── Week view ── */}
          {calView === 'week' && (() => {
            const days = Array.from({length:7},(_,i) => { const d=new Date(weekBase); d.setDate(weekBase.getDate()+i); return d })
            return (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)' }}>
                {days.map((date,col) => {
                  const key = toKey(date.getFullYear(), date.getMonth(), date.getDate())
                  const dayTasks = tasks.filter(t=>t.plazo.slice(0,10)===key)
                  const isToday = date.toDateString()===today.toDateString()
                  return (
                    <div key={key} style={{ borderRight: col<6?'1px solid rgba(255,255,255,0.05)':'none', padding: '10px 8px', minHeight: 180, background: col>=5?'rgba(255,255,255,0.01)':'transparent' }}>
                      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', width:28, height:28, borderRadius:'50%', background:isToday?'#D4AF37':'transparent', marginBottom:8, boxShadow:isToday?'0 0 10px rgba(212,175,55,0.4)':'none' }}>
                        <span style={{ fontSize:12, fontWeight:isToday?900:500, color:isToday?'#0A0A0A':'#E5E7EB' }}>{date.getDate()}</span>
                      </div>
                      <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                        {dayTasks.map(t => <TaskCard key={t.id} task={t} onClick={()=>onTaskClick(t)} />)}
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })()}

          {/* ── Day view ── */}
          {calView === 'day' && (() => {
            const key = toKey(dayBase.getFullYear(), dayBase.getMonth(), dayBase.getDate())
            const dayTasks = tasks.filter(t=>t.plazo.slice(0,10)===key).sort((a,b)=>{ const p=(t:RcTask)=>t.estado==='Atrasada'?0:t.estado==='En Proceso'?1:2; return p(a)-p(b) })
            return (
              <div style={{ padding: '20px 22px' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#9CA3AF', letterSpacing: 1.3, marginBottom: 16, textTransform: 'uppercase' }}>
                  {dayBase.getDate()} DE {MONTHS[dayBase.getMonth()].toUpperCase()} — {dayTasks.length} TAREA{dayTasks.length!==1?'S':''}
                </div>
                {dayTasks.length === 0
                  ? <div style={{ textAlign:'center', padding:'40px 0', color:'#6B7280', fontSize:13 }}>Sin tareas para este día</div>
                  : <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                      {dayTasks.map(t => {
                        const color = semColor(t)
                        const resp = t.responsable
                        return (
                          <div key={t.id} onClick={()=>onTaskClick(t)} style={{ display:'flex', alignItems:'center', gap:12, padding:'14px 16px', borderRadius:12, cursor:'pointer', background:`${color}12`, border:`1px solid ${color}30`, borderLeft:`3px solid ${color}` }}>
                            <span style={{ fontSize:20 }}>{taskIcon(t)}</span>
                            <div style={{ flex:1, minWidth:0 }}>
                              <div style={{ fontSize:13, fontWeight:700, color:'#F4EEDF', marginBottom:3 }}>{t.titulo}</div>
                              <div style={{ fontSize:10, color }}>{ semLabel(t) } · {t.area}</div>
                            </div>
                            {resp && <div style={{ width:28, height:28, borderRadius:'50%', background:`${color}25`, border:`1.5px solid ${color}50`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:9, fontWeight:800, color }}>{resp.iniciales}</div>}
                          </div>
                        )
                      })}
                    </div>
                }
              </div>
            )
          })()}

          {/* ── Agenda view ── */}
          {calView === 'agenda' && (() => {
            const upcoming = [...tasks].filter(t=>t.plazo>=toKey(year,month,1)).sort((a,b)=>a.plazo.localeCompare(b.plazo)).slice(0,20)
            return (
              <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#9CA3AF', letterSpacing: 1.3, marginBottom: 8, textTransform: 'uppercase' }}>Agenda — Próximas tareas</div>
                {upcoming.length === 0 ? <div style={{ textAlign:'center', padding:'32px 0', color:'#6B7280', fontSize:13 }}>Sin tareas próximas</div>
                : upcoming.map(t => {
                    const color = semColor(t); const resp = t.responsable
                    return (
                      <div key={t.id} onClick={()=>onTaskClick(t)} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 14px', borderRadius:10, cursor:'pointer', background:`${color}10`, border:`1px solid ${color}25`, borderLeft:`3px solid ${color}` }}>
                        <div style={{ textAlign:'center', minWidth:42, background:`${color}18`, borderRadius:8, padding:'5px 0', flexShrink:0 }}>
                          <div style={{ fontSize:16, fontWeight:900, color, lineHeight:1 }}>{parseInt(t.plazo.split('-')[2])}</div>
                          <div style={{ fontSize:7, color, fontWeight:700 }}>{MONTHS_SHORT[parseInt(t.plazo.split('-')[1])-1]}</div>
                        </div>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:12, fontWeight:700, color:'#F4EEDF', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{t.titulo}</div>
                          <div style={{ fontSize:10, color:'#6B7280', marginTop:2 }}>{t.area} · {relativeDate(t.plazo)}</div>
                        </div>
                        {resp && <div style={{ width:24, height:24, borderRadius:'50%', background:`${color}25`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:8, fontWeight:800, color, flexShrink:0 }}>{resp.iniciales}</div>}
                      </div>
                    )
                  })
                }
              </div>
            )
          })()}
        </div>

        {/* SIDEBAR — en mobile se mueve debajo del calendario gracias al single-column grid */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Próximos vencimientos */}
          <div style={CARD}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 16px', borderBottom:'1px solid rgba(255,255,255,0.06)' }}>
              <span style={{ fontSize:11, fontWeight:800, color:'#F4EEDF', letterSpacing:1.2, textTransform:'uppercase' }}>Próximos vencimientos</span>
              <button style={{ fontSize:11, color:'#D4AF37', background:'none', border:'none', cursor:'pointer', fontWeight:700 }}>Ver todos</button>
            </div>
            <div style={{ display:'flex', flexDirection:'column' }}>
              {proxVenc.length === 0 && <div style={{ padding:'16px', fontSize:11, color:'#6B7280', textAlign:'center' }}>Sin vencimientos próximos</div>}
              {proxVenc.map((t,i) => {
                const color = semColor(t)
                const resp = t.responsable
                const [,m,d] = t.plazo.split('-')
                return (
                  <div key={t.id} onClick={()=>onTaskClick(t)} style={{ padding:'12px 16px', cursor:'pointer', borderBottom:i<proxVenc.length-1?'1px solid rgba(255,255,255,0.04)':'none', transition:'background 0.1s' }}
                    onMouseEnter={e=>(e.currentTarget.style.background='rgba(255,255,255,0.03)')}
                    onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
                    <div style={{ display:'flex', alignItems:'flex-start', gap:10 }}>
                      <div style={{ textAlign:'center', minWidth:42, background:`${color}16`, border:`1px solid ${color}25`, borderRadius:8, padding:'5px 0', flexShrink:0 }}>
                        <div style={{ fontSize:16, fontWeight:900, color, lineHeight:1 }}>{parseInt(d)}</div>
                        <div style={{ fontSize:7, color, fontWeight:700, letterSpacing:0.5 }}>{MONTHS_SHORT[parseInt(m)-1]}</div>
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:12, fontWeight:700, color:'#60A5FA', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', marginBottom:3 }}>{t.titulo}</div>
                        <div style={{ fontSize:10, color:'#9CA3AF' }}>{relativeDate(t.plazo)}</div>
                        {resp && (
                          <div style={{ display:'flex', alignItems:'center', gap:5, marginTop:5 }}>
                            <div style={{ width:16, height:16, borderRadius:'50%', background:`${color}25`, border:`1px solid ${color}40`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:6, fontWeight:800, color }}>{resp.iniciales}</div>
                            <span style={{ fontSize:10, color:'#9CA3AF' }}>{resp.nombre?.split(' ')[0]}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Tareas críticas */}
          <div style={CARD}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 16px', borderBottom:'1px solid rgba(255,255,255,0.06)' }}>
              <span style={{ fontSize:11, fontWeight:800, color:'#F4EEDF', letterSpacing:1.2, textTransform:'uppercase' }}>Tareas críticas</span>
              <button style={{ fontSize:11, color:'#D4AF37', background:'none', border:'none', cursor:'pointer', fontWeight:700 }}>Ver todas</button>
            </div>
            <div style={{ display:'flex', flexDirection:'column' }}>
              {criticas.length === 0 && <div style={{ padding:'16px', fontSize:11, color:'#6B7280', textAlign:'center' }}>Sin tareas críticas</div>}
              {criticas.map((t,i) => {
                const color = semColor(t)
                const [,m,d] = t.plazo.split('-')
                return (
                  <div key={t.id} onClick={()=>onTaskClick(t)} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 16px', cursor:'pointer', borderBottom:i<criticas.length-1?'1px solid rgba(255,255,255,0.04)':'none', transition:'background 0.1s' }}
                    onMouseEnter={e=>(e.currentTarget.style.background='rgba(255,255,255,0.03)')}
                    onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
                    <div style={{ width:28, height:28, borderRadius:8, background:'rgba(220,38,38,0.12)', border:'1px solid rgba(220,38,38,0.25)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, flexShrink:0 }}>🔴</div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:11, fontWeight:700, color:'#F87171', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', marginBottom:2 }}>{t.titulo}</div>
                      <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                        <span style={{ fontSize:9, padding:'1px 6px', borderRadius:6, background:'rgba(220,38,38,0.12)', color:'#F87171', fontWeight:700 }}>Alta</span>
                        <span style={{ fontSize:9, color:'#9CA3AF' }}>{parseInt(d)} {MONTHS_SHORT[parseInt(m)-1]}</span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Actividad reciente */}
          <div style={CARD}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 16px', borderBottom:'1px solid rgba(255,255,255,0.06)' }}>
              <span style={{ fontSize:11, fontWeight:800, color:'#F4EEDF', letterSpacing:1.2, textTransform:'uppercase' }}>Actividad reciente</span>
              <button style={{ fontSize:11, color:'#D4AF37', background:'none', border:'none', cursor:'pointer', fontWeight:700 }}>Ver toda</button>
            </div>
            <div style={{ display:'flex', flexDirection:'column' }}>
              {recentActivity.map(({t,type,who,time},idx) => {
                const c = actColor[type]
                const cfg = AREA_CFG[t.area]
                return (
                  <div key={t.id+idx} onClick={()=>onTaskClick(t)} style={{ display:'flex', gap:10, padding:'10px 16px', borderBottom:idx<recentActivity.length-1?'1px solid rgba(255,255,255,0.04)':'none', cursor:'pointer', transition:'background 0.1s', alignItems:'flex-start' }}
                    onMouseEnter={e=>(e.currentTarget.style.background='rgba(255,255,255,0.03)')}
                    onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
                    <div style={{ width:26, height:26, borderRadius:8, background:`${c}18`, border:`1px solid ${c}30`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, color:c, fontWeight:900, flexShrink:0, marginTop:1 }}>
                      {actIcon[type]}
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:11, color:'#9CA3AF', lineHeight:1.4 }}>
                        <span style={{ fontWeight:600, color:'#F4EEDF' }}>{who}</span>
                        {' '}{actVerb[type]}{' '}
                        <span style={{ fontWeight:700, color: cfg?.color ?? c }}>{t.titulo.length>22?t.titulo.slice(0,22)+'…':t.titulo}</span>
                      </div>
                      <div style={{ fontSize:9, color:'rgba(156,163,175,0.4)', marginTop:2 }}>{time}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

        </div>
      </div>

      {/* ── FOOTER ── */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:16, flexWrap:'wrap', gap:10 }}>
        <div style={{ display:'flex', gap: isDesktop ? 16 : 10, flexWrap:'wrap' }}>
          {[
            { color:'#DC2626', label: isDesktop ? 'Vencida / Urgente (< 24h)' : 'Vencida' },
            { color:'#D97706', label: isDesktop ? 'Próxima (1-3 días)' : 'Próxima' },
            { color:'#16A34A', label: isDesktop ? 'En tiempo (> 3 días)' : 'En tiempo' },
            { color:'#3B82F6', label:'Completada' },
          ].map(l => (
            <div key={l.label} style={{ display:'flex', alignItems:'center', gap:6 }}>
              <div style={{ width:9, height:9, borderRadius:3, background:l.color, flexShrink:0 }} />
              <span style={{ fontSize:10, color:'#6B7280' }}>{l.label}</span>
            </div>
          ))}
        </div>
        {isDesktop && (
          <button style={{ display:'flex', alignItems:'center', gap:7, padding:'8px 16px', borderRadius:10, background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.1)', cursor:'pointer', fontSize:12, color:'#9CA3AF', fontWeight:600 }}>
            <span>↺</span> Sincronizar calendario <span style={{ opacity:0.5 }}>▾</span>
          </button>
        )}
      </div>

      {/* ── DAY MODAL ── */}
      {modalDay !== null && (
        <DayModal day={modalDay} month={month} year={year} tasks={tasksByDay[modalDay]??[]} onTaskClick={onTaskClick} onClose={()=>setModalDay(null)} />
      )}

    </div>
  )
}
