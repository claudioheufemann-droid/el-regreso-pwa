'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import dynamic from 'next/dynamic'
import {
  Calendar, Droplets, MapPin, Users, ChevronLeft, ChevronRight, Loader2,
  Play, Pause, Thermometer, Heart, Layers, Eye, EyeOff,
} from 'lucide-react'
import { VEND_COLOR } from '@/lib/theme'
import type { Punto, CapaViz } from './MapLeaflet'

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

function formatFecha(dateStr: string) {
  if (!dateStr) return ''
  const [y, m, d] = dateStr.split('-')
  const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
  return `${parseInt(d)} ${meses[parseInt(m) - 1]} ${y}`
}

const VENDEDORES = [
  { value: 'all',             label: 'Todos',   color: '#F59E0B' },
  { value: 'Javier Badilla',  label: 'Javier',  color: VEND_COLOR['Javier Badilla']  ?? '#F59E0B' },
  { value: 'Carlos Urrejola', label: 'Carlos',  color: VEND_COLOR['Carlos Urrejola'] ?? '#60A5FA' },
]

const CAPAS: { value: CapaViz; label: string; icon: React.ReactNode }[] = [
  { value: 'pedidos', label: 'Pedidos',  icon: <MapPin size={13} />    },
  { value: 'salud',   label: 'Salud',    icon: <Heart size={13} />     },
  { value: 'calor',   label: 'Calor',    icon: <Thermometer size={13} /> },
]

// Salud chip labels
function getSaludLegend() {
  return [
    { color: '#34D399', label: 'Excelente (0-7d)' },
    { color: '#F59E0B', label: 'Atención (8-15d)' },
    { color: '#F97316', label: 'Riesgo (16-30d)'  },
    { color: '#EF4444', label: 'Crítico (+30d)'   },
  ]
}

export default function MapaClient({ fechasDisponibles, fechaDefault }: Props) {
  const [fecha, setFecha] = useState(fechaDefault)
  const [vendedor, setVendedor] = useState('all')
  const [puntos, setPuntos] = useState<Punto[]>([])
  const [loading, setLoading] = useState(true)
  const [capaViz, setCapaViz] = useState<CapaViz>('pedidos')
  const [mostrarSinCompra, setMostrarSinCompra] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [modoRango, setModoRango] = useState(false)
  const [fechaFin, setFechaFin] = useState('')
  const playTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fechaIdx = fechasDisponibles.indexOf(fecha)

  // ── Fetch de datos ───────────────────────────────────────
  const fetchData = useCallback(async (f: string, v: string, fFin: string, sinCompra: boolean) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ fecha: f, vendedor: v })
      if (fFin && fFin > f) params.set('fechaFin', fFin)
      if (sinCompra) params.set('sinCompra', '1')
      const res = await fetch(`/api/mapa?${params}`)
      const data = await res.json()
      setPuntos(Array.isArray(data) ? data : [])
    } catch {
      setPuntos([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData(fecha, vendedor, modoRango ? fechaFin : '', mostrarSinCompra)
  }, [fecha, vendedor, fechaFin, modoRango, mostrarSinCompra, fetchData])

  // ── Play (animación timeline) ────────────────────────────
  useEffect(() => {
    if (!playing) {
      if (playTimerRef.current) clearTimeout(playTimerRef.current)
      return
    }
    // Va hacia adelante (fechas más recientes = índice menor)
    if (fechaIdx <= 0) { setPlaying(false); return }
    playTimerRef.current = setTimeout(() => {
      setFecha(fechasDisponibles[fechaIdx - 1])
    }, 800)
    return () => { if (playTimerRef.current) clearTimeout(playTimerRef.current) }
  }, [playing, fechaIdx, fechasDisponibles])

  // ── Estadísticas ─────────────────────────────────────────
  const puntosConVenta = puntos.filter(p => !p.sin_compra)
  const filtrados = vendedor === 'all' ? puntosConVenta : puntosConVenta.filter(p => p.vendedor_actual === vendedor)
  const totalLitros = filtrados.reduce((s, p) => s + p.litros_total, 0)
  const totalClientes = filtrados.length
  const sinCompraCnt = puntos.filter(p => p.sin_compra && (vendedor === 'all' || p.vendedor_actual === vendedor)).length

  const javiPuntos = puntosConVenta.filter(p => p.vendedor_actual === 'Javier Badilla')
  const carlosPuntos = puntosConVenta.filter(p => p.vendedor_actual === 'Carlos Urrejola')

  // ── Render ───────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#0D0D0D' }}>

      {/* ── Toolbar principal ── */}
      <div style={{ padding: '10px 14px', borderBottom: '1px solid #1E1E1E', display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>

        {/* Fila 1: título + stats */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <MapPin size={18} style={{ color: '#F59E0B' }} />
            <h1 style={{ fontSize: 17, fontWeight: 900, color: 'white', letterSpacing: '-0.5px' }}>
              Mapa de Pedidos
            </h1>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <Droplets size={13} style={{ color: '#60A5FA' }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: 'white' }}>
                {totalLitros.toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} L
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <Users size={13} style={{ color: '#34D399' }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: 'white' }}>{totalClientes}</span>
            </div>
            {mostrarSinCompra && sinCompraCnt > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#4B5563', border: '1px dashed #6B7280' }} />
                <span style={{ fontSize: 12, color: '#6B7280' }}>{sinCompraCnt} sin compra</span>
              </div>
            )}
          </div>
        </div>

        {/* Fila 2: timeline + vendedor */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>

          {/* Play/Pause */}
          <button
            onClick={() => {
              if (fechaIdx <= 0) setFecha(fechasDisponibles[fechasDisponibles.length - 1])
              setPlaying(p => !p)
            }}
            title={playing ? 'Pausar animación' : 'Reproducir timeline'}
            style={{
              width: 34, height: 34, borderRadius: 10, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: playing ? '#D4AF3720' : '#1A1A1A',
              color: playing ? '#D4AF37' : '#888',
              outline: playing ? '1px solid #D4AF3740' : 'none',
            }}
          >
            {playing ? <Pause size={15} /> : <Play size={15} />}
          </button>

          {/* Navegador de fechas */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 3, background: '#1A1A1A', borderRadius: 10, padding: '3px 6px', border: '1px solid #2A2A2A' }}>
            <button
              onClick={() => { setPlaying(false); const next = fechasDisponibles[fechaIdx + 1]; if (next) setFecha(next) }}
              disabled={fechaIdx >= fechasDisponibles.length - 1}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: '#888', display: 'flex', opacity: fechaIdx >= fechasDisponibles.length - 1 ? 0.3 : 1 }}
            >
              <ChevronLeft size={15} />
            </button>
            <Calendar size={12} style={{ color: '#F59E0B', flexShrink: 0 }} />
            <select
              value={fecha}
              onChange={e => { setPlaying(false); setFecha(e.target.value) }}
              style={{ background: 'transparent', border: 'none', color: 'white', fontSize: 12, fontWeight: 600, cursor: 'pointer', outline: 'none', minWidth: 90 }}
            >
              {fechasDisponibles.map(f => (
                <option key={f} value={f} style={{ background: '#1A1A1A' }}>{formatFecha(f)}</option>
              ))}
            </select>
            <button
              onClick={() => { setPlaying(false); const prev = fechasDisponibles[fechaIdx - 1]; if (prev) setFecha(prev) }}
              disabled={fechaIdx <= 0}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: '#888', display: 'flex', opacity: fechaIdx <= 0 ? 0.3 : 1 }}
            >
              <ChevronRight size={15} />
            </button>
          </div>

          {/* Modo rango */}
          <button
            onClick={() => setModoRango(r => !r)}
            title="Modo rango de fechas"
            style={{
              padding: '0 10px', height: 34, borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 700,
              background: modoRango ? 'rgba(96,165,250,0.15)' : '#1A1A1A',
              color: modoRango ? '#60A5FA' : '#555',
              outline: modoRango ? '1px solid rgba(96,165,250,0.3)' : 'none',
            }}
          >
            Rango
          </button>

          {modoRango && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 11, color: '#555' }}>hasta</span>
              <select
                value={fechaFin || fecha}
                onChange={e => setFechaFin(e.target.value)}
                style={{ background: '#1A1A1A', border: '1px solid #2A2A2A', borderRadius: 8, color: 'white', fontSize: 12, fontWeight: 600, padding: '4px 8px', outline: 'none' }}
              >
                {fechasDisponibles.filter(f => f >= fecha).map(f => (
                  <option key={f} value={f} style={{ background: '#1A1A1A' }}>{formatFecha(f)}</option>
                ))}
              </select>
            </div>
          )}

          {/* Filtro vendedor */}
          <div style={{ display: 'flex', gap: 3, marginLeft: 2 }}>
            {VENDEDORES.map(v => (
              <button
                key={v.value}
                onClick={() => setVendedor(v.value)}
                style={{
                  height: 34, padding: '0 14px', borderRadius: 10, fontSize: 12, fontWeight: 700,
                  border: 'none', cursor: 'pointer', transition: 'all 0.15s',
                  background: vendedor === v.value ? (VEND_COLOR[v.value] ?? '#F59E0B') : '#1A1A1A',
                  color: vendedor === v.value ? '#000' : '#666',
                }}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>

        {/* Fila 3: capas de visualización + toggles */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Selector de capa */}
          <div style={{ display: 'flex', background: '#111', border: '1px solid #222', borderRadius: 10, padding: 3, gap: 2 }}>
            {CAPAS.map(c => (
              <button
                key={c.value}
                onClick={() => setCapaViz(c.value)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 8,
                  border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 700, transition: 'all 0.15s',
                  background: capaViz === c.value ? '#D4AF37' : 'transparent',
                  color: capaViz === c.value ? '#1a1200' : '#666',
                }}
              >
                {c.icon}
                {c.label}
              </button>
            ))}
          </div>

          {/* Toggle zonas blancas */}
          <button
            onClick={() => setMostrarSinCompra(b => !b)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 10,
              border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 700, transition: 'all 0.15s',
              background: mostrarSinCompra ? 'rgba(99,102,241,0.15)' : '#111',
              color: mostrarSinCompra ? '#818cf8' : '#555',
              outline: mostrarSinCompra ? '1px solid rgba(99,102,241,0.3)' : '1px solid #222',
            }}
          >
            {mostrarSinCompra ? <Eye size={12} /> : <EyeOff size={12} />}
            Zonas blancas
          </button>

          {/* Mini stats por vendedor */}
          {javiPuntos.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: `${VEND_COLOR['Javier Badilla']}12`, borderRadius: 8, padding: '4px 9px', border: `1px solid ${VEND_COLOR['Javier Badilla']}30` }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: VEND_COLOR['Javier Badilla'] }} />
              <span style={{ fontSize: 11, color: VEND_COLOR['Javier Badilla'], fontWeight: 600 }}>Javier</span>
              <span style={{ fontSize: 11, color: '#888' }}>
                {javiPuntos.reduce((s, p) => s + p.litros_total, 0).toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} L · {javiPuntos.length}
              </span>
            </div>
          )}
          {carlosPuntos.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: `${VEND_COLOR['Carlos Urrejola']}12`, borderRadius: 8, padding: '4px 9px', border: `1px solid ${VEND_COLOR['Carlos Urrejola']}30` }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: VEND_COLOR['Carlos Urrejola'] }} />
              <span style={{ fontSize: 11, color: VEND_COLOR['Carlos Urrejola'], fontWeight: 600 }}>Carlos</span>
              <span style={{ fontSize: 11, color: '#888' }}>
                {carlosPuntos.reduce((s, p) => s + p.litros_total, 0).toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} L · {carlosPuntos.length}
              </span>
            </div>
          )}

          {/* Indicador animación */}
          {playing && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 8, background: 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.3)' }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#D4AF37', animation: 'pulse 1s ease-in-out infinite' }} />
              <span style={{ fontSize: 11, color: '#D4AF37', fontWeight: 700 }}>Reproduciendo</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Mapa ── */}
      <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
        {loading && (
          <div style={{ position: 'absolute', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(13,13,13,0.6)', backdropFilter: 'blur(2px)' }}>
            <div style={{ textAlign: 'center', color: '#888' }}>
              <Loader2 size={22} style={{ margin: '0 auto 6px', animation: 'spin 1s linear infinite' }} />
              <p style={{ fontSize: 12 }}>{playing ? `${formatFecha(fecha)}` : 'Actualizando...'}</p>
            </div>
          </div>
        )}

        {!loading && puntosConVenta.length === 0 && !mostrarSinCompra && (
          <div style={{ position: 'absolute', inset: 0, zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
            <div style={{ textAlign: 'center', background: 'rgba(26,26,26,0.9)', borderRadius: 16, padding: '20px 28px', border: '1px solid #2A2A2A' }}>
              <MapPin size={28} style={{ color: '#444', margin: '0 auto 8px' }} />
              <p style={{ fontSize: 14, color: '#888', fontWeight: 600 }}>Sin ventas para este período</p>
              <p style={{ fontSize: 12, color: '#555', marginTop: 4 }}>Selecciona otro día o activa zonas blancas</p>
            </div>
          </div>
        )}

        <MapLeaflet
          puntos={puntos}
          vendedorFiltro={vendedor}
          capaViz={capaViz}
          mostrarSinCompra={mostrarSinCompra}
        />
      </div>

      {/* ── Leyenda dinámica ── */}
      <div style={{ padding: '7px 14px', borderTop: '1px solid #1E1E1E', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, background: '#0D0D0D', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10, color: '#444', fontWeight: 700, letterSpacing: '0.08em' }}>LEYENDA</span>

        {capaViz === 'pedidos' && (
          <>
            {[{ n: 'Javier Badilla' }, { n: 'Carlos Urrejola' }].map(({ n }) => (
              <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 9, height: 9, borderRadius: '50%', background: VEND_COLOR[n] ?? '#888' }} />
                <span style={{ fontSize: 11, color: '#888' }}>{n.split(' ')[0]}</span>
              </div>
            ))}
            <span style={{ fontSize: 10, color: '#444', marginLeft: 'auto' }}>Tamaño = litros · Clic para detalles</span>
          </>
        )}

        {capaViz === 'salud' && (
          <>
            {getSaludLegend().map(({ color, label }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 9, height: 9, borderRadius: '50%', background: color }} />
                <span style={{ fontSize: 11, color: '#888' }}>{label}</span>
              </div>
            ))}
          </>
        )}

        {capaViz === 'calor' && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 60, height: 8, borderRadius: 4, background: 'linear-gradient(to right, #1e40af, #7c3aed, #d97706, #dc2626, #fff)' }} />
              <span style={{ fontSize: 11, color: '#888' }}>Densidad de ventas</span>
            </div>
            <span style={{ fontSize: 10, color: '#444', marginLeft: 'auto' }}>Intensidad por litros</span>
          </>
        )}

        {mostrarSinCompra && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 9, height: 9, borderRadius: '50%', background: '#374151', border: '1px dashed #6B7280' }} />
            <span style={{ fontSize: 11, color: '#6B7280' }}>Sin compra en período</span>
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.3 } }
      `}</style>
    </div>
  )
}
