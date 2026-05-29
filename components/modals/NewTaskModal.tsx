'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { RcUser, RcTask, AREA_CFG, eligibleUsers, MACRO_AREAS } from '@/lib/gestion-types'
import { createClient } from '@/lib/supabase/client'
import { compressImage } from '@/lib/compress-image'

interface AttachedFile {
  name: string
  size: string
  type: 'pdf' | 'image' | 'doc' | 'other'
  preview?: string
  url?: string
}

interface Props {
  defaultArea: string
  availableAreas: string[]
  users: RcUser[]
  onClose: () => void
  onCreated: (task: RcTask) => void
}

const PRIORITY_OPTIONS = [
  { label: 'Alta', color: '#E74C3C', icon: '⚡' },
  { label: 'Media', color: '#E67E22', icon: '▲' },
  { label: 'Normal', color: '#5B8AA8', icon: '—' },
]

const REMINDER_OPTIONS = ['1 hora antes', '1 día antes', '3 días antes', '1 semana antes']

function fileType(name: string): AttachedFile['type'] {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (['pdf'].includes(ext)) return 'pdf'
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return 'image'
  if (['doc', 'docx', 'xls', 'xlsx'].includes(ext)) return 'doc'
  return 'other'
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function NewTaskModal({ defaultArea, availableAreas, users, onClose, onCreated }: Props) {
  const [selectedArea, setSelectedArea] = useState(defaultArea)
  const cfg = AREA_CFG[selectedArea] ?? { color: '#D4AF37', dim: '#141007', code: '??' }
  const allUsers = eligibleUsers(users, selectedArea)

  const [titulo, setTitulo] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [showResponsablesDropdown, setShowResponsablesDropdown] = useState(false)
  const responsablesRef = useRef<HTMLDivElement>(null)
  const [plazo, setPlazo] = useState('')
  const [priority, setPriority] = useState('Alta')
  const [prioridad, setPrioridad] = useState(true)
  const [reminder, setReminder] = useState('1 día antes')
  const [notifEmail, setNotifEmail] = useState(true)
  const [notifMovil, setNotifMovil] = useState(true)
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [comentario, setComentario] = useState('')
  const [loading, setLoading] = useState(false)
  const [savingDraft, setSavingDraft] = useState(false)
  const [error, setError] = useState('')
  const [crearOtra, setCrearOtra] = useState(false)
  const [uploadingRef, setUploadingRef] = useState(false)
  const [showAreaDropdown, setShowAreaDropdown] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dateInputRef = useRef<HTMLInputElement>(null)

  const canSubmit = titulo.trim().length > 0 && plazo && selectedIds.length > 0

  const macroGroups = (Object.entries(MACRO_AREAS) as [string, typeof MACRO_AREAS[keyof typeof MACRO_AREAS]][])
    .map(([key, macro]) => ({
      key, label: macro.label, color: macro.color,
      areas: macro.areas.filter(a => availableAreas.includes(a)),
    }))
    .filter(g => g.areas.length > 0)

  function handleAreaChange(area: string) {
    setSelectedArea(area)
    setSelectedIds([])
    setShowAreaDropdown(false)
  }

  function toggleUser(id: string) {
    setSelectedIds(prev =>
      prev.includes(id)
        ? prev.filter(x => x !== id)
        : [...prev, id]
    )
  }

  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files) return
    const supabase = createClient()
    for (const file of Array.from(files)) {
      const type = fileType(file.name)
      const af: AttachedFile = { name: file.name, size: formatBytes(file.size), type }
      if (type === 'image') {
        setUploadingRef(true)
        try {
          const compressed = await compressImage(file, { maxDim: 1200, quality: 0.78 })
          const path = `tasks/ref-${Date.now()}-${file.name}`
          const { error: uploadErr } = await supabase.storage.from('task-evidence').upload(path, compressed, { upsert: true, contentType: 'image/jpeg' })
          if (!uploadErr) {
            const { data: { publicUrl } } = supabase.storage.from('task-evidence').getPublicUrl(path)
            af.url = publicUrl
            const reader = new FileReader()
            reader.onload = e => {
              af.preview = e.target?.result as string
              setAttachedFiles(prev => [...prev, { ...af }])
            }
            reader.readAsDataURL(file)
            setUploadingRef(false)
            continue
          }
        } catch { /* fall through */ }
        setUploadingRef(false)
      }
      setAttachedFiles(prev => [...prev, af])
    }
  }, [])

  async function handleSubmit(draft = false) {
    if (!draft && !canSubmit) return
    draft ? setSavingDraft(true) : setLoading(true)
    setError('')
    try {
      const evidencias = attachedFiles.filter(f => f.url).map(f => f.url)
      const res = await fetch('/api/tasks/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          titulo: titulo.trim() || '(borrador)',
          descripcion: descripcion.trim(),
          area: selectedArea,
          responsable_id: selectedIds[0] ?? null,
          responsable_ids: selectedIds,
          plazo: plazo || new Date(Date.now() + 86400000 * 7).toISOString().split('T')[0],
          prioridad_maxima: prioridad || priority === 'Alta',
          evidencia_url: evidencias[0] ?? undefined,
          nota_admin: comentario.trim() || undefined,
        }),
      })
      if (!res.ok) throw new Error(await res.text())
      const task = await res.json()
      onCreated(task)
      if (!crearOtra) onClose()
      else {
        setTitulo(''); setDescripcion(''); setSelectedIds([])
        setPlazo(''); setComentario(''); setAttachedFiles([])
      }
    } catch {
      setError('Error al crear la tarea. Intenta nuevamente.')
    } finally {
      setLoading(false); setSavingDraft(false)
    }
  }

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (responsablesRef.current && !responsablesRef.current.contains(e.target as Node)) {
        setShowResponsablesDropdown(false)
      }
    }
    if (showResponsablesDropdown) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showResponsablesDropdown])

  const minDate = new Date().toISOString().split('T')[0]
  const priorityCfg = PRIORITY_OPTIONS.find(p => p.label === priority) ?? PRIORITY_OPTIONS[0]

  const selectedUsers = allUsers.filter(u => selectedIds.includes(u.id))

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(8px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="sheet-up"
        style={{
          width: '100%', maxWidth: 1260, maxHeight: '92vh',
          background: 'var(--surface)', border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: 20, display: 'flex', flexDirection: 'column',
          boxShadow: '0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04)',
          overflow: 'hidden',
        }}
        onClick={e => e.stopPropagation()}
      >

        {/* ── HEADER ── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 28px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 42, height: 42, borderRadius: 12,
              background: `${cfg.color}18`, border: `1.5px solid ${cfg.color}35`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 20,
            }}>
              📋
            </div>
            <div>
              <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--cream)', letterSpacing: -0.3 }}>Nueva tarea</div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>Completa la información para crear una nueva tarea</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              type="button"
              style={{ width: 34, height: 34, borderRadius: 9, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--muted)', cursor: 'pointer', fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              onClick={onClose}
              title="Minimizar"
            >
              ─
            </button>
            <button
              type="button"
              style={{ width: 34, height: 34, borderRadius: 9, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--muted)', cursor: 'pointer', fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              onClick={onClose}
            >
              ✕
            </button>
          </div>
        </div>

        {/* ── PRIMERA FILA: 4 columnas ── */}
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1.6fr 0.9fr 1.2fr',
          gap: 10, padding: '16px 28px 0', flexShrink: 0,
        }}>
          {/* Área */}
          <div style={{ position: 'relative' }}>
            <label style={lbl}>Área *</label>
            <button
              type="button"
              onClick={() => setShowAreaDropdown(v => !v)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 9,
                padding: '9px 12px', borderRadius: 10, cursor: 'pointer',
                background: `${cfg.color}12`, border: `1.5px solid ${cfg.color}40`,
                textAlign: 'left',
              }}
            >
              <div style={{
                width: 24, height: 24, borderRadius: 7, flexShrink: 0,
                background: `${cfg.color}22`, border: `1px solid ${cfg.color}40`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 8, fontWeight: 900, color: cfg.color,
              }}>
                {cfg.code}
              </div>
              <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: cfg.color, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {selectedArea}
              </span>
              <span style={{ color: 'var(--muted)', fontSize: 10 }}>▾</span>
            </button>
            {showAreaDropdown && availableAreas.length > 1 && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
                background: 'var(--surface2)', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 12, marginTop: 6, overflow: 'hidden',
                boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
              }}>
                {macroGroups.map(group => (
                  <div key={group.key}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: group.color, padding: '8px 12px 4px', letterSpacing: 1.4, textTransform: 'uppercase' }}>
                      {group.label}
                    </div>
                    {group.areas.map(area => {
                      const ac = AREA_CFG[area] ?? { color: '#D4AF37', code: '??' }
                      return (
                        <button
                          key={area}
                          type="button"
                          onClick={() => handleAreaChange(area)}
                          style={{
                            width: '100%', display: 'flex', alignItems: 'center', gap: 9,
                            padding: '8px 12px', background: selectedArea === area ? `${ac.color}15` : 'transparent',
                            border: 'none', cursor: 'pointer', textAlign: 'left',
                          }}
                        >
                          <span style={{ fontSize: 12, fontWeight: 600, color: selectedArea === area ? ac.color : 'var(--muted)' }}>{area}</span>
                        </button>
                      )
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Responsables */}
          <div ref={responsablesRef} style={{ position: 'relative' }}>
            <label style={lbl}>Responsables *</label>
            <button
              type="button"
              onClick={() => setShowResponsablesDropdown(v => !v)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 12px', borderRadius: 10, cursor: 'pointer',
                background: 'var(--surface2)', border: '1.5px solid rgba(255,255,255,0.1)',
                textAlign: 'left', minHeight: 42,
              }}
            >
              {selectedUsers.length === 0 ? (
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>Seleccionar...</span>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', flex: 1 }}>
                  {selectedUsers.slice(0, 3).map(u => (
                    <div key={u.id} style={{
                      width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                      background: `${cfg.color}30`, border: `1.5px solid ${cfg.color}50`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 9, fontWeight: 800, color: cfg.color,
                    }}>
                      {u.iniciales}
                    </div>
                  ))}
                  {selectedUsers.length > 3 && (
                    <span style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 700 }}>+{selectedUsers.length - 3}</span>
                  )}
                </div>
              )}
              <span style={{ color: 'var(--muted)', fontSize: 10, marginLeft: 'auto' }}>▾</span>
            </button>
            {showResponsablesDropdown && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
                background: 'var(--surface2)', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 12, marginTop: 6,
                boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                display: 'flex', flexDirection: 'column',
              }}>
                {/* Lista scrolleable */}
                <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                  {allUsers.length === 0 ? (
                    <div style={{ padding: '12px 14px', fontSize: 12, color: 'var(--muted)', textAlign: 'center' }}>No hay usuarios en esta área</div>
                  ) : allUsers.map(u => {
                    const sel = selectedIds.includes(u.id)
                    return (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => toggleUser(u.id)}
                        style={{
                          width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                          padding: '9px 14px', background: sel ? `${cfg.color}12` : 'transparent',
                          border: 'none', cursor: 'pointer', textAlign: 'left',
                        }}
                      >
                        <div style={{
                          width: 18, height: 18, borderRadius: 5, flexShrink: 0,
                          background: sel ? cfg.color : 'transparent',
                          border: `1.5px solid ${sel ? cfg.color : 'rgba(128,128,128,0.3)'}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 10, color: '#0A0A0A', fontWeight: 700,
                        }}>
                          {sel && '✓'}
                        </div>
                        <div style={{
                          width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                          background: sel ? `${cfg.color}30` : 'rgba(128,128,128,0.12)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 9, fontWeight: 800, color: sel ? cfg.color : '#5A5450',
                        }}>
                          {u.iniciales}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: sel ? 'var(--cream)' : 'var(--muted)' }}>{u.nombre}</div>
                          <div style={{ fontSize: 10, color: 'var(--muted)' }}>{u.rol}</div>
                        </div>
                        {selectedIds[0] === u.id && (
                          <span style={{ fontSize: 8, padding: '2px 6px', borderRadius: 8, background: `${cfg.color}20`, color: cfg.color }}>PRINCIPAL</span>
                        )}
                      </button>
                    )
                  })}
                </div>
                {/* Footer fijo siempre visible */}
                <button
                  type="button"
                  onClick={() => setShowResponsablesDropdown(false)}
                  style={{
                    width: '100%', padding: '11px 14px', border: 'none',
                    borderTop: '1px solid rgba(255,255,255,0.08)',
                    background: selectedIds.length > 0 ? cfg.color : 'rgba(255,255,255,0.06)',
                    cursor: 'pointer', fontSize: 13, fontWeight: 800, borderRadius: '0 0 12px 12px',
                    color: selectedIds.length > 0 ? '#0A0A0A' : 'var(--muted)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  }}
                >
                  {selectedIds.length > 0
                    ? `✓ Confirmar (${selectedIds.length} seleccionado${selectedIds.length > 1 ? 's' : ''})`
                    : 'Cerrar'}
                </button>
              </div>
            )}
          </div>

          {/* Prioridad */}
          <div style={{ position: 'relative' }}>
            <label style={lbl}>Prioridad</label>
            <div style={{ display: 'flex', gap: 5 }}>
              {PRIORITY_OPTIONS.map(p => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => { setPriority(p.label); setPrioridad(p.label === 'Alta') }}
                  style={{
                    flex: 1, padding: '9px 6px', borderRadius: 10, cursor: 'pointer', fontSize: 11, fontWeight: 700,
                    background: priority === p.label ? `${p.color}18` : 'var(--surface2)',
                    border: `1.5px solid ${priority === p.label ? p.color + '60' : 'rgba(255,255,255,0.08)'}`,
                    color: priority === p.label ? p.color : 'var(--muted)',
                    display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
                    height: 42,
                  }}
                >
                  <span style={{ fontSize: 12, lineHeight: 1 }}>{p.icon}</span>
                  <span>{p.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Fecha vencimiento */}
          <div>
            <label style={lbl}>Fecha vencimiento *</label>
            <div style={{ position: 'relative' }}>
              {/* Botón visible — misma altura que los botones de prioridad */}
              <div
                onClick={() => dateInputRef.current?.showPicker?.()}
                style={{
                  display: 'flex', alignItems: 'center', gap: 9,
                  padding: '9px 12px', borderRadius: 10, height: 42, boxSizing: 'border-box',
                  background: plazo ? 'var(--input-bg)' : 'var(--surface2)',
                  border: `1.5px solid ${plazo ? 'var(--input-border)' : 'rgba(255,255,255,0.1)'}`,
                  fontSize: 13, color: plazo ? 'var(--cream)' : 'var(--muted)',
                  cursor: 'pointer', userSelect: 'none',
                }}>
                <span style={{ fontSize: 14 }}>📅</span>
                <span>{plazo ? new Date(plazo + 'T12:00:00').toLocaleDateString('es-CL', { day: '2-digit', month: 'long', year: 'numeric' }) : 'Seleccionar fecha'}</span>
              </div>
              {/* Input date invisible — solo para capturar el valor */}
              <input
                ref={dateInputRef}
                type="date"
                value={plazo}
                onChange={e => setPlazo(e.target.value)}
                min={minDate}
                required
                style={{
                  position: 'absolute', inset: 0, opacity: 0,
                  pointerEvents: 'none', width: '100%', height: '100%',
                }}
              />
            </div>
          </div>
        </div>

        {/* ── CUERPO PRINCIPAL: izquierda + derecha ── */}
        <div style={{
          flex: 1, overflowY: 'auto', display: 'grid', gridTemplateColumns: '1fr 320px',
          gap: 0, padding: '16px 28px 0',
        }}>

          {/* COLUMNA IZQUIERDA */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingRight: 20, borderRight: '1px solid rgba(255,255,255,0.05)' }}>

            {/* Título */}
            <div>
              <label style={lbl}>Título *</label>
              <input
                value={titulo}
                onChange={e => setTitulo(e.target.value)}
                placeholder="¿Qué hay que hacer?"
                required
                style={{ borderRadius: 10, fontSize: 15, fontWeight: 600, width: '100%' }}
              />
            </div>

            {/* Descripción */}
            <div>
              <label style={lbl}>Descripción *</label>
              <div style={{
                borderRadius: 12, border: '1px solid var(--input-border)',
                background: 'var(--input-bg)', overflow: 'hidden',
              }}>
                <div style={{
                  display: 'flex', gap: 2, padding: '6px 10px',
                  borderBottom: '1px solid rgba(255,255,255,0.06)',
                  flexWrap: 'wrap',
                }}>
                  {['B', 'I', 'U', 'S', '≡', '—', '☰', '⊕'].map(t => (
                    <button key={t} type="button" style={{
                      width: 26, height: 26, borderRadius: 6, background: 'transparent',
                      border: '1px solid transparent', cursor: 'pointer', fontSize: 11,
                      fontWeight: t === 'B' ? 900 : 400, color: 'var(--muted)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>{t}</button>
                  ))}
                </div>
                <textarea
                  value={descripcion}
                  onChange={e => setDescripcion(e.target.value)}
                  rows={5}
                  placeholder="Revisar y actualizar las políticas internas según los nuevos lineamientos..."
                  style={{
                    resize: 'none', borderRadius: 0, border: 'none', background: 'transparent',
                    width: '100%', padding: '10px 14px', fontSize: 13, boxSizing: 'border-box',
                  }}
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '4px 12px 6px' }}>
                  <span style={{ fontSize: 9, color: 'rgba(128,128,128,0.4)' }}>{descripcion.length}/1000</span>
                </div>
              </div>
            </div>

            {/* Archivos */}
            <div>
              <label style={lbl}>Archivos / Fotos <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(opcional)</span></label>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
                style={{ display: 'none' }}
                onChange={e => handleFiles(e.target.files)}
              />
              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files) }}
                style={{
                  display: 'grid',
                  gridTemplateColumns: attachedFiles.length > 0 ? `160px repeat(${Math.min(attachedFiles.length, 3)}, 140px) 60px` : '1fr',
                  gap: 8, borderRadius: 12,
                  border: `2px dashed ${dragOver ? cfg.color + '80' : 'rgba(255,255,255,0.1)'}`,
                  padding: 10, background: dragOver ? `${cfg.color}06` : 'transparent',
                  transition: 'all 0.15s', minHeight: 80,
                }}
              >
                {attachedFiles.length === 0 ? (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                      gap: 6, background: 'transparent', border: 'none', cursor: 'pointer', padding: '12px 0',
                    }}
                  >
                    <span style={{ fontSize: 26 }}>☁</span>
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>Arrastra archivos aquí o haz <span style={{ color: cfg.color, fontWeight: 700 }}>clic para seleccionar</span></span>
                    <span style={{ fontSize: 9, color: 'rgba(128,128,128,0.4)' }}>JPG, PNG, PDF, DOC, XLS (Máx. 20MB)</span>
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                        gap: 5, background: 'rgba(255,255,255,0.03)', border: '1px dashed rgba(255,255,255,0.1)',
                        borderRadius: 10, cursor: 'pointer', padding: '10px 8px',
                      }}
                    >
                      <span style={{ fontSize: 22 }}>☁</span>
                      <span style={{ fontSize: 9, color: 'var(--muted)', textAlign: 'center' }}>Arrastra archivos aquí o haz <span style={{ color: cfg.color }}>clic</span></span>
                      <span style={{ fontSize: 8, color: 'rgba(128,128,128,0.4)' }}>JPG, PNG, PDF, DOC, XLS (Máx. 20MB)</span>
                    </button>
                    {attachedFiles.slice(0, 3).map((f, i) => (
                      <div key={i} style={{
                        borderRadius: 10, overflow: 'hidden', position: 'relative',
                        background: 'var(--surface2)', border: '1px solid rgba(255,255,255,0.08)',
                      }}>
                        {f.preview ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={f.preview} alt={f.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 4, padding: 10 }}>
                            <span style={{ fontSize: 22 }}>{f.type === 'pdf' ? '📄' : f.type === 'doc' ? '📝' : '📎'}</span>
                            <span style={{ fontSize: 9, color: 'var(--muted)', textAlign: 'center', wordBreak: 'break-all' }}>{f.name}</span>
                            <span style={{ fontSize: 8, color: 'rgba(128,128,128,0.4)' }}>{f.type.toUpperCase()} · {f.size}</span>
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => setAttachedFiles(prev => prev.filter((_, j) => j !== i))}
                          style={{
                            position: 'absolute', top: 5, right: 5,
                            width: 18, height: 18, borderRadius: '50%',
                            background: 'rgba(0,0,0,0.7)', border: 'none',
                            color: '#fff', fontSize: 9, cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}
                        >✕</button>
                        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '4px 7px', background: 'rgba(0,0,0,0.65)' }}>
                          <div style={{ fontSize: 8, color: '#fff', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</div>
                          <div style={{ fontSize: 7, color: 'rgba(255,255,255,0.5)' }}>{f.type.toUpperCase()} · {f.size}</div>
                        </div>
                      </div>
                    ))}
                    {attachedFiles.length < 4 && (
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        style={{
                          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                          gap: 4, background: 'rgba(255,255,255,0.03)', border: '1px dashed rgba(255,255,255,0.1)',
                          borderRadius: 10, cursor: 'pointer',
                        }}
                      >
                        <span style={{ fontSize: 20, color: 'var(--muted)' }}>+</span>
                        <span style={{ fontSize: 9, color: 'var(--muted)' }}>Agregar más</span>
                      </button>
                    )}
                  </>
                )}
              </div>
              {uploadingRef && (
                <p style={{ fontSize: 10, color: cfg.color, marginTop: 4 }}>⏳ Subiendo imagen...</p>
              )}
            </div>

            {/* Comentario inicial */}
            <div>
              <label style={lbl}>Comentario inicial <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(opcional)</span></label>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', flexShrink: 0, background: `${cfg.color}25`, border: `1.5px solid ${cfg.color}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: cfg.color, marginTop: 2 }}>
                  CH
                </div>
                <input
                  value={comentario}
                  onChange={e => setComentario(e.target.value)}
                  placeholder="Escribe un mensaje o instrucción adicional para el responsable..."
                  style={{ flex: 1, borderRadius: 10, fontSize: 12 }}
                />
              </div>
            </div>

            {error && (
              <p style={{ fontSize: 12, color: '#FF6666', padding: '10px 14px', background: 'rgba(255,68,68,0.08)', borderRadius: 10, border: '1px solid rgba(255,68,68,0.2)' }}>
                {error}
              </p>
            )}
          </div>

          {/* COLUMNA DERECHA */}
          <div style={{ paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* Recordatorios */}
            <div style={{ background: 'var(--surface2)', borderRadius: 14, border: '1px solid rgba(255,255,255,0.06)', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 13 }}>🔔</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', letterSpacing: 1.2, textTransform: 'uppercase' }}>Recordatorios</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, padding: '6px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <span style={{ fontSize: 11, color: 'var(--cream)' }}>{reminder}</span>
                  <button
                    type="button"
                    onClick={() => setReminder('')}
                    style={{ marginLeft: 'auto', background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 12, lineHeight: 1 }}
                  >×</button>
                </div>
                <button type="button" style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'transparent', border: 'none', color: cfg.color, cursor: 'pointer', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>
                  + Agregar
                </button>
              </div>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                {REMINDER_OPTIONS.filter(r => r !== reminder).map(r => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setReminder(r)}
                    style={{ padding: '3px 8px', borderRadius: 6, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--muted)', cursor: 'pointer', fontSize: 9 }}
                  >
                    {r}
                  </button>
                ))}
              </div>

              {/* Notificar por */}
              <div>
                <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(128,128,128,0.5)', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 7 }}>Notificar por</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                    <div
                      onClick={() => setNotifEmail(v => !v)}
                      style={{
                        width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                        background: notifEmail ? cfg.color : 'transparent',
                        border: `1.5px solid ${notifEmail ? cfg.color : 'rgba(128,128,128,0.3)'}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 9, color: '#0A0A0A', fontWeight: 900, cursor: 'pointer',
                      }}
                    >
                      {notifEmail && '✓'}
                    </div>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, color: notifEmail ? 'var(--cream)' : 'var(--muted)' }}>
                      <span>✉</span> Correo
                    </span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                    <div
                      onClick={() => setNotifMovil(v => !v)}
                      style={{
                        width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                        background: notifMovil ? cfg.color : 'transparent',
                        border: `1.5px solid ${notifMovil ? cfg.color : 'rgba(128,128,128,0.3)'}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 9, color: '#0A0A0A', fontWeight: 900, cursor: 'pointer',
                      }}
                    >
                      {notifMovil && '✓'}
                    </div>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, color: notifMovil ? 'var(--cream)' : 'var(--muted)' }}>
                      <span>📱</span> Móvil
                    </span>
                  </label>
                </div>
              </div>
            </div>

            {/* Automatizaciones */}
            <div style={{ background: 'var(--surface2)', borderRadius: 14, border: '1px solid rgba(255,255,255,0.06)', padding: '14px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                <span style={{ fontSize: 14 }}>⚡</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', letterSpacing: 1.2, textTransform: 'uppercase' }}>Automatizaciones activas</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {[
                  { icon: '✉', label: 'Notificación inmediata al asignar la tarea' },
                  { icon: '🔔', label: 'Recordatorios antes del vencimiento' },
                  { icon: '⚠', label: 'Alerta si la tarea se atrasa' },
                ].map((item, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 18, height: 18, borderRadius: '50%', background: `${cfg.color}18`, border: `1px solid ${cfg.color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, flexShrink: 0 }}>
                      ✓
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>{item.label}</span>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 12, marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                {[{ icon: '✉', label: 'Correo electrónico' }, { icon: '📱', label: 'Notificación móvil' }].map((ch, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ fontSize: 11 }}>{ch.icon}</span>
                    <span style={{ fontSize: 10, color: 'rgba(128,128,128,0.5)' }}>{ch.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── FOOTER ── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 28px', borderTop: '1px solid rgba(255,255,255,0.06)',
          flexShrink: 0, gap: 12,
        }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <div
              onClick={() => setCrearOtra(v => !v)}
              style={{
                width: 16, height: 16, borderRadius: 4,
                background: crearOtra ? cfg.color : 'transparent',
                border: `1.5px solid ${crearOtra ? cfg.color : 'rgba(128,128,128,0.3)'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 9, color: '#0A0A0A', fontWeight: 900, cursor: 'pointer',
              }}
            >
              {crearOtra && '✓'}
            </div>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>Crear otra tarea después</span>
          </label>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={onClose}
              style={{ padding: '10px 20px', borderRadius: 10, cursor: 'pointer', background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', fontSize: 13, color: 'var(--muted)' }}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => handleSubmit(false)}
              disabled={!canSubmit || loading || savingDraft}
              style={{
                padding: '10px 24px', borderRadius: 10, cursor: canSubmit ? 'pointer' : 'not-allowed',
                background: canSubmit ? cfg.color : 'rgba(128,128,128,0.1)',
                border: 'none', fontSize: 13, fontWeight: 700,
                color: canSubmit ? '#0A0A0A' : 'rgba(128,128,128,0.4)',
                display: 'flex', alignItems: 'center', gap: 6,
                opacity: loading ? 0.7 : 1, transition: 'all 0.15s',
              }}
            >
              {loading ? 'Creando...' : (
                <>
                  <span>✓</span>
                  Crear tarea{selectedIds.length > 1 ? ` (${selectedIds.length})` : ''}
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}

const lbl: React.CSSProperties = {
  fontSize: 10, fontWeight: 600, color: 'var(--muted)',
  letterSpacing: 1.3, textTransform: 'uppercase', display: 'block', marginBottom: 6,
}
