'use client'

import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

export interface PuntoEntrega {
  id: string
  lat: number
  lng: number
  nombre: string
  estado: 'entregado' | 'rechazado' | 'devuelto'
  hora: string
  aprobado: boolean
}

const COLOR_ESTADO: Record<PuntoEntrega['estado'], string> = {
  entregado: '#22C55E',
  rechazado: '#FF4444',
  devuelto: '#D4AF37',
}

export default function EntregaMap({ puntos }: { puntos: PuntoEntrega[] }) {
  if (puntos.length === 0) {
    return (
      <div style={{ height: 340, borderRadius: 14, background: '#0A0A0A', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>Sin entregas con GPS registradas en esta fecha.</p>
      </div>
    )
  }

  const centro: [number, number] = [puntos[0].lat, puntos[0].lng]

  return (
    <div style={{ height: 340, borderRadius: 14, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)' }}>
      <MapContainer center={centro} zoom={12} style={{ height: '100%', width: '100%', background: '#0A0A0A' }} zoomControl={true}>
        <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
        {puntos.map(p => (
          <CircleMarker
            key={p.id}
            center={[p.lat, p.lng]}
            radius={9}
            pathOptions={{
              color: COLOR_ESTADO[p.estado],
              fillColor: COLOR_ESTADO[p.estado],
              fillOpacity: p.aprobado ? 0.9 : 0.4,
              weight: 2,
            }}
          >
            <Popup>
              <strong>{p.nombre}</strong><br />
              {p.hora}<br />
              <span style={{ color: COLOR_ESTADO[p.estado] }}>
                {p.estado === 'entregado' ? '✓ Entregado' : p.estado === 'rechazado' ? '✗ Rechazado' : '↩ Devuelto'}
              </span>
              {p.estado === 'entregado' && !p.aprobado && <><br /><span style={{ color: '#D4AF37' }}>Pendiente de aprobar</span></>}
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  )
}
