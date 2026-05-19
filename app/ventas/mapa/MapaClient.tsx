'use client'

import { useState, useEffect, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { Calendar, Droplets, MapPin, Users, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'

const MapLeaflet = dynamic(() => import('./MapLeaflet'), {
  ssr: false,
  loading: () => (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#111' }}>
      <div style={{ textAlign: 'center', color: '#888' }}>
        <Loader2 size={28} style={{ margin: '0 auto 8px', animation: 'spin 1s linear infinite' }} />
        <p style={{ fontSize: 13 }}>Cargando mapa...</p>
      </div>
    </div>
  ),
})

interface Punto {
  nombre_fantasia: string
  vendedor_actual: string
  categoria_negocio: string | null
  localidad: string
  lat: number
  lng: number
  litros_total: number
  total_sin_impuesto: number
  pedidos_count: number
  productos: { producto: string; envase: string | null; litros: number }[]
}

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
  { value: 'all', label: 'Todos' },
  { value: 'Javier Badilla', label: 'Javier' },
  { value: 'Carlos Urrejola', label: 'Carlos' },
]

export default function MapaClient({ fechasDisponibles, fechaDefault }: Props) {
  const [fecha, setFecha] = useState(fechaDefault)
  const [vendedor, setVendedor] = useState('all')
  const [puntos, setPuntos] = useState<Punto[]>([])
  const [loading, setLoading] = useState(true)

  const fechaIdx = fechasDisponibles.indexOf(fecha)

  const fetchData = useCallback(async (f: string, v: string) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ fecha: f, vendedor: v })
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
    fetchData(fecha, vendedor)
  }, [fecha, vendedor, fetchData])

  const totalLitros = puntos.filter(p => vendedor === 'all' || p.vendedor_actual === vendedor)
    .reduce((s, p) => s + p.litros_total, 0)
  const totalClientes = puntos.filter(p => vendedor === 'all' || p.vendedor_actual === vendedor).length

  const javiPuntos = puntos.filter(p => p.vendedor_actual === 'Javier Badilla')
  const carlosPuntos = puntos.filter(p => p.vendedor_actual === 'Carlos Urrejola')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#0D0D0D' }}>
      {/* Toolbar */}
      <div style={{
        padding: '12px 16px', borderBottom: '1px solid #1E1E1E',
        display: 'flex', flexDirection: 'column', gap: 10, flexShrink: 0,
      }}>
        {/* Title + stats */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <MapPin size={18} style={{ color: '#F59E0B' }} />
            <h1 style={{ fontSize: 18, fontWeight: 900, color: 'white', letterSpacing: '-0.5px' }}>
              Mapa de Pedidos
            </h1>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <Droplets size={14} style={{ color: '#60A5FA' }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: 'white' }}>{totalLitros.toFixed(1)} L</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <Users size={14} style={{ color: '#34D399' }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: 'white' }}>{totalClientes}</span>
            </div>
          </div>
        </div>

        {/* Filtros */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Navegador de fechas */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#1A1A1A', borderRadius: 10, padding: '4px 6px', border: '1px solid #2A2A2A' }}>
            <button
              onClick={() => {
                const next = fechasDisponibles[fechaIdx + 1]
                if (next) setFecha(next)
              }}
              disabled={fechaIdx >= fechasDisponibles.length - 1}
              style={{ background: 'none', border: 'none', cursor: fechaIdx >= fechasDisponibles.length - 1 ? 'not-allowed' : 'pointer', padding: 2, color: '#888', display: 'flex' }}
            >
              <ChevronLeft size={16} />
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Calendar size={13} style={{ color: '#F59E0B' }} />
              <select
                value={fecha}
                onChange={e => setFecha(e.target.value)}
                style={{
                  background: 'transparent', border: 'none', color: 'white',
                  fontSize: 13, fontWeight: 600, cursor: 'pointer', outline: 'none',
                }}
              >
                {fechasDisponibles.map(f => (
                  <option key={f} value={f} style={{ background: '#1A1A1A' }}>
                    {formatFecha(f)}
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={() => {
                const prev = fechasDisponibles[fechaIdx - 1]
                if (prev) setFecha(prev)
              }}
              disabled={fechaIdx <= 0}
              style={{ background: 'none', border: 'none', cursor: fechaIdx <= 0 ? 'not-allowed' : 'pointer', padding: 2, color: '#888', display: 'flex' }}
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Filtro vendedor */}
          <div style={{ display: 'flex', gap: 4 }}>
            {VENDEDORES.map(v => (
              <button
                key={v.value}
                onClick={() => setVendedor(v.value)}
                style={{
                  padding: '5px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                  border: 'none', cursor: 'pointer', transition: 'all 0.15s',
                  background: vendedor === v.value
                    ? v.value === 'Javier Badilla' ? '#F59E0B'
                      : v.value === 'Carlos Urrejola' ? '#60A5FA'
                        : '#F59E0B'
                    : '#1A1A1A',
                  color: vendedor === v.value ? '#000' : '#888',
                }}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>

        {/* Mini stats por vendedor */}
        {(javiPuntos.length > 0 || carlosPuntos.length > 0) && (
          <div style={{ display: 'flex', gap: 8 }}>
            {javiPuntos.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#1A1200', borderRadius: 8, padding: '5px 10px', border: '1px solid #3D2E00' }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#F59E0B' }} />
                <span style={{ fontSize: 11, color: '#F59E0B', fontWeight: 600 }}>Javier</span>
                <span style={{ fontSize: 11, color: '#888' }}>
                  {javiPuntos.reduce((s, p) => s + p.litros_total, 0).toFixed(1)} L · {javiPuntos.length} clientes
                </span>
              </div>
            )}
            {carlosPuntos.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#001228', borderRadius: 8, padding: '5px 10px', border: '1px solid #1E3A5A' }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#60A5FA' }} />
                <span style={{ fontSize: 11, color: '#60A5FA', fontWeight: 600 }}>Carlos</span>
                <span style={{ fontSize: 11, color: '#888' }}>
                  {carlosPuntos.reduce((s, p) => s + p.litros_total, 0).toFixed(1)} L · {carlosPuntos.length} clientes
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Mapa */}
      <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
        {loading && (
          <div style={{
            position: 'absolute', inset: 0, zIndex: 1000,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(13,13,13,0.7)', backdropFilter: 'blur(2px)',
          }}>
            <div style={{ textAlign: 'center', color: '#888' }}>
              <Loader2 size={24} style={{ margin: '0 auto 8px', animation: 'spin 1s linear infinite' }} />
              <p style={{ fontSize: 12 }}>Actualizando...</p>
            </div>
          </div>
        )}

        {!loading && puntos.length === 0 && (
          <div style={{
            position: 'absolute', inset: 0, zIndex: 10,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            pointerEvents: 'none',
          }}>
            <div style={{ textAlign: 'center', background: 'rgba(26,26,26,0.9)', borderRadius: 16, padding: '20px 28px', border: '1px solid #2A2A2A' }}>
              <MapPin size={28} style={{ color: '#444', margin: '0 auto 8px' }} />
              <p style={{ fontSize: 14, color: '#888', fontWeight: 600 }}>Sin ventas para esta fecha</p>
              <p style={{ fontSize: 12, color: '#555', marginTop: 4 }}>Selecciona otro día</p>
            </div>
          </div>
        )}

        <MapLeaflet puntos={puntos} vendedorFiltro={vendedor} />
      </div>

      {/* Leyenda */}
      <div style={{
        padding: '8px 16px', borderTop: '1px solid #1E1E1E',
        display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0,
        background: '#0D0D0D',
      }}>
        <span style={{ fontSize: 11, color: '#555', fontWeight: 600 }}>LEYENDA</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#F59E0B', opacity: 0.8 }} />
            <span style={{ fontSize: 11, color: '#888' }}>Javier Badilla</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#60A5FA', opacity: 0.8 }} />
          <span style={{ fontSize: 11, color: '#888' }}>Carlos Urrejola</span>
        </div>
        <span style={{ fontSize: 10, color: '#444', marginLeft: 'auto' }}>Tamaño = litros vendidos · Clic en punto para detalles</span>
      </div>
    </div>
  )
}
