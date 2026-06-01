'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  Truck, Camera, CheckCircle, ChevronLeft, MapPin, Clock,
  AlertTriangle, Plus, X, FileSpreadsheet, Navigation2, Search,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { AppUser } from '@/lib/auth'

const F = '#F97316'
const F_DIM = 'rgba(249,115,22,0.12)'
const F_BORDER = 'rgba(249,115,22,0.28)'

const NIVELES_COMB = [
  { value: 'lleno',        label: 'Lleno',   fill: 6, color: '#4ADE80' },
  { value: 'tres_cuartos', label: '3/4',     fill: 5, color: '#86EFAC' },
  { value: 'medio',        label: '1/2',     fill: 4, color: '#FBBF24' },
  { value: 'cuarto',       label: '1/4',     fill: 2, color: '#F97316' },
  { value: 'reserva',      label: 'Reserva', fill: 1, color: '#EF4444' },
  { value: 'vacio',        label: 'Vacío',   fill: 0, color: '#6B0000' },
] as const

function NivelDetectado({ nivel, onCorregir }: { nivel: string; onCorregir: () => void }) {
  const n = NIVELES_COMB.find(x => x.value === nivel) ?? NIVELES_COMB[2]
  return (
    <div style={{ background: `${n.color}12`, border: `1px solid ${n.color}40`, borderRadius: 12, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
      <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end', height: 28, flexShrink: 0 }}>
        {[1,2,3,4,5,6].map(bar => (
          <div key={bar} style={{ width: 7, height: 5 + bar * 3.2, borderRadius: 2, background: bar <= n.fill ? n.color : 'rgba(255,255,255,0.1)' }} />
        ))}
      </div>
      <div style={{ flex: 1 }}>
        <p style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, marginBottom: 2 }}>Nivel detectado por IA</p>
        <p style={{ fontSize: 22, fontWeight: 900, color: n.color, letterSpacing: '-0.5px' }}>{n.label}</p>
      </div>
      <button onClick={onCorregir} style={{ fontSize: 11, color: 'var(--muted)', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 7, padding: '6px 10px', cursor: 'pointer', flexShrink: 0 }}>
        Corregir
      </button>
    </div>
  )
}

function SelectorManual({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6, marginBottom: 16 }}>
      {NIVELES_COMB.map(n => (
        <div key={n.value} onClick={() => onChange(n.value)} style={{ cursor: 'pointer', borderRadius: 10, padding: '10px 4px 8px', background: value === n.value ? `${n.color}20` : '#1C1C1C', border: `2px solid ${value === n.value ? n.color : 'rgba(255,255,255,0.06)'}`, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
          <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', height: 22 }}>
            {[1,2,3,4,5,6].map(bar => (
              <div key={bar} style={{ width: 5, height: 4 + bar * 2.8, borderRadius: 1.5, background: bar <= n.fill ? n.color : 'rgba(255,255,255,0.1)' }} />
            ))}
          </div>
          <span style={{ fontSize: 9, fontWeight: 700, color: value === n.value ? n.color : 'var(--muted)', textAlign: 'center' }}>{n.label}</span>
        </div>
      ))}
    </div>
  )
}

interface Parada {
  id: string
  tipo: 'cliente' | 'manual' | 'excel'
  nombre: string
  direccion: string
  lat?: number
  lng?: number
  verificada?: boolean
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
    city_district?: string
    city?: string
    town?: string
  }
}

function formatGeoDir(s: SugerenciaGeo): string {
  const a = s.address
  const calle = [a.road, a.house_number].filter(Boolean).join(' ')
  const barrio = a.neighbourhood || a.suburb || a.city_district || ''
  const ciudad = a.city || a.town || 'Valdivia'
  return [calle, barrio, ciudad].filter(Boolean).join(', ')
}

function InputDireccionValidada({
  onConfirmar,
  onCancelar,
}: {
  onConfirmar: (p: Omit<Parada, 'id'>) => void
  onCancelar: () => void
}) {
  const [query, setQuery] = useState('')
  const [sugerencias, setSugerencias] = useState<SugerenciaGeo[]>([])
  const [buscando, setBuscando] = useState(false)
  const [seleccionada, setSeleccionada] = useState<SugerenciaGeo | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  function handleChange(txt: string) {
    setQuery(txt)
    setSeleccionada(null)
    clearTimeout(timer.current)
    if (txt.trim().length < 4) { setSugerencias([]); return }
    timer.current = setTimeout(async () => {
      setBuscando(true)
      try {
        const res = await fetch(`/api/geocode?q=${encodeURIComponent(txt)}`)
        const data: SugerenciaGeo[] = await res.json()
        setSugerencias(data)
      } catch { /* silently fail */ } finally { setBuscando(false) }
    }, 420)
  }

  function elegir(s: SugerenciaGeo) {
    setSeleccionada(s)
    setQuery(formatGeoDir(s))
    setSugerencias([])
  }

  function confirmar() {
    const dir = query.trim()
    if (!dir) return
    onConfirmar({
      tipo: 'manual',
      nombre: dir.split(',')[0].trim(),
      direccion: dir,
      lat: seleccionada ? parseFloat(seleccionada.lat) : undefined,
      lng: seleccionada ? parseFloat(seleccionada.lon) : undefined,
      verificada: !!seleccionada,
    })
  }

  return (
    <div style={{ background: '#141414', border: `1px solid ${F_BORDER}`, borderRadius: 12, overflow: 'hidden', marginBottom: 8 }}>
      {/* Input */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '0 12px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <MapPin size={14} color={seleccionada ? '#4ADE80' : 'var(--muted)'} style={{ flexShrink: 0 }} />
        <input
          autoFocus
          value={query}
          onChange={e => handleChange(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !sugerencias.length && confirmar()}
          placeholder="Ej: Picarte 3000"
          style={{ flex: 1, padding: '12px 10px', background: 'transparent', border: 'none', color: '#F4EEDF', fontSize: 14, outline: 'none' }}
        />
        {buscando && (
          <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: '50%', border: `2px solid ${F}`, borderTopColor: 'transparent', animation: 'spin 0.7s linear infinite', flexShrink: 0 }} />
        )}
        <button onClick={onCancelar} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', display: 'flex', padding: 4, marginLeft: 4 }}>
          <X size={14} />
        </button>
      </div>

      {/* Verificada badge */}
      {seleccionada && (
        <div style={{ padding: '8px 14px', background: 'rgba(74,222,128,0.06)', borderBottom: '1px solid rgba(74,222,128,0.15)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <CheckCircle size={12} color="#4ADE80" />
          <span style={{ fontSize: 11, color: '#4ADE80', fontWeight: 700 }}>Dirección verificada en el mapa</span>
        </div>
      )}

      {/* Sugerencias */}
      {sugerencias.length > 0 && sugerencias.map(s => (
        <div key={s.place_id} onMouseDown={() => elegir(s)}
          style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.04)', display: 'flex', alignItems: 'flex-start', gap: 10 }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(249,115,22,0.08)')}
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

      {/* Sin resultados */}
      {!buscando && query.trim().length >= 4 && sugerencias.length === 0 && !seleccionada && (
        <p style={{ padding: '10px 14px', fontSize: 12, color: 'var(--muted)', textAlign: 'center' }}>
          Sin resultados · puedes agregar igual como texto libre
        </p>
      )}

      {/* Botones */}
      <div style={{ display: 'flex', gap: 6, padding: '10px 12px' }}>
        <button
          onMouseDown={confirmar}
          disabled={!query.trim()}
          style={{ flex: 1, padding: '10px', borderRadius: 9, border: 'none', cursor: query.trim() ? 'pointer' : 'not-allowed', background: query.trim() ? (seleccionada ? '#4ADE80' : F) : 'rgba(255,255,255,0.06)', color: query.trim() ? (seleccionada ? '#000' : '#fff') : 'var(--muted)', fontSize: 13, fontWeight: 700 }}>
          {seleccionada ? '✓ Confirmar dirección' : 'Agregar parada'}
        </button>
        <button onMouseDown={onCancelar} style={{ padding: '10px 14px', borderRadius: 9, border: 'none', cursor: 'pointer', background: 'rgba(255,255,255,0.06)', color: 'var(--muted)', fontSize: 13 }}>
          Cancelar
        </button>
      </div>
    </div>
  )
}

interface Vehiculo { id: string; nombre: string; tipo: string; patente: string | null; km_actual: number; estado: string; combustible: string | null }
interface Ruta { id: string; nombre: string | null; vehiculo_id: string; km_teoricos: number | null; estado: string }
interface ClienteFlota { nombre_fantasia: string; direccion: string | null; localidad: string | null; ruta_despacho: string | null; lat: number | null; lng: number | null }
interface Props { user: AppUser; vehiculos: Vehiculo[]; rutasHoy: Ruta[]; clientes: ClienteFlota[] }

const TIPO_LABEL: Record<string, string> = { camioneta: 'Camioneta', furgon: 'Furgón', camion_34: 'Camión 3/4' }

function StepBar({ paso, total }: { paso: number; total: number }) {
  return (
    <div style={{ display: 'flex', gap: 4, padding: '0 20px' }}>
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i < paso ? F : 'rgba(255,255,255,0.1)', transition: 'background 0.3s' }} />
      ))}
    </div>
  )
}

function FotoSlot({ label, emoji, onCaptura, capturada }: { label: string; emoji: string; onCaptura: (url: string, file: File) => void; capturada: boolean }) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <div onClick={() => ref.current?.click()} style={{ display: 'flex', alignItems: 'center', gap: 10, height: 44, padding: '0 12px', borderRadius: 10, cursor: 'pointer', flexShrink: 0, background: capturada ? 'rgba(74,222,128,0.07)' : '#1C1C1C', border: `1px solid ${capturada ? '#4ADE80' : 'rgba(255,255,255,0.08)'}` }}>
      <input ref={ref} type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) onCaptura(URL.createObjectURL(f), f) }} />
      <span style={{ fontSize: 15 }}>{capturada ? '✅' : emoji}</span>
      <span style={{ fontSize: 12, fontWeight: 700, color: capturada ? '#4ADE80' : 'var(--muted)', flex: 1 }}>{label}</span>
      {!capturada && <Camera size={13} color="var(--muted)" />}
    </div>
  )
}

const ANGULOS_360 = [
  { key: 'frente',    label: 'Frente', emoji: '⬆️' },
  { key: 'izquierdo', label: 'Izq.',   emoji: '◀️' },
  { key: 'derecho',   label: 'Der.',   emoji: '▶️' },
  { key: 'atras',     label: 'Atrás',  emoji: '⬇️' },
] as const

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export default function CheckInClient({ user, vehiculos, rutasHoy, clientes }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [paso, setPaso] = useState(1)
  const [guardando, setGuardando] = useState(false)

  // Paso 1
  const [vehiculo, setVehiculo] = useState<Vehiculo | null>(null)

  // Paso 2 — ruta unificada
  const [tipoViaje, setTipoViaje] = useState<'reparto' | 'tramite'>('reparto')
  const [paradas, setParadas] = useState<Parada[]>([])
  const [kmPlanificado, setKmPlanificado] = useState<number | null>(null)
  const [kmCalculado, setKmCalculado] = useState<number | null>(null)
  const [minCalculado, setMinCalculado] = useState<number | null>(null)
  const [calculandoRuta, setCalculandoRuta] = useState(false)
  const [motivoViaje, setMotivoViaje] = useState('')
  const [modoAdd, setModoAdd] = useState<null | 'cliente' | 'manual'>(null)
  const [busquedaCliente, setBusquedaCliente] = useState('')
  const [cargandoExcel, setCargandoExcel] = useState(false)
  const excelRef = useRef<HTMLInputElement>(null)

  // Paso 3
  const [fotoOdo, setFotoOdo] = useState('')
  const [fotos360, setFotos360] = useState<Record<string, string>>({})
  const [fotoMarcador, setFotoMarcador] = useState('')
  const [kmInicio, setKmInicio] = useState('')
  const [analizandoOdo, setAnalizandoOdo] = useState(false)
  const [kmLeido, setKmLeido] = useState<string | null>(null)
  const [combustible, setCombustible] = useState('')
  const [analizandoComb, setAnalizandoComb] = useState(false)
  const [nivelDetectado, setNivelDetectado] = useState<string | null>(null)
  const [iaFalloComb, setIaFalloComb] = useState(false)
  const [mostrarSelectorComb, setMostrarSelectorComb] = useState(false)

  const disponibles = vehiculos.filter(v => v.estado === 'disponible')
  const rutasVehiculo = vehiculo ? rutasHoy.filter(r => r.vehiculo_id === vehiculo.id) : []
  const fotos360ok = ANGULOS_360.every(a => !!fotos360[a.key])
  const listo = !!fotoOdo && fotos360ok && !!fotoMarcador && !!kmInicio && !!combustible

  // km y tiempo finales: OSRM > planificado
  const kmMostrado = kmCalculado ?? kmPlanificado
  const minMostrado = minCalculado ?? (kmPlanificado ? Math.round(kmPlanificado / 35 * 60) : null)
  const tiempoLabel = !minMostrado ? '—'
    : minMostrado < 60 ? `${minMostrado} min`
    : `${Math.floor(minMostrado / 60)}h${minMostrado % 60 > 0 ? ` ${minMostrado % 60}m` : ''}`

  // Auto-calcular km vía OSRM cuando cambian las paradas
  useEffect(() => {
    const conCoords = paradas.filter(p => p.lat && p.lng)
    if (conCoords.length < 2) {
      setKmCalculado(null)
      setMinCalculado(null)
      return
    }
    const t = setTimeout(async () => {
      setCalculandoRuta(true)
      try {
        const res = await fetch('/api/calcular-ruta', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paradas }),
        })
        const data = await res.json()
        if (data.km > 0) { setKmCalculado(data.km); setMinCalculado(data.minutos) }
        else { setKmCalculado(null); setMinCalculado(null) }
      } catch { setKmCalculado(null); setMinCalculado(null) }
      finally { setCalculandoRuta(false) }
    }, 700)
    return () => clearTimeout(t)
  }, [paradas]) // eslint-disable-line react-hooks/exhaustive-deps

  const clientesFiltrados = busquedaCliente.trim().length > 0
    ? clientes.filter(c =>
        c.nombre_fantasia.toLowerCase().includes(busquedaCliente.toLowerCase()) ||
        (c.localidad ?? '').toLowerCase().includes(busquedaCliente.toLowerCase())
      ).slice(0, 6)
    : []

  function agregarCliente(c: ClienteFlota) {
    setParadas(prev => [...prev, {
      id: Math.random().toString(36).slice(2),
      tipo: 'cliente',
      nombre: c.nombre_fantasia,
      direccion: [c.direccion, c.localidad].filter(Boolean).join(', '),
    }])
    setBusquedaCliente('')
    setModoAdd(null)
  }

  function agregarDireccionManual(datos: Omit<Parada, 'id'>) {
    setParadas(prev => [...prev, { id: Math.random().toString(36).slice(2), ...datos }])
    setModoAdd(null)
  }

  async function cargarExcel(file: File) {
    setCargandoExcel(true)
    try {
      const XLSX = await import('xlsx')
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf)
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })
      const nuevas: Parada[] = rows.flatMap(row => {
        const keys = Object.keys(row)
        const nKey = keys.find(k => /nombre|cliente|raz[oó]n|fantasia|negocio|local/i.test(k)) ?? keys[0]
        const dKey = keys.find(k => /direc|calle|address|ubicaci[oó]n/i.test(k)) ?? (keys[1] ?? null)
        const lKey = keys.find(k => /localidad|ciudad|sector|comuna/i.test(k))
        const nombre = String(row[nKey] ?? '').trim()
        const dir = dKey ? String(row[dKey] ?? '').trim() : ''
        const loc = lKey ? String(row[lKey] ?? '').trim() : ''
        const direccion = [dir, loc].filter(Boolean).join(', ')
        if (!nombre && !dir) return []
        return [{ id: Math.random().toString(36).slice(2), tipo: 'excel' as const, nombre: nombre || dir, direccion: direccion || nombre }]
      }).slice(0, 60)
      if (nuevas.length > 0) setParadas(prev => [...prev, ...nuevas])
      if (excelRef.current) excelRef.current.value = ''
    } catch { /* silently fail */ } finally {
      setCargandoExcel(false)
    }
  }

  function usarRutaPlanificada(r: Ruta) {
    if (r.km_teoricos) setKmPlanificado(r.km_teoricos)
    setParadas(prev => {
      if (prev.some(p => p.id === r.id)) return prev
      return [...prev, { id: r.id, tipo: 'excel', nombre: r.nombre ?? 'Ruta del día', direccion: r.km_teoricos ? `${r.km_teoricos} km planificados` : 'Ruta asignada' }]
    })
    setTipoViaje('reparto')
  }

  async function analizarOdometro(file: File) {
    setAnalizandoOdo(true); setKmLeido(null)
    try {
      const base64 = await fileToBase64(file)
      const res = await fetch('/api/analizar-odometro', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ imagen: base64, tipo: file.type }) })
      const { km } = await res.json()
      if (km) { setKmInicio(String(km)); setKmLeido(String(km)) }
    } catch { /* silently fail */ } finally { setAnalizandoOdo(false) }
  }

  async function analizarCombustible(file: File) {
    setAnalizandoComb(true); setNivelDetectado(null); setIaFalloComb(false); setMostrarSelectorComb(false)
    try {
      const base64 = await fileToBase64(file)
      const res = await fetch('/api/analizar-combustible', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ imagen: base64, tipo: file.type }) })
      const { nivel } = await res.json()
      if (nivel) { setCombustible(nivel); setNivelDetectado(nivel) }
      else { setIaFalloComb(true); setMostrarSelectorComb(true) }
    } catch { setIaFalloComb(true); setMostrarSelectorComb(true) }
    finally { setAnalizandoComb(false) }
  }

  async function confirmar() {
    if (!vehiculo || !listo) return
    setGuardando(true)
    try {
      await supabase.from('viajes_flota').insert({
        vehiculo_id: vehiculo.id,
        conductor_id: user.id,
        ruta_id: null,
        tipo: tipoViaje,
        motivo: motivoViaje.trim() || null,
        km_inicio: parseInt(kmInicio),
        km_teoricos: kmMostrado ?? null,
        destino_declarado: paradas.length > 0
          ? JSON.stringify(paradas.map(p => ({ n: p.nombre, d: p.direccion })))
          : motivoViaje.trim() || null,
        estado: 'en_curso',
      })
      await supabase.from('vehiculos').update({ estado: 'en_uso', combustible }).eq('id', vehiculo.id)
      router.push('/flota')
    } finally { setGuardando(false) }
  }

  const paso2Ok = tipoViaje === 'reparto' || motivoViaje.trim().length > 0
  const totalPasos = 3
  const pasoLabel = ['', 'Vehículo', 'Ruta', 'Documentación'][paso]

  const addBtnStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    padding: '11px 8px', borderRadius: 10,
    border: '1px solid rgba(255,255,255,0.08)',
    background: '#161616', color: 'var(--muted)',
    fontSize: 12, fontWeight: 700, cursor: 'pointer',
  }

  return (
    <div style={{ flex: 1, minHeight: 0, background: '#080808', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ background: '#0F0F0F', borderBottom: '1px solid rgba(249,115,22,0.15)', padding: '14px 16px 10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <button onClick={() => paso > 1 ? setPaso(paso - 1) : router.push('/flota')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: F, display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 600, padding: 0 }}>
            <ChevronLeft size={18} /> {paso === 1 ? 'Cancelar' : 'Atrás'}
          </button>
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: 14, fontWeight: 800, color: '#F4EEDF' }}>{vehiculo ? vehiculo.nombre : 'Nueva Salida'}</p>
            <p style={{ fontSize: 11, color: 'var(--muted)' }}>Paso {paso}/{totalPasos} · {pasoLabel}</p>
          </div>
          <div style={{ width: 60 }} />
        </div>
        <StepBar paso={paso} total={totalPasos} />
      </div>

      {/* ── Paso 1: Selección vehículo ─────────────────────────────────────── */}
      {paso === 1 && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
            {disponibles.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                <AlertTriangle size={32} color="#F59E0B" style={{ margin: '0 auto 12px', display: 'block' }} />
                <p style={{ fontSize: 15, fontWeight: 700, color: '#F4EEDF', marginBottom: 6 }}>Sin vehículos disponibles</p>
                <p style={{ fontSize: 13, color: 'var(--muted)' }}>Todos los vehículos están en uso o en mantención</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {disponibles.map(v => (
                  <div key={v.id} onClick={() => setVehiculo(v)} style={{ padding: '14px 16px', borderRadius: 14, cursor: 'pointer', background: vehiculo?.id === v.id ? F_DIM : '#1C1C1C', border: `1px solid ${vehiculo?.id === v.id ? F_BORDER : 'rgba(255,255,255,0.06)'}`, display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: F_DIM, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Truck size={18} color={F} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: 15, fontWeight: 700, color: '#F4EEDF', marginBottom: 2 }}>{v.nombre}</p>
                      <p style={{ fontSize: 11, color: 'var(--muted)' }}>{TIPO_LABEL[v.tipo] ?? v.tipo}{v.patente ? ` · ${v.patente}` : ''} · {v.km_actual.toLocaleString('es-CL')} km</p>
                    </div>
                    {vehiculo?.id === v.id && <CheckCircle size={18} color={F} />}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div style={{ padding: '16px', paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
            <button onClick={() => vehiculo && setPaso(2)} disabled={!vehiculo} style={{ width: '100%', padding: '17px', borderRadius: 14, border: 'none', cursor: vehiculo ? 'pointer' : 'not-allowed', background: vehiculo ? F : 'rgba(255,255,255,0.06)', color: vehiculo ? '#fff' : 'var(--muted)', fontSize: 16, fontWeight: 900 }}>
              Seleccionar vehículo →
            </button>
          </div>
        </div>
      )}

      {/* ── Paso 2: Ruta unificada ─────────────────────────────────────────── */}
      {paso === 2 && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* Tipo toggle */}
            <div style={{ background: '#111', borderRadius: 12, padding: 4, display: 'flex', gap: 3 }}>
              {(['reparto', 'tramite'] as const).map(t => {
                const active = tipoViaje === t
                const color = t === 'reparto' ? F : '#F59E0B'
                const rgb = t === 'reparto' ? '249,115,22' : '245,158,11'
                return (
                  <button key={t} onClick={() => setTipoViaje(t)} style={{
                    flex: 1, padding: '11px 8px', borderRadius: 9, cursor: 'pointer',
                    border: active ? `1px solid rgba(${rgb},0.3)` : '1px solid transparent',
                    background: active ? `rgba(${rgb},0.12)` : 'transparent',
                    color: active ? color : 'var(--muted)',
                    fontSize: 13, fontWeight: 800,
                  }}>
                    {t === 'reparto' ? '🚚  Reparto' : '🔧  Trámite'}
                  </button>
                )
              })}
            </div>

            {/* Rutas planificadas del día */}
            {rutasVehiculo.length > 0 && (
              <div>
                <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 8 }}>
                  Ruta planificada del día
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {rutasVehiculo.map(r => {
                    const usada = paradas.some(p => p.id === r.id)
                    return (
                      <div key={r.id} onClick={() => usarRutaPlanificada(r)} style={{
                        background: usada ? F_DIM : '#161616',
                        border: `1px solid ${usada ? F_BORDER : 'rgba(255,255,255,0.08)'}`,
                        borderRadius: 12, padding: '12px 14px', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: 12,
                      }}>
                        <Navigation2 size={16} color={usada ? F : 'var(--muted)'} />
                        <div style={{ flex: 1 }}>
                          <p style={{ fontSize: 13, fontWeight: 700, color: '#F4EEDF' }}>{r.nombre ?? 'Ruta del día'}</p>
                          {r.km_teoricos && <p style={{ fontSize: 11, color: 'var(--muted)' }}>{r.km_teoricos} km planificados</p>}
                        </div>
                        {usada ? <CheckCircle size={16} color={F} /> : <Plus size={16} color="var(--muted)" />}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Paradas */}
            <div>
              <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 8 }}>
                Paradas{paradas.length > 0 ? ` (${paradas.length})` : ''}
              </p>

              {/* Lista */}
              {paradas.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
                  {paradas.map((p, i) => (
                    <div key={p.id} style={{ background: '#141414', border: `1px solid ${p.verificada ? 'rgba(74,222,128,0.2)' : 'rgba(255,255,255,0.07)'}`, borderRadius: 10, padding: '10px 12px', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                      <span style={{ fontSize: 10, fontWeight: 800, color: 'rgba(249,115,22,0.6)', minWidth: 16, marginTop: 2 }}>{i + 1}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <p style={{ fontSize: 13, fontWeight: 700, color: '#F4EEDF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nombre}</p>
                          {p.verificada && <CheckCircle size={11} color="#4ADE80" style={{ flexShrink: 0 }} />}
                        </div>
                        {p.direccion && p.direccion !== p.nombre && (
                          <p style={{ fontSize: 11, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.direccion}</p>
                        )}
                      </div>
                      <button onClick={() => setParadas(prev => prev.filter(x => x.id !== p.id))}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'rgba(255,255,255,0.25)', display: 'flex', flexShrink: 0 }}>
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Modo: buscar cliente */}
              {modoAdd === 'cliente' && (
                <div style={{ background: '#141414', border: `1px solid ${F_BORDER}`, borderRadius: 12, overflow: 'hidden', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', padding: '0 12px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <Search size={14} color="var(--muted)" style={{ flexShrink: 0 }} />
                    <input autoFocus value={busquedaCliente} onChange={e => setBusquedaCliente(e.target.value)}
                      placeholder="Buscar cliente..."
                      style={{ flex: 1, padding: '12px 10px', background: 'transparent', border: 'none', color: '#F4EEDF', fontSize: 14, outline: 'none' }} />
                    <button onClick={() => { setModoAdd(null); setBusquedaCliente('') }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', display: 'flex', padding: 4 }}>
                      <X size={14} />
                    </button>
                  </div>
                  {clientesFiltrados.length > 0 ? clientesFiltrados.map(c => (
                    <div key={c.nombre_fantasia} onMouseDown={() => agregarCliente(c)}
                      style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(249,115,22,0.08)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                      <p style={{ fontSize: 13, fontWeight: 700, color: '#F4EEDF' }}>{c.nombre_fantasia}</p>
                      {(c.direccion || c.localidad) && (
                        <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 1 }}>{[c.direccion, c.localidad].filter(Boolean).join(' · ')}</p>
                      )}
                    </div>
                  )) : (
                    <p style={{ padding: '12px 14px', fontSize: 12, color: 'var(--muted)', textAlign: 'center' }}>
                      {busquedaCliente.trim() ? 'Sin resultados' : 'Escribe para buscar…'}
                    </p>
                  )}
                </div>
              )}

              {/* Modo: dirección con autocomplete validada */}
              {modoAdd === 'manual' && (
                <InputDireccionValidada
                  onConfirmar={datos => agregarDireccionManual(datos)}
                  onCancelar={() => setModoAdd(null)}
                />
              )}

              {/* Botones agregar */}
              {!modoAdd && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                  <button onClick={() => setModoAdd('cliente')} style={addBtnStyle}>
                    <Search size={13} /> Cliente
                  </button>
                  <button onClick={() => setModoAdd('manual')} style={addBtnStyle}>
                    <MapPin size={13} /> Dirección
                  </button>
                  <button onClick={() => excelRef.current?.click()} disabled={cargandoExcel} style={{ ...addBtnStyle, opacity: cargandoExcel ? 0.6 : 1 }}>
                    <FileSpreadsheet size={13} /> {cargandoExcel ? '…' : 'Excel'}
                  </button>
                </div>
              )}
              {cargandoExcel && (
                <p style={{ fontSize: 11, color: '#F59E0B', marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', border: '2px solid #F59E0B', borderTopColor: 'transparent', animation: 'spin 0.7s linear infinite' }} />
                  Leyendo Excel…
                </p>
              )}
              <input ref={excelRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) cargarExcel(f) }} />
            </div>

            {/* Resumen de ruta — solo lectura, calculado automáticamente */}
            <div style={{ background: 'linear-gradient(135deg, rgba(249,115,22,0.07), rgba(249,115,22,0.02))', border: '1px solid rgba(249,115,22,0.18)', borderRadius: 14, padding: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Navigation2 size={14} color={F} />
                  <p style={{ fontSize: 10, fontWeight: 700, color: F, letterSpacing: '1px', textTransform: 'uppercase' }}>Resumen de ruta</p>
                </div>
                {calculandoRuta && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', border: `2px solid ${F}`, borderTopColor: 'transparent', animation: 'spin 0.7s linear infinite' }} />
                    <span style={{ fontSize: 10, color: 'var(--muted)' }}>Calculando…</span>
                  </div>
                )}
              </div>
              {kmMostrado ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div>
                    <p style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, marginBottom: 6 }}>Distancia total</p>
                    <p style={{ fontSize: 32, fontWeight: 900, color: F, letterSpacing: '-1.5px', lineHeight: 1 }}>
                      {kmMostrado}
                      <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--muted)', marginLeft: 4 }}>km</span>
                    </p>
                    {kmCalculado && <p style={{ fontSize: 9, color: '#4ADE80', marginTop: 3 }}>✓ Calculado por la app</p>}
                    {!kmCalculado && kmPlanificado && <p style={{ fontSize: 9, color: 'var(--muted)', marginTop: 3 }}>Ruta planificada</p>}
                  </div>
                  <div>
                    <p style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Clock size={10} /> Tiempo estimado
                    </p>
                    <p style={{ fontSize: 28, fontWeight: 900, color: '#F4EEDF', letterSpacing: '-1px', lineHeight: 1 }}>
                      {tiempoLabel}
                    </p>
                    <p style={{ fontSize: 9, color: 'var(--muted)', marginTop: 3 }}>Incluye paradas</p>
                  </div>
                </div>
              ) : (
                <p style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', padding: '8px 0' }}>
                  {calculandoRuta ? 'Calculando ruta…' : 'Agrega al menos 2 paradas verificadas para calcular km y tiempo'}
                </p>
              )}
            </div>

            {/* Notas / Motivo */}
            <div>
              <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 6 }}>
                {tipoViaje === 'tramite' ? 'Motivo *' : 'Notas (opcional)'}
              </label>
              <textarea value={motivoViaje} onChange={e => setMotivoViaje(e.target.value)}
                placeholder={tipoViaje === 'tramite' ? 'Describe el motivo del trámite…' : 'Instrucciones, cliente principal, observaciones…'}
                rows={2}
                style={{ width: '100%', padding: '10px 12px', borderRadius: 10, background: '#141414', border: `1px solid ${motivoViaje.trim() ? 'rgba(249,115,22,0.3)' : 'rgba(255,255,255,0.08)'}`, color: '#F4EEDF', fontSize: 14, resize: 'none', outline: 'none', boxSizing: 'border-box' }} />
            </div>

          </div>
          <div style={{ padding: '16px', paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
            <button onClick={() => paso2Ok && setPaso(3)} disabled={!paso2Ok}
              style={{ width: '100%', padding: '17px', borderRadius: 14, border: 'none', cursor: paso2Ok ? 'pointer' : 'not-allowed', background: paso2Ok ? F : 'rgba(255,255,255,0.06)', color: paso2Ok ? '#fff' : 'var(--muted)', fontSize: 16, fontWeight: 900 }}>
              Continuar →
            </button>
          </div>
        </div>
      )}

      {/* ── Paso 3: Fotos + KM ────────────────────────────────────────────── */}
      {paso === 3 && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 12 }}>
              Documentación obligatoria
            </p>

            <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 8 }}>Foto odómetro *</p>
            <div style={{ marginBottom: 6 }}>
              <FotoSlot label="Odómetro" emoji="🔢" onCaptura={(url, file) => { setFotoOdo(url); analizarOdometro(file) }} capturada={!!fotoOdo} />
            </div>
            {analizandoOdo && (
              <p style={{ fontSize: 11, color: '#F59E0B', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', border: '2px solid #F59E0B', borderTopColor: 'transparent', animation: 'spin 0.7s linear infinite' }} />
                Leyendo kilometraje…
              </p>
            )}

            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.8px', display: 'block', marginBottom: 8 }}>
              Kilometraje actual (odómetro)
            </label>
            <input value={kmInicio} onChange={e => { setKmInicio(e.target.value.replace(/\D/g, '')); setKmLeido(null) }}
              placeholder={`Ej: ${vehiculo?.km_actual ?? 45000}`} type="text" inputMode="numeric"
              style={{ width: '100%', padding: '14px', borderRadius: 12, background: '#1C1C1C', border: `1px solid ${kmLeido ? '#4ADE80' : kmInicio ? F_BORDER : 'rgba(255,255,255,0.08)'}`, color: '#F4EEDF', fontSize: 18, fontWeight: 800, outline: 'none', textAlign: 'center', letterSpacing: '-0.5px', marginBottom: 4 }} />
            {kmLeido && !analizandoOdo && (
              <p style={{ fontSize: 11, color: '#4ADE80', marginBottom: 12, textAlign: 'center' }}>✨ Leído de la foto por IA · puedes corregir si es necesario</p>
            )}
            {!kmLeido && fotoOdo && !analizandoOdo && (
              <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 12, textAlign: 'center' }}>Ingresa el km manualmente</p>
            )}
            {vehiculo && kmInicio && parseInt(kmInicio) < vehiculo.km_actual && (
              <p style={{ fontSize: 11, color: '#F59E0B', marginBottom: 12, textAlign: 'center' }}>
                ⚠ El valor es menor al km registrado ({vehiculo.km_actual.toLocaleString('es-CL')} km)
              </p>
            )}

            <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 8 }}>
              Inspección 360° *
              <span style={{ fontSize: 10, fontWeight: 500, color: fotos360ok ? '#4ADE80' : 'var(--muted)', marginLeft: 8 }}>
                {Object.keys(fotos360).length}/4
              </span>
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
              {ANGULOS_360.map(a => (
                <FotoSlot key={a.key} label={a.label} emoji={a.emoji}
                  onCaptura={(url) => setFotos360(prev => ({ ...prev, [a.key]: url }))}
                  capturada={!!fotos360[a.key]} />
              ))}
            </div>

            <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 8 }}>Marcador de combustible *</p>
            <div style={{ marginBottom: 8 }}>
              <FotoSlot label="Foto del tablero" emoji="⛽" onCaptura={(url, file) => { setFotoMarcador(url); analizarCombustible(file) }} capturada={!!fotoMarcador} />
            </div>
            {analizandoComb && (
              <p style={{ fontSize: 11, color: '#F59E0B', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', border: '2px solid #F59E0B', borderTopColor: 'transparent', animation: 'spin 0.7s linear infinite' }} />
                Leyendo nivel de estanque…
              </p>
            )}
            {!analizandoComb && nivelDetectado && !mostrarSelectorComb && (
              <NivelDetectado nivel={nivelDetectado} onCorregir={() => setMostrarSelectorComb(true)} />
            )}
            {!analizandoComb && (iaFalloComb || mostrarSelectorComb) && (
              <div style={{ marginBottom: 4 }}>
                {iaFalloComb && <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 10 }}>No se pudo leer el nivel automáticamente, selecciona manualmente:</p>}
                <SelectorManual value={combustible} onChange={v => { setCombustible(v); setNivelDetectado(v) }} />
                {nivelDetectado && mostrarSelectorComb && !iaFalloComb && (
                  <button onClick={() => setMostrarSelectorComb(false)} style={{ fontSize: 11, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', marginBottom: 8 }}>
                    ← Volver al nivel detectado
                  </button>
                )}
              </div>
            )}
          </div>

          <div style={{ padding: '16px', paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
            <button onClick={confirmar} disabled={!listo || guardando} style={{ width: '100%', padding: '17px', borderRadius: 14, border: 'none', cursor: listo ? 'pointer' : 'not-allowed', background: listo && !guardando ? F : 'rgba(255,255,255,0.06)', color: listo && !guardando ? '#fff' : 'var(--muted)', fontSize: 16, fontWeight: 900 }}>
              {guardando ? 'Registrando salida…' : listo ? 'Confirmar salida ✓' : `Faltan ${[!fotoOdo && 'odómetro', !fotos360ok && `360° (${Object.keys(fotos360).length}/4)`, !fotoMarcador && 'combustible', !combustible && 'nivel', !kmInicio && 'km'].filter(Boolean).join(', ')}`}
            </button>
          </div>
        </div>
      )}

      {guardando && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: '#1C1C1C', borderRadius: 16, padding: '24px 32px', textAlign: 'center' }}>
            <p style={{ fontSize: 15, fontWeight: 700, color: '#F4EEDF' }}>Registrando salida…</p>
          </div>
        </div>
      )}
    </div>
  )
}
