'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { RcUser, RcTask, AREA_CFG, eligibleUsers, MACRO_AREAS } from '@/lib/gestion-types'
import { createClient } from '@/lib/supabase/client'
import { compressImage } from '@/lib/compress-image'

interface AttachedFile {
  name: string; size: string; type: 'pdf' | 'image' | 'doc' | 'other'; preview?: string; url?: string
}
interface Props {
  defaultArea: string; availableAreas: string[]; users: RcUser[]
  onClose: () => void; onCreated: (task: RcTask) => void
}

const PRIORITY_OPTIONS = [
  { label: 'Alta',   color: '#E74C3C', bg: 'rgba(231,76,60,0.15)',  border: 'rgba(231,76,60,0.4)',  icon: '⚡' },
  { label: 'Media',  color: '#F39C12', bg: 'rgba(243,156,18,0.15)', border: 'rgba(243,156,18,0.4)', icon: '▲' },
  { label: 'Normal', color: '#6B7280', bg: 'rgba(107,114,128,0.15)',border: 'rgba(107,114,128,0.4)',icon: '—' },
]

function fileType(n: string): AttachedFile['type'] {
  const ext = n.split('.').pop()?.toLowerCase() ?? ''
  if (['pdf'].includes(ext)) return 'pdf'
  if (['jpg','jpeg','png','gif','webp'].includes(ext)) return 'image'
  if (['doc','docx','xls','xlsx'].includes(ext)) return 'doc'
  return 'other'
}
function fmtBytes(b: number) {
  return b < 1048576 ? `${(b/1024).toFixed(1)} KB` : `${(b/1048576).toFixed(1)} MB`
}

export default function NewTaskModal({ defaultArea, availableAreas, users, onClose, onCreated }: Props) {
  const [selectedArea, setSelectedArea] = useState(defaultArea)
  const cfg = AREA_CFG[selectedArea] ?? { color: '#D4AF37', dim: '#141007', code: '??' }
  const allUsers = eligibleUsers(users, selectedArea)

  const [titulo, setTitulo] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [showResponsablesDropdown, setShowResponsablesDropdown] = useState(false)
  const [showAreaDropdown, setShowAreaDropdown] = useState(false)
  const [plazo, setPlazo] = useState('')
  const [priority, setPriority] = useState('Alta')
  const [prioridad, setPrioridad] = useState(true)
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [loading, setLoading] = useState(false)
  const [savingDraft, setSavingDraft] = useState(false)
  const [error, setError] = useState('')
  const [crearOtra, setCrearOtra] = useState(false)
  const [uploadingRef, setUploadingRef] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const dateInputRef = useRef<HTMLInputElement>(null)
  const datePickerOpenRef = useRef(false)
  const responsablesRef = useRef<HTMLDivElement>(null)
  const areaRef = useRef<HTMLDivElement>(null)

  const minDate = new Date().toISOString().split('T')[0]
  const canSubmit = titulo.trim().length > 0 && plazo && selectedIds.length > 0
  const selectedUsers = allUsers.filter(u => selectedIds.includes(u.id))

  const macroGroups = (Object.entries(MACRO_AREAS) as [string, typeof MACRO_AREAS[keyof typeof MACRO_AREAS]][])
    .map(([key, macro]) => ({ key, label: macro.label, color: macro.color, areas: macro.areas.filter(a => availableAreas.includes(a)) }))
    .filter(g => g.areas.length > 0)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (responsablesRef.current && !responsablesRef.current.contains(e.target as Node))
        setShowResponsablesDropdown(false)
      if (areaRef.current && !areaRef.current.contains(e.target as Node))
        setShowAreaDropdown(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function handleAreaChange(area: string) { setSelectedArea(area); setSelectedIds([]); setShowAreaDropdown(false) }
  function toggleUser(id: string) {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files) return
    const supabase = createClient()
    for (const file of Array.from(files)) {
      const type = fileType(file.name)
      const af: AttachedFile = { name: file.name, size: fmtBytes(file.size), type }
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
            reader.onload = e => { af.preview = e.target?.result as string; setAttachedFiles(prev => [...prev, { ...af }]) }
            reader.readAsDataURL(file); setUploadingRef(false); continue
          }
        } catch { /**/ }
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
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          titulo: titulo.trim() || '(borrador)', descripcion: descripcion.trim(),
          area: selectedArea, responsable_id: selectedIds[0] ?? null, responsable_ids: selectedIds,
          plazo: plazo || new Date(Date.now() + 86400000 * 7).toISOString().split('T')[0],
          prioridad_maxima: prioridad || priority === 'Alta', evidencia_url: evidencias[0] ?? undefined,
        }),
      })
      if (!res.ok) throw new Error(await res.text())
      const task = await res.json()
      onCreated(task)
      if (!crearOtra) onClose()
      else { setTitulo(''); setDescripcion(''); setSelectedIds([]); setPlazo(''); setAttachedFiles([]) }
    } catch { setError('Error al crear la tarea. Intenta nuevamente.') }
    finally { setLoading(false); setSavingDraft(false) }
  }

  const priorityCfg = PRIORITY_OPTIONS.find(p => p.label === priority) ?? PRIORITY_OPTIONS[0]

  // ── Sidebar detail rows ──
  const detailRows = [
    { icon: '🕐', label: 'Tiempo estimado', sub: 'Seleccionar tiempo' },
    { icon: '📅', label: 'Fecha de inicio', sub: 'Opcional' },
    { icon: '🏷', label: 'Etiquetas', sub: 'Agregar etiquetas' },
    { icon: '📁', label: 'Proyecto', sub: 'Seleccionar proyecto' },
  ]
  const configRows = [
    { icon: '👁', label: 'Visibilidad', sub: 'Solo el equipo asignado' },
    { icon: '🔗', label: 'Dependencias', sub: 'Agregar dependencias' },
    { icon: '☑', label: 'Checklist', sub: '0/0 subtareas' },
    { icon: '📊', label: 'Nivel de esfuerzo', sub: 'Seleccionar nivel' },
  ]

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(10px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 1300, maxHeight: '92vh',
          background: '#111318', border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 22, display: 'flex', flexDirection: 'column',
          boxShadow: '0 40px 100px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.05)',
          overflow: 'hidden',
        }}
      >
        {/* ── HEADER ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 28px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(212,175,55,0.12)', border: '1px solid rgba(212,175,55,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>
              📋
            </div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#F4EEDF', letterSpacing: -0.4 }}>Nueva tarea</div>
              <div style={{ fontSize: 11, color: '#6B7280', marginTop: 1 }}>Completa la información para crear una nueva tarea</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {[{ icon: '─', title: 'Minimizar' }, { icon: '✕', title: 'Cerrar' }].map((b, i) => (
              <button key={i} type="button" title={b.title} onClick={onClose}
                style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: '#6B7280', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = '#F4EEDF' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = '#6B7280' }}>
                {b.icon}
              </button>
            ))}
          </div>
        </div>

        {/* ── FIRST ROW: Área / Responsables / Prioridad / Fecha ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.6fr 1.2fr 1.1fr', gap: 12, padding: '16px 28px 0', flexShrink: 0 }}>

          {/* Área */}
          <div ref={areaRef} style={{ position: 'relative' }}>
            <label style={LBL}>Área *</label>
            <button type="button" onClick={() => setShowAreaDropdown(v => !v)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 9, padding: '10px 14px', borderRadius: 10, cursor: 'pointer', background: `${cfg.color}12`, border: `1.5px solid ${cfg.color}35`, height: 44 }}>
              <div style={{ width: 24, height: 24, borderRadius: 7, background: `${cfg.color}22`, border: `1px solid ${cfg.color}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 900, color: cfg.color, flexShrink: 0 }}>{cfg.code}</div>
              <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: cfg.color, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'left' }}>{selectedArea}</span>
              <span style={{ color: cfg.color, fontSize: 10, opacity: 0.7 }}>▾</span>
            </button>
            {showAreaDropdown && availableAreas.length > 1 && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200, background: '#1A1D24', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, marginTop: 6, overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,0.6)' }}>
                {macroGroups.map(group => (
                  <div key={group.key}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: group.color, padding: '8px 14px 4px', letterSpacing: 1.4, textTransform: 'uppercase' }}>{group.label}</div>
                    {group.areas.map(area => {
                      const ac = AREA_CFG[area] ?? { color: '#888', code: '??' }
                      return (
                        <button key={area} type="button" onClick={() => handleAreaChange(area)}
                          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 9, padding: '9px 14px', background: selectedArea === area ? `${ac.color}15` : 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                          <div style={{ width: 20, height: 20, borderRadius: 6, background: `${ac.color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 7, fontWeight: 800, color: ac.color }}>{ac.code}</div>
                          <span style={{ fontSize: 12, fontWeight: 600, color: selectedArea === area ? ac.color : '#9CA3AF' }}>{area}</span>
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
            <label style={LBL}>Responsables *</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 44 }}>
              <button type="button" onClick={() => setShowResponsablesDropdown(v => !v)}
                style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 10, cursor: 'pointer', background: '#1A1D24', border: '1.5px solid rgba(255,255,255,0.1)', height: 44, textAlign: 'left' }}>
                {selectedUsers.length === 0
                  ? <span style={{ fontSize: 12, color: '#6B7280', flex: 1 }}>Seleccionar responsables...</span>
                  : <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1 }}>
                      {selectedUsers.slice(0, 4).map((u, i) => (
                        <div key={u.id} style={{ width: 26, height: 26, borderRadius: '50%', background: `${cfg.color}30`, border: `2px solid ${cfg.color}60`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 800, color: cfg.color, marginLeft: i > 0 ? -6 : 0, zIndex: 10 - i }}>{u.iniciales}</div>
                      ))}
                      {selectedUsers.length > 4 && <span style={{ fontSize: 10, color: '#9CA3AF', marginLeft: 4, fontWeight: 700 }}>+{selectedUsers.length - 4}</span>}
                    </div>
                }
                <span style={{ color: '#6B7280', fontSize: 10 }}>▾</span>
              </button>
              <button type="button" onClick={() => setShowResponsablesDropdown(v => !v)}
                style={{ width: 36, height: 36, borderRadius: 10, background: `${cfg.color}15`, border: `1px solid ${cfg.color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 18, color: cfg.color, fontWeight: 300, flexShrink: 0 }}>
                +
              </button>
            </div>
            {showResponsablesDropdown && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200, background: '#1A1D24', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, marginTop: 6, boxShadow: '0 8px 32px rgba(0,0,0,0.6)', display: 'flex', flexDirection: 'column' }}>
                <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                  {allUsers.length === 0
                    ? <div style={{ padding: '14px 16px', fontSize: 12, color: '#6B7280', textAlign: 'center' }}>No hay usuarios en esta área</div>
                    : allUsers.map(u => {
                        const sel = selectedIds.includes(u.id)
                        return (
                          <button key={u.id} type="button" onClick={() => toggleUser(u.id)}
                            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: sel ? `${cfg.color}12` : 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                            <div style={{ width: 18, height: 18, borderRadius: 5, flexShrink: 0, background: sel ? cfg.color : 'transparent', border: `1.5px solid ${sel ? cfg.color : 'rgba(156,163,175,0.4)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#111', fontWeight: 700 }}>
                              {sel && '✓'}
                            </div>
                            <div style={{ width: 30, height: 30, borderRadius: '50%', flexShrink: 0, background: sel ? `${cfg.color}30` : 'rgba(156,163,175,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 800, color: sel ? cfg.color : '#9CA3AF' }}>{u.iniciales}</div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 12, fontWeight: 600, color: sel ? '#F4EEDF' : '#9CA3AF' }}>{u.nombre}</div>
                              <div style={{ fontSize: 10, color: '#6B7280' }}>{u.rol}</div>
                            </div>
                            {selectedIds[0] === u.id && <span style={{ fontSize: 8, padding: '2px 7px', borderRadius: 8, background: `${cfg.color}20`, color: cfg.color, fontWeight: 700 }}>PRINCIPAL</span>}
                          </button>
                        )
                      })}
                </div>
                <button type="button" onClick={() => setShowResponsablesDropdown(false)}
                  style={{ width: '100%', padding: '11px', border: 'none', borderTop: '1px solid rgba(255,255,255,0.07)', background: selectedIds.length > 0 ? cfg.color : 'rgba(255,255,255,0.05)', cursor: 'pointer', fontSize: 12, fontWeight: 800, borderRadius: '0 0 12px 12px', color: selectedIds.length > 0 ? '#0A0A0A' : '#9CA3AF', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  {selectedIds.length > 0 ? `✓ Confirmar (${selectedIds.length} seleccionado${selectedIds.length > 1 ? 's' : ''})` : 'Cerrar'}
                </button>
              </div>
            )}
          </div>

          {/* Prioridad */}
          <div>
            <label style={LBL}>Prioridad</label>
            <div style={{ display: 'flex', gap: 6, height: 44 }}>
              {PRIORITY_OPTIONS.map(p => (
                <button key={p.label} type="button" onClick={() => { setPriority(p.label); setPrioridad(p.label === 'Alta') }}
                  style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '0 8px', borderRadius: 10, cursor: 'pointer', fontSize: 12, fontWeight: 700, height: 44, background: priority === p.label ? p.bg : 'rgba(255,255,255,0.04)', border: `1.5px solid ${priority === p.label ? p.border : 'rgba(255,255,255,0.08)'}`, color: priority === p.label ? p.color : '#6B7280', transition: 'all 0.15s' }}>
                  <span style={{ fontSize: 11 }}>{p.icon}</span>
                  <span>{p.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Fecha vencimiento */}
          <div>
            <label style={LBL}>Fecha vencimiento *</label>
            <div style={{ position: 'relative', height: 44 }}>
              <div onClick={() => !datePickerOpenRef.current && dateInputRef.current?.showPicker?.()}
                style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '10px 14px', borderRadius: 10, background: plazo ? 'rgba(255,255,255,0.06)' : '#1A1D24', border: `1.5px solid ${plazo ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.08)'}`, fontSize: 13, color: plazo ? '#F4EEDF' : '#6B7280', cursor: 'pointer', height: 44, boxSizing: 'border-box' }}>
                <span style={{ fontSize: 15 }}>📅</span>
                <span style={{ flex: 1 }}>{plazo ? new Date(plazo + 'T12:00:00').toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Seleccionar fecha'}</span>
              </div>
              <input ref={dateInputRef} type="date" value={plazo} onChange={e => setPlazo(e.target.value)}
                onFocus={() => { datePickerOpenRef.current = true }} onBlur={() => { datePickerOpenRef.current = false }}
                min={minDate} required style={{ position: 'absolute', inset: 0, opacity: 0, pointerEvents: 'none', width: '100%', height: '100%' }} />
            </div>
          </div>
        </div>

        {/* ── BODY: main left + sidebar right ── */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'grid', gridTemplateColumns: '1fr 300px', gap: 0, padding: '16px 28px 0' }}>

          {/* LEFT COLUMN */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingRight: 20, borderRight: '1px solid rgba(255,255,255,0.05)' }}>

            {/* Título */}
            <div>
              <label style={LBL}>Título *</label>
              <input value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="¿Qué hay que hacer?"
                style={{ width: '100%', borderRadius: 10, fontSize: 15, fontWeight: 600, padding: '12px 16px', background: '#1A1D24', border: '1.5px solid rgba(255,255,255,0.08)', color: '#F4EEDF', outline: 'none' }} />
            </div>

            {/* Descripción */}
            <div style={{ flex: 1 }}>
              <label style={LBL}>Descripción *</label>
              <div style={{ borderRadius: 12, border: '1.5px solid rgba(255,255,255,0.08)', background: '#1A1D24', overflow: 'hidden' }}>
                {/* Toolbar */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexWrap: 'wrap' }}>
                  {[
                    { icon: 'B', style: { fontWeight: 900 } },
                    { icon: 'I', style: { fontStyle: 'italic' } },
                    { icon: 'U', style: { textDecoration: 'underline' } },
                    { icon: 'S', style: { textDecoration: 'line-through' } },
                    { icon: '≡', style: {} },
                    { icon: '⊞', style: {} },
                    { icon: '≡', style: { opacity: 0.6 } },
                    { icon: '⊕', style: {} },
                    { icon: '<>', style: { fontSize: 9 } },
                  ].map((t, i) => (
                    <button key={i} type="button" style={{ width: 28, height: 28, borderRadius: 6, background: 'transparent', border: 'none', cursor: 'pointer', color: '#9CA3AF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, ...t.style, transition: 'all 0.1s' }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = '#F4EEDF' }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#9CA3AF' }}>
                      {t.icon}
                    </button>
                  ))}
                </div>
                <textarea value={descripcion} onChange={e => setDescripcion(e.target.value)} rows={6}
                  placeholder="Revisar y actualizar las políticas internas según los nuevos lineamientos..."
                  style={{ resize: 'none', border: 'none', background: 'transparent', width: '100%', padding: '12px 16px', fontSize: 13, color: '#D1D5DB', boxSizing: 'border-box', outline: 'none', lineHeight: 1.6 }} />
                <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '4px 14px 8px' }}>
                  <span style={{ fontSize: 9, color: 'rgba(156,163,175,0.4)' }}>{descripcion.length}/1000</span>
                </div>
              </div>
            </div>

            {/* Archivos */}
            <div>
              <label style={LBL}>Archivos / Fotos <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: '#6B7280' }}>(opcional)</span></label>
              <input ref={fileInputRef} type="file" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" style={{ display: 'none' }} onChange={e => handleFiles(e.target.files)} />
              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files) }}
                onClick={() => attachedFiles.length === 0 && fileInputRef.current?.click()}
                style={{ borderRadius: 12, border: `2px dashed ${dragOver ? cfg.color + '80' : 'rgba(255,255,255,0.1)'}`, background: dragOver ? `${cfg.color}06` : 'rgba(255,255,255,0.02)', transition: 'all 0.2s', minHeight: attachedFiles.length === 0 ? 130 : 'auto', cursor: attachedFiles.length === 0 ? 'pointer' : 'default' }}>
                {attachedFiles.length === 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '28px 20px', gap: 10 }}>
                    <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>☁</div>
                    <div style={{ fontSize: 13, color: '#9CA3AF', textAlign: 'center' }}>
                      Arrastra archivos aquí o haz <span style={{ color: cfg.color, fontWeight: 700, cursor: 'pointer' }}>clic para seleccionar</span>
                    </div>
                    <div style={{ fontSize: 11, color: '#6B7280' }}>JPG, PNG, PDF, DOC, XLS (Máx. 20MB)</div>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, padding: 10 }}>
                    {attachedFiles.slice(0, 3).map((f, i) => (
                      <div key={i} style={{ borderRadius: 10, overflow: 'hidden', position: 'relative', background: '#1A1D24', border: '1px solid rgba(255,255,255,0.08)', aspectRatio: '4/3' }}>
                        {f.preview
                          // eslint-disable-next-line @next/next/no-img-element
                          ? <img src={f.preview} alt={f.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          : <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 4 }}>
                              <span style={{ fontSize: 22 }}>{f.type === 'pdf' ? '📄' : f.type === 'doc' ? '📝' : '📎'}</span>
                              <span style={{ fontSize: 8, color: '#9CA3AF', textAlign: 'center', padding: '0 4px', wordBreak: 'break-all' }}>{f.name}</span>
                            </div>
                        }
                        <button type="button" onClick={() => setAttachedFiles(prev => prev.filter((_, j) => j !== i))}
                          style={{ position: 'absolute', top: 4, right: 4, width: 16, height: 16, borderRadius: '50%', background: 'rgba(0,0,0,0.8)', border: 'none', color: '#fff', fontSize: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
                      </div>
                    ))}
                    <button type="button" onClick={() => fileInputRef.current?.click()}
                      style={{ borderRadius: 10, border: '1px dashed rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.02)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, aspectRatio: '4/3', color: '#6B7280', fontSize: 20 }}>
                      +
                    </button>
                  </div>
                )}
              </div>
              {uploadingRef && <p style={{ fontSize: 10, color: cfg.color, marginTop: 4 }}>⏳ Subiendo...</p>}
            </div>

            {error && <p style={{ fontSize: 12, color: '#FF6B6B', padding: '10px 14px', background: 'rgba(255,68,68,0.08)', borderRadius: 10, border: '1px solid rgba(255,68,68,0.2)' }}>{error}</p>}
          </div>

          {/* RIGHT SIDEBAR */}
          <div style={{ paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* DETALLES DE LA TAREA */}
            <div style={{ background: '#1A1D24', borderRadius: 14, border: '1px solid rgba(255,255,255,0.07)', overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <span style={{ fontSize: 15 }}>✦</span>
                <span style={{ fontSize: 10, fontWeight: 800, color: '#F4EEDF', letterSpacing: 1.4, textTransform: 'uppercase' }}>Detalles de la tarea</span>
              </div>
              {detailRows.map((row, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: i < detailRows.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none', cursor: 'pointer', transition: 'background 0.1s' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <div style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>{row.icon}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#D1D5DB' }}>{row.label}</div>
                    <div style={{ fontSize: 10, color: '#6B7280', marginTop: 1 }}>{row.sub}</div>
                  </div>
                  <span style={{ color: '#4B5563', fontSize: 12 }}>›</span>
                </div>
              ))}
            </div>

            {/* CONFIGURACIÓN */}
            <div style={{ background: '#1A1D24', borderRadius: 14, border: '1px solid rgba(255,255,255,0.07)', overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <span style={{ fontSize: 15 }}>⚙</span>
                <span style={{ fontSize: 10, fontWeight: 800, color: '#F4EEDF', letterSpacing: 1.4, textTransform: 'uppercase' }}>Configuración</span>
              </div>
              {configRows.map((row, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: i < configRows.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none', cursor: 'pointer', transition: 'background 0.1s' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <div style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>{row.icon}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#D1D5DB' }}>{row.label}</div>
                    <div style={{ fontSize: 10, color: '#6B7280', marginTop: 1 }}>{row.sub}</div>
                  </div>
                  <span style={{ color: '#4B5563', fontSize: 12 }}>›</span>
                </div>
              ))}
            </div>

          </div>
        </div>

        {/* ── FOOTER ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 28px', borderTop: '1px solid rgba(255,255,255,0.06)', flexShrink: 0, gap: 12 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}>
            <div onClick={() => setCrearOtra(v => !v)}
              style={{ width: 17, height: 17, borderRadius: 5, background: crearOtra ? cfg.color : 'transparent', border: `1.5px solid ${crearOtra ? cfg.color : 'rgba(156,163,175,0.4)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#0A0A0A', fontWeight: 900, cursor: 'pointer', transition: 'all 0.15s' }}>
              {crearOtra && '✓'}
            </div>
            <span style={{ fontSize: 12, color: '#9CA3AF' }}>Crear otra tarea después</span>
          </label>

          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={onClose}
              style={{ padding: '10px 22px', borderRadius: 10, cursor: 'pointer', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', fontSize: 13, color: '#9CA3AF', fontWeight: 600, transition: 'all 0.15s' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = '#F4EEDF' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#9CA3AF' }}>
              Cancelar
            </button>
            <button type="button" onClick={() => handleSubmit(true)} disabled={savingDraft || loading}
              style={{ padding: '10px 22px', borderRadius: 10, cursor: 'pointer', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', fontSize: 13, color: '#D1D5DB', fontWeight: 600, opacity: savingDraft ? 0.6 : 1, transition: 'all 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.09)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}>
              {savingDraft ? 'Guardando...' : 'Guardar borrador'}
            </button>
            <button type="button" onClick={() => handleSubmit(false)} disabled={!canSubmit || loading || savingDraft}
              style={{ padding: '10px 28px', borderRadius: 10, cursor: canSubmit ? 'pointer' : 'not-allowed', background: canSubmit ? `linear-gradient(135deg, ${cfg.color}, ${cfg.color}CC)` : 'rgba(107,114,128,0.15)', border: 'none', fontSize: 13, fontWeight: 800, color: canSubmit ? '#0A0A0A' : '#6B7280', display: 'flex', alignItems: 'center', gap: 7, opacity: loading ? 0.7 : 1, transition: 'all 0.2s', boxShadow: canSubmit ? `0 4px 20px ${cfg.color}40` : 'none' }}>
              <span style={{ fontSize: 14 }}>✓</span>
              {loading ? 'Creando...' : `Crear tarea${selectedIds.length > 1 ? ` (${selectedIds.length})` : ''}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

const LBL: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, color: '#9CA3AF',
  letterSpacing: 1.2, textTransform: 'uppercase', display: 'block', marginBottom: 6,
}
