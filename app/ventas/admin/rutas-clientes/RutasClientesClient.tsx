'use client'

import { useState, useMemo } from 'react'
import {
  Plus, Pencil, Trash2, Check, X, Search, MapPin,
  Route, Users, MoveRight, ArrowRightLeft, AlertCircle,
} from 'lucide-react'
import { useIsDesktop } from '@/lib/useIsDesktop'

interface Cliente {
  id: number
  nombre_fantasia: string | null
  vendedor: string | null
  localidad: string | null
  localidad_entrega: string | null
  ruta_despacho: string | null
  telefono: string | null
}

interface Props {
  clientes: Cliente[]
}

// ── API helpers ──────────────────────────────────────────────────────────────
async function apiRenombrar(old_ruta: string, new_ruta: string): Promise<string | null> {
  const r = await fetch('/api/clientes/rutas', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ old_ruta, new_ruta }),
  })
  if (!r.ok) {
    const body = await r.json().catch(() => ({}))
    return (body as { error?: string }).error ?? `Error ${r.status}`
  }
  return null
}

async function apiAsignar(cliente_ids: number[], ruta: string | null): Promise<string | null> {
  const r = await fetch('/api/clientes/rutas', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cliente_ids, ruta }),
  })
  if (!r.ok) {
    const body = await r.json().catch(() => ({}))
    return (body as { error?: string }).error ?? `Error ${r.status}`
  }
  return null
}

async function apiEliminar(ruta: string): Promise<string | null> {
  const r = await fetch('/api/clientes/rutas', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ruta }),
  })
  if (!r.ok) {
    const body = await r.json().catch(() => ({}))
    return (body as { error?: string }).error ?? `Error ${r.status}`
  }
  return null
}

// ── EditableNombre ─────────────────────────────────────────────────────────
function EditableNombre({ nombre, onSave, onCancel }: {
  nombre: string; onSave: (n: string) => void; onCancel: () => void
}) {
  const [val, setVal] = useState(nombre)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}
      onClick={e => e.stopPropagation()}>
      <input
        autoFocus
        value={val}
        onChange={e => setVal(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); onSave(val) }
          if (e.key === 'Escape') onCancel()
        }}
        style={{
          flex: 1, background: '#0D0D0D', border: '1px solid #D4AF37',
          borderRadius: 6, padding: '3px 8px', color: '#fff', fontSize: 13,
          fontWeight: 700, outline: 'none',
        }}
      />
      <button onClick={() => onSave(val)}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#34D399', padding: 3 }}>
        <Check size={15} />
      </button>
      <button onClick={onCancel}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#666', padding: 3 }}>
        <X size={15} />
      </button>
    </div>
  )
}

// ── RutaItem — defined OUTSIDE main component to keep stable reference ──────
interface RutaItemProps {
  nombre: string
  count: number
  isSelected: boolean
  isEditing: boolean
  onSelect: () => void
  onEdit: () => void
  onSave: (n: string) => void
  onCancel: () => void
  onDelete: () => void
}

function RutaItem({ nombre, count, isSelected, isEditing, onSelect, onEdit, onSave, onCancel, onDelete }: RutaItemProps) {
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '9px 12px', borderRadius: 10,
        background: isSelected ? 'rgba(212,175,55,0.1)' : 'transparent',
        border: `1px solid ${isSelected ? 'rgba(212,175,55,0.3)' : 'transparent'}`,
        cursor: 'pointer', marginBottom: 2, transition: 'all 0.12s',
      }}
      onClick={() => { if (!isEditing) onSelect() }}
    >
      <Route size={13} style={{ color: isSelected ? '#D4AF37' : '#444', flexShrink: 0 }} />

      {isEditing ? (
        <EditableNombre nombre={nombre} onSave={onSave} onCancel={onCancel} />
      ) : (
        <>
          <span style={{
            flex: 1, fontSize: 13, fontWeight: 700,
            color: isSelected ? '#D4AF37' : '#ccc',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            Ruta {nombre}
          </span>
          <span style={{
            fontSize: 11, fontWeight: 800,
            color: count === 0 ? '#555' : '#fff',
            background: count === 0 ? '#1A1A1A' : isSelected ? 'rgba(212,175,55,0.2)' : '#2A2A2A',
            padding: '1px 7px', borderRadius: 20, flexShrink: 0,
          }}>{count}</span>
          <div style={{ display: 'flex', gap: 1, flexShrink: 0 }}>
            <button
              onClick={e => { e.stopPropagation(); onEdit() }}
              title="Renombrar"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#555', padding: '2px 4px', borderRadius: 4 }}
              onMouseEnter={e => (e.currentTarget.style.color = '#D4AF37')}
              onMouseLeave={e => (e.currentTarget.style.color = '#555')}
            >
              <Pencil size={11} />
            </button>
            <button
              onClick={e => { e.stopPropagation(); onDelete() }}
              title="Eliminar"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#555', padding: '2px 4px', borderRadius: 4 }}
              onMouseEnter={e => (e.currentTarget.style.color = '#F87171')}
              onMouseLeave={e => (e.currentTarget.style.color = '#555')}
            >
              <Trash2 size={11} />
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// ── ClienteRow ───────────────────────────────────────────────────────────────
const VENDEDOR_COLOR: Record<string, string> = {
  'Javier Badilla': '#F59E0B',
  'Carlos Urrejola': '#60A5FA',
}

function ClienteRow({ cliente, seleccionado, onToggle, allRutas, onMover }: {
  cliente: Cliente
  seleccionado: boolean
  onToggle: () => void
  allRutas: string[]
  onMover: (ruta: string | null) => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const vc = cliente.vendedor ? (VENDEDOR_COLOR[cliente.vendedor] ?? '#A78BFA') : '#666'

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 14px',
        background: seleccionado ? 'rgba(212,175,55,0.06)' : 'transparent',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
        cursor: 'pointer', transition: 'background 0.12s',
      }}
      onClick={onToggle}
    >
      <div style={{
        width: 16, height: 16, borderRadius: 4, flexShrink: 0,
        border: `2px solid ${seleccionado ? '#D4AF37' : '#333'}`,
        background: seleccionado ? '#D4AF37' : 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {seleccionado && <Check size={10} style={{ color: '#000' }} />}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: '#eee', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {cliente.nombre_fantasia}
        </p>
        <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
          {(cliente.localidad_entrega || cliente.localidad) && (
            <span style={{ fontSize: 10, color: '#555' }}>📍 {cliente.localidad_entrega || cliente.localidad}</span>
          )}
          {cliente.vendedor && (
            <span style={{ fontSize: 10, fontWeight: 700, color: vc }}>
              {cliente.vendedor.split(' ')[0]}
            </span>
          )}
        </div>
      </div>

      <div style={{ position: 'relative', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
        <button
          onClick={() => setMenuOpen(m => !m)}
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '4px 10px', borderRadius: 8, fontSize: 11, fontWeight: 600,
            background: '#1E1E1E', border: '1px solid #333', color: '#888',
            cursor: 'pointer', whiteSpace: 'nowrap',
          }}
        >
          <MoveRight size={12} /> Mover
        </button>

        {menuOpen && (
          <>
            <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setMenuOpen(false)} />
            <div style={{
              position: 'absolute', right: 0, top: '110%', zIndex: 100,
              background: '#1A1A1A', border: '1px solid #333', borderRadius: 10,
              minWidth: 170, boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
              overflow: 'hidden',
            }}>
              <p style={{ fontSize: 10, color: '#555', padding: '8px 12px 4px', fontWeight: 700 }}>MOVER A RUTA</p>
              {allRutas.filter(r => r !== cliente.ruta_despacho).map(r => (
                <button key={r}
                  onClick={() => { onMover(r); setMenuOpen(false) }}
                  style={{
                    width: '100%', textAlign: 'left', padding: '8px 12px',
                    background: 'none', border: 'none', color: '#ddd',
                    fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'block',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#2A2A2A')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                >
                  Ruta {r}
                </button>
              ))}
              {cliente.ruta_despacho && (
                <button
                  onClick={() => { onMover(null); setMenuOpen(false) }}
                  style={{
                    width: '100%', textAlign: 'left', padding: '8px 12px',
                    background: 'none', border: 'none', color: '#F87171',
                    fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'block',
                    borderTop: '1px solid #2A2A2A',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#2A2A2A')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                >
                  Quitar de ruta
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function Toast({ message, type, onClose }: { message: string; type: 'error' | 'success'; onClose: () => void }) {
  return (
    <div style={{
      position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)',
      zIndex: 9999, display: 'flex', alignItems: 'center', gap: 10,
      padding: '12px 20px', borderRadius: 12,
      background: type === 'error' ? '#2A0A0A' : '#0A2A14',
      border: `1px solid ${type === 'error' ? '#F87171' : '#34D399'}`,
      color: type === 'error' ? '#F87171' : '#34D399',
      fontSize: 13, fontWeight: 600,
      boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
      maxWidth: 420,
    }}>
      <AlertCircle size={16} style={{ flexShrink: 0 }} />
      <span style={{ flex: 1 }}>{message}</span>
      <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 2 }}>
        <X size={14} />
      </button>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function RutasClientesClient({ clientes: initialClientes }: Props) {
  const isDesktop = useIsDesktop()

  const [clientes, setClientes] = useState(initialClientes)
  const [emptyRoutes, setEmptyRoutes] = useState<string[]>([])
  const [selectedRuta, setSelectedRuta] = useState<string | '__sin_ruta__' | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [editingRuta, setEditingRuta] = useState<string | null>(null)
  const [creando, setCreando] = useState(false)
  const [nuevaRuta, setNuevaRuta] = useState('')
  const [loading, setLoading] = useState(false)
  const [seleccionados, setSeleccionados] = useState<Set<number>>(new Set())
  const [moverDestino, setMoverDestino] = useState<string>('')
  const [toast, setToast] = useState<{ msg: string; type: 'error' | 'success' } | null>(null)

  function showToast(msg: string, type: 'error' | 'success' = 'error') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 4000)
  }

  // Derived route list
  const { rutas, sinRuta } = useMemo(() => {
    const map = new Map<string, Cliente[]>()
    const sinRuta: Cliente[] = []
    for (const c of clientes) {
      if (!c.ruta_despacho) sinRuta.push(c)
      else {
        if (!map.has(c.ruta_despacho)) map.set(c.ruta_despacho, [])
        map.get(c.ruta_despacho)!.push(c)
      }
    }
    for (const r of emptyRoutes) {
      if (!map.has(r)) map.set(r, [])
    }
    const rutas = [...map.entries()]
      .sort((a, b) => {
        const na = parseInt(a[0]), nb = parseInt(b[0])
        if (!isNaN(na) && !isNaN(nb)) return na - nb
        if (!isNaN(na)) return -1
        if (!isNaN(nb)) return 1
        return a[0].localeCompare(b[0])
      })
      .map(([nombre, clientes]) => ({ nombre, clientes }))
    return { rutas, sinRuta }
  }, [clientes, emptyRoutes])

  const allRutaNames = rutas.map(r => r.nombre)

  const clientesEnRuta = useMemo(() => {
    let list: Cliente[] = []
    if (selectedRuta === '__sin_ruta__') list = sinRuta
    else if (selectedRuta) list = rutas.find(r => r.nombre === selectedRuta)?.clientes ?? []
    if (busqueda) {
      const b = busqueda.toLowerCase()
      list = list.filter(c =>
        c.nombre_fantasia?.toLowerCase().includes(b) ||
        c.localidad?.toLowerCase().includes(b) ||
        c.localidad_entrega?.toLowerCase().includes(b) ||
        c.vendedor?.toLowerCase().includes(b)
      )
    }
    return list
  }, [selectedRuta, rutas, sinRuta, busqueda])

  function toggleSelect(id: number) {
    setSeleccionados(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function updateLocal(ids: number[], ruta: string | null) {
    setClientes(prev => prev.map(c => ids.includes(c.id) ? { ...c, ruta_despacho: ruta } : c))
    if (ruta) setEmptyRoutes(prev => prev.filter(r => r !== ruta))
  }

  // ── Handlers ────────────────────────────────────────────────────────────────
  function crearRuta() {
    const nombre = nuevaRuta.trim()
    if (!nombre) return
    if (rutas.some(r => r.nombre === nombre)) {
      showToast(`La ruta "${nombre}" ya existe`)
      return
    }
    setEmptyRoutes(prev => [...prev, nombre])
    setSelectedRuta(nombre)
    setCreando(false)
    setNuevaRuta('')
  }

  async function renombrarRuta(oldName: string, newName: string) {
    const trimmed = newName.trim()
    setEditingRuta(null)
    if (!trimmed || trimmed === oldName) return
    // Empty (local-only) route → rename locally without API call
    const isLocalOnly = emptyRoutes.includes(oldName)
    if (isLocalOnly) {
      setEmptyRoutes(prev => prev.map(r => r === oldName ? trimmed : r))
      if (selectedRuta === oldName) setSelectedRuta(trimmed)
      return
    }
    setLoading(true)
    const err = await apiRenombrar(oldName, trimmed)
    if (err) {
      showToast(`Error al renombrar: ${err}`)
    } else {
      setClientes(prev => prev.map(c =>
        c.ruta_despacho === oldName ? { ...c, ruta_despacho: trimmed } : c
      ))
      if (selectedRuta === oldName) setSelectedRuta(trimmed)
      showToast(`Renombrada a "Ruta ${trimmed}"`, 'success')
    }
    setLoading(false)
  }

  async function eliminarRuta(rutaNombre: string) {
    const count = rutas.find(r => r.nombre === rutaNombre)?.clientes.length ?? 0
    if (count === 0) {
      setEmptyRoutes(prev => prev.filter(r => r !== rutaNombre))
      if (selectedRuta === rutaNombre) setSelectedRuta(null)
      return
    }
    if (!confirm(`¿Eliminar "Ruta ${rutaNombre}"?\n${count} clientes quedarán sin ruta asignada.`)) return
    setLoading(true)
    const err = await apiEliminar(rutaNombre)
    if (err) {
      showToast(`Error al eliminar: ${err}`)
    } else {
      setClientes(prev => prev.map(c =>
        c.ruta_despacho === rutaNombre ? { ...c, ruta_despacho: null } : c
      ))
      if (selectedRuta === rutaNombre) setSelectedRuta(null)
      showToast(`Ruta "${rutaNombre}" eliminada`, 'success')
    }
    setLoading(false)
  }

  async function moverCliente(clienteId: number, ruta: string | null) {
    setLoading(true)
    const err = await apiAsignar([clienteId], ruta)
    if (err) showToast(`Error al mover: ${err}`)
    else updateLocal([clienteId], ruta)
    setLoading(false)
  }

  async function moverSeleccionados() {
    if (seleccionados.size === 0 || !moverDestino) return
    const destino = moverDestino === '__sin_ruta__' ? null : moverDestino
    setLoading(true)
    const err = await apiAsignar([...seleccionados], destino)
    if (err) {
      showToast(`Error al mover: ${err}`)
    } else {
      updateLocal([...seleccionados], destino)
      setSeleccionados(new Set())
      setMoverDestino('')
    }
    setLoading(false)
  }

  const currentRutaName = selectedRuta === '__sin_ruta__'
    ? 'Sin ruta asignada'
    : selectedRuta ? `Ruta ${selectedRuta}` : null

  // ── Render ───────────────────────────────────────────────────────────────────
  const leftPanel = (
    <div style={{
      width: isDesktop ? 268 : '100%', flexShrink: 0,
      background: '#111', border: '1px solid #222', borderRadius: 14,
      display: 'flex', flexDirection: 'column',
      maxHeight: isDesktop ? 'calc(100vh - 130px)' : 420,
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ padding: '14px 14px 10px', borderBottom: '1px solid #1E1E1E' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <h2 style={{ fontSize: 14, fontWeight: 800, color: '#fff' }}>Rutas</h2>
          <button
            onClick={() => { setCreando(true); setNuevaRuta('') }}
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '5px 10px', borderRadius: 7, fontSize: 11, fontWeight: 700,
              background: 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.25)',
              color: '#D4AF37', cursor: 'pointer',
            }}
          >
            <Plus size={12} /> Nueva
          </button>
        </div>
        <p style={{ fontSize: 10, color: '#555' }}>{rutas.length} rutas · {clientes.length} clientes</p>

        {/* Crear ruta */}
        {creando && (
          <div style={{ marginTop: 10, display: 'flex', gap: 5 }}>
            <input
              autoFocus
              value={nuevaRuta}
              onChange={e => setNuevaRuta(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); crearRuta() }
                if (e.key === 'Escape') { setCreando(false); setNuevaRuta('') }
              }}
              placeholder="Nombre de la ruta..."
              style={{
                flex: 1, background: '#1A1A1A', border: '1px solid #D4AF37',
                borderRadius: 7, padding: '6px 10px', color: '#fff', fontSize: 12, outline: 'none',
              }}
            />
            <button
              type="button"
              onClick={() => crearRuta()}
              style={{ padding: '6px 9px', borderRadius: 7, background: '#D4AF37', border: 'none', color: '#000', cursor: 'pointer' }}
            >
              <Check size={13} />
            </button>
            <button
              type="button"
              onClick={() => { setCreando(false); setNuevaRuta('') }}
              style={{ padding: '6px 9px', borderRadius: 7, background: '#1A1A1A', border: '1px solid #333', color: '#666', cursor: 'pointer' }}
            >
              <X size={13} />
            </button>
          </div>
        )}
      </div>

      {/* Lista rutas */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
        {rutas.length === 0 && (
          <p style={{ fontSize: 11, color: '#444', textAlign: 'center', padding: '16px 0' }}>
            Sin rutas — crea la primera
          </p>
        )}

        {rutas.map(r => (
          <RutaItem
            key={r.nombre}
            nombre={r.nombre}
            count={r.clientes.length}
            isSelected={selectedRuta === r.nombre}
            isEditing={editingRuta === r.nombre}
            onSelect={() => setSelectedRuta(r.nombre)}
            onEdit={() => setEditingRuta(r.nombre)}
            onSave={n => renombrarRuta(r.nombre, n)}
            onCancel={() => setEditingRuta(null)}
            onDelete={() => eliminarRuta(r.nombre)}
          />
        ))}

        {/* Sin ruta asignada */}
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '9px 12px', borderRadius: 10, marginTop: 6,
            background: selectedRuta === '__sin_ruta__' ? 'rgba(248,113,113,0.08)' : 'transparent',
            border: `1px solid ${selectedRuta === '__sin_ruta__' ? 'rgba(248,113,113,0.25)' : '#1E1E1E'}`,
            cursor: 'pointer', transition: 'all 0.12s',
          }}
          onClick={() => setSelectedRuta('__sin_ruta__')}
        >
          <MapPin size={13} style={{ color: selectedRuta === '__sin_ruta__' ? '#F87171' : '#444', flexShrink: 0 }} />
          <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: selectedRuta === '__sin_ruta__' ? '#F87171' : '#666' }}>
            Sin ruta asignada
          </span>
          <span style={{
            fontSize: 11, fontWeight: 800,
            background: sinRuta.length > 0 ? 'rgba(248,113,113,0.2)' : '#1A1A1A',
            color: sinRuta.length > 0 ? '#F87171' : '#555',
            padding: '1px 7px', borderRadius: 20,
          }}>{sinRuta.length}</span>
        </div>
      </div>

      {loading && (
        <div style={{ padding: '7px 14px', borderTop: '1px solid #1E1E1E', textAlign: 'center' }}>
          <span style={{ fontSize: 10, color: '#D4AF37' }}>⏳ Guardando...</span>
        </div>
      )}
    </div>
  )

  const rightPanel = (
    <div style={{
      flex: 1, minWidth: 0,
      background: '#111', border: '1px solid #222', borderRadius: 14,
      display: 'flex', flexDirection: 'column',
      maxHeight: isDesktop ? 'calc(100vh - 130px)' : 520,
      overflow: 'hidden',
    }}>
      {!selectedRuta ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
          <Route size={36} style={{ color: '#2A2A2A' }} />
          <p style={{ fontSize: 13, color: '#444' }}>Selecciona una ruta para ver sus clientes</p>
        </div>
      ) : (
        <>
          {/* Right header */}
          <div style={{ padding: '14px 14px 10px', borderBottom: '1px solid #1E1E1E' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
              <div>
                <h2 style={{ fontSize: 14, fontWeight: 800, color: selectedRuta === '__sin_ruta__' ? '#F87171' : '#fff' }}>
                  {currentRutaName}
                </h2>
                <p style={{ fontSize: 10, color: '#555', marginTop: 2 }}>
                  {clientesEnRuta.length} clientes
                  {seleccionados.size > 0 && <span style={{ color: '#D4AF37', marginLeft: 6 }}>· {seleccionados.size} seleccionados</span>}
                </p>
              </div>
              <button
                onClick={() => seleccionados.size > 0
                  ? setSeleccionados(new Set())
                  : setSeleccionados(new Set(clientesEnRuta.map(c => c.id)))
                }
                style={{
                  padding: '5px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                  background: seleccionados.size > 0
                    ? '#1A1A1A'
                    : selectedRuta === '__sin_ruta__'
                      ? 'rgba(248,113,113,0.12)'
                      : '#1A1A1A',
                  border: seleccionados.size > 0
                    ? '1px solid #333'
                    : selectedRuta === '__sin_ruta__'
                      ? '1px solid rgba(248,113,113,0.3)'
                      : '1px solid #333',
                  color: seleccionados.size > 0
                    ? '#888'
                    : selectedRuta === '__sin_ruta__'
                      ? '#F87171'
                      : '#888',
                  cursor: 'pointer', whiteSpace: 'nowrap',
                }}
              >
                {seleccionados.size > 0 ? 'Quitar selección' : 'Seleccionar todos'}
              </button>
            </div>

            {/* Banner de acción rápida para clientes sin ruta */}
            {selectedRuta === '__sin_ruta__' && seleccionados.size === 0 && clientesEnRuta.length > 0 && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '9px 12px', marginBottom: 10, borderRadius: 10,
                background: 'rgba(248,113,113,0.05)',
                border: '1px solid rgba(248,113,113,0.18)',
              }}>
                <AlertCircle size={13} style={{ color: '#F87171', flexShrink: 0 }} />
                <span style={{ fontSize: 11, color: '#F87171', flex: 1, fontWeight: 600 }}>
                  {clientesEnRuta.length} cliente{clientesEnRuta.length !== 1 ? 's' : ''} sin ruta — selecciona todos para asignar rápido
                </span>
                <button
                  onClick={() => setSeleccionados(new Set(clientesEnRuta.map(c => c.id)))}
                  style={{
                    padding: '5px 12px', borderRadius: 7, fontSize: 11, fontWeight: 800,
                    background: 'rgba(248,113,113,0.15)', border: '1px solid rgba(248,113,113,0.35)',
                    color: '#F87171', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                  }}
                >
                  Seleccionar todos →
                </button>
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <div style={{
                flex: 1, minWidth: 140, display: 'flex', alignItems: 'center', gap: 7,
                background: '#141414', border: '1px solid #222', borderRadius: 8, padding: '6px 11px',
              }}>
                <Search size={12} style={{ color: '#444', flexShrink: 0 }} />
                <input
                  value={busqueda}
                  onChange={e => setBusqueda(e.target.value)}
                  placeholder="Buscar..."
                  style={{ background: 'none', border: 'none', outline: 'none', color: '#fff', fontSize: 12, width: '100%' }}
                />
              </div>

              {seleccionados.size > 0 && (
                <div style={{
                  display: 'flex', gap: 6, flexWrap: 'wrap',
                  padding: selectedRuta === '__sin_ruta__' ? '8px 10px' : '0',
                  borderRadius: selectedRuta === '__sin_ruta__' ? 10 : 0,
                  background: selectedRuta === '__sin_ruta__' ? 'rgba(212,175,55,0.05)' : 'transparent',
                  border: selectedRuta === '__sin_ruta__' ? '1px solid rgba(212,175,55,0.15)' : 'none',
                  width: '100%',
                }}>
                  <select
                    value={moverDestino}
                    onChange={e => setMoverDestino(e.target.value)}
                    style={{
                      flex: 1, minWidth: 120,
                      background: '#1A1A1A', border: '1px solid #333', borderRadius: 8,
                      padding: '7px 8px', color: moverDestino ? '#fff' : '#555',
                      fontSize: 12, outline: 'none', cursor: 'pointer',
                    }}
                  >
                    <option value="">Asignar a ruta...</option>
                    {allRutaNames.filter(r => r !== selectedRuta).map(r => (
                      <option key={r} value={r}>Ruta {r}</option>
                    ))}
                    {selectedRuta !== '__sin_ruta__' && (
                      <option value="__sin_ruta__">Sin ruta</option>
                    )}
                  </select>
                  <button
                    onClick={moverSeleccionados}
                    disabled={!moverDestino || loading}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                      background: moverDestino ? 'rgba(212,175,55,0.15)' : '#1A1A1A',
                      border: moverDestino ? '1px solid rgba(212,175,55,0.3)' : '1px solid #333',
                      color: moverDestino ? '#D4AF37' : '#555',
                      cursor: moverDestino && !loading ? 'pointer' : 'not-allowed',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <ArrowRightLeft size={12} /> Asignar {seleccionados.size}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Clients */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {clientesEnRuta.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                <Users size={26} style={{ color: '#2A2A2A', margin: '0 auto 8px' }} />
                <p style={{ fontSize: 12, color: '#444' }}>
                  {busqueda
                    ? 'Sin resultados'
                    : selectedRuta !== '__sin_ruta__'
                      ? 'Sin clientes. Selecciona "Sin ruta asignada" y muéve clientes aquí.'
                      : 'Todos los clientes tienen ruta asignada ✓'}
                </p>
              </div>
            ) : clientesEnRuta.map(c => (
              <ClienteRow
                key={c.id}
                cliente={c}
                seleccionado={seleccionados.has(c.id)}
                onToggle={() => toggleSelect(c.id)}
                allRutas={allRutaNames}
                onMover={ruta => moverCliente(c.id, ruta)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )

  return (
    <div style={{ padding: '20px 20px 60px', maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: 24, fontWeight: 900, color: '#fff', letterSpacing: '-0.5px' }}>Rutas de despacho</h1>
        <p style={{ fontSize: 12, color: '#555', marginTop: 3 }}>Crea rutas, asigna y mueve clientes entre ellas</p>
      </div>

      {isDesktop ? (
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
          {leftPanel}
          {rightPanel}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {leftPanel}
          {selectedRuta && rightPanel}
        </div>
      )}

      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  )
}
