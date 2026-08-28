'use client'

/**
 * Clientes cercanos ahora — tema claro, igual que el resto de Terreno.
 *
 * Pide GPS y consulta /api/clientes/cercanos (cálculo server-side, radio
 * elegible) en vez de traer toda la cartera con coordenadas al navegador.
 * Antes el radio estaba fijo en 500 m y sin fecha de última compra — ahora
 * hay selector 1/3/5/10 km y cada cliente muestra hace cuánto no compra,
 * con acción directa para llamar además de tomar el pedido.
 */
import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { ChevronLeft, MapPin, Loader2, ChevronRight, Phone } from 'lucide-react'
import { C, cardStyle } from '../theme'
import { formatLocalidad } from '@/lib/format'

const MiniMapaCercanos = dynamic(() => import('../MiniMapaCercanos'), {
  ssr: false,
  loading: () => <div style={{ height: 220, borderRadius: 12, background: C.line }} />,
})

interface ClienteCercano {
  nombre: string
  categoria: string | null
  localidad: string | null
  telefono: string | null
  lat: number
  lng: number
  distancia: number
  diasSinComprar: number | null
  ultimaCompra: string | null
}

const RADIOS = [
  { label: '1 km', metros: 1000 },
  { label: '3 km', metros: 3000 },
  { label: '5 km', metros: 5000 },
  { label: '10 km', metros: 10000 },
]

function fFecha(iso: string | null): string | null {
  if (!iso) return null
  const [, m, d] = iso.split('-').map(Number)
  const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
  return `${d} ${meses[m - 1]}`
}

export default function CercanosClient() {
  const router = useRouter()
  const [estado, setEstado] = useState<'idle' | 'buscando' | 'ok' | 'error'>('idle')
  const [cercanos, setCercanos] = useState<ClienteCercano[]>([])
  const [miPos, setMiPos] = useState<{ lat: number; lng: number } | null>(null)
  const [radio, setRadio] = useState(RADIOS[1].metros) // 3 km por defecto — 500 m dejaba la lista vacía casi siempre

  const consultar = useCallback((lat: number, lng: number, radioM: number) => {
    setEstado('buscando')
    fetch(`/api/clientes/cercanos?lat=${lat}&lng=${lng}&radio=${radioM}&limit=20`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then((data: ClienteCercano[]) => { setCercanos(data); setEstado('ok') })
      .catch(() => setEstado('error'))
  }, [])

  function buscar() {
    if (typeof navigator === 'undefined' || !navigator.geolocation) { setEstado('error'); return }
    setEstado('buscando')
    navigator.geolocation.getCurrentPosition(
      pos => {
        const { latitude, longitude } = pos.coords
        setMiPos({ lat: latitude, lng: longitude })
        consultar(latitude, longitude, radio)
      },
      () => setEstado('error'),
      { enableHighAccuracy: true, timeout: 8000 },
    )
  }

  function cambiarRadio(metros: number) {
    setRadio(metros)
    if (miPos) consultar(miPos.lat, miPos.lng, metros)
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, paddingBottom: 'max(140px, calc(env(safe-area-inset-bottom, 0px) + 120px))' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '20px 16px 0' }}>
        <button
          onClick={() => router.push('/terreno')}
          aria-label="Volver"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4, minHeight: 36, cursor: 'pointer',
            background: C.card, border: `1px solid ${C.line}`, borderRadius: 100,
            padding: '7px 14px 7px 10px', color: C.blue, fontSize: 13, fontWeight: 700, marginBottom: 14,
          }}
        >
          <ChevronLeft size={17} strokeWidth={2.5} color={C.blue} />
          Volver
        </button>

        <div style={{ marginBottom: 16 }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: C.muted, letterSpacing: '0.04em' }}>VENTA OPORTUNISTA</p>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: C.text, letterSpacing: '-0.5px' }}>Clientes cerca</h1>
        </div>

        {estado !== 'idle' && (
          <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
            {RADIOS.map(r => (
              <button
                key={r.metros}
                onClick={() => cambiarRadio(r.metros)}
                style={{
                  flex: 1, minHeight: 38, borderRadius: 10, cursor: 'pointer',
                  border: `1px solid ${radio === r.metros ? C.blue : C.line}`,
                  background: radio === r.metros ? C.blueSoft : C.card,
                  color: radio === r.metros ? C.blue : C.muted,
                  fontSize: 12.5, fontWeight: 700,
                }}
              >
                {r.label}
              </button>
            ))}
          </div>
        )}

        {estado === 'idle' && (
          <button
            onClick={buscar}
            style={{
              ...cardStyle, width: '100%', cursor: 'pointer', padding: '32px 20px',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, textAlign: 'center',
            }}
          >
            <span style={{ width: 54, height: 54, borderRadius: 18, background: C.blueSoft, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <MapPin size={25} color={C.blue} />
            </span>
            <div>
              <p style={{ fontSize: 15.5, fontWeight: 800, color: C.text, marginBottom: 4 }}>Ver quién tienes cerca</p>
              <p style={{ fontSize: 12.5, color: C.muted }}>Usa tu ubicación para buscar clientes a la vuelta</p>
            </div>
          </button>
        )}

        {estado === 'buscando' && (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <Loader2 size={28} color={C.blue} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />
            <p style={{ fontSize: 13, color: C.muted }}>Ubicando…</p>
          </div>
        )}

        {estado === 'error' && (
          <div style={{ ...cardStyle, padding: 24, textAlign: 'center' }}>
            <p style={{ fontSize: 13.5, color: C.text, fontWeight: 600, marginBottom: 4 }}>No se pudo obtener tu ubicación</p>
            <p style={{ fontSize: 12, color: C.muted, marginBottom: 14 }}>Revisa que el GPS y los permisos estén activos.</p>
            <button
              onClick={buscar}
              style={{
                minHeight: 44, padding: '0 18px', borderRadius: 11, cursor: 'pointer',
                border: 'none', background: C.hero, color: '#fff', fontSize: 14, fontWeight: 800,
              }}
            >
              Reintentar
            </button>
          </div>
        )}

        {estado === 'ok' && (
          cercanos.length === 0 ? (
            <div style={{ ...cardStyle, padding: 28, textAlign: 'center' }}>
              <p style={{ fontSize: 13.5, color: C.muted }}>
                No hay clientes registrados a menos de {radio >= 1000 ? `${radio / 1000} km` : `${radio} m`} de donde estás.
              </p>
            </div>
          ) : (
            <>
              {miPos && (
                <div style={{ marginBottom: 14, borderRadius: 14, overflow: 'hidden', border: `1px solid ${C.line}` }}>
                  <MiniMapaCercanos miLat={miPos.lat} miLng={miPos.lng} clientes={cercanos} />
                </div>
              )}
              <p style={{ fontSize: 11.5, fontWeight: 800, color: C.muted, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 8 }}>
                {cercanos.length} cliente{cercanos.length !== 1 ? 's' : ''} cerca
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {cercanos.map(c => (
                  <div key={c.nombre} style={{ ...cardStyle, padding: '12px 13px', display: 'flex', alignItems: 'center', gap: 11, minHeight: 60 }}>
                    <span style={{
                      width: 36, height: 36, borderRadius: '50%', flexShrink: 0, background: C.blueSoft,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 13, fontWeight: 800, color: C.blue,
                    }}>
                      {c.nombre.charAt(0).toUpperCase()}
                    </span>
                    <button
                      onClick={() => router.push(`/terreno/nueva-visita?cliente=${encodeURIComponent(c.nombre)}`)}
                      style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                    >
                      <p style={{ fontSize: 14, fontWeight: 700, color: C.text, lineHeight: 1.3, wordBreak: 'break-word' }}>{c.nombre}</p>
                      <p style={{ fontSize: 11.5, color: C.muted }}>
                        {c.categoria ?? formatLocalidad(c.localidad) ?? 'Sin categoría'}
                        {c.diasSinComprar != null && (
                          <span style={{ color: C.amber, fontWeight: 700 }}> · {c.diasSinComprar}d sin comprar</span>
                        )}
                        {c.diasSinComprar == null && (
                          <span style={{ color: C.faint }}> · Sin historial de compra</span>
                        )}
                      </p>
                      {c.ultimaCompra && (
                        <p style={{ fontSize: 10.5, color: C.faint, marginTop: 1 }}>Última compra: {fFecha(c.ultimaCompra)}</p>
                      )}
                    </button>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
                      <span style={{ fontSize: 12.5, fontWeight: 800, color: C.blue, whiteSpace: 'nowrap' }}>
                        {c.distancia < 1000 ? `${Math.round(c.distancia)} m` : `${(c.distancia / 1000).toFixed(1)} km`}
                      </span>
                      {c.telefono && (
                        <a
                          href={`tel:${c.telefono}`}
                          aria-label={`Llamar a ${c.nombre}`}
                          onClick={e => e.stopPropagation()}
                          style={{
                            width: 30, height: 30, borderRadius: 9, background: C.blueSoft,
                            display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none',
                          }}
                        >
                          <Phone size={14} color={C.blue} />
                        </a>
                      )}
                    </div>
                    <ChevronRight size={16} color={C.faint} style={{ flexShrink: 0 }} />
                  </div>
                ))}
              </div>
            </>
          )
        )}
      </div>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}
