'use client'

/**
 * "Secuencia de visitas" — paradas del mismo vendedor y mismo día, unidas
 * en el orden en que llegaron. A propósito NO es una ruta vial (no hay
 * routing engine acá): son líneas rectas entre puntos, exactamente como
 * exige el spec ("no representar el trayecto real, kilómetros reales o
 * tiempo de conducción"). Si algún día se agrega una ruta estimada por
 * calles, hay que etiquetarla como estimación — no reemplazar esta vista.
 */
import { MapContainer, TileLayer, Marker, Polyline, Popup } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { C } from '../theme'

export interface ParadaMapa {
  id: string
  lat: number
  lng: number
  nombre: string
  horaTexto: string
  orden: number
  verificada: boolean
}

function iconoNumerado(n: number, color: string): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `<div style="width:26px;height:26px;border-radius:50%;background:${color};color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;border:2px solid #fff;box-shadow:0 1px 4px rgba(15,23,42,.35);font-family:sans-serif;">${n}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  })
}

export default function SecuenciaMapa({ paradas, alto = 260 }: { paradas: ParadaMapa[]; alto?: number }) {
  if (paradas.length === 0) {
    return (
      <div style={{
        height: alto, borderRadius: 14, background: C.bg, border: `1px solid ${C.line}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <p style={{ fontSize: 13, color: C.muted }}>Sin paradas con ubicación este día.</p>
      </div>
    )
  }

  const centro: [number, number] = [
    paradas.reduce((s, p) => s + p.lat, 0) / paradas.length,
    paradas.reduce((s, p) => s + p.lng, 0) / paradas.length,
  ]

  return (
    <div style={{
      height: alto, borderRadius: 14, overflow: 'hidden', border: `1px solid ${C.line}`,
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ flex: 1, minHeight: 0 }}>
        <MapContainer center={centro} zoom={13} style={{ height: '100%', width: '100%' }} zoomControl={false} attributionControl={false}>
          <TileLayer url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" />
          <Polyline
            positions={paradas.map(p => [p.lat, p.lng] as [number, number])}
            pathOptions={{ color: C.verdeLlegada, weight: 2, dashArray: '6 6', opacity: 0.7 }}
          />
          {paradas.map(p => (
            <Marker key={p.id} position={[p.lat, p.lng]} icon={iconoNumerado(p.orden, p.verificada ? C.verdeLlegada : C.amber)}>
              <Popup>
                <div style={{ fontFamily: 'system-ui, sans-serif', minWidth: 140 }}>
                  <p style={{ fontWeight: 800, fontSize: 13 }}>{p.orden}. {p.nombre}</p>
                  <p style={{ fontSize: 11, color: '#666' }}>{p.horaTexto}</p>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
      <p style={{ fontSize: 10.5, color: C.faint, padding: '4px 10px', background: C.card, flexShrink: 0 }}>
        Paradas registradas, no trayecto real.
      </p>
    </div>
  )
}
