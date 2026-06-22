'use client'

/**
 * Mini-mapa de "Clientes cercanos ahora" — Leaflet (mismo motor que /ventas/mapa,
 * sin costo ni API key). Centrado en el GPS del vendedor, con marcador propio
 * y un pin dorado por cada cliente cercano. Tap en un pin = popup con acceso
 * directo a tomar pedido.
 */
import { useRouter } from 'next/navigation'
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

interface ClientePunto {
  nombre: string
  categoria: string | null
  localidad: string | null
  lat: number
  lng: number
  distancia: number
}

export default function MiniMapaCercanos({ miLat, miLng, clientes }: {
  miLat: number; miLng: number; clientes: ClientePunto[]
}) {
  const router = useRouter()

  return (
    <div style={{ height: 220, borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)' }}>
      <MapContainer
        center={[miLat, miLng]}
        zoom={15}
        style={{ height: '100%', width: '100%', background: '#0A0A0A' }}
        zoomControl={false}
        attributionControl={false}
      >
        <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />

        {/* Mi ubicación */}
        <CircleMarker
          center={[miLat, miLng]}
          radius={8}
          pathOptions={{ color: '#60A5FA', fillColor: '#60A5FA', fillOpacity: 0.9, weight: 2 }}
        >
          <Popup>Tu ubicación</Popup>
        </CircleMarker>
        {/* Halo de radio aproximado */}
        <CircleMarker
          center={[miLat, miLng]}
          radius={14}
          pathOptions={{ color: '#60A5FA', fillColor: '#60A5FA', fillOpacity: 0.12, weight: 1 }}
        />

        {/* Clientes cercanos */}
        {clientes.map(c => (
          <CircleMarker
            key={c.nombre}
            center={[c.lat, c.lng]}
            radius={7}
            pathOptions={{ color: '#D4AF37', fillColor: '#D4AF37', fillOpacity: 0.95, weight: 1.5 }}
          >
            <Popup>
              <div style={{ fontFamily: 'system-ui, sans-serif', minWidth: 160 }}>
                <p style={{ fontWeight: 800, fontSize: 13, marginBottom: 2 }}>{c.nombre}</p>
                <p style={{ fontSize: 11, color: '#666', marginBottom: 8 }}>
                  {c.categoria ?? c.localidad ?? 'Sin datos'} · {c.distancia < 1000 ? `${Math.round(c.distancia)}m` : `${(c.distancia/1000).toFixed(1)}km`}
                </p>
                <button
                  onClick={() => router.push(`/terreno/nueva-visita?cliente=${encodeURIComponent(c.nombre)}`)}
                  style={{
                    width: '100%', padding: '6px 0', borderRadius: 8, border: 'none', cursor: 'pointer',
                    background: '#D4AF37', color: '#080808', fontWeight: 800, fontSize: 11,
                  }}
                >
                  Tomar pedido
                </button>
              </div>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  )
}
