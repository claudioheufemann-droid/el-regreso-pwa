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
  deuda_total: number
  deuda_vencida: number
  sin_compra: boolean
}

export type CapaViz = 'pedidos' | 'salud' | 'calor'
export type TileTipo = 'mapa' | 'satelite' | 'hibrido'

export interface LeadPunto {
  id: number
  nombre: string
  ciudad: string | null
  categoria: string | null
  categoria_mapeada: string | null
  producto_sugerido: string | null
  telefono: string | null
  sitio_web: string | null
  rating: number | null
  lat: number | null
  lng: number | null
  litros_potencial: number | null
  score_lead: number | null
}

interface Props {
  puntos: Punto[]
  leads?: LeadPunto[]
  vendedorFiltro: string
  capaViz: CapaViz
  mostrarSinCompra: boolean
  tileTipo?: TileTipo
}

// ── Helpers ──────────────────────────────────────────────────

function formatPeso(n: number) {
  return '$' + Math.round(n).toLocaleString('es-CL')
}

function getColorVendedor(vendedor: string) {
  if (vendedor === 'Javier Badilla') return '#D4AF37'
  if (vendedor === 'Carlos Urrejola') return '#D4AF37'
  return '#8A6D1F'
}

// Salud: verde <7d, amarillo 8-15d, naranja 16-30d, rojo >30d
function getColorSalud(dias: number | null): string {
  if (dias === null) return '#6B7280'
  if (dias <= 7)  return '#5A8A4A'  // verde: excelente
  if (dias <= 15) return '#D4AF37'  // amarillo: atención
  if (dias <= 30) return '#F97316'  // naranja: riesgo
  return '#B5543E'                   // rojo: crítico
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
  const verClienteUrl = `/ventas/clientes?q=${encodeURIComponent(p.nombre_fantasia)}`
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
        {p.deuda_vencida > 0 && (
          <div style={{ fontSize: 10, color: '#B5543E', marginTop: 3, fontWeight: 700 }}>
            ⚠ Deuda vencida: {formatPeso(p.deuda_vencida)}
          </div>
        )}
      </div>

      {/* Métricas (solo si tiene compras en período) */}
      {!p.sin_compra && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 10 }}>
          <div style={{ background: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.2)', borderRadius: 8, padding: '7px 6px', textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: '#D4AF37', fontWeight: 600, marginBottom: 2 }}>LITROS</div>
            <div style={{ fontSize: 15, fontWeight: 900, color: '#fff' }}>{p.litros_total.toFixed(1)}</div>
          </div>
          <div style={{ background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.2)', borderRadius: 8, padding: '7px 6px', textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: '#5A8A4A', fontWeight: 600, marginBottom: 2 }}>PEDIDOS</div>
            <div style={{ fontSize: 15, fontWeight: 900, color: '#fff' }}>{p.pedidos_count}</div>
          </div>
          <div style={{ background: 'rgba(167,139,250,0.1)', border: '1px solid rgba(167,139,250,0.2)', borderRadius: 8, padding: '7px 6px', textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: '#8A6D1F', fontWeight: 600, marginBottom: 2 }}>VENTA</div>
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
                <div style={{ fontSize: 12, fontWeight: 800, color: '#D4AF37', marginLeft: 10, flexShrink: 0 }}>{prod.litros} L</div>
              </div>
            ))}
            {prods.length > 6 && <div style={{ fontSize: 10, color: '#777', textAlign: 'center', paddingTop: 4 }}>+{prods.length - 6} más</div>}
          </div>
        </div>
      )}

      {/* Ver cliente */}
      <a
        href={verClienteUrl}
        style={{
          display: 'block', marginTop: 10, padding: '8px', textAlign: 'center', borderRadius: 8,
          background: 'rgba(212,175,55,0.12)', border: '1px solid rgba(212,175,55,0.3)',
          color: '#D4AF37', fontSize: 12, fontWeight: 700, textDecoration: 'none',
        }}
      >
        Ver ficha del cliente →
      </a>
    </div>
  )
}

// ── Componente principal ─────────────────────────────────────

const TILES: Record<TileTipo, { url: string; attribution: string }> = {
  mapa: {
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
  },
  satelite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri',
  },
  hibrido: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri',
  },
}

function PopupLead({ l, onWA }: { l: LeadPunto; onWA: (t: WATarget) => void }) {
  return (
    <div style={{ minWidth: 210, fontFamily: 'system-ui,sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <span style={{ fontSize: 9, fontWeight: 800, color: '#8A6D1F', background: 'rgba(167,139,250,0.15)', padding: '1px 7px', borderRadius: 10 }}>POSIBLE CLIENTE</span>
        {l.rating != null && <span style={{ fontSize: 11, color: '#D97706' }}>★ {l.rating}</span>}
      </div>
      <div style={{ fontSize: 14, fontWeight: 800, color: '#1a1a1a', marginBottom: 2 }}>{l.nombre}</div>
      <div style={{ fontSize: 11, color: '#666', marginBottom: 8 }}>
        {l.categoria ?? '—'} · 📍 {l.ciudad ?? ''}{l.categoria_mapeada ? ` · ≈ ${l.categoria_mapeada}` : ''}
      </div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 8 }}>
        <div><div style={{ fontSize: 16, fontWeight: 900, color: '#059669' }}>~{l.litros_potencial} L</div><div style={{ fontSize: 9, color: '#999', textTransform: 'uppercase' }}>potencial/mes</div></div>
        <div><div style={{ fontSize: 16, fontWeight: 900, color: '#7C3AED' }}>{l.score_lead ?? 0}</div><div style={{ fontSize: 9, color: '#999', textTransform: 'uppercase' }}>score</div></div>
        {l.producto_sugerido && <div><div style={{ fontSize: 11, fontWeight: 700, color: '#D4AF37', marginTop: 3 }}>{l.producto_sugerido}</div><div style={{ fontSize: 9, color: '#999', textTransform: 'uppercase' }}>sugerido</div></div>}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        {l.telefono && (
          <button onClick={() => onWA({ nombre: l.nombre, telefono: l.telefono!, contexto: 'mision' })}
            style={{ flex: 1, padding: '6px', borderRadius: 7, border: 'none', background: '#25D166', color: 'white', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>WhatsApp</button>
        )}
        {l.telefono && (
          <button onClick={() => window.open(`tel:${l.telefono}`)}
            style={{ padding: '6px 10px', borderRadius: 7, border: '1px solid #D4AF37', background: 'white', color: '#D4AF37', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Llamar</button>
        )}
      </div>
    </div>
  )
}

export default function MapLeaflet({ puntos, leads = [], vendedorFiltro, capaViz, mostrarSinCompra, tileTipo = 'mapa' }: Props) {
  const [waTarget, setWaTarget] = useState<WATarget | null>(null)
  const tile = TILES[tileTipo]

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
        <TileLayer key={tileTipo} url={tile.url} attribution={tile.attribution} />
        {/* Capa de etiquetas para modo híbrido */}
        {tileTipo === 'hibrido' && (
          <TileLayer
            url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
            attribution=""
          />
        )}

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

        {/* Capa de LEADS (posibles clientes) — morado, hueco, diferenciado */}
        {leads.map((l, i) => (
          <CircleMarker
            key={`lead-${l.id ?? i}`}
            center={[l.lat as number, l.lng as number]}
            radius={6}
            pathOptions={{ color: '#8A6D1F', fillColor: '#8A6D1F', fillOpacity: 0.18, weight: 2, opacity: 0.95, dashArray: '2 2' }}
          >
            <Popup closeButton maxWidth={290}>
              <PopupLead l={l} onWA={setWaTarget} />
            </Popup>
          </CircleMarker>
        ))}

        {filtrados.length > 0 && <RecenterMap puntos={filtrados} />}
      </MapContainer>

      {waTarget && <WAModal target={waTarget} onClose={() => setWaTarget(null)} />}
    </>
  )
}
