'use client'

import { MapContainer, TileLayer, CircleMarker, Polyline, Popup } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

export interface PuntoRuta {
  lat: number
  lng: number
  nombre: string
  dentroGeofence: boolean | null
  distanciaM: number | null
  hora: string
}

export default function RutaMap({ puntos }: { puntos: PuntoRuta[] }) {
  if (puntos.length === 0) {
    return (
      <div style={{ height: 320, borderRadius: 14, background: '#0A0A0A', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>Sin visitas con GPS registradas en esta jornada.</p>
      </div>
    )
  }

  const centro: [number, number] = [puntos[0].lat, puntos[0].lng]
  const linea: [number, number][] = puntos.map(p => [p.lat, p.lng])

  return (
    <div style={{ height: 320, borderRadius: 14, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)' }}>
      <MapContainer center={centro} zoom={13} style={{ height: '100%', width: '100%', background: '#0A0A0A' }} zoomControl={true}>
        <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
        <Polyline positions={linea} pathOptions={{ color: '#F97316', weight: 3, opacity: 0.75, dashArray: '6 6' }} />
        {puntos.map((p, i) => (
          <CircleMarker
            key={i}
            center={[p.lat, p.lng]}
            radius={9}
            pathOptions={{
              color: p.dentroGeofence === false ? '#FF4444' : '#22C55E',
              fillColor: p.dentroGeofence === false ? '#FF4444' : '#22C55E',
              fillOpacity: 0.9, weight: 2,
            }}
          >
            <Popup>
              <strong>{i + 1}. {p.nombre}</strong><br />
              {p.hora}<br />
              {p.distanciaM != null ? (
                p.dentroGeofence
                  ? <span style={{ color: '#22C55E' }}>✓ A {Math.round(p.distanciaM)}m del cliente</span>
                  : <span style={{ color: '#FF4444' }}>⚠ A {Math.round(p.distanciaM)}m del cliente (fuera de rango)</span>
              ) : <span style={{ color: '#999' }}>Sin dirección registrada para validar</span>}
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  )
}
