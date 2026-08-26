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
import { createClient } from '@/lib/supabase/client'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States'
import { formatLocalidad } from '@/lib/format'
import { C, TAP, cardStyle, btnPrimario } from '../theme'

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

/**
 * `clientesIniciales`: sólo la primera página (60), la que se ve sin
 * escribir nada en el buscador — no la cartera completa.
 * `totalConUbicacion`: el conteo real, para el rótulo de la lista.
 */
interface ClienteRecomendado extends ClienteRuta {
  diasSinComprar: number | null
  ultimaCompra: string | null
}

interface Props {
  clientesIniciales: ClienteRuta[]
  totalConUbicacion: number
  /** "Recomendados para hoy" — clientes con ciclo de compra vencido, ya
   *  priorizados por el servidor (máx. 10). Ver cargarRecomendados en page.tsx. */
  recomendados: ClienteRecomendado[]
}

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

export default function RutaClient({ clientesIniciales, totalConUbicacion, recomendados }: Props) {
  const router = useRouter()
  const [busqueda, setBusqueda] = useState('')
  // Antes lo primero que se veía al abrir Ruta era la cartera completa,
  // paginada alfabéticamente — ningún criterio de prioridad. Ahora lo
  // primero es "Recomendados para hoy" (ciclo de compra vencido); explorar
  // el resto de la cartera es una acción explícita ("Ver todos los clientes").
  const [verTodos, setVerTodos] = useState(false)
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

  // ── Búsqueda de clientes ──────────────────────────────────────────────
  // `resultadosBusqueda === null` = no hay búsqueda activa, se muestra
  // `clientesIniciales` (la página que ya trajo el servidor). Con texto,
  // se consulta Supabase directo desde el navegador — mismo patrón que ya
  // usa BuscarClienteSheet — en vez de filtrar un arreglo que ya no llega
  // completo.
  const [resultadosBusqueda, setResultadosBusqueda] = useState<ClienteRuta[] | null>(null)
  const [buscandoClientes, setBuscandoClientes] = useState(false)
  const [errorBusqueda, setErrorBusqueda] = useState<string | null>(null)
  const busquedaDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Separado del efecto de debounce para que "Reintentar" pueda llamarlo
  // directo — reintentar reescribiendo `busqueda` con el mismo valor no
  // sirve: React descarta un setState con un primitivo idéntico y el efecto
  // nunca vuelve a correr.
  const ejecutarBusqueda = useCallback(async (q: string) => {
    setBuscandoClientes(true)
    const supabase = createClient()
    // Comas y paréntesis rompen la sintaxis de .or() de PostgREST — se
    // limpian antes de armar el filtro, no se rechaza la búsqueda.
    const termino = q.replace(/[,()]/g, ' ').trim()
    const { data, error } = await supabase
      .from('clientes')
      .select('nombre_fantasia, categoria, localidad, direccion, telefono, lat, lng')
      .not('nombre_fantasia', 'is', null)
      .not('lat', 'is', null)
      .not('lng', 'is', null)
      .or(`nombre_fantasia.ilike.%${termino}%,localidad.ilike.%${termino}%,categoria.ilike.%${termino}%`)
      .order('nombre_fantasia')
      .limit(60)

    if (error) {
      setErrorBusqueda(error.message)
      setResultadosBusqueda([])
    } else {
      setErrorBusqueda(null)
      setResultadosBusqueda((data ?? []).map(c => ({
        nombre: c.nombre_fantasia as string,
        categoria: c.categoria as string | null,
        localidad: c.localidad as string | null,
        direccion: c.direccion as string | null,
        telefono: c.telefono as string | null,
        lat: Number(c.lat),
        lng: Number(c.lng),
      })))
    }
    setBuscandoClientes(false)
  }, [])

  useEffect(() => {
    if (busquedaDebounceRef.current) clearTimeout(busquedaDebounceRef.current)
    const q = busqueda.trim()
    if (q.length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResultadosBusqueda(null)
      setErrorBusqueda(null)
      setBuscandoClientes(false)
      return
    }
    busquedaDebounceRef.current = setTimeout(() => { ejecutarBusqueda(q) }, 400)
    return () => { if (busquedaDebounceRef.current) clearTimeout(busquedaDebounceRef.current) }
  }, [busqueda, ejecutarBusqueda])

  const resultados = resultadosBusqueda ?? clientesIniciales

  // Pre-carga desde Misiones: si venimos de "Armar mi ruta del día", la lista
  // de clientes llega por localStorage. Hacemos match con los clientes con GPS
  // y armamos la cola automáticamente.
  useEffect(() => {
    let raw: string | null = null
    try { raw = localStorage.getItem('ruta-preload') } catch { return }
    if (!raw) return
    try { localStorage.removeItem('ruta-preload') } catch {}
    let nombres: string[]
    try { nombres = JSON.parse(raw) } catch { return }
    if (!Array.isArray(nombres) || nombres.length === 0) return

    // Antes esto hacía match contra el arreglo completo de clientes que
    // llegaba del servidor. Ahora sólo llega la primera página, así que se
    // resuelve con una consulta puntual por nombre — más liviana que la
    // versión anterior, no menos correcta.
    ;(async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from('clientes')
        .select('nombre_fantasia, categoria, localidad, lat, lng')
        .in('nombre_fantasia', nombres)
        .not('lat', 'is', null)
        .not('lng', 'is', null)
      const paradas: Parada[] = (data ?? []).map(c => ({
        id: `cli-${c.nombre_fantasia}`, nombre: c.nombre_fantasia as string,
        detalle: [c.categoria, formatLocalidad(c.localidad as string | null)].filter(Boolean).join(' · ') || null,
        lat: Number(c.lat), lng: Number(c.lng), tipo: 'cliente' as const,
      }))
      if (paradas.length > 0) setQueue(paradas)
    })()
  }, [])


  // ── Toggle cliente existente ──
  function toggleCliente(c: ClienteRuta) {
    setOptimizado(false)
    const id = `cli-${c.nombre}`
    setQueue(prev =>
      prev.some(p => p.id === id)
        ? prev.filter(p => p.id !== id)
        : [...prev, {
            id, nombre: c.nombre,
            detalle: [c.categoria, formatLocalidad(c.localidad)].filter(Boolean).join(' · ') || null,
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
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
    <div style={{ minHeight: '100vh', background: C.bg, paddingBottom: 'max(140px, calc(env(safe-area-inset-bottom, 0px) + 120px))' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '20px 16px 0' }}>
        <button
          onClick={() => router.push('/terreno')}
          aria-label="Volver"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4, minHeight: 36, cursor: 'pointer',
            background: C.card, border: `1px solid ${C.line}`, borderRadius: 100,
            padding: '7px 14px 7px 10px', color: C.blue, fontSize: 13, fontWeight: 700, marginBottom: 14,
          }}
        >
          <ChevronLeft size={17} strokeWidth={2.5} color={C.blue} />
          Volver
        </button>

        <div style={{ marginBottom: 16 }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: C.muted, letterSpacing: '0.04em' }}>OPTIMIZACIÓN DE RUTA</p>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: C.text, letterSpacing: '-0.5px' }}>Organiza tu viaje</h1>
        </div>

        {/* Cola de viaje */}
        {queue.length > 0 && (
          <div style={{ ...cardStyle, padding: 15, marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 11 }}>
              <p style={{ fontSize: 12, fontWeight: 800, color: C.text, letterSpacing: '0.04em' }}>
                COLA DE VIAJE · {queue.length} {queue.length === 1 ? 'PARADA' : 'PARADAS'}
              </p>
              {optimizado && totalKm > 0 && (
                <span style={{ fontSize: 12, fontWeight: 800, color: C.blue, background: C.blueSoft, borderRadius: 7, padding: '3px 8px' }}>
                  {totalKm.toFixed(1)} km
                </span>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
              {queue.map((p, i) => (
                <div key={p.id} style={{
                  display: 'flex', alignItems: 'center', gap: 9, minHeight: 52,
                  background: C.bg, border: `1px solid ${C.line}`, borderRadius: 11, padding: '8px 10px',
                }}>
                  <span style={{
                    width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                    background: optimizado ? C.blue : C.line,
                    color: optimizado ? '#fff' : C.muted,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 800,
                  }}>
                    {i + 1}
                  </span>
                  {p.tipo === 'manual'
                    ? <Pencil size={13} color={C.purple} style={{ flexShrink: 0 }} />
                    : <Building2 size={13} color={C.muted} style={{ flexShrink: 0 }} />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.nombre}
                    </p>
                    {p.detalle && (
                      <p style={{ fontSize: 11, color: p.tipo === 'manual' ? C.purple : C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.detalle}
                      </p>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
                    <button onClick={() => mover(i, -1)} disabled={i === 0} aria-label="Subir"
                      style={{ width: 30, height: 30, border: 'none', background: 'none', color: i === 0 ? C.line : C.muted, cursor: i === 0 ? 'default' : 'pointer' }}>
                      <ChevronUp size={16} />
                    </button>
                    <button onClick={() => mover(i, 1)} disabled={i === queue.length - 1} aria-label="Bajar"
                      style={{ width: 30, height: 30, border: 'none', background: 'none', color: i === queue.length - 1 ? C.line : C.muted, cursor: i === queue.length - 1 ? 'default' : 'pointer' }}>
                      <ChevronDown size={16} />
                    </button>
                    <button onClick={() => quitar(p.id)} aria-label="Quitar"
                      style={{ width: 32, height: 32, border: 'none', background: 'none', color: C.red, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <X size={15} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {(nClientes > 0 && nManual > 0) && (
              <p style={{ fontSize: 11.5, color: C.muted, marginBottom: 10 }}>
                {nClientes} cliente{nClientes !== 1 ? 's' : ''} · {nManual} dirección{nManual !== 1 ? 'es' : ''} nueva{nManual !== 1 ? 's' : ''}
              </p>
            )}

            <button
              onClick={optimizar}
              disabled={queue.length < 2 || optimizando}
              style={{
                ...btnPrimario, marginBottom: 8,
                background: queue.length < 2 ? C.line : C.hero,
                color: queue.length < 2 ? C.faint : '#fff',
                cursor: queue.length < 2 ? 'not-allowed' : 'pointer',
              }}
            >
              {optimizando
                ? <><Loader2 size={16} style={{ animation: 'spin 0.8s linear infinite' }} /> Calculando ruta…</>
                : <><Sparkles size={16} /> Optimizar ruta</>}
            </button>
            {gpsError && (
              <p style={{ fontSize: 11.5, color: C.amber, textAlign: 'center', marginBottom: 8 }}>{gpsError}</p>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <a href={urlWaze(queue[0])} target="_blank" rel="noopener noreferrer"
                style={{ flex: 1, minHeight: 48, borderRadius: 12, background: C.blueSoft, border: `1px solid ${C.line}`, color: C.blue, fontSize: 13, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, textDecoration: 'none' }}>
                <Navigation size={15} /> Waze
              </a>
              <a href={urlGoogleMapsRuta(queue)} target="_blank" rel="noopener noreferrer"
                style={{ flex: 1, minHeight: 48, borderRadius: 12, background: C.greenSoft, border: `1px solid ${C.line}`, color: C.green, fontSize: 13, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, textDecoration: 'none' }}>
                <MapPin size={15} /> Google Maps
              </a>
            </div>
            <p style={{ fontSize: 11, color: C.faint, textAlign: 'center', marginTop: 8, lineHeight: 1.4 }}>
              Waze abre hasta la primera parada · Google Maps lleva la ruta completa
            </p>
          </div>
        )}

        {/* Dirección nueva */}
        <div style={{ ...cardStyle, marginBottom: 14, overflow: 'visible' }}>
          {!modoManual ? (
            <button
              onClick={() => setModoManual(true)}
              style={{
                width: '100%', minHeight: 52, background: 'transparent', border: 'none', borderRadius: 16,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                color: C.blue, fontSize: 14, fontWeight: 700, cursor: 'pointer',
              }}
            >
              <Plus size={17} /> Agregar dirección de cliente nuevo
            </button>
          ) : (
            <div style={{ padding: '13px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9 }}>
                <p style={{ fontSize: 12, fontWeight: 800, color: C.text, letterSpacing: '0.04em' }}>DIRECCIÓN NUEVA</p>
                <button onClick={() => { setModoManual(false); setDirInput(''); setGeoResults([]) }} aria-label="Cerrar"
                  style={{ width: 30, height: 30, border: 'none', background: '#E2E8F0', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                  <X size={15} color={C.muted} />
                </button>
              </div>
              <div style={{ position: 'relative' }}>
                <MapPin size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: C.faint }} />
                <input
                  type="text"
                  autoFocus
                  value={dirInput}
                  onChange={e => setDirInput(e.target.value)}
                  placeholder="Calle y número, sector…"
                  style={{
                    width: '100%', minHeight: 48, paddingLeft: 38, paddingRight: 38, borderRadius: 11,
                    border: `1px solid ${C.line}`, background: C.bg, fontSize: 15, color: C.text, outline: 'none',
                  }}
                />
                {buscandoGeo && (
                  <Loader2 size={16} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: C.faint, animation: 'spin 0.8s linear infinite' }} />
                )}
              </div>
              {geoResults.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 9 }}>
                  {geoResults.map((r, idx) => (
                    <button
                      key={idx}
                      onClick={() => agregarManual(r)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 9, textAlign: 'left', width: '100%',
                        minHeight: TAP + 6, padding: '9px 11px', borderRadius: 11,
                        background: C.bg, border: `1px solid ${C.line}`, color: C.text, cursor: 'pointer',
                      }}
                    >
                      <MapPin size={14} color={C.blue} style={{ flexShrink: 0 }} />
                      <span style={{ fontSize: 12.5, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.display_name}
                      </span>
                      <Plus size={15} color={C.blue} style={{ flexShrink: 0 }} />
                    </button>
                  ))}
                </div>
              )}
              {dirInput.trim().length >= 3 && !buscandoGeo && geoResults.length === 0 && (
                <p style={{ fontSize: 12, color: C.muted, marginTop: 9, textAlign: 'center' }}>
                  Sin resultados. Prueba con calle + número + ciudad.
                </p>
              )}
            </div>
          )}
        </div>

        {/* ── Recomendados para hoy: lo primero que se ve, sin buscar nada ── */}
        {!verTodos && !busqueda && (
          <div style={{ marginBottom: 16 }}>
            <p style={{ fontSize: 11.5, fontWeight: 800, color: C.muted, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 8 }}>
              Recomendados para hoy
            </p>
            {recomendados.length === 0 ? (
              <div style={{ ...cardStyle, padding: '16px 14px', textAlign: 'center' }}>
                <p style={{ fontSize: 12.5, color: C.muted }}>Ningún cliente tiene el ciclo de compra vencido hoy.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {recomendados.map(c => {
                  const seleccionado = enQueue.has(`cli-${c.nombre}`)
                  return (
                    <button
                      key={c.nombre}
                      onClick={() => toggleCliente(c)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 11, width: '100%', textAlign: 'left',
                        background: seleccionado ? C.blueSoft : C.card,
                        border: `1px solid ${seleccionado ? C.blue : C.line}`,
                        borderRadius: 12, cursor: 'pointer', padding: '11px 12px', minHeight: 58,
                      }}
                    >
                      <span style={{
                        width: 22, height: 22, borderRadius: 7, flexShrink: 0,
                        border: `1.5px solid ${seleccionado ? C.blue : C.line}`,
                        background: seleccionado ? C.blue : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: '#fff', fontSize: 13, fontWeight: 900,
                      }}>
                        {seleccionado ? '✓' : ''}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 14, fontWeight: 700, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {c.nombre}
                        </p>
                        <p style={{ fontSize: 11.5, color: C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {[c.categoria, formatLocalidad(c.localidad)].filter(Boolean).join(' · ') || 'No informado'}
                        </p>
                      </div>
                      {c.diasSinComprar != null && (
                        <span style={{ fontSize: 10.5, fontWeight: 700, color: C.amber, flexShrink: 0, whiteSpace: 'nowrap' }}>
                          {c.diasSinComprar}d sin comprar
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
            <button
              onClick={() => setVerTodos(true)}
              style={{
                width: '100%', minHeight: 44, marginTop: 10, borderRadius: 12, cursor: 'pointer',
                border: `1px solid ${C.line}`, background: 'transparent', color: C.blue,
                fontSize: 13, fontWeight: 700,
              }}
            >
              Ver todos los clientes ({totalConUbicacion})
            </button>
          </div>
        )}

        {/* ── Buscador + cartera completa: sólo al pedirlo explícitamente ── */}
        {(verTodos || busqueda) && (
          <>
            <div style={{ position: 'relative', marginBottom: 11 }}>
              <Search size={16} color={C.faint} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
              <input
                type="text"
                value={busqueda}
                onChange={e => setBusqueda(e.target.value)}
                placeholder="Buscar cliente, zona o categoría…"
                autoFocus={verTodos}
                style={{
                  width: '100%', minHeight: 48, paddingLeft: 38, paddingRight: 12, borderRadius: 12,
                  border: `1px solid ${C.line}`, background: C.card, fontSize: 15, color: C.text, outline: 'none',
                }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <p style={{ fontSize: 11.5, fontWeight: 800, color: C.muted, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                {busqueda ? `Resultados (${resultados.length})` : `Clientes con ubicación (${totalConUbicacion})`}
              </p>
              {!busqueda && (
                <button
                  onClick={() => setVerTodos(false)}
                  style={{ fontSize: 11.5, fontWeight: 700, color: C.blue, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                >
                  Volver a recomendados
                </button>
              )}
            </div>

            {buscandoClientes ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {[0, 1, 2, 3].map(i => <Skeleton key={i} height={58} radius={12} />)}
              </div>
            ) : errorBusqueda ? (
              <ErrorState
                compact
                title="No pudimos buscar clientes"
                hint="Revisa tu conexión e intenta de nuevo."
                detail={errorBusqueda}
                onRetry={() => ejecutarBusqueda(busqueda.trim())}
              />
            ) : totalConUbicacion === 0 && !busqueda ? (
              <EmptyState
                icon={MapPin}
                title="Todavía no hay clientes con ubicación"
                hint='Usa "Agregar dirección" de arriba para armar tu ruta.'
              />
            ) : resultados.length === 0 ? (
              <EmptyState
                icon={Search}
                title="Sin resultados"
                hint="Prueba con otro nombre, zona o categoría."
              />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {resultados.map(c => {
                  const seleccionado = enQueue.has(`cli-${c.nombre}`)
                  return (
                    <button
                      key={c.nombre}
                      onClick={() => toggleCliente(c)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 11, width: '100%', textAlign: 'left',
                        background: seleccionado ? C.blueSoft : C.card,
                        border: `1px solid ${seleccionado ? C.blue : C.line}`,
                        borderRadius: 12, cursor: 'pointer', padding: '11px 12px', minHeight: 58,
                      }}
                    >
                      <span style={{
                        width: 22, height: 22, borderRadius: 7, flexShrink: 0,
                        border: `1.5px solid ${seleccionado ? C.blue : C.line}`,
                        background: seleccionado ? C.blue : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: '#fff', fontSize: 13, fontWeight: 900,
                      }}>
                        {seleccionado ? '✓' : ''}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 14, fontWeight: 700, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {c.nombre}
                        </p>
                        <p style={{ fontSize: 11.5, color: C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {[c.categoria, formatLocalidad(c.localidad)].filter(Boolean).join(' · ') || 'No informado'}
                        </p>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}
