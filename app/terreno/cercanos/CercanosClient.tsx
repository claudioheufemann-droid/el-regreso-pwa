'use client'

/**
 * Clientes cercanos ahora — página dedicada (antes vivía como botón arriba
 * del Hub de Terreno; ahora es su propio destino en el menú inferior, junto
 * a "Viaje"). Pide GPS y muestra mini-mapa + lista de clientes en 500m.
 */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { ChevronLeft, MapPin, Loader2 } from 'lucide-react'
import AppHeader from '@/components/ui/AppHeader'

const MiniMapaCercanos = dynamic(() => import('../MiniMapaCercanos'), {
  ssr: false,
  loading: () => <div style={{ height: 220, borderRadius: 12, background: 'var(--surface2)' }} />,
})

interface ClienteGps {
  nombre: string
  categoria: string | null
  localidad: string | null
  lat: number
  lng: number
}

function distanciaMetros(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export default function CercanosClient({ clientes }: { clientes: ClienteGps[] }) {
  const router = useRouter()
  const [estado, setEstado] = useState<'idle' | 'buscando' | 'ok' | 'error'>('idle')
  const [cercanos, setCercanos] = useState<(ClienteGps & { distancia: number })[]>([])
  const [miPos, setMiPos] = useState<{ lat: number; lng: number } | null>(null)

  function buscar() {
    if (!navigator.geolocation) { setEstado('error'); return }
    setEstado('buscando')
    navigator.geolocation.getCurrentPosition(
      pos => {
        const { latitude, longitude } = pos.coords
        setMiPos({ lat: latitude, lng: longitude })
        const conDistancia = clientes
          .map(c => ({ ...c, distancia: distanciaMetros(latitude, longitude, c.lat, c.lng) }))
          .filter(c => c.distancia <= 500)
          .sort((a, b) => a.distancia - b.distancia)
          .slice(0, 8)
        setCercanos(conDistancia)
        setEstado('ok')
      },
      () => setEstado('error'),
      { enableHighAccuracy: true, timeout: 8000 }
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', paddingBottom: 100 }}>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 16px' }}>
        <div style={{ paddingTop: 'max(16px, env(safe-area-inset-top, 16px))' }}>
          <button
            onClick={() => router.push('/terreno')}
            style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0, marginBottom: 10, minHeight: 44 }}
          >
            <ChevronLeft size={15} /> Terreno
          </button>
          <AppHeader eyebrow="Venta oportunista" title="Cercanos" />
        </div>

        {estado === 'idle' && (
          <button
            onClick={buscar}
            style={{
              width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
              background: 'var(--surface)', border: '1px solid var(--border)', borderTop: '2px solid #60A5FA',
              borderRadius: 16, padding: '32px 20px', cursor: 'pointer', textAlign: 'center',
            }}
          >
            <div style={{ width: 52, height: 52, borderRadius: 18, background: 'rgba(96,165,250,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <MapPin size={24} color="#60A5FA" />
            </div>
            <div>
              <p style={{ fontSize: 15, fontWeight: 800, color: 'var(--cream)', marginBottom: 4 }}>Ver quién tienes cerca</p>
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>Activa tu ubicación para ver clientes a la vuelta</p>
            </div>
          </button>
        )}

        {estado === 'buscando' && (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <Loader2 size={28} color="#60A5FA" style={{ animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>Ubicando…</p>
          </div>
        )}

        {estado === 'error' && (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 12 }}>No se pudo obtener tu ubicación</p>
            <button onClick={buscar} style={{ color: '#60A5FA', background: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.25)', borderRadius: 10, padding: '8px 16px', cursor: 'pointer', fontWeight: 700, fontSize: 12 }}>
              Reintentar
            </button>
          </div>
        )}

        {estado === 'ok' && (
          <>
            {cercanos.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0' }}>
                <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)' }}>Sin clientes registrados a menos de 500m de tu ubicación.</p>
              </div>
            ) : (
              <>
                {miPos && (
                  <div style={{ marginBottom: 14 }}>
                    <MiniMapaCercanos miLat={miPos.lat} miLng={miPos.lng} clientes={cercanos} />
                  </div>
                )}
                <p style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.6px', textTransform: 'uppercase', marginBottom: 8 }}>
                  {cercanos.length} cliente{cercanos.length !== 1 ? 's' : ''} cerca
                </p>
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
                  {cercanos.map((c, i) => (
                    <div
                      key={c.nombre}
                      onClick={() => router.push(`/terreno/nueva-visita?cliente=${encodeURIComponent(c.nombre)}`)}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', cursor: 'pointer', borderTop: i > 0 ? '1px solid rgba(255,255,255,0.05)' : 'none', minHeight: 44 }}
                    >
                      <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(96,165,250,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 11, fontWeight: 900, color: '#60A5FA' }}>
                        {c.nombre.charAt(0).toUpperCase()}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--cream)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nombre}</p>
                        <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>{c.categoria ?? c.localidad ?? 'Sin categoría'}</p>
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 800, color: '#60A5FA', flexShrink: 0 }}>
                        {c.distancia < 1000 ? `${Math.round(c.distancia)}m` : `${(c.distancia / 1000).toFixed(1)}km`}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}
