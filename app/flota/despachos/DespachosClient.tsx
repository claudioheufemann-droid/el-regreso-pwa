'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import AppHeader from '@/components/ui/AppHeader'
import { REGIONES_OPERATIVAS } from '@/lib/regiones'
import { Plus, ArrowUp, ArrowDown, Truck, Camera, Share2 } from 'lucide-react'
import type { AppUser } from '@/lib/auth'

interface PedidoPendiente {
  visita_terreno_id: string
  cliente_nombre: string
  cliente_terreno_id: string | null
  total_pedido: number
  cantidad_total: number
  completada_at: string
}

interface Entrega {
  id: string
  estado: 'entregado' | 'rechazado' | 'devuelto'
  barriles: number
  cajas_cerveza: number
  cajas_kombucha: number
  guia_url: string | null
  foto_entrega_url: string | null
  entregado_at: string
}

interface Parada {
  id: string
  secuencia: number
  eta_comprometida: string
  cantidad_pedida: number
  estado: string
  cliente: { nombre_fantasia: string } | null
  cliente_terreno: { nombre_fantasia: string } | null
  entrega?: Entrega[]
}

interface Despacho {
  id: string
  fecha: string
  region: string
  estado: string
  paradas: Parada[]
  chofer?: { nombre: string } | null
  vehiculo?: { nombre: string; patente: string | null } | null
  viaje_flota?: { barriles_vacios_devueltos: number | null; merma_declarada: string | null } | null
}

const ORANGE = '#F97316'

interface Vehiculo { id: string; nombre: string; tipo: string; patente: string | null; estado: string; km_actual: number }

function nombreParada(p: Parada): string {
  return p.cliente?.nombre_fantasia ?? p.cliente_terreno?.nombre_fantasia ?? 'Cliente'
}

function ultimaEntrega(p: Parada): Entrega | undefined {
  return [...(p.entrega ?? [])].sort((a, b) => (a.entregado_at ?? '').localeCompare(b.entregado_at ?? '')).pop()
}

function generarReporteLogistica(d: Despacho): string {
  const entregas = d.paradas.map(ultimaEntrega).filter((e): e is Entrega => !!e)
  const entregadas = entregas.filter(e => e.estado === 'entregado')
  const barriles = entregadas.reduce((s, e) => s + e.barriles, 0)
  const cajasCerveza = entregadas.reduce((s, e) => s + e.cajas_cerveza, 0)
  const cajasKombucha = entregadas.reduce((s, e) => s + e.cajas_kombucha, 0)
  const conEvidencia = entregadas.filter(e => e.guia_url && e.foto_entrega_url).length
  const pctEvidencia = entregadas.length > 0 ? Math.round((conEvidencia / entregadas.length) * 100) : 100

  let m = `🚚 *REPORTE DE DESPACHO Y RUTA - LOGÍSTICA*\n`
  m += `Repartidor: ${d.chofer?.nombre ?? '—'}\n`
  m += `Vehículo: ${d.vehiculo?.nombre ?? '—'}${d.vehiculo?.patente ? ` · ${d.vehiculo.patente}` : ''}\n\n`
  m += `📦 *TOTAL ENTREGAS DÍA:* ${entregadas.length}\n`
  m += `- Barriles Entregados: ${barriles}\n`
  m += `- Cajas Cerveza (Latas): ${cajasCerveza}\n`
  m += `- Cajas Kombucha: ${cajasKombucha}\n\n`
  m += `📸 *EVIDENCIAS:* ${pctEvidencia}% Guías y Fotos subidas a la App\n`
  m += `🔄 *BARRILES VACÍOS RECUPERADOS:* ${d.viaje_flota?.barriles_vacios_devueltos ?? 0}\n`
  if (d.viaje_flota?.merma_declarada) m += `⚠️ Merma: ${d.viaje_flota.merma_declarada}\n`
  return m
}

function ReporteWhatsAppModal({ texto, onClose }: { texto: string; onClose: () => void }) {
  const [phone, setPhone] = useState('')
  function enviar() {
    const t = phone.trim()
    if (!t) return
    const num = t.replace(/[\s\-()]/g, '').replace(/^\+?56/, '56').replace(/^(?!56)/, '56')
    window.open(`https://wa.me/${num}?text=${encodeURIComponent(texto)}`, '_blank')
    onClose()
  }
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 300 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 480, background: 'var(--surface)', borderRadius: '20px 20px 0 0', padding: 20, paddingBottom: 'max(20px, env(safe-area-inset-bottom))' }}>
        <p style={{ fontSize: 14, fontWeight: 800, color: 'var(--cream)', marginBottom: 10 }}>Enviar reporte por WhatsApp</p>
        <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 12, color: 'rgba(255,255,255,0.6)', background: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: 12, marginBottom: 12, maxHeight: 220, overflowY: 'auto' }}>{texto}</pre>
        <input
          type="tel" placeholder="Número de destino (ej: +56 9 1234 5678)"
          value={phone} onChange={e => setPhone(e.target.value)}
          style={{ width: '100%', padding: '11px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--cream)', fontSize: 13, outline: 'none', marginBottom: 10 }}
        />
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '11px 0', borderRadius: 10, border: '1px solid var(--border)', background: 'transparent', color: 'rgba(255,255,255,0.5)', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Cancelar</button>
          <button onClick={enviar} disabled={!phone.trim()} style={{ flex: 1, padding: '11px 0', borderRadius: 10, border: 'none', background: '#22C55E', color: '#052e16', fontSize: 13, fontWeight: 800, cursor: 'pointer', opacity: phone.trim() ? 1 : 0.4 }}>Enviar</button>
        </div>
      </div>
    </div>
  )
}

export default function DespachosClient({ user, vehiculos }: { user: AppUser; vehiculos: Vehiculo[] }) {
  const router = useRouter()
  const [despachos, setDespachos] = useState<Despacho[]>([])
  const [pendientes, setPendientes] = useState<PedidoPendiente[]>([])
  const [loading, setLoading] = useState(true)
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10))
  const [region, setRegion] = useState<string>(REGIONES_OPERATIVAS[0])
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set())
  const [creando, setCreando] = useState(false)
  const [reporteTexto, setReporteTexto] = useState<string | null>(null)

  // Unificación Flota+Despacho: elegir vehículo y km inicial acá mismo arma
  // el despacho Y deja el vehículo "en_uso" con un viaje de flota vinculado
  // (despachos.viaje_flota_id) — un solo paso en vez de dos pantallas.
  const vehiculosDisponibles = vehiculos.filter(v => v.estado === 'disponible')
  const [vehiculoId, setVehiculoId] = useState('')
  const [kmInicio, setKmInicio] = useState('')
  useEffect(() => {
    const v = vehiculos.find(v => v.id === vehiculoId)
    if (v) setKmInicio(String(v.km_actual ?? ''))
  }, [vehiculoId, vehiculos])

  // Paradas agregadas a mano (cliente existente buscado, o cliente nuevo
  // creado en el momento) — se suman a las que vienen de pedidos de terreno.
  interface ParadaManual { key: string; tipo: 'clientes' | 'clientes_terreno'; id: string | number; nombre: string; cantidad: number }
  const [paradasManuales, setParadasManuales] = useState<ParadaManual[]>([])
  const [showAgregarParada, setShowAgregarParada] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [resultadosBusqueda, setResultadosBusqueda] = useState<{ tipo: 'clientes' | 'clientes_terreno'; id: string | number; nombre: string; direccion: string | null }[]>([])
  const [buscando, setBuscando] = useState(false)
  const [modoNuevoCliente, setModoNuevoCliente] = useState(false)
  const [nuevoNombre, setNuevoNombre] = useState('')
  const [nuevoDireccion, setNuevoDireccion] = useState('')
  const [nuevoTelefono, setNuevoTelefono] = useState('')
  const [nuevoCanal, setNuevoCanal] = useState('')
  const [creandoCliente, setCreandoCliente] = useState(false)

  useEffect(() => {
    if (busqueda.trim().length < 2) { setResultadosBusqueda([]); return }
    setBuscando(true)
    const t = setTimeout(() => {
      fetch(`/api/logistica/clientes/buscar?q=${encodeURIComponent(busqueda.trim())}`)
        .then(r => r.json())
        .then(d => setResultadosBusqueda(Array.isArray(d) ? d : []))
        .finally(() => setBuscando(false))
    }, 300)
    return () => clearTimeout(t)
  }, [busqueda])

  function agregarParadaManual(tipo: 'clientes' | 'clientes_terreno', id: string | number, nombre: string) {
    setParadasManuales(prev => [...prev, { key: `${tipo}-${id}`, tipo, id, nombre, cantidad: 1 }])
    setBusqueda(''); setResultadosBusqueda([]); setShowAgregarParada(false)
  }

  async function crearClienteYAgregar() {
    if (!nuevoNombre.trim() || !nuevoDireccion.trim()) return
    setCreandoCliente(true)
    try {
      const res = await fetch('/api/logistica/clientes/nuevo', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre_fantasia: nuevoNombre, direccion: nuevoDireccion, telefono: nuevoTelefono, canal: nuevoCanal }),
      })
      const data = await res.json()
      if (!res.ok) { alert(data.error ?? 'Error al crear el cliente'); return }
      agregarParadaManual('clientes_terreno', data.id, data.nombre_fantasia)
      setNuevoNombre(''); setNuevoDireccion(''); setNuevoTelefono(''); setNuevoCanal(''); setModoNuevoCliente(false)
    } finally {
      setCreandoCliente(false)
    }
  }

  function quitarParadaManual(key: string) {
    setParadasManuales(prev => prev.filter(p => p.key !== key))
  }

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([
      fetch(`/api/logistica/despachos?fecha=${fecha}`).then(r => r.json()),
      fetch('/api/logistica/pedidos-pendientes').then(r => r.json()),
    ]).then(([d, p]) => {
      setDespachos(Array.isArray(d) ? d : [])
      setPendientes(Array.isArray(p) ? p : [])
    }).finally(() => setLoading(false))
  }, [fecha])

  useEffect(() => { load() }, [load])

  function toggleSeleccion(id: string) {
    setSeleccionados(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function crearDespacho() {
    const totalParadas = seleccionados.size + paradasManuales.length
    if (!totalParadas || !vehiculoId || !kmInicio) return
    setCreando(true)
    try {
      const paradasDePedidos = pendientes
        .filter(p => seleccionados.has(p.visita_terreno_id))
        .map(p => ({
          cliente_terreno_id: p.cliente_terreno_id ?? undefined,
          visita_terreno_id: p.visita_terreno_id,
          eta_comprometida: new Date(Date.now() + 4 * 3600000).toISOString(), // default: +4h, ajustable después
          cantidad_pedida: p.cantidad_total || 1,
        }))
      const paradasAgregadas = paradasManuales.map(p => ({
        cliente_id: p.tipo === 'clientes' ? p.id : undefined,
        cliente_terreno_id: p.tipo === 'clientes_terreno' ? p.id : undefined,
        eta_comprometida: new Date(Date.now() + 4 * 3600000).toISOString(),
        cantidad_pedida: p.cantidad || 1,
      }))
      const paradas = [...paradasDePedidos, ...paradasAgregadas]

      const res = await fetch('/api/logistica/despachos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fecha, region, paradas,
          chofer_id: user.id, vehiculo_id: vehiculoId, km_inicio: parseInt(kmInicio, 10),
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        alert(err.error ?? 'Error al crear el despacho')
        return
      }
      setSeleccionados(new Set())
      setParadasManuales([])
      setVehiculoId('')
      setKmInicio('')
      load()
    } finally {
      setCreando(false)
    }
  }

  async function mover(despachoId: string, paradas: Parada[], index: number, dir: -1 | 1) {
    const nuevo = [...paradas]
    const j = index + dir
    if (j < 0 || j >= nuevo.length) return
    ;[nuevo[index], nuevo[j]] = [nuevo[j], nuevo[index]]
    setDespachos(prev => prev.map(d => d.id === despachoId ? { ...d, paradas: nuevo } : d))
    await fetch(`/api/logistica/despachos/${despachoId}/paradas`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orden: nuevo.map(p => p.id) }),
    })
  }

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh' }}>
      <AppHeader eyebrow="Logística" title="Despachos" backHref="/" />

      <div style={{ maxWidth: 640, margin: '0 auto', padding: '0 16px 100px' }}>

        {/* ── Selector de fecha/región ── */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
          <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} style={inputStyle} />
          <select value={region} onChange={e => setRegion(e.target.value)} style={inputStyle}>
            {REGIONES_OPERATIVAS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>

        {/* ── Pedidos pendientes de asignar ── */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, padding: 18, marginBottom: 24 }}>
          <p style={{ fontSize: 14, fontWeight: 800, color: 'var(--cream)', marginBottom: 4 }}>Pedidos sin despacho</p>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginBottom: 12 }}>
            Selecciona los pedidos de terreno completados y arma la ruta del día
          </p>

          {loading ? (
            <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>Cargando…</p>
          ) : pendientes.length === 0 ? (
            <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>No hay pedidos pendientes de despacho.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
              {pendientes.map(p => (
                <label key={p.visita_terreno_id} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 10,
                  background: seleccionados.has(p.visita_terreno_id) ? `${ORANGE}12` : 'rgba(255,255,255,0.02)',
                  border: `1px solid ${seleccionados.has(p.visita_terreno_id) ? ORANGE+'55' : 'var(--border)'}`,
                  cursor: 'pointer',
                }}>
                  <input type="checkbox" checked={seleccionados.has(p.visita_terreno_id)} onChange={() => toggleSeleccion(p.visita_terreno_id)} />
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--cream)' }}>{p.cliente_nombre}</p>
                    <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>
                      {p.cantidad_total} unidades · ${p.total_pedido?.toLocaleString('es-CL')}
                    </p>
                  </div>
                </label>
              ))}
            </div>
          )}

          {/* ── Paradas agregadas manualmente (cliente buscado o nuevo) ── */}
          {paradasManuales.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
              {paradasManuales.map(p => (
                <div key={p.key} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 10,
                  background: `${ORANGE}12`, border: `1px solid ${ORANGE}55`,
                }}>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--cream)' }}>{p.nombre}</p>
                    <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>
                      {p.tipo === 'clientes' ? 'Cliente existente' : 'Cliente nuevo/terreno'} · agregado manualmente
                    </p>
                  </div>
                  <button onClick={() => quitarParadaManual(p.key)} style={{ background: 'none', border: 'none', color: '#FF6666', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                    Quitar
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* ── Agregar parada manual: búsqueda de cliente o creación ágil ── */}
          {!showAgregarParada ? (
            <button
              onClick={() => setShowAgregarParada(true)}
              style={{
                width: '100%', padding: '9px 0', borderRadius: 10, cursor: 'pointer', marginBottom: 12,
                border: `1px dashed ${ORANGE}66`, background: 'transparent', color: ORANGE, fontSize: 12, fontWeight: 800,
              }}
            >
              + Agregar parada
            </button>
          ) : (
            <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 12, marginBottom: 12, background: 'rgba(255,255,255,0.02)' }}>
              {!modoNuevoCliente ? (
                <>
                  <input
                    autoFocus
                    type="text" placeholder="Buscar cliente por nombre, RUT o dirección…"
                    value={busqueda}
                    onChange={e => setBusqueda(e.target.value)}
                    style={{ ...inputStyle, marginBottom: 8 }}
                  />
                  {buscando && <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginBottom: 6 }}>Buscando…</p>}
                  {resultadosBusqueda.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
                      {resultadosBusqueda.map(r => (
                        <button
                          key={`${r.tipo}-${r.id}`}
                          onClick={() => agregarParadaManual(r.tipo, r.id, r.nombre)}
                          style={{
                            textAlign: 'left', padding: '8px 10px', borderRadius: 9, cursor: 'pointer',
                            border: '1px solid var(--border)', background: 'rgba(255,255,255,0.03)',
                          }}
                        >
                          <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--cream)' }}>{r.nombre}</p>
                          {r.direccion && <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>{r.direccion}</p>}
                        </button>
                      ))}
                    </div>
                  )}
                  {busqueda.trim().length >= 2 && !buscando && resultadosBusqueda.length === 0 && (
                    <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginBottom: 8 }}>Sin resultados.</p>
                  )}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => setModoNuevoCliente(true)}
                      style={{ flex: 1, padding: '8px 0', borderRadius: 9, cursor: 'pointer', border: `1px solid ${ORANGE}55`, background: 'transparent', color: ORANGE, fontSize: 11, fontWeight: 700 }}
                    >
                      + Cliente nuevo
                    </button>
                    <button
                      onClick={() => { setShowAgregarParada(false); setBusqueda(''); setResultadosBusqueda([]) }}
                      style={{ flex: 1, padding: '8px 0', borderRadius: 9, cursor: 'pointer', border: '1px solid var(--border)', background: 'transparent', color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: 700 }}
                    >
                      Cancelar
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p style={{ fontSize: 11, fontWeight: 800, color: 'var(--cream)', marginBottom: 8 }}>Cliente nuevo en ruta</p>
                  <input type="text" placeholder="Nombre comercial *" value={nuevoNombre} onChange={e => setNuevoNombre(e.target.value)} style={{ ...inputStyle, marginBottom: 6 }} />
                  <input type="text" placeholder="Dirección *" value={nuevoDireccion} onChange={e => setNuevoDireccion(e.target.value)} style={{ ...inputStyle, marginBottom: 6 }} />
                  <input type="text" placeholder="Teléfono" value={nuevoTelefono} onChange={e => setNuevoTelefono(e.target.value)} style={{ ...inputStyle, marginBottom: 6 }} />
                  <input type="text" placeholder="Canal (ej: Bar, Minimarket)" value={nuevoCanal} onChange={e => setNuevoCanal(e.target.value)} style={{ ...inputStyle, marginBottom: 8 }} />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={crearClienteYAgregar}
                      disabled={creandoCliente || !nuevoNombre.trim() || !nuevoDireccion.trim()}
                      style={{
                        flex: 1, padding: '8px 0', borderRadius: 9, cursor: 'pointer', border: 'none',
                        background: `linear-gradient(135deg, ${ORANGE}, #C2410C)`, color: '#080808', fontSize: 11, fontWeight: 800,
                        opacity: creandoCliente || !nuevoNombre.trim() || !nuevoDireccion.trim() ? 0.4 : 1,
                      }}
                    >
                      {creandoCliente ? 'Creando…' : 'Crear y agregar'}
                    </button>
                    <button
                      onClick={() => setModoNuevoCliente(false)}
                      style={{ flex: 1, padding: '8px 0', borderRadius: 9, cursor: 'pointer', border: '1px solid var(--border)', background: 'transparent', color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: 700 }}
                    >
                      Volver
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Iniciar salida: vehículo + km — vincula el despacho a un viaje de flota */}
          {(seleccionados.size > 0 || paradasManuales.length > 0) && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <select value={vehiculoId} onChange={e => setVehiculoId(e.target.value)} style={{ ...inputStyle, flex: 1.4 }}>
                <option value="">Elegir vehículo…</option>
                {vehiculosDisponibles.map(v => (
                  <option key={v.id} value={v.id}>{v.nombre}{v.patente ? ` · ${v.patente}` : ''}</option>
                ))}
              </select>
              <input
                type="number" placeholder="Km inicial" value={kmInicio}
                onChange={e => setKmInicio(e.target.value)}
                style={{ ...inputStyle, flex: 1 }}
              />
            </div>
          )}
          {(seleccionados.size > 0 || paradasManuales.length > 0) && vehiculosDisponibles.length === 0 && (
            <p style={{ fontSize: 11, color: '#FF6666', marginBottom: 12 }}>No hay vehículos disponibles ahora mismo.</p>
          )}

          <button
            onClick={crearDespacho}
            disabled={!(seleccionados.size + paradasManuales.length) || !vehiculoId || !kmInicio || creando}
            style={{
              width: '100%', padding: '12px 0', borderRadius: 12, border: 'none',
              cursor: (seleccionados.size + paradasManuales.length) && vehiculoId && kmInicio ? 'pointer' : 'default',
              background: `linear-gradient(135deg, ${ORANGE}, #C2410C)`, color: '#080808', fontSize: 13, fontWeight: 900,
              opacity: (seleccionados.size + paradasManuales.length) && vehiculoId && kmInicio && !creando ? 1 : 0.4,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            <Truck size={14} /> {creando ? 'Iniciando salida…' : `Iniciar salida con ${seleccionados.size + paradasManuales.length} pedido${seleccionados.size + paradasManuales.length === 1 ? '' : 's'}`}
          </button>
        </div>

        {/* ── Despachos del día ── */}
        <p style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10 }}>
          Ruta del {new Date(fecha + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'long' })}
        </p>

        {despachos.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'rgba(255,255,255,0.3)' }}>
            <Truck size={28} style={{ marginBottom: 8, opacity: 0.4 }} />
            <p style={{ fontSize: 13 }}>Sin despachos armados para esta fecha.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {despachos.map(d => (
              <div key={d.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <p style={{ fontSize: 12, fontWeight: 800, color: ORANGE }}>{d.region} · {d.paradas.length} paradas</p>
                  <button
                    onClick={() => setReporteTexto(generarReporteLogistica(d))}
                    style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'rgba(255,255,255,0.5)', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}
                  >
                    <Share2 size={11} /> Reporte
                  </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {d.paradas.map((p, i) => (
                    <div key={p.id} style={{
                      display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 10,
                      background: p.estado !== 'pendiente' ? 'rgba(74,222,128,0.06)' : 'rgba(255,255,255,0.02)',
                    }}>
                      <span style={{ fontSize: 11, fontWeight: 800, color: 'rgba(255,255,255,0.3)', width: 18 }}>{i + 1}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--cream)' }}>{nombreParada(p)}</p>
                        <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>
                          {p.estado === 'pendiente' ? `ETA ${new Date(p.eta_comprometida).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}` : p.estado}
                        </p>
                      </div>
                      {p.estado === 'pendiente' && (
                        <>
                          <button onClick={() => mover(d.id, d.paradas, i, -1)} style={iconBtnStyle}><ArrowUp size={12} /></button>
                          <button onClick={() => mover(d.id, d.paradas, i, 1)} style={iconBtnStyle}><ArrowDown size={12} /></button>
                          <button onClick={() => router.push(`/flota/despachos/${d.id}/entregar?parada=${p.id}`)} style={{ ...iconBtnStyle, color: ORANGE, borderColor: `${ORANGE}55` }}>
                            <Camera size={12} />
                          </button>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {reporteTexto && <ReporteWhatsAppModal texto={reporteTexto} onClose={() => setReporteTexto(null)} />}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  flex: 1, padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)',
  background: 'var(--surface2)', color: 'var(--cream)', fontSize: 13, outline: 'none', colorScheme: 'dark',
}
const iconBtnStyle: React.CSSProperties = {
  width: 28, height: 28, borderRadius: 8, border: '1px solid var(--border)', background: 'transparent',
  color: 'rgba(255,255,255,0.5)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
}
