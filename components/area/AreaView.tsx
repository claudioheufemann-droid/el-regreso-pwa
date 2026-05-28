'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { RcTask, RcUser, TaskStatus, AREA_CFG, STATUS_LIST, STATUS_CFG } from '@/lib/gestion-types'
import { useIsDesktop } from '@/lib/useIsDesktop'
import TaskRow from './TaskRow'
import NewTaskModal from '@/components/modals/NewTaskModal'
import TaskDetailModal from '@/components/modals/TaskDetailModal'
import Avatar from '@/components/ui/Avatar'

const FILTER_TABS: ('Todas' | TaskStatus)[] = ['Todas', ...STATUS_LIST]
type AreaViewMode = 'lista' | 'equipo'

interface Props {
  area: string
  initialTasks: RcTask[]
  users: RcUser[]
  isAdmin?: boolean
  currentUserId?: string
}

export default function AreaView({ area, initialTasks, users, isAdmin, currentUserId }: Props) {
  const router = useRouter()
  const isDesktop = useIsDesktop()
  const cfg = AREA_CFG[area] ?? { color: '#D4AF37', dim: '#141007', code: '??' }
  const [tasks, setTasks] = useState(initialTasks)
  const [filter, setFilter] = useState<'Todas' | TaskStatus>('Todas')
  const [showNew, setShowNew] = useState(false)
  const [selectedTask, setSelectedTask] = useState<RcTask | null>(null)
  const [viewMode, setViewMode] = useState<AreaViewMode>('lista')

  // ── Filtro por responsable ──
  const [filterUserId, setFilterUserId] = useState<string | null>(null)

  // ── Selección múltiple (admin) ──
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkLoading, setBulkLoading] = useState<'approve' | 'delete' | 'status' | null>(null)
  const [bulkConfirmDelete, setBulkConfirmDelete] = useState(false)
  const [showStatusPicker, setShowStatusPicker] = useState(false)

  // Usuarios que tienen tareas en esta área
  const areaUserIds = [...new Set(tasks.map(t => t.responsable_id))]
  const areaUsers = users.filter(u => areaUserIds.includes(u.id))

  const counts = FILTER_TABS.reduce((acc, f) => ({
    ...acc,
    [f]: f === 'Todas' ? tasks.length : tasks.filter(t => t.estado === f).length,
  }), {} as Record<string, number>)

  const visibleTabs = FILTER_TABS.filter(f => counts[f] > 0 || f === 'Todas')

  // Aplicar ambos filtros: estado + responsable
  const filtered = tasks
    .filter(t => filter === 'Todas' || t.estado === filter)
    .filter(t => filterUserId === null || t.responsable_id === filterUserId)

  const atrasadas = counts['Atrasada'] ?? 0
  const porAprobar = counts['Por Aprobar'] ?? 0
  const completadas = counts['Completada'] ?? 0
  const pct = tasks.length > 0 ? Math.round((completadas / tasks.length) * 100) : 0

  const handleUpdate = useCallback((updated: RcTask) => {
    setTasks(prev => prev.map(t => t.id === updated.id ? updated : t))
  }, [])
  const handleDelete = useCallback((id: string) => {
    setTasks(prev => prev.filter(t => t.id !== id))
    setSelectedTask(null)
  }, [])
  const handleCreated = useCallback((task: RcTask) => {
    setTasks(prev => [task, ...prev])
  }, [])

  // ── Selección múltiple helpers ──
  function toggleSelectMode() {
    setSelectMode(v => !v)
    setSelectedIds(new Set())
    setBulkConfirmDelete(false)
    setShowStatusPicker(false)
  }
  function toggleId(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }
  function selectAll() { setSelectedIds(new Set(filtered.map(t => t.id))) }
  function clearAll() { setSelectedIds(new Set()) }

  async function bulkApprove() {
    if (selectedIds.size === 0) return
    setBulkLoading('approve')
    await Promise.allSettled([...selectedIds].map(id =>
      fetch('/api/tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, estado: 'Completada' }),
      }).then(r => r.json()).then(u => setTasks(prev => prev.map(t => t.id === u.id ? u : t)))
    ))
    setSelectedIds(new Set()); setSelectMode(false); setBulkLoading(null)
  }

  async function bulkChangeStatus(newStatus: TaskStatus) {
    if (selectedIds.size === 0) return
    setBulkLoading('status')
    setShowStatusPicker(false)
    await Promise.allSettled([...selectedIds].map(id =>
      fetch('/api/tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, estado: newStatus }),
      }).then(r => r.json()).then(u => setTasks(prev => prev.map(t => t.id === u.id ? u : t)))
    ))
    setSelectedIds(new Set()); setSelectMode(false); setBulkLoading(null)
  }

  async function bulkDelete() {
    if (selectedIds.size === 0) return
    setBulkLoading('delete')
    await Promise.allSettled([...selectedIds].map(id =>
      fetch('/api/tasks', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      }).then(() => setTasks(prev => prev.filter(t => t.id !== id)))
    ))
    setSelectedIds(new Set()); setSelectMode(false); setBulkConfirmDelete(false); setBulkLoading(null)
  }

  const nSelected = selectedIds.size
  const allSelected = filtered.length > 0 && nSelected === filtered.length
  const approvable = filtered.filter(t => selectedIds.has(t.id) && !['Completada', 'Rechazada'].includes(t.estado))

  // ── Vista Equipo: stats por persona ──
  const teamStats = areaUsers.map(u => {
    const myTasks = tasks.filter(t => t.responsable_id === u.id)
    const comp = myTasks.filter(t => t.estado === 'Completada').length
    const atr = myTasks.filter(t => t.estado === 'Atrasada').length
    const enProceso = myTasks.filter(t => t.estado === 'En Proceso').length
    const porApr = myTasks.filter(t => t.estado === 'Por Aprobar').length
    const pct = myTasks.length > 0 ? Math.round((comp / myTasks.length) * 100) : 0
    const color = pct >= 80 ? '#4A7A3A' : pct >= 50 ? '#D4AF37' : atr > 0 ? '#FF6B6B' : '#5B8AA8'
    return { user: u, total: myTasks.length, comp, atr, enProceso, porApr, pct, color }
  }).filter(s => s.total > 0).sort((a, b) => b.pct - a.pct)

  // Panel izquierdo reutilizable (desktop sidebar + stats + filtros)
  function LeftPanel() {
    return (
      <div style={{
        width: isDesktop ? 260 : '100%',
        flexShrink: 0,
        background: 'var(--surface)',
        borderRight: isDesktop ? '1px solid var(--border)' : 'none',
        borderBottom: !isDesktop ? '1px solid var(--border)' : 'none',
        display: 'flex', flexDirection: 'column',
        overflowY: isDesktop ? 'auto' : 'visible',
      }}>

        {/* ── Header: badge + nombre + subtítulo ── */}
        <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid rgba(128,128,128,0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
            <div style={{ width: 48, height: 48, borderRadius: 14, background: cfg.dim, border: `1px solid ${cfg.color}35`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 900, color: cfg.color, flexShrink: 0, letterSpacing: 0.5 }}>{cfg.code}</div>
            <div>
              <div style={{ fontSize: 17, fontWeight: 900, color: 'var(--cream)', letterSpacing: -0.3, lineHeight: 1.1 }}>
                {selectMode ? (nSelected === 0 ? 'Seleccionar' : `${nSelected} seleccionada${nSelected !== 1 ? 's' : ''}`) : area}
              </div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', letterSpacing: 1.2, textTransform: 'uppercase', marginTop: 3 }}>
                {selectMode ? area : 'Gestión de Tareas'}
              </div>
            </div>
            {/* Acciones en header (sólo cuando no selectMode) */}
            {!selectMode && (
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                <button onClick={() => setViewMode(v => v === 'lista' ? 'equipo' : 'lista')} className="touch-active" style={{ width: 34, height: 34, borderRadius: 10, cursor: 'pointer', background: viewMode === 'equipo' ? `${cfg.color}18` : 'rgba(255,255,255,0.05)', border: `1px solid ${viewMode === 'equipo' ? cfg.color + '40' : 'rgba(255,255,255,0.1)'}`, fontSize: 14, color: viewMode === 'equipo' ? cfg.color : '#8A8076', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {viewMode === 'lista' ? '👥' : '≡'}
                </button>
                {isAdmin && (
                  <button onClick={toggleSelectMode} className="touch-active" style={{ width: 34, height: 34, borderRadius: 10, cursor: 'pointer', background: 'rgba(212,175,55,0.08)', border: '1px solid rgba(212,175,55,0.2)', fontSize: 14, color: '#D4AF37', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>☑</button>
                )}
              </div>
            )}
          </div>

          {/* Botón volver / cancelar — ancho completo */}
          {selectMode ? (
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={toggleSelectMode} className="touch-active" style={{ flex: 1, padding: '10px 14px', borderRadius: 12, cursor: 'pointer', background: 'rgba(255,68,68,0.08)', border: '1px solid rgba(255,68,68,0.2)', fontSize: 13, fontWeight: 600, color: '#FF7070', textAlign: 'center' }}>✕ Cancelar selección</button>
              <button onClick={allSelected ? clearAll : selectAll} className="touch-active" style={{ padding: '10px 14px', borderRadius: 12, cursor: 'pointer', background: 'rgba(212,175,55,0.08)', border: '1px solid rgba(212,175,55,0.2)', fontSize: 13, fontWeight: 600, color: '#D4AF37' }}>
                {allSelected ? '☐' : '☑'}
              </button>
            </div>
          ) : (
            <button onClick={() => router.push('/gestion')} className="touch-active" style={{ width: '100%', padding: '10px 14px', borderRadius: 12, cursor: 'pointer', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', fontSize: 13, fontWeight: 600, color: 'var(--muted)', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 15 }}>←</span> Volver a Gestión
            </button>
          )}
        </div>

        {/* ── Progress bar ── */}
        {tasks.length > 0 && viewMode === 'lista' && (
          <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(128,128,128,0.08)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--muted)', letterSpacing: 1.2, textTransform: 'uppercase' }}>Progreso del área</span>
              <span style={{ fontSize: 9, fontWeight: 700, color: cfg.color }}>{pct}% ({completadas}/{tasks.length})</span>
            </div>
            <div style={{ height: 5, background: 'rgba(128,128,128,0.12)', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${pct}%`, background: cfg.color, borderRadius: 4, transition: 'width 0.6s ease' }} />
            </div>
          </div>
        )}

        {/* ── Filtros de estado — lista vertical nav-style ── */}
        {viewMode === 'lista' && (
          <div style={{ padding: '14px 12px', borderBottom: '1px solid rgba(128,128,128,0.08)' }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--muted)', letterSpacing: 1.5, textTransform: 'uppercase', padding: '0 8px 8px' }}>Estado</div>
            {visibleTabs.map(f => {
              const active = f === filter
              return (
                <button key={f} onClick={() => { setFilter(f); setSelectedIds(new Set()) }} className="touch-active" style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  width: '100%', padding: '11px 12px', borderRadius: 10,
                  border: 'none', background: active ? `${cfg.color}15` : 'transparent',
                  cursor: 'pointer', marginBottom: 2,
                }}>
                  <span style={{ fontSize: 13, fontWeight: active ? 700 : 500, color: active ? cfg.color : 'var(--muted)' }}>{f}</span>
                  {counts[f] > 0 && (
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: active ? `${cfg.color}25` : 'rgba(128,128,128,0.12)', color: active ? cfg.color : 'var(--muted)', fontWeight: 700, minWidth: 22, textAlign: 'center' }}>{counts[f]}</span>
                  )}
                </button>
              )
            })}
          </div>
        )}

        {/* ── Filtro por responsable — lista nav-style ── */}
        {areaUsers.length > 1 && viewMode === 'lista' && (
          <div style={{ padding: '14px 12px', borderBottom: '1px solid rgba(128,128,128,0.08)' }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--muted)', letterSpacing: 1.5, textTransform: 'uppercase', padding: '0 8px 8px' }}>Responsable</div>
            <button onClick={() => setFilterUserId(null)} className="touch-active" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '11px 12px', borderRadius: 10, border: 'none', background: filterUserId === null ? `${cfg.color}15` : 'transparent', cursor: 'pointer', marginBottom: 2 }}>
              <span style={{ fontSize: 13, fontWeight: filterUserId === null ? 700 : 500, color: filterUserId === null ? cfg.color : 'var(--muted)' }}>Todos</span>
              <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: filterUserId === null ? `${cfg.color}25` : 'rgba(128,128,128,0.12)', color: filterUserId === null ? cfg.color : 'var(--muted)', fontWeight: 700 }}>{tasks.filter(t => filter === 'Todas' || t.estado === filter).length}</span>
            </button>
            {areaUsers.map(u => {
              const isActive = filterUserId === u.id
              const myCount = tasks.filter(t => t.responsable_id === u.id && (filter === 'Todas' || t.estado === filter)).length
              return (
                <button key={u.id} onClick={() => setFilterUserId(isActive ? null : u.id)} className="touch-active" style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '9px 12px', borderRadius: 10, border: 'none', background: isActive ? `${cfg.color}15` : 'transparent', cursor: 'pointer', marginBottom: 2 }}>
                  <Avatar iniciales={u.iniciales} userId={u.id} size={26} />
                  <span style={{ fontSize: 13, fontWeight: isActive ? 700 : 500, color: isActive ? cfg.color : 'var(--muted)', flex: 1, textAlign: 'left' }}>{u.nombre.split(' ')[0]}</span>
                  {myCount > 0 && <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: isActive ? `${cfg.color}25` : 'rgba(128,128,128,0.12)', color: isActive ? cfg.color : 'var(--muted)', fontWeight: 700 }}>{myCount}</span>}
                </button>
              )
            })}
          </div>
        )}

        {/* Nueva tarea */}
        {isAdmin && !selectMode && (
          <div style={{ padding: '12px 16px', marginTop: 'auto', borderTop: '1px solid rgba(128,128,128,0.08)' }}>
            <button onClick={() => setShowNew(true)} className="touch-active" style={{ width: '100%', padding: '13px', borderRadius: 12, cursor: 'pointer', background: `${cfg.color}18`, border: `1px solid ${cfg.color}40`, fontSize: 14, fontWeight: 700, color: cfg.color }}>
              + Nueva Tarea
            </button>
          </div>
        )}
      </div>
    )
  }

  // Contenido derecho compartido (lista de tareas o vista equipo)
  function RightContent() {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
        {/* ─── VISTA LISTA ─── */}
        {viewMode === 'lista' && (
          <>
            {/* Task list */}
            <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: isDesktop ? '12px 0 40px' : '8px 0 140px' } as React.CSSProperties}>
              {filtered.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 200, gap: 8 }}>
                  <span style={{ fontSize: 28 }}>✓</span>
                  <span style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: 1.5 }}>SIN TAREAS EN ESTE ESTADO</span>
                </div>
              ) : filtered.map(t => (
                <TaskRow key={t.id} task={t} onClick={() => { if (!selectMode) setSelectedTask(t) }} selectable={selectMode} selected={selectedIds.has(t.id)} onToggle={toggleId} showMeta />
              ))}
            </div>
          </>
        )}

        {/* ─── VISTA EQUIPO ─── */}
        {viewMode === 'equipo' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: isDesktop ? '16px 20px 40px' : '16px 16px 100px' }}>
          {teamStats.length === 0 ? (
            <div style={{ textAlign: 'center', paddingTop: 60, color: '#3A3530', fontSize: 13 }}>Sin tareas asignadas</div>
          ) : teamStats.map(({ user: u, total, comp, atr, enProceso, porApr, pct, color }) => (
            <div
              key={u.id}
              className="touch-active cursor-pointer"
              onClick={() => { setViewMode('lista'); setFilterUserId(u.id) }}
              style={{
                background: 'var(--surface)', border: '1px solid rgba(128,128,128,0.1)',
                borderRadius: 16, padding: '16px', marginBottom: 12,
                borderLeft: `3px solid ${color}`,
              }}
            >
              {/* Header persona */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                <Avatar iniciales={u.iniciales} userId={u.id} size={42} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--cream)' }}>{u.nombre}</div>
                  <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 1 }}>{u.rol}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 24, fontWeight: 900, color, lineHeight: 1 }}>{pct}%</div>
                  <div style={{ fontSize: 10, color: 'var(--muted)' }}>{comp}/{total}</div>
                </div>
              </div>

              {/* Barra de progreso */}
              <div style={{ height: 6, background: 'rgba(128,128,128,0.15)', borderRadius: 6, overflow: 'hidden', marginBottom: 12 }}>
                <div style={{ height: '100%', width: `${pct}%`, background: `linear-gradient(90deg, ${color}80, ${color})`, borderRadius: 6, transition: 'width 0.6s ease' }} />
              </div>

              {/* Stats por estado */}
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

              {/* Toque para filtrar */}
              <div style={{ marginTop: 10, fontSize: 9, color: 'var(--muted)', letterSpacing: 1 }}>
                TOCA PARA VER SUS TAREAS →
              </div>
            </div>
          ))}
        </div>
        )}

      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: isDesktop ? 'row' : 'column', height: '100vh', background: 'var(--bg)' }}>

      {/* Panel izquierdo */}
      <LeftPanel />

      {/* Contenido derecho */}
      <RightContent />

      {/* FAB — solo mobile */}
      {!selectMode && !isDesktop && (
        <div style={{ position: 'fixed', bottom: 28, right: 20, zIndex: 40 }}>
          <button onClick={() => setShowNew(true)} className="touch-active" style={{
            width: 56, height: 56, borderRadius: '50%', cursor: 'pointer',
            background: cfg.color, border: 'none', fontSize: 24, color: '#0A0A0A', fontWeight: 900,
            boxShadow: `0 4px 24px ${cfg.color}50`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>+</button>
        </div>
      )}

      {/* ── Barra de acciones masivas (admin) ── */}
      {selectMode && (
        <div className="safe-bottom" style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50,
          background: 'var(--surface)', borderTop: '1px solid var(--border)',
          padding: '12px 16px 16px',
        }}>
          {/* Picker de estado (overlay encima de la barra) */}
          {showStatusPicker && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 10, color: 'var(--muted)', letterSpacing: 1, marginBottom: 8 }}>CAMBIAR ESTADO A:</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {STATUS_LIST.map(s => {
                  const sc = STATUS_CFG[s]
                  return (
                    <button
                      key={s}
                      onClick={() => bulkChangeStatus(s)}
                      disabled={bulkLoading !== null}
                      className="touch-active"
                      style={{
                        padding: '8px 14px', borderRadius: 10, cursor: 'pointer',
                        background: sc.bg, border: `1px solid ${sc.color}40`,
                        fontSize: 12, fontWeight: 600, color: sc.color,
                      }}
                    >
                      {s}
                    </button>
                  )
                })}
              </div>
              <button onClick={() => setShowStatusPicker(false)} style={{ marginTop: 8, background: 'none', border: 'none', color: '#5A5450', fontSize: 11, cursor: 'pointer' }}>
                Cancelar
              </button>
            </div>
          )}

          {!bulkConfirmDelete && !showStatusPicker ? (
            <div style={{ display: 'flex', gap: 8 }}>
              {/* Aprobar */}
              <button
                onClick={bulkApprove}
                disabled={approvable.length === 0 || bulkLoading !== null}
                className="touch-active"
                style={{
                  flex: 1, padding: '13px 6px', borderRadius: 12, cursor: approvable.length > 0 ? 'pointer' : 'not-allowed',
                  background: approvable.length > 0 ? 'rgba(74,122,58,0.15)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${approvable.length > 0 ? 'rgba(74,122,58,0.4)' : 'rgba(255,255,255,0.06)'}`,
                  fontSize: 12, fontWeight: 700,
                  color: approvable.length > 0 ? '#4A9A3A' : '#3A3530',
                  opacity: bulkLoading !== null ? 0.5 : 1,
                }}
              >
                {bulkLoading === 'approve' ? '...' : `✓ Aprobar${approvable.length > 0 ? ` (${approvable.length})` : ''}`}
              </button>

              {/* Cambiar estado */}
              <button
                onClick={() => { if (nSelected > 0) setShowStatusPicker(true) }}
                disabled={nSelected === 0 || bulkLoading !== null}
                className="touch-active"
                style={{
                  flex: 1, padding: '13px 6px', borderRadius: 12, cursor: nSelected > 0 ? 'pointer' : 'not-allowed',
                  background: nSelected > 0 ? 'rgba(91,138,168,0.12)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${nSelected > 0 ? 'rgba(91,138,168,0.35)' : 'rgba(255,255,255,0.06)'}`,
                  fontSize: 12, fontWeight: 700,
                  color: nSelected > 0 ? '#7BA8C4' : '#3A3530',
                  opacity: bulkLoading !== null ? 0.5 : 1,
                }}
              >
                {bulkLoading === 'status' ? '...' : `↕ Estado${nSelected > 0 ? ` (${nSelected})` : ''}`}
              </button>

              {/* Eliminar */}
              <button
                onClick={() => { if (nSelected > 0) setBulkConfirmDelete(true) }}
                disabled={nSelected === 0 || bulkLoading !== null}
                className="touch-active"
                style={{
                  flex: 1, padding: '13px 6px', borderRadius: 12, cursor: nSelected > 0 ? 'pointer' : 'not-allowed',
                  background: nSelected > 0 ? 'rgba(255,68,68,0.1)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${nSelected > 0 ? 'rgba(255,68,68,0.3)' : 'rgba(255,255,255,0.06)'}`,
                  fontSize: 12, fontWeight: 700,
                  color: nSelected > 0 ? '#FF6B6B' : '#3A3530',
                  opacity: bulkLoading !== null ? 0.5 : 1,
                }}
              >
                🗑 Borrar{nSelected > 0 ? ` (${nSelected})` : ''}
              </button>
            </div>
          ) : bulkConfirmDelete ? (
            <div>
              <div style={{ fontSize: 13, color: '#FF6B6B', fontWeight: 700, textAlign: 'center', marginBottom: 10 }}>
                ¿Eliminar {nSelected} tarea{nSelected !== 1 ? 's' : ''}? No se puede deshacer.
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setBulkConfirmDelete(false)} className="touch-active" style={{
                  flex: 1, padding: '14px', borderRadius: 12, cursor: 'pointer',
                  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
                  fontSize: 13, color: '#6A6460',
                }}>Cancelar</button>
                <button onClick={bulkDelete} disabled={bulkLoading !== null} className="touch-active" style={{
                  flex: 1, padding: '14px', borderRadius: 12, cursor: 'pointer',
                  background: 'rgba(255,68,68,0.15)', border: '1px solid rgba(255,68,68,0.4)',
                  fontSize: 13, fontWeight: 700, color: '#FF6B6B',
                  opacity: bulkLoading !== null ? 0.5 : 1,
                }}>
                  {bulkLoading === 'delete' ? 'Eliminando...' : '🗑 Sí, eliminar'}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {showNew && <NewTaskModal defaultArea={area} availableAreas={[area]} users={users} onClose={() => setShowNew(false)} onCreated={handleCreated} />}
      {selectedTask && !selectMode && (
        <TaskDetailModal
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onUpdate={handleUpdate}
          onDelete={handleDelete}
          isAdmin={isAdmin}
          currentUserId={currentUserId}
        />
      )}
    </div>
  )
}
