'use client'

/**
 * Planifica tu Viaje — el vendedor selecciona varios clientes de su día,
 * la app ordena la visita por cercanía (nearest-neighbor desde su GPS actual)
 * y genera deep links directos a Waze / Google Maps con la ruta completa.
 */
import { useState, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Search, MapPin, X, ChevronUp, ChevronDown, Navigation,
  Sparkles, Trash2, GripVertical, Loader2, ChevronLeft,
} from 'lucide-react'
import AppHeader from '@/components/ui/AppHeader'

const G = '#D4AF37'

interface ClienteRuta {
  nombre: string
  categoria: string | null
  localidad: string | null
  direccion: string | null
  telefono: string | null
  lat: number
  lng: number
}

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

// ── Ordenamiento nearest-neighbor desde un punto de origen ──────────────────
function ordenarPorCercania(origen: { lat: number; lng: number }, puntos: ClienteRuta[]): ClienteRuta[] {
  const restantes = [...puntos]
  const ordenados: ClienteRuta[] = []
  let actual = origen
  while (restantes.length > 0) {
    let idxMasCercano = 0
    let distMin = Infinity
    for (let i = 0; i < restantes.length; i++) {
      const d = distanciaKm(actual.lat, actual.lng, restantes[i].lat, restantes[i].lng)
      if (d < distMin) { distMin = d; idxMasCercano = i }
    }
    const [siguiente] = restantes.splice(idxMasCercano, 1)
    ordenados.push(siguiente)
    actual = siguiente
  }
  return ordenados
}

// ── Deep links ────────────────────────────────────────────────────────────
function urlWaze(c: ClienteRuta) {
  return `https://waze.com/ul?ll=${c.lat},${c.lng}&navigate=yes`
}
function urlGoogleMapsRuta(queue: ClienteRuta[]) {
  if (queue.length === 0) return '#'
  const destino = queue[queue.length - 1]
  const waypoints = queue.slice(0, -1).map(c => `${c.lat},${c.lng}`).join('|')
  const base = `https://www.google.com/maps/dir/?api=1&destination=${destino.lat},${destino.lng}&travelmode=driving`
  return waypoints ? `${base}&waypoints=${waypoints}` : base
}

export default function RutaClient({ clientes }: Props) {
  const router = useRouter()
  const [busqueda, setBusqueda] = useState('')
  const [queue, setQueue] = useState<ClienteRuta[]>([])
  const [optimizando, setOptimizando] = useState(false)
  const [gpsError, setGpsError] = useState<string | null>(null)
  const [optimizado, setOptimizado] = useState(false)

  const enQueue = useMemo(() => new Set(queue.map(c => c.nombre)), [queue])

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    if (!q) return clientes.slice(0, 60)
    return clientes.filter(c =>
      c.nombre.toLowerCase().includes(q) ||
      (c.localidad ?? '').toLowerCase().includes(q) ||
      (c.categoria ?? '').toLowerCase().includes(q)
    ).slice(0, 60)
  }, [clientes, busqueda])

  function toggle(c: ClienteRuta) {
    setOptimizado(false)
    setQueue(prev =>
      prev.some(x => x.nombre === c.nombre)
        ? prev.filter(x => x.nombre !== c.nombre)
        : [...prev, c]
    )
  }

  function quitar(nombre: string) {
    setOptimizado(false)
    setQueue(prev => prev.filter(c => c.nombre !== nombre))
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

  // ── Optimizar: pide GPS actual y reordena por cercanía ──────────────────
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
        // Sin permiso GPS: ordena desde el primer cliente seleccionado como origen
        setQueue(prev => prev.length > 1 ? [prev[0], ...ordenarPorCercania(prev[0], prev.slice(1))] : prev)
        setGpsError('Sin acceso a tu ubicación — se ordenó desde el primer cliente de la lista')
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

  return (
    <div style={{ minHeight: '100vh', background: '#080808', paddingBottom: 100 }}>
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '0 16px' }}>

        {/* Header */}
        <div style={{ paddingTop: 16 }}>
          <button
            onClick={() => router.push('/terreno')}
            style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0, marginBottom: 10, minHeight: 44 }}
          >
            <ChevronLeft size={15} /> Terreno
          </button>
          <AppHeader eyebrow="Optimización de ruta" title="Planifica tu Viaje" />
        </div>

        {/* Buscador */}
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

        {/* ── Cola de visita (si hay seleccionados) ── */}
        {queue.length > 0 && (
          <div className="card card-pad" style={{ borderTop: `2px solid ${G}`, marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span className="section-head" style={{ marginBottom: 0 }}>
                Cola de viaje · {queue.length} {queue.length === 1 ? 'cliente' : 'clientes'}
              </span>
              {optimizado && totalKm > 0 && (
                <span className="badge badge-gold">{totalKm.toFixed(1)} km</span>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
              {queue.map((c, i) => (
                <div key={c.nombre} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  background: 'var(--surface2)', borderRadius: 10, padding: '8px 10px',
                  minHeight: 44,
                }}>
                  <div style={{
                    width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                    background: optimizado ? `${G}20` : 'rgba(255,255,255,0.06)',
                    border: `1px solid ${optimizado ? G + '50' : 'rgba(255,255,255,0.1)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 10, fontWeight: 800, color: optimizado ? G : 'rgba(255,255,255,0.4)',
                  }}>
                    {i + 1}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--cream)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.nombre}
                    </p>
                    {c.localidad && (
                      <p style={{ fontSize: 10, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.localidad}</p>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
                    <button onClick={() => mover(i, -1)} disabled={i === 0} style={{ width: 26, height: 26, border: 'none', background: 'none', color: i === 0 ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.4)', cursor: i === 0 ? 'default' : 'pointer' }}>
                      <ChevronUp size={14} />
                    </button>
                    <button onClick={() => mover(i, 1)} disabled={i === queue.length - 1} style={{ width: 26, height: 26, border: 'none', background: 'none', color: i === queue.length - 1 ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.4)', cursor: i === queue.length - 1 ? 'default' : 'pointer' }}>
                      <ChevronDown size={14} />
                    </button>
                    <button onClick={() => quitar(c.nombre)} style={{ width: 30, height: 30, border: 'none', background: 'none', color: '#F87171', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <X size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Botón optimizar */}
            <button
              onClick={optimizar}
              disabled={queue.length < 2 || optimizando}
              className="btn-cta"
              style={{ width: '100%', marginBottom: 8, opacity: queue.length < 2 ? 0.4 : 1 }}
            >
              {optimizando
                ? <><Loader2 size={15} style={{ animation: 'spin 0.8s linear infinite' }} /> Calculando ruta…</>
                : <><Sparkles size={15} /> Optimizar orden por cercanía</>
              }
            </button>
            {gpsError && (
              <p style={{ fontSize: 10, color: 'rgba(212,175,55,0.7)', textAlign: 'center', marginBottom: 8 }}>{gpsError}</p>
            )}

            {/* Deep links navegación */}
            <div style={{ display: 'flex', gap: 8 }}>
              <a
                href={urlWaze(queue[0])}
                target="_blank" rel="noopener noreferrer"
                style={{
                  flex: 1, minHeight: 44, borderRadius: 12,
                  background: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.25)',
                  color: '#60A5FA', fontSize: 12, fontWeight: 800,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  textDecoration: 'none',
                }}
              >
                <Navigation size={14} /> Abrir en Waze
              </a>
              <a
                href={urlGoogleMapsRuta(queue)}
                target="_blank" rel="noopener noreferrer"
                style={{
                  flex: 1, minHeight: 44, borderRadius: 12,
                  background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.25)',
                  color: '#4ADE80', fontSize: 12, fontWeight: 800,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  textDecoration: 'none',
                }}
              >
                <MapPin size={14} /> Google Maps
              </a>
            </div>
            <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', textAlign: 'center', marginTop: 8 }}>
              Waze abre la ruta al primer cliente · Google Maps incluye toda la ruta completa
            </p>
          </div>
        )}

        {/* ── Lista de clientes para seleccionar ── */}
        <p className="section-head">
          {busqueda ? `Resultados (${filtrados.length})` : `Clientes con ubicación (${clientes.length})`}
        </p>

        {clientes.length === 0 ? (
          <div className="card card-pad" style={{ textAlign: 'center', padding: '32px 16px' }}>
            <MapPin size={28} color="rgba(255,255,255,0.15)" style={{ margin: '0 auto 10px' }} />
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)' }}>
              No hay clientes con coordenadas GPS registradas todavía
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {filtrados.map(c => {
              const seleccionado = enQueue.has(c.nombre)
              return (
                <div
                  key={c.nombre}
                  onClick={() => toggle(c)}
                  className="row-dense"
                  style={{
                    background: seleccionado ? 'rgba(212,175,55,0.06)' : 'var(--surface)',
                    border: `1px solid ${seleccionado ? 'rgba(212,175,55,0.25)' : 'var(--border)'}`,
                    borderRadius: 12, cursor: 'pointer', padding: '8px 12px',
                  }}
                >
                  {/* Checkbox */}
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
