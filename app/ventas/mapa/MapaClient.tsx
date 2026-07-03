'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import dynamic from 'next/dynamic'
import {
  Calendar, Droplets, MapPin, Users, ShoppingCart, DollarSign, AlertTriangle,
  ChevronLeft, ChevronRight, Loader2, Play, Pause, Thermometer, Heart,
  Flame, Target, TrendingUp, Eye, EyeOff, Layers as LayersIcon, Package,
  Search, Locate, X, SlidersHorizontal,
} from 'lucide-react'
import { VEND_COLOR } from '@/lib/theme'
import { VENDEDOR_DISPLAY } from '@/lib/types'
const dspV = (v: string) => VENDEDOR_DISPLAY[v] ?? v
import { useIsDesktop } from '@/lib/useIsDesktop'
import type { Punto, CapaViz, TileTipo, LeadPunto, FlyTarget } from './MapLeaflet'

const MapLeaflet = dynamic(() => import('./MapLeaflet'), {
  ssr: false,
  loading: () => (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#151519' }}>
      <Loader2 size={24} style={{ color: '#666', animation: 'spin 1s linear infinite' }} />
    </div>
  ),
})

// ── Paleta ────────────────────────────────────────────────────
const C = {
  bg:           '#0a0a0d',
  bgAlt:        '#0c0c10',
  card:         '#151519',
  cardElevated: '#1a1a1f',
  gold:         '#e8b93e',
  goldDim:      'rgba(232,185,62,0.12)',
  goldBorder:   'rgba(232,185,62,0.25)',
  green:        '#5bd68a',
  red:          '#ff6b57',
  redDim:       'rgba(255,107,87,0.08)',
  redBorder:    'rgba(255,107,87,0.25)',
  border:       'rgba(255,255,255,0.07)',
  cream:        '#f0ede8',
  muted:        '#6b6b78',
  mutedLight:   'rgba(255,255,255,0.45)',
}

interface Props {
  fechasDisponibles: string[]
  fechaDefault: string
}

interface MapaResponse {
  puntos: Punto[]
  deudaGlobal: number
  deudaVencidaGlobal: number
}

function formatFecha(dateStr: string) {
  if (!dateStr) return ''
  const [y, m, d] = dateStr.split('-')
  const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
  return `${parseInt(d)} ${meses[parseInt(m) - 1]} ${y}`
}

function formatPeso(n: number) {
  return '$' + Math.round(n).toLocaleString('es-CL')
}

function formatLitros(n: number) {
  return n.toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}

const VENDEDORES = [
  { value: 'all',           label: 'Todos'        },
  { value: 'Equipo Ventas', label: 'Equipo Ventas' },
]

const CAPAS: { value: CapaViz; label: string; icon: React.ReactNode }[] = [
  { value: 'pedidos', label: 'Pedidos', icon: <MapPin size={12} /> },
  { value: 'salud',   label: 'Salud',   icon: <Heart size={12} /> },
  { value: 'calor',   label: 'Calor',   icon: <Thermometer size={12} /> },
]

const TILES: { value: TileTipo; label: string }[] = [
  { value: 'mapa',     label: 'Mapa'     },
  { value: 'satelite', label: 'Satélite' },
  { value: 'hibrido',  label: 'Híbrido'  },
]

const SALUD_LEGEND = [
  { color: '#5A8A4A', label: 'Excelente (0-7 días)' },
  { color: '#D4AF37', label: 'Atención (8-15 días)' },
  { color: '#F97316', label: 'Riesgo (16-30 días)'  },
  { color: '#B5543E', label: 'Crítico (+30 días)'   },
]

export default function MapaClient({ fechasDisponibles, fechaDefault }: Props) {
  const isDesktop = useIsDesktop()

  const [fecha, setFecha] = useState(fechaDefault)
  const [vendedor, setVendedor] = useState('all')
  const [puntos, setPuntos] = useState<Punto[]>([])
  const [deudaGlobal, setDeudaGlobal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [capaViz, setCapaViz] = useState<CapaViz>('pedidos')
  const [tileTipo, setTileTipo] = useState<TileTipo>('mapa')
  const [mostrarSinCompra, setMostrarSinCompra] = useState(false)
  const [mostrarLeads, setMostrarLeads] = useState(false)
  const [leads, setLeads] = useState<LeadPunto[]>([])
  const [productoFiltro, setProductoFiltro] = useState('all')
  const [playing, setPlaying] = useState(false)
  const [modoRango, setModoRango] = useState(false)
  const [fechaFin, setFechaFin] = useState('')
  const [showFiltrosExtra, setShowFiltrosExtra] = useState(false)
  const playTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null)
  useEffect(() => {
    if (!('geolocation' in navigator)) return
    navigator.geolocation.getCurrentPosition(
      pos => setUserCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {},
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 5 * 60 * 1000 }
    )
  }, [])

  const [busquedaLoc, setBusquedaLoc] = useState('')
  const [resultadosLoc, setResultadosLoc] = useState<{ display_name: string; lat: string; lon: string }[]>([])
  const [buscandoLoc, setBuscandoLoc] = useState(false)
  const [showResultadosLoc, setShowResultadosLoc] = useState(false)
  const [flyTarget, setFlyTarget] = useState<FlyTarget | null>(null)
  const buscarLocTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (buscarLocTimer.current) clearTimeout(buscarLocTimer.current)
    if (busquedaLoc.trim().length < 3) { setResultadosLoc([]); return }
    buscarLocTimer.current = setTimeout(async () => {
      setBuscandoLoc(true)
      try {
        const res = await fetch(`/api/geocode?bias=cl&q=${encodeURIComponent(busquedaLoc.trim())}`)
        const data = await res.json()
        setResultadosLoc(Array.isArray(data) ? data : [])
      } catch {
        setResultadosLoc([])
      } finally {
        setBuscandoLoc(false)
      }
    }, 400)
    return () => { if (buscarLocTimer.current) clearTimeout(buscarLocTimer.current) }
  }, [busquedaLoc])

  function irAResultado(r: { display_name: string; lat: string; lon: string }) {
    setFlyTarget({ lat: parseFloat(r.lat), lng: parseFloat(r.lon), zoom: 13, ts: Date.now() })
    setBusquedaLoc(r.display_name.split(',').slice(0, 2).join(', '))
    setShowResultadosLoc(false)
  }

  function irAMiUbicacion() {
    if (!userCoords) return
    setFlyTarget({ lat: userCoords.lat, lng: userCoords.lng, zoom: 14, ts: Date.now() })
  }

  const fechaIdx = fechasDisponibles.indexOf(fecha)

  const fetchData = useCallback(async (f: string, v: string, fFin: string, sinCompra: boolean) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ fecha: f, vendedor: v })
      if (fFin && fFin > f) params.set('fechaFin', fFin)
      if (sinCompra) params.set('sinCompra', '1')
      const res = await fetch(`/api/mapa?${params}`)
      const data: MapaResponse = await res.json()
      setPuntos(Array.isArray(data?.puntos) ? data.puntos : [])
      setDeudaGlobal(data?.deudaGlobal ?? 0)
    } catch {
      setPuntos([])
      setDeudaGlobal(0)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData(fecha, vendedor, modoRango ? fechaFin : '', mostrarSinCompra)
  }, [fecha, vendedor, fechaFin, modoRango, mostrarSinCompra, fetchData])

  useEffect(() => {
    if (!mostrarLeads || leads.length > 0) return
    fetch('/api/leads?conCoords=1&limit=6000')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (Array.isArray(d?.leads)) setLeads(d.leads) })
      .catch(() => {})
  }, [mostrarLeads, leads.length])

  const leadsFiltrados = useMemo(() =>
    mostrarLeads ? leads.filter(l => l.lat != null && l.lng != null) : [],
    [mostrarLeads, leads])

  useEffect(() => {
    if (!playing) { if (playTimerRef.current) clearTimeout(playTimerRef.current); return }
    if (fechaIdx <= 0) { setPlaying(false); return }
    playTimerRef.current = setTimeout(() => setFecha(fechasDisponibles[fechaIdx - 1]), 850)
    return () => { if (playTimerRef.current) clearTimeout(playTimerRef.current) }
  }, [playing, fechaIdx, fechasDisponibles])

  const productosDisponibles = useMemo(() => {
    const set = new Set<string>()
    for (const p of puntos) for (const pr of p.productos) if (pr.producto) set.add(pr.producto)
    return [...set].sort()
  }, [puntos])

  const puntosFiltrados = useMemo(() => {
    let base = vendedor === 'all' ? puntos : puntos.filter(p => dspV(p.vendedor_actual) === vendedor || p.sin_compra)
    if (productoFiltro !== 'all') {
      base = base
        .map(p => {
          if (p.sin_compra) return p
          const litrosProd = p.productos.filter(pr => pr.producto === productoFiltro).reduce((s, pr) => s + pr.litros, 0)
          if (litrosProd <= 0) return null
          return { ...p, litros_total: Math.round(litrosProd * 10) / 10, productos: p.productos.filter(pr => pr.producto === productoFiltro) }
        })
        .filter((p): p is Punto => p !== null)
    }
    return base
  }, [puntos, vendedor, productoFiltro])

  const conVenta = puntosFiltrados.filter(p => !p.sin_compra)
  const sinVenta = puntosFiltrados.filter(p => p.sin_compra)

  const kpis = useMemo(() => {
    const litros = conVenta.reduce((s, p) => s + p.litros_total, 0)
    const venta = conVenta.reduce((s, p) => s + p.total_sin_impuesto, 0)
    const pedidos = conVenta.reduce((s, p) => s + p.pedidos_count, 0)
    return { litros, clientes: conVenta.length, pedidos, ticket: pedidos > 0 ? venta / pedidos : 0 }
  }, [conVenta])

  const insights = useMemo(() => {
    const totalLitros = conVenta.reduce((s, p) => s + p.litros_total, 0)
    const porLocalidad = new Map<string, number>()
    for (const p of conVenta) {
      const loc = p.localidad || 'Sin localidad'
      porLocalidad.set(loc, (porLocalidad.get(loc) ?? 0) + p.litros_total)
    }
    const ranking = [...porLocalidad.entries()].sort((a, b) => b[1] - a[1])
    const top = ranking[0]
    const zonaCaliente = top && totalLitros > 0
      ? { nombre: top[0], pct: Math.round((top[1] / totalLitros) * 100) }
      : null
    const enRiesgo = conVenta.filter(p => (p.dias_sin_compra ?? 0) > 30).length
      + sinVenta.filter(p => (p.dias_sin_compra ?? 0) > 30).length
    return { zonaCaliente, zonasBlancas: sinVenta.length, enRiesgo, rankingLocalidades: ranking.slice(0, 6), totalLitros }
  }, [conVenta, sinVenta])

  const territorios = useMemo(() => {
    return [{ vendedor: 'Vendedor Planta', litros: conVenta.reduce((s, p) => s + p.litros_total, 0), clientes: conVenta.length }]
  }, [conVenta])

  const hayDatos = conVenta.length > 0

  // ═══════════════════════════════════════════════════════════
  // DESKTOP
  if (isDesktop) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: C.bg, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <MapPin size={20} style={{ color: C.gold }} />
            <div>
              <h1 style={{ fontSize: 19, fontWeight: 900, color: C.cream, letterSpacing: '-0.5px', lineHeight: 1.1 }}>Mapa de Pedidos</h1>
              <p style={{ fontSize: 12, color: C.muted, marginTop: 1 }}>Visualiza ventas, clientes y oportunidades</p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: C.card, borderRadius: 12, padding: '5px 8px', border: `1px solid ${C.border}` }}>
              <button onClick={() => { setPlaying(false); const n = fechasDisponibles[fechaIdx + 1]; if (n) setFecha(n) }} disabled={fechaIdx >= fechasDisponibles.length - 1} style={navBtnStyle(fechaIdx >= fechasDisponibles.length - 1)}><ChevronLeft size={14} /></button>
              <Calendar size={13} style={{ color: C.gold, flexShrink: 0 }} />
              <select value={fecha} onChange={e => { setPlaying(false); setFecha(e.target.value) }} style={{ background: 'transparent', border: 'none', color: C.cream, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', outline: 'none', minWidth: 92 }}>
                {fechasDisponibles.map(f => <option key={f} value={f} style={{ background: C.card }}>{formatFecha(f)}</option>)}
              </select>
              <button onClick={() => { setPlaying(false); const p = fechasDisponibles[fechaIdx - 1]; if (p) setFecha(p) }} disabled={fechaIdx <= 0} style={navBtnStyle(fechaIdx <= 0)}><ChevronRight size={14} /></button>
            </div>
            <SegmentedControl items={TILES} value={tileTipo} onChange={v => setTileTipo(v as TileTipo)} />
          </div>
        </div>

        <div style={{ position: 'relative', padding: '10px 20px 0', flexShrink: 0 }}>
          <SearchBar busquedaLoc={busquedaLoc} setBusquedaLoc={setBusquedaLoc} buscandoLoc={buscandoLoc} showResultadosLoc={showResultadosLoc} setShowResultadosLoc={setShowResultadosLoc} resultadosLoc={resultadosLoc} irAResultado={irAResultado} irAMiUbicacion={irAMiUbicacion} userCoords={userCoords} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, padding: '12px 20px 0', flexShrink: 0 }}>
          <KPICard icon={<Droplets size={14} />} color={C.gold} label="Ventas del período" value={`${formatLitros(kpis.litros)} L`} />
          <KPICard icon={<Users size={14} />} color={C.green} label="Clientes activos" value={kpis.clientes} />
          <KPICard icon={<ShoppingCart size={14} />} color="#8a9fff" label="Pedidos" value={kpis.pedidos} />
          <KPICard icon={<DollarSign size={14} />} color="#c084fc" label="Ticket promedio" value={formatPeso(kpis.ticket)} />
          <DebtCard value={formatPeso(deudaGlobal)} />
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: '10px 20px' }}>
          <button onClick={() => { if (fechaIdx <= 0) setFecha(fechasDisponibles[fechasDisponibles.length - 1]); setPlaying(p => !p) }} style={iconBtnStyle(playing)}>
            {playing ? <Pause size={14} /> : <Play size={14} />}
          </button>
          <SegmentedControl items={VENDEDORES} value={vendedor} onChange={setVendedor} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: '0 12px', height: 40 }}>
            <Package size={13} style={{ color: C.muted, flexShrink: 0 }} />
            <select value={productoFiltro} onChange={e => setProductoFiltro(e.target.value)} style={{ background: 'transparent', border: 'none', color: C.muted, fontSize: 12, fontWeight: 600, cursor: 'pointer', outline: 'none', maxWidth: 150 }}>
              <option value="all" style={{ background: C.card }}>Todos los productos</option>
              {productosDisponibles.map(p => <option key={p} value={p} style={{ background: C.card }}>{p}</option>)}
            </select>
          </div>
          <SegmentedControl items={CAPAS} value={capaViz} onChange={v => setCapaViz(v as CapaViz)} />
          <FilterToggle label="Zonas blancas" active={mostrarSinCompra} onClick={() => setMostrarSinCompra(b => !b)} icon={mostrarSinCompra ? <Eye size={12} /> : <EyeOff size={12} />} />
          <FilterToggle label={`Leads${mostrarLeads && leads.length ? ` (${leadsFiltrados.length})` : ''}`} active={mostrarLeads} onClick={() => setMostrarLeads(b => !b)} icon={<Target size={12} />} color="#a78bfa" />
          <FilterToggle label="Rango" active={modoRango} onClick={() => setModoRango(r => !r)} icon={<Calendar size={12} />} color="#60a5fa" />
          {modoRango && (
            <select value={fechaFin || fecha} onChange={e => setFechaFin(e.target.value)} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, color: C.cream, fontSize: 12, fontWeight: 600, padding: '0 10px', height: 40, outline: 'none' }}>
              {fechasDisponibles.filter(f => f >= fecha).map(f => <option key={f} value={f} style={{ background: C.card }}>{formatFecha(f)}</option>)}
            </select>
          )}
        </div>

        <div style={{ flex: 1, display: 'flex', gap: 14, padding: '0 20px', minWidth: 0, minHeight: 0 }}>
          <div style={{ flex: 1, position: 'relative', borderRadius: 16, overflow: 'hidden', border: `1px solid ${C.border}`, minHeight: 0 }}>
            {loading && (
              <div style={{ position: 'absolute', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(10,10,13,0.7)' }}>
                <Loader2 size={20} style={{ color: C.muted, animation: 'spin 1s linear infinite' }} />
              </div>
            )}
            {!loading && !hayDatos && !mostrarSinCompra && <EmptyMap />}
            <MapLeaflet puntos={puntosFiltrados} leads={leadsFiltrados} vendedorFiltro={vendedor} capaViz={capaViz} mostrarSinCompra={mostrarSinCompra} tileTipo={tileTipo} userCoords={userCoords} flyTarget={flyTarget} onLocationSaved={() => fetchData(fecha, vendedor, modoRango ? fechaFin : '', mostrarSinCompra)} />
          </div>
          <div style={{ width: 290, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto', paddingBottom: 14 }}>
            <PanelCard title="Tipos de punto" icon={<MapPin size={13} style={{ color: C.gold }} />}>
              <LegendRow dot="#D4AF37" label="Cliente El Regreso — con compra" />
              <LegendRow dot="#374151" label="Cliente El Regreso — sin compra" dotBorder="1.5px dashed #4B5563" />
              <LegendRow dot="rgba(138,109,31,0.18)" label="Posible cliente (lead)" dotBorder="1.5px dashed #8A6D1F" />
            </PanelCard>
            <PanelCard title="Salud del cliente" icon={<Heart size={13} style={{ color: C.green }} />}>
              {SALUD_LEGEND.map(s => <LegendRow key={s.label} dot={s.color} label={s.label} />)}
              <LegendRow dot="#6B7280" label="Sin información" />
            </PanelCard>
            <PanelCard title="Insights de la zona" icon={<TrendingUp size={13} style={{ color: C.gold }} />}>
              {insights.zonaCaliente && (
                <InsightRow icon={<Flame size={14} />} color={C.red} title="Zona caliente"
                  body={`${insights.zonaCaliente.nombre} concentra el ${insights.zonaCaliente.pct}% de tus ventas.`} />
              )}
              {mostrarSinCompra && insights.zonasBlancas > 0 && (
                <InsightRow icon={<Target size={14} />} color="#818cf8" title="Oportunidad detectada"
                  body={`${insights.zonasBlancas} clientes sin compra en este período.`} />
              )}
              {insights.enRiesgo > 0 && (
                <InsightRow icon={<AlertTriangle size={14} />} color={C.gold} title="Clientes en riesgo"
                  body={`${insights.enRiesgo} clientes no compran hace más de 30 días.`} />
              )}
              {!insights.zonaCaliente && insights.enRiesgo === 0 && (
                <p style={{ fontSize: 12, color: C.muted }}>Sin insights para este período.</p>
              )}
            </PanelCard>
            <PanelCard title="Capas activas" icon={<LayersIcon size={13} style={{ color: C.gold }} />}>
              <CapaToggle label="Mapa de calor" color={C.red} active={capaViz === 'calor'} onClick={() => setCapaViz(capaViz === 'calor' ? 'pedidos' : 'calor')} />
              <CapaToggle label="Salud de clientes" color={C.green} active={capaViz === 'salud'} onClick={() => setCapaViz(capaViz === 'salud' ? 'pedidos' : 'salud')} />
              <CapaToggle label="Zonas blancas" color="#818cf8" active={mostrarSinCompra} onClick={() => setMostrarSinCompra(b => !b)} />
            </PanelCard>
          </div>
        </div>

        <div style={{ padding: '12px 20px 12px', flexShrink: 0 }}>
          <TimelineBar playing={playing} fecha={fecha} fechaIdx={fechaIdx} fechasDisponibles={fechasDisponibles} setPlaying={setPlaying} setFecha={setFecha} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, padding: '0 20px 18px', flexShrink: 0 }}>
          <TerritoryPanel territorios={territorios} />
          <RankingPanel insights={insights} />
        </div>

        <style>{`@keyframes spin { to { transform: rotate(360deg) } } @keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:0.3 } }`}</style>
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════
  // MOBILE — nuevo diseño
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%', background: `linear-gradient(180deg, ${C.bg} 0%, ${C.bgAlt} 100%)`, overflowX: 'hidden' }}>

      {/* Header */}
      <div style={{ padding: '20px 18px 4px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <p style={{ fontSize: 11, fontWeight: 600, color: C.muted, letterSpacing: '0.3px', textTransform: 'uppercase', marginBottom: 3 }}>
            {new Date().toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
          <h1 style={{ fontSize: 32, fontWeight: 800, color: C.cream, letterSpacing: '-1px', lineHeight: 1.05 }}>Mapa</h1>
        </div>
        <div style={{ width: 44, height: 44, borderRadius: '50%', flexShrink: 0, marginTop: 4, background: 'linear-gradient(135deg, #e8b93e 0%, #c9962a 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: 15, fontWeight: 800, color: '#1a1200', letterSpacing: '-0.5px' }}>CH</span>
        </div>
      </div>

      {/* Selector de fecha */}
      <div style={{ padding: '12px 18px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: C.card, borderRadius: 16, padding: '10px 14px', border: `1px solid ${C.border}` }}>
          <button onClick={() => { setPlaying(false); const n = fechasDisponibles[fechaIdx + 1]; if (n) setFecha(n) }} disabled={fechaIdx >= fechasDisponibles.length - 1} style={{ ...navBtnStyle(fechaIdx >= fechasDisponibles.length - 1), width: 32, height: 32, borderRadius: 8, background: C.cardElevated }}>
            <ChevronLeft size={16} />
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <Calendar size={15} style={{ color: C.gold }} />
            <select value={fecha} onChange={e => { setPlaying(false); setFecha(e.target.value) }} style={{ background: 'transparent', border: 'none', color: C.cream, fontSize: 14, fontWeight: 700, cursor: 'pointer', outline: 'none' }}>
              {fechasDisponibles.map(f => <option key={f} value={f} style={{ background: C.card }}>{formatFecha(f)}</option>)}
            </select>
          </div>
          <button onClick={() => { setPlaying(false); const p = fechasDisponibles[fechaIdx - 1]; if (p) setFecha(p) }} disabled={fechaIdx <= 0} style={{ ...navBtnStyle(fechaIdx <= 0), width: 32, height: 32, borderRadius: 8, background: C.cardElevated }}>
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Tile type */}
      <div style={{ padding: '10px 18px 0' }}>
        <SegmentedControl items={TILES} value={tileTipo} onChange={v => setTileTipo(v as TileTipo)} fullWidth />
      </div>

      {/* Buscador */}
      <div style={{ position: 'relative', padding: '10px 18px 0' }}>
        <SearchBar busquedaLoc={busquedaLoc} setBusquedaLoc={setBusquedaLoc} buscandoLoc={buscandoLoc} showResultadosLoc={showResultadosLoc} setShowResultadosLoc={setShowResultadosLoc} resultadosLoc={resultadosLoc} irAResultado={irAResultado} irAMiUbicacion={irAMiUbicacion} userCoords={userCoords} gpsSize={46} />
      </div>

      {/* Mapa */}
      <div style={{ padding: '10px 18px 0' }}>
        <div style={{ height: 180, position: 'relative', borderRadius: 18, overflow: 'hidden', border: `1px solid ${C.border}`, background: C.card }}>
          {loading && (
            <div style={{ position: 'absolute', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(10,10,13,0.7)' }}>
              <Loader2 size={22} style={{ color: C.muted, animation: 'spin 1s linear infinite' }} />
            </div>
          )}
          {!loading && !hayDatos && !mostrarSinCompra && <EmptyMap />}
          <MapLeaflet puntos={puntosFiltrados} leads={leadsFiltrados} vendedorFiltro={vendedor} capaViz={capaViz} mostrarSinCompra={mostrarSinCompra} tileTipo={tileTipo} userCoords={userCoords} flyTarget={flyTarget} onLocationSaved={() => fetchData(fecha, vendedor, modoRango ? fechaFin : '', mostrarSinCompra)} />
        </div>
      </div>

      {/* KPI 2x2 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, padding: '10px 18px 0' }}>
        <KPICard icon={<Droplets size={14} />} color={C.gold} label="Ventas período" value={`${formatLitros(kpis.litros)} L`} />
        <KPICard icon={<Users size={14} />} color={C.green} label="Clientes activos" value={kpis.clientes} />
        <KPICard icon={<ShoppingCart size={14} />} color="#8a9fff" label="Pedidos" value={kpis.pedidos} />
        <KPICard icon={<DollarSign size={14} />} color="#c084fc" label="Ticket promedio" value={formatPeso(kpis.ticket)} />
      </div>

      {/* Deuda card */}
      <div style={{ padding: '10px 18px 0' }}>
        <DebtCard value={formatPeso(deudaGlobal)} />
      </div>

      {/* Filtros */}
      <div style={{ padding: '12px 18px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => setShowFiltrosExtra(b => !b)} style={{ width: 44, height: 44, borderRadius: 12, border: `1px solid ${showFiltrosExtra ? C.goldBorder : C.border}`, background: showFiltrosExtra ? C.goldDim : C.card, color: showFiltrosExtra ? C.gold : C.muted, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
            <SlidersHorizontal size={16} />
          </button>
          <div style={{ flex: 1 }}>
            <SegmentedControl items={VENDEDORES} value={vendedor} onChange={setVendedor} fullWidth />
          </div>
        </div>

        {showFiltrosExtra && (
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10, background: C.card, borderRadius: 14, padding: 14, border: `1px solid ${C.border}` }}>
            <div>
              <p style={{ fontSize: 10, color: C.muted, fontWeight: 700, textTransform: 'uppercase', marginBottom: 6, letterSpacing: '0.5px' }}>Visualización</p>
              <SegmentedControl items={CAPAS} value={capaViz} onChange={v => setCapaViz(v as CapaViz)} fullWidth />
            </div>
            {productosDisponibles.length > 0 && (
              <div>
                <p style={{ fontSize: 10, color: C.muted, fontWeight: 700, textTransform: 'uppercase', marginBottom: 6, letterSpacing: '0.5px' }}>Producto</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: C.cardElevated, border: `1px solid ${C.border}`, borderRadius: 10, padding: '0 12px', height: 40 }}>
                  <Package size={13} style={{ color: C.muted, flexShrink: 0 }} />
                  <select value={productoFiltro} onChange={e => setProductoFiltro(e.target.value)} style={{ background: 'transparent', border: 'none', color: C.muted, fontSize: 13, fontWeight: 600, cursor: 'pointer', outline: 'none', flex: 1 }}>
                    <option value="all" style={{ background: C.card }}>Todos los productos</option>
                    {productosDisponibles.map(p => <option key={p} value={p} style={{ background: C.card }}>{p}</option>)}
                  </select>
                </div>
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <FilterToggle label="Zonas blancas" active={mostrarSinCompra} onClick={() => setMostrarSinCompra(b => !b)} icon={mostrarSinCompra ? <Eye size={12} /> : <EyeOff size={12} />} />
              <FilterToggle label={`Leads${mostrarLeads && leads.length ? ` (${leadsFiltrados.length})` : ''}`} active={mostrarLeads} onClick={() => setMostrarLeads(b => !b)} icon={<Target size={12} />} color="#a78bfa" />
              <FilterToggle label="Rango" active={modoRango} onClick={() => setModoRango(r => !r)} icon={<Calendar size={12} />} color="#60a5fa" />
            </div>
            {modoRango && (
              <select value={fechaFin || fecha} onChange={e => setFechaFin(e.target.value)} style={{ background: C.cardElevated, border: `1px solid ${C.border}`, borderRadius: 10, color: C.cream, fontSize: 13, fontWeight: 600, padding: '0 12px', height: 40, outline: 'none' }}>
                {fechasDisponibles.filter(f => f >= fecha).map(f => <option key={f} value={f} style={{ background: C.card }}>{formatFecha(f)}</option>)}
              </select>
            )}
          </div>
        )}
      </div>

      {/* Timeline */}
      <div style={{ padding: '12px 18px 0' }}>
        <TimelineBar playing={playing} fecha={fecha} fechaIdx={fechaIdx} fechasDisponibles={fechasDisponibles} setPlaying={setPlaying} setFecha={setFecha} />
      </div>

      {/* Insights */}
      {(insights.zonaCaliente || insights.enRiesgo > 0 || (mostrarSinCompra && insights.zonasBlancas > 0)) && (
        <div style={{ padding: '12px 18px 0' }}>
          <PanelCard title="Insights" icon={<TrendingUp size={13} style={{ color: C.gold }} />}>
            {insights.zonaCaliente && (
              <InsightRow icon={<Flame size={14} />} color={C.red} title="Zona caliente" body={`${insights.zonaCaliente.nombre} concentra el ${insights.zonaCaliente.pct}% de tus ventas.`} />
            )}
            {mostrarSinCompra && insights.zonasBlancas > 0 && (
              <InsightRow icon={<Target size={14} />} color="#818cf8" title="Oportunidad detectada" body={`${insights.zonasBlancas} clientes sin compra en este período.`} />
            )}
            {insights.enRiesgo > 0 && (
              <InsightRow icon={<AlertTriangle size={14} />} color={C.gold} title="Clientes en riesgo" body={`${insights.enRiesgo} clientes no compran hace más de 30 días.`} />
            )}
          </PanelCard>
        </div>
      )}

      {/* Ranking */}
      {insights.rankingLocalidades.length > 0 && (
        <div style={{ padding: '12px 18px 0' }}>
          <PanelCard title="Ranking de zonas" icon={<MapPin size={13} style={{ color: C.gold }} />}>
            {insights.rankingLocalidades.map(([loc, litros], i) => {
              const pct = insights.totalLitros > 0 ? Math.round((litros / insights.totalLitros) * 100) : 0
              return (
                <div key={loc} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0', borderBottom: i < insights.rankingLocalidades.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                  <span style={{ fontSize: 11, color: C.muted, width: 14, fontWeight: 700 }}>{i + 1}</span>
                  <span style={{ fontSize: 13, color: C.cream, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{loc}</span>
                  <span style={{ fontSize: 12, color: C.mutedLight, fontWeight: 600, whiteSpace: 'nowrap' }}>{formatLitros(litros)} L</span>
                  <span style={{ fontSize: 11, color: C.gold, fontWeight: 700, minWidth: 34, textAlign: 'right' }}>{pct}%</span>
                </div>
              )
            })}
          </PanelCard>
        </div>
      )}

      {/* Territorio */}
      <div style={{ padding: '12px 18px 96px' }}>
        <TerritoryPanel territorios={territorios} />
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } } @keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:0.3 } }`}</style>
    </div>
  )
}

// ── Sub-componentes ──────────────────────────────────────────

function navBtnStyle(disabled: boolean): React.CSSProperties {
  return { background: 'none', border: 'none', cursor: disabled ? 'not-allowed' : 'pointer', padding: 4, color: C.muted, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.3 : 1, flexShrink: 0 }
}

function iconBtnStyle(active: boolean): React.CSSProperties {
  return { width: 40, height: 40, borderRadius: 10, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: active ? C.goldDim : C.card, color: active ? C.gold : C.muted, outline: `1px solid ${active ? C.goldBorder : C.border}` }
}

function KPICard({ icon, color, label, value }: { icon: React.ReactNode; color: string; label: string; value: string | number }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: '14px 14px 12px' }}>
      <div style={{ width: 26, height: 26, borderRadius: 8, background: `${color}1a`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10, color }}>
        {icon}
      </div>
      <div style={{ fontSize: 20, fontWeight: 900, color: C.cream, letterSpacing: '-0.5px', lineHeight: 1, marginBottom: 4 }}>{value}</div>
      <div style={{ fontSize: 10.5, color: C.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px' }}>{label}</div>
    </div>
  )
}

function DebtCard({ value }: { value: string }) {
  return (
    <div style={{ background: `linear-gradient(135deg, ${C.redDim} 0%, transparent 100%)`, border: `1px solid ${C.redBorder}`, borderRadius: 16, padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <div>
        <div style={{ fontSize: 10.5, color: C.red, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4, opacity: 0.85 }}>Deuda total</div>
        <div style={{ fontSize: 22, fontWeight: 900, color: C.red, letterSpacing: '-0.5px' }}>{value}</div>
      </div>
      <div style={{ width: 36, height: 36, borderRadius: 10, background: `${C.red}1a`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <AlertTriangle size={16} style={{ color: C.red }} />
      </div>
    </div>
  )
}

function SegmentedControl({ items, value, onChange, fullWidth }: {
  items: { value: string; label: string | React.ReactNode; icon?: React.ReactNode }[]
  value: string; onChange: (v: string) => void; fullWidth?: boolean
}) {
  return (
    <div style={{ display: 'flex', background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 3, gap: 2, width: fullWidth ? '100%' : undefined }}>
      {items.map(item => {
        const active = item.value === value
        return (
          <button key={item.value} onClick={() => onChange(item.value)} style={{ flex: fullWidth ? 1 : undefined, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '8px 12px', borderRadius: 9, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', background: active ? C.gold : 'transparent', color: active ? '#1a1200' : C.muted }}>
            {item.icon && item.icon}{item.label}
          </button>
        )
      })}
    </div>
  )
}

function SearchBar({ busquedaLoc, setBusquedaLoc, buscandoLoc, showResultadosLoc, setShowResultadosLoc, resultadosLoc, irAResultado, irAMiUbicacion, userCoords, gpsSize = 40 }: {
  busquedaLoc: string; setBusquedaLoc: (v: string) => void; buscandoLoc: boolean
  showResultadosLoc: boolean; setShowResultadosLoc: (v: boolean) => void
  resultadosLoc: { display_name: string; lat: string; lon: string }[]
  irAResultado: (r: { display_name: string; lat: string; lon: string }) => void
  irAMiUbicacion: () => void; userCoords: { lat: number; lng: number } | null
  gpsSize?: number
}) {
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <div style={{ flex: 1, position: 'relative', minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '0 12px', height: 46 }}>
          <Search size={14} style={{ color: C.muted, flexShrink: 0 }} />
          <input
            value={busquedaLoc}
            onChange={e => { setBusquedaLoc(e.target.value); setShowResultadosLoc(true) }}
            onFocus={() => setShowResultadosLoc(true)}
            onBlur={() => setTimeout(() => setShowResultadosLoc(false), 200)}
            placeholder="Buscar ciudad, comuna o dirección..."
            style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none', color: C.cream, fontSize: 13.5 }}
          />
          {buscandoLoc && <Loader2 size={14} style={{ color: C.muted, flexShrink: 0, animation: 'spin 1s linear infinite' }} />}
          {!buscandoLoc && busquedaLoc && (
            <button onClick={() => setBusquedaLoc('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, display: 'flex', flexShrink: 0 }}>
              <X size={14} />
            </button>
          )}
        </div>
        {showResultadosLoc && resultadosLoc.length > 0 && (
          <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, zIndex: 1100, background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.5)', overflow: 'hidden', maxHeight: 240, overflowY: 'auto' }}>
            {resultadosLoc.map((r, i) => (
              <button key={i} onClick={() => irAResultado(r)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', background: 'none', border: 'none', borderTop: i > 0 ? `1px solid ${C.border}` : 'none', cursor: 'pointer', fontSize: 13, color: C.cream, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {r.display_name}
              </button>
            ))}
          </div>
        )}
      </div>
      <button onClick={irAMiUbicacion} disabled={!userCoords} style={{ width: gpsSize, height: gpsSize, borderRadius: 14, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: userCoords ? 'linear-gradient(135deg, #e8b93e 0%, #c9962a 100%)' : C.card, border: userCoords ? 'none' : `1px solid ${C.border}`, color: userCoords ? '#1a1200' : C.muted, cursor: userCoords ? 'pointer' : 'not-allowed' }}>
        <Locate size={16} />
      </button>
    </div>
  )
}

function FilterToggle({ label, active, onClick, icon, color = C.gold }: { label: string; active: boolean; onClick: () => void; icon?: React.ReactNode; color?: string }) {
  return (
    <button onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 12px', height: 36, borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', background: active ? `${color}1a` : C.cardElevated, color: active ? color : C.muted, outline: `1px solid ${active ? `${color}40` : C.border}` }}>
      {icon}{label}
    </button>
  )
}

function EmptyMap() {
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
      <div style={{ textAlign: 'center', background: 'rgba(10,10,13,0.92)', borderRadius: 14, padding: '18px 24px', border: `1px solid ${C.border}` }}>
        <MapPin size={24} style={{ color: '#444', margin: '0 auto 6px' }} />
        <p style={{ fontSize: 13, color: C.muted, fontWeight: 600 }}>Sin ventas para este período</p>
      </div>
    </div>
  )
}

function TimelineBar({ playing, fecha, fechaIdx, fechasDisponibles, setPlaying, setFecha }: {
  playing: boolean; fecha: string; fechaIdx: number; fechasDisponibles: string[]
  setPlaying: (f: (b: boolean) => boolean) => void; setFecha: (f: string) => void
}) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
      <button onClick={() => { if (fechaIdx <= 0) setFecha(fechasDisponibles[fechasDisponibles.length - 1]); setPlaying(p => !p) }} style={{ width: 38, height: 38, borderRadius: '50%', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.gold, color: '#1a1200', flexShrink: 0 }}>
        {playing ? <Pause size={16} /> : <Play size={16} style={{ marginLeft: 2 }} />}
      </button>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
          <span style={{ fontSize: 10, color: C.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Línea de tiempo</span>
          <span style={{ fontSize: 10, color: C.gold, fontWeight: 700 }}>{formatFecha(fecha)}</span>
        </div>
        <input type="range" min={0} max={Math.max(0, fechasDisponibles.length - 1)} value={fechasDisponibles.length - 1 - (fechaIdx < 0 ? 0 : fechaIdx)} onChange={e => { setPlaying(() => false); const idx = fechasDisponibles.length - 1 - Number(e.target.value); setFecha(fechasDisponibles[idx]) }} style={{ width: '100%', accentColor: C.gold, cursor: 'pointer' }} />
      </div>
    </div>
  )
}

function PanelCard({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 12 }}>
        {icon}
        <span style={{ fontSize: 13, fontWeight: 700, color: C.cream }}>{title}</span>
      </div>
      {children}
    </div>
  )
}

function LegendRow({ dot, label, dotBorder }: { dot: string; label: string; dotBorder?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0' }}>
      <div style={{ width: 10, height: 10, borderRadius: '50%', background: dot, border: dotBorder, flexShrink: 0 }} />
      <span style={{ fontSize: 12, color: C.mutedLight }}>{label}</span>
    </div>
  )
}

function InsightRow({ icon, color, title, body }: { icon: React.ReactNode; color: string; title: string; body: string }) {
  return (
    <div style={{ display: 'flex', gap: 9, padding: '8px 0', borderBottom: `1px solid ${C.border}` }}>
      <div style={{ color, flexShrink: 0, marginTop: 1 }}>{icon}</div>
      <div>
        <div style={{ fontSize: 12.5, fontWeight: 700, color, marginBottom: 2 }}>{title}</div>
        <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.4)', lineHeight: 1.35 }}>{body}</div>
      </div>
    </div>
  )
}

function CapaToggle({ label, color, active, onClick }: { label: string; color: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '7px 0', background: 'none', border: 'none', cursor: 'pointer' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: active ? color : C.border, flexShrink: 0 }} />
        <span style={{ fontSize: 12.5, color: active ? C.cream : C.muted }}>{label}</span>
      </div>
      {active ? <Eye size={13} style={{ color }} /> : <EyeOff size={13} style={{ color: C.muted }} />}
    </button>
  )
}

function TerritoryPanel({ territorios }: { territorios: { vendedor: string; litros: number; clientes: number }[] }) {
  const maxL = Math.max(...territorios.map(x => x.litros), 1)
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 16 }}>
      <p style={{ fontSize: 13, fontWeight: 700, color: C.cream, marginBottom: 12 }}>Resumen por territorio</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {territorios.map(t => {
          const color = VEND_COLOR[t.vendedor] ?? C.muted
          return (
            <div key={t.vendedor} style={{ background: C.cardElevated, borderRadius: 12, padding: 12, border: `1px solid ${C.border}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: color }} />
                <span style={{ fontSize: 11.5, color, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{dspV(t.vendedor)}</span>
              </div>
              <div style={{ fontSize: 20, fontWeight: 900, color: C.cream, letterSpacing: '-0.5px', marginBottom: 2 }}>{formatLitros(t.litros)} L</div>
              <div style={{ fontSize: 10.5, color: C.muted, marginBottom: 8 }}>{t.clientes} clientes</div>
              <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.05)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${(t.litros / maxL) * 100}%`, background: color, borderRadius: 2 }} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function RankingPanel({ insights }: { insights: { rankingLocalidades: [string, number][]; totalLitros: number } }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 16 }}>
      <p style={{ fontSize: 13, fontWeight: 700, color: C.cream, marginBottom: 12 }}>Ranking de zonas <span style={{ color: C.muted, fontWeight: 500 }}>(litros)</span></p>
      {insights.rankingLocalidades.length === 0 ? (
        <p style={{ fontSize: 12, color: C.muted }}>Sin datos de zonas.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {insights.rankingLocalidades.map(([loc, litros], i) => {
            const pct = insights.totalLitros > 0 ? Math.round((litros / insights.totalLitros) * 100) : 0
            return (
              <div key={loc} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 11, color: C.muted, width: 14, fontWeight: 700 }}>{i + 1}</span>
                <span style={{ fontSize: 12.5, color: C.cream, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{loc}</span>
                <span style={{ fontSize: 12, color: C.mutedLight, fontWeight: 600, width: 60, textAlign: 'right' }}>{formatLitros(litros)} L</span>
                <span style={{ fontSize: 11, color: C.gold, fontWeight: 700, width: 34, textAlign: 'right' }}>{pct}%</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
