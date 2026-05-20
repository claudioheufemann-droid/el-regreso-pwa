'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, MapPin, Navigation, CheckCircle, AlertTriangle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { AppUser } from '@/lib/auth'

const F = '#F97316'

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371, dLat = (lat2 - lat1) * Math.PI / 180, dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

async function geocodificar(dir: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const q = encodeURIComponent(dir + ', Valdivia, Chile')
    const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`, {
      headers: { 'Accept-Language': 'es', 'User-Agent': 'ElRegresoFlota/1.0' },
    })
    const data = await res.json()
    if (!data[0]) return null
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
  } catch { return null }
}

function fmtDuracion(iso: string) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 60) return `${mins} min`
  return `${Math.floor(mins / 60)}h ${mins % 60}min`
}

interface Props {
  user: AppUser
  viaje: {
    id: string; vehiculo_id: string; motivo: string | null
    destino_declarado: string | null; llegada_confirmada_at: string | null
    km_inicio: number | null; iniciado_at: string
    vehiculos: { nombre: string; patente: string | null } | null
  }
}

export default function LlegadaClient({ user, viaje }: Props) {
  const router = useRouter()
  const supabase = createClient()

  const yaConfirmado = !!viaje.llegada_confirmada_at
  const [obteniendo, setObteniendo] = useState(false)
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [distancia, setDistancia] = useState<number | null>(null)
  const [gpsError, setGpsError] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [confirmado, setConfirmado] = useState(yaConfirmado)

  async function capturarGPS() {
    if (!navigator.geolocation) { setGpsError('Tu dispositivo no soporta geolocalización'); return }
    setObteniendo(true)
    setGpsError('')

    navigator.geolocation.getCurrentPosition(
      async pos => {
        const c = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        setCoords(c)
        if (viaje.destino_declarado) {
          const dest = await geocodificar(viaje.destino_declarado)
          if (dest) setDistancia(haversineKm(c.lat, c.lng, dest.lat, dest.lng))
        }
        setObteniendo(false)
      },
      err => {
        setGpsError(err.code === 1 ? 'Permiso de ubicación denegado. Actívalo en la configuración del navegador.' : 'No se pudo obtener la ubicación.')
        setObteniendo(false)
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    )
  }

  async function confirmarLlegada() {
    if (!coords) return
    setGuardando(true)
    try {
      await supabase.from('viajes_flota').update({
        destino_lat: coords.lat,
        destino_lng: coords.lng,
        llegada_confirmada_at: new Date().toISOString(),
      }).eq('id', viaje.id)
      setConfirmado(true)
      setTimeout(() => router.push('/flota'), 1800)
    } finally {
      setGuardando(false)
    }
  }

  const validacion = distancia === null ? null
    : distancia < 0.5 ? 'ok'
    : distancia < 2 ? 'cerca'
    : 'lejos'

  return (
    <div style={{ minHeight: '100vh', background: '#080808', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ background: '#0F0F0F', borderBottom: '1px solid rgba(249,115,22,0.15)', padding: '14px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => router.push('/flota')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: F, display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 600, padding: 0 }}>
            <ChevronLeft size={18} /> Flota
          </button>
          <div>
            <p style={{ fontSize: 15, fontWeight: 800, color: '#F4EEDF' }}>Confirmar llegada</p>
            <p style={{ fontSize: 11, color: 'var(--muted)' }}>{viaje.vehiculos?.nombre} · {fmtDuracion(viaje.iniciado_at)}</p>
          </div>
        </div>
      </div>

      <div style={{ flex: 1, padding: '20px 16px' }}>

        {/* Destino declarado */}
        <div style={{ background: '#131313', border: `1px solid ${confirmado ? 'rgba(74,222,128,0.25)' : 'rgba(249,115,22,0.2)'}`, borderRadius: 14, padding: '16px', marginBottom: 20 }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 10 }}>Destino declarado</p>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(249,115,22,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <MapPin size={18} color={F} />
            </div>
            <div>
              <p style={{ fontSize: 16, fontWeight: 800, color: '#F4EEDF', marginBottom: 4 }}>
                {viaje.destino_declarado ?? 'Sin dirección registrada'}
              </p>
              {viaje.motivo && (
                <p style={{ fontSize: 12, color: 'var(--muted)' }}>Motivo: {viaje.motivo}</p>
              )}
            </div>
          </div>
        </div>

        {/* Ya confirmado */}
        {confirmado && (
          <div style={{ background: 'rgba(74,222,128,0.07)', border: '1px solid rgba(74,222,128,0.3)', borderRadius: 14, padding: '24px 20px', textAlign: 'center' }}>
            <CheckCircle size={44} color="#4ADE80" style={{ margin: '0 auto 14px', display: 'block' }} />
            <p style={{ fontSize: 17, fontWeight: 900, color: '#4ADE80', marginBottom: 6 }}>Llegada confirmada</p>
            <p style={{ fontSize: 12, color: 'var(--muted)' }}>Ubicación GPS registrada en el sistema</p>
          </div>
        )}

        {/* Flujo GPS */}
        {!confirmado && (
          <>
            {!coords ? (
              <div style={{ textAlign: 'center', padding: '36px 20px', background: '#0F0F0F', borderRadius: 16, border: '1px dashed rgba(249,115,22,0.2)', marginBottom: 20 }}>
                <Navigation size={40} color={F} style={{ margin: '0 auto 16px', display: 'block' }} />
                <p style={{ fontSize: 16, fontWeight: 700, color: '#F4EEDF', marginBottom: 8 }}>¿Ya llegaste al destino?</p>
                <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.6 }}>
                  Presiona el botón para capturar tu ubicación GPS y validar que estás físicamente en{' '}
                  <span style={{ color: F, fontWeight: 600 }}>{viaje.destino_declarado ?? 'el destino'}</span>
                </p>
              </div>
            ) : (
              <div style={{ background: 'rgba(74,222,128,0.06)', border: '1px solid rgba(74,222,128,0.25)', borderRadius: 14, padding: '14px 16px', marginBottom: 16 }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: '#4ADE80', marginBottom: 6 }}>📍 Ubicación capturada</p>
                <p style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'monospace', marginBottom: 10 }}>
                  {coords.lat.toFixed(6)},  {coords.lng.toFixed(6)}
                </p>
                {validacion !== null && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, background: validacion === 'ok' ? 'rgba(74,222,128,0.1)' : validacion === 'cerca' ? 'rgba(245,158,11,0.1)' : 'rgba(255,85,85,0.1)' }}>
                    {validacion === 'ok'
                      ? <CheckCircle size={15} color="#4ADE80" />
                      : <AlertTriangle size={15} color={validacion === 'cerca' ? '#F59E0B' : '#FF5555'} />}
                    <p style={{ fontSize: 12, fontWeight: 700, color: validacion === 'ok' ? '#4ADE80' : validacion === 'cerca' ? '#F59E0B' : '#FF5555' }}>
                      {validacion === 'ok'
                        ? `Validado — estás en el destino (${(distancia! * 1000).toFixed(0)} m)`
                        : validacion === 'cerca'
                        ? `Cerca del destino declarado (${distancia!.toFixed(1)} km)`
                        : `Distancia al destino: ${distancia!.toFixed(1)} km — se registrará igualmente`}
                    </p>
                  </div>
                )}
              </div>
            )}

            {gpsError && (
              <div style={{ marginBottom: 16, padding: '12px 14px', background: 'rgba(255,85,85,0.08)', border: '1px solid rgba(255,85,85,0.2)', borderRadius: 10 }}>
                <p style={{ fontSize: 12, color: '#FF5555' }}>⚠ {gpsError}</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      {!confirmado && (
        <div style={{ padding: '16px', paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
          {!coords ? (
            <button onClick={capturarGPS} disabled={obteniendo} style={{ width: '100%', padding: '17px', borderRadius: 14, border: 'none', cursor: obteniendo ? 'wait' : 'pointer', background: F, color: '#fff', fontSize: 16, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
              {obteniendo ? (
                <>
                  <span style={{ display: 'inline-block', width: 14, height: 14, borderRadius: '50%', border: '3px solid rgba(255,255,255,0.35)', borderTopColor: '#fff', animation: 'spin 0.7s linear infinite' }} />
                  Obteniendo ubicación…
                </>
              ) : (
                <><Navigation size={18} /> Capturar GPS ahora</>
              )}
            </button>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button onClick={confirmarLlegada} disabled={guardando} style={{ width: '100%', padding: '17px', borderRadius: 14, border: 'none', cursor: guardando ? 'wait' : 'pointer', background: '#4ADE80', color: '#0A1A0A', fontSize: 16, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                {guardando
                  ? <><span style={{ display: 'inline-block', width: 14, height: 14, borderRadius: '50%', border: '3px solid rgba(0,0,0,0.25)', borderTopColor: '#0A1A0A', animation: 'spin 0.7s linear infinite' }} /> Confirmando…</>
                  : <><CheckCircle size={18} /> Confirmar llegada</>}
              </button>
              <button onClick={() => { setCoords(null); setDistancia(null) }} style={{ width: '100%', padding: '12px', borderRadius: 14, border: '1px solid rgba(255,255,255,0.08)', background: 'transparent', color: 'var(--muted)', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                Volver a capturar
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
