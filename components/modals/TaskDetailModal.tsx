'use client'

import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { RcTask, AREA_CFG, STATUS_CFG } from '@/lib/gestion-types'
import Avatar from '@/components/ui/Avatar'
import { formatDate } from '@/lib/format'
import { createClient } from '@/lib/supabase/client'
import { compressImage } from '@/lib/compress-image'
import CommentsTab from './CommentsTab'
import { useIsDesktop } from '@/lib/useIsDesktop'

interface Props {
  task: RcTask
  onClose: () => void
  onUpdate: (updated: RcTask) => void
  onDelete?: (id: string) => void
  isAdmin?: boolean
  currentUserId?: string
}

const STATUS_FLOW = ['Asignada', 'En Proceso', 'Por Aprobar', 'Completada'] as const

function daysRemaining(plazo: string) {
  const diff = Math.ceil((new Date(plazo).getTime() - Date.now()) / 86400000)
  if (diff < 0)   return { label: `Hace ${Math.abs(diff)}d`,  color: '#FF4444' }
  if (diff === 0) return { label: 'Hoy',                      color: '#E67E22' }
  if (diff === 1) return { label: 'Mañana',                   color: '#E67E22' }
  if (diff <= 3)  return { label: `En ${diff} días`,          color: '#D4AF37' }
  return               { label: `En ${diff} días`,            color: '#22C55E' }
}

const CONSEJO: Record<string, string> = {
  'Asignada':    'Inicia la tarea cuando estés listo para comenzar a trabajar en ella.',
  'En Proceso':  'Sube las fotos de evidencia y envía a revisión cuando hayas terminado.',
  'Por Aprobar': 'Revisa el trabajo y la evidencia antes de aprobar o rechazar esta tarea.',
  'Completada':  '¡Tarea completada exitosamente! Puedes revisar el resumen de cierre.',
  'Rechazada':   'La tarea fue rechazada. Puedes revisar el motivo y reasignarla.',
  'Atrasada':    'Esta tarea está atrasada. Actívala o reasígnala lo antes posible.',
}

export default function TaskDetailModal({ task: initialTask, onClose, onUpdate, onDelete, isAdmin, currentUserId }: Props) {
  const [task, setTask]                   = useState(initialTask)
  const [commTab, setCommTab]             = useState<'chat' | 'fotos'>('chat')
  const [showAdminPanel, setShowAdminPanel] = useState(false)
  const [showReject, setShowReject]       = useState(false)
  const [rejectNote, setRejectNote]       = useState('')
  const [saving, setSaving]               = useState(false)

  // Admin fields
  const [editTitulo, setEditTitulo]       = useState(task.titulo)
  const [editDesc, setEditDesc]           = useState(task.descripcion ?? '')
  const [editNota, setEditNota]           = useState(task.nota_admin ?? '')
  const [savingAdmin, setSavingAdmin]     = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting]           = useState(false)
  const [deleteError, setDeleteError]     = useState<string | null>(null)

  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  // Photos
  const [lightboxUrl, setLightboxUrl]     = useState<string | null>(null)
  const [uploadingAntes, setUploadingAntes]     = useState(false)
  const [uploadingDespues, setUploadingDespues] = useState(false)
  const [uploadingRef, setUploadingRef]         = useState(false)
  const [resumen, setResumen]             = useState(task.resumen_cierre ?? '')
  const [savingResumen, setSavingResumen] = useState(false)

  const antesRef    = useRef<HTMLInputElement>(null)
  const despuesRef  = useRef<HTMLInputElement>(null)
  const refPhotoRef = useRef<HTMLInputElement>(null)

  const isDesktop = useIsDesktop()
  const cfg       = AREA_CFG[task.area] ?? { color: '#5B8AA8', dim: '#0A0F14', code: '??' }
  const stCfg     = STATUS_CFG[task.estado as keyof typeof STATUS_CFG] ?? { color: '#888', label: task.estado }
  const plazo     = daysRemaining(task.plazo)
  const flowIdx   = STATUS_FLOW.indexOf(task.estado as typeof STATUS_FLOW[number])

  const isResponsable   = task.responsable_id === currentUserId || (task.responsable_ids ?? []).includes(currentUserId ?? '')
  const canChangeStatus = isResponsable || isAdmin
  const canApprove      = task.estado === 'Por Aprobar' && isAdmin
  const canSubmit       = task.estado === 'En Proceso' && isResponsable
  const isCreator       = !!currentUserId && task.creado_por === currentUserId
  const canDelete       = isAdmin || isCreator

  // ── API helpers ──────────────────────────────────────────
  async function patch(updates: Partial<RcTask>) {
    setSaving(true)
    try {
      const res = await fetch('/api/tasks', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: task.id, ...updates }),
      })
      if (!res.ok) throw new Error()
      const updated = await res.json()
      setTask(updated); onUpdate(updated)
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
    } catch (e) { console.error(e) }
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
    } catch (e) { console.error(e) }
    setUploadingRef(false)
  }

  function approve()           { patch({ estado: 'Completada' }).then(onClose) }
  function doReject()          { if (!rejectNote.trim()) return; patch({ estado: 'Rechazada', nota_rechazo: rejectNote.trim() }).then(onClose) }
  function submitForApproval() { patch({ estado: 'Por Aprobar' }) }
  function startTask()         { patch({ estado: 'En Proceso' }) }
  async function saveResumen() { setSavingResumen(true); await patch({ resumen_cierre: resumen }); setSavingResumen(false) }
  async function saveAdmin()   { setSavingAdmin(true); await patch({ titulo: editTitulo.trim(), descripcion: editDesc.trim(), nota_admin: editNota.trim() }); setSavingAdmin(false) }
  async function deleteTask()  {
    setDeleting(true)
    setDeleteError(null)
    try {
      const res = await fetch('/api/tasks', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: task.id }) })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        setDeleteError(body?.error ?? 'No se pudo eliminar la tarea')
        setDeleting(false)
        return
      }
      onDelete?.(task.id)
    } catch {
      setDeleteError('No se pudo eliminar la tarea — revisa tu conexión')
    }
    setDeleting(false)
  }

  // ── Styles ──────────────────────────────────────────────
  const CARD: React.CSSProperties = {
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: 16,
    padding: '18px 20px',
  }
  const LABEL: React.CSSProperties = {
    fontSize: 9, fontWeight: 800, letterSpacing: 1.8,
    textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)',
    marginBottom: 12,
  }

  // ── SIDEBAR DE ACCIONES ─────────────────────────────────
  function Sidebar() {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* ACCIONES header */}
        <div style={LABEL}>Acciones</div>

        {/* Iniciar tarea */}
        {task.estado === 'Asignada' && canChangeStatus && (
          <button onClick={startTask} disabled={saving} className="touch-active" style={{
            width: '100%', padding: '14px 18px', borderRadius: 14, cursor: 'pointer', border: 'none',
            background: `linear-gradient(135deg, ${cfg.color}, ${cfg.color}bb)`,
            fontSize: 13, fontWeight: 800, color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            boxShadow: `0 4px 20px ${cfg.color}40`,
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            {saving ? 'Iniciando...' : 'Iniciar Tarea'}
          </button>
        )}

        {/* Enviar a revisión */}
        {canSubmit && (
          <button onClick={submitForApproval} disabled={saving} className="touch-active" style={{
            width: '100%', padding: '14px 18px', borderRadius: 14, cursor: 'pointer',
            background: 'linear-gradient(135deg, rgba(212,175,55,0.2), rgba(212,175,55,0.1))',
            border: '1px solid rgba(212,175,55,0.35)',
            fontSize: 13, fontWeight: 800, color: '#D4AF37',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m5 12 7-7 7 7"/><path d="M12 19V5"/></svg>
            {saving ? 'Enviando...' : 'Enviar a Revisión'}
          </button>
        )}

        {/* Aprobar / Rechazar */}
        {canApprove && !showReject && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <button onClick={approve} disabled={saving} className="touch-active" style={{
              padding: '13px', borderRadius: 12, cursor: 'pointer',
              background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)',
              fontSize: 13, fontWeight: 800, color: '#22C55E',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
              Aprobar
            </button>
            <button onClick={() => setShowReject(true)} className="touch-active" style={{
              padding: '13px', borderRadius: 12, cursor: 'pointer',
              background: 'rgba(168,52,31,0.08)', border: '1px solid rgba(168,52,31,0.25)',
              fontSize: 13, fontWeight: 800, color: '#E05535',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              Rechazar
            </button>
          </div>
        )}

        {/* Reject form */}
        {showReject && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <textarea value={rejectNote} onChange={e => setRejectNote(e.target.value)} placeholder="Motivo del rechazo..." rows={3}
              style={{ borderRadius: 10, background: 'rgba(168,52,31,0.06)', border: '1px solid rgba(168,52,31,0.25)', color: '#F4EEDF', padding: '10px 12px', fontSize: 12, resize: 'none', width: '100%', boxSizing: 'border-box' }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setShowReject(false)} style={{ flex: 1, padding: '10px', borderRadius: 10, cursor: 'pointer', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', fontSize: 11, color: 'rgba(128,128,128,0.6)' }}>Cancelar</button>
              <button onClick={doReject} disabled={!rejectNote.trim() || saving} style={{ flex: 2, padding: '10px', borderRadius: 10, cursor: 'pointer', background: 'rgba(168,52,31,0.12)', border: '1px solid rgba(168,52,31,0.35)', fontSize: 11, fontWeight: 700, color: '#E05535', opacity: rejectNote.trim() && !saving ? 1 : 0.4 }}>
                Confirmar Rechazo
              </button>
            </div>
          </div>
        )}

        {/* Prioridad máxima */}
        <button onClick={() => patch({ prioridad_maxima: !task.prioridad_maxima })} disabled={saving} className="touch-active" style={{
          width: '100%', padding: '13px 18px', borderRadius: 14, cursor: 'pointer',
          background: task.prioridad_maxima ? 'rgba(212,175,55,0.1)' : 'rgba(255,255,255,0.03)',
          border: `1px solid ${task.prioridad_maxima ? 'rgba(212,175,55,0.3)' : 'rgba(255,255,255,0.08)'}`,
          fontSize: 12, fontWeight: 700,
          color: task.prioridad_maxima ? '#D4AF37' : 'rgba(255,255,255,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill={task.prioridad_maxima ? '#D4AF37' : 'none'} stroke={task.prioridad_maxima ? '#D4AF37' : 'currentColor'} strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
          {task.prioridad_maxima ? 'Quitar Prioridad Máxima' : 'Marcar como Prioridad Máxima'}
        </button>

        {/* Consejo */}
        <div style={{
          background: 'rgba(91,138,168,0.08)', border: '1px solid rgba(91,138,168,0.18)',
          borderRadius: 14, padding: '14px 16px',
          display: 'flex', gap: 12,
        }}>
          <div style={{ width: 32, height: 32, borderRadius: 10, background: 'rgba(91,138,168,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>💡</div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#5B8AA8', marginBottom: 5 }}>Consejo</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', lineHeight: 1.55 }}>{CONSEJO[task.estado] ?? 'Gestiona el estado de esta tarea desde el panel de acciones.'}</div>
          </div>
        </div>

        {/* Admin toggle */}
        {isAdmin && (
          <button onClick={() => setShowAdminPanel(p => !p)} style={{
            width: '100%', padding: '11px', borderRadius: 12, cursor: 'pointer',
            background: showAdminPanel ? 'rgba(212,175,55,0.1)' : 'rgba(255,255,255,0.03)',
            border: `1px solid ${showAdminPanel ? 'rgba(212,175,55,0.25)' : 'rgba(255,255,255,0.07)'}`,
            fontSize: 11, fontWeight: 700, color: showAdminPanel ? '#D4AF37' : 'rgba(255,255,255,0.35)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>
            ⚙ {showAdminPanel ? 'Cerrar panel Admin' : 'Panel Administrador'}
          </button>
        )}

        {/* Admin panel */}
        {isAdmin && showAdminPanel && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '14px', background: 'rgba(212,175,55,0.04)', border: '1px solid rgba(212,175,55,0.14)', borderRadius: 14 }}>
            <div style={{ fontSize: 9, fontWeight: 800, color: '#D4AF37', letterSpacing: 1.4 }}>PANEL ADMINISTRADOR</div>

            <div>
              <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 5 }}>Título</div>
              <input value={editTitulo} onChange={e => setEditTitulo(e.target.value)}
                style={{ width: '100%', boxSizing: 'border-box', borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#F4EEDF', padding: '9px 12px', fontSize: 12 }} />
            </div>

            <div>
              <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 5 }}>Descripción</div>
              <textarea value={editDesc} onChange={e => setEditDesc(e.target.value)} rows={2}
                style={{ width: '100%', boxSizing: 'border-box', borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#F4EEDF', padding: '9px 12px', fontSize: 12, resize: 'none' }} />
            </div>

            <div>
              <div style={{ fontSize: 9, color: '#D4AF37', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 5 }}>Nota para responsable</div>
              <textarea value={editNota} onChange={e => setEditNota(e.target.value)} rows={2} placeholder="Instrucciones, recomendaciones..."
                style={{ width: '100%', boxSizing: 'border-box', borderRadius: 10, background: 'rgba(212,175,55,0.04)', border: '1px solid rgba(212,175,55,0.18)', color: '#F4EEDF', padding: '9px 12px', fontSize: 12, resize: 'none' }} />
            </div>

            <div>
              <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 5 }}>Estado</div>
              <select value={task.estado} onChange={e => patch({ estado: e.target.value as RcTask['estado'] })}
                style={{ width: '100%', borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#F4EEDF', padding: '9px 12px', fontSize: 12 }}>
                {['Asignada','En Proceso','Por Aprobar','Completada','Rechazada','Atrasada'].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            {/* Foto de referencia */}
            <div>
              <div style={{ fontSize: 9, color: '#D4AF37', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 5 }}>Foto de referencia</div>
              <input ref={refPhotoRef} type="file" accept="image/*" style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) uploadRefPhoto(f) }} />
              {task.evidencia_url ? (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <div onClick={() => setLightboxUrl(task.evidencia_url!)} style={{ width: 60, height: 60, borderRadius: 8, overflow: 'hidden', cursor: 'zoom-in', flexShrink: 0 }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={task.evidencia_url} alt="ref" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: 1 }}>
                    <button onClick={() => refPhotoRef.current?.click()} disabled={uploadingRef}
                      style={{ padding: '5px 10px', borderRadius: 8, background: 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.25)', color: '#D4AF37', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>
                      {uploadingRef ? '⏳' : '↑ Cambiar'}
                    </button>
                    <button onClick={() => patch({ evidencia_url: null as unknown as string })} disabled={uploadingRef}
                      style={{ padding: '5px 10px', borderRadius: 8, background: 'rgba(255,68,68,0.07)', border: '1px solid rgba(255,68,68,0.18)', color: '#FF6666', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>
                      × Quitar
                    </button>
                  </div>
                </div>
              ) : (
                <button onClick={() => refPhotoRef.current?.click()} disabled={uploadingRef}
                  style={{ width: '100%', padding: '16px', borderRadius: 10, border: '2px dashed rgba(212,175,55,0.2)', background: 'rgba(212,175,55,0.03)', cursor: 'pointer', fontSize: 11, color: '#D4AF37', fontWeight: 600 }}>
                  {uploadingRef ? '⏳ Subiendo...' : '🖼️ Agregar foto de referencia'}
                </button>
              )}
            </div>

            <button onClick={saveAdmin} disabled={savingAdmin}
              style={{ width: '100%', padding: '12px', borderRadius: 12, cursor: 'pointer', background: 'rgba(212,175,55,0.12)', border: '1px solid rgba(212,175,55,0.3)', fontSize: 12, fontWeight: 800, color: '#D4AF37', opacity: savingAdmin ? 0.5 : 1 }}>
              {savingAdmin ? 'Guardando...' : '★ Guardar cambios'}
            </button>
          </div>
        )}

        {/* Eliminar tarea — visible para admin o para quien la creó */}
        {canDelete && (
          <div style={{ borderTop: '1px solid rgba(255,68,68,0.1)', paddingTop: 12 }}>
            {!showDeleteConfirm ? (
              <button onClick={() => setShowDeleteConfirm(true)}
                style={{ width: '100%', padding: '11px', borderRadius: 12, cursor: 'pointer', background: 'rgba(255,68,68,0.05)', border: '1px solid rgba(255,68,68,0.15)', fontSize: 12, fontWeight: 700, color: '#FF6666', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                🗑 Eliminar tarea
              </button>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                <div style={{ fontSize: 11, color: '#FF6666', textAlign: 'center' }}>¿Eliminar? No se puede deshacer.</div>
                {deleteError && (
                  <div style={{ fontSize: 11, color: '#FF4444', textAlign: 'center', background: 'rgba(255,68,68,0.08)', border: '1px solid rgba(255,68,68,0.2)', borderRadius: 8, padding: '6px 10px' }}>
                    {deleteError}
                  </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
                  <button onClick={() => { setShowDeleteConfirm(false); setDeleteError(null) }} style={{ padding: '9px', borderRadius: 9, cursor: 'pointer', background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', fontSize: 11, color: 'rgba(128,128,128,0.5)' }}>Cancelar</button>
                  <button onClick={deleteTask} disabled={deleting} style={{ padding: '9px', borderRadius: 9, cursor: 'pointer', background: 'rgba(255,68,68,0.12)', border: '1px solid rgba(255,68,68,0.3)', fontSize: 11, fontWeight: 700, color: '#FF4444' }}>
                    {deleting ? 'Eliminando...' : 'Eliminar'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  // ── FOTOS TAB ──────────────────────────────────────────
  function FotosContent() {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* ANTES */}
        <div>
          <div style={{ fontSize: 9, fontWeight: 700, color: '#5B8AA8', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8 }}>Antes</div>
          <input ref={antesRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) uploadPhoto(f, 'antes') }} />
          {task.foto_antes_url ? (
            <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={task.foto_antes_url} alt="Antes" onClick={() => setLightboxUrl(task.foto_antes_url!)} style={{ width: '100%', display: 'block', maxHeight: 180, objectFit: 'cover', cursor: 'zoom-in' }} />
              <button onClick={() => antesRef.current?.click()} disabled={uploadingAntes}
                style={{ position: 'absolute', bottom: 8, right: 8, padding: '5px 12px', borderRadius: 7, background: 'rgba(0,0,0,0.75)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', fontSize: 10, cursor: 'pointer' }}>
                Cambiar
              </button>
            </div>
          ) : (
            <button onClick={() => antesRef.current?.click()} disabled={uploadingAntes} className="touch-active"
              style={{ width: '100%', padding: '28px 20px', borderRadius: 12, border: '2px dashed rgba(91,138,168,0.2)', background: 'rgba(91,138,168,0.04)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7 }}>
              <span style={{ fontSize: 26 }}>{uploadingAntes ? '⏳' : '📷'}</span>
              <span style={{ fontSize: 12, color: '#5B8AA8', fontWeight: 700 }}>{uploadingAntes ? 'Subiendo...' : 'Foto antes de comenzar'}</span>
            </button>
          )}
        </div>

        {/* DESPUÉS */}
        <div>
          <div style={{ fontSize: 9, fontWeight: 700, color: '#22C55E', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8 }}>Después</div>
          <input ref={despuesRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) uploadPhoto(f, 'despues') }} />
          {task.foto_despues_url ? (
            <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={task.foto_despues_url} alt="Después" onClick={() => setLightboxUrl(task.foto_despues_url!)} style={{ width: '100%', display: 'block', maxHeight: 180, objectFit: 'cover', cursor: 'zoom-in' }} />
              <button onClick={() => despuesRef.current?.click()} disabled={uploadingDespues}
                style={{ position: 'absolute', bottom: 8, right: 8, padding: '5px 12px', borderRadius: 7, background: 'rgba(0,0,0,0.75)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', fontSize: 10, cursor: 'pointer' }}>
                Cambiar
              </button>
            </div>
          ) : (
            <button onClick={() => despuesRef.current?.click()} disabled={uploadingDespues} className="touch-active"
              style={{ width: '100%', padding: '28px 20px', borderRadius: 12, border: '2px dashed rgba(34,197,94,0.2)', background: 'rgba(34,197,94,0.04)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7 }}>
              <span style={{ fontSize: 26 }}>{uploadingDespues ? '⏳' : '📷'}</span>
              <span style={{ fontSize: 12, color: '#22C55E', fontWeight: 700 }}>{uploadingDespues ? 'Subiendo...' : 'Foto del resultado final'}</span>
            </button>
          )}
        </div>

        {/* Comparación */}
        {task.foto_antes_url && task.foto_despues_url && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 4 }}>
            {[{ url: task.foto_antes_url, label: 'ANTES', color: '#5B8AA8' }, { url: task.foto_despues_url, label: 'DESPUÉS', color: '#22C55E' }].map(({ url, label, color }) => (
              <div key={label} style={{ borderRadius: 10, overflow: 'hidden', border: `1px solid ${color}25` }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt={label} onClick={() => setLightboxUrl(url)} style={{ width: '100%', display: 'block', height: 110, objectFit: 'cover', cursor: 'zoom-in' }} />
                <div style={{ background: '#0A0A10', padding: '5px 10px', fontSize: 8, color, letterSpacing: 1, fontWeight: 700 }}>{label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Resumen de cierre */}
        <div>
          <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.3)', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 7 }}>Resumen de Cierre</div>
          <textarea value={resumen} onChange={e => setResumen(e.target.value)} rows={3} placeholder="¿Qué se hizo? ¿Qué resultados se obtuvieron?..."
            style={{ width: '100%', boxSizing: 'border-box', borderRadius: 10, marginBottom: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', color: '#F4EEDF', padding: '10px 12px', fontSize: 12, resize: 'none' }} />
          <button onClick={saveResumen} disabled={savingResumen || resumen === (task.resumen_cierre ?? '')}
            style={{ width: '100%', padding: '11px', borderRadius: 10, cursor: 'pointer', background: 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.3)', fontSize: 12, fontWeight: 700, color: '#D4AF37', opacity: savingResumen ? 0.5 : 1 }}>
            {savingResumen ? 'Guardando...' : 'Guardar Resumen'}
          </button>
        </div>

        {canSubmit && (
          <button onClick={submitForApproval} disabled={saving} className="touch-active"
            style={{ width: '100%', padding: '13px', borderRadius: 12, cursor: 'pointer', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.28)', fontSize: 13, fontWeight: 800, color: '#22C55E' }}>
            ↑ Enviar a Revisión con Evidencia
          </button>
        )}
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────
  const content = (
    <>
      {/* Overlay */}
      <div
        style={{
          position: 'fixed', inset: 0, zIndex: 200,
          background: 'rgba(0,0,0,0.72)',
          backdropFilter: 'blur(6px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: isDesktop ? '24px' : '0',
        }}
        onClick={e => { if (e.target === e.currentTarget) onClose() }}
      >
        {/* Modal card */}
        <div style={{
          position: 'relative',
          background: '#0F0F18',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: isDesktop ? 22 : 0,
          width: '100%',
          maxWidth: 1060,
          maxHeight: isDesktop ? '90vh' : '100dvh',
          height: isDesktop ? 'auto' : '100dvh',
          display: 'flex', flexDirection: 'column',
          overflowY: 'auto',
          boxShadow: '0 32px 80px rgba(0,0,0,0.7)',
        }}>
          {/* Botón X */}
          <button onClick={onClose} style={{
            position: 'sticky', top: 16, zIndex: 20,
            marginLeft: 'auto', marginRight: 16, marginTop: 16,
            width: 34, height: 34, borderRadius: '50%',
            background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)',
            color: 'rgba(255,255,255,0.7)', cursor: 'pointer', fontSize: 16,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>✕</button>

        {/* ── MAIN CONTENT ── */}
        <div style={{ padding: isDesktop ? '8px 32px 48px' : '16px 16px 40px', boxSizing: 'border-box' }}>

          {/* HEADER */}
          <div style={{ marginBottom: 28 }}>
            {/* Chips */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14, alignItems: 'center' }}>
              <div style={{ padding: '4px 12px', borderRadius: 20, background: `${cfg.color}15`, border: `1px solid ${cfg.color}30`, fontSize: 9, fontWeight: 800, color: cfg.color, letterSpacing: 1.4, textTransform: 'uppercase' }}>
                {cfg.code} · {task.area}
              </div>
              <div style={{ padding: '4px 12px', borderRadius: 20, background: `${stCfg.color}12`, border: `1px solid ${stCfg.color}28`, fontSize: 9, fontWeight: 700, color: stCfg.color }}>
                {task.estado}
              </div>
              {task.prioridad_maxima && (
                <div style={{ padding: '4px 12px', borderRadius: 20, background: 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.3)', fontSize: 9, fontWeight: 700, color: '#D4AF37' }}>
                  ⚡ MÁXIMA
                </div>
              )}
            </div>

            {/* Title */}
            <h1 style={{ fontSize: isDesktop ? 40 : 28, fontWeight: 900, color: '#F4EEDF', textTransform: 'uppercase', letterSpacing: isDesktop ? -1.5 : -0.5, lineHeight: 1.1, margin: '0 0 8px' }}>
              {task.titulo}
            </h1>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', margin: 0, fontWeight: 400 }}>
              Visualiza y gestiona los detalles de esta tarea
            </p>
          </div>

          {/* PROGRESS STEPPER */}
          {flowIdx >= 0 && task.estado !== 'Rechazada' && (
            <div style={{ ...CARD, marginBottom: 24, padding: '20px 28px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                {STATUS_FLOW.map((s, i) => {
                  const done   = i < flowIdx
                  const active = i === flowIdx
                  const col    = done ? '#22C55E' : active ? cfg.color : 'rgba(255,255,255,0.15)'
                  const label  = s === 'Por Aprobar' ? 'Revisión' : s
                  return (
                    <div key={s} style={{ display: 'flex', alignItems: 'center', flex: i < STATUS_FLOW.length - 1 ? 1 : 'none' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                        <div style={{
                          width: active ? 36 : 28, height: active ? 36 : 28, borderRadius: '50%',
                          background: done ? '#22C55E' : active ? col : 'rgba(255,255,255,0.05)',
                          border: `2px solid ${col}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: done ? 13 : active ? 14 : 11, color: done || active ? '#fff' : 'rgba(255,255,255,0.2)',
                          fontWeight: 900, transition: 'all 0.2s', flexShrink: 0,
                          boxShadow: active ? `0 0 18px ${col}60` : 'none',
                        }}>
                          {done ? '✓' : i + 1}
                        </div>
                        <div style={{ fontSize: isDesktop ? 10 : 8, fontWeight: active ? 800 : 500, color: done ? '#22C55E' : active ? col : 'rgba(255,255,255,0.25)', letterSpacing: 0.3, whiteSpace: 'nowrap' }}>
                          {label}
                        </div>
                      </div>
                      {i < STATUS_FLOW.length - 1 && (
                        <div style={{ flex: 1, height: 2, margin: '0 10px', marginBottom: 20, background: done ? '#22C55E' : `${cfg.color}15`, borderRadius: 2 }} />
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* 2-COLUMN GRID */}
          <div style={{ display: 'grid', gridTemplateColumns: isDesktop ? '1fr 300px' : '1fr', gap: 20, alignItems: 'start' }}>

            {/* ── LEFT COLUMN ── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* Responsable + Plazo */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {/* Responsable */}
                <div style={CARD}>
                  <div style={LABEL}>Responsable</div>
                  {task.responsable ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Avatar iniciales={task.responsable.iniciales} userId={task.responsable_id} size={34} avatarUrl={task.responsable.avatar_url} />
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: '#F4EEDF' }}>{task.responsable.nombre}</div>
                          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 1 }}>{task.responsable.rol}</div>
                        </div>
                      </div>
                      {(task.responsables ?? []).filter(r => r.id !== task.responsable_id).map(r => (
                        <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Avatar iniciales={r.iniciales} userId={r.id} size={24} avatarUrl={r.avatar_url} />
                          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>{r.nombre}</div>
                        </div>
                      ))}
                    </div>
                  ) : <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.25)' }}>Sin asignar</div>}
                </div>

                {/* Plazo */}
                <div style={{ ...CARD, background: `${plazo.color}08`, border: `1px solid ${plazo.color}22` }}>
                  <div style={LABEL}>Plazo</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: `${plazo.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={plazo.color} strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                    </div>
                    <div>
                      <div style={{ fontSize: 18, fontWeight: 900, color: plazo.color, lineHeight: 1 }}>{plazo.label}</div>
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 3 }}>{formatDate(task.plazo)}</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Descripción */}
              {task.descripcion && (
                <div style={CARD}>
                  <div style={LABEL}>Descripción</div>
                  <p style={{ fontSize: 14, color: 'rgba(244,238,223,0.8)', lineHeight: 1.7, margin: 0 }}>{task.descripcion}</p>
                </div>
              )}

              {/* Foto de referencia */}
              {task.evidencia_url && (
                <div style={{ ...CARD, background: `${cfg.color}07`, border: `1px solid ${cfg.color}18` }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <div style={LABEL}>Referencia visual</div>
                    <span style={{ fontSize: 9, color: 'rgba(128,128,128,0.4)' }}>toca para ampliar</span>
                  </div>
                  <div onClick={() => setLightboxUrl(task.evidencia_url!)} style={{ cursor: 'zoom-in', borderRadius: 10, overflow: 'hidden' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={task.evidencia_url} alt="Referencia" style={{ width: '100%', height: 120, objectFit: 'cover', display: 'block' }} />
                  </div>
                </div>
              )}

              {/* Nota admin */}
              {task.nota_admin && (
                <div style={{ ...CARD, background: 'rgba(212,175,55,0.04)', border: '1px solid rgba(212,175,55,0.15)' }}>
                  <div style={{ ...LABEL, color: '#D4AF37' }}>★ Nota del Administrador</div>
                  <p style={{ fontSize: 13, color: 'rgba(244,238,223,0.8)', lineHeight: 1.6, margin: 0 }}>{task.nota_admin}</p>
                </div>
              )}

              {/* Reincidencias */}
              {task.contador_retrasos >= 3 && (
                <div style={{ padding: '12px 16px', background: 'rgba(200,84,42,0.07)', border: '1px solid rgba(200,84,42,0.2)', borderRadius: 14, fontSize: 12, color: '#C8542A', display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span>⚠</span><span>Protocolo de reincidencia activo — {task.contador_retrasos} retrasos</span>
                </div>
              )}

              {/* Nota rechazo */}
              {task.nota_rechazo && (
                <div style={{ ...CARD, background: 'rgba(168,52,31,0.06)', border: '1px solid rgba(168,52,31,0.2)' }}>
                  <div style={{ ...LABEL, color: '#E05535' }}>Motivo de rechazo</div>
                  <p style={{ fontSize: 13, color: 'rgba(244,238,223,0.8)', lineHeight: 1.6, margin: 0 }}>{task.nota_rechazo}</p>
                </div>
              )}

              {/* Resumen de cierre */}
              {task.resumen_cierre && (
                <div style={{ ...CARD, background: 'rgba(34,197,94,0.04)', border: '1px solid rgba(34,197,94,0.15)' }}>
                  <div style={{ ...LABEL, color: '#22C55E' }}>Resumen de cierre</div>
                  <p style={{ fontSize: 13, color: 'rgba(244,238,223,0.8)', lineHeight: 1.6, margin: 0 }}>{task.resumen_cierre}</p>
                </div>
              )}

              {/* COMUNICACIÓN */}
              <div style={CARD}>
                <div style={LABEL}>Comunicación</div>
                {/* Sub-tabs */}
                <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: 0 }}>
                  {([
                    { key: 'chat',  label: 'Chat',  icon: '💬' },
                    { key: 'fotos', label: 'Fotos', icon: '📷' },
                  ] as { key: 'chat' | 'fotos'; label: string; icon: string }[]).map(t => (
                    <button key={t.key} onClick={() => setCommTab(t.key)} style={{
                      padding: '8px 16px', background: 'none', border: 'none', cursor: 'pointer',
                      borderBottom: `2px solid ${commTab === t.key ? cfg.color : 'transparent'}`,
                      marginBottom: -1,
                      fontSize: 12, fontWeight: commTab === t.key ? 700 : 500,
                      color: commTab === t.key ? cfg.color : 'rgba(255,255,255,0.35)',
                      display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.15s',
                    }}>
                      <span>{t.icon}</span>{t.label}
                    </button>
                  ))}
                </div>
                {commTab === 'chat'
                  ? <CommentsTab taskId={task.id} currentUserId={currentUserId ?? ''} accentColor={cfg.color} />
                  : <FotosContent />
                }
              </div>
            </div>

            {/* ── RIGHT COLUMN (Acciones) ── */}
            {isDesktop && <Sidebar />}
          </div>

          {/* Mobile: Acciones al final */}
          {!isDesktop && (
            <div style={{ marginTop: 20 }}>
              <Sidebar />
            </div>
          )}
        </div>
        </div>{/* end modal card */}
      </div>{/* end overlay */}

      {/* Lightbox */}
      {lightboxUrl && (
        <div onClick={() => setLightboxUrl(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.96)', backdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <button onClick={() => setLightboxUrl(null)}
            style={{ position: 'absolute', top: 16, right: 16, width: 40, height: 40, borderRadius: '50%', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', fontSize: 20, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1 }}>
            ×
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightboxUrl} alt="Ampliado" onClick={e => e.stopPropagation()}
            style={{ maxWidth: '100%', maxHeight: '90vh', objectFit: 'contain', borderRadius: 14, boxShadow: '0 8px 60px rgba(0,0,0,0.7)' }} />
        </div>
      )}
    </>
  )
  return mounted ? createPortal(content, document.body) : null
}
