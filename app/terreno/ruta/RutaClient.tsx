'use client'

/**
 * Organiza tu Viaje — el vendedor arma su ruta del día combinando:
 *   1. Clientes existentes (búsqueda + checkbox)
 *   2. Direcciones manuales de clientes nuevos aún no registrados
 *      (se geocodifican con Nominatim para obtener lat/lng)
 *
 * La app ordena las paradas por cercanía (nearest-neighbor desde el GPS
 * actual del vendedor) y genera deep links directos a Waze / Google Maps.
 */
import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  Search, MapPin, X, ChevronUp, ChevronDown, Navigation,
  Sparkles, Loader2, ChevronLeft, Plus, Building2, Pencil,
} from 'lucide-react'
import AppHeader from '@/components/ui/AppHeader'

const G = '#D4AF37'

// ── Tipos ───────────────────────────────────────────────────────────────────
interface ClienteRuta {
  nombre: string
  categoria: string | null
  localidad: string | null
  direccion: string | null
  telefono: string | null
  lat: number
  lng: number
}

/** Parada unificada en la cola — cliente existente o dirección manual */
interface Parada {
  id:      string
  nombre:  string
  detalle: string | null
  lat:     number
  lng:     number
  tipo:    'cliente' | 'manual'
}

interface GeoResult { lat: string; lon: string; display_name: string }

interface Props { clientes: ClienteRuta[] }

// ── Distancia haversine en km ───────────────────────────────────────────────
function distanciaKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// ── Nearest-neighbor desde un origen ────────────────────────────────────────
function ordenarPorCercania(origen: { lat: number; lng: number }, puntos: Parada[]): Parada[] {
  const restantes = [...puntos]
  const ordenados: Parada[] = []
  let actual = origen
  while (restantes.length > 0) {
    let idx = 0, distMin = Infinity
    for (let i = 0; i < restantes.length; i++) {
      const d = distanciaKm(actual.lat, actual.lng, restantes[i].lat, restantes[i].lng)
      if (d < distMin) { distMin = d; idx = i }
    }
    const [sig] = restantes.splice(idx, 1)
    ordenados.push(sig)
    actual = sig
  }
  return ordenados
}

// ── Deep links ──────────────────────────────────────────────────────────────
function urlWaze(p: Parada) {
  return `https://waze.com/ul?ll=${p.lat},${p.lng}&navigate=yes`
}
function urlGoogleMapsRuta(queue: Parada[]) {
  if (queue.length === 0) return '#'
  const destino = queue[queue.length - 1]
  const waypoints = queue.slice(0, -1).map(p => `${p.lat},${p.lng}`).join('|')
  const base = `https://www.google.com/maps/dir/?api=1&destination=${destino.lat},${destino.lng}&travelmode=driving`
  return waypoints ? `${base}&waypoints=${waypoints}` : base
}

export default function RutaClient({ clientes }: Props) {
  const router = useRouter()
  const [busqueda, setBusqueda] = useState('')
  const [queue, setQueue]       = useState<Parada[]>([])
  const [optimizando, setOptimizando] = useState(false)
  const [gpsError, setGpsError]       = useState<string | null>(null)
  const [optimizado, setOptimizado]   = useState(false)

  // ── Dirección manual ──
  const [modoManual, setModoManual]   = useState(false)
  const [dirInput, setDirInput]       = useState('')
  const [geoResults, setGeoResults]   = useState<GeoResult[]>([])
  const [buscandoGeo, setBuscandoGeo] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const enQueue = useMemo(() => new Set(queue.map(p => p.id)), [queue])

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    if (!q) return clientes.slice(0, 60)
    return clientes.filter(c =>
      c.nombre.toLowerCase().includes(q) ||
      (c.localidad ?? '').toLowerCase().includes(q) ||
      (c.categoria ?? '').toLowerCase().includes(q)
    ).slice(0, 60)
  }, [clientes, busqueda])

  // ── Toggle cliente existente ──
  function toggleCliente(c: ClienteRuta) {
    setOptimizado(false)
    const id = `cli-${c.nombre}`
    setQueue(prev =>
      prev.some(p => p.id === id)
        ? prev.filter(p => p.id !== id)
        : [...prev, {
            id, nombre: c.nombre,
            detalle: [c.categoria, c.localidad].filter(Boolean).join(' · ') || null,
            lat: c.lat, lng: c.lng, tipo: 'cliente',
          }]
    )
  }

  function quitar(id: string) {
    setOptimizado(false)
    setQueue(prev => prev.filter(p => p.id !== id))
  }

  function mover(idx: number, dir: -1 | 1) {
    setQueue(prev => {
      const next = [...prev]
      const j = idx + dir
      if (j < 0 || j >= next.length) return prev
      ;[next[idx], next[j]] = [next[j], next[idx]]
      return next
    })
  }

  // ── Geocodificar dirección manual (debounced) ──
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const q = dirInput.trim()
    if (q.length < 3) { setGeoResults([]); return }
    debounceRef.current = setTimeout(async () => {
      setBuscandoGeo(true)
      try {
        const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`)
        const data: GeoResult[] = await res.json()
        setGeoResults(Array.isArray(data) ? data.slice(0, 5) : [])
      } catch {
        setGeoResults([])
      } finally {
        setBuscandoGeo(false)
      }
    }, 450)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [dirInput])

  // ── Agregar dirección manual a la cola ──
  function agregarManual(r: GeoResult) {
    setOptimizado(false)
    const nombreCorto = r.display_name.split(',').slice(0, 2).join(',').trim()
    const id = `man-${r.lat}-${r.lon}`
    if (queue.some(p => p.id === id)) return
    setQueue(prev => [...prev, {
      id, nombre: nombreCorto, detalle: 'Dirección nueva',
      lat: parseFloat(r.lat), lng: parseFloat(r.lon), tipo: 'manual',
    }])
    setDirInput('')
    setGeoResults([])
    setModoManual(false)
  }

  // ── Optimizar: GPS actual → reordena por cercanía ──
  const optimizar = useCallback(() => {
    if (queue.length < 2) return
    setGpsError(null)
    setOptimizando(true)
    if (!navigator.geolocation) {
      setGpsError('Tu dispositivo no soporta geolocalización')
      setOptimizando(false)
      return
    }
    navigator.geolocation.getCurrentPosition(
      pos => {
        const origen = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        setQueue(prev => ordenarPorCercania(origen, prev))
        setOptimizado(true)
        setOptimizando(false)
      },
      () => {
        setQueue(prev => prev.length > 1 ? [prev[0], ...ordenarPorCercania(prev[0], prev.slice(1))] : prev)
        setGpsError('Sin acceso a tu ubicación — se ordenó desde la primera parada')
        setOptimizado(true)
        setOptimizando(false)
      },
      { enableHighAccuracy: true, timeout: 8000 }
    )
  }, [queue.length])

  const totalKm = useMemo(() => {
    if (queue.length < 2) return 0
    let total = 0
    for (let i = 0; i < queue.length - 1; i++) {
      total += distanciaKm(queue[i].lat, queue[i].lng, queue[i + 1].lat, queue[i + 1].lng)
    }
    return total
  }, [queue])

  const nClientes = queue.filter(p => p.tipo === 'cliente').length
  const nManual   = queue.filter(p => p.tipo === 'manual').length

  return (
    <div style={{ minHeight: '100vh', background: '#080808', paddingBottom: 110 }}>
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '0 16px' }}>

        {/* Header */}
        <div style={{ paddingTop: 16 }}>
          <button
            onClick={() => router.push('/terreno')}
            style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0, marginBottom: 10, minHeight: 44 }}
          >
            <ChevronLeft size={15} /> Terreno
          </button>
          <AppHeader eyebrow="Optimización de ruta" title="Organiza tu Viaje" />
        </div>

        {/* ── Cola de visita ── */}
        {queue.length > 0 && (
          <div className="card card-pad" style={{ borderTop: `2px solid ${G}`, marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span className="section-head" style={{ marginBottom: 0 }}>
                Cola de viaje · {queue.length} {queue.length === 1 ? 'parada' : 'paradas'}
              </span>
              {optimizado && totalKm > 0 && (
                <span className="badge badge-gold">{totalKm.toFixed(1)} km</span>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
              {queue.map((p, i) => (
                <div key={p.id} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  background: 'var(--surface2)', borderRadius: 10, padding: '8px 10px', minHeight: 44,
                }}>
                  {/* Número de orden */}
                  <div style={{
                    width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                    background: optimizado ? `${G}20` : 'rgba(255,255,255,0.06)',
                    border: `1px solid ${optimizado ? G + '50' : 'rgba(255,255,255,0.1)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 10, fontWeight: 800, color: optimizado ? G : 'rgba(255,255,255,0.4)',
                  }}>
                    {i + 1}
                  </div>
                  {/* Ícono tipo parada */}
                  {p.tipo === 'manual'
                    ? <Pencil size={12} color="#60A5FA" style={{ flexShrink: 0 }} />
                    : <Building2 size={12} color={G} style={{ flexShrink: 0 }} />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--cream)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.nombre}
                    </p>
                    {p.detalle && (
                      <p style={{ fontSize: 10, color: p.tipo === 'manual' ? 'rgba(96,165,250,0.7)' : 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.detalle}
                      </p>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
                    <button onClick={() => mover(i, -1)} disabled={i === 0} style={{ width: 26, height: 26, border: 'none', background: 'none', color: i === 0 ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.4)', cursor: i === 0 ? 'default' : 'pointer' }}>
                      <ChevronUp size={14} />
                    </button>
                    <button onClick={() => mover(i, 1)} disabled={i === queue.length - 1} style={{ width: 26, height: 26, border: 'none', background: 'none', color: i === queue.length - 1 ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.4)', cursor: i === queue.length - 1 ? 'default' : 'pointer' }}>
                      <ChevronDown size={14} />
                    </button>
                    <button onClick={() => quitar(p.id)} style={{ width: 30, height: 30, border: 'none', background: 'none', color: '#F87171', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <X size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Resumen tipos */}
            {(nClientes > 0 && nManual > 0) && (
              <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginBottom: 10 }}>
                {nClientes} cliente{nClientes !== 1 ? 's' : ''} · {nManual} dirección{nManual !== 1 ? 'es' : ''} nueva{nManual !== 1 ? 's' : ''}
              </p>
            )}

            {/* Optimizar */}
            <button
              onClick={optimizar}
              disabled={queue.length < 2 || optimizando}
              className="btn-cta"
              style={{ width: '100%', marginBottom: 8, opacity: queue.length < 2 ? 0.4 : 1 }}
            >
              {optimizando
                ? <><Loader2 size={15} style={{ animation: 'spin 0.8s linear infinite' }} /> Calculando ruta…</>
                : <><Sparkles size={15} /> Optimizar orden por cercanía</>}
            </button>
            {gpsError && (
              <p style={{ fontSize: 10, color: 'rgba(212,175,55,0.7)', textAlign: 'center', marginBottom: 8 }}>{gpsError}</p>
            )}

            {/* Deep links */}
            <div style={{ display: 'flex', gap: 8 }}>
              <a href={urlWaze(queue[0])} target="_blank" rel="noopener noreferrer"
                style={{ flex: 1, minHeight: 44, borderRadius: 12, background: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.25)', color: '#60A5FA', fontSize: 12, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, textDecoration: 'none' }}>
                <Navigation size={14} /> Abrir en Waze
              </a>
              <a href={urlGoogleMapsRuta(queue)} target="_blank" rel="noopener noreferrer"
                style={{ flex: 1, minHeight: 44, borderRadius: 12, background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.25)', color: '#4ADE80', fontSize: 12, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, textDecoration: 'none' }}>
                <MapPin size={14} /> Google Maps
              </a>
            </div>
            <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', textAlign: 'center', marginTop: 8 }}>
              Waze abre la ruta a la primera parada · Google Maps incluye toda la ruta completa
            </p>
          </div>
        )}

        {/* ── Agregar dirección manual ── */}
        <div className="card" style={{ marginBottom: 14, overflow: 'visible' }}>
          {!modoManual ? (
            <button
              onClick={() => setModoManual(true)}
              style={{
                width: '100%', minHeight: 48, background: 'transparent', border: 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                color: '#60A5FA', fontSize: 13, fontWeight: 700, cursor: 'pointer', padding: '12px',
              }}
            >
              <Plus size={16} /> Agregar dirección de cliente nuevo
            </button>
          ) : (
            <div style={{ padding: '12px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span className="section-head" style={{ marginBottom: 0 }}>Dirección nueva</span>
                <button onClick={() => { setModoManual(false); setDirInput(''); setGeoResults([]) }}
                  style={{ width: 28, height: 28, border: 'none', background: 'rgba(255,255,255,0.05)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                  <X size={14} color="rgba(255,255,255,0.5)" />
                </button>
              </div>
              <div style={{ position: 'relative' }}>
                <MapPin size={15} style={{ position: 'absolute', left: 13, top: 15, color: 'rgba(96,165,250,0.6)' }} />
                <input
                  type="text"
                  autoFocus
                  value={dirInput}
                  onChange={e => setDirInput(e.target.value)}
                  placeholder="Calle y número, sector…"
                  className="input-sm"
                  style={{ height: 44, paddingLeft: 38, fontSize: 14 }}
                />
                {buscandoGeo && (
                  <Loader2 size={15} style={{ position: 'absolute', right: 13, top: 15, color: 'rgba(255,255,255,0.4)', animation: 'spin 0.8s linear infinite' }} />
                )}
              </div>
              {/* Sugerencias geocodificadas */}
              {geoResults.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
                  {geoResults.map((r, idx) => (
                    <button
                      key={idx}
                      onClick={() => agregarManual(r)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left',
                        minHeight: 44, padding: '8px 10px', borderRadius: 10,
                        background: 'var(--surface2)', border: '1px solid rgba(96,165,250,0.15)',
                        color: 'var(--cream)', cursor: 'pointer', width: '100%',
                      }}
                    >
                      <MapPin size={13} color="#60A5FA" style={{ flexShrink: 0 }} />
                      <span style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.display_name}
                      </span>
                      <Plus size={14} color="#60A5FA" style={{ marginLeft: 'auto', flexShrink: 0 }} />
                    </button>
                  ))}
                </div>
              )}
              {dirInput.trim().length >= 3 && !buscandoGeo && geoResults.length === 0 && (
                <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 8, textAlign: 'center' }}>
                  Sin resultados. Prueba con calle + número + ciudad.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Buscador de clientes existentes */}
        <div style={{ position: 'relative', marginBottom: 10 }}>
          <Search size={15} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.3)' }} />
          <input
            type="text"
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar cliente, zona o categoría…"
            className="input-sm"
            style={{ height: 44, paddingLeft: 38, fontSize: 14 }}
          />
        </div>

        {/* Lista de clientes */}
        <p className="section-head">
          {busqueda ? `Resultados (${filtrados.length})` : `Clientes con ubicación (${clientes.length})`}
        </p>

        {clientes.length === 0 ? (
          <div className="card card-pad" style={{ textAlign: 'center', padding: '32px 16px' }}>
            <MapPin size={28} color="rgba(255,255,255,0.15)" style={{ margin: '0 auto 10px' }} />
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)' }}>
              No hay clientes con coordenadas GPS todavía
            </p>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', marginTop: 6 }}>
              Usa &quot;Agregar dirección&quot; arriba para armar tu ruta
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {filtrados.map(c => {
              const seleccionado = enQueue.has(`cli-${c.nombre}`)
              return (
                <div
                  key={c.nombre}
                  onClick={() => toggleCliente(c)}
                  className="row-dense"
                  style={{
                    background: seleccionado ? 'rgba(212,175,55,0.06)' : 'var(--surface)',
                    border: `1px solid ${seleccionado ? 'rgba(212,175,55,0.25)' : 'var(--border)'}`,
                    borderRadius: 12, cursor: 'pointer', padding: '8px 12px',
                  }}
                >
                  <div style={{
                    width: 20, height: 20, borderRadius: 6, flexShrink: 0,
                    border: `1.5px solid ${seleccionado ? G : 'rgba(255,255,255,0.2)'}`,
                    background: seleccionado ? G : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {seleccionado && <span style={{ color: '#080808', fontSize: 12, fontWeight: 900 }}>✓</span>}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--cream)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.nombre}
                    </p>
                    <p style={{ fontSize: 10, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {[c.categoria, c.localidad].filter(Boolean).join(' · ') || 'Sin datos'}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}
