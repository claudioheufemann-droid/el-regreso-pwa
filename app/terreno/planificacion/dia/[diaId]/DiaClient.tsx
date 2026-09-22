'use client'

/**
 * Detalle del día — "Ruta y clientes" (referencia visual 01, detalle del día). Origen/
 * destino con geocoding (mismo /api/geocode que ya usa Organiza tu Viaje), buscador de
 * clientes, Nuevo prospecto, paradas numeradas con reordenamiento manual + "Sugerir
 * orden" (nearest-neighbor visual, no confunde con el cálculo de ruta real del botón
 * Calcular ruta), presupuesto del día desglosado y Guardar día.
 */
import { useState, useMemo, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  ChevronLeft, ChevronUp, ChevronDown, X, Search, Plus, MapPin,
  Loader2, RefreshCw, Building2, Sparkles,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { C, PLAN, TAP, cardStyle, btnPrimario, fPeso } from '../../../theme'

interface ParadaConNombre {
  id: string
  cliente_id: number | null
  cliente_terreno_id: string | null
  orden: number
  objetivo_visita: string | null
  observaciones: string | null
  estado_calculo_ruta: string
  distancia_estimada_m: number | null
  visita_id: string | null
  nombreCliente: string
  direccionCliente: string | null
  lat: number | null
  lng: number | null
}

interface Dia {
  id: string
  fecha: string
  pernocta: boolean
  regreso_mismo_dia: boolean
  desayuno_incluido_alojamiento: boolean
  hotel_estimado_clp: number | null
  peajes_estimados_clp: number
  origen: string | null
  origen_lat: number | null
  origen_lng: number | null
  destino: string | null
  destino_lat: number | null
  destino_lng: number | null
}

interface Politica {
  tarifa_km_clp: number
  monto_almuerzo_clp: number
  monto_desayuno_clp: number
  monto_once_cena_clp: number
}

interface RutaVigente {
  distancia_total_m: number
}

interface Props {
  dia: Dia
  plan: { id: string }
  paradasIniciales: ParadaConNombre[]
  rutaVigente: RutaVigente | null
  politica: Politica | null
  editable: boolean
  durmioFueraNocheAnterior: boolean
  userId: string
}

const OBJETIVOS = [
  { value: 'pedido_reposicion', label: 'Pedido / reposición' },
  { value: 'prospeccion', label: 'Prospección' },
  { value: 'cotizacion', label: 'Cotización' },
  { value: 'reactivacion', label: 'Reactivación' },
  { value: 'presentacion', label: 'Presentación' },
  { value: 'cobranza', label: 'Cobranza' },
  { value: 'otro', label: 'Otro' },
]

const DIAS_NOMBRE = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

function nombreDia(fechaISO: string): string {
  const [Y, M, D] = fechaISO.split('-').map(Number)
  const dow = new Date(Date.UTC(Y, M - 1, D)).getUTCDay()
  return `${DIAS_NOMBRE[dow]} ${D}`
}

function distanciaKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

interface ClienteBusqueda { id: number; nombre_fantasia: string; direccion: string | null; localidad: string | null; rut: string | null; lat: number | null; lng: number | null }
interface GeoResult { lat: string; lon: string; display_name: string }

export default function DiaClient({ dia: diaInicial, plan, paradasIniciales, rutaVigente, politica, editable, durmioFueraNocheAnterior, userId }: Props) {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  const [dia, setDia] = useState(diaInicial)
  const [paradas, setParadas] = useState(paradasIniciales)
  const [guardando, setGuardando] = useState(false)
  const [calculando, setCalculando] = useState(false)
  const [mensajeRuta, setMensajeRuta] = useState<string | null>(null)

  // ── Origen/destino ──
  const [origenTexto, setOrigenTexto] = useState(dia.origen ?? '')
  const [origenResultados, setOrigenResultados] = useState<GeoResult[]>([])
  const [destinoTexto, setDestinoTexto] = useState(dia.destino ?? '')
  const [destinoResultados, setDestinoResultados] = useState<GeoResult[]>([])
  const [origenCoords, setOrigenCoords] = useState<{ lat: number; lng: number } | null>(
    dia.origen_lat != null ? { lat: Number(dia.origen_lat), lng: Number(dia.origen_lng) } : null,
  )
  const [destinoCoords, setDestinoCoords] = useState<{ lat: number; lng: number } | null>(
    dia.destino_lat != null ? { lat: Number(dia.destino_lat), lng: Number(dia.destino_lng) } : null,
  )

  // Sin debounce, cada tecla disparaba un fetch a Nominatim: además de violar
  // su política de uso (bloquea IPs que hacen autocompletado sin límite),
  // las respuestas podían llegar desordenadas y una más vieja (de un texto
  // más corto, con menos o ningún resultado) pisaba a una más nueva —
  // "escribo la dirección completa y no aparece ninguna sugerencia para
  // elegir", lo que dejaba el origen sin definir y el botón de calcular
  // ruta bloqueado para siempre.
  const geocodeDebounceRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const geocodeSeqRef = useRef<Record<string, number>>({})

  function buscarDireccion(key: string, q: string, setResultados: (r: GeoResult[]) => void) {
    if (geocodeDebounceRef.current[key]) clearTimeout(geocodeDebounceRef.current[key])
    if (q.trim().length < 3) { setResultados([]); return }
    const seq = (geocodeSeqRef.current[key] ?? 0) + 1
    geocodeSeqRef.current[key] = seq
    geocodeDebounceRef.current[key] = setTimeout(async () => {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}&bias=cl`)
      if (geocodeSeqRef.current[key] !== seq) return
      if (res.ok) setResultados(await res.json())
    }, 400)
  }

  // ── Buscador de clientes ──
  const [busqueda, setBusqueda] = useState('')
  const [resultadosClientes, setResultadosClientes] = useState<ClienteBusqueda[]>([])
  const [buscando, setBuscando] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const q = busqueda.trim()
    debounceRef.current = setTimeout(async () => {
      if (q.length < 2) { setResultadosClientes([]); setBuscando(false); return }
      setBuscando(true)
      const { data } = await supabase
        .from('clientes')
        .select('id, nombre_fantasia, direccion, localidad, rut, lat, lng')
        .or(`nombre_fantasia.ilike.%${q}%,razon_social.ilike.%${q}%,rut.ilike.%${q}%,direccion.ilike.%${q}%,localidad.ilike.%${q}%`)
        .limit(8)
      setResultadosClientes((data ?? []) as ClienteBusqueda[])
      setBuscando(false)
    }, 350)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [busqueda, supabase])

  // ── Nuevo prospecto ──
  const [mostrarProspecto, setMostrarProspecto] = useState(false)
  const [prospectoNombre, setProspectoNombre] = useState('')
  const [prospectoDireccion, setProspectoDireccion] = useState('')
  const [creandoProspecto, setCreandoProspecto] = useState(false)

  async function agregarParadaCliente(clienteId: number) {
    const res = await fetch(`/api/terreno/planificacion/${plan.id}/dias/${dia.id}/paradas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cliente_id: clienteId, orden: paradas.length }),
    })
    const data = await res.json()
    if (!res.ok) { alert(data.error ?? 'No se pudo agregar la parada'); return }
    const cliente = resultadosClientes.find(c => c.id === clienteId)
    setParadas(p => [...p, {
      ...data, nombreCliente: cliente?.nombre_fantasia ?? '', direccionCliente: cliente?.direccion ?? null,
      lat: cliente?.lat ?? null, lng: cliente?.lng ?? null,
    }])
    setBusqueda('')
    setResultadosClientes([])
  }

  async function crearProspecto() {
    if (!prospectoNombre.trim()) return
    setCreandoProspecto(true)
    try {
      let lat: number | null = null, lng: number | null = null
      if (prospectoDireccion.trim().length >= 3) {
        const res = await fetch(`/api/geocode?q=${encodeURIComponent(prospectoDireccion)}&bias=cl`)
        const resultados: GeoResult[] = res.ok ? await res.json() : []
        if (resultados[0]) { lat = Number(resultados[0].lat); lng = Number(resultados[0].lon) }
      }
      const { data: nuevo, error } = await supabase
        .from('clientes_terreno')
        .insert({ nombre_fantasia: prospectoNombre.trim(), direccion: prospectoDireccion.trim() || null, lat, lng, creado_por: userId })
        .select('*').single()
      if (error || !nuevo) { alert(error?.message ?? 'No se pudo crear el prospecto'); return }

      const resParada = await fetch(`/api/terreno/planificacion/${plan.id}/dias/${dia.id}/paradas`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cliente_terreno_id: nuevo.id, orden: paradas.length }),
      })
      const dataParada = await resParada.json()
      if (!resParada.ok) { alert(dataParada.error ?? 'No se pudo agregar la parada'); return }

      setParadas(p => [...p, { ...dataParada, nombreCliente: nuevo.nombre_fantasia, direccionCliente: nuevo.direccion, lat, lng }])
      setProspectoNombre(''); setProspectoDireccion(''); setMostrarProspecto(false)
    } finally {
      setCreandoProspecto(false)
    }
  }

  async function quitarParada(paradaId: string) {
    const res = await fetch(`/api/terreno/planificacion/${plan.id}/dias/${dia.id}/paradas/${paradaId}`, { method: 'DELETE' })
    if (res.ok) setParadas(p => p.filter(x => x.id !== paradaId))
  }

  async function cambiarObjetivo(paradaId: string, objetivo: string) {
    setParadas(p => p.map(x => x.id === paradaId ? { ...x, objetivo_visita: objetivo } : x))
    await fetch(`/api/terreno/planificacion/${plan.id}/dias/${dia.id}/paradas/${paradaId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ objetivo_visita: objetivo }),
    })
  }

  async function mover(index: number, delta: number) {
    const destino = index + delta
    if (destino < 0 || destino >= paradas.length) return
    const copia = [...paradas]
    ;[copia[index], copia[destino]] = [copia[destino], copia[index]]
    setParadas(copia)
    await Promise.all(copia.map((p, i) =>
      fetch(`/api/terreno/planificacion/${plan.id}/dias/${dia.id}/paradas/${p.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orden: i }),
      }),
    ))
  }

  /** Sugerencia visual (Haversine, nearest-neighbor) — sólo reordena; el km pagable real
   *  lo calcula el proveedor de rutas al tocar "Calcular ruta". */
  function sugerirOrden() {
    const origen = origenCoords
    const conCoords = paradas.filter(p => p.lat != null && p.lng != null)
    if (!origen || conCoords.length < 2) return
    const restantes = [...conCoords]
    const ordenadas: typeof paradas = []
    let actual = origen
    while (restantes.length) {
      let idx = 0, min = Infinity
      for (let i = 0; i < restantes.length; i++) {
        const d = distanciaKm(actual.lat, actual.lng, restantes[i].lat!, restantes[i].lng!)
        if (d < min) { min = d; idx = i }
      }
      const [sig] = restantes.splice(idx, 1)
      ordenadas.push(sig)
      actual = { lat: sig.lat!, lng: sig.lng! }
    }
    const sinCoords = paradas.filter(p => p.lat == null || p.lng == null)
    const nuevo = [...ordenadas, ...sinCoords]
    setParadas(nuevo)
    Promise.all(nuevo.map((p, i) =>
      fetch(`/api/terreno/planificacion/${plan.id}/dias/${dia.id}/paradas/${p.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orden: i }),
      }),
    ))
  }

  async function calcularRuta() {
    setCalculando(true)
    setMensajeRuta(null)
    try {
      const res = await fetch(`/api/terreno/planificacion/${plan.id}/dias/${dia.id}/calcular-ruta`, { method: 'POST' })
      const data = await res.json()
      if (!data.ok) { setMensajeRuta(data.motivo ?? 'No se pudo calcular la ruta'); return }
      router.refresh()
      setMensajeRuta(`Ruta calculada: ${(data.distanciaTotalM / 1000).toFixed(1)} km`)
    } finally {
      setCalculando(false)
    }
  }

  async function guardarDia() {
    setGuardando(true)
    try {
      await fetch(`/api/terreno/planificacion/${plan.id}/dias/${dia.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origen: origenTexto || null,
          origen_lat: origenCoords?.lat ?? null,
          origen_lng: origenCoords?.lng ?? null,
          destino: dia.regreso_mismo_dia ? null : (destinoTexto || null),
          destino_lat: dia.regreso_mismo_dia ? null : (destinoCoords?.lat ?? null),
          destino_lng: dia.regreso_mismo_dia ? null : (destinoCoords?.lng ?? null),
          regreso_mismo_dia: dia.regreso_mismo_dia,
          pernocta: dia.pernocta,
          hotel_estimado_clp: dia.hotel_estimado_clp,
          peajes_estimados_clp: dia.peajes_estimados_clp,
          desayuno_incluido_alojamiento: dia.desayuno_incluido_alojamiento,
        }),
      })
      if (origenCoords && paradas.length > 0) await calcularRuta()
      router.push('/terreno/planificacion')
    } finally {
      setGuardando(false)
    }
  }

  // ── Presupuesto del día (vista previa, en vivo) ──
  const kmPagableM = rutaVigente?.distancia_total_m ?? null
  const montoKm = politica && kmPagableM != null ? Math.round((kmPagableM / 1000) * politica.tarifa_km_clp) : null
  const almuerzos = paradas.length > 0 ? 1 : 0
  const desayunos = durmioFueraNocheAnterior && !dia.desayuno_incluido_alojamiento ? 1 : 0
  const cenas = dia.pernocta ? 1 : 0
  const montoComidas = politica ? almuerzos * politica.monto_almuerzo_clp + desayunos * politica.monto_desayuno_clp + cenas * politica.monto_once_cena_clp : 0
  const montoTotalDia = montoKm != null ? montoKm + dia.peajes_estimados_clp + montoComidas : null

  return (
    <div style={{ minHeight: '100vh', background: C.bg, paddingBottom: 'max(140px, calc(env(safe-area-inset-bottom, 0px) + 120px))' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '20px 16px 0' }}>
        <button
          onClick={() => router.push('/terreno/planificacion')}
          aria-label="Volver"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4, minHeight: 36, cursor: 'pointer',
            background: C.card, border: `1px solid ${C.line}`, borderRadius: 100,
            padding: '7px 14px 7px 10px', color: PLAN.primario, fontSize: 13, fontWeight: 700, marginBottom: 14,
          }}
        >
          <ChevronLeft size={17} strokeWidth={2.5} color={PLAN.primario} />
          Volver
        </button>

        <div style={{ marginBottom: 16 }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: C.muted, letterSpacing: '0.04em' }}>PLANIFICACIÓN SEMANAL</p>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: C.text, letterSpacing: '-0.5px' }}>{nombreDia(dia.fecha)}</h1>
        </div>

        {/* Origen / destino */}
        <div style={{ ...cardStyle, padding: 14, marginBottom: 14 }}>
          <p style={{ fontSize: 12, fontWeight: 800, color: C.text, letterSpacing: '0.04em', marginBottom: 10 }}>RUTA DEL DÍA</p>
          <CampoDireccion
            label="Salida"
            placeholder="Casa autorizada, bodega..."
            valor={origenTexto}
            onChange={v => { setOrigenTexto(v); buscarDireccion('origen', v, setOrigenResultados) }}
            resultados={origenResultados}
            onElegir={r => { setOrigenTexto(r.display_name); setOrigenCoords({ lat: Number(r.lat), lng: Number(r.lon) }); setOrigenResultados([]) }}
            disabled={!editable}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '10px 0' }}>
            <input type="checkbox" id="regreso" checked={dia.regreso_mismo_dia} disabled={!editable}
              onChange={e => setDia(d => ({ ...d, regreso_mismo_dia: e.target.checked, pernocta: e.target.checked ? false : d.pernocta }))}
              style={{ width: 18, height: 18 }} />
            <label htmlFor="regreso" style={{ fontSize: 13, color: C.text, fontWeight: 600 }}>Regreso el mismo día</label>
          </div>
          {!dia.regreso_mismo_dia && (
            <>
              <CampoDireccion
                label="Término"
                placeholder="Alojamiento u otra ubicación autorizada"
                valor={destinoTexto}
                onChange={v => { setDestinoTexto(v); buscarDireccion('destino', v, setDestinoResultados) }}
                resultados={destinoResultados}
                onElegir={r => { setDestinoTexto(r.display_name); setDestinoCoords({ lat: Number(r.lat), lng: Number(r.lon) }); setDestinoResultados([]) }}
                disabled={!editable}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '10px 0' }}>
                <input type="checkbox" id="pernocta" checked={dia.pernocta} disabled={!editable}
                  onChange={e => setDia(d => ({ ...d, pernocta: e.target.checked }))} style={{ width: 18, height: 18 }} />
                <label htmlFor="pernocta" style={{ fontSize: 13, color: C.text, fontWeight: 600 }}>Duerme fuera esta noche</label>
              </div>
              {dia.pernocta && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <CampoNumero label="Alojamiento estimado (CLP)" valor={dia.hotel_estimado_clp ?? 0}
                    onChange={v => setDia(d => ({ ...d, hotel_estimado_clp: v }))} disabled={!editable} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input type="checkbox" id="desayuno" checked={dia.desayuno_incluido_alojamiento} disabled={!editable}
                      onChange={e => setDia(d => ({ ...d, desayuno_incluido_alojamiento: e.target.checked }))} style={{ width: 18, height: 18 }} />
                    <label htmlFor="desayuno" style={{ fontSize: 13, color: C.text }}>El alojamiento incluye desayuno</label>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {editable && (
          <div style={{ ...cardStyle, padding: 14, marginBottom: 14 }}>
            <div style={{ position: 'relative', marginBottom: 8 }}>
              <Search size={16} color={C.faint} style={{ position: 'absolute', left: 12, top: 13 }} />
              <input
                value={busqueda} onChange={e => setBusqueda(e.target.value)}
                placeholder="Buscar cliente, RUT o comuna"
                autoComplete="off"
                className="buscador-cliente-input"
                style={{
                  width: '100%', minHeight: TAP, borderRadius: 10, border: `1px solid ${C.line}`,
                  padding: '10px 12px 10px 36px', fontSize: 14, boxSizing: 'border-box',
                  background: '#fff', color: C.text,
                }}
              />
              {buscando && <Loader2 size={16} className="animate-spin" style={{ position: 'absolute', right: 12, top: 13, color: C.faint }} />}
            </div>
            {resultadosClientes.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
                {resultadosClientes.map(c => (
                  <button key={c.id} onClick={() => agregarParadaCliente(c.id)}
                    style={{ ...cardStyle, background: C.bg, textAlign: 'left', padding: '8px 10px', cursor: 'pointer' }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{c.nombre_fantasia}</p>
                    <p style={{ fontSize: 11, color: C.muted }}>{[c.direccion, c.localidad].filter(Boolean).join(', ') || c.rut || ''}</p>
                  </button>
                ))}
              </div>
            )}
            {!mostrarProspecto ? (
              <button onClick={() => setMostrarProspecto(true)} style={{
                width: '100%', minHeight: TAP, borderRadius: 10, border: `1px solid ${PLAN.primario}`,
                background: 'none', color: PLAN.primario, fontWeight: 700, fontSize: 13, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}>
                <Plus size={16} /> Nuevo prospecto
              </button>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <input value={prospectoNombre} onChange={e => setProspectoNombre(e.target.value)} placeholder="Nombre del local"
                  style={{ minHeight: TAP, borderRadius: 10, border: `1px solid ${C.line}`, padding: '0 12px', fontSize: 14, background: '#fff', color: C.text }} />
                <input value={prospectoDireccion} onChange={e => setProspectoDireccion(e.target.value)} placeholder="Dirección (opcional)"
                  style={{ minHeight: TAP, borderRadius: 10, border: `1px solid ${C.line}`, padding: '0 12px', fontSize: 14, background: '#fff', color: C.text }} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setMostrarProspecto(false)} style={{ flex: 1, minHeight: TAP, borderRadius: 10, border: `1px solid ${C.line}`, background: '#fff', cursor: 'pointer' }}>Cancelar</button>
                  <button onClick={crearProspecto} disabled={creandoProspecto || !prospectoNombre.trim()}
                    style={{ flex: 1, minHeight: TAP, borderRadius: 10, border: 'none', background: PLAN.primario, color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
                    {creandoProspecto ? 'Creando…' : 'Agregar'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Paradas */}
        <div style={{ ...cardStyle, padding: 14, marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <p style={{ fontSize: 12, fontWeight: 800, color: C.text, letterSpacing: '0.04em' }}>PARADAS · {paradas.length}</p>
            {editable && origenCoords && paradas.length > 1 && (
              <button onClick={sugerirOrden} style={{ background: 'none', border: 'none', color: PLAN.primario, fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                <Sparkles size={13} /> Sugerir orden
              </button>
            )}
          </div>
          {paradas.length === 0 ? (
            <p style={{ fontSize: 13, color: C.faint, textAlign: 'center', padding: '12px 0' }}>Sin paradas todavía</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {paradas.map((p, i) => (
                <div key={p.id} style={{ background: C.bg, border: `1px solid ${C.line}`, borderRadius: 11, padding: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                    <span style={{ width: 24, height: 24, borderRadius: '50%', flexShrink: 0, background: PLAN.primario, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800 }}>{i + 1}</span>
                    <Building2 size={13} color={C.muted} style={{ flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 700, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nombreCliente}</p>
                      {p.direccionCliente && <p style={{ fontSize: 11, color: C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.direccionCliente}</p>}
                    </div>
                    {editable && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
                        <button onClick={() => mover(i, -1)} disabled={i === 0} aria-label="Subir" style={{ width: 28, height: 28, border: 'none', background: 'none', color: i === 0 ? C.line : C.muted, cursor: i === 0 ? 'default' : 'pointer' }}><ChevronUp size={16} /></button>
                        <button onClick={() => mover(i, 1)} disabled={i === paradas.length - 1} aria-label="Bajar" style={{ width: 28, height: 28, border: 'none', background: 'none', color: i === paradas.length - 1 ? C.line : C.muted, cursor: i === paradas.length - 1 ? 'default' : 'pointer' }}><ChevronDown size={16} /></button>
                        <button onClick={() => quitarParada(p.id)} aria-label="Quitar" style={{ width: 28, height: 28, border: 'none', background: 'none', color: C.red, cursor: 'pointer' }}><X size={16} /></button>
                      </div>
                    )}
                  </div>
                  {editable && (
                    <select value={p.objetivo_visita ?? ''} onChange={e => cambiarObjetivo(p.id, e.target.value)}
                      style={{ marginTop: 8, width: '100%', minHeight: 36, borderRadius: 8, border: `1px solid ${C.line}`, fontSize: 12, padding: '0 8px', background: '#fff', color: C.text }}>
                      <option value="">Objetivo de la visita…</option>
                      {OBJETIVOS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  )}
                  {!editable && (
                    p.visita_id ? (
                      <p style={{ marginTop: 8, fontSize: 12, color: PLAN.primario, fontWeight: 700 }}>Visita registrada</p>
                    ) : (
                      <button
                        onClick={() => router.push(
                          `/terreno/nueva-visita?plan_parada=${p.id}${p.cliente_id != null ? `&cliente=${encodeURIComponent(p.nombreCliente)}` : ''}`,
                        )}
                        style={{
                          marginTop: 8, width: '100%', minHeight: 36, borderRadius: 8, border: 'none',
                          background: PLAN.primario, color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer',
                        }}
                      >
                        Iniciar visita
                      </button>
                    )
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {editable && paradas.length > 0 && (
          <button onClick={calcularRuta} disabled={calculando || !origenCoords} style={{
            width: '100%', minHeight: TAP, borderRadius: 12, border: `1px solid ${PLAN.primario}`,
            background: '#fff', color: PLAN.primario, fontWeight: 700, fontSize: 13, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 14,
            opacity: origenCoords ? 1 : 0.5,
          }}>
            {calculando ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            Calcular ruta real (km)
          </button>
        )}
        {mensajeRuta && (
          <p style={{ fontSize: 12, color: mensajeRuta.startsWith('Ruta calculada') ? C.green : C.amber, textAlign: 'center', marginTop: -8, marginBottom: 14 }}>{mensajeRuta}</p>
        )}
        {!origenCoords && (
          <p style={{ fontSize: 11, color: C.faint, textAlign: 'center', marginTop: -8, marginBottom: 14 }}>Define la salida para poder calcular la ruta</p>
        )}

        {/* Presupuesto del día */}
        <div style={{ ...cardStyle, padding: 14, marginBottom: 16 }}>
          <p style={{ fontSize: 12, fontWeight: 800, color: C.text, letterSpacing: '0.04em', marginBottom: 10 }}>PRESUPUESTO DEL DÍA</p>
          <FilaPresupuesto label={montoKm != null ? `${(kmPagableM! / 1000).toFixed(1)} km × ${fPeso(politica?.tarifa_km_clp ?? 0)}` : 'Km (pendiente de calcular)'} valor={montoKm} />
          <FilaPresupuesto
            label="Peajes"
            valor={dia.peajes_estimados_clp}
            editor={editable ? (
              <input type="number" min={0} value={dia.peajes_estimados_clp}
                onChange={e => setDia(d => ({ ...d, peajes_estimados_clp: Math.max(0, Number(e.target.value) || 0) }))}
                style={{ width: 90, textAlign: 'right', border: `1px solid ${C.line}`, borderRadius: 8, padding: '4px 6px', fontSize: 13, background: '#fff', color: C.text }} />
            ) : undefined}
          />
          {almuerzos > 0 && <FilaPresupuesto label={`Almuerzo × ${almuerzos}`} valor={almuerzos * (politica?.monto_almuerzo_clp ?? 0)} />}
          {desayunos > 0 && <FilaPresupuesto label="Desayuno" valor={desayunos * (politica?.monto_desayuno_clp ?? 0)} />}
          {cenas > 0 && <FilaPresupuesto label="Once/cena" valor={cenas * (politica?.monto_once_cena_clp ?? 0)} />}
          <div style={{ borderTop: `1px solid ${C.line}`, marginTop: 8, paddingTop: 8, display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 14, fontWeight: 800, color: C.text }}>Total del día</span>
            <span style={{ fontSize: 14, fontWeight: 800, color: C.text }}>{montoTotalDia != null ? fPeso(montoTotalDia) : 'Pendiente'}</span>
          </div>
          {dia.pernocta && dia.hotel_estimado_clp ? (
            <p style={{ fontSize: 11, color: C.muted, marginTop: 8 }}>Alojamiento: {fPeso(dia.hotel_estimado_clp)} · No incluido en el fondo</p>
          ) : null}
        </div>

        {editable && (
          <button onClick={guardarDia} disabled={guardando} style={{ ...btnPrimario, background: PLAN.primario }}>
            {guardando ? <Loader2 size={18} className="animate-spin" /> : null}
            Guardar día
          </button>
        )}
      </div>
    </div>
  )
}

function CampoDireccion({ label, placeholder, valor, onChange, resultados, onElegir, disabled }: {
  label: string; placeholder: string; valor: string; onChange: (v: string) => void
  resultados: GeoResult[]; onElegir: (r: GeoResult) => void; disabled: boolean
}) {
  return (
    <div style={{ marginBottom: 4 }}>
      <p style={{ fontSize: 11, color: C.muted, fontWeight: 700, marginBottom: 4 }}>{label}</p>
      <div style={{ position: 'relative' }}>
        <MapPin size={14} color={C.faint} style={{ position: 'absolute', left: 10, top: 12 }} />
        <input value={valor} onChange={e => onChange(e.target.value)} placeholder={placeholder} disabled={disabled}
          style={{ width: '100%', minHeight: 40, borderRadius: 10, border: `1px solid ${C.line}`, padding: '0 10px 0 30px', fontSize: 13, boxSizing: 'border-box', background: disabled ? C.bg : '#fff', color: C.text }} />
      </div>
      {resultados.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 4 }}>
          {resultados.map((r, i) => (
            <button key={i} onClick={() => onElegir(r)} style={{ textAlign: 'left', fontSize: 12, color: C.text, background: C.bg, border: `1px solid ${C.line}`, borderRadius: 8, padding: '6px 8px', cursor: 'pointer' }}>
              {r.display_name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function CampoNumero({ label, valor, onChange, disabled }: { label: string; valor: number; onChange: (v: number) => void; disabled: boolean }) {
  return (
    <div>
      <p style={{ fontSize: 11, color: C.muted, fontWeight: 700, marginBottom: 4 }}>{label}</p>
      <input type="number" min={0} value={valor} disabled={disabled} onChange={e => onChange(Math.max(0, Number(e.target.value) || 0))}
        style={{ width: '100%', minHeight: 40, borderRadius: 10, border: `1px solid ${C.line}`, padding: '0 10px', fontSize: 13, boxSizing: 'border-box', background: disabled ? C.bg : '#fff', color: C.text }} />
    </div>
  )
}

function FilaPresupuesto({ label, valor, editor }: { label: string; valor: number | null; editor?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0' }}>
      <span style={{ fontSize: 13, color: C.muted }}>{label}</span>
      {editor ?? <span style={{ fontSize: 13, color: C.text, fontWeight: 600 }}>{valor != null ? fPeso(valor) : '—'}</span>}
    </div>
  )
}
