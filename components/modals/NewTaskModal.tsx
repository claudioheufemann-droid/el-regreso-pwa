'use client'

import { useState, useRef } from 'react'
import { RcUser, RcTask, AREA_CFG, eligibleUsers } from '@/lib/gestion-types'
import { createClient } from '@/lib/supabase/client'
import { compressImage } from '@/lib/compress-image'

interface Props {
  area: string
  users: RcUser[]
  onClose: () => void
  onCreated: (task: RcTask) => void
}

export default function NewTaskModal({ area, users, onClose, onCreated }: Props) {
  const cfg = AREA_CFG[area] ?? { color: '#D4AF37', dim: '#141007', code: '??' }
  const allUsers = eligibleUsers(users, area)

  const [titulo, setTitulo] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [plazo, setPlazo] = useState('')
  const [prioridad, setPrioridad] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Foto de referencia
  const [refPhotoUrl, setRefPhotoUrl] = useState<string | null>(null)
  const [refPhotoPreview, setRefPhotoPreview] = useState<string | null>(null)
  const [uploadingRef, setUploadingRef] = useState(false)
  const refInputRef = useRef<HTMLInputElement>(null)

  const canSubmit = titulo.trim().length > 0 && plazo && selectedIds.length > 0

  async function handleRefPhoto(file: File) {
    setUploadingRef(true)
    try {
      const supabase = createClient()
      const compressed = await compressImage(file, { maxDim: 1200, quality: 0.78 })
      const path = `tasks/ref-${Date.now()}.jpg`
      const { error: uploadErr } = await supabase.storage
        .from('task-evidence')
        .upload(path, compressed, { upsert: true, contentType: 'image/jpeg' })
      if (uploadErr) throw uploadErr
      const { data: { publicUrl } } = supabase.storage.from('task-evidence').getPublicUrl(path)
      setRefPhotoUrl(publicUrl)
      // Local preview
      const reader = new FileReader()
      reader.onload = e => setRefPhotoPreview(e.target?.result as string)
      reader.readAsDataURL(file)
    } catch (e) {
      console.error('Upload ref photo error:', e)
    }
    setUploadingRef(false)
  }

  function toggleUser(id: string) {
    setSelectedIds(prev =>
      prev.includes(id)
        ? prev.length > 1 ? prev.filter(x => x !== id) : prev // al menos 1
        : [...prev, id]
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/tasks/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          titulo: titulo.trim(),
          descripcion: descripcion.trim(),
          area,
          responsable_id: selectedIds[0],
          responsable_ids: selectedIds,
          plazo,
          prioridad_maxima: prioridad,
          evidencia_url: refPhotoUrl ?? undefined,
        }),
      })
      if (!res.ok) throw new Error(await res.text())
      const task = await res.json()
      onCreated(task)
      onClose()
    } catch {
      setError('Error al crear la tarea. Intenta nuevamente.')
      setLoading(false)
    }
  }

  const labelStyle: React.CSSProperties = {
    fontSize: 10, fontWeight: 600, color: 'var(--muted)',
    letterSpacing: 1.4, textTransform: 'uppercase', display: 'block', marginBottom: 6,
  }
  const minDate = new Date().toISOString().split('T')[0]

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end"
      style={{ background: 'rgba(0,0,0,0.75)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="sheet-up w-full safe-bottom" style={{
        background: 'var(--surface)', borderTop: `2px solid ${cfg.color}40`,
        borderRadius: '18px 18px 0 0', maxHeight: '92vh', display: 'flex', flexDirection: 'column',
      }}>

        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(128,128,128,0.2)' }} />
        </div>

        <div style={{ padding: '8px 20px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: cfg.color, letterSpacing: -0.2 }}>Nueva Tarea</div>
            <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>{area}</div>
          </div>
          <button onClick={onClose} style={{ background: 'rgba(128,128,128,0.1)', border: 'none', color: 'var(--cream)', cursor: 'pointer', fontSize: 16, padding: 8, borderRadius: '50%' }}>✕</button>
        </div>

        <form onSubmit={handleSubmit} style={{ flex: 1, overflowY: 'auto', padding: '16px 20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>

          <div>
            <label style={labelStyle}>Título *</label>
            <input value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="¿Qué hay que hacer?" required style={{ borderRadius: 12, fontSize: 15 }} />
          </div>

          <div>
            <label style={labelStyle}>Descripción</label>
            <textarea value={descripcion} onChange={e => setDescripcion(e.target.value)} rows={3} placeholder="Instrucciones detalladas (opcional)..." style={{ resize: 'none', borderRadius: 12 }} />
          </div>

          {/* Responsables — multi-select */}
          <div>
            <label style={labelStyle}>
              Responsables *
              <span style={{ color: '#5A5450', fontWeight: 400, letterSpacing: 0, textTransform: 'none', marginLeft: 6 }}>
                (selecciona uno o más)
              </span>
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {allUsers.map(u => {
                const selected = selectedIds.includes(u.id)
                return (
                  <div
                    key={u.id}
                    onClick={() => toggleUser(u.id)}
                    className="touch-active cursor-pointer"
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '11px 14px', borderRadius: 12,
                      background: selected ? `${cfg.color}12` : 'rgba(128,128,128,0.05)',
                      border: `1px solid ${selected ? cfg.color + '40' : 'rgba(128,128,128,0.12)'}`,
                      transition: 'all 0.15s',
                    }}
                  >
                    {/* Checkbox */}
                    <div style={{
                      width: 20, height: 20, borderRadius: 6, flexShrink: 0,
                      background: selected ? cfg.color : 'transparent',
                      border: `1.5px solid ${selected ? cfg.color : 'rgba(128,128,128,0.3)'}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, color: '#0A0A0A', fontWeight: 700,
                    }}>
                      {selected && '✓'}
                    </div>
                    {/* Avatar */}
                    <div style={{
                      width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
                      background: selected ? cfg.color + '30' : 'rgba(128,128,128,0.12)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 10, fontWeight: 700,
                      color: selected ? cfg.color : '#5A5450',
                    }}>
                      {u.iniciales}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: selected ? 'var(--cream)' : 'var(--muted)' }}>{u.nombre}</div>
                      <div style={{ fontSize: 10, color: 'var(--muted)' }}>{u.rol}</div>
                    </div>
                    {selectedIds[0] === u.id && (
                      <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 10, background: `${cfg.color}20`, color: cfg.color, letterSpacing: 0.8 }}>
                        PRINCIPAL
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
            {selectedIds.length > 1 && (
              <p style={{ fontSize: 10, color: 'var(--muted)', marginTop: 6 }}>
                📧 Se notificará por email a todos los responsables seleccionados.
              </p>
            )}
          </div>

          {/* Plazo */}
          <div>
            <label style={labelStyle}>Plazo *</label>
            <input type="date" value={plazo} onChange={e => setPlazo(e.target.value)} min={minDate} required style={{ borderRadius: 12 }} />
          </div>

          {/* Foto de referencia */}
          <div>
            <label style={labelStyle}>Foto de referencia <span style={{ color: 'var(--muted)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(opcional)</span></label>
            <input
              ref={refInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) handleRefPhoto(f) }}
            />
            {refPhotoPreview || refPhotoUrl ? (
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', background: 'var(--surface2)', border: `1px solid ${cfg.color}25`, borderRadius: 12, padding: 10 }}>
                {/* Thumbnail */}
                <div style={{ width: 72, height: 72, borderRadius: 9, overflow: 'hidden', flexShrink: 0 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={refPhotoPreview ?? refPhotoUrl ?? ''}
                    alt="Foto de referencia"
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--cream)', marginBottom: 6 }}>
                    {uploadingRef ? '⏳ Subiendo...' : '✓ Foto cargada'}
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button type="button" onClick={() => refInputRef.current?.click()} disabled={uploadingRef}
                      style={{ flex: 1, padding: '5px 0', borderRadius: 8, background: `${cfg.color}15`, border: `1px solid ${cfg.color}30`, color: cfg.color, fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>
                      ↑ Cambiar
                    </button>
                    <button type="button" onClick={() => { setRefPhotoUrl(null); setRefPhotoPreview(null) }} disabled={uploadingRef}
                      style={{ flex: 1, padding: '5px 0', borderRadius: 8, background: 'rgba(255,68,68,0.08)', border: '1px solid rgba(255,68,68,0.2)', color: '#FF6666', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>
                      × Quitar
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => refInputRef.current?.click()}
                disabled={uploadingRef}
                className="touch-active"
                style={{
                  width: '100%', padding: '24px 20px', borderRadius: 14,
                  border: `2px dashed ${cfg.color}35`,
                  background: `${cfg.color}06`,
                  cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                }}
              >
                <span style={{ fontSize: 30 }}>{uploadingRef ? '⏳' : '🖼️'}</span>
                <span style={{ fontSize: 12, color: cfg.color, fontWeight: 700 }}>
                  {uploadingRef ? 'Subiendo imagen...' : 'Agregar foto de referencia'}
                </span>
                <span style={{ fontSize: 10, color: 'var(--muted)' }}>
                  Muestra a los responsables cómo hacer la tarea
                </span>
              </button>
            )}
          </div>

          {/* Priority toggle */}
          <div
            onClick={() => setPrioridad(!prioridad)}
            className="touch-active cursor-pointer"
            style={{
              padding: '14px', display: 'flex', alignItems: 'center', gap: 12,
              background: prioridad ? 'rgba(212,175,55,0.08)' : 'rgba(128,128,128,0.05)',
              border: `1px solid ${prioridad ? 'rgba(212,175,55,0.3)' : 'rgba(128,128,128,0.12)'}`,
              borderRadius: 12,
            }}>
            <div style={{
              width: 20, height: 20, borderRadius: 6, flexShrink: 0,
              background: prioridad ? '#D4AF37' : 'transparent',
              border: `1.5px solid ${prioridad ? '#D4AF37' : 'rgba(128,128,128,0.3)'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, color: '#0A0A0A', fontWeight: 700,
            }}>
              {prioridad && '✓'}
            </div>
            <span style={{ fontSize: 13, color: prioridad ? 'var(--gold)' : 'var(--muted)', fontWeight: 600 }}>
              ⚡ Marcar como Prioridad Máxima
            </span>
          </div>

          {error && (
            <p style={{ fontSize: 12, color: '#FF6666', padding: '10px 14px', background: 'rgba(255,68,68,0.08)', borderRadius: 10, border: '1px solid rgba(255,68,68,0.2)' }}>
              {error}
            </p>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 8 }}>
            <button type="button" onClick={onClose} style={{
              padding: '14px', borderRadius: 12, cursor: 'pointer',
              background: 'rgba(128,128,128,0.07)', border: '1px solid rgba(128,128,128,0.15)',
              fontSize: 13, color: 'var(--muted)',
            }}>
              Cancelar
            </button>
            <button type="submit" disabled={!canSubmit || loading} className="touch-active" style={{
              padding: '14px', borderRadius: 12, cursor: canSubmit ? 'pointer' : 'not-allowed',
              background: `${cfg.color}15`, border: `1px solid ${cfg.color}40`,
              fontSize: 13, fontWeight: 700, color: cfg.color,
              opacity: canSubmit && !loading ? 1 : 0.4,
            }}>
              {loading ? 'Creando...' : `✉ Crear y Notificar${selectedIds.length > 1 ? ` (${selectedIds.length})` : ''}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
