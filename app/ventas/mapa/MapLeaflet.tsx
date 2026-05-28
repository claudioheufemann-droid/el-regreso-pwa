'use client'

import { useEffect } from 'react'
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

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
  telefono: string | null
  email: string | null
  contacto: string | null
}

interface Props {
  puntos: Punto[]
  vendedorFiltro: string
}

function formatPeso(n: number) {
  return '$' + Math.round(n).toLocaleString('es-CL')
}

function getColor(vendedor: string) {
  if (vendedor === 'Javier Badilla') return '#F59E0B'
  if (vendedor === 'Carlos Urrejola') return '#60A5FA'
  return '#A78BFA'
}

function getRadius(litros: number) {
  if (litros <= 0) return 4
  if (litros < 10) return 5
  if (litros < 30) return 8
  if (litros < 60) return 11
  if (litros < 100) return 14
  if (litros < 200) return 17
  return 20
}

function RecenterMap({ puntos }: { puntos: Punto[] }) {
  const map = useMap()
  useEffect(() => {
    if (puntos.length === 0) return
    const lats = puntos.map(p => p.lat)
    const lngs = puntos.map(p => p.lng)
    const minLat = Math.min(...lats), maxLat = Math.max(...lats)
    const minLng = Math.min(...lngs), maxLng = Math.max(...lngs)
    map.fitBounds([[minLat - 0.1, minLng - 0.1], [maxLat + 0.1, maxLng + 0.1]], { maxZoom: 12 })
  }, [puntos, map])
  return null
}

export default function MapLeaflet({ puntos, vendedorFiltro }: Props) {
  const filtrados = vendedorFiltro === 'all'
    ? puntos
    : puntos.filter(p => p.vendedor_actual === vendedorFiltro)

  // Agrupar productos por producto+envase para el popup
  function agruparProductos(productos: { producto: string; envase: string | null; litros: number }[]) {
    const map = new Map<string, number>()
    for (const p of productos) {
      const key = `${p.producto}||${p.envase ?? ''}`
      map.set(key, (map.get(key) ?? 0) + p.litros)
    }
    return [...map.entries()]
      .map(([k, litros]) => {
        const [producto, envase] = k.split('||')
        return { producto, envase, litros: Math.round(litros * 10) / 10 }
      })
      .sort((a, b) => b.litros - a.litros)
  }

  return (
    <MapContainer
      center={[-40.2, -72.8]}
      zoom={8}
      style={{ height: '100%', width: '100%', background: '#111' }}
      zoomControl={true}
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
      />

      {filtrados.map((p, i) => {
        const color = getColor(p.vendedor_actual)
        const radius = getRadius(p.litros_total)
        const prods = agruparProductos(p.productos)

        return (
          <CircleMarker
            key={i}
            center={[p.lat, p.lng]}
            radius={radius}
            pathOptions={{
              color,
              fillColor: color,
              fillOpacity: 0.7,
              weight: 1.5,
              opacity: 0.9,
            }}
          >
            <Popup
              closeButton={true}
              maxWidth={280}
            >
              <div style={{ fontFamily: 'system-ui, sans-serif', minWidth: 220 }}>
                {/* Header */}
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontWeight: 800, fontSize: 14, color: '#fff', marginBottom: 2 }}>
                    {p.nombre_fantasia}
                  </div>
                  <div style={{ fontSize: 11, color: color, fontWeight: 600 }}>
                    {p.vendedor_actual}
                  </div>
                  {p.localidad && (
                    <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
                      📍 {p.localidad}
                      {p.categoria_negocio ? ` · ${p.categoria_negocio}` : ''}
                    </div>
                  )}
                </div>

                {/* Métricas */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 10 }}>
                  <div style={{ background: '#1a1a1a', borderRadius: 6, padding: '6px 8px', textAlign: 'center' }}>
                    <div style={{ fontSize: 11, color: '#888' }}>Litros</div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: '#60A5FA' }}>{p.litros_total.toFixed(1)}</div>
                  </div>
                  <div style={{ background: '#1a1a1a', borderRadius: 6, padding: '6px 8px', textAlign: 'center' }}>
                    <div style={{ fontSize: 11, color: '#888' }}>Pedidos</div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: '#34D399' }}>{p.pedidos_count}</div>
                  </div>
                  <div style={{ background: '#1a1a1a', borderRadius: 6, padding: '6px 8px', textAlign: 'center' }}>
                    <div style={{ fontSize: 11, color: '#888' }}>Venta</div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#A78BFA' }}>{formatPeso(p.total_sin_impuesto)}</div>
                  </div>
                </div>

                {/* Contacto */}
                {(p.telefono || p.contacto || p.email) && (
                  <div style={{ marginBottom: 10, paddingBottom: 10, borderBottom: '1px solid #2a2a2a' }}>
                    {p.contacto && (
                      <div style={{ fontSize: 11, color: '#aaa', marginBottom: 4 }}>
                        👤 {p.contacto}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {p.telefono && (
                        <a
                          href={`https://wa.me/${p.telefono.replace(/\D/g, '')}`}
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            padding: '4px 10px', borderRadius: 8, textDecoration: 'none',
                            background: '#0A3D2B', color: '#25D366',
                            fontSize: 11, fontWeight: 700,
                          }}
                        >
                          💬 WhatsApp
                        </a>
                      )}
                      {p.email && (
                        <a
                          href={`mailto:${p.email}`}
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            padding: '4px 10px', borderRadius: 8, textDecoration: 'none',
                            background: '#1a1a2e', color: '#818cf8',
                            fontSize: 11, fontWeight: 700,
                          }}
                        >
                          ✉ Email
                        </a>
                      )}
                    </div>
                  </div>
                )}

                {/* Productos */}
                {prods.length > 0 && (
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#888', marginBottom: 5, letterSpacing: '0.05em' }}>
                      PRODUCTOS
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                      {prods.slice(0, 8).map((prod, j) => (
                        <div key={j} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 11, color: '#ddd', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {prod.producto}
                            </div>
                            {prod.envase && (
                              <div style={{ fontSize: 10, color: '#666' }}>{prod.envase}</div>
                            )}
                          </div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: '#60A5FA', marginLeft: 8, flexShrink: 0 }}>
                            {prod.litros} L
                          </div>
                        </div>
                      ))}
                      {prods.length > 8 && (
                        <div style={{ fontSize: 10, color: '#666', textAlign: 'center', paddingTop: 2 }}>
                          +{prods.length - 8} productos más
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </Popup>
          </CircleMarker>
        )
      })}

      {puntos.length > 0 && <RecenterMap puntos={filtrados.length > 0 ? filtrados : puntos} />}
    </MapContainer>
  )
}
