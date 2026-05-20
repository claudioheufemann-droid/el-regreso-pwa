'use client'

import { useState } from 'react'
import { Plus, Trash2, Zap, MapPin, ExternalLink, Save, ChevronDown, CheckCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

const F = '#3B82F6'
const F_DIM = 'rgba(59,130,246,0.12)'
const F_BORDER = 'rgba(59,130,246,0.28)'
const T = '#D4AF37'

interface Vehiculo { id: string; nombre: string; tipo: string; patente: string | null }
interface Parada { id?: string; orden: number; cliente_nombre: string; direccion: string; lat: number | null; lng: number | null; completada: boolean }
interface Ruta { id: string; nombre: string | null; vehiculo_id: string; fecha: string; estado: string; km_teoricos: number | null; ruta_paradas: Parada[] }

interface Props { vehiculos: Vehiculo[]; rutas: Ruta[] }

function haversine(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371, dLat = (lat2 - lat1) * Math.PI / 180, dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function optimizarRuta(paradas: Parada[]): Parada[] {
  const withCoords = paradas.filter(p => p.lat && p.lng)
  const withoutCoords = paradas.filter(p => !p.lat || !p.lng)
  if (withCoords.length === 0) return paradas
  // Valdivia center as origin
  let curLat = -39.8196, curLng = -73.2452
  const remaining = [...withCoords]
  const ordered: Parada[] = []
  while (remaining.length > 0) {
    let minDist = Infinity, minIdx = 0
    for (let i = 0; i < remaining.length; i++) {
      const d = haversine(curLat, curLng, remaining[i].lat!, remaining[i].lng!)
      if (d < minDist) { minDist = d; minIdx = i }
    }
    ordered.push(remaining.splice(minIdx, 1)[0])
    curLat = ordered.at(-1)!.lat!; curLng = ordered.at(-1)!.lng!
  }
  return [...ordered, ...withoutCoords].map((p, i) => ({ ...p, orden: i + 1 }))
}

function estimarKm(paradas: Parada[]): number {
  const withCoords = paradas.filter(p => p.lat && p.lng)
  let total = 0, prevLat = -39.8196, prevLng = -73.2452
  for (const p of withCoords) {
    total += haversine(prevLat, prevLng, p.lat!, p.lng!)
    prevLat = p.lat!; prevLng = p.lng!
  }
  // Return km + 10% margin for road factor
  total += haversine(prevLat, prevLng, -39.8196, -73.2452) // back to origin
  return Math.round(total * 1.35)
}

async function geocodificar(direccion: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const q = encodeURIComponent(direccion + ', Valdivia, Chile')
    const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`, {
      headers: { 'Accept-Language': 'es', 'User-Agent': 'ElRegresoFlota/1.0' }
    })
    const data = await res.json()
    if (!data[0]) return null
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
  } catch { return null }
}

function generarURLGoogleMaps(paradas: Parada[]): string {
  const origin = encodeURIComponent('El Regreso Beer, Valdivia, Chile')
  const waypoints = paradas.map(p => encodeURIComponent(p.direccion + ', Valdivia, Chile'))
  return `https://www.google.com/maps/dir/${origin}/${waypoints.join('/')}/${origin}`
}

export default function RutasClient({ vehiculos, rutas }: Props) {
  const supabase = createClient()
  const [tab, setTab] = useState<'nueva' | 'historial'>('nueva')
  const [vehiculoId, setVehiculoId] = useState('')
  const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0])
  const [nombreRuta, setNombreRuta] = useState('')
  const [paradas, setParadas] = useState<Parada[]>([])
  const [geocodificando, setGeocodificando] = useState(false)
  const [optimizando, setOptimizando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [kmEst, setKmEst] = useState<number | null>(null)
  const [rutaGuardada, setRutaGuardada] = useState(false)

  function agregarParada() {
    setParadas(prev => [...prev, { orden: prev.length + 1, cliente_nombre: '', direccion: '', lat: null, lng: null, completada: false }])
  }

  function actualizarParada(idx: number, campo: 'cliente_nombre' | 'direccion', valor: string) {
    setParadas(prev => prev.map((p, i) => i === idx ? { ...p, [campo]: valor } : p))
  }

  function eliminarParada(idx: number) {
    setParadas(prev => prev.filter((_, i) => i !== idx).map((p, i) => ({ ...p, orden: i + 1 })))
  }

  async function geocodificarTodas() {
    setGeocodificando(true)
    const updated = await Promise.all(
      paradas.map(async p => {
        if (!p.direccion.trim() || (p.lat && p.lng)) return p
        const coords = await geocodificar(p.direccion)
        return coords ? { ...p, ...coords } : p
      })
    )
    setParadas(updated)
    setGeocodificando(false)
  }

  async function optimizar() {
    setOptimizando(true)
    await geocodificarTodas()
    setParadas(prev => {
      const opt = optimizarRuta(prev)
      setKmEst(estimarKm(opt))
      return opt
    })
    setOptimizando(false)
  }

  async function guardar() {
    if (!vehiculoId || paradas.length === 0) return
    setGuardando(true)
    try {
      const { data: ruta } = await supabase.from('rutas_reparto').insert({
        vehiculo_id: vehiculoId,
        nombre: nombreRuta || `Reparto ${fecha}`,
        fecha,
        km_teoricos: kmEst,
        estado: 'pendiente',
      }).select('id').single()

      if (ruta) {
        await supabase.from('ruta_paradas').insert(
          paradas.map(p => ({ ruta_id: ruta.id, orden: p.orden, cliente_nombre: p.cliente_nombre, direccion: p.direccion, lat: p.lat, lng: p.lng }))
        )
      }
      setRutaGuardada(true)
      setTimeout(() => { setParadas([]); setNombreRuta(''); setKmEst(null); setRutaGuardada(false) }, 2000)
    } finally {
      setGuardando(false)
    }
  }

  const puedeOptimizar = paradas.some(p => p.direccion.trim())
  const puedeGuardar = vehiculoId && paradas.length > 0 && paradas.every(p => p.cliente_nombre && p.direccion)

  return (
    <div style={{ padding: '28px 24px', maxWidth: 800 }}>
      <h1 style={{ fontSize: 24, fontWeight: 900, color: 'var(--cream)', marginBottom: 24, letterSpacing: '-0.5px' }}>Planificación de Rutas</h1>

      {/* Tabs */}
      <div style={{ display: 'flex', background: '#1C1C1C', borderRadius: 12, padding: 4, gap: 4, marginBottom: 24 }}>
        {(['nueva', 'historial'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ flex: 1, padding: '10px', borderRadius: 9, border: 'none', cursor: 'pointer', background: tab === t ? F : 'transparent', color: tab === t ? '#fff' : 'var(--muted)', fontSize: 13, fontWeight: 700 }}>
            {t === 'nueva' ? '+ Nueva Ruta' : 'Historial'}
          </button>
        ))}
      </div>

      {tab === 'nueva' && (
        <div>
          {/* Cabecera de la ruta */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div>
              <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 6 }}>Vehículo *</label>
              <select value={vehiculoId} onChange={e => setVehiculoId(e.target.value)} style={{ width: '100%', padding: '11px 12px', borderRadius: 10, background: '#1C1C1C', border: `1px solid ${vehiculoId ? F_BORDER : 'rgba(255,255,255,0.08)'}`, color: vehiculoId ? '#F4EEDF' : 'var(--muted)', fontSize: 14, outline: 'none' }}>
                <option value="">Seleccionar…</option>
                {vehiculos.map(v => <option key={v.id} value={v.id}>{v.nombre}{v.patente ? ` · ${v.patente}` : ''}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 6 }}>Fecha</label>
              <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} style={{ width: '100%', padding: '11px 12px', borderRadius: 10, background: '#1C1C1C', border: '1px solid rgba(255,255,255,0.08)', color: '#F4EEDF', fontSize: 14, outline: 'none' }} />
            </div>
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 6 }}>Nombre de la ruta (opcional)</label>
            <input value={nombreRuta} onChange={e => setNombreRuta(e.target.value)} placeholder="Ej: Zona Norte Valdivia" style={{ width: '100%', padding: '11px 12px', borderRadius: 10, background: '#1C1C1C', border: '1px solid rgba(255,255,255,0.08)', color: '#F4EEDF', fontSize: 14, outline: 'none' }} />
          </div>

          {/* Paradas */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
              Paradas de entrega ({paradas.length})
            </p>
            <button onClick={agregarParada} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8, background: F_DIM, border: `1px solid ${F_BORDER}`, color: F, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              <Plus size={14} /> Agregar
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
            {paradas.map((p, i) => (
              <div key={i} style={{ background: '#131313', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '12px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ width: 22, height: 22, borderRadius: '50%', background: F_DIM, border: `1px solid ${F_BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: F, flexShrink: 0 }}>{p.orden}</span>
                  {p.lat && p.lng && <MapPin size={12} color="#4ADE80" />}
                  <button onClick={() => eliminarParada(i)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#FF5555' }}>
                    <Trash2 size={14} />
                  </button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <input value={p.cliente_nombre} onChange={e => actualizarParada(i, 'cliente_nombre', e.target.value)} placeholder="Cliente / destinatario" style={{ padding: '9px 10px', borderRadius: 8, background: '#1C1C1C', border: '1px solid rgba(255,255,255,0.06)', color: '#F4EEDF', fontSize: 13, outline: 'none' }} />
                  <input value={p.direccion} onChange={e => actualizarParada(i, 'direccion', e.target.value)} placeholder="Dirección de entrega" style={{ padding: '9px 10px', borderRadius: 8, background: '#1C1C1C', border: '1px solid rgba(255,255,255,0.06)', color: '#F4EEDF', fontSize: 13, outline: 'none' }} />
                </div>
              </div>
            ))}
            {paradas.length === 0 && (
              <div style={{ textAlign: 'center', padding: '32px 20px', background: '#0F0F0F', borderRadius: 12, border: '1px dashed rgba(255,255,255,0.08)' }}>
                <MapPin size={28} color="var(--muted)" style={{ margin: '0 auto 10px', display: 'block' }} />
                <p style={{ fontSize: 13, color: 'var(--muted)' }}>Agrega las paradas de entrega</p>
              </div>
            )}
          </div>

          {/* Acciones */}
          {paradas.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button onClick={optimizar} disabled={!puedeOptimizar || optimizando || geocodificando} style={{ width: '100%', padding: '13px', borderRadius: 12, border: `1px solid ${F_BORDER}`, background: F_DIM, color: F, fontSize: 14, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <Zap size={16} />
                {geocodificando ? 'Geocodificando direcciones…' : optimizando ? 'Optimizando ruta…' : 'Optimizar ruta (mínimo combustible)'}
              </button>

              {kmEst !== null && (
                <div style={{ background: 'rgba(212,175,55,0.08)', border: '1px solid rgba(212,175,55,0.2)', borderRadius: 12, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <p style={{ fontSize: 13, color: T, fontWeight: 700 }}>Distancia estimada</p>
                  <p style={{ fontSize: 18, fontWeight: 900, color: T }}>{kmEst} km</p>
                </div>
              )}

              {paradas.some(p => p.lat && p.lng) && (
                <a href={generarURLGoogleMaps(paradas)} target="_blank" rel="noopener noreferrer" style={{ width: '100%', padding: '12px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)', background: 'transparent', color: 'var(--muted)', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, textDecoration: 'none' }}>
                  <ExternalLink size={14} />
                  Ver ruta en Google Maps
                </a>
              )}

              <button onClick={guardar} disabled={!puedeGuardar || guardando} style={{ width: '100%', padding: '15px', borderRadius: 12, border: 'none', background: puedeGuardar && !guardando ? (rutaGuardada ? '#4ADE80' : F) : 'rgba(255,255,255,0.06)', color: puedeGuardar && !guardando ? '#fff' : 'var(--muted)', fontSize: 15, fontWeight: 900, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                {rutaGuardada ? <><CheckCircle size={16} /> Ruta guardada</> : <><Save size={16} />{guardando ? 'Guardando…' : 'Guardar ruta'}</>}
              </button>
            </div>
          )}
        </div>
      )}

      {tab === 'historial' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {rutas.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'var(--muted)', padding: '40px 0' }}>Sin rutas registradas</p>
          ) : rutas.map(r => (
            <RutaCard key={r.id} ruta={r} vehiculo={vehiculos.find(v => v.id === r.vehiculo_id)} />
          ))}
        </div>
      )}
    </div>
  )
}

function RutaCard({ ruta, vehiculo }: { ruta: Ruta; vehiculo: Vehiculo | undefined }) {
  const [open, setOpen] = useState(false)
  const estadoColor = { pendiente: '#F59E0B', en_curso: F, completada: '#4ADE80' }[ruta.estado] ?? 'var(--muted)'

  return (
    <div style={{ background: 'var(--surface2)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, overflow: 'hidden' }}>
      <div onClick={() => setOpen(o => !o)} style={{ padding: '14px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: '#F4EEDF', marginBottom: 2 }}>{ruta.nombre ?? 'Reparto'}</p>
          <p style={{ fontSize: 11, color: 'var(--muted)' }}>
            {vehiculo?.nombre ?? '—'} · {new Date(ruta.fecha + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })}
            {ruta.km_teoricos ? ` · ${ruta.km_teoricos} km` : ''}
          </p>
        </div>
        <span style={{ fontSize: 11, fontWeight: 700, color: estadoColor, background: `${estadoColor}18`, padding: '3px 9px', borderRadius: 20 }}>
          {ruta.estado === 'pendiente' ? 'Pendiente' : ruta.estado === 'en_curso' ? 'En curso' : 'Completada'}
        </span>
        <ChevronDown size={16} color="var(--muted)" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }} />
      </div>
      {open && ruta.ruta_paradas && (
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', padding: '10px 16px' }}>
          {ruta.ruta_paradas.sort((a, b) => a.orden - b.orden).map((p, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: i < ruta.ruta_paradas.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
              <span style={{ width: 20, height: 20, borderRadius: '50%', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: 'var(--muted)', flexShrink: 0 }}>{p.orden}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: '#F4EEDF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.cliente_nombre}</p>
                <p style={{ fontSize: 10, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.direccion}</p>
              </div>
              {p.completada && <CheckCircle size={14} color="#4ADE80" />}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
