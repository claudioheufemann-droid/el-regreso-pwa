'use client'

import { useState, useMemo, useCallback } from 'react'
import {
  Plus, Pencil, Trash2, Check, X, Search, MapPin,
  Route, Users, ChevronRight, MoveRight, ArrowRightLeft,
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

const VENDEDOR_COLOR: Record<string, string> = {
  'Javier Badilla': '#F59E0B',
  'Carlos Urrejola': '#60A5FA',
}

function vendColor(v: string | null) {
  return v ? (VENDEDOR_COLOR[v] ?? '#A78BFA') : '#666'
}

// ── API helpers ─────────────────────────────────────────────────────────────
async function apiRenombrar(old_ruta: string, new_ruta: string) {
  const r = await fetch('/api/clientes/rutas', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ old_ruta, new_ruta }),
  })
  if (!r.ok) throw new Error('Error al renombrar')
}

async function apiAsignar(cliente_ids: number[], ruta: string | null) {
  const r = await fetch('/api/clientes/rutas', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cliente_ids, ruta }),
  })
  if (!r.ok) throw new Error('Error al asignar')
}

async function apiEliminar(ruta: string) {
  const r = await fetch('/api/clientes/rutas', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ruta }),
  })
  if (!r.ok) throw new Error('Error al eliminar')
}

// ── Inline editable route name ───────────────────────────────────────────────
function EditableRutaNombre({
  nombre,
  onSave,
  onCancel,
}: {
  nombre: string
  onSave: (n: string) => void
  onCancel: () => void
}) {
  const [val, setVal] = useState(nombre)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
      <input
        autoFocus
        value={val}
        onChange={e => setVal(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') onSave(val)
          if (e.key === 'Escape') onCancel()
        }}
        style={{
          flex: 1, background: '#0D0D0D', border: '1px solid #D4AF37',
          borderRadius: 6, padding: '3px 8px', color: '#fff', fontSize: 13,
          fontWeight: 700, outline: 'none',
        }}
      />
      <button
        onClick={() => onSave(val)}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#34D399', padding: 2 }}
      >
        <Check size={15} />
      </button>
      <button
        onClick={onCancel}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#666', padding: 2 }}
      >
        <X size={15} />
      </button>
    </div>
  )
}

// ── Single client row in the right panel ─────────────────────────────────────
function ClienteRow({
  cliente,
  seleccionado,
  onToggle,
  allRutas,
  onMover,
}: {
  cliente: Cliente
  seleccionado: boolean
  onToggle: () => void
  allRutas: string[]
  onMover: (ruta: string | null) => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 14px',
        background: seleccionado ? 'rgba(212,175,55,0.06)' : 'transparent',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
        cursor: 'pointer',
        transition: 'background 0.12s',
      }}
      onClick={onToggle}
    >
      {/* Checkbox */}
      <div style={{
        width: 16, height: 16, borderRadius: 4, flexShrink: 0,
        border: `2px solid ${seleccionado ? '#D4AF37' : '#333'}`,
        background: seleccionado ? '#D4AF37' : 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {seleccionado && <Check size={10} style={{ color: '#000' }} />}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: '#eee', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {cliente.nombre_fantasia}
        </p>
        <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
          {(cliente.localidad_entrega || cliente.localidad) && (
            <span style={{ fontSize: 10, color: '#555' }}>
              📍 {cliente.localidad_entrega || cliente.localidad}
            </span>
          )}
          {cliente.vendedor && (
            <span style={{ fontSize: 10, fontWeight: 700, color: vendColor(cliente.vendedor) }}>
              {cliente.vendedor.split(' ')[0]}
            </span>
          )}
        </div>
      </div>

      {/* Move dropdown */}
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
          <div style={{
            position: 'absolute', right: 0, top: '110%', zIndex: 100,
            background: '#1A1A1A', border: '1px solid #333', borderRadius: 10,
            minWidth: 160, boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            overflow: 'hidden',
          }}>
            <p style={{ fontSize: 10, color: '#555', padding: '8px 12px 4px', fontWeight: 700 }}>MOVER A RUTA</p>
            {allRutas.filter(r => r !== cliente.ruta_despacho).map(r => (
              <button
                key={r}
                onClick={() => { onMover(r); setMenuOpen(false) }}
                style={{
                  width: '100%', textAlign: 'left', padding: '8px 12px',
                  background: 'none', border: 'none', color: '#ddd',
                  fontSize: 13, fontWeight: 600, cursor: 'pointer',
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
                  fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  borderTop: '1px solid #2A2A2A',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = '#2A2A2A')}
                onMouseLeave={e => (e.currentTarget.style.background = 'none')}
              >
                Quitar de ruta
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main component ───────────────────────────────────────────────────────────
export default function RutasClientesClient({ clientes: initialClientes }: Props) {
  const isDesktop = useIsDesktop()

  const [clientes, setClientes] = useState(initialClientes)
  const [selectedRuta, setSelectedRuta] = useState<string | '__sin_ruta__' | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [editingRuta, setEditingRuta] = useState<string | null>(null)
  const [creando, setCreando] = useState(false)
  const [nuevaRuta, setNuevaRuta] = useState('')
  const [loading, setLoading] = useState(false)
  const [seleccionados, setSeleccionados] = useState<Set<number>>(new Set())
  const [moverDestino, setMoverDestino] = useState<string>('')

  // Build route list from local state
  const { rutas, sinRuta } = useMemo(() => {
    const map = new Map<string, Cliente[]>()
    const sinRuta: Cliente[] = []
    for (const c of clientes) {
      if (!c.ruta_despacho) { sinRuta.push(c) }
      else {
        if (!map.has(c.ruta_despacho)) map.set(c.ruta_despacho, [])
        map.get(c.ruta_despacho)!.push(c)
      }
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
  }, [clientes])

  const allRutaNames = rutas.map(r => r.nombre)

  // Clients visible in right panel
  const clientesEnRuta = useMemo(() => {
    let list: Cliente[]
    if (selectedRuta === '__sin_ruta__') list = sinRuta
    else if (selectedRuta) list = rutas.find(r => r.nombre === selectedRuta)?.clientes ?? []
    else list = []
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

  function selectAll() {
    setSeleccionados(new Set(clientesEnRuta.map(c => c.id)))
  }

  function clearSelection() {
    setSeleccionados(new Set())
  }

  // Local state update helper
  function updateRutaLocal(ids: number[], ruta: string | null) {
    setClientes(prev => prev.map(c => ids.includes(c.id) ? { ...c, ruta_despacho: ruta } : c))
  }

  // Move single client
  async function moverCliente(clienteId: number, ruta: string | null) {
    setLoading(true)
    try {
      await apiAsignar([clienteId], ruta)
      updateRutaLocal([clienteId], ruta)
    } catch { alert('Error al mover cliente') }
    finally { setLoading(false) }
  }

  // Move selected clients
  async function moverSeleccionados() {
    if (seleccionados.size === 0 || !moverDestino) return
    const destino = moverDestino === '__sin_ruta__' ? null : moverDestino
    setLoading(true)
    try {
      await apiAsignar([...seleccionados], destino)
      updateRutaLocal([...seleccionados], destino)
      setSeleccionados(new Set())
      setMoverDestino('')
      if (destino === null && selectedRuta !== '__sin_ruta__') {
        // Clients moved to "sin ruta" — stay on current route view (they'll disappear from list)
      }
    } catch { alert('Error al mover clientes') }
    finally { setLoading(false) }
  }

  // Rename route
  async function renombrarRuta(oldName: string, newName: string) {
    if (!newName.trim() || newName.trim() === oldName) { setEditingRuta(null); return }
    setLoading(true)
    try {
      await apiRenombrar(oldName, newName.trim())
      setClientes(prev => prev.map(c =>
        c.ruta_despacho === oldName ? { ...c, ruta_despacho: newName.trim() } : c
      ))
      if (selectedRuta === oldName) setSelectedRuta(newName.trim())
    } catch { alert('Error al renombrar ruta') }
    finally { setLoading(false); setEditingRuta(null) }
  }

  // Delete route
  async function eliminarRuta(rutaNombre: string) {
    const count = rutas.find(r => r.nombre === rutaNombre)?.clientes.length ?? 0
    if (!confirm(`¿Eliminar "Ruta ${rutaNombre}"?\nLos ${count} clientes quedarán sin ruta asignada.`)) return
    setLoading(true)
    try {
      await apiEliminar(rutaNombre)
      setClientes(prev => prev.map(c =>
        c.ruta_despacho === rutaNombre ? { ...c, ruta_despacho: null } : c
      ))
      if (selectedRuta === rutaNombre) setSelectedRuta(null)
    } catch { alert('Error al eliminar ruta') }
    finally { setLoading(false) }
  }

  // Create new route (just a name — clients can be assigned next)
  async function crearRuta() {
    if (!nuevaRuta.trim()) return
    // "Creating" a route just means it's available as a destination
    // We don't need to persist it until clients are assigned
    // But we can show it in the list by selecting it (even if empty)
    // Actually let's just close the input and let user assign clients
    setSelectedRuta(nuevaRuta.trim())
    setCreando(false)
    setNuevaRuta('')
    // Add it to the virtual list (no clientes yet) by forcing a fake entry
    // We do this by updating the local "routes" — but since we derive from clientes,
    // an empty route won't appear. We'll just select it and show an empty panel.
    // The user can then pick clients from "Sin ruta" and move them here.
    alert(`Ruta "${nuevaRuta.trim()}" lista. Ahora selecciona clientes de "Sin ruta" y asígnalos a esta ruta.`)
  }

  // ── Route list item ────────────────────────────────────────────────────────
  function RutaItem({ nombre, count, isSelected }: { nombre: string; count: number; isSelected: boolean }) {
    const isEditing = editingRuta === nombre
    return (
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 14px',
          borderRadius: 10,
          background: isSelected ? 'rgba(212,175,55,0.1)' : 'transparent',
          border: `1px solid ${isSelected ? 'rgba(212,175,55,0.3)' : 'transparent'}`,
          cursor: 'pointer',
          marginBottom: 2,
          transition: 'all 0.12s',
        }}
        onClick={() => !isEditing && setSelectedRuta(nombre)}
      >
        <Route size={14} style={{ color: isSelected ? '#D4AF37' : '#444', flexShrink: 0 }} />

        {isEditing ? (
          <EditableRutaNombre
            nombre={nombre}
            onSave={n => renombrarRuta(nombre, n)}
            onCancel={() => setEditingRuta(null)}
          />
        ) : (
          <>
            <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: isSelected ? '#D4AF37' : '#ccc' }}>
              Ruta {nombre}
            </span>
            <span style={{
              fontSize: 11, fontWeight: 800, color: '#fff',
              background: isSelected ? 'rgba(212,175,55,0.2)' : '#2A2A2A',
              padding: '1px 7px', borderRadius: 20,
            }}>{count}</span>

            {/* Actions — only visible on hover via group */}
            <div style={{ display: 'flex', gap: 2, opacity: isSelected ? 1 : 0.4 }}>
              <button
                onClick={e => { e.stopPropagation(); setEditingRuta(nombre) }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#666', padding: 3, borderRadius: 4 }}
                title="Renombrar ruta"
                onMouseEnter={e => (e.currentTarget.style.color = '#D4AF37')}
                onMouseLeave={e => (e.currentTarget.style.color = '#666')}
              >
                <Pencil size={12} />
              </button>
              <button
                onClick={e => { e.stopPropagation(); eliminarRuta(nombre) }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#666', padding: 3, borderRadius: 4 }}
                title="Eliminar ruta"
                onMouseEnter={e => (e.currentTarget.style.color = '#F87171')}
                onMouseLeave={e => (e.currentTarget.style.color = '#666')}
              >
                <Trash2 size={12} />
              </button>
            </div>
          </>
        )}
      </div>
    )
  }

  // ── Left panel: route list ─────────────────────────────────────────────────
  const LeftPanel = (
    <div style={{
      width: isDesktop ? 280 : '100%',
      flexShrink: 0,
      background: '#0F0F0F',
      border: isDesktop ? '1px solid #1E1E1E' : 'none',
      borderRadius: isDesktop ? 16 : 0,
      display: 'flex', flexDirection: 'column',
      height: isDesktop ? 'calc(100vh - 120px)' : 'auto',
      overflow: 'hidden',
    }}>
      {/* Panel header */}
      <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid #1A1A1A' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ fontSize: 15, fontWeight: 800, color: '#fff' }}>Rutas de despacho</h2>
            <p style={{ fontSize: 11, color: '#555', marginTop: 2 }}>
              {rutas.length} rutas · {clientes.length} clientes
            </p>
          </div>
          <button
            onClick={() => { setCreando(true); setNuevaRuta('') }}
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700,
              background: 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.25)',
              color: '#D4AF37', cursor: 'pointer',
            }}
          >
            <Plus size={13} /> Nueva
          </button>
        </div>

        {/* New route input */}
        {creando && (
          <div style={{ marginTop: 10, display: 'flex', gap: 6 }}>
            <input
              autoFocus
              value={nuevaRuta}
              onChange={e => setNuevaRuta(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') crearRuta(); if (e.key === 'Escape') setCreando(false) }}
              placeholder="Nombre de ruta..."
              style={{
                flex: 1, background: '#1A1A1A', border: '1px solid #D4AF37', borderRadius: 8,
                padding: '7px 10px', color: '#fff', fontSize: 12, outline: 'none',
              }}
            />
            <button
              onClick={crearRuta}
              style={{ padding: '7px 10px', borderRadius: 8, background: '#D4AF37', border: 'none', color: '#000', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
            >
              <Check size={13} />
            </button>
            <button
              onClick={() => setCreando(false)}
              style={{ padding: '7px 10px', borderRadius: 8, background: '#1A1A1A', border: '1px solid #333', color: '#666', fontSize: 12, cursor: 'pointer' }}
            >
              <X size={13} />
            </button>
          </div>
        )}
      </div>

      {/* Route list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 10px' }}>
        {rutas.map(r => (
          <RutaItem key={r.nombre} nombre={r.nombre} count={r.clientes.length} isSelected={selectedRuta === r.nombre} />
        ))}

        {rutas.length === 0 && (
          <p style={{ fontSize: 12, color: '#444', textAlign: 'center', padding: '20px 0' }}>
            No hay rutas creadas aún
          </p>
        )}

        {/* Sin ruta asignada */}
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 14px', borderRadius: 10, marginTop: 8,
            background: selectedRuta === '__sin_ruta__' ? 'rgba(248,113,113,0.08)' : 'transparent',
            border: `1px solid ${selectedRuta === '__sin_ruta__' ? 'rgba(248,113,113,0.25)' : 'transparent'}`,
            cursor: 'pointer', transition: 'all 0.12s',
          }}
          onClick={() => setSelectedRuta('__sin_ruta__')}
        >
          <MapPin size={14} style={{ color: selectedRuta === '__sin_ruta__' ? '#F87171' : '#444', flexShrink: 0 }} />
          <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: selectedRuta === '__sin_ruta__' ? '#F87171' : '#666' }}>
            Sin ruta asignada
          </span>
          <span style={{
            fontSize: 11, fontWeight: 800, color: '#fff',
            background: sinRuta.length > 0 ? 'rgba(248,113,113,0.2)' : '#2A2A2A',
            padding: '1px 7px', borderRadius: 20,
          }}>{sinRuta.length}</span>
        </div>
      </div>

      {/* Loading indicator */}
      {loading && (
        <div style={{ padding: '10px 16px', borderTop: '1px solid #1A1A1A', textAlign: 'center' }}>
          <span style={{ fontSize: 11, color: '#D4AF37' }}>⏳ Guardando...</span>
        </div>
      )}
    </div>
  )

  // ── Right panel: clients in selected route ─────────────────────────────────
  const currentRutaName = selectedRuta === '__sin_ruta__'
    ? 'Sin ruta asignada'
    : selectedRuta
      ? `Ruta ${selectedRuta}`
      : null

  const RightPanel = (
    <div style={{
      flex: 1,
      background: '#0F0F0F',
      border: isDesktop ? '1px solid #1E1E1E' : 'none',
      borderRadius: isDesktop ? 16 : 0,
      display: 'flex', flexDirection: 'column',
      height: isDesktop ? 'calc(100vh - 120px)' : 'auto',
      overflow: 'hidden',
      minWidth: 0,
    }}>
      {!selectedRuta ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: '#333' }}>
          <Route size={40} style={{ opacity: 0.3 }} />
          <p style={{ fontSize: 14, color: '#444' }}>Selecciona una ruta para ver sus clientes</p>
        </div>
      ) : (
        <>
          {/* Right panel header */}
          <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid #1A1A1A' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
              <div>
                <h2 style={{ fontSize: 15, fontWeight: 800, color: '#fff' }}>
                  {currentRutaName}
                </h2>
                <p style={{ fontSize: 11, color: '#555', marginTop: 2 }}>
                  {clientesEnRuta.length} clientes
                  {seleccionados.size > 0 && (
                    <span style={{ color: '#D4AF37', marginLeft: 8 }}>· {seleccionados.size} seleccionados</span>
                  )}
                </p>
              </div>

              {/* Select all / clear */}
              <div style={{ display: 'flex', gap: 6 }}>
                {seleccionados.size > 0 ? (
                  <button
                    onClick={clearSelection}
                    style={{ padding: '5px 10px', borderRadius: 7, fontSize: 11, fontWeight: 700, background: '#1A1A1A', border: '1px solid #333', color: '#888', cursor: 'pointer' }}
                  >
                    Quitar selección
                  </button>
                ) : (
                  <button
                    onClick={selectAll}
                    style={{ padding: '5px 10px', borderRadius: 7, fontSize: 11, fontWeight: 700, background: '#1A1A1A', border: '1px solid #333', color: '#888', cursor: 'pointer' }}
                  >
                    Seleccionar todos
                  </button>
                )}
              </div>
            </div>

            {/* Search */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <div style={{
                flex: 1, display: 'flex', alignItems: 'center', gap: 8,
                background: '#141414', border: '1px solid #222', borderRadius: 9, padding: '7px 12px',
              }}>
                <Search size={13} style={{ color: '#444', flexShrink: 0 }} />
                <input
                  value={busqueda}
                  onChange={e => setBusqueda(e.target.value)}
                  placeholder="Buscar en esta ruta..."
                  style={{ background: 'none', border: 'none', outline: 'none', color: '#fff', fontSize: 12, width: '100%' }}
                />
              </div>

              {/* Bulk move */}
              {seleccionados.size > 0 && (
                <div style={{ display: 'flex', gap: 6 }}>
                  <select
                    value={moverDestino}
                    onChange={e => setMoverDestino(e.target.value)}
                    style={{
                      background: '#1A1A1A', border: '1px solid #333', borderRadius: 9,
                      padding: '7px 10px', color: moverDestino ? '#fff' : '#555',
                      fontSize: 12, outline: 'none', cursor: 'pointer',
                    }}
                  >
                    <option value="">Mover a ruta...</option>
                    {allRutaNames
                      .filter(r => r !== selectedRuta)
                      .map(r => <option key={r} value={r}>Ruta {r}</option>)
                    }
                    {selectedRuta !== '__sin_ruta__' && (
                      <option value="__sin_ruta__">Sin ruta</option>
                    )}
                  </select>
                  <button
                    onClick={moverSeleccionados}
                    disabled={!moverDestino || loading}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      padding: '7px 14px', borderRadius: 9, fontSize: 12, fontWeight: 700,
                      background: moverDestino ? 'rgba(212,175,55,0.15)' : '#1A1A1A',
                      border: moverDestino ? '1px solid rgba(212,175,55,0.3)' : '1px solid #333',
                      color: moverDestino ? '#D4AF37' : '#555',
                      cursor: moverDestino && !loading ? 'pointer' : 'not-allowed',
                    }}
                  >
                    <ArrowRightLeft size={13} /> Mover ({seleccionados.size})
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Client list */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {clientesEnRuta.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: '#333' }}>
                <Users size={28} style={{ margin: '0 auto 8px', opacity: 0.3 }} />
                <p style={{ fontSize: 13, color: '#444' }}>
                  {busqueda ? 'Sin resultados para esa búsqueda' : 'No hay clientes en esta ruta'}
                </p>
              </div>
            ) : (
              clientesEnRuta.map(c => (
                <ClienteRow
                  key={c.id}
                  cliente={c}
                  seleccionado={seleccionados.has(c.id)}
                  onToggle={() => toggleSelect(c.id)}
                  allRutas={allRutaNames}
                  onMover={ruta => moverCliente(c.id, ruta)}
                />
              ))
            )}
          </div>
        </>
      )}
    </div>
  )

  // ── Page layout ────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '20px 20px 40px', maxWidth: 1400, margin: '0 auto' }}>
      {/* Page header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 26, fontWeight: 900, color: '#fff', letterSpacing: '-0.5px' }}>
          Rutas de despacho
        </h1>
        <p style={{ fontSize: 13, color: '#555', marginTop: 3 }}>
          Crea, edita y asigna clientes a rutas de despacho
        </p>
      </div>

      {/* Two-panel layout on desktop, stacked on mobile */}
      {isDesktop ? (
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
          {LeftPanel}
          {RightPanel}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {LeftPanel}
          {selectedRuta && (
            <div style={{ marginTop: 8 }}>
              {RightPanel}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
