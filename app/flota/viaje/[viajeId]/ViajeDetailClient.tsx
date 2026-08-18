'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { MapPin, Plus, X, Navigation2, Clock, CheckCircle, FileText, Camera, ChevronDown, XCircle, Lock } from 'lucide-react'
import FlotaPageHeader from '@/components/ui/FlotaPageHeader'
import { createClient } from '@/lib/supabase/client'
import { compressImage } from '@/lib/compress-image'
import type { AppUser } from '@/lib/auth'

const F = '#D4AF37'

const MOTIVOS_NO_ENTREGA = ['Negocio cerrado', 'No contestó nadie', 'Rechazó el pedido', 'Otro motivo']

interface Parada {
  id: string
  nombre: string
  direccion: string
  lat?: number
  lng?: number
  verificada?: boolean
  fotoGuia?: string
  fotoProducto?: string
  entregado?: 'si' | 'no'
  motivoNoEntrega?: string
  /** Hora exacta en que se marcó la entrega — pedido de Claudio, para que
   *  el historial muestre horarios reales, no solo el estado final. */
  entregadoAt?: string
}

/** Estado en edición de una parada, antes de confirmar — nada de esto se
 *  persiste hasta tocar "Confirmar" en confirmarParada(). Así la foto de
 *  guía (o de evidencia si no se entregó) queda garantizada como
 *  obligatoria: no existe forma de que quede "Entregado" grabado sin ella. */
interface Borrador {
  entregado?: 'si' | 'no'
  motivoNoEntrega?: string
  fotoGuia?: string
  fotoProducto?: string
}

interface SugerenciaGeo {
  place_id: number
  display_name: string
  lat: string
  lon: string
  address: {
    house_number?: string
    road?: string
    neighbourhood?: string
    suburb?: string
    city?: string
    town?: string
  }
}

interface Vehiculo {
  nombre: string; tipo: string; patente: string | null
  modelo: string | null; color: string | null; combustible: string | null; km_actual: number
}

interface Props {
  user: AppUser
  viaje: {
    id: string
    vehiculo_id: string
    tipo: string
    motivo: string | null
    km_inicio: number | null
    km_teoricos: number | null
    km_fin?: number | null
    iniciado_at: string
    destino_declarado: string | null
    estado: string
    repartos_terminados?: boolean
    conductor_id: string | null
    conductor: { nombre: string } | null
    vehiculo: Vehiculo
    foto_odometro_inicio?: string | null
    foto_360_frente_inicio?: string | null
    foto_360_izquierdo_inicio?: string | null
    foto_360_derecho_inicio?: string | null
    foto_360_atras_inicio?: string | null
    foto_combustible_inicio?: string | null
    foto_odometro_fin?: string | null
    foto_360_frente_fin?: string | null
    foto_360_izquierdo_fin?: string | null
    foto_360_derecho_fin?: string | null
    foto_360_atras_fin?: string | null
    foto_combustible_fin?: string | null
    foto_boleta_combustible?: string | null
  }
}

/** Toda la evidencia fotográfica del check-in (siempre) y del checkout (solo
 *  si el viaje ya se cerró) — pedido de Claudio: esta pantalla no mostraba
 *  ninguna de estas fotos aunque ya existieran en la base de datos. */
function fotosVehiculo(viaje: Props['viaje']): { url: string; label: string }[] {
  return [
    { url: viaje.foto_odometro_inicio ?? '', label: 'Odómetro (salida)' },
    { url: viaje.foto_combustible_inicio ?? '', label: 'Combustible (salida)' },
    { url: viaje.foto_360_frente_inicio ?? '', label: '360° Frente (salida)' },
    { url: viaje.foto_360_izquierdo_inicio ?? '', label: '360° Izq. (salida)' },
    { url: viaje.foto_360_derecho_inicio ?? '', label: '360° Der. (salida)' },
    { url: viaje.foto_360_atras_inicio ?? '', label: '360° Atrás (salida)' },
    { url: viaje.foto_odometro_fin ?? '', label: 'Odómetro (llegada)' },
    { url: viaje.foto_combustible_fin ?? '', label: 'Combustible (llegada)' },
    { url: viaje.foto_360_frente_fin ?? '', label: '360° Frente (llegada)' },
    { url: viaje.foto_360_izquierdo_fin ?? '', label: '360° Izq. (llegada)' },
    { url: viaje.foto_360_derecho_fin ?? '', label: '360° Der. (llegada)' },
    { url: viaje.foto_360_atras_fin ?? '', label: '360° Atrás (llegada)' },
    { url: viaje.foto_boleta_combustible ?? '', label: 'Boleta combustible' },
  ].filter(f => f.url)
}

function parseParadas(destino: string | null): Parada[] {
  if (!destino) return []
  try {
    const data = JSON.parse(destino)
    if (Array.isArray(data)) {
      return data.map((p, i) => ({
        id: String(i),
        nombre: p.n || p.nombre || '',
        direccion: p.d || p.direccion || '',
        lat: p.lat ?? undefined,
        lng: p.lng ?? undefined,
        verificada: !!(p.lat && p.lng),
        fotoGuia: p.fg ?? undefined,
        fotoProducto: p.fp ?? undefined,
        entregado: p.en ?? undefined,
        motivoNoEntrega: p.mn ?? undefined,
        entregadoAt: p.ea ?? undefined,
      }))
    }
  } catch { /* plain text */ }
  return destino.trim() ? [{ id: '0', nombre: destino, direccion: destino }] : []
}

function urlGoogleMaps(paradas: Parada[]): string {
  const base = encodeURIComponent('El Regreso Beer, Valdivia, Chile')
  if (paradas.length === 0) return `https://www.google.com/maps/search/El+Regreso+Beer,+Valdivia,+Chile`
  const stops = paradas.map(p => {
    if (p.lat && p.lng) return `${p.lat},${p.lng}`
    const dir = p.direccion || p.nombre
    return encodeURIComponent(dir.toLowerCase().includes('valdivia') ? dir : `${dir}, Valdivia, Chile`)
  }).join('/')
  return `https://www.google.com/maps/dir/${base}/${stops}/${base}`
}

/** Waze no soporta rutas de varias paradas por URL como Google Maps (solo
 *  navega a UN destino a la vez) — así que en vez de fingir soportarlo,
 *  siempre apunta a la próxima parada sin resolver (o a la primera si ya
 *  quedaron todas resueltas), que es lo que el conductor necesita en el
 *  momento. */
function urlWaze(paradas: Parada[]): string {
  if (paradas.length === 0) return 'https://waze.com/ul?q=El%20Regreso%20Beer%2C%20Valdivia%2C%20Chile&navigate=yes'
  const siguiente = paradas.find(p => !p.entregado) ?? paradas[0]
  if (siguiente.lat && siguiente.lng) {
    return `https://waze.com/ul?ll=${siguiente.lat}%2C${siguiente.lng}&navigate=yes`
  }
  const dir = siguiente.direccion || siguiente.nombre
  const q = encodeURIComponent(dir.toLowerCase().includes('valdivia') ? dir : `${dir}, Valdivia, Chile`)
  return `https://waze.com/ul?q=${q}&navigate=yes`
}

/** Hora exacta de salida (pedido de Claudio), además del "hace cuánto". */
function horaExacta(iso: string) {
  return new Date(iso).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Santiago' })
}

const TIPO_VIAJE_LABEL: Record<string, string> = {
  reparto: 'Reparto', tramite: 'Trámite', operador_logistico: 'Operador logístico',
}

function tiempoTranscurrido(iso: string) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 60) return `${mins} min`
  return `${Math.floor(mins / 60)}h ${mins % 60 > 0 ? ` ${mins % 60}m` : ''}`
}

function formatGeoDir(s: SugerenciaGeo): string {
  const a = s.address
  const calle = [a.road, a.house_number].filter(Boolean).join(' ')
  const barrio = a.neighbourhood || a.suburb || ''
  const ciudad = a.city || a.town || 'Valdivia'
  return [calle, barrio, ciudad].filter(Boolean).join(', ')
}

function InputDireccionValidada({ onConfirmar, onCancelar }: {
  onConfirmar: (p: Omit<Parada, 'id'>) => void
  onCancelar: () => void
}) {
  const [query, setQuery] = useState('')
  const [sugerencias, setSugerencias] = useState<SugerenciaGeo[]>([])
  const [buscando, setBuscando] = useState(false)
  const [seleccionada, setSeleccionada] = useState<SugerenciaGeo | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  function handleChange(txt: string) {
    setQuery(txt); setSeleccionada(null); clearTimeout(timer.current)
    if (txt.trim().length < 4) { setSugerencias([]); return }
    timer.current = setTimeout(async () => {
      setBuscando(true)
      try {
        const res = await fetch(`/api/geocode?q=${encodeURIComponent(txt)}`)
        setSugerencias(await res.json())
      } catch { /* silently fail */ } finally { setBuscando(false) }
    }, 420)
  }

  function elegir(s: SugerenciaGeo) {
    setSeleccionada(s); setQuery(formatGeoDir(s)); setSugerencias([])
  }

  function confirmar() {
    const dir = query.trim()
    if (!dir) return
    onConfirmar({
      nombre: dir.split(',')[0].trim(),
      direccion: dir,
      lat: seleccionada ? parseFloat(seleccionada.lat) : undefined,
      lng: seleccionada ? parseFloat(seleccionada.lon) : undefined,
      verificada: !!seleccionada,
    })
  }

  return (
    <div style={{ background: '#141414', border: `1px solid rgba(212,175,55,0.28)`, borderRadius: 12, overflow: 'hidden', marginBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', padding: '0 12px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <MapPin size={14} color={seleccionada ? '#5A8A4A' : 'var(--muted)'} style={{ flexShrink: 0 }} />
        <input autoFocus value={query} onChange={e => handleChange(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !sugerencias.length && confirmar()}
          placeholder="Ej: Picarte 3000"
          style={{ flex: 1, padding: '12px 10px', background: 'transparent', border: 'none', color: '#F4EEDF', fontSize: 14, outline: 'none' }} />
        {buscando && <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: '50%', border: `2px solid ${F}`, borderTopColor: 'transparent', animation: 'spin 0.7s linear infinite', flexShrink: 0 }} />}
        <button onClick={onCancelar} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', display: 'flex', padding: 4, marginLeft: 4 }}>
          <X size={14} />
        </button>
      </div>
      {seleccionada && (
        <div style={{ padding: '8px 14px', background: 'rgba(90,138,74,0.06)', borderBottom: '1px solid rgba(90,138,74,0.15)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <CheckCircle size={12} color="#5A8A4A" />
          <span style={{ fontSize: 11, color: '#5A8A4A', fontWeight: 700 }}>Dirección verificada en el mapa</span>
        </div>
      )}
      {sugerencias.map(s => (
        <div key={s.place_id} onMouseDown={() => elegir(s)}
          style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.04)', display: 'flex', alignItems: 'flex-start', gap: 10 }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(212,175,55,0.08)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
          <MapPin size={13} color={F} style={{ flexShrink: 0, marginTop: 2 }} />
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#F4EEDF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {[s.address.road, s.address.house_number].filter(Boolean).join(' ') || s.display_name.split(',')[0]}
            </p>
            <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {[s.address.neighbourhood || s.address.suburb, s.address.city || s.address.town || 'Valdivia'].filter(Boolean).join(', ')}
            </p>
          </div>
        </div>
      ))}
      {!buscando && query.trim().length >= 4 && sugerencias.length === 0 && !seleccionada && (
        <p style={{ padding: '10px 14px', fontSize: 12, color: 'var(--muted)', textAlign: 'center' }}>Sin resultados · puedes agregar como texto libre</p>
      )}
      <div style={{ display: 'flex', gap: 6, padding: '10px 12px' }}>
        <button onMouseDown={confirmar} disabled={!query.trim()}
          style={{ flex: 1, padding: '10px', borderRadius: 9, border: 'none', cursor: query.trim() ? 'pointer' : 'not-allowed', background: query.trim() ? (seleccionada ? '#5A8A4A' : F) : 'rgba(255,255,255,0.06)', color: query.trim() ? (seleccionada ? '#000' : '#fff') : 'var(--muted)', fontSize: 13, fontWeight: 700 }}>
          {seleccionada ? '✓ Confirmar dirección' : 'Agregar parada'}
        </button>
        <button onMouseDown={onCancelar} style={{ padding: '10px 14px', borderRadius: 9, border: 'none', cursor: 'pointer', background: 'rgba(255,255,255,0.06)', color: 'var(--muted)', fontSize: 13 }}>
          Cancelar
        </button>
      </div>
    </div>
  )
}

export default function ViajeDetailClient({ user, viaje }: Props) {
  const router = useRouter()
  const supabase = createClient()

  // Pedido explícito de Claudio (corrigiendo una excepción que yo había
  // agregado para admin): SOLO quien maneja este viaje puede marcar
  // entregas, agregar paradas o cerrarlo — sin excepción para admin,
  // aunque sea Claudio mismo. Cualquier otro que entre a este viaje solo
  // puede ver el estado y la ruta, nada de tocar los datos de la entrega
  // ajena.
  const puedeEditar = !!viaje.conductor_id && user.id === viaje.conductor_id
  const [paradas, setParadas] = useState<Parada[]>(() => parseParadas(viaje.destino_declarado))
  const [modoAdd, setModoAdd] = useState(false)
  const [kmCalculado, setKmCalculado] = useState<number | null>(viaje.km_teoricos)
  const [calculandoRuta, setCalculandoRuta] = useState(false)
  const [tiempo, setTiempo] = useState(tiempoTranscurrido(viaje.iniciado_at))
  const completado = viaje.estado === 'completado'
  const [repartosTerminados, setRepartosTerminados] = useState(!!viaje.repartos_terminados)
  const [marcandoRepartos, setMarcandoRepartos] = useState(false)
  const [mostrarFotosVehiculo, setMostrarFotosVehiculo] = useState(false)
  const fotosDelVehiculo = fotosVehiculo(viaje)

  // El viaje NO termina al entregar el último pedido — termina cuando el
  // repartidor vuelve a la base/bodega. Este paso intermedio solo marca
  // que ya no quedan entregas pendientes, sin cerrar el viaje todavía.
  async function marcarRepartosTerminados() {
    setMarcandoRepartos(true)
    try {
      await supabase.from('viajes_flota').update({ repartos_terminados: true }).eq('id', viaje.id)
      setRepartosTerminados(true)
    } finally {
      setMarcandoRepartos(false)
    }
  }

  // Actualizar reloj cada minuto
  useEffect(() => {
    const t = setInterval(() => setTiempo(tiempoTranscurrido(viaje.iniciado_at)), 60000)
    return () => clearInterval(t)
  }, [viaje.iniciado_at])

  // Recalcular km al cambiar paradas
  useEffect(() => {
    if (paradas.length < 2) return
    const t = setTimeout(async () => {
      setCalculandoRuta(true)
      try {
        const res = await fetch('/api/calcular-ruta', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paradas }),
        })
        const data = await res.json()
        if (data.km > 0) setKmCalculado(data.km)
      } catch { /* silently fail */ } finally { setCalculandoRuta(false) }
    }, 700)
    return () => clearTimeout(t)
  }, [paradas]) // eslint-disable-line react-hooks/exhaustive-deps

  async function guardarParadas(nuevas: Parada[]) {
    setParadas(nuevas)
    const destino = JSON.stringify(nuevas.map(p => ({ n: p.nombre, d: p.direccion, lat: p.lat, lng: p.lng, fg: p.fotoGuia, fp: p.fotoProducto, en: p.entregado, mn: p.motivoNoEntrega, ea: p.entregadoAt })))
    await supabase.from('viajes_flota').update({ destino_declarado: destino }).eq('id', viaje.id)
  }

  const [paradaAbierta, setParadaAbierta] = useState<string | null>(null)
  const [subiendoFoto, setSubiendoFoto] = useState<Record<string, boolean>>({})
  const [otroMotivoTexto, setOtroMotivoTexto] = useState<Record<string, string>>({})
  const [borradores, setBorradores] = useState<Record<string, Borrador>>({})
  const [guardandoParada, setGuardandoParada] = useState<Record<string, boolean>>({})

  function borradorBase(paradaId: string): Borrador {
    const p = paradas.find(pp => pp.id === paradaId)
    return { entregado: p?.entregado, motivoNoEntrega: p?.motivoNoEntrega, fotoGuia: p?.fotoGuia, fotoProducto: p?.fotoProducto }
  }

  function actualizarBorrador(paradaId: string, patch: Partial<Borrador>) {
    setBorradores(prev => ({ ...prev, [paradaId]: { ...(prev[paradaId] ?? borradorBase(paradaId)), ...patch } }))
  }

  async function subirFotoParada(paradaId: string, tipo: 'guia' | 'producto', file: File) {
    const key = `${paradaId}-${tipo}`
    setSubiendoFoto(prev => ({ ...prev, [key]: true }))
    try {
      const compressed = await compressImage(file, { maxDim: 1600, quality: 0.8 })
      const path = `viajes/${viaje.id}/parada-${paradaId}-${tipo}-${Date.now()}.jpg`
      const { error } = await supabase.storage.from('logistica-evidence').upload(path, compressed, { upsert: true, contentType: 'image/jpeg' })
      if (error) throw error
      const { data: { publicUrl } } = supabase.storage.from('logistica-evidence').getPublicUrl(path)
      actualizarBorrador(paradaId, tipo === 'guia' ? { fotoGuia: publicUrl } : { fotoProducto: publicUrl })
    } catch (err) {
      console.error(err)
      alert('Error al subir la imagen. Intenta de nuevo.')
    } finally {
      setSubiendoFoto(prev => ({ ...prev, [key]: false }))
    }
  }

  // Pedido explícito de Claudio: la foto de guía es obligatoria SIEMPRE,
  // se haya entregado el pedido o no (en ese caso es la evidencia de por qué
  // no se entregó) — nada se persiste hasta que esta validación pasa, igual
  // que confirmar() en EntregarClient.tsx (módulo de despachos).
  function confirmarParada(paradaId: string) {
    const b = borradores[paradaId] ?? borradorBase(paradaId)
    if (!b.entregado) return
    if (!b.fotoGuia) {
      alert(b.entregado === 'si'
        ? 'La foto de guía es obligatoria para marcar el pedido como entregado.'
        : 'La foto de evidencia es obligatoria aunque el pedido no se haya entregado.')
      return
    }
    if (b.entregado === 'no' && !b.motivoNoEntrega) {
      alert('Indica el motivo de la no entrega.')
      return
    }
    setGuardandoParada(prev => ({ ...prev, [paradaId]: true }))
    guardarParadas(paradas.map(p => p.id === paradaId ? {
      ...p, entregado: b.entregado, motivoNoEntrega: b.motivoNoEntrega,
      fotoGuia: b.fotoGuia, fotoProducto: b.fotoProducto, entregadoAt: new Date().toISOString(),
    } : p)).finally(() => {
      setGuardandoParada(prev => ({ ...prev, [paradaId]: false }))
      setBorradores(prev => { const next = { ...prev }; delete next[paradaId]; return next })
      setParadaAbierta(null)
    })
  }

  // Una parada queda "resuelta" cuando el repartidor dejó constancia de qué pasó:
  // entregada con foto de guía (el producto es opcional), o marcada como no
  // entregada con su motivo Y su foto de evidencia — sin esto no se puede
  // cerrar el viaje.
  const paradaResuelta = (p: Parada) => (p.entregado === 'si' && !!p.fotoGuia) || (p.entregado === 'no' && !!p.motivoNoEntrega && !!p.fotoGuia)
  const paradasPendientes = paradas.filter(p => !paradaResuelta(p))

  const minEst = kmCalculado ? Math.round(kmCalculado / 35 * 60) : null
  const tiempoEst = !minEst ? null : minEst < 60 ? `${minEst} min` : `${Math.floor(minEst / 60)}h${minEst % 60 > 0 ? ` ${minEst % 60}m` : ''}`

  return (
    <div style={{ flex: 1, minHeight: 0, background: '#080808', display: 'flex', flexDirection: 'column' }}>

      <FlotaPageHeader
        title={viaje.vehiculo.nombre}
        subtitle={`${TIPO_VIAJE_LABEL[viaje.tipo] ?? viaje.tipo} · Salió ${horaExacta(viaje.iniciado_at)} · hace ${tiempo}`}
        onBack={() => router.push('/flota')}
        backLabel="Volver"
      />

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 14, paddingBottom: 100 }}>
        {/* Banner viaje terminado */}
        {completado && (
          <div style={{ background: 'rgba(90,138,74,0.08)', border: '1px solid rgba(90,138,74,0.25)', borderRadius: 14, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <CheckCircle size={22} color="#5A8A4A" style={{ flexShrink: 0 }} />
            <div>
              <p style={{ fontSize: 14, fontWeight: 900, color: '#5A8A4A' }}>Viaje terminado</p>
              <p style={{ fontSize: 11, color: 'var(--muted)' }}>Este viaje fue completado exitosamente</p>
            </div>
          </div>
        )}

        {/* Info del viaje */}
        <div style={{ background: 'rgba(212,175,55,0.06)', border: '1px solid rgba(212,175,55,0.18)', borderRadius: 14, padding: '14px 16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <p style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 3 }}>Conductor</p>
              <p style={{ fontSize: 15, fontWeight: 800, color: '#F4EEDF' }}>{viaje.conductor?.nombre?.split(' ')[0] ?? '—'}</p>
            </div>
            <div>
              <p style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 3 }}>KM salida</p>
              <p style={{ fontSize: 15, fontWeight: 800, color: '#F4EEDF' }}>{viaje.km_inicio?.toLocaleString('es-CL') ?? '—'} km</p>
            </div>
            {kmCalculado && (
              <>
                <div>
                  <p style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 3 }}>
                    Distancia ruta
                  </p>
                  <p style={{ fontSize: 20, fontWeight: 900, color: F, letterSpacing: '-0.5px' }}>
                    {calculandoRuta ? '…' : `${kmCalculado} km`}
                  </p>
                </div>
                <div>
                  <p style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 3, display: 'flex', alignItems: 'center', gap: 3 }}>
                    <Clock size={9} /> Tiempo est.
                  </p>
                  <p style={{ fontSize: 20, fontWeight: 900, color: '#F4EEDF', letterSpacing: '-0.5px' }}>{tiempoEst ?? '—'}</p>
                </div>
              </>
            )}
          </div>
          {viaje.motivo && (
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <p style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 3 }}>Motivo</p>
              <p style={{ fontSize: 13, color: '#F4EEDF' }}>{viaje.motivo}</p>
            </div>
          )}
        </div>

        {/* Evidencia fotográfica del vehículo — check-in siempre, checkout
            solo si el viaje ya se cerró (esta pantalla no la mostraba). */}
        {fotosDelVehiculo.length > 0 && (
          <div>
            <button
              onClick={() => setMostrarFotosVehiculo(v => !v)}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.07)', background: '#141414', cursor: 'pointer', color: '#F4EEDF', fontSize: 12, fontWeight: 700 }}
            >
              <span>📸 Evidencia fotográfica del vehículo ({fotosDelVehiculo.length})</span>
              <ChevronDown size={14} color="rgba(255,255,255,0.4)" style={{ transition: 'transform 0.15s', transform: mostrarFotosVehiculo ? 'rotate(180deg)' : 'none' }} />
            </button>
            {mostrarFotosVehiculo && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 8 }}>
                {fotosDelVehiculo.map(f => (
                  <div key={f.label} style={{ borderRadius: 10, overflow: 'hidden', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <a href={f.url} target="_blank" rel="noopener noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={f.url} alt={f.label} style={{ width: '100%', height: 90, objectFit: 'cover', display: 'block' }} />
                      <div style={{ padding: '5px 8px', fontSize: 9, fontWeight: 700, color: 'var(--muted)' }}>{f.label}</div>
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Paradas */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', letterSpacing: '1px', textTransform: 'uppercase' }}>
              Paradas{paradas.length > 0 ? ` (${paradas.length})` : ''}
            </p>
          </div>

          {paradas.length === 0 && !modoAdd && (
            <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>Sin paradas registradas</p>
          )}

          {paradas.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
              {paradas.map((p, i) => {
                const abierta = paradaAbierta === p.id
                // Pedido de Claudio: la tarjeta completa cambia de color
                // según el estado de la entrega -no solo el borde-, y se
                // mantiene el color actual (neutro) mientras esté pendiente.
                const estadoCard = p.entregado === 'no' && p.fotoGuia
                  ? { bg: 'rgba(181,84,62,0.14)', border: 'rgba(181,84,62,0.4)' }
                  : p.entregado === 'si' && p.fotoGuia
                    ? { bg: 'rgba(90,138,74,0.14)', border: 'rgba(90,138,74,0.4)' }
                    : { bg: '#141414', border: abierta ? 'rgba(212,175,55,0.3)' : 'rgba(255,255,255,0.07)' }
                return (
                <div key={p.id} style={{ background: estadoCard.bg, border: `1px solid ${estadoCard.border}`, borderRadius: 10, overflow: 'hidden' }}>
                  <div onClick={() => setParadaAbierta(abierta ? null : p.id)} style={{ padding: '10px 12px', display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
                    <span style={{ fontSize: 10, fontWeight: 800, color: 'rgba(212,175,55,0.6)', minWidth: 16, marginTop: 2 }}>{i + 1}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <p style={{ fontSize: 13, fontWeight: 700, color: '#F4EEDF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nombre}</p>
                        {p.verificada && <CheckCircle size={11} color="#5A8A4A" style={{ flexShrink: 0 }} />}
                        {p.entregado === 'si' && p.fotoGuia && <FileText size={11} color="#5A8A4A" style={{ flexShrink: 0 }} />}
                        {p.entregado === 'no' && p.fotoGuia && <XCircle size={11} color="#B5543E" style={{ flexShrink: 0 }} />}
                      </div>
                      {p.direccion && p.direccion !== p.nombre && (
                        <p style={{ fontSize: 11, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.direccion}</p>
                      )}
                      {!p.entregado && (
                        <p style={{ fontSize: 10, color: 'rgba(212,175,55,0.6)', marginTop: 2 }}>Falta marcar si se entregó</p>
                      )}
                      {p.entregado === 'si' && !p.fotoGuia && (
                        <p style={{ fontSize: 10, color: 'rgba(212,175,55,0.6)', marginTop: 2 }}>Falta foto de guía</p>
                      )}
                      {p.entregado === 'si' && p.fotoGuia && (
                        <p style={{ fontSize: 10, color: '#5A8A4A', marginTop: 2 }}>
                          Entregado{p.entregadoAt ? ` · ${horaExacta(p.entregadoAt)}` : ''}
                        </p>
                      )}
                      {p.entregado === 'no' && !p.fotoGuia && (
                        <p style={{ fontSize: 10, color: 'rgba(212,175,55,0.6)', marginTop: 2 }}>
                          {p.motivoNoEntrega ? 'Falta foto de evidencia' : 'Falta indicar motivo y foto de evidencia'}
                        </p>
                      )}
                      {p.entregado === 'no' && p.fotoGuia && (
                        <p style={{ fontSize: 10, color: '#B5543E', marginTop: 2 }}>
                          No entregado{p.motivoNoEntrega ? `: ${p.motivoNoEntrega}` : ''}{p.entregadoAt ? ` · ${horaExacta(p.entregadoAt)}` : ''}
                        </p>
                      )}
                    </div>
                    <ChevronDown size={14} color="rgba(255,255,255,0.3)" style={{ flexShrink: 0, marginTop: 2, transition: 'transform 0.15s', transform: abierta ? 'rotate(180deg)' : 'none' }} />
                  </div>

                  {abierta && !puedeEditar && (
                    <div style={{ padding: '0 12px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                        <Lock size={12} color="var(--muted)" style={{ flexShrink: 0 }} />
                        <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                          Solo {viaje.conductor?.nombre?.split(' ')[0] ?? 'quien maneja este viaje'} puede marcar esta entrega
                        </span>
                      </div>
                      {(p.fotoGuia || p.fotoProducto) && (
                        <div style={{ display: 'flex', gap: 8 }}>
                          {p.fotoGuia && <a href={p.fotoGuia} target="_blank" rel="noopener noreferrer" style={{ flex: 1, display: 'block' }}><img src={p.fotoGuia} alt="Guía" style={{ width: '100%', borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)' }} /></a>}
                          {p.fotoProducto && <a href={p.fotoProducto} target="_blank" rel="noopener noreferrer" style={{ flex: 1, display: 'block' }}><img src={p.fotoProducto} alt="Producto" style={{ width: '100%', borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)' }} /></a>}
                        </div>
                      )}
                    </div>
                  )}

                  {abierta && puedeEditar && (() => {
                    const b = borradores[p.id] ?? borradorBase(p.id)
                    const esEvidenciaNoEntrega = b.entregado === 'no'
                    return (
                    <div style={{ padding: '0 12px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {/* ── ¿Se entregó el pedido? ── */}
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          onClick={() => actualizarBorrador(p.id, { entregado: 'si' })}
                          style={{
                            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px 0', borderRadius: 10, cursor: 'pointer',
                            border: `1.5px solid ${b.entregado === 'si' ? '#5A8A4A' : 'rgba(255,255,255,0.1)'}`,
                            background: b.entregado === 'si' ? 'rgba(90,138,74,0.12)' : 'transparent',
                            color: b.entregado === 'si' ? '#5A8A4A' : 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: 700,
                          }}
                        >
                          <CheckCircle size={14} /> Entregado
                        </button>
                        <button
                          onClick={() => actualizarBorrador(p.id, { entregado: 'no' })}
                          style={{
                            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px 0', borderRadius: 10, cursor: 'pointer',
                            border: `1.5px solid ${b.entregado === 'no' ? '#B5543E' : 'rgba(255,255,255,0.1)'}`,
                            background: b.entregado === 'no' ? 'rgba(181,84,62,0.12)' : 'transparent',
                            color: b.entregado === 'no' ? '#B5543E' : 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: 700,
                          }}
                        >
                          <XCircle size={14} /> No entregado
                        </button>
                      </div>

                      {b.entregado === 'no' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {MOTIVOS_NO_ENTREGA.map(m => (
                              <button
                                key={m}
                                onClick={() => actualizarBorrador(p.id, { motivoNoEntrega: m === 'Otro motivo' ? (otroMotivoTexto[p.id]?.trim() ? `Otro: ${otroMotivoTexto[p.id].trim()}` : 'Otro motivo') : m })}
                                style={{
                                  padding: '8px 12px', borderRadius: 10, cursor: 'pointer',
                                  border: `1.5px solid ${b.motivoNoEntrega === m || (m === 'Otro motivo' && b.motivoNoEntrega?.startsWith('Otro:')) ? '#B5543E' : 'rgba(255,255,255,0.1)'}`,
                                  background: b.motivoNoEntrega === m || (m === 'Otro motivo' && b.motivoNoEntrega?.startsWith('Otro:')) ? 'rgba(181,84,62,0.12)' : 'transparent',
                                  color: b.motivoNoEntrega === m || (m === 'Otro motivo' && b.motivoNoEntrega?.startsWith('Otro:')) ? '#B5543E' : 'rgba(255,255,255,0.5)',
                                  fontSize: 11, fontWeight: 700,
                                }}
                              >
                                {m}
                              </button>
                            ))}
                          </div>
                          {(b.motivoNoEntrega === 'Otro motivo' || b.motivoNoEntrega?.startsWith('Otro:')) && (
                            <input
                              value={otroMotivoTexto[p.id] ?? (b.motivoNoEntrega?.startsWith('Otro: ') ? b.motivoNoEntrega.slice(6) : '')}
                              onChange={e => setOtroMotivoTexto(prev => ({ ...prev, [p.id]: e.target.value }))}
                              onBlur={() => { const t = otroMotivoTexto[p.id]?.trim(); if (t) actualizarBorrador(p.id, { motivoNoEntrega: `Otro: ${t}` }) }}
                              placeholder="Escribe el motivo…"
                              style={{ padding: '10px 12px', borderRadius: 10, background: '#0D0D0D', border: '1px solid rgba(255,255,255,0.1)', color: '#F4EEDF', fontSize: 13, outline: 'none' }}
                            />
                          )}
                        </div>
                      )}

                      {/* Foto de guía (entregado) o de evidencia (no entregado) — siempre obligatoria */}
                      {b.entregado && (['guia', 'producto'] as const).filter(tipo => tipo === 'guia' || b.entregado === 'si').map(tipo => {
                        const url = tipo === 'guia' ? b.fotoGuia : b.fotoProducto
                        const subiendo = subiendoFoto[`${p.id}-${tipo}`]
                        const inputId = `foto-${p.id}-${tipo}`
                        const esEvidencia = tipo === 'guia' && esEvidenciaNoEntrega
                        return (
                          <div key={tipo}>
                            <input
                              id={inputId} type="file" accept="image/*" capture="environment" hidden
                              onChange={e => { const f = e.target.files?.[0]; if (f) subirFotoParada(p.id, tipo, f) }}
                            />
                            <label htmlFor={inputId} style={{
                              display: 'flex', alignItems: 'center', gap: 10, padding: '11px 12px', borderRadius: 10, cursor: 'pointer',
                              border: `1px solid ${url ? '#5A8A4A55' : 'rgba(255,255,255,0.1)'}`,
                              background: url ? 'rgba(90,138,74,0.08)' : 'rgba(255,255,255,0.03)',
                              color: url ? '#5A8A4A' : 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: 700,
                            }}>
                              {tipo === 'guia' ? <FileText size={15} /> : <Camera size={15} />}
                              {subiendo
                                ? 'Subiendo…'
                                : url
                                  ? `✓ Foto de ${esEvidencia ? 'evidencia' : tipo === 'guia' ? 'guía' : 'producto entregado'} cargada`
                                  : esEvidencia ? 'Foto de evidencia (obligatorio)' : tipo === 'guia' ? 'Foto de guía (obligatorio)' : 'Foto de producto entregado (opcional)'}
                            </label>
                          </div>
                        )
                      })}

                      {b.entregado && (
                        <button
                          onClick={() => confirmarParada(p.id)}
                          disabled={!!guardandoParada[p.id]}
                          style={{
                            padding: '11px 0', borderRadius: 10, border: 'none', cursor: 'pointer',
                            background: F, color: '#000', fontSize: 13, fontWeight: 800,
                            opacity: guardandoParada[p.id] ? 0.7 : 1,
                          }}
                        >
                          {guardandoParada[p.id] ? 'Guardando…' : 'Confirmar'}
                        </button>
                      )}
                    </div>
                    )
                  })()}
                </div>
                )
              })}
            </div>
          )}

          {puedeEditar && modoAdd && (
            <InputDireccionValidada
              onConfirmar={async (datos) => {
                const nueva: Parada = { id: Date.now().toString(), ...datos }
                await guardarParadas([...paradas, nueva])
                setModoAdd(false)
              }}
              onCancelar={() => setModoAdd(false)}
            />
          )}

          {puedeEditar && !modoAdd && (
            <button onClick={() => setModoAdd(true)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px 14px', borderRadius: 10, border: '1px dashed rgba(255,255,255,0.15)', background: 'transparent', color: 'var(--muted)', fontSize: 13, fontWeight: 600, cursor: 'pointer', width: '100%' }}>
              <Plus size={14} /> Agregar parada
            </button>
          )}
        </div>

        {/* Google Maps — ruta completa con todas las paradas en orden */}
        <a href={urlGoogleMaps(paradas)} target="_blank" rel="noopener noreferrer"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '15px', borderRadius: 12, background: 'rgba(66,133,244,0.12)', border: '1px solid rgba(66,133,244,0.3)', color: '#F4EEDF', fontSize: 14, fontWeight: 700, textDecoration: 'none' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" fill="#F4EEDF"/>
          </svg>
          {paradas.length > 0 ? `Ver ruta en Google Maps (${paradas.length} paradas)` : 'Abrir Google Maps'}
        </a>

        {/* Waze — a diferencia de Google Maps, no soporta varias paradas en
            una sola ruta por URL, así que navega a la próxima parada sin
            resolver (la que el conductor necesita ahora). */}
        <a href={urlWaze(paradas)} target="_blank" rel="noopener noreferrer"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '15px', borderRadius: 12, background: 'rgba(51,199,255,0.12)', border: '1px solid rgba(51,199,255,0.3)', color: '#F4EEDF', fontSize: 14, fontWeight: 700, textDecoration: 'none' }}>
          <Navigation2 size={18} color="#33C7FF" />
          {paradas.length > 1 ? 'Ver en Waze (próxima parada)' : 'Abrir en Waze'}
        </a>

      </div>

      {/* Footer sticky */}
      <div style={{ padding: '12px 16px', paddingBottom: 'max(12px, env(safe-area-inset-bottom))', background: '#0F0F0F', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', gap: 8 }}>
        {completado ? (
          <>
            <div style={{ flex: 1, padding: '16px', borderRadius: 14, background: 'rgba(90,138,74,0.12)', border: '1px solid rgba(90,138,74,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <CheckCircle size={18} color="#5A8A4A" />
              <span style={{ fontSize: 15, fontWeight: 900, color: '#5A8A4A' }}>Viaje terminado</span>
            </div>
            <button onClick={() => router.push('/flota')}
              style={{ flex: '0 0 auto', padding: '16px 20px', borderRadius: 14, border: 'none', background: F, color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
              Volver
            </button>
          </>
        ) : !puedeEditar ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '14px', borderRadius: 14, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <Lock size={14} color="var(--muted)" />
            <span style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center' }}>
              {repartosTerminados
                ? `Repartos terminados — esperando que ${viaje.conductor?.nombre?.split(' ')[0] ?? 'el conductor'} cierre el viaje`
                : 'Solo quien maneja este viaje puede marcar las entregas'}
            </span>
          </div>
        ) : repartosTerminados ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <p style={{ fontSize: 11, color: '#D4AF37', textAlign: 'center', fontWeight: 700 }}>
              Repartos terminados — cuando llegues a la base/bodega, toca &ldquo;Viaje terminado&rdquo; para registrar odómetro, inspección 360° y combustible de cierre
            </p>
            <button
              onClick={() => router.push(`/flota/checkout/${viaje.id}`)}
              style={{ padding: '16px', borderRadius: 14, border: 'none', cursor: 'pointer', background: '#5A8A4A', color: '#000', fontSize: 15, fontWeight: 900 }}
            >
              Viaje terminado ✓
            </button>
          </div>
        ) : (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {paradasPendientes.length > 0 && (
              <p style={{ fontSize: 11, color: '#D4AF37', textAlign: 'center', fontWeight: 700 }}>
                Faltan {paradasPendientes.length} parada{paradasPendientes.length !== 1 ? 's' : ''} por resolver (entregada con foto de guía, o no entregada con motivo y foto de evidencia)
              </p>
            )}
            <button
              onClick={() => { if (paradasPendientes.length === 0) marcarRepartosTerminados() }}
              disabled={paradasPendientes.length > 0 || marcandoRepartos}
              style={{
                padding: '16px', borderRadius: 14, border: 'none', cursor: paradasPendientes.length > 0 ? 'not-allowed' : 'pointer',
                background: paradasPendientes.length > 0 ? 'rgba(255,255,255,0.06)' : '#5A8A4A',
                color: paradasPendientes.length > 0 ? 'var(--muted)' : '#000', fontSize: 15, fontWeight: 900,
                opacity: marcandoRepartos ? 0.7 : 1,
              }}
            >
              {marcandoRepartos ? 'Guardando…' : 'Repartos terminados ✓'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
