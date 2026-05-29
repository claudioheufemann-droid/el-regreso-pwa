'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { RcUser, RcTask, AREA_CFG, eligibleUsers, MACRO_AREAS } from '@/lib/gestion-types'
import { createClient } from '@/lib/supabase/client'
import { compressImage } from '@/lib/compress-image'
import { useIsDesktop } from '@/lib/useIsDesktop'

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
const ESFUERZO_OPTIONS = ['Bajo', 'Medio', 'Alto', 'Crítico']

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

/* ── Sidebar expandable row ─────────────────────────── */
function SidebarRow({ icon, label, sub, children }: { icon: string; label: string; sub: string; children?: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <div onClick={() => setOpen(v => !v)}
        style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px', cursor: 'pointer', transition: 'background 0.1s', background: open ? 'rgba(255,255,255,0.04)' : 'transparent' }}
        onMouseEnter={e => { if (!open) e.currentTarget.style.background = 'rgba(255,255,255,0.03)' }}
        onMouseLeave={e => { if (!open) e.currentTarget.style.background = 'transparent' }}>
        <div style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>{icon}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#D1D5DB' }}>{label}</div>
          <div style={{ fontSize: 10, color: '#6B7280', marginTop: 1 }}>{sub}</div>
        </div>
        <span style={{ color: '#4B5563', fontSize: 13, transition: 'transform 0.15s', display: 'inline-block', transform: open ? 'rotate(90deg)' : 'none' }}>›</span>
      </div>
      {open && children && (
        <div style={{ padding: '0 16px 12px', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
          {children}
        </div>
      )}
    </div>
  )
}

export default function NewTaskModal({ defaultArea, availableAreas, users, onClose, onCreated }: Props) {
  const isDesktop = useIsDesktop()
  const [selectedArea, setSelectedArea] = useState(defaultArea)
  const cfg = AREA_CFG[selectedArea] ?? { color: '#D4AF37', dim: '#141007', code: '??' }
  const allUsers = eligibleUsers(users, selectedArea)

  // Core fields
  const [titulo, setTitulo] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [plazo, setPlazo] = useState('')
  const [priority, setPriority] = useState('Alta')
  const [prioridad, setPrioridad] = useState(true)

  // Sidebar detail fields
  const [tiempoH, setTiempoH] = useState('')
  const [tiempoM, setTiempoM] = useState('')
  const [fechaInicio, setFechaInicio] = useState('')
  const [etiquetas, setEtiquetas] = useState<string[]>([])
  const [etiquetaInput, setEtiquetaInput] = useState('')
  const [proyecto, setProyecto] = useState('')
  const [visibilidad, setVisibilidad] = useState<'equipo' | 'todos'>('equipo')
  const [esfuerzo, setEsfuerzo] = useState('')
  const [subtareas, setSubtareas] = useState<string[]>([])
  const [subtareaInput, setSubtareaInput] = useState('')

  // UI state
  const [showResponsablesDropdown, setShowResponsablesDropdown] = useState(false)
  const [showAreaDropdown, setShowAreaDropdown] = useState(false)
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
  function addEtiqueta(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && etiquetaInput.trim()) {
      setEtiquetas(prev => [...prev, etiquetaInput.trim()]); setEtiquetaInput('')
    }
  }
  function addSubtarea() {
    if (subtareaInput.trim()) { setSubtareas(prev => [...prev, subtareaInput.trim()]); setSubtareaInput('') }
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
      // Pack sidebar metadata into nota_admin
      const meta: string[] = []
      if (tiempoH || tiempoM) meta.push(`Tiempo: ${tiempoH || '0'}h ${tiempoM || '00'}m`)
      if (fechaInicio) meta.push(`Inicio: ${fechaInicio}`)
      if (etiquetas.length) meta.push(`Etiquetas: ${etiquetas.join(', ')}`)
      if (proyecto) meta.push(`Proyecto: ${proyecto}`)
      if (esfuerzo) meta.push(`Esfuerzo: ${esfuerzo}`)
      if (subtareas.length) meta.push(`Subtareas: ${subtareas.join(' | ')}`)
      meta.push(`Visibilidad: ${visibilidad === 'equipo' ? 'Solo equipo asignado' : 'Todos'}`)

      const res = await fetch('/api/tasks/assign', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          titulo: titulo.trim() || '(borrador)', descripcion: descripcion.trim(),
          area: selectedArea, responsable_id: selectedIds[0] ?? null, responsable_ids: selectedIds,
          plazo: plazo || new Date(Date.now() + 86400000 * 7).toISOString().split('T')[0],
          prioridad_maxima: prioridad || priority === 'Alta',
          evidencia_url: evidencias[0] ?? undefined,
          nota_admin: meta.length > 0 ? meta.join('\n') : undefined,
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

  // Estilos dinámicos: centrado en desktop, bottom sheet en mobile
  const overlayStyle: React.CSSProperties = isDesktop
    ? { position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(10px)' }
    : { position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)' }

  const modalStyle: React.CSSProperties = isDesktop
    ? { width: '100%', maxWidth: 1300, maxHeight: '92vh', background: '#111318', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 22, display: 'flex', flexDirection: 'column', boxShadow: '0 40px 100px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.05)', overflow: 'hidden' }
    : { width: '100%', height: '92vh', background: '#111318', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '20px 20px 0 0', display: 'flex', flexDirection: 'column', boxShadow: '0 -20px 60px rgba(0,0,0,0.8)', overflow: 'hidden' }

  return (
    <div
      style={overlayStyle}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div onClick={e => e.stopPropagation()} style={modalStyle}>

        {/* HEADER */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: isDesktop ? '20px 28px 16px' : '14px 16px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {isDesktop && <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(212,175,55,0.12)', border: '1px solid rgba(212,175,55,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>📋</div>}
            <div>
              <div style={{ fontSize: isDesktop ? 18 : 16, fontWeight: 800, color: '#F4EEDF', letterSpacing: -0.4 }}>Nueva tarea</div>
              {isDesktop && <div style={{ fontSize: 11, color: '#6B7280', marginTop: 1 }}>Completa la información para crear una nueva tarea</div>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {[{ icon: '─' }, { icon: '✕' }].map((b, i) => (
              <button key={i} type="button" onClick={onClose}
                style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: '#6B7280', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                onMouseEnter={e => { e.currentTarget.style.background='rgba(255,255,255,0.1)'; e.currentTarget.style.color='#F4EEDF' }}
                onMouseLeave={e => { e.currentTarget.style.background='rgba(255,255,255,0.05)'; e.currentTarget.style.color='#6B7280' }}>
                {b.icon}
              </button>
            ))}
          </div>
        </div>

        {/* FIRST ROW */}
        <div style={{ display: 'grid', gridTemplateColumns: isDesktop ? '1fr 1.6fr 1.2fr 1.1fr' : 'repeat(2, 1fr)', gap: 10, padding: isDesktop ? '16px 28px 0' : '12px 16px 0', flexShrink: 0 }}>

          {/* Área */}
          <div ref={areaRef} style={{ position: 'relative' }}>
            <label style={LBL}>Área *</label>
            <button type="button" onClick={() => setShowAreaDropdown(v => !v)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 9, padding: '10px 14px', borderRadius: 10, cursor: 'pointer', background: `${cfg.color}12`, border: `1.5px solid ${cfg.color}35`, height: 44 }}>
              <div style={{ width: 24, height: 24, borderRadius: 7, background: `${cfg.color}22`, border: `1px solid ${cfg.color}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 900, color: cfg.color }}>{cfg.code}</div>
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
                style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 10, cursor: 'pointer', background: '#1A1D24', border: '1.5px solid rgba(255,255,255,0.1)', height: 44 }}>
                {selectedUsers.length === 0
                  ? <span style={{ fontSize: 12, color: '#6B7280', flex: 1 }}>Seleccionar responsables...</span>
                  : <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1 }}>
                      {selectedUsers.slice(0,4).map((u,i) => (
                        <div key={u.id} style={{ width: 26, height: 26, borderRadius: '50%', background: `${cfg.color}30`, border: `2px solid ${cfg.color}60`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 800, color: cfg.color, marginLeft: i>0?-6:0 }}>{u.iniciales}</div>
                      ))}
                      {selectedUsers.length > 4 && <span style={{ fontSize: 10, color: '#9CA3AF', marginLeft: 4, fontWeight: 700 }}>+{selectedUsers.length-4}</span>}
                    </div>
                }
                <span style={{ color: '#6B7280', fontSize: 10 }}>▾</span>
              </button>
              <button type="button" onClick={() => setShowResponsablesDropdown(v => !v)}
                style={{ width: 36, height: 36, borderRadius: 10, background: `${cfg.color}15`, border: `1px solid ${cfg.color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 20, color: cfg.color, lineHeight: 1, fontWeight: 300, flexShrink: 0 }}>+</button>
            </div>
            {showResponsablesDropdown && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200, background: '#1A1D24', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, marginTop: 6, boxShadow: '0 8px 32px rgba(0,0,0,0.6)', display: 'flex', flexDirection: 'column' }}>
                <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                  {allUsers.length === 0
                    ? <div style={{ padding: '14px', fontSize: 12, color: '#6B7280', textAlign: 'center' }}>No hay usuarios en esta área</div>
                    : allUsers.map(u => {
                        const sel = selectedIds.includes(u.id)
                        return (
                          <button key={u.id} type="button" onClick={() => toggleUser(u.id)}
                            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: sel ? `${cfg.color}12` : 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                            <div style={{ width: 18, height: 18, borderRadius: 5, flexShrink: 0, background: sel ? cfg.color : 'transparent', border: `1.5px solid ${sel ? cfg.color : 'rgba(156,163,175,0.4)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#111', fontWeight: 700 }}>{sel && '✓'}</div>
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
                  style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, borderRadius: 10, cursor: 'pointer', fontSize: 12, fontWeight: 700, height: 44, background: priority === p.label ? p.bg : 'rgba(255,255,255,0.04)', border: `1.5px solid ${priority === p.label ? p.border : 'rgba(255,255,255,0.08)'}`, color: priority === p.label ? p.color : '#6B7280', transition: 'all 0.15s' }}>
                  <span style={{ fontSize: 11 }}>{p.icon}</span><span>{p.label}</span>
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
                <span>📅</span>
                <span style={{ flex: 1 }}>{plazo ? new Date(plazo+'T12:00:00').toLocaleDateString('es-CL', { day:'2-digit', month:'short', year:'numeric' }) : 'Seleccionar fecha'}</span>
              </div>
              <input ref={dateInputRef} type="date" value={plazo} onChange={e => setPlazo(e.target.value)}
                onFocus={() => { datePickerOpenRef.current = true }} onBlur={() => { datePickerOpenRef.current = false }}
                min={minDate} required style={{ position: 'absolute', inset: 0, opacity: 0, pointerEvents: 'none', width: '100%', height: '100%' }} />
            </div>
          </div>
        </div>

        {/* BODY */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'grid', gridTemplateColumns: isDesktop ? '1fr 300px' : '1fr', gap: 0, padding: isDesktop ? '16px 28px 0' : '12px 16px 0' }}>

          {/* LEFT */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingRight: isDesktop ? 20 : 0, borderRight: isDesktop ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>

            <div>
              <label style={LBL}>Título *</label>
              <input value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="¿Qué hay que hacer?"
                style={{ width: '100%', borderRadius: 10, fontSize: 15, fontWeight: 600, padding: '12px 16px', background: '#1A1D24', border: '1.5px solid rgba(255,255,255,0.08)', color: '#F4EEDF', outline: 'none', boxSizing: 'border-box' }} />
            </div>

            <div style={{ flex: 1 }}>
              <label style={LBL}>Descripción *</label>
              <div style={{ borderRadius: 12, border: '1.5px solid rgba(255,255,255,0.08)', background: '#1A1D24', overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  {['B','I','U','S','≡','⊞','⊕','<>'].map((t,i) => (
                    <button key={i} type="button" style={{ width: 28, height: 28, borderRadius: 6, background: 'transparent', border: 'none', cursor: 'pointer', color: '#9CA3AF', fontSize: 12, fontWeight: t==='B'?900:400, fontStyle: t==='I'?'italic':'normal', textDecoration: t==='U'?'underline':t==='S'?'line-through':'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      onMouseEnter={e => { e.currentTarget.style.background='rgba(255,255,255,0.08)'; e.currentTarget.style.color='#F4EEDF' }}
                      onMouseLeave={e => { e.currentTarget.style.background='transparent'; e.currentTarget.style.color='#9CA3AF' }}>
                      {t}
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

            <div>
              <label style={LBL}>Archivos / Fotos <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: '#6B7280' }}>(opcional)</span></label>
              <input ref={fileInputRef} type="file" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" style={{ display: 'none' }} onChange={e => handleFiles(e.target.files)} />
              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files) }}
                onClick={() => attachedFiles.length === 0 && fileInputRef.current?.click()}
                style={{ borderRadius: 12, border: `2px dashed ${dragOver ? cfg.color+'80' : 'rgba(255,255,255,0.1)'}`, background: dragOver ? `${cfg.color}06` : 'rgba(255,255,255,0.02)', transition: 'all 0.2s', minHeight: attachedFiles.length === 0 ? 120 : 'auto', cursor: attachedFiles.length === 0 ? 'pointer' : 'default' }}>
                {attachedFiles.length === 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 20px', gap: 10 }}>
                    <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>☁</div>
                    <div style={{ fontSize: 13, color: '#9CA3AF', textAlign: 'center' }}>
                      Arrastra archivos aquí o haz <span style={{ color: cfg.color, fontWeight: 700, cursor: 'pointer' }}>clic para seleccionar</span>
                    </div>
                    <div style={{ fontSize: 11, color: '#6B7280' }}>JPG, PNG, PDF, DOC, XLS (Máx. 20MB)</div>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, padding: 10 }}>
                    {attachedFiles.slice(0,3).map((f,i) => (
                      <div key={i} style={{ borderRadius: 10, overflow: 'hidden', position: 'relative', background: '#1A1D24', border: '1px solid rgba(255,255,255,0.08)', aspectRatio: '4/3' }}>
                        {f.preview
                          // eslint-disable-next-line @next/next/no-img-element
                          ? <img src={f.preview} alt={f.name} style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                          : <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100%', gap:4, padding: 8 }}>
                              <span style={{ fontSize: 22 }}>{f.type==='pdf'?'📄':f.type==='doc'?'📝':'📎'}</span>
                              <span style={{ fontSize: 8, color:'#9CA3AF', textAlign:'center', wordBreak:'break-all' }}>{f.name}</span>
                            </div>
                        }
                        <button type="button" onClick={() => setAttachedFiles(prev => prev.filter((_,j)=>j!==i))}
                          style={{ position:'absolute', top:4, right:4, width:16, height:16, borderRadius:'50%', background:'rgba(0,0,0,0.8)', border:'none', color:'#fff', fontSize:8, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
                      </div>
                    ))}
                    <button type="button" onClick={() => fileInputRef.current?.click()}
                      style={{ borderRadius:10, border:'1px dashed rgba(255,255,255,0.12)', background:'rgba(255,255,255,0.02)', cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:4, aspectRatio:'4/3', color:'#6B7280', fontSize:22 }}>+</button>
                  </div>
                )}
              </div>
              {uploadingRef && <p style={{ fontSize:10, color:cfg.color, marginTop:4 }}>⏳ Subiendo...</p>}
            </div>

            {error && <p style={{ fontSize:12, color:'#FF6B6B', padding:'10px 14px', background:'rgba(255,68,68,0.08)', borderRadius:10, border:'1px solid rgba(255,68,68,0.2)' }}>{error}</p>}
          </div>

          {/* RIGHT SIDEBAR — en mobile aparece debajo del contenido principal */}
          <div style={{ paddingLeft: isDesktop ? 20 : 0, paddingTop: isDesktop ? 0 : 14, display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* DETALLES */}
            <div style={{ background: '#1A1D24', borderRadius: 14, border: '1px solid rgba(255,255,255,0.07)', overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '13px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <span style={{ fontSize: 13 }}>✦</span>
                <span style={{ fontSize: 10, fontWeight: 800, color: '#F4EEDF', letterSpacing: 1.3, textTransform: 'uppercase' }}>Detalles de la tarea</span>
              </div>

              <SidebarRow icon="🕐" label="Tiempo estimado" sub={tiempoH||tiempoM ? `${tiempoH||'0'}h ${tiempoM||'00'}m` : 'Seleccionar tiempo'}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 10 }}>
                  <input type="number" min="0" max="99" value={tiempoH} onChange={e => setTiempoH(e.target.value)} placeholder="0"
                    style={{ width: 54, borderRadius: 8, textAlign: 'center', fontSize: 13, padding: '7px 8px', background: '#111318', border: '1px solid rgba(255,255,255,0.1)', color: '#F4EEDF', outline: 'none' }} />
                  <span style={{ fontSize: 11, color: '#6B7280' }}>h</span>
                  <input type="number" min="0" max="59" step="15" value={tiempoM} onChange={e => setTiempoM(e.target.value)} placeholder="00"
                    style={{ width: 54, borderRadius: 8, textAlign: 'center', fontSize: 13, padding: '7px 8px', background: '#111318', border: '1px solid rgba(255,255,255,0.1)', color: '#F4EEDF', outline: 'none' }} />
                  <span style={{ fontSize: 11, color: '#6B7280' }}>m</span>
                </div>
              </SidebarRow>

              <div style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                <SidebarRow icon="📅" label="Fecha de inicio" sub={fechaInicio || 'Opcional'}>
                  <div style={{ paddingTop: 10 }}>
                    <input type="date" value={fechaInicio} onChange={e => setFechaInicio(e.target.value)}
                      style={{ width: '100%', borderRadius: 8, fontSize: 12, padding: '8px 10px', background: '#111318', border: '1px solid rgba(255,255,255,0.1)', color: '#F4EEDF', outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                </SidebarRow>
              </div>

              <div style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                <SidebarRow icon="🏷" label="Etiquetas" sub={etiquetas.length > 0 ? etiquetas.join(', ') : 'Agregar etiquetas'}>
                  <div style={{ paddingTop: 10 }}>
                    {etiquetas.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8 }}>
                        {etiquetas.map((et, i) => (
                          <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, padding: '3px 8px', borderRadius: 20, background: `${cfg.color}20`, color: cfg.color, border: `1px solid ${cfg.color}30` }}>
                            {et}
                            <button type="button" onClick={() => setEtiquetas(prev => prev.filter((_,j)=>j!==i))} style={{ background:'none', border:'none', color:cfg.color, cursor:'pointer', fontSize:10, padding:0, lineHeight:1 }}>×</button>
                          </span>
                        ))}
                      </div>
                    )}
                    <input value={etiquetaInput} onChange={e => setEtiquetaInput(e.target.value)} onKeyDown={addEtiqueta}
                      placeholder="Escribe y presiona Enter..."
                      style={{ width:'100%', borderRadius:8, fontSize:11, padding:'7px 10px', background:'#111318', border:'1px solid rgba(255,255,255,0.1)', color:'#F4EEDF', outline:'none', boxSizing:'border-box' }} />
                  </div>
                </SidebarRow>
              </div>

              <div style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                <SidebarRow icon="📁" label="Proyecto" sub={proyecto || 'Seleccionar proyecto'}>
                  <div style={{ paddingTop: 10 }}>
                    <input value={proyecto} onChange={e => setProyecto(e.target.value)} placeholder="Nombre del proyecto..."
                      style={{ width:'100%', borderRadius:8, fontSize:12, padding:'8px 10px', background:'#111318', border:'1px solid rgba(255,255,255,0.1)', color:'#F4EEDF', outline:'none', boxSizing:'border-box' }} />
                  </div>
                </SidebarRow>
              </div>
            </div>

            {/* CONFIGURACIÓN */}
            <div style={{ background: '#1A1D24', borderRadius: 14, border: '1px solid rgba(255,255,255,0.07)', overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '13px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <span style={{ fontSize: 13 }}>⚙</span>
                <span style={{ fontSize: 10, fontWeight: 800, color: '#F4EEDF', letterSpacing: 1.3, textTransform: 'uppercase' }}>Configuración</span>
              </div>

              <SidebarRow icon="👁" label="Visibilidad" sub={visibilidad === 'equipo' ? 'Solo el equipo asignado' : 'Todos los usuarios'}>
                <div style={{ display: 'flex', gap: 6, paddingTop: 10 }}>
                  {[{ v: 'equipo' as const, label: 'Solo equipo' }, { v: 'todos' as const, label: 'Todos' }].map(opt => (
                    <button key={opt.v} type="button" onClick={() => setVisibilidad(opt.v)}
                      style={{ flex: 1, padding: '7px 10px', borderRadius: 8, cursor: 'pointer', fontSize: 11, fontWeight: 700, border: `1px solid ${visibilidad===opt.v ? cfg.color+'50' : 'rgba(255,255,255,0.08)'}`, background: visibilidad===opt.v ? `${cfg.color}15` : 'rgba(255,255,255,0.03)', color: visibilidad===opt.v ? cfg.color : '#9CA3AF' }}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </SidebarRow>

              <div style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                <SidebarRow icon="🔗" label="Dependencias" sub="Agregar dependencias">
                  <div style={{ paddingTop: 10 }}>
                    <div style={{ padding: '8px 10px', borderRadius: 8, background: '#111318', border: '1px solid rgba(255,255,255,0.08)', fontSize: 11, color: '#6B7280', textAlign: 'center' }}>
                      Funcionalidad próximamente disponible
                    </div>
                  </div>
                </SidebarRow>
              </div>

              <div style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                <SidebarRow icon="☑" label="Checklist" sub={subtareas.length > 0 ? `${subtareas.length} subtareas` : '0/0 subtareas'}>
                  <div style={{ paddingTop: 10 }}>
                    {subtareas.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 8 }}>
                        {subtareas.map((st,i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ width: 14, height: 14, borderRadius: 4, border: '1.5px solid rgba(255,255,255,0.2)', flexShrink: 0 }} />
                            <span style={{ fontSize: 11, color: '#D1D5DB', flex: 1 }}>{st}</span>
                            <button type="button" onClick={() => setSubtareas(prev => prev.filter((_,j)=>j!==i))} style={{ background:'none', border:'none', color:'#6B7280', cursor:'pointer', fontSize:11 }}>✕</button>
                          </div>
                        ))}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input value={subtareaInput} onChange={e => setSubtareaInput(e.target.value)} onKeyDown={e => e.key==='Enter' && addSubtarea()} placeholder="Nueva subtarea..."
                        style={{ flex: 1, borderRadius: 8, fontSize: 11, padding: '7px 10px', background: '#111318', border: '1px solid rgba(255,255,255,0.1)', color: '#F4EEDF', outline: 'none' }} />
                      <button type="button" onClick={addSubtarea}
                        style={{ padding: '7px 10px', borderRadius: 8, background: `${cfg.color}20`, border: `1px solid ${cfg.color}30`, color: cfg.color, cursor: 'pointer', fontSize: 14, fontWeight: 700 }}>+</button>
                    </div>
                  </div>
                </SidebarRow>
              </div>

              <div style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                <SidebarRow icon="📊" label="Nivel de esfuerzo" sub={esfuerzo || 'Seleccionar nivel'}>
                  <div style={{ display: 'flex', gap: 5, paddingTop: 10, flexWrap: 'wrap' }}>
                    {ESFUERZO_OPTIONS.map(op => (
                      <button key={op} type="button" onClick={() => setEsfuerzo(esfuerzo === op ? '' : op)}
                        style={{ padding: '5px 10px', borderRadius: 8, cursor: 'pointer', fontSize: 11, fontWeight: 700, border: `1px solid ${esfuerzo===op ? cfg.color+'50' : 'rgba(255,255,255,0.08)'}`, background: esfuerzo===op ? `${cfg.color}15` : 'rgba(255,255,255,0.03)', color: esfuerzo===op ? cfg.color : '#9CA3AF' }}>
                        {op}
                      </button>
                    ))}
                  </div>
                </SidebarRow>
              </div>
            </div>

          </div>
        </div>

        {/* FOOTER */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: isDesktop ? '14px 28px' : '12px 16px', borderTop: '1px solid rgba(255,255,255,0.06)', flexShrink: 0, gap: 10, flexWrap: isDesktop ? 'nowrap' : 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}>
            <div onClick={() => setCrearOtra(v => !v)}
              style={{ width: 17, height: 17, borderRadius: 5, background: crearOtra ? cfg.color : 'transparent', border: `1.5px solid ${crearOtra ? cfg.color : 'rgba(156,163,175,0.4)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#0A0A0A', fontWeight: 900, cursor: 'pointer' }}>
              {crearOtra && '✓'}
            </div>
            <span style={{ fontSize: 12, color: '#9CA3AF' }}>Crear otra tarea después</span>
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={onClose}
              style={{ padding: '10px 22px', borderRadius: 10, cursor: 'pointer', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', fontSize: 13, color: '#9CA3AF', fontWeight: 600 }}
              onMouseEnter={e => { e.currentTarget.style.background='rgba(255,255,255,0.05)'; e.currentTarget.style.color='#F4EEDF' }}
              onMouseLeave={e => { e.currentTarget.style.background='transparent'; e.currentTarget.style.color='#9CA3AF' }}>
              Cancelar
            </button>
            <button type="button" onClick={() => handleSubmit(true)} disabled={savingDraft||loading}
              style={{ padding: '10px 22px', borderRadius: 10, cursor: 'pointer', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', fontSize: 13, color: '#D1D5DB', fontWeight: 600, opacity: savingDraft ? 0.6 : 1 }}
              onMouseEnter={e => (e.currentTarget.style.background='rgba(255,255,255,0.09)')}
              onMouseLeave={e => (e.currentTarget.style.background='rgba(255,255,255,0.05)')}>
              {savingDraft ? 'Guardando...' : 'Guardar borrador'}
            </button>
            <button type="button" onClick={() => handleSubmit(false)} disabled={!canSubmit||loading||savingDraft}
              style={{ padding: '10px 28px', borderRadius: 10, cursor: canSubmit ? 'pointer' : 'not-allowed', background: canSubmit ? `linear-gradient(135deg,${cfg.color},${cfg.color}CC)` : 'rgba(107,114,128,0.15)', border: 'none', fontSize: 13, fontWeight: 800, color: canSubmit ? '#0A0A0A' : '#6B7280', display: 'flex', alignItems: 'center', gap: 7, opacity: loading ? 0.7 : 1, boxShadow: canSubmit ? `0 4px 20px ${cfg.color}40` : 'none', transition: 'all 0.2s' }}>
              <span>✓</span>{loading ? 'Creando...' : `Crear tarea${selectedIds.length > 1 ? ` (${selectedIds.length})` : ''}`}
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
