'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { MapPin, Plus, X, Search, Navigation2, Clock, CheckCircle, FileText, Camera, ChevronDown, XCircle } from 'lucide-react'
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
    iniciado_at: string
    destino_declarado: string | null
    estado: string
    conductor: { nombre: string } | null
    vehiculo: Vehiculo
  }
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
  const [paradas, setParadas] = useState<Parada[]>(() => parseParadas(viaje.destino_declarado))
  const [modoAdd, setModoAdd] = useState(false)
  const [kmCalculado, setKmCalculado] = useState<number | null>(viaje.km_teoricos)
  const [calculandoRuta, setCalculandoRuta] = useState(false)
  const [tiempo, setTiempo] = useState(tiempoTranscurrido(viaje.iniciado_at))
  const [terminando, setTerminando] = useState(false)
  const [kmFin, setKmFin] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [completado, setCompletado] = useState(viaje.estado === 'completado')

  async function terminarViaje() {
    setGuardando(true)
    try {
      await supabase.from('viajes_flota').update({
        estado: 'completado',
        completado_at: new Date().toISOString(),
        km_fin: kmFin ? Math.round(parseFloat(kmFin)) : null,
      }).eq('id', viaje.id)
      await supabase.from('vehiculos').update({ estado: 'disponible' }).eq('id', viaje.vehiculo_id)
      setCompletado(true)
      setTerminando(false)
      router.push('/flota')
    } catch { /* silently fail */ } finally { setGuardando(false) }
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
    const destino = JSON.stringify(nuevas.map(p => ({ n: p.nombre, d: p.direccion, lat: p.lat, lng: p.lng, fg: p.fotoGuia, fp: p.fotoProducto, en: p.entregado, mn: p.motivoNoEntrega })))
    await supabase.from('viajes_flota').update({ destino_declarado: destino }).eq('id', viaje.id)
  }

  const [paradaAbierta, setParadaAbierta] = useState<string | null>(null)
  const [subiendoFoto, setSubiendoFoto] = useState<Record<string, boolean>>({})
  const [otroMotivoTexto, setOtroMotivoTexto] = useState<Record<string, string>>({})

  function marcarEntregado(paradaId: string, valor: 'si' | 'no') {
    guardarParadas(paradas.map(p => p.id === paradaId ? { ...p, entregado: valor } : p))
  }

  function marcarMotivo(paradaId: string, motivo: string) {
    guardarParadas(paradas.map(p => p.id === paradaId ? { ...p, motivoNoEntrega: motivo } : p))
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
      const campo = tipo === 'guia' ? 'fotoGuia' : 'fotoProducto'
      await guardarParadas(paradas.map(p => p.id === paradaId ? { ...p, [campo]: publicUrl } : p))
    } catch (err) {
      console.error(err)
      alert('Error al subir la imagen. Intenta de nuevo.')
    } finally {
      setSubiendoFoto(prev => ({ ...prev, [key]: false }))
    }
  }

  // Una parada queda "resuelta" cuando el repartidor dejó constancia de qué pasó:
  // entregada con foto de guía (el producto es opcional), o marcada como no
  // entregada con su motivo — sin esto no se puede cerrar el viaje.
  const paradaResuelta = (p: Parada) => (p.entregado === 'si' && !!p.fotoGuia) || (p.entregado === 'no' && !!p.motivoNoEntrega)
  const paradasPendientes = paradas.filter(p => !paradaResuelta(p))

  const minEst = kmCalculado ? Math.round(kmCalculado / 35 * 60) : null
  const tiempoEst = !minEst ? null : minEst < 60 ? `${minEst} min` : `${Math.floor(minEst / 60)}h${minEst % 60 > 0 ? ` ${minEst % 60}m` : ''}`

  return (
    <div style={{ flex: 1, minHeight: 0, background: '#080808', display: 'flex', flexDirection: 'column' }}>

      <FlotaPageHeader
        title={viaje.vehiculo.nombre}
        subtitle={`${viaje.tipo === 'reparto' ? 'Reparto' : 'Trámite'} · En curso · ${tiempo}`}
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
                const estadoBorde = p.entregado === 'no' ? 'rgba(181,84,62,0.35)' : p.entregado === 'si' && p.fotoGuia ? 'rgba(90,138,74,0.3)' : abierta ? 'rgba(212,175,55,0.3)' : 'rgba(255,255,255,0.07)'
                return (
                <div key={p.id} style={{ background: '#141414', border: `1px solid ${estadoBorde}`, borderRadius: 10, overflow: 'hidden' }}>
                  <div onClick={() => setParadaAbierta(abierta ? null : p.id)} style={{ padding: '10px 12px', display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
                    <span style={{ fontSize: 10, fontWeight: 800, color: 'rgba(212,175,55,0.6)', minWidth: 16, marginTop: 2 }}>{i + 1}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <p style={{ fontSize: 13, fontWeight: 700, color: '#F4EEDF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nombre}</p>
                        {p.verificada && <CheckCircle size={11} color="#5A8A4A" style={{ flexShrink: 0 }} />}
                        {p.entregado === 'si' && p.fotoGuia && <FileText size={11} color="#5A8A4A" style={{ flexShrink: 0 }} />}
                        {p.entregado === 'no' && <XCircle size={11} color="#B5543E" style={{ flexShrink: 0 }} />}
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
                      {p.entregado === 'no' && (
                        <p style={{ fontSize: 10, color: '#B5543E', marginTop: 2 }}>
                          No entregado{p.motivoNoEntrega ? `: ${p.motivoNoEntrega}` : ' · falta indicar motivo'}
                        </p>
                      )}
                    </div>
                    <ChevronDown size={14} color="rgba(255,255,255,0.3)" style={{ flexShrink: 0, marginTop: 2, transition: 'transform 0.15s', transform: abierta ? 'rotate(180deg)' : 'none' }} />
                  </div>

                  {abierta && (
                    <div style={{ padding: '0 12px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {/* ── ¿Se entregó el pedido? ── */}
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          onClick={() => marcarEntregado(p.id, 'si')}
                          style={{
                            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px 0', borderRadius: 10, cursor: 'pointer',
                            border: `1.5px solid ${p.entregado === 'si' ? '#5A8A4A' : 'rgba(255,255,255,0.1)'}`,
                            background: p.entregado === 'si' ? 'rgba(90,138,74,0.12)' : 'transparent',
                            color: p.entregado === 'si' ? '#5A8A4A' : 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: 700,
                          }}
                        >
                          <CheckCircle size={14} /> Entregado
                        </button>
                        <button
                          onClick={() => marcarEntregado(p.id, 'no')}
                          style={{
                            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px 0', borderRadius: 10, cursor: 'pointer',
                            border: `1.5px solid ${p.entregado === 'no' ? '#B5543E' : 'rgba(255,255,255,0.1)'}`,
                            background: p.entregado === 'no' ? 'rgba(181,84,62,0.12)' : 'transparent',
                            color: p.entregado === 'no' ? '#B5543E' : 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: 700,
                          }}
                        >
                          <XCircle size={14} /> No entregado
                        </button>
                      </div>

                      {p.entregado === 'no' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {MOTIVOS_NO_ENTREGA.map(m => (
                              <button
                                key={m}
                                onClick={() => marcarMotivo(p.id, m === 'Otro motivo' ? (otroMotivoTexto[p.id]?.trim() ? `Otro: ${otroMotivoTexto[p.id].trim()}` : 'Otro motivo') : m)}
                                style={{
                                  padding: '8px 12px', borderRadius: 10, cursor: 'pointer',
                                  border: `1.5px solid ${p.motivoNoEntrega === m || (m === 'Otro motivo' && p.motivoNoEntrega?.startsWith('Otro:')) ? '#B5543E' : 'rgba(255,255,255,0.1)'}`,
                                  background: p.motivoNoEntrega === m || (m === 'Otro motivo' && p.motivoNoEntrega?.startsWith('Otro:')) ? 'rgba(181,84,62,0.12)' : 'transparent',
                                  color: p.motivoNoEntrega === m || (m === 'Otro motivo' && p.motivoNoEntrega?.startsWith('Otro:')) ? '#B5543E' : 'rgba(255,255,255,0.5)',
                                  fontSize: 11, fontWeight: 700,
                                }}
                              >
                                {m}
                              </button>
                            ))}
                          </div>
                          {(p.motivoNoEntrega === 'Otro motivo' || p.motivoNoEntrega?.startsWith('Otro:')) && (
                            <input
                              value={otroMotivoTexto[p.id] ?? (p.motivoNoEntrega?.startsWith('Otro: ') ? p.motivoNoEntrega.slice(6) : '')}
                              onChange={e => setOtroMotivoTexto(prev => ({ ...prev, [p.id]: e.target.value }))}
                              onBlur={() => { const t = otroMotivoTexto[p.id]?.trim(); if (t) marcarMotivo(p.id, `Otro: ${t}`) }}
                              placeholder="Escribe el motivo…"
                              style={{ padding: '10px 12px', borderRadius: 10, background: '#0D0D0D', border: '1px solid rgba(255,255,255,0.1)', color: '#F4EEDF', fontSize: 13, outline: 'none' }}
                            />
                          )}
                        </div>
                      )}

                      {p.entregado === 'si' && (['guia', 'producto'] as const).map(tipo => {
                        const url = tipo === 'guia' ? p.fotoGuia : p.fotoProducto
                        const subiendo = subiendoFoto[`${p.id}-${tipo}`]
                        const inputId = `foto-${p.id}-${tipo}`
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
                                  ? `✓ Foto de ${tipo === 'guia' ? 'guía' : 'producto entregado'} cargada`
                                  : tipo === 'guia' ? 'Foto de guía (obligatorio)' : 'Foto de producto entregado (opcional)'}
                            </label>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
                )
              })}
            </div>
          )}

          {modoAdd && (
            <InputDireccionValidada
              onConfirmar={async (datos) => {
                const nueva: Parada = { id: Date.now().toString(), ...datos }
                await guardarParadas([...paradas, nueva])
                setModoAdd(false)
              }}
              onCancelar={() => setModoAdd(false)}
            />
          )}

          {!modoAdd && (
            <button onClick={() => setModoAdd(true)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px 14px', borderRadius: 10, border: '1px dashed rgba(255,255,255,0.15)', background: 'transparent', color: 'var(--muted)', fontSize: 13, fontWeight: 600, cursor: 'pointer', width: '100%' }}>
              <Plus size={14} /> Agregar parada
            </button>
          )}
        </div>

        {/* Google Maps — siempre visible */}
        <a href={urlGoogleMaps(paradas)} target="_blank" rel="noopener noreferrer"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '15px', borderRadius: 12, background: 'rgba(66,133,244,0.12)', border: '1px solid rgba(66,133,244,0.3)', color: '#F4EEDF', fontSize: 14, fontWeight: 700, textDecoration: 'none' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" fill="#F4EEDF"/>
          </svg>
          {paradas.length > 0 ? `Ver ruta en Google Maps (${paradas.length} paradas)` : 'Abrir Google Maps'}
        </a>

      </div>

      {/* Overlay: confirmar término */}
      {terminando && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'flex-end', zIndex: 200 }}>
          <div style={{ width: '100%', background: '#141414', borderRadius: '20px 20px 0 0', padding: '24px 20px', paddingBottom: 'max(24px, env(safe-area-inset-bottom))' }}>
            <p style={{ fontSize: 18, fontWeight: 900, color: '#F4EEDF', marginBottom: 6 }}>¿Terminar viaje?</p>
            <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 20 }}>El vehículo quedará disponible y el viaje se cerrará.</p>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.8px', display: 'block', marginBottom: 8 }}>
              Km odómetro al llegar (opcional)
            </label>
            <input
              value={kmFin}
              onChange={e => setKmFin(e.target.value.replace(/\D/g, ''))}
              placeholder={`Ej: ${(viaje.km_inicio ?? 0) + (kmCalculado ?? 0)}`}
              type="text" inputMode="numeric"
              style={{ width: '100%', padding: '14px', borderRadius: 12, background: '#0D0D0D', border: '1px solid rgba(255,255,255,0.1)', color: '#F4EEDF', fontSize: 18, fontWeight: 800, outline: 'none', textAlign: 'center', marginBottom: 16, boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setTerminando(false)} disabled={guardando}
                style={{ flex: 1, padding: '15px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: 'var(--muted)', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
                Cancelar
              </button>
              <button onClick={terminarViaje} disabled={guardando}
                style={{ flex: 1, padding: '15px', borderRadius: 12, border: 'none', background: '#5A8A4A', color: '#000', fontSize: 15, fontWeight: 900, cursor: 'pointer' }}>
                {guardando ? 'Cerrando…' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}

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
        ) : (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {paradasPendientes.length > 0 && (
              <p style={{ fontSize: 11, color: '#D4AF37', textAlign: 'center', fontWeight: 700 }}>
                Faltan {paradasPendientes.length} parada{paradasPendientes.length !== 1 ? 's' : ''} por resolver (entregada con guía, o no entregada con motivo)
              </p>
            )}
            <button
              onClick={() => { if (paradasPendientes.length === 0) setTerminando(true) }}
              disabled={paradasPendientes.length > 0}
              style={{
                padding: '16px', borderRadius: 14, border: 'none', cursor: paradasPendientes.length > 0 ? 'not-allowed' : 'pointer',
                background: paradasPendientes.length > 0 ? 'rgba(255,255,255,0.06)' : '#5A8A4A',
                color: paradasPendientes.length > 0 ? 'var(--muted)' : '#000', fontSize: 15, fontWeight: 900,
              }}
            >
              Viaje terminado ✓
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
