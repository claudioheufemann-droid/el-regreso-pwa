'use client'

import { useState, useRef } from 'react'
import { RcTask, AREA_CFG } from '@/lib/gestion-types'
import StatusBadge from '@/components/ui/StatusBadge'
import Avatar from '@/components/ui/Avatar'
import { formatPlazo, formatDate } from '@/lib/format'
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

export default function TaskDetailModal({ task: initialTask, onClose, onUpdate, onDelete, isAdmin, currentUserId }: Props) {
  const [task, setTask] = useState(initialTask)
  const [tab, setTab] = useState<Tab>('detalle')

  // Detalle actions
  const [showReject, setShowReject] = useState(false)
  const [rejectNote, setRejectNote] = useState('')
  const [saving, setSaving] = useState(false)

  // Admin panel
  const [editTitulo, setEditTitulo] = useState(task.titulo)
  const [editDesc, setEditDesc] = useState(task.descripcion ?? '')
  const [editNota, setEditNota] = useState(task.nota_admin ?? '')
  const [savingAdmin, setSavingAdmin] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Lightbox
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)

  // Evidence
  const [uploadingAntes, setUploadingAntes] = useState(false)
  const [uploadingDespues, setUploadingDespues] = useState(false)
  const [uploadingRef, setUploadingRef] = useState(false)
  const [resumen, setResumen] = useState(task.resumen_cierre ?? '')
  const [savingResumen, setSavingResumen] = useState(false)
  const antesRef = useRef<HTMLInputElement>(null)
  const despuesRef = useRef<HTMLInputElement>(null)
  const refPhotoRef = useRef<HTMLInputElement>(null)

  const cfg = AREA_CFG[task.area] ?? { color: '#D4AF37', dim: '#141007', code: '??' }
  const plazo = formatPlazo(task.plazo)

  // Who can do what — soporta múltiples responsables
  const isResponsable = task.responsable_id === currentUserId ||
    (task.responsable_ids ?? []).includes(currentUserId ?? '')
  const canChangeStatus = isResponsable || isAdmin
  const canApprove = task.estado === 'Por Aprobar' && isAdmin
  const canSubmit = task.estado === 'En Proceso' && isResponsable

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
      // Comprimir antes de subir (reduce tamaño 5-10x)
      const compressed = await compressImage(file, { maxDim: 1200, quality: 0.78 })
      const path = `tasks/${task.id}/${type}-${Date.now()}.jpg`
      const { error } = await supabase.storage.from('task-evidence').upload(path, compressed, { upsert: true, contentType: 'image/jpeg' })
      if (error) throw error
      const { data: { publicUrl } } = supabase.storage.from('task-evidence').getPublicUrl(path)
      const updates = type === 'antes' ? { foto_antes_url: publicUrl } : { foto_despues_url: publicUrl }
      await patch(updates)
    } catch (e) {
      console.error('Upload error:', e)
    }
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

  function approve() { patch({ estado: 'Completada' }).then(onClose) }
  function doReject() {
    if (!rejectNote.trim()) return
    patch({ estado: 'Rechazada', nota_rechazo: rejectNote.trim() }).then(onClose)
  }
  function submitForApproval() { patch({ estado: 'Por Aprobar' }) }
  function startTask() { patch({ estado: 'En Proceso' }) }

  const tabs: { id: Tab; label: string; show: boolean }[] = (
    [
      { id: 'detalle' as Tab, label: 'Detalle', show: true },
      { id: 'comentarios' as Tab, label: '💬 Chat', show: true },
      { id: 'evidencia' as Tab, label: '📸 Fotos', show: true },
      { id: 'admin' as Tab, label: '★ Admin', show: !!isAdmin },
    ] as { id: Tab; label: string; show: boolean }[]
  ).filter(t => t.show)

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end"
      style={{ background: 'rgba(0,0,0,0.75)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="sheet-up w-full safe-bottom"
        style={{
          background: 'var(--surface)',
          borderTop: `2px solid ${cfg.color}40`,
          borderRadius: '18px 18px 0 0',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Handle bar */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(128,128,128,0.2)' }} />
        </div>

        {/* Header */}
        <div style={{ padding: '12px 20px 0', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6, alignItems: 'center' }}>
                <div style={{ fontSize: 9, color: cfg.color, letterSpacing: 1.4, fontWeight: 700 }}>{task.area}</div>
                <StatusBadge status={task.estado} />
                {task.prioridad_maxima && (
                  <span style={{ fontSize: 9, color: '#D4AF37', background: 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.25)', borderRadius: 10, padding: '2px 8px' }}>⚡ MÁXIMA</span>
                )}
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--cream)', lineHeight: 1.2 }}>{task.titulo}</div>
            </div>
            <button onClick={onClose} style={{ background: 'rgba(128,128,128,0.1)', border: 'none', color: 'var(--cream)', cursor: 'pointer', fontSize: 16, padding: 8, borderRadius: '50%', lineHeight: 1, flexShrink: 0 }}>✕</button>
          </div>

          {/* Tabs */}
          {tabs.length > 1 && (
            <div style={{ display: 'flex', borderBottom: '1px solid rgba(128,128,128,0.12)', marginBottom: 0 }}>
              {tabs.map(t => (
                <button key={t.id} onClick={() => setTab(t.id)} style={{
                  flex: 1, padding: '10px 8px', border: 'none', background: 'transparent', cursor: 'pointer',
                  borderBottom: `2px solid ${tab === t.id ? cfg.color : 'transparent'}`,
                  fontSize: 11, fontWeight: 600, color: tab === t.id ? cfg.color : 'var(--muted)', letterSpacing: 0.5,
                  transition: 'color 0.15s',
                }}>
                  {t.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px 24px' }}>

          {/* ═══════════ TAB DETALLE ═══════════ */}
          {tab === 'detalle' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Responsable(s) + Plazo */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div style={{ background: 'var(--surface2)', border: '1px solid rgba(128,128,128,0.12)', borderRadius: 12, padding: '12px 14px' }}>
                  <div style={{ fontSize: 9, color: 'var(--muted)', letterSpacing: 1.4, textTransform: 'uppercase', marginBottom: 8 }}>
                    {(task.responsables?.length ?? 0) > 1 ? 'Responsables' : 'Responsable'}
                  </div>
                  {task.responsable ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {/* Responsable principal */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Avatar iniciales={task.responsable.iniciales} userId={task.responsable_id} size={28} />
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--cream)' }}>{task.responsable.nombre}</div>
                          <div style={{ fontSize: 9, color: 'var(--muted)' }}>{task.responsable.rol}</div>
                        </div>
                      </div>
                      {/* Responsables adicionales si existen */}
                      {(task.responsables ?? []).filter(r => r.id !== task.responsable_id).map(r => (
                        <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Avatar iniciales={r.iniciales} userId={r.id} size={24} />
                          <div style={{ fontSize: 11, color: 'var(--muted)' }}>{r.nombre}</div>
                        </div>
                      ))}
                    </div>
                  ) : <div style={{ fontSize: 12, color: 'var(--muted)' }}>—</div>}
                </div>
                <div style={{ background: 'var(--surface2)', border: `1px solid ${plazo.urgent ? 'rgba(255,68,68,0.2)' : 'rgba(128,128,128,0.12)'}`, borderRadius: 12, padding: '12px 14px' }}>
                  <div style={{ fontSize: 9, color: 'var(--muted)', letterSpacing: 1.4, textTransform: 'uppercase', marginBottom: 8 }}>Plazo</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: plazo.urgent ? '#FF6666' : 'var(--cream)' }}>{plazo.text}</div>
                  <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>{formatDate(task.plazo)}</div>
                </div>
              </div>

              {/* Descripción */}
              {task.descripcion && (
                <div style={{ background: 'var(--surface2)', border: '1px solid rgba(128,128,128,0.12)', borderRadius: 12, padding: '12px 14px' }}>
                  <div style={{ fontSize: 9, color: 'var(--muted)', letterSpacing: 1.4, textTransform: 'uppercase', marginBottom: 8 }}>Descripción</div>
                  <p style={{ fontSize: 14, color: 'var(--cream)', lineHeight: 1.6 }}>{task.descripcion}</p>
                </div>
              )}

              {/* Foto de referencia — visible para todos */}
              {task.evidencia_url && (
                <div style={{ background: 'var(--surface2)', border: `1px solid ${cfg.color}25`, borderRadius: 14, padding: '10px 12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                    <span style={{ fontSize: 12 }}>🖼️</span>
                    <span style={{ fontSize: 9, fontWeight: 700, color: cfg.color, letterSpacing: 1.4, textTransform: 'uppercase' }}>Foto de Referencia</span>
                    <span style={{ fontSize: 9, color: 'var(--muted)', marginLeft: 'auto' }}>Toca para ampliar</span>
                  </div>
                  <div
                    onClick={() => setLightboxUrl(task.evidencia_url!)}
                    className="touch-active"
                    style={{ cursor: 'zoom-in', borderRadius: 10, overflow: 'hidden', position: 'relative', display: 'inline-flex', width: '100%' }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={task.evidencia_url}
                      alt="Referencia"
                      style={{ width: '100%', height: 120, objectFit: 'cover', display: 'block' }}
                    />
                    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.15s' }}>
                      <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>⤢</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Nota admin (visible para todos, solo editable por admin) */}
              {task.nota_admin && (
                <div style={{ background: 'rgba(212,175,55,0.04)', border: '1px solid rgba(212,175,55,0.2)', borderRadius: 12, padding: '12px 14px' }}>
                  <div style={{ fontSize: 9, color: '#D4AF37', letterSpacing: 1.4, textTransform: 'uppercase', marginBottom: 8 }}>★ Nota del Administrador</div>
                  <p style={{ fontSize: 13, color: 'var(--cream)', lineHeight: 1.6 }}>{task.nota_admin}</p>
                </div>
              )}

              {/* Reincidencias */}
              {task.contador_retrasos >= 3 && (
                <div style={{ padding: '12px 14px', background: 'rgba(200,84,42,0.08)', border: '1px solid rgba(200,84,42,0.2)', borderRadius: 12, fontSize: 12, color: '#C8542A' }}>
                  ⚠ Protocolo de reincidencia activo — {task.contador_retrasos} retrasos registrados
                </div>
              )}

              {/* Nota rechazo */}
              {task.nota_rechazo && (
                <div style={{ padding: '12px 14px', background: 'rgba(168,52,31,0.08)', border: '1px solid rgba(168,52,31,0.2)', borderRadius: 12 }}>
                  <div style={{ fontSize: 9, color: '#A8341F', letterSpacing: 1.2, marginBottom: 6 }}>NOTA DE RECHAZO</div>
                  <p style={{ fontSize: 13, color: 'var(--cream)' }}>{task.nota_rechazo}</p>
                </div>
              )}

              {/* Resumen de cierre */}
              {task.resumen_cierre && (
                <div style={{ padding: '12px 14px', background: 'rgba(74,122,58,0.06)', border: '1px solid rgba(74,122,58,0.2)', borderRadius: 12 }}>
                  <div style={{ fontSize: 9, color: '#4A7A3A', letterSpacing: 1.2, marginBottom: 6 }}>RESUMEN DE CIERRE</div>
                  <p style={{ fontSize: 13, color: 'var(--cream)' }}>{task.resumen_cierre}</p>
                </div>
              )}

              {/* Reject form */}
              {showReject && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <textarea value={rejectNote} onChange={e => setRejectNote(e.target.value)} placeholder="Motivo del rechazo..." rows={3} style={{ borderRadius: 12 }} />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => setShowReject(false)} style={{ flex: 1, padding: '12px', borderRadius: 10, cursor: 'pointer', background: 'transparent', border: '1px solid rgba(128,128,128,0.15)', fontSize: 12, color: 'var(--muted)' }}>Cancelar</button>
                    <button onClick={doReject} disabled={!rejectNote.trim() || saving} style={{ flex: 2, padding: '12px', borderRadius: 10, cursor: 'pointer', background: 'rgba(168,52,31,0.1)', border: '1px solid rgba(168,52,31,0.3)', fontSize: 12, fontWeight: 700, color: '#A8341F', opacity: rejectNote.trim() && !saving ? 1 : 0.4 }}>
                      Confirmar Rechazo
                    </button>
                  </div>
                </div>
              )}

              {/* Action buttons */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {task.estado === 'Asignada' && canChangeStatus && (
                  <button onClick={startTask} disabled={saving} className="touch-active" style={{ width: '100%', padding: '14px', borderRadius: 12, cursor: 'pointer', background: 'rgba(91,138,168,0.1)', border: '1px solid rgba(91,138,168,0.3)', fontSize: 13, fontWeight: 700, color: '#5B8AA8' }}>
                    ▶ Iniciar Tarea
                  </button>
                )}
                {canSubmit && (
                  <button onClick={submitForApproval} disabled={saving} className="touch-active" style={{ width: '100%', padding: '14px', borderRadius: 12, cursor: 'pointer', background: 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.3)', fontSize: 13, fontWeight: 700, color: '#D4AF37' }}>
                    ↑ Enviar a Revisión
                  </button>
                )}
                {canApprove && !showReject && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <button onClick={approve} disabled={saving} className="touch-active" style={{ padding: '14px', borderRadius: 12, cursor: 'pointer', background: 'rgba(74,122,58,0.1)', border: '1px solid rgba(74,122,58,0.3)', fontSize: 13, fontWeight: 700, color: '#4A7A3A' }}>
                      ✓ Aprobar
                    </button>
                    <button onClick={() => setShowReject(true)} className="touch-active" style={{ padding: '14px', borderRadius: 12, cursor: 'pointer', background: 'rgba(168,52,31,0.08)', border: '1px solid rgba(168,52,31,0.25)', fontSize: 13, fontWeight: 700, color: '#A8341F' }}>
                      ✕ Rechazar
                    </button>
                  </div>
                )}
                <button onClick={() => patch({ prioridad_maxima: !task.prioridad_maxima })} disabled={saving} className="touch-active" style={{
                  width: '100%', padding: '12px', borderRadius: 12, cursor: 'pointer',
                  background: task.prioridad_maxima ? 'rgba(212,175,55,0.1)' : 'rgba(128,128,128,0.05)',
                  border: `1px solid ${task.prioridad_maxima ? 'rgba(212,175,55,0.3)' : 'rgba(128,128,128,0.15)'}`,
                  fontSize: 12, fontWeight: 600, color: task.prioridad_maxima ? 'var(--gold)' : 'var(--muted)',
                }}>
                  ⚡ {task.prioridad_maxima ? 'Quitar' : 'Marcar'} Prioridad Máxima
                </button>
              </div>
            </div>
          )}

          {/* ═══════════ TAB COMENTARIOS ═══════════ */}
          {tab === 'comentarios' && (
            <CommentsTab
              taskId={task.id}
              currentUserId={currentUserId ?? ''}
              accentColor={cfg.color}
            />
          )}

          {/* ═══════════ TAB EVIDENCIA ═══════════ */}
          {tab === 'evidencia' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <p style={{ fontSize: 12, color: '#3A3530', lineHeight: 1.6 }}>
                Sube fotos del antes y después para documentar la tarea visualmente. Al hacer clic en cada sección puedes tomar una foto directo desde tu celular.
              </p>

              {/* ANTES */}
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#5B8AA8', letterSpacing: 1.6, textTransform: 'uppercase', marginBottom: 8 }}>📷 Antes</div>
                <input ref={antesRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) uploadPhoto(f, 'antes') }} />
                {task.foto_antes_url ? (
                  <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', background: '#161616' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={task.foto_antes_url} alt="Antes" style={{ width: '100%', display: 'block', maxHeight: 220, objectFit: 'cover' }} />
                    <button onClick={() => antesRef.current?.click()} disabled={uploadingAntes}
                      style={{ position: 'absolute', bottom: 8, right: 8, padding: '6px 12px', borderRadius: 8, background: 'rgba(0,0,0,0.7)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', fontSize: 11, cursor: 'pointer' }}>
                      Cambiar
                    </button>
                  </div>
                ) : (
                  <button onClick={() => antesRef.current?.click()} disabled={uploadingAntes} className="touch-active"
                    style={{ width: '100%', padding: '32px 20px', borderRadius: 12, border: '2px dashed rgba(91,138,168,0.3)', background: 'rgba(91,138,168,0.04)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 32 }}>{uploadingAntes ? '⏳' : '📸'}</span>
                    <span style={{ fontSize: 12, color: '#5B8AA8', fontWeight: 600 }}>{uploadingAntes ? 'Subiendo...' : 'Tomar foto o subir imagen'}</span>
                    <span style={{ fontSize: 10, color: '#3A3530' }}>Estado antes de comenzar la tarea</span>
                  </button>
                )}
              </div>

              {/* DESPUÉS */}
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#4A7A3A', letterSpacing: 1.6, textTransform: 'uppercase', marginBottom: 8 }}>✅ Después</div>
                <input ref={despuesRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) uploadPhoto(f, 'despues') }} />
                {task.foto_despues_url ? (
                  <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', background: '#161616' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={task.foto_despues_url} alt="Después" style={{ width: '100%', display: 'block', maxHeight: 220, objectFit: 'cover' }} />
                    <button onClick={() => despuesRef.current?.click()} disabled={uploadingDespues}
                      style={{ position: 'absolute', bottom: 8, right: 8, padding: '6px 12px', borderRadius: 8, background: 'rgba(0,0,0,0.7)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', fontSize: 11, cursor: 'pointer' }}>
                      Cambiar
                    </button>
                  </div>
                ) : (
                  <button onClick={() => despuesRef.current?.click()} disabled={uploadingDespues} className="touch-active"
                    style={{ width: '100%', padding: '32px 20px', borderRadius: 12, border: '2px dashed rgba(74,122,58,0.3)', background: 'rgba(74,122,58,0.04)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 32 }}>{uploadingDespues ? '⏳' : '📸'}</span>
                    <span style={{ fontSize: 12, color: '#4A7A3A', fontWeight: 600 }}>{uploadingDespues ? 'Subiendo...' : 'Tomar foto o subir imagen'}</span>
                    <span style={{ fontSize: 10, color: '#3A3530' }}>Resultado final de la tarea</span>
                  </button>
                )}
              </div>

              {/* Comparación lado a lado */}
              {task.foto_antes_url && task.foto_despues_url && (
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#D4AF37', letterSpacing: 1.6, textTransform: 'uppercase', marginBottom: 10 }}>Comparación Antes / Después</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <div style={{ borderRadius: 10, overflow: 'hidden' }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={task.foto_antes_url} alt="Antes" style={{ width: '100%', display: 'block', height: 140, objectFit: 'cover' }} />
                      <div style={{ background: '#161616', padding: '6px 8px', fontSize: 9, color: '#5B8AA8', letterSpacing: 1 }}>ANTES</div>
                    </div>
                    <div style={{ borderRadius: 10, overflow: 'hidden' }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={task.foto_despues_url} alt="Después" style={{ width: '100%', display: 'block', height: 140, objectFit: 'cover' }} />
                      <div style={{ background: '#161616', padding: '6px 8px', fontSize: 9, color: '#4A7A3A', letterSpacing: 1 }}>DESPUÉS</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Resumen de cierre */}
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#F4EEDF', letterSpacing: 1.6, textTransform: 'uppercase', marginBottom: 8 }}>Resumen de Cierre</div>
                <textarea
                  value={resumen}
                  onChange={e => setResumen(e.target.value)}
                  placeholder="¿Qué se hizo? ¿Qué resultados se obtuvieron? Notas del responsable..."
                  rows={4}
                  style={{ borderRadius: 12, marginBottom: 8 }}
                />
                <button onClick={saveResumen} disabled={savingResumen || resumen === (task.resumen_cierre ?? '')} className="touch-active" style={{
                  width: '100%', padding: '13px', borderRadius: 12, cursor: 'pointer',
                  background: 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.3)',
                  fontSize: 13, fontWeight: 700, color: '#D4AF37',
                  opacity: savingResumen ? 0.5 : 1,
                }}>
                  {savingResumen ? 'Guardando...' : 'Guardar Resumen'}
                </button>
              </div>

              {/* Enviar a revisión desde evidencia */}
              {canSubmit && (
                <button onClick={submitForApproval} disabled={saving} className="touch-active" style={{ width: '100%', padding: '14px', borderRadius: 12, cursor: 'pointer', background: 'rgba(74,122,58,0.12)', border: '1px solid rgba(74,122,58,0.3)', fontSize: 13, fontWeight: 700, color: '#4A7A3A' }}>
                  ↑ Enviar a Revisión con Evidencia
                </button>
              )}
            </div>
          )}

          {/* ═══════════ TAB ADMIN ═══════════ */}
          {tab === 'admin' && isAdmin && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ padding: '10px 14px', background: 'rgba(212,175,55,0.06)', border: '1px solid rgba(212,175,55,0.15)', borderRadius: 12, fontSize: 11, color: '#D4AF37' }}>
                ★ Panel exclusivo del Administrador
              </div>

              {/* Editar título */}
              <div>
                <label style={{ fontSize: 10, fontWeight: 600, color: '#3A3530', letterSpacing: 1.4, textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Título</label>
                <input value={editTitulo} onChange={e => setEditTitulo(e.target.value)} style={{ borderRadius: 12 }} />
              </div>

              {/* Editar descripción */}
              <div>
                <label style={{ fontSize: 10, fontWeight: 600, color: '#3A3530', letterSpacing: 1.4, textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Descripción</label>
                <textarea value={editDesc} onChange={e => setEditDesc(e.target.value)} rows={3} style={{ borderRadius: 12 }} />
              </div>

              {/* Foto de referencia */}
              <div>
                <label style={{ fontSize: 10, fontWeight: 600, color: '#D4AF37', letterSpacing: 1.4, textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Foto de Referencia</label>
                <input
                  ref={refPhotoRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) uploadRefPhoto(f) }}
                />
                {task.evidencia_url ? (
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', background: 'var(--surface2)', border: '1px solid rgba(212,175,55,0.2)', borderRadius: 12, padding: 10 }}>
                    {/* Thumbnail clicable */}
                    <div
                      onClick={() => setLightboxUrl(task.evidencia_url!)}
                      className="touch-active"
                      style={{ width: 72, height: 72, borderRadius: 9, overflow: 'hidden', flexShrink: 0, cursor: 'zoom-in', position: 'relative' }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={task.evidencia_url} alt="Referencia" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>⤢</div>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--cream)', marginBottom: 8 }}>Foto cargada</div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          onClick={() => refPhotoRef.current?.click()}
                          disabled={uploadingRef}
                          style={{ flex: 1, padding: '6px 0', borderRadius: 8, background: 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.3)', color: '#D4AF37', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}
                        >{uploadingRef ? '⏳' : '↑ Cambiar'}</button>
                        <button
                          onClick={() => patch({ evidencia_url: null as unknown as string })}
                          disabled={uploadingRef}
                          style={{ flex: 1, padding: '6px 0', borderRadius: 8, background: 'rgba(255,68,68,0.08)', border: '1px solid rgba(255,68,68,0.2)', color: '#FF6666', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}
                        >× Quitar</button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => refPhotoRef.current?.click()}
                    disabled={uploadingRef}
                    className="touch-active"
                    style={{
                      width: '100%', padding: '22px 20px', borderRadius: 12,
                      border: '2px dashed rgba(212,175,55,0.3)',
                      background: 'rgba(212,175,55,0.04)',
                      cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7,
                    }}
                  >
                    <span style={{ fontSize: 28 }}>{uploadingRef ? '⏳' : '🖼️'}</span>
                    <span style={{ fontSize: 12, color: '#D4AF37', fontWeight: 700 }}>
                      {uploadingRef ? 'Subiendo...' : 'Agregar foto de referencia'}
                    </span>
                    <span style={{ fontSize: 10, color: 'var(--muted)' }}>Los responsables la verán en el detalle de la tarea</span>
                  </button>
                )}
              </div>

              {/* Nota y recomendaciones */}
              <div>
                <label style={{ fontSize: 10, fontWeight: 600, color: '#D4AF37', letterSpacing: 1.4, textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Nota / Recomendaciones</label>
                <textarea
                  value={editNota}
                  onChange={e => setEditNota(e.target.value)}
                  rows={4}
                  placeholder="Agrega instrucciones, recomendaciones o comentarios para quien realiza la tarea..."
                  style={{ borderRadius: 12, borderColor: 'rgba(212,175,55,0.3)' }}
                />
              </div>

              {/* Cambio de estado manual */}
              <div>
                <label style={{ fontSize: 10, fontWeight: 600, color: '#3A3530', letterSpacing: 1.4, textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Estado</label>
                <select
                  value={task.estado}
                  onChange={e => patch({ estado: e.target.value as RcTask['estado'] })}
                  style={{ borderRadius: 12 }}
                >
                  {['Asignada', 'En Proceso', 'Por Aprobar', 'Completada', 'Rechazada', 'Atrasada'].map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              <button onClick={saveAdmin} disabled={savingAdmin} className="touch-active" style={{
                width: '100%', padding: '14px', borderRadius: 12, cursor: 'pointer',
                background: 'rgba(212,175,55,0.12)', border: '1px solid rgba(212,175,55,0.35)',
                fontSize: 13, fontWeight: 700, color: '#D4AF37',
                opacity: savingAdmin ? 0.5 : 1,
              }}>
                {savingAdmin ? 'Guardando...' : '★ Guardar Cambios'}
              </button>

              {/* Aprobación directa */}
              {task.estado === 'Por Aprobar' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <button onClick={approve} disabled={saving} className="touch-active" style={{ padding: '13px', borderRadius: 12, cursor: 'pointer', background: 'rgba(74,122,58,0.1)', border: '1px solid rgba(74,122,58,0.3)', fontSize: 12, fontWeight: 700, color: '#4A7A3A' }}>
                    ✓ Aprobar
                  </button>
                  <button onClick={() => { setShowReject(true); setTab('detalle') }} className="touch-active" style={{ padding: '13px', borderRadius: 12, cursor: 'pointer', background: 'rgba(168,52,31,0.08)', border: '1px solid rgba(168,52,31,0.25)', fontSize: 12, fontWeight: 700, color: '#A8341F' }}>
                    ✕ Rechazar
                  </button>
                </div>
              )}

              {/* Eliminar tarea */}
              <div style={{ borderTop: '1px solid rgba(255,68,68,0.1)', paddingTop: 14 }}>
                {!showDeleteConfirm ? (
                  <button onClick={() => setShowDeleteConfirm(true)} style={{ width: '100%', padding: '13px', borderRadius: 12, cursor: 'pointer', background: 'rgba(255,68,68,0.06)', border: '1px solid rgba(255,68,68,0.2)', fontSize: 12, fontWeight: 600, color: '#FF6666' }}>
                    🗑 Eliminar Tarea
                  </button>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ fontSize: 12, color: '#FF6666', textAlign: 'center', fontWeight: 600 }}>
                      ¿Confirmar eliminación? Esta acción no se puede deshacer.
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <button onClick={() => setShowDeleteConfirm(false)} style={{ padding: '12px', borderRadius: 12, cursor: 'pointer', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', fontSize: 12, color: '#3A3530' }}>
                        Cancelar
                      </button>
                      <button onClick={deleteTask} disabled={deleting} style={{ padding: '12px', borderRadius: 12, cursor: 'pointer', background: 'rgba(255,68,68,0.15)', border: '1px solid rgba(255,68,68,0.4)', fontSize: 12, fontWeight: 700, color: '#FF4444' }}>
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
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 16,
          }}
        >
          <button
            onClick={() => setLightboxUrl(null)}
            style={{ position: 'absolute', top: 16, right: 16, width: 40, height: 40, borderRadius: '50%', background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', fontSize: 20, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1 }}
          >×</button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightboxUrl}
            alt="Referencia ampliada"
            onClick={e => e.stopPropagation()}
            style={{ maxWidth: '100%', maxHeight: '90vh', objectFit: 'contain', borderRadius: 12, boxShadow: '0 8px 48px rgba(0,0,0,0.6)' }}
          />
        </div>
      )}
    </div>
  )
}
