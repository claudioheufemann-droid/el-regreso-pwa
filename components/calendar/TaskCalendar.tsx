'use client'

import { useState } from 'react'
import { RcTask, STATUS_CFG, AREA_CFG } from '@/lib/gestion-types'
import { getSemaphore } from '@/lib/kpis'
import { useIsDesktop } from '@/lib/useIsDesktop'

interface Props {
  tasks: RcTask[]
  onTaskClick: (task: RcTask) => void
}

type CalView = 'month' | 'week' | 'day'

const MONTHS   = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const DAYS_S   = ['L','M','X','J','V','S','D']
const DAYS_L   = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom']

function parsePlazo(plazo: string): { y: number; m: number; d: number } {
  const [y, m, d] = plazo.slice(0, 10).split('-').map(Number)
  return { y, m: m - 1, d }
}

function semColor(task: RcTask): string {
  return getSemaphore(task.plazo, task.estado).hex
}

function taskPriority(t: RcTask): number {
  if (t.estado === 'Atrasada')    return 0
  if (t.estado === 'Por Aprobar') return 1
  if (t.estado === 'En Proceso')  return 2
  if (t.estado === 'Asignada')    return 3
  return 4
}

// ── Day modal ──────────────────────────────────────────────────
function DayModal({
  day, month, year, tasks, onTaskClick, onClose,
}: {
  day: number; month: number; year: number
  tasks: RcTask[]; onTaskClick: (t: RcTask) => void; onClose: () => void
}) {
  const MONTH_NAMES = MONTHS
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9000,
        background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 22, padding: '24px 22px', width: '100%', maxWidth: 440,
          maxHeight: '80vh', overflowY: 'auto',
          boxShadow: '0 24px 80px rgba(0,0,0,0.4)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--cream)', letterSpacing: -0.8 }}>
              {day} de {MONTH_NAMES[month]}
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
              {tasks.length} tarea{tasks.length !== 1 ? 's' : ''}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--surface2)', border: '1px solid var(--border)', cursor: 'pointer', fontSize: 16, color: 'var(--muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >×</button>
        </div>

        {tasks.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--muted)', fontSize: 13 }}>
            Sin tareas este día
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {tasks.map(t => {
              const sem = getSemaphore(t.plazo, t.estado)
              const s   = STATUS_CFG[t.estado]
              const a   = AREA_CFG[t.area]
              return (
                <div
                  key={t.id}
                  onClick={() => { onTaskClick(t); onClose() }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '13px 14px', borderRadius: 14, cursor: 'pointer',
                    background: 'var(--surface2)', border: `1px solid ${sem.hex}30`,
                    borderLeft: `4px solid ${sem.hex}`,
                    transition: 'opacity 0.1s',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--cream)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.titulo}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                      <span style={{ fontSize: 9, color: a?.color ?? 'var(--muted)' }}>{t.area}</span>
                      <span style={{ fontSize: 9, color: 'rgba(128,128,128,0.4)' }}>·</span>
                      <span style={{ fontSize: 9, fontWeight: 700, color: sem.hex }}>{sem.label}</span>
                    </div>
                  </div>
                  <span style={{ fontSize: 9, padding: '3px 9px', borderRadius: 8, background: s.bg, color: s.color, fontWeight: 700, flexShrink: 0 }}>
                    {t.estado}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Week view ─────────────────────────────────────────────────
function WeekView({ year, month, weekStart, tasks, onTaskClick, isDesktop }: {
  year: number; month: number; weekStart: Date
  tasks: RcTask[]; onTaskClick: (t: RcTask) => void; isDesktop: boolean
}) {
  const today = new Date()
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart)
    d.setDate(weekStart.getDate() + i)
    return d
  })

  const tasksByDate: Record<string, RcTask[]> = {}
  for (const t of tasks) {
    const key = t.plazo.slice(0, 10)
    if (!tasksByDate[key]) tasksByDate[key] = []
    tasksByDate[key].push(t)
  }
  for (const key of Object.keys(tasksByDate)) {
    tasksByDate[key].sort((a, b) => taskPriority(a) - taskPriority(b))
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderTop: '1px solid var(--border)' }}>
      {days.map((date, col) => {
        const key = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`
        const dayTasks = tasksByDate[key] ?? []
        const isToday = date.toDateString() === today.toDateString()
        const isWeekend = col >= 5

        return (
          <div key={key} style={{
            borderRight: col < 6 ? '1px solid var(--border)' : 'none',
            borderBottom: '1px solid var(--border)',
            padding: isDesktop ? '10px 10px' : '6px 4px',
            minHeight: 160,
            background: isWeekend ? 'rgba(128,128,128,0.02)' : 'transparent',
          }}>
            {/* Day number */}
            <div style={{ marginBottom: 8 }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%',
                background: isToday ? 'var(--gold)' : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, fontWeight: isToday ? 900 : 600,
                color: isToday ? '#0A0A0A' : 'var(--cream)',
              }}>{date.getDate()}</div>
              <div style={{ fontSize: 9, color: 'var(--muted)', marginTop: 2, letterSpacing: 0.8 }}>
                {DAYS_L[col].toUpperCase()}
              </div>
            </div>
            {/* Tasks */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {dayTasks.map(t => {
                const color = semColor(t)
                return (
                  <div
                    key={t.id}
                    onClick={() => onTaskClick(t)}
                    title={t.titulo}
                    style={{
                      fontSize: 10, fontWeight: 700, padding: '4px 8px',
                      borderRadius: 7, cursor: 'pointer',
                      background: `${color}18`, color,
                      border: `1px solid ${color}35`,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}
                  >{t.titulo}</div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Day view ──────────────────────────────────────────────────
function DayView({ date, tasks, onTaskClick }: { date: Date; tasks: RcTask[]; onTaskClick: (t: RcTask) => void }) {
  const key = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`
  const dayTasks = tasks
    .filter(t => t.plazo.slice(0,10) === key)
    .sort((a, b) => taskPriority(a) - taskPriority(b))

  return (
    <div style={{ padding: '20px 0' }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)', letterSpacing: 1.4, marginBottom: 16 }}>
        {date.getDate()} DE {MONTHS[date.getMonth()].toUpperCase()} — {dayTasks.length} TAREA{dayTasks.length !== 1 ? 'S' : ''}
      </div>
      {dayTasks.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--muted)', fontSize: 13 }}>
          Sin tareas para este día
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {dayTasks.map(t => {
            const sem = getSemaphore(t.plazo, t.estado)
            const s   = STATUS_CFG[t.estado]
            const a   = AREA_CFG[t.area]
            return (
              <div key={t.id} onClick={() => onTaskClick(t)} style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px',
                borderRadius: 14, cursor: 'pointer',
                background: 'var(--surface2)', border: `1px solid ${sem.hex}30`,
                borderLeft: `4px solid ${sem.hex}`,
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--cream)', marginBottom: 4 }}>{t.titulo}</div>
                  <div style={{ fontSize: 10, color: a?.color ?? 'var(--muted)' }}>{t.area}</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5 }}>
                  <span style={{ fontSize: 9, padding: '3px 9px', borderRadius: 8, background: s.bg, color: s.color, fontWeight: 700 }}>{t.estado}</span>
                  <span style={{ fontSize: 9, fontWeight: 700, color: sem.hex }}>{sem.label}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────
export default function TaskCalendar({ tasks, onTaskClick }: Props) {
  const today     = new Date()
  const isDesktop = useIsDesktop()
  const [year, setYear]   = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [calView, setCalView] = useState<CalView>('month')
  const [modalDay, setModalDay]   = useState<number | null>(null)
  const [weekBase, setWeekBase]   = useState<Date>(() => {
    const d = new Date(today)
    const off = (d.getDay() + 6) % 7
    d.setDate(d.getDate() - off)
    d.setHours(0,0,0,0)
    return d
  })
  const [dayBase, setDayBase] = useState<Date>(() => new Date(today.getFullYear(), today.getMonth(), today.getDate()))

  // ── Month helpers ──
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7
  const daysInMonth  = new Date(year, month + 1, 0).getDate()

  const tasksByDay: Record<number, RcTask[]> = {}
  for (const t of tasks) {
    const { y: py, m: pm, d: pd } = parsePlazo(t.plazo)
    if (py === year && pm === month) {
      if (!tasksByDay[pd]) tasksByDay[pd] = []
      tasksByDay[pd].push(t)
    }
  }
  for (const d of Object.keys(tasksByDay)) {
    tasksByDay[+d].sort((a, b) => taskPriority(a) - taskPriority(b))
  }

  const cells: (number | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  const monthTaskCount = Object.values(tasksByDay).flat().length

  // ── Navigation ──
  function prevMonth()  { if (month === 0) { setYear(y => y-1); setMonth(11) } else setMonth(m => m-1) }
  function nextMonth()  { if (month === 11) { setYear(y => y+1); setMonth(0) } else setMonth(m => m+1) }
  function prevWeek()   { const d = new Date(weekBase); d.setDate(d.getDate()-7); setWeekBase(d) }
  function nextWeek()   { const d = new Date(weekBase); d.setDate(d.getDate()+7); setWeekBase(d) }
  function prevDay()    { const d = new Date(dayBase); d.setDate(d.getDate()-1); setDayBase(d) }
  function nextDay()    { const d = new Date(dayBase); d.setDate(d.getDate()+1); setDayBase(d) }

  function prev() { if (calView === 'month') prevMonth(); else if (calView === 'week') prevWeek(); else prevDay() }
  function next() { if (calView === 'month') nextMonth(); else if (calView === 'week') nextWeek(); else nextDay() }

  function periodLabel() {
    if (calView === 'month') return `${MONTHS[month]} ${year}`
    if (calView === 'week') {
      const end = new Date(weekBase); end.setDate(weekBase.getDate()+6)
      return `${weekBase.getDate()} ${MONTHS[weekBase.getMonth()].slice(0,3)} — ${end.getDate()} ${MONTHS[end.getMonth()].slice(0,3)} ${end.getFullYear()}`
    }
    return `${dayBase.getDate()} de ${MONTHS[dayBase.getMonth()]} ${dayBase.getFullYear()}`
  }

  const CELL_H     = isDesktop ? 110 : 72
  const PILLS_SHOW = isDesktop ? 3 : 1

  const modalTasks = modalDay ? (tasksByDay[modalDay] ?? []) : []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button onClick={prev} style={{ width: 36, height: 36, borderRadius: 11, background: 'var(--surface)', border: '1px solid var(--border)', cursor: 'pointer', fontSize: 16, color: 'var(--cream)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>‹</button>

        <div style={{ flex: 1 }}>
          <div style={{ fontSize: isDesktop ? 24 : 18, fontWeight: 900, color: 'var(--cream)', letterSpacing: -0.8, lineHeight: 1 }}>
            {periodLabel()}
          </div>
          {calView === 'month' && monthTaskCount > 0 && (
            <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 3 }}>
              {monthTaskCount} tarea{monthTaskCount !== 1 ? 's' : ''} este mes
            </div>
          )}
        </div>

        {/* View toggle */}
        <div style={{ display: 'flex', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 3, gap: 2, flexShrink: 0 }}>
          {(['month','week','day'] as CalView[]).map(v => {
            const labels: Record<CalView,string> = { month: 'Mes', week: 'Semana', day: 'Día' }
            return (
              <button key={v} onClick={() => setCalView(v)} style={{
                padding: isDesktop ? '6px 14px' : '5px 10px',
                borderRadius: 9, border: 'none', cursor: 'pointer',
                fontSize: isDesktop ? 11 : 10, fontWeight: 700,
                background: calView === v ? 'var(--gold)' : 'transparent',
                color: calView === v ? '#0A0A0A' : 'var(--muted)',
                transition: 'all 0.15s',
              }}>{labels[v]}</button>
            )
          })}
        </div>

        <button onClick={next} style={{ width: 36, height: 36, borderRadius: 11, background: 'var(--surface)', border: '1px solid var(--border)', cursor: 'pointer', fontSize: 16, color: 'var(--cream)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>›</button>
      </div>

      {/* ── Calendar card ── */}
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 20,
        overflow: 'hidden',
        boxShadow: 'var(--card-shadow, 0 4px 32px rgba(0,0,0,0.18))',
      }}>

        {/* Day headers — month & week only */}
        {calView !== 'day' && (
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)',
            borderBottom: '2px solid var(--border)',
            background: 'var(--surface2)',
          }}>
            {(isDesktop ? DAYS_L : DAYS_S).map((d, i) => (
              <div key={d} style={{
                padding: isDesktop ? '12px 14px' : '9px 0',
                fontSize: isDesktop ? 11 : 9, fontWeight: 800,
                color: i >= 5 ? 'var(--gold)' : 'var(--cream)',
                textAlign: isDesktop ? 'left' : 'center',
                letterSpacing: 1.4, textTransform: 'uppercase',
                opacity: i >= 5 ? 0.55 : 1,
              }}>{d}</div>
            ))}
          </div>
        )}

        {/* ── Month grid ── */}
        {calView === 'month' && (
          <div>
            {Array.from({ length: cells.length / 7 }, (_, week) => (
              <div key={week} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: week < cells.length/7 - 1 ? '1px solid var(--border)' : 'none' }}>
                {cells.slice(week*7, week*7+7).map((day, col) => {
                  if (!day) return (
                    <div key={`e-${week}-${col}`} style={{
                      height: CELL_H, borderRight: col < 6 ? '1px solid var(--border)' : 'none',
                      background: col >= 5 ? 'rgba(128,128,128,0.015)' : 'transparent',
                    }} />
                  )

                  const dayTasks   = tasksByDay[day] ?? []
                  const isTod      = day === today.getDate() && month === today.getMonth() && year === today.getFullYear()
                  const isPast     = new Date(year, month, day) < new Date(today.getFullYear(), today.getMonth(), today.getDate())
                  const isWknd     = col >= 5
                  const visible    = dayTasks.slice(0, PILLS_SHOW)
                  const overflow   = dayTasks.length - PILLS_SHOW

                  return (
                    <div
                      key={day}
                      onClick={() => setModalDay(day)}
                      style={{
                        height: CELL_H,
                        borderRight: col < 6 ? '1px solid var(--border)' : 'none',
                        padding: isDesktop ? '9px 10px' : '6px 5px',
                        cursor: 'pointer',
                        background: isTod
                          ? 'rgba(212,175,55,0.07)'
                          : isWknd
                          ? 'rgba(128,128,128,0.02)'
                          : 'transparent',
                        display: 'flex', flexDirection: 'column', gap: 3,
                        overflow: 'hidden',
                        transition: 'background 0.1s',
                        position: 'relative',
                      }}
                    >
                      {/* Day number */}
                      <div style={{
                        width: isTod ? 26 : 'auto',
                        height: isTod ? 26 : 'auto',
                        borderRadius: isTod ? '50%' : 0,
                        background: isTod ? 'var(--gold)' : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: isDesktop ? 'flex-start' : 'center',
                        padding: isTod ? '0 0 0 0' : 0,
                        justifySelf: 'flex-start',
                        flexShrink: 0,
                      }}>
                        <span style={{
                          fontSize: isDesktop ? 12 : 11, fontWeight: isTod ? 900 : 500,
                          color: isTod ? '#0A0A0A' : isPast ? 'rgba(128,128,128,0.3)' : 'var(--cream)',
                          width: isTod ? 26 : 'auto', textAlign: 'center',
                          display: 'block',
                        }}>{day}</span>
                      </div>

                      {/* Task pills — desktop */}
                      {isDesktop && visible.map(t => {
                        const color = semColor(t)
                        return (
                          <div
                            key={t.id}
                            onClick={e => { e.stopPropagation(); onTaskClick(t) }}
                            title={t.titulo}
                            style={{
                              fontSize: 9, fontWeight: 700, lineHeight: 1.2,
                              padding: '3px 7px', borderRadius: 6,
                              background: `${color}20`, color,
                              border: `1px solid ${color}40`,
                              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                              flexShrink: 0,
                            }}
                          >{t.titulo}</div>
                        )
                      })}

                      {/* Dots — mobile */}
                      {!isDesktop && dayTasks.length > 0 && (
                        <div style={{ display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap', marginTop: 2 }}>
                          {dayTasks.slice(0, 5).map((t, i) => (
                            <div key={i} style={{ width: 5, height: 5, borderRadius: '50%', background: semColor(t) }} />
                          ))}
                        </div>
                      )}

                      {/* Overflow */}
                      {isDesktop && overflow > 0 && (
                        <div style={{ fontSize: 8, color: 'var(--muted)', fontWeight: 700, paddingLeft: 2 }}>
                          +{overflow} más
                        </div>
                      )}

                      {/* Mobile count badge */}
                      {!isDesktop && dayTasks.length > 0 && (
                        <div style={{ fontSize: 7, color: 'var(--muted)', textAlign: 'center', fontWeight: 600 }}>
                          {dayTasks.length}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        )}

        {/* ── Week grid ── */}
        {calView === 'week' && (
          <WeekView
            year={year} month={month}
            weekStart={weekBase}
            tasks={tasks}
            onTaskClick={onTaskClick}
            isDesktop={isDesktop}
          />
        )}

        {/* ── Day view ── */}
        {calView === 'day' && (
          <div style={{ padding: '4px 20px 20px' }}>
            <DayView date={dayBase} tasks={tasks} onTaskClick={onTaskClick} />
          </div>
        )}
      </div>

      {/* ── Semaphore legend ── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 16 }}>
        {[
          { color: '#DC2626', label: 'Vencida / Urgente (< 24h)' },
          { color: '#D97706', label: 'Próxima (1-3 días)' },
          { color: '#16A34A', label: 'En tiempo (> 3 días)' },
          { color: '#3B82F6', label: 'Completada' },
        ].map(l => (
          <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 8, height: 8, borderRadius: 3, background: l.color, flexShrink: 0 }} />
            <span style={{ fontSize: 10, color: 'var(--muted)' }}>{l.label}</span>
          </div>
        ))}
      </div>

      {/* ── Day modal ── */}
      {modalDay !== null && (
        <DayModal
          day={modalDay} month={month} year={year}
          tasks={modalTasks}
          onTaskClick={onTaskClick}
          onClose={() => setModalDay(null)}
        />
      )}
    </div>
  )
}
