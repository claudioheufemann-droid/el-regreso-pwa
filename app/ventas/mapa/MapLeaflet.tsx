'use client'

import { useEffect, useRef, useState } from 'react'
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import WAModal, { type WATarget } from '@/components/ui/WAModal'

export interface Punto {
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
  telefono: string | null
  email: string | null
  contacto: string | null
  dias_sin_compra: number | null
  segmento: string | null
  score: number | null
  alerta_nivel: string | null
  ultima_compra: string | null
  sin_compra: boolean
}

export type CapaViz = 'pedidos' | 'salud' | 'calor'

interface Props {
  puntos: Punto[]
  vendedorFiltro: string
  capaViz: CapaViz
  mostrarSinCompra: boolean
}

// ── Helpers ──────────────────────────────────────────────────

function formatPeso(n: number) {
  return '$' + Math.round(n).toLocaleString('es-CL')
}

function getColorVendedor(vendedor: string) {
  if (vendedor === 'Javier Badilla') return '#F59E0B'
  if (vendedor === 'Carlos Urrejola') return '#60A5FA'
  return '#A78BFA'
}

// Salud: verde <7d, amarillo 8-15d, naranja 16-30d, rojo >30d
function getColorSalud(dias: number | null): string {
  if (dias === null) return '#6B7280'
  if (dias <= 7)  return '#34D399'  // verde: excelente
  if (dias <= 15) return '#F59E0B'  // amarillo: atención
  if (dias <= 30) return '#F97316'  // naranja: riesgo
  return '#EF4444'                   // rojo: crítico
}

function getSaludLabel(dias: number | null): string {
  if (dias === null) return 'Sin datos'
  if (dias <= 7)  return `Excelente · ${dias}d`
  if (dias <= 15) return `Atención · ${dias}d`
  if (dias <= 30) return `Riesgo · ${dias}d`
  return `Crítico · ${dias}d`
}

function getRadius(litros: number) {
  if (litros <= 0) return 5
  if (litros < 10) return 6
  if (litros < 30) return 9
  if (litros < 60) return 12
  if (litros < 100) return 15
  if (litros < 200) return 18
  return 22
}

// ── Componente Heatmap ───────────────────────────────────────

function HeatmapLayer({ puntos }: { puntos: Punto[] }) {
  const map = useMap()
  const layerRef = useRef<any>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    // Importar leaflet.heat dinámicamente
    import('leaflet').then(L => {
      require('leaflet.heat')
      if (layerRef.current) {
        map.removeLayer(layerRef.current)
      }
      const points = puntos
        .filter(p => p.litros_total > 0)
        .map(p => [p.lat, p.lng, Math.min(p.litros_total / 100, 1)] as [number, number, number])

      if (points.length === 0) return

      // @ts-ignore — leaflet.heat añade L.heatLayer
      layerRef.current = (L as any).heatLayer(points, {
        radius: 35,
        blur: 20,
        maxZoom: 13,
        max: 1,
        gradient: { 0.2: '#1e40af', 0.4: '#7c3aed', 0.6: '#d97706', 0.8: '#dc2626', 1.0: '#fff' },
      }).addTo(map)
    })

    return () => {
      if (layerRef.current) {
        map.removeLayer(layerRef.current)
        layerRef.current = null
      }
    }
  }, [puntos, map])

  return null
}

// ── Recentrar mapa ──────────────────────────────────────────

function RecenterMap({ puntos }: { puntos: Punto[] }) {
  const map = useMap()
  useEffect(() => {
    const pts = puntos.filter(p => !p.sin_compra)
    if (pts.length === 0) return
    const lats = pts.map(p => p.lat)
    const lngs = pts.map(p => p.lng)
    const minLat = Math.min(...lats), maxLat = Math.max(...lats)
    const minLng = Math.min(...lngs), maxLng = Math.max(...lngs)
    map.fitBounds([[minLat - 0.05, minLng - 0.05], [maxLat + 0.05, maxLng + 0.05]], { maxZoom: 13 })
  }, [puntos, map])
  return null
}

// ── Popup detalle ───────────────────────────────────────────

function PopupDetalle({ p, color, onWA }: {
  p: Punto
  color: string
  onWA: (t: WATarget) => void
}) {
  const prods = (() => {
    const m = new Map<string, number>()
    for (const pr of p.productos) {
      const key = `${pr.producto}||${pr.envase ?? ''}`
      m.set(key, (m.get(key) ?? 0) + pr.litros)
    }
    return [...m.entries()]
      .map(([k, litros]) => { const [producto, envase] = k.split('||'); return { producto, envase, litros: Math.round(litros * 10) / 10 } })
      .sort((a, b) => b.litros - a.litros)
  })()

  const saludColor = getColorSalud(p.dias_sin_compra)

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', minWidth: 240, maxWidth: 300, color: '#F4EEDF' }}>
      {/* Header */}
      <div style={{ marginBottom: 10, paddingBottom: 10, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ fontWeight: 800, fontSize: 15, color: '#fff', marginBottom: 4, lineHeight: 1.2 }}>
          {p.nombre_fantasia}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color, fontWeight: 700 }}>{p.vendedor_actual.split(' ')[0]}</span>
          {p.segmento && (
            <span style={{ fontSize: 10, background: 'rgba(212,175,55,0.15)', color: '#D4AF37', padding: '1px 7px', borderRadius: 20, fontWeight: 700 }}>
              Seg {p.segmento}
            </span>
          )}
          {p.categoria_negocio && (
            <span style={{ fontSize: 10, color: '#aaa', background: 'rgba(255,255,255,0.07)', padding: '1px 7px', borderRadius: 20 }}>
              {p.categoria_negocio}
            </span>
          )}
        </div>
        {p.localidad && <div style={{ fontSize: 11, color: '#999', marginTop: 4 }}>📍 {p.localidad}</div>}
      </div>

      {/* Salud del cliente */}
      <div style={{ marginBottom: 10, padding: '8px 10px', borderRadius: 8, background: `${saludColor}15`, border: `1px solid ${saludColor}40` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: saludColor, fontWeight: 700 }}>
            {p.sin_compra ? '⚠️ Sin compra en período' : getSaludLabel(p.dias_sin_compra)}
          </span>
          {p.score !== null && (
            <span style={{ fontSize: 11, color: '#D4AF37', fontWeight: 800 }}>{p.score} pts</span>
          )}
        </div>
        {p.ultima_compra && (
          <div style={{ fontSize: 10, color: '#666', marginTop: 2 }}>
            Última: {new Date(p.ultima_compra).toLocaleDateString('es-CL')}
          </div>
        )}
      </div>

      {/* Métricas (solo si tiene compras en período) */}
      {!p.sin_compra && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 10 }}>
          <div style={{ background: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.2)', borderRadius: 8, padding: '7px 6px', textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: '#60A5FA', fontWeight: 600, marginBottom: 2 }}>LITROS</div>
            <div style={{ fontSize: 15, fontWeight: 900, color: '#fff' }}>{p.litros_total.toFixed(1)}</div>
          </div>
          <div style={{ background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.2)', borderRadius: 8, padding: '7px 6px', textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: '#34D399', fontWeight: 600, marginBottom: 2 }}>PEDIDOS</div>
            <div style={{ fontSize: 15, fontWeight: 900, color: '#fff' }}>{p.pedidos_count}</div>
          </div>
          <div style={{ background: 'rgba(167,139,250,0.1)', border: '1px solid rgba(167,139,250,0.2)', borderRadius: 8, padding: '7px 6px', textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: '#A78BFA', fontWeight: 600, marginBottom: 2 }}>VENTA</div>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#fff' }}>{formatPeso(p.total_sin_impuesto)}</div>
          </div>
        </div>
      )}

      {/* Contacto */}
      {(p.telefono || p.contacto || p.email) && (
        <div style={{ marginBottom: 10, paddingBottom: 10, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          {p.contacto && <div style={{ fontSize: 11, color: '#bbb', marginBottom: 6 }}>👤 {p.contacto}</div>}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {p.telefono && (
              <button
                onClick={() => onWA({ nombre: p.nombre_fantasia, telefono: p.telefono, contexto: 'visita', subtitulo: p.categoria_negocio ?? undefined })}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 8, background: 'rgba(37,211,102,0.15)', border: '1px solid rgba(37,211,102,0.3)', color: '#25D366', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
              >
                💬 WhatsApp
              </button>
            )}
            {p.email && (
              <a href={`mailto:${p.email}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 8, textDecoration: 'none', background: 'rgba(129,140,248,0.15)', border: '1px solid rgba(129,140,248,0.3)', color: '#818cf8', fontSize: 12, fontWeight: 700 }}>
                ✉ Email
              </a>
            )}
          </div>
        </div>
      )}

      {/* Productos */}
      {prods.length > 0 && (
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#999', marginBottom: 6, letterSpacing: '0.08em' }}>PRODUCTOS</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {prods.slice(0, 6).map((prod, j) => (
              <div key={j} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: '#eee', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{prod.producto}</div>
                  {prod.envase && <div style={{ fontSize: 10, color: '#888' }}>{prod.envase}</div>}
                </div>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#60A5FA', marginLeft: 10, flexShrink: 0 }}>{prod.litros} L</div>
              </div>
            ))}
            {prods.length > 6 && <div style={{ fontSize: 10, color: '#777', textAlign: 'center', paddingTop: 4 }}>+{prods.length - 6} más</div>}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Componente principal ─────────────────────────────────────

export default function MapLeaflet({ puntos, vendedorFiltro, capaViz, mostrarSinCompra }: Props) {
  const [waTarget, setWaTarget] = useState<WATarget | null>(null)

  const filtrados = (vendedorFiltro === 'all'
    ? puntos
    : puntos.filter(p => p.vendedor_actual === vendedorFiltro)
  ).filter(p => mostrarSinCompra ? true : !p.sin_compra)

  const conVenta = filtrados.filter(p => !p.sin_compra)
  const sinVenta = filtrados.filter(p => p.sin_compra)

  return (
    <>
      <MapContainer
        center={[-40.2, -72.8]}
        zoom={8}
        style={{ height: '100%', width: '100%', background: '#111' }}
        zoomControl={true}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; OpenStreetMap contributors &copy; CARTO'
        />

        {/* Capa heatmap */}
        {capaViz === 'calor' && <HeatmapLayer puntos={conVenta} />}

        {/* Puntos sin compra (zonas blancas) */}
        {mostrarSinCompra && sinVenta.map((p, i) => (
          <CircleMarker
            key={`sin-${i}`}
            center={[p.lat, p.lng]}
            radius={5}
            pathOptions={{ color: '#4B5563', fillColor: '#374151', fillOpacity: 0.5, weight: 1, opacity: 0.6, dashArray: '3' }}
          >
            <Popup closeButton maxWidth={300}>
              <PopupDetalle p={p} color="#6B7280" onWA={setWaTarget} />
            </Popup>
          </CircleMarker>
        ))}

        {/* Puntos principales */}
        {capaViz !== 'calor' && conVenta.map((p, i) => {
          const color = capaViz === 'salud'
            ? getColorSalud(p.dias_sin_compra)
            : getColorVendedor(p.vendedor_actual)
          const radius = getRadius(p.litros_total)

          return (
            <CircleMarker
              key={i}
              center={[p.lat, p.lng]}
              radius={radius}
              pathOptions={{ color, fillColor: color, fillOpacity: 0.75, weight: 1.5, opacity: 0.95 }}
            >
              <Popup closeButton maxWidth={310}>
                <PopupDetalle p={p} color={color} onWA={setWaTarget} />
              </Popup>
            </CircleMarker>
          )
        })}

        {/* En modo calor, igual mostrar puntos pequeños sobre el heatmap */}
        {capaViz === 'calor' && conVenta.map((p, i) => {
          const color = getColorVendedor(p.vendedor_actual)
          return (
            <CircleMarker
              key={`h-${i}`}
              center={[p.lat, p.lng]}
              radius={4}
              pathOptions={{ color, fillColor: color, fillOpacity: 0.9, weight: 1 }}
            >
              <Popup closeButton maxWidth={310}>
                <PopupDetalle p={p} color={color} onWA={setWaTarget} />
              </Popup>
            </CircleMarker>
          )
        })}

        {filtrados.length > 0 && <RecenterMap puntos={filtrados} />}
      </MapContainer>

      {waTarget && <WAModal target={waTarget} onClose={() => setWaTarget(null)} />}
    </>
  )
}
