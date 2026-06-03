'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import dynamic from 'next/dynamic'
import {
  Calendar, Droplets, MapPin, Users, ShoppingCart, DollarSign, AlertTriangle,
  ChevronLeft, ChevronRight, Loader2, Play, Pause, Thermometer, Heart,
  Flame, Target, TrendingUp, Eye, EyeOff, Layers as LayersIcon, Package,
} from 'lucide-react'
import { VEND_COLOR } from '@/lib/theme'
import { useIsDesktop } from '@/lib/useIsDesktop'
import type { Punto, CapaViz, TileTipo, LeadPunto } from './MapLeaflet'

const MapLeaflet = dynamic(() => import('./MapLeaflet'), {
  ssr: false,
  loading: () => (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#111' }}>
      <Loader2 size={28} style={{ color: '#888', animation: 'spin 1s linear infinite' }} />
    </div>
  ),
})

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
  { value: 'all',             label: 'Todos'  },
  { value: 'Javier Badilla',  label: 'Javier' },
  { value: 'Carlos Urrejola', label: 'Carlos' },
]

const CAPAS: { value: CapaViz; label: string; icon: React.ReactNode }[] = [
  { value: 'pedidos', label: 'Pedidos', icon: <MapPin size={13} /> },
  { value: 'salud',   label: 'Salud',   icon: <Heart size={13} /> },
  { value: 'calor',   label: 'Calor',   icon: <Thermometer size={13} /> },
]

const TILES: { value: TileTipo; label: string }[] = [
  { value: 'mapa',     label: 'Mapa'     },
  { value: 'satelite', label: 'Satélite' },
  { value: 'hibrido',  label: 'Híbrido'  },
]

const SALUD_LEGEND = [
  { color: '#34D399', label: 'Excelente (0-7 días)' },
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
  const playTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fechaIdx = fechasDisponibles.indexOf(fecha)

  // ── Fetch ───────────────────────────────────────────────
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

  // ── Leads (posibles clientes): cargar una vez al activar ──
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

  // ── Play timeline ────────────────────────────────────────
  useEffect(() => {
    if (!playing) { if (playTimerRef.current) clearTimeout(playTimerRef.current); return }
    if (fechaIdx <= 0) { setPlaying(false); return }
    playTimerRef.current = setTimeout(() => setFecha(fechasDisponibles[fechaIdx - 1]), 850)
    return () => { if (playTimerRef.current) clearTimeout(playTimerRef.current) }
  }, [playing, fechaIdx, fechasDisponibles])

  // ── Lista de productos disponibles ───────────────────────
  const productosDisponibles = useMemo(() => {
    const set = new Set<string>()
    for (const p of puntos) for (const pr of p.productos) if (pr.producto) set.add(pr.producto)
    return [...set].sort()
  }, [puntos])

  // ── Puntos derivados (filtro vendedor + producto) ────────
  const puntosFiltrados = useMemo(() => {
    let base = vendedor === 'all' ? puntos : puntos.filter(p => p.vendedor_actual === vendedor || p.sin_compra)
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

  // ── KPIs ─────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const litros = conVenta.reduce((s, p) => s + p.litros_total, 0)
    const venta = conVenta.reduce((s, p) => s + p.total_sin_impuesto, 0)
    const pedidos = conVenta.reduce((s, p) => s + p.pedidos_count, 0)
    return {
      litros,
      clientes: conVenta.length,
      pedidos,
      ticket: pedidos > 0 ? venta / pedidos : 0,
    }
  }, [conVenta])

  // ── Insights de la zona ──────────────────────────────────
  const insights = useMemo(() => {
    const totalLitros = conVenta.reduce((s, p) => s + p.litros_total, 0)
    // Zona caliente: localidad con más litros
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

  // ── Resumen por territorio ───────────────────────────────
  const territorios = useMemo(() => {
    return ['Javier Badilla', 'Carlos Urrejola'].map(v => {
      const pts = conVenta.filter(p => p.vendedor_actual === v)
      return { vendedor: v, litros: pts.reduce((s, p) => s + p.litros_total, 0), clientes: pts.length }
    })
  }, [conVenta])

  const hayDatos = conVenta.length > 0

  // ════════════════════════════════════════════════════════
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#0A0A0A', overflow: isDesktop ? 'hidden' : 'auto' }}>

      {/* ─── Header + tile switch ─── */}
      <div style={{ padding: isDesktop ? '14px 20px' : '10px 14px', borderBottom: '1px solid #1A1A1A', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexShrink: 0, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <MapPin size={isDesktop ? 22 : 18} style={{ color: '#D4AF37' }} />
          <div>
            <h1 style={{ fontSize: isDesktop ? 20 : 16, fontWeight: 900, color: 'white', letterSpacing: '-0.5px', lineHeight: 1.1 }}>Mapa de Pedidos</h1>
            {isDesktop && <p style={{ fontSize: 12, color: '#666', marginTop: 1 }}>Visualiza ventas, clientes y oportunidades en el mapa</p>}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {/* Fecha */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 3, background: '#161616', borderRadius: 10, padding: '4px 6px', border: '1px solid #262626' }}>
            <button onClick={() => { setPlaying(false); const n = fechasDisponibles[fechaIdx + 1]; if (n) setFecha(n) }} disabled={fechaIdx >= fechasDisponibles.length - 1} style={navBtn(fechaIdx >= fechasDisponibles.length - 1)}><ChevronLeft size={15} /></button>
            <Calendar size={13} style={{ color: '#D4AF37', flexShrink: 0 }} />
            <select value={fecha} onChange={e => { setPlaying(false); setFecha(e.target.value) }} style={{ background: 'transparent', border: 'none', color: 'white', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', outline: 'none', minWidth: 92 }}>
              {fechasDisponibles.map(f => <option key={f} value={f} style={{ background: '#161616' }}>{formatFecha(f)}</option>)}
            </select>
            <button onClick={() => { setPlaying(false); const p = fechasDisponibles[fechaIdx - 1]; if (p) setFecha(p) }} disabled={fechaIdx <= 0} style={navBtn(fechaIdx <= 0)}><ChevronRight size={15} /></button>
          </div>

          {/* Tile switch */}
          <div style={{ display: 'flex', background: '#161616', border: '1px solid #262626', borderRadius: 10, padding: 3, gap: 2 }}>
            {TILES.map(t => (
              <button key={t.value} onClick={() => setTileTipo(t.value)} style={{ padding: '5px 11px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 11.5, fontWeight: 700, background: tileTipo === t.value ? '#D4AF37' : 'transparent', color: tileTipo === t.value ? '#1a1200' : '#666' }}>{t.label}</button>
            ))}
          </div>
        </div>
      </div>

      {/* ─── KPI row ─── */}
      <div style={{ display: 'grid', gridTemplateColumns: isDesktop ? 'repeat(5, 1fr)' : 'repeat(2, 1fr)', gap: 10, padding: isDesktop ? '14px 20px 0' : '12px 14px 0', flexShrink: 0 }}>
        <KPICard icon={<Droplets size={16} />} color="#D4AF37" label="Ventas del período" value={`${formatLitros(kpis.litros)} L`} />
        <KPICard icon={<Users size={16} />} color="#34D399" label="Clientes activos" value={kpis.clientes} />
        <KPICard icon={<ShoppingCart size={16} />} color="#D4AF37" label="Pedidos" value={kpis.pedidos} />
        <KPICard icon={<DollarSign size={16} />} color="#8A6D1F" label="Ticket promedio" value={formatPeso(kpis.ticket)} />
        <KPICard icon={<AlertTriangle size={16} />} color="#B5543E" label="Deuda total" value={formatPeso(deudaGlobal)} alert />
      </div>

      {/* ─── Filtros ─── */}
      <div style={{ display: 'flex', gap: 7, alignItems: 'center', flexWrap: 'wrap', padding: isDesktop ? '14px 20px' : '12px 14px' }}>
        {/* Play */}
        <button onClick={() => { if (fechaIdx <= 0) setFecha(fechasDisponibles[fechasDisponibles.length - 1]); setPlaying(p => !p) }} title={playing ? 'Pausar' : 'Reproducir línea de tiempo'} style={{ width: 36, height: 36, borderRadius: 10, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: playing ? '#D4AF3722' : '#161616', color: playing ? '#D4AF37' : '#888', outline: playing ? '1px solid #D4AF3744' : 'none', flexShrink: 0 }}>
          {playing ? <Pause size={15} /> : <Play size={15} />}
        </button>

        {/* Vendedor */}
        <div style={{ display: 'flex', gap: 3 }}>
          {VENDEDORES.map(v => (
            <button key={v.value} onClick={() => setVendedor(v.value)} style={{ height: 36, padding: '0 15px', borderRadius: 10, fontSize: 12.5, fontWeight: 700, border: 'none', cursor: 'pointer', background: vendedor === v.value ? (VEND_COLOR[v.value] ?? '#D4AF37') : '#161616', color: vendedor === v.value ? '#000' : '#666' }}>{v.label}</button>
          ))}
        </div>

        {/* Producto */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: productoFiltro !== 'all' ? 'rgba(245,158,11,0.12)' : '#161616', border: `1px solid ${productoFiltro !== 'all' ? 'rgba(245,158,11,0.35)' : '#262626'}`, borderRadius: 10, padding: '0 12px', height: 36 }}>
          <Package size={14} style={{ color: productoFiltro !== 'all' ? '#D4AF37' : '#666' }} />
          <select value={productoFiltro} onChange={e => setProductoFiltro(e.target.value)} style={{ background: 'transparent', border: 'none', color: productoFiltro !== 'all' ? '#D4AF37' : '#999', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', outline: 'none', maxWidth: 180 }}>
            <option value="all" style={{ background: '#161616' }}>Todos los productos</option>
            {productosDisponibles.map(p => <option key={p} value={p} style={{ background: '#161616' }}>{p}</option>)}
          </select>
        </div>

        {/* Capa viz */}
        <div style={{ display: 'flex', background: '#111', border: '1px solid #222', borderRadius: 10, padding: 3, gap: 2 }}>
          {CAPAS.map(c => (
            <button key={c.value} onClick={() => setCapaViz(c.value)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 11.5, fontWeight: 700, background: capaViz === c.value ? '#D4AF37' : 'transparent', color: capaViz === c.value ? '#1a1200' : '#666' }}>{c.icon}{c.label}</button>
          ))}
        </div>

        {/* Zonas blancas */}
        <button onClick={() => setMostrarSinCompra(b => !b)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 12px', height: 36, borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 11.5, fontWeight: 700, background: mostrarSinCompra ? 'rgba(99,102,241,0.15)' : '#111', color: mostrarSinCompra ? '#818cf8' : '#555', outline: mostrarSinCompra ? '1px solid rgba(99,102,241,0.3)' : '1px solid #222' }}>
          {mostrarSinCompra ? <Eye size={13} /> : <EyeOff size={13} />} Zonas blancas
        </button>

        {/* Leads (posibles clientes) */}
        <button onClick={() => setMostrarLeads(b => !b)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 12px', height: 36, borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 11.5, fontWeight: 700, background: mostrarLeads ? 'rgba(167,139,250,0.18)' : '#111', color: mostrarLeads ? '#8A6D1F' : '#555', outline: mostrarLeads ? '1px solid rgba(167,139,250,0.4)' : '1px solid #222' }}>
          <Target size={13} /> Leads{mostrarLeads && leads.length ? ` (${leadsFiltrados.length})` : ''}
        </button>

        {/* Rango */}
        <button onClick={() => setModoRango(r => !r)} style={{ padding: '0 12px', height: 36, borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 11.5, fontWeight: 700, background: modoRango ? 'rgba(96,165,250,0.15)' : '#111', color: modoRango ? '#D4AF37' : '#555', outline: modoRango ? '1px solid rgba(96,165,250,0.3)' : '1px solid #222' }}>Rango</button>
        {modoRango && (
          <select value={fechaFin || fecha} onChange={e => setFechaFin(e.target.value)} style={{ background: '#161616', border: '1px solid #262626', borderRadius: 10, color: 'white', fontSize: 12, fontWeight: 600, padding: '0 10px', height: 36, outline: 'none' }}>
            {fechasDisponibles.filter(f => f >= fecha).map(f => <option key={f} value={f} style={{ background: '#161616' }}>{formatFecha(f)}</option>)}
          </select>
        )}

        {playing && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '0 10px', height: 36, borderRadius: 10, background: 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.3)' }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#D4AF37', animation: 'pulse 1s ease-in-out infinite' }} />
            <span style={{ fontSize: 11.5, color: '#D4AF37', fontWeight: 700 }}>{formatFecha(fecha)}</span>
          </div>
        )}
      </div>

      {/* ─── Main: mapa + sidebar ─── */}
      <div style={{ flex: 1, display: 'flex', gap: 14, padding: isDesktop ? '0 20px' : '0 14px', minHeight: isDesktop ? 0 : 460 }}>
        {/* Mapa */}
        <div style={{ flex: 1, position: 'relative', borderRadius: 16, overflow: 'hidden', border: '1px solid #1A1A1A', minHeight: isDesktop ? 0 : 420 }}>
          {loading && (
            <div style={{ position: 'absolute', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(10,10,10,0.6)', backdropFilter: 'blur(2px)' }}>
              <div style={{ textAlign: 'center', color: '#888' }}>
                <Loader2 size={22} style={{ margin: '0 auto 6px', animation: 'spin 1s linear infinite' }} />
                <p style={{ fontSize: 12 }}>{playing ? formatFecha(fecha) : 'Actualizando...'}</p>
              </div>
            </div>
          )}
          {!loading && !hayDatos && !mostrarSinCompra && (
            <div style={{ position: 'absolute', inset: 0, zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
              <div style={{ textAlign: 'center', background: 'rgba(22,22,22,0.92)', borderRadius: 16, padding: '20px 28px', border: '1px solid #2A2A2A' }}>
                <MapPin size={28} style={{ color: '#444', margin: '0 auto 8px' }} />
                <p style={{ fontSize: 14, color: '#888', fontWeight: 600 }}>Sin ventas para este período</p>
                <p style={{ fontSize: 12, color: '#555', marginTop: 4 }}>Selecciona otro día o activa zonas blancas</p>
              </div>
            </div>
          )}
          <MapLeaflet puntos={puntosFiltrados} leads={leadsFiltrados} vendedorFiltro="all" capaViz={capaViz} mostrarSinCompra={mostrarSinCompra} tileTipo={tileTipo} />
        </div>

        {/* Sidebar */}
        <div style={{ width: isDesktop ? 300 : '100%', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 12, overflowY: isDesktop ? 'auto' : 'visible', paddingBottom: isDesktop ? 14 : 0, marginTop: isDesktop ? 0 : 14 }}>
          {/* Salud del cliente */}
          <Panel title="Salud del cliente" icon={<Heart size={14} style={{ color: '#34D399' }} />}>
            {SALUD_LEGEND.map(s => (
              <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0' }}>
                <div style={{ width: 9, height: 9, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: '#aaa' }}>{s.label}</span>
              </div>
            ))}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0' }}>
              <div style={{ width: 9, height: 9, borderRadius: '50%', background: '#6B7280', flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: '#aaa' }}>Sin información</span>
            </div>
          </Panel>

          {/* Insights */}
          <Panel title="Insights de la zona" icon={<TrendingUp size={14} style={{ color: '#D4AF37' }} />}>
            {insights.zonaCaliente && (
              <Insight icon={<Flame size={15} />} color="#B5543E" title="Zona caliente"
                body={`${insights.zonaCaliente.nombre} concentra el ${insights.zonaCaliente.pct}% de tus ventas del período.`} />
            )}
            {mostrarSinCompra && insights.zonasBlancas > 0 && (
              <Insight icon={<Target size={15} />} color="#818cf8" title="Oportunidad detectada"
                body={`${insights.zonasBlancas} clientes sin compra en este período — zonas blancas con potencial.`} />
            )}
            {insights.enRiesgo > 0 && (
              <Insight icon={<AlertTriangle size={15} />} color="#D4AF37" title="Clientes en riesgo"
                body={`${insights.enRiesgo} clientes no compran hace más de 30 días.`} />
            )}
            {!insights.zonaCaliente && insights.enRiesgo === 0 && (
              <p style={{ fontSize: 12, color: '#555' }}>Sin insights para este período.</p>
            )}
          </Panel>

          {/* Capas activas */}
          <Panel title="Capas activas" icon={<LayersIcon size={14} style={{ color: '#D4AF37' }} />}>
            <CapaToggle label="Mapa de calor" color="#B5543E" active={capaViz === 'calor'} onClick={() => setCapaViz(capaViz === 'calor' ? 'pedidos' : 'calor')} />
            <CapaToggle label="Salud de clientes" color="#34D399" active={capaViz === 'salud'} onClick={() => setCapaViz(capaViz === 'salud' ? 'pedidos' : 'salud')} />
            <CapaToggle label="Zonas blancas" color="#818cf8" active={mostrarSinCompra} onClick={() => setMostrarSinCompra(b => !b)} />
          </Panel>
        </div>
      </div>

      {/* ─── Línea de tiempo ─── */}
      <div style={{ padding: isDesktop ? '14px 20px' : '14px', flexShrink: 0 }}>
        <div style={{ background: '#121212', border: '1px solid #1E1E1E', borderRadius: 14, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <button onClick={() => { if (fechaIdx <= 0) setFecha(fechasDisponibles[fechasDisponibles.length - 1]); setPlaying(p => !p) }} style={{ width: 40, height: 40, borderRadius: '50%', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#D4AF37', color: '#1a1200', flexShrink: 0 }}>
            {playing ? <Pause size={18} /> : <Play size={18} style={{ marginLeft: 2 }} />}
          </button>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 11, color: '#666', fontWeight: 700 }}>LÍNEA DE TIEMPO</span>
              <span style={{ fontSize: 11, color: '#D4AF37', fontWeight: 700 }}>{formatFecha(fecha)}</span>
            </div>
            <input
              type="range" min={0} max={Math.max(0, fechasDisponibles.length - 1)}
              value={fechasDisponibles.length - 1 - (fechaIdx < 0 ? 0 : fechaIdx)}
              onChange={e => { setPlaying(false); const idx = fechasDisponibles.length - 1 - Number(e.target.value); setFecha(fechasDisponibles[idx]) }}
              style={{ width: '100%', accentColor: '#D4AF37', cursor: 'pointer' }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <span style={{ fontSize: 10, color: '#555' }}>Ventas altas</span>
            <div style={{ width: 70, height: 8, borderRadius: 4, background: 'linear-gradient(to right, #1e40af, #7c3aed, #d97706, #dc2626)' }} />
          </div>
        </div>
      </div>

      {/* ─── Bottom: territorio + ranking ─── */}
      <div style={{ display: 'grid', gridTemplateColumns: isDesktop ? '1fr 1fr' : '1fr', gap: 14, padding: isDesktop ? '0 20px 20px' : '0 14px 20px', flexShrink: 0 }}>
        {/* Territorios */}
        <div style={{ background: '#121212', border: '1px solid #1E1E1E', borderRadius: 14, padding: 16 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: '#ccc', marginBottom: 12 }}>Resumen por territorio</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {territorios.map(t => {
              const color = VEND_COLOR[t.vendedor] ?? '#888'
              const maxL = Math.max(...territorios.map(x => x.litros), 1)
              return (
                <div key={t.vendedor} style={{ background: '#0E0E0E', borderRadius: 10, padding: 12, border: `1px solid ${color}25` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
                    <span style={{ fontSize: 12, color, fontWeight: 700 }}>{t.vendedor.split(' ')[0]}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: 22, fontWeight: 900, color: 'white' }}>{formatLitros(t.litros)} L</span>
                    <span style={{ fontSize: 11, color: '#666' }}>{t.clientes} clientes</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.05)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${(t.litros / maxL) * 100}%`, background: color, borderRadius: 3 }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Ranking de zonas */}
        <div style={{ background: '#121212', border: '1px solid #1E1E1E', borderRadius: 14, padding: 16 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: '#ccc', marginBottom: 12 }}>Ranking de zonas <span style={{ color: '#555', fontWeight: 500 }}>(por litros)</span></p>
          {insights.rankingLocalidades.length === 0 ? (
            <p style={{ fontSize: 12, color: '#555' }}>Sin datos de zonas.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {insights.rankingLocalidades.map(([loc, litros], i) => {
                const pct = insights.totalLitros > 0 ? Math.round((litros / insights.totalLitros) * 100) : 0
                return (
                  <div key={loc} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 11, color: '#555', width: 14, fontWeight: 700 }}>{i + 1}</span>
                    <span style={{ fontSize: 12.5, color: '#ddd', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{loc}</span>
                    <span style={{ fontSize: 12, color: '#aaa', fontWeight: 600, width: 64, textAlign: 'right' }}>{formatLitros(litros)} L</span>
                    <span style={{ fontSize: 11, color: '#D4AF37', fontWeight: 700, width: 38, textAlign: 'right' }}>{pct}%</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.3 } }
      `}</style>
    </div>
  )
}

// ── Sub-componentes ──────────────────────────────────────────

function navBtn(disabled: boolean): React.CSSProperties {
  return { background: 'none', border: 'none', cursor: disabled ? 'not-allowed' : 'pointer', padding: 2, color: '#888', display: 'flex', opacity: disabled ? 0.3 : 1 }
}

function KPICard({ icon, color, label, value, alert }: { icon: React.ReactNode; color: string; label: string; value: string | number; alert?: boolean }) {
  return (
    <div style={{ background: '#121212', border: `1px solid ${alert ? color + '33' : '#1E1E1E'}`, borderRadius: 14, padding: '13px 15px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 }}>
        <span style={{ fontSize: 11, color: alert ? color : '#777', fontWeight: 600 }}>{label}</span>
        <div style={{ color }}>{icon}</div>
      </div>
      <div style={{ fontSize: 22, fontWeight: 900, color: alert ? color : 'white', letterSpacing: '-0.5px' }}>{value}</div>
    </div>
  )
}

function Panel({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ background: '#121212', border: '1px solid #1E1E1E', borderRadius: 14, padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 11 }}>
        {icon}
        <span style={{ fontSize: 13, fontWeight: 700, color: '#ccc' }}>{title}</span>
      </div>
      {children}
    </div>
  )
}

function Insight({ icon, color, title, body }: { icon: React.ReactNode; color: string; title: string; body: string }) {
  return (
    <div style={{ display: 'flex', gap: 9, padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <div style={{ color, flexShrink: 0, marginTop: 1 }}>{icon}</div>
      <div>
        <div style={{ fontSize: 12.5, fontWeight: 700, color, marginBottom: 2 }}>{title}</div>
        <div style={{ fontSize: 11.5, color: '#999', lineHeight: 1.35 }}>{body}</div>
      </div>
    </div>
  )
}

function CapaToggle({ label, color, active, onClick }: { label: string; color: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '7px 0', background: 'none', border: 'none', cursor: 'pointer' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 9, height: 9, borderRadius: '50%', background: active ? color : '#333', flexShrink: 0 }} />
        <span style={{ fontSize: 12.5, color: active ? '#ddd' : '#666' }}>{label}</span>
      </div>
      {active ? <Eye size={14} style={{ color }} /> : <EyeOff size={14} style={{ color: '#444' }} />}
    </button>
  )
}
