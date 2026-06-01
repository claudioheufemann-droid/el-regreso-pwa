'use client'

import { useState, useRef } from 'react'
import { RcTask, AREA_CFG, STATUS_CFG } from '@/lib/gestion-types'
import Avatar from '@/components/ui/Avatar'
import { formatDate } from '@/lib/format'
import { createClient } from '@/lib/supabase/client'
import { compressImage } from '@/lib/compress-image'
import CommentsTab from './CommentsTab'

interface Props {
  task: RcTask
  onClose: () => void
  onUpdate: (updated: RcTask) => void
  onDelete?: (id: string) => void
  isAdmin?: boolean
  currentUserId?: string
}

type Tab = 'detalle' | 'comentarios' | 'evidencia' | 'admin'

const STATUS_FLOW = ['Asignada', 'En Proceso', 'Por Aprobar', 'Completada'] as const

function daysLabel(plazo: string): { text: string; color: string; urgent: boolean } {
  const diff = Math.ceil((new Date(plazo).getTime() - Date.now()) / 86400000)
  if (diff < 0)   return { text: `Hace ${Math.abs(diff)} días`, color: '#FF4444', urgent: true }
  if (diff === 0) return { text: 'Vence hoy',   color: '#E67E22', urgent: true }
  if (diff === 1) return { text: 'Mañana',       color: '#E67E22', urgent: true }
  if (diff <= 3)  return { text: `En ${diff} días`, color: '#D4AF37', urgent: false }
  return { text: `En ${diff} días`, color: '#4A7A3A', urgent: false }
}

export default function TaskDetailModal({ task: initialTask, onClose, onUpdate, onDelete, isAdmin, currentUserId }: Props) {
  const [task, setTask] = useState(initialTask)
  const [tab, setTab] = useState<Tab>('detalle')

  const [showReject, setShowReject]     = useState(false)
  const [rejectNote, setRejectNote]     = useState('')
  const [saving, setSaving]             = useState(false)

  const [editTitulo, setEditTitulo]     = useState(task.titulo)
  const [editDesc, setEditDesc]         = useState(task.descripcion ?? '')
  const [editNota, setEditNota]         = useState(task.nota_admin ?? '')
  const [savingAdmin, setSavingAdmin]   = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting]         = useState(false)

  const [lightboxUrl, setLightboxUrl]   = useState<string | null>(null)
  const [uploadingAntes, setUploadingAntes]     = useState(false)
  const [uploadingDespues, setUploadingDespues] = useState(false)
  const [uploadingRef, setUploadingRef]         = useState(false)
  const [resumen, setResumen]           = useState(task.resumen_cierre ?? '')
  const [savingResumen, setSavingResumen]       = useState(false)

  const antesRef    = useRef<HTMLInputElement>(null)
  const despuesRef  = useRef<HTMLInputElement>(null)
  const refPhotoRef = useRef<HTMLInputElement>(null)

  const cfg = AREA_CFG[task.area] ?? { color: '#D4AF37', dim: '#141007', code: '??' }
  const plazo = daysLabel(task.plazo)
  const stCfg = STATUS_CFG[task.estado as keyof typeof STATUS_CFG] ?? { color: '#888', label: task.estado }

  const isResponsable   = task.responsable_id === currentUserId || (task.responsable_ids ?? []).includes(currentUserId ?? '')
  const canChangeStatus = isResponsable || isAdmin
  const canApprove      = task.estado === 'Por Aprobar' && isAdmin
  const canSubmit       = task.estado === 'En Proceso' && isResponsable

  const flowIdx = STATUS_FLOW.indexOf(task.estado as typeof STATUS_FLOW[number])

  async function patch(updates: Partial<RcTask>) {
    setSaving(true)
    try {
      const res = await fetch('/api/tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: task.id, ...updates }),
      })
      if (!res.ok) throw new Error()
      const updated = await res.json()
      setTask(updated)
      onUpdate(updated)
    } catch { /* ignore */ }
    setSaving(false)
  }

  async function uploadPhoto(file: File, type: 'antes' | 'despues') {
    const setter = type === 'antes' ? setUploadingAntes : setUploadingDespues
    setter(true)
    try {
      const supabase = createClient()
      const compressed = await compressImage(file, { maxDim: 1200, quality: 0.78 })
      const path = `tasks/${task.id}/${type}-${Date.now()}.jpg`
      const { error } = await supabase.storage.from('task-evidence').upload(path, compressed, { upsert: true, contentType: 'image/jpeg' })
      if (error) throw error
      const { data: { publicUrl } } = supabase.storage.from('task-evidence').getPublicUrl(path)
      await patch(type === 'antes' ? { foto_antes_url: publicUrl } : { foto_despues_url: publicUrl })
    } catch (e) { console.error('Upload error:', e) }
    setter(false)
  }

  async function uploadRefPhoto(file: File) {
    setUploadingRef(true)
    try {
      const supabase = createClient()
      const compressed = await compressImage(file, { maxDim: 1200, quality: 0.78 })
      const path = `tasks/${task.id}/ref-${Date.now()}.jpg`
      const { error } = await supabase.storage.from('task-evidence').upload(path, compressed, { upsert: true, contentType: 'image/jpeg' })
      if (error) throw error
      const { data: { publicUrl } } = supabase.storage.from('task-evidence').getPublicUrl(path)
      await patch({ evidencia_url: publicUrl })
    } catch (e) { console.error('Ref photo upload error:', e) }
    setUploadingRef(false)
  }

  async function saveResumen() {
    setSavingResumen(true)
    await patch({ resumen_cierre: resumen })
    setSavingResumen(false)
  }

  async function saveAdmin() {
    setSavingAdmin(true)
    await patch({ titulo: editTitulo.trim(), descripcion: editDesc.trim(), nota_admin: editNota.trim() })
    setSavingAdmin(false)
  }

  async function deleteTask() {
    setDeleting(true)
    try {
      const res = await fetch('/api/tasks', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: task.id }),
      })
      if (!res.ok) throw new Error()
      onDelete?.(task.id)
    } catch { /* ignore */ }
    setDeleting(false)
  }

  function approve()           { patch({ estado: 'Completada' }).then(onClose) }
  function doReject()          { if (!rejectNote.trim()) return; patch({ estado: 'Rechazada', nota_rechazo: rejectNote.trim() }).then(onClose) }
  function submitForApproval() { patch({ estado: 'Por Aprobar' }) }
  function startTask()         { patch({ estado: 'En Proceso' }) }

  const tabs: { id: Tab; label: string; icon: string; show: boolean }[] = ([
    { id: 'detalle'      as Tab, label: 'Detalle', icon: '☰',  show: true },
    { id: 'comentarios'  as Tab, label: 'Chat',    icon: '💬', show: true },
    { id: 'evidencia'    as Tab, label: 'Fotos',   icon: '📷', show: true },
    { id: 'admin'        as Tab, label: 'Admin',   icon: '⚙',  show: !!isAdmin },
  ] as { id: Tab; label: string; icon: string; show: boolean }[]).filter(t => t.show)

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end"
      style={{ background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="sheet-up w-full safe-bottom"
        style={{
          background: '#0F0F12',
          borderRadius: '22px 22px 0 0',
          maxHeight: '94vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: `0 -4px 40px rgba(0,0,0,0.5), 0 0 0 1px ${cfg.color}20`,
        }}
      >
        {/* ── Colored header ── */}
        <div style={{
          background: `linear-gradient(160deg, ${cfg.color}18 0%, transparent 100%)`,
          borderTop: `3px solid ${cfg.color}`,
          borderRadius: '22px 22px 0 0',
          padding: '10px 20px 0',
          flexShrink: 0,
        }}>
          {/* Drag handle */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
            <div style={{ width: 40, height: 4, borderRadius: 2, background: `${cfg.color}40` }} />
          </div>

          {/* Top row: area + status + close */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <div style={{
              padding: '3px 10px', borderRadius: 20,
              background: `${cfg.color}18`, border: `1px solid ${cfg.color}35`,
              fontSize: 9, fontWeight: 800, color: cfg.color, letterSpacing: 1.2, textTransform: 'uppercase',
            }}>
              {cfg.code} · {task.area}
            </div>
            <div style={{
              padding: '3px 10px', borderRadius: 20,
              background: `${stCfg.color}15`, border: `1px solid ${stCfg.color}30`,
              fontSize: 9, fontWeight: 700, color: stCfg.color,
            }}>
              {task.estado}
            </div>
            {task.prioridad_maxima && (
              <div style={{
                padding: '3px 10px', borderRadius: 20,
                background: 'rgba(212,175,55,0.12)', border: '1px solid rgba(212,175,55,0.3)',
                fontSize: 9, fontWeight: 700, color: '#D4AF37',
              }}>
                ⚡ MÁXIMA
              </div>
            )}
            <button
              onClick={onClose}
              style={{
                marginLeft: 'auto', width: 32, height: 32, borderRadius: '50%',
                background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)',
                color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: 16,
                display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
                flexShrink: 0,
              }}
            >✕</button>
          </div>

          {/* Title */}
          <div style={{
            fontSize: 20, fontWeight: 900, color: '#F4EEDF',
            lineHeight: 1.25, letterSpacing: -0.3, marginBottom: 16,
          }}>
            {task.titulo}
          </div>

          {/* Status progress flow */}
          {flowIdx >= 0 && task.estado !== 'Rechazada' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 18 }}>
              {STATUS_FLOW.map((s, i) => {
                const done = i < flowIdx
                const active = i === flowIdx
                const future = i > flowIdx
                const sColor = done ? '#4A7A3A' : active ? cfg.color : 'rgba(128,128,128,0.2)'
                return (
                  <div key={s} style={{ display: 'flex', alignItems: 'center', flex: i < STATUS_FLOW.length - 1 ? 1 : 'none' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                      <div style={{
                        width: active ? 22 : 16, height: active ? 22 : 16,
                        borderRadius: '50%',
                        background: done ? '#4A7A3A' : active ? cfg.color : 'rgba(128,128,128,0.1)',
                        border: `2px solid ${sColor}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: done ? 9 : 7, color: done ? '#fff' : active ? '#fff' : 'rgba(128,128,128,0.3)',
                        fontWeight: 900, transition: 'all 0.2s', flexShrink: 0,
                      }}>
                        {done ? '✓' : i + 1}
                      </div>
                      <div style={{
                        fontSize: 8, fontWeight: active ? 700 : 500,
                        color: done ? '#4A7A3A' : active ? cfg.color : 'rgba(128,128,128,0.35)',
                        letterSpacing: 0.3, whiteSpace: 'nowrap',
                      }}>
                        {s === 'Por Aprobar' ? 'Revisión' : s}
                      </div>
                    </div>
                    {i < STATUS_FLOW.length - 1 && (
                      <div style={{
                        flex: 1, height: 2, margin: '0 4px', marginBottom: 14,
                        background: done ? '#4A7A3A' : `${cfg.color}20`,
                        borderRadius: 2,
                      }} />
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 2, marginBottom: 0 }}>
            {tabs.map(t => {
              const isActive = tab === t.id
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  style={{
                    flex: 1, padding: '9px 6px 11px',
                    background: isActive ? `${cfg.color}12` : 'transparent',
                    border: 'none', borderBottom: `2px solid ${isActive ? cfg.color : 'transparent'}`,
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                    transition: 'all 0.15s',
                  }}
                >
                  <span style={{ fontSize: 13 }}>{t.icon}</span>
                  <span style={{ fontSize: 11, fontWeight: isActive ? 700 : 500, color: isActive ? cfg.color : 'rgba(128,128,128,0.6)' }}>
                    {t.label}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* ── Scrollable body ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 20px 32px' }}>

          {/* ═══ TAB DETALLE ═══ */}
          {tab === 'detalle' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

              {/* Responsable + Plazo — 2 columnas */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>

                {/* Responsable */}
                <div style={{
                  background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
                  borderRadius: 16, padding: '14px 14px',
                }}>
                  <div style={{ fontSize: 9, color: 'rgba(128,128,128,0.5)', letterSpacing: 1.4, textTransform: 'uppercase', marginBottom: 10, fontWeight: 700 }}>
                    {(task.responsables?.length ?? 0) > 1 ? 'Responsables' : 'Responsable'}
                  </div>
                  {task.responsable ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                        <Avatar iniciales={task.responsable.iniciales} userId={task.responsable_id} size={32} avatarUrl={task.responsable.avatar_url} />
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: '#F4EEDF', lineHeight: 1.2 }}>{task.responsable.nombre}</div>
                          <div style={{ fontSize: 9, color: 'rgba(128,128,128,0.5)', marginTop: 2 }}>{task.responsable.rol}</div>
                        </div>
                      </div>
                      {(task.responsables ?? []).filter(r => r.id !== task.responsable_id).map(r => (
                        <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Avatar iniciales={r.iniciales} userId={r.id} size={24} avatarUrl={r.avatar_url} />
                          <div style={{ fontSize: 11, color: 'rgba(244,238,223,0.7)' }}>{r.nombre}</div>
                        </div>
                      ))}
                    </div>
                  ) : <div style={{ fontSize: 12, color: 'rgba(128,128,128,0.4)' }}>Sin asignar</div>}
                </div>

                {/* Plazo */}
                <div style={{
                  background: `${plazo.color}08`,
                  border: `1px solid ${plazo.color}25`,
                  borderRadius: 16, padding: '14px 14px',
                  display: 'flex', flexDirection: 'column', gap: 4,
                }}>
                  <div style={{ fontSize: 9, color: 'rgba(128,128,128,0.5)', letterSpacing: 1.4, textTransform: 'uppercase', fontWeight: 700, marginBottom: 6 }}>Plazo</div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: plazo.color, lineHeight: 1, letterSpacing: -0.5 }}>
                    {plazo.text}
                  </div>
                  <div style={{ fontSize: 10, color: 'rgba(128,128,128,0.5)', marginTop: 2 }}>{formatDate(task.plazo)}</div>
                  {plazo.urgent && (
                    <div style={{ marginTop: 6, padding: '3px 8px', borderRadius: 8, background: `${plazo.color}15`, border: `1px solid ${plazo.color}30`, display: 'inline-flex', alignItems: 'center', gap: 4, width: 'fit-content' }}>
                      <div style={{ width: 5, height: 5, borderRadius: '50%', background: plazo.color }} />
                      <span style={{ fontSize: 9, fontWeight: 700, color: plazo.color }}>Urgente</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Descripción */}
              {task.descripcion && (
                <div style={{
                  background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: 16, padding: '14px 16px',
                }}>
                  <div style={{ fontSize: 9, color: 'rgba(128,128,128,0.5)', letterSpacing: 1.4, textTransform: 'uppercase', fontWeight: 700, marginBottom: 10 }}>Descripción</div>
                  <p style={{ fontSize: 14, color: 'rgba(244,238,223,0.85)', lineHeight: 1.65, margin: 0 }}>{task.descripcion}</p>
                </div>
              )}

              {/* Foto de referencia */}
              {task.evidencia_url && (
                <div style={{ background: `${cfg.color}08`, border: `1px solid ${cfg.color}20`, borderRadius: 16, padding: '12px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                    <span style={{ fontSize: 9, fontWeight: 800, color: cfg.color, letterSpacing: 1.4, textTransform: 'uppercase' }}>Referencia visual</span>
                    <span style={{ fontSize: 9, color: 'rgba(128,128,128,0.4)', marginLeft: 'auto' }}>toca para ampliar</span>
                  </div>
                  <div
                    onClick={() => setLightboxUrl(task.evidencia_url!)}
                    className="touch-active"
                    style={{ cursor: 'zoom-in', borderRadius: 12, overflow: 'hidden', position: 'relative' }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={task.evidencia_url} alt="Referencia" style={{ width: '100%', height: 130, objectFit: 'cover', display: 'block' }} />
                    <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.4), transparent)', display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end', padding: 8 }}>
                      <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>⤢</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Nota admin */}
              {task.nota_admin && (
                <div style={{ background: 'rgba(212,175,55,0.05)', border: '1px solid rgba(212,175,55,0.18)', borderRadius: 16, padding: '14px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                    <span style={{ fontSize: 12 }}>★</span>
                    <span style={{ fontSize: 9, fontWeight: 800, color: '#D4AF37', letterSpacing: 1.2, textTransform: 'uppercase' }}>Nota del Administrador</span>
                  </div>
                  <p style={{ fontSize: 13, color: 'rgba(244,238,223,0.8)', lineHeight: 1.6, margin: 0 }}>{task.nota_admin}</p>
                </div>
              )}

              {/* Reincidencias */}
              {task.contador_retrasos >= 3 && (
                <div style={{ padding: '12px 14px', background: 'rgba(200,84,42,0.08)', border: '1px solid rgba(200,84,42,0.2)', borderRadius: 14, fontSize: 12, color: '#C8542A', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>⚠</span>
                  <span>Protocolo de reincidencia activo — {task.contador_retrasos} retrasos registrados</span>
                </div>
              )}

              {/* Nota rechazo */}
              {task.nota_rechazo && (
                <div style={{ padding: '14px 16px', background: 'rgba(168,52,31,0.07)', border: '1px solid rgba(168,52,31,0.2)', borderRadius: 14 }}>
                  <div style={{ fontSize: 9, fontWeight: 800, color: '#A8341F', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 8 }}>Motivo de rechazo</div>
                  <p style={{ fontSize: 13, color: 'rgba(244,238,223,0.8)', lineHeight: 1.6, margin: 0 }}>{task.nota_rechazo}</p>
                </div>
              )}

              {/* Resumen de cierre */}
              {task.resumen_cierre && (
                <div style={{ padding: '14px 16px', background: 'rgba(74,122,58,0.06)', border: '1px solid rgba(74,122,58,0.2)', borderRadius: 14 }}>
                  <div style={{ fontSize: 9, fontWeight: 800, color: '#4A7A3A', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 8 }}>Resumen de cierre</div>
                  <p style={{ fontSize: 13, color: 'rgba(244,238,223,0.8)', lineHeight: 1.6, margin: 0 }}>{task.resumen_cierre}</p>
                </div>
              )}

              {/* Reject form */}
              {showReject && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <textarea
                    value={rejectNote}
                    onChange={e => setRejectNote(e.target.value)}
                    placeholder="Motivo del rechazo..."
                    rows={3}
                    style={{ borderRadius: 12, background: 'rgba(168,52,31,0.06)', border: '1px solid rgba(168,52,31,0.25)', color: '#F4EEDF', padding: '12px 14px', fontSize: 13, resize: 'none' }}
                  />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => setShowReject(false)}
                      style={{ flex: 1, padding: '12px', borderRadius: 12, cursor: 'pointer', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', fontSize: 12, color: 'rgba(128,128,128,0.6)' }}
                    >Cancelar</button>
                    <button
                      onClick={doReject}
                      disabled={!rejectNote.trim() || saving}
                      style={{ flex: 2, padding: '12px', borderRadius: 12, cursor: 'pointer', background: 'rgba(168,52,31,0.12)', border: '1px solid rgba(168,52,31,0.35)', fontSize: 12, fontWeight: 700, color: '#A8341F', opacity: rejectNote.trim() && !saving ? 1 : 0.4 }}
                    >Confirmar Rechazo</button>
                  </div>
                </div>
              )}

              {/* ── Botones de acción ── */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>

                {/* Iniciar tarea */}
                {task.estado === 'Asignada' && canChangeStatus && (
                  <button
                    onClick={startTask}
                    disabled={saving}
                    className="touch-active"
                    style={{
                      width: '100%', padding: '16px', borderRadius: 14, cursor: 'pointer',
                      background: `linear-gradient(135deg, ${cfg.color}22, ${cfg.color}10)`,
                      border: `1px solid ${cfg.color}40`,
                      fontSize: 14, fontWeight: 800, color: cfg.color,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                      letterSpacing: 0.3,
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                    {saving ? 'Iniciando...' : 'Iniciar Tarea'}
                  </button>
                )}

                {/* Enviar a revisión */}
                {canSubmit && (
                  <button
                    onClick={submitForApproval}
                    disabled={saving}
                    className="touch-active"
                    style={{
                      width: '100%', padding: '16px', borderRadius: 14, cursor: 'pointer',
                      background: 'linear-gradient(135deg, rgba(212,175,55,0.18), rgba(212,175,55,0.08))',
                      border: '1px solid rgba(212,175,55,0.4)',
                      fontSize: 14, fontWeight: 800, color: '#D4AF37',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="m5 12 7-7 7 7"/><path d="M12 19V5"/></svg>
                    {saving ? 'Enviando...' : 'Enviar a Revisión'}
                  </button>
                )}

                {/* Aprobar / Rechazar */}
                {canApprove && !showReject && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <button
                      onClick={approve}
                      disabled={saving}
                      className="touch-active"
                      style={{
                        padding: '16px', borderRadius: 14, cursor: 'pointer',
                        background: 'linear-gradient(135deg, rgba(34,197,94,0.18), rgba(34,197,94,0.08))',
                        border: '1px solid rgba(34,197,94,0.35)',
                        fontSize: 14, fontWeight: 800, color: '#22C55E',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                      }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                      Aprobar
                    </button>
                    <button
                      onClick={() => setShowReject(true)}
                      className="touch-active"
                      style={{
                        padding: '16px', borderRadius: 14, cursor: 'pointer',
                        background: 'rgba(168,52,31,0.08)', border: '1px solid rgba(168,52,31,0.28)',
                        fontSize: 14, fontWeight: 800, color: '#A8341F',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                      }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      Rechazar
                    </button>
                  </div>
                )}

                {/* Toggle prioridad */}
                <button
                  onClick={() => patch({ prioridad_maxima: !task.prioridad_maxima })}
                  disabled={saving}
                  className="touch-active"
                  style={{
                    width: '100%', padding: '13px', borderRadius: 14, cursor: 'pointer',
                    background: task.prioridad_maxima ? 'rgba(212,175,55,0.1)' : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${task.prioridad_maxima ? 'rgba(212,175,55,0.3)' : 'rgba(255,255,255,0.08)'}`,
                    fontSize: 12, fontWeight: 700,
                    color: task.prioridad_maxima ? '#D4AF37' : 'rgba(128,128,128,0.5)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                  }}
                >
                  <span style={{ fontSize: 14 }}>⚡</span>
                  {task.prioridad_maxima ? 'Quitar Prioridad Máxima' : 'Marcar como Prioridad Máxima'}
                </button>
              </div>
            </div>
          )}

          {/* ═══ TAB COMENTARIOS ═══ */}
          {tab === 'comentarios' && (
            <CommentsTab taskId={task.id} currentUserId={currentUserId ?? ''} accentColor={cfg.color} />
          )}

          {/* ═══ TAB EVIDENCIA ═══ */}
          {tab === 'evidencia' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <p style={{ fontSize: 12, color: 'rgba(128,128,128,0.5)', lineHeight: 1.6, margin: 0 }}>
                Sube fotos del antes y después para documentar la tarea. Toca cada sección para tomar foto directo desde tu celular.
              </p>

              {/* ANTES */}
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#5B8AA8', letterSpacing: 1.6, textTransform: 'uppercase', marginBottom: 8 }}>Antes</div>
                <input ref={antesRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) uploadPhoto(f, 'antes') }} />
                {task.foto_antes_url ? (
                  <div style={{ position: 'relative', borderRadius: 14, overflow: 'hidden' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={task.foto_antes_url} alt="Antes" style={{ width: '100%', display: 'block', maxHeight: 200, objectFit: 'cover' }} />
                    <button onClick={() => antesRef.current?.click()} disabled={uploadingAntes}
                      style={{ position: 'absolute', bottom: 10, right: 10, padding: '6px 14px', borderRadius: 8, background: 'rgba(0,0,0,0.75)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}>
                      Cambiar
                    </button>
                  </div>
                ) : (
                  <button onClick={() => antesRef.current?.click()} disabled={uploadingAntes} className="touch-active"
                    style={{ width: '100%', padding: '32px 20px', borderRadius: 14, border: '2px dashed rgba(91,138,168,0.25)', background: 'rgba(91,138,168,0.04)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 32 }}>{uploadingAntes ? '⏳' : '📷'}</span>
                    <span style={{ fontSize: 13, color: '#5B8AA8', fontWeight: 700 }}>{uploadingAntes ? 'Subiendo...' : 'Foto antes de comenzar'}</span>
                    <span style={{ fontSize: 10, color: 'rgba(128,128,128,0.4)' }}>Estado previo a la tarea</span>
                  </button>
                )}
              </div>

              {/* DESPUÉS */}
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#22C55E', letterSpacing: 1.6, textTransform: 'uppercase', marginBottom: 8 }}>Después</div>
                <input ref={despuesRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) uploadPhoto(f, 'despues') }} />
                {task.foto_despues_url ? (
                  <div style={{ position: 'relative', borderRadius: 14, overflow: 'hidden' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={task.foto_despues_url} alt="Después" style={{ width: '100%', display: 'block', maxHeight: 200, objectFit: 'cover' }} />
                    <button onClick={() => despuesRef.current?.click()} disabled={uploadingDespues}
                      style={{ position: 'absolute', bottom: 10, right: 10, padding: '6px 14px', borderRadius: 8, background: 'rgba(0,0,0,0.75)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}>
                      Cambiar
                    </button>
                  </div>
                ) : (
                  <button onClick={() => despuesRef.current?.click()} disabled={uploadingDespues} className="touch-active"
                    style={{ width: '100%', padding: '32px 20px', borderRadius: 14, border: '2px dashed rgba(34,197,94,0.25)', background: 'rgba(34,197,94,0.04)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 32 }}>{uploadingDespues ? '⏳' : '📷'}</span>
                    <span style={{ fontSize: 13, color: '#22C55E', fontWeight: 700 }}>{uploadingDespues ? 'Subiendo...' : 'Foto del resultado final'}</span>
                    <span style={{ fontSize: 10, color: 'rgba(128,128,128,0.4)' }}>Estado al terminar</span>
                  </button>
                )}
              </div>

              {/* Comparación */}
              {task.foto_antes_url && task.foto_despues_url && (
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#D4AF37', letterSpacing: 1.6, textTransform: 'uppercase', marginBottom: 10 }}>Antes / Después</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {[{ url: task.foto_antes_url, label: 'ANTES', color: '#5B8AA8' }, { url: task.foto_despues_url, label: 'DESPUÉS', color: '#22C55E' }].map(({ url, label, color }) => (
                      <div key={label} style={{ borderRadius: 12, overflow: 'hidden', border: `1px solid ${color}25` }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt={label} style={{ width: '100%', display: 'block', height: 130, objectFit: 'cover' }} onClick={() => setLightboxUrl(url)} />
                        <div style={{ background: '#0F0F12', padding: '6px 10px', fontSize: 9, color, letterSpacing: 1, fontWeight: 700 }}>{label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Resumen de cierre */}
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(244,238,223,0.6)', letterSpacing: 1.6, textTransform: 'uppercase', marginBottom: 8 }}>Resumen de Cierre</div>
                <textarea
                  value={resumen}
                  onChange={e => setResumen(e.target.value)}
                  placeholder="¿Qué se hizo? ¿Qué resultados se obtuvieron?..."
                  rows={4}
                  style={{ borderRadius: 12, marginBottom: 8, width: '100%', boxSizing: 'border-box', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', color: '#F4EEDF', padding: '12px 14px', fontSize: 13, resize: 'none' }}
                />
                <button
                  onClick={saveResumen}
                  disabled={savingResumen || resumen === (task.resumen_cierre ?? '')}
                  className="touch-active"
                  style={{ width: '100%', padding: '13px', borderRadius: 12, cursor: 'pointer', background: 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.3)', fontSize: 13, fontWeight: 700, color: '#D4AF37', opacity: savingResumen ? 0.5 : 1 }}
                >
                  {savingResumen ? 'Guardando...' : 'Guardar Resumen'}
                </button>
              </div>

              {canSubmit && (
                <button onClick={submitForApproval} disabled={saving} className="touch-active"
                  style={{ width: '100%', padding: '14px', borderRadius: 14, cursor: 'pointer', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.28)', fontSize: 14, fontWeight: 800, color: '#22C55E' }}>
                  ↑ Enviar a Revisión con Evidencia
                </button>
              )}
            </div>
          )}

          {/* ═══ TAB ADMIN ═══ */}
          {tab === 'admin' && isAdmin && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ padding: '10px 14px', background: 'rgba(212,175,55,0.06)', border: '1px solid rgba(212,175,55,0.15)', borderRadius: 12, fontSize: 11, color: '#D4AF37', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>★</span> Panel exclusivo del Administrador
              </div>

              <div>
                <label style={{ fontSize: 9, fontWeight: 700, color: 'rgba(128,128,128,0.5)', letterSpacing: 1.4, textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Título</label>
                <input value={editTitulo} onChange={e => setEditTitulo(e.target.value)}
                  style={{ borderRadius: 12, width: '100%', boxSizing: 'border-box', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#F4EEDF', padding: '11px 14px', fontSize: 13 }} />
              </div>

              <div>
                <label style={{ fontSize: 9, fontWeight: 700, color: 'rgba(128,128,128,0.5)', letterSpacing: 1.4, textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Descripción</label>
                <textarea value={editDesc} onChange={e => setEditDesc(e.target.value)} rows={3}
                  style={{ borderRadius: 12, width: '100%', boxSizing: 'border-box', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#F4EEDF', padding: '11px 14px', fontSize: 13, resize: 'none' }} />
              </div>

              {/* Foto de referencia */}
              <div>
                <label style={{ fontSize: 9, fontWeight: 700, color: '#D4AF37', letterSpacing: 1.4, textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Foto de Referencia</label>
                <input ref={refPhotoRef} type="file" accept="image/*" style={{ display: 'none' }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) uploadRefPhoto(f) }} />
                {task.evidencia_url ? (
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', background: 'rgba(212,175,55,0.06)', border: '1px solid rgba(212,175,55,0.18)', borderRadius: 12, padding: 10 }}>
                    <div onClick={() => setLightboxUrl(task.evidencia_url!)} className="touch-active"
                      style={{ width: 72, height: 72, borderRadius: 10, overflow: 'hidden', flexShrink: 0, cursor: 'zoom-in', position: 'relative' }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={task.evidencia_url} alt="Referencia" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>⤢</div>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#F4EEDF', marginBottom: 8 }}>Foto cargada</div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => refPhotoRef.current?.click()} disabled={uploadingRef}
                          style={{ flex: 1, padding: '6px 0', borderRadius: 8, background: 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.3)', color: '#D4AF37', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>
                          {uploadingRef ? '⏳' : '↑ Cambiar'}
                        </button>
                        <button onClick={() => patch({ evidencia_url: null as unknown as string })} disabled={uploadingRef}
                          style={{ flex: 1, padding: '6px 0', borderRadius: 8, background: 'rgba(255,68,68,0.07)', border: '1px solid rgba(255,68,68,0.2)', color: '#FF6666', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>
                          × Quitar
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => refPhotoRef.current?.click()} disabled={uploadingRef} className="touch-active"
                    style={{ width: '100%', padding: '22px 20px', borderRadius: 12, border: '2px dashed rgba(212,175,55,0.25)', background: 'rgba(212,175,55,0.04)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7 }}>
                    <span style={{ fontSize: 28 }}>{uploadingRef ? '⏳' : '🖼️'}</span>
                    <span style={{ fontSize: 12, color: '#D4AF37', fontWeight: 700 }}>{uploadingRef ? 'Subiendo...' : 'Agregar foto de referencia'}</span>
                    <span style={{ fontSize: 10, color: 'rgba(128,128,128,0.4)' }}>Los responsables la verán en el detalle</span>
                  </button>
                )}
              </div>

              <div>
                <label style={{ fontSize: 9, fontWeight: 700, color: '#D4AF37', letterSpacing: 1.4, textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Nota / Recomendaciones</label>
                <textarea value={editNota} onChange={e => setEditNota(e.target.value)} rows={4}
                  placeholder="Instrucciones, recomendaciones o comentarios para el responsable..."
                  style={{ borderRadius: 12, width: '100%', boxSizing: 'border-box', background: 'rgba(212,175,55,0.04)', border: '1px solid rgba(212,175,55,0.2)', color: '#F4EEDF', padding: '11px 14px', fontSize: 13, resize: 'none' }} />
              </div>

              <div>
                <label style={{ fontSize: 9, fontWeight: 700, color: 'rgba(128,128,128,0.5)', letterSpacing: 1.4, textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Estado</label>
                <select value={task.estado} onChange={e => patch({ estado: e.target.value as RcTask['estado'] })}
                  style={{ borderRadius: 12, width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#F4EEDF', padding: '11px 14px', fontSize: 13 }}>
                  {['Asignada','En Proceso','Por Aprobar','Completada','Rechazada','Atrasada'].map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              <button onClick={saveAdmin} disabled={savingAdmin} className="touch-active"
                style={{ width: '100%', padding: '14px', borderRadius: 14, cursor: 'pointer', background: 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.3)', fontSize: 13, fontWeight: 800, color: '#D4AF37', opacity: savingAdmin ? 0.5 : 1 }}>
                {savingAdmin ? 'Guardando...' : '★ Guardar Cambios'}
              </button>

              {task.estado === 'Por Aprobar' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <button onClick={approve} disabled={saving} className="touch-active"
                    style={{ padding: '13px', borderRadius: 12, cursor: 'pointer', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', fontSize: 12, fontWeight: 700, color: '#22C55E' }}>
                    ✓ Aprobar
                  </button>
                  <button onClick={() => { setShowReject(true); setTab('detalle') }} className="touch-active"
                    style={{ padding: '13px', borderRadius: 12, cursor: 'pointer', background: 'rgba(168,52,31,0.08)', border: '1px solid rgba(168,52,31,0.25)', fontSize: 12, fontWeight: 700, color: '#A8341F' }}>
                    ✕ Rechazar
                  </button>
                </div>
              )}

              <div style={{ borderTop: '1px solid rgba(255,68,68,0.1)', paddingTop: 14 }}>
                {!showDeleteConfirm ? (
                  <button onClick={() => setShowDeleteConfirm(true)}
                    style={{ width: '100%', padding: '13px', borderRadius: 12, cursor: 'pointer', background: 'rgba(255,68,68,0.05)', border: '1px solid rgba(255,68,68,0.18)', fontSize: 12, fontWeight: 600, color: '#FF6666' }}>
                    🗑 Eliminar Tarea
                  </button>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ fontSize: 12, color: '#FF6666', textAlign: 'center', fontWeight: 600 }}>¿Eliminar esta tarea? No se puede deshacer.</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <button onClick={() => setShowDeleteConfirm(false)}
                        style={{ padding: '12px', borderRadius: 12, cursor: 'pointer', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', fontSize: 12, color: 'rgba(128,128,128,0.5)' }}>
                        Cancelar
                      </button>
                      <button onClick={deleteTask} disabled={deleting}
                        style={{ padding: '12px', borderRadius: 12, cursor: 'pointer', background: 'rgba(255,68,68,0.12)', border: '1px solid rgba(255,68,68,0.35)', fontSize: 12, fontWeight: 700, color: '#FF4444' }}>
                        {deleting ? 'Eliminando...' : 'Eliminar'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Lightbox */}
      {lightboxUrl && (
        <div
          onClick={() => setLightboxUrl(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.95)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
        >
          <button onClick={() => setLightboxUrl(null)}
            style={{ position: 'absolute', top: 16, right: 16, width: 40, height: 40, borderRadius: '50%', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', fontSize: 20, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1 }}>
            ×
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightboxUrl} alt="Ampliado" onClick={e => e.stopPropagation()}
            style={{ maxWidth: '100%', maxHeight: '90vh', objectFit: 'contain', borderRadius: 14, boxShadow: '0 8px 60px rgba(0,0,0,0.7)' }} />
        </div>
      )}
    </div>
  )
}
