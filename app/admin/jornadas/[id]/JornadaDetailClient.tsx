'use client'

import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import Logo from '@/components/ui/Logo'
import type { PuntoRuta } from './RutaMap'

const RutaMap = dynamic(() => import('./RutaMap'), {
  ssr: false,
  loading: () => <div style={{ height: 320, borderRadius: 14, background: '#0A0A0A', border: '1px solid rgba(255,255,255,0.08)' }} />,
})

interface Jornada {
  id: string
  fecha: string
  km_inicio: number | null
  foto_odometro_inicio: string | null
  km_fin: number | null
  foto_odometro_fin: string | null
  km_declarados: number | null
  km_gps: number | null
  tolerancia_pct: number
  diferencia_km: number | null
  diferencia_pct: number | null
  requiere_revision: boolean | null
  tarifa_aplicada: number | null
  monto_reembolso: number | null
  estado: string
  iniciada_at: string
  finalizada_at: string | null
  nota_revision: string | null
  vendedor: { nombre: string; iniciales: string; tarifa_reembolso_km: number | null; rendimiento_kml: number | null; vehiculo_tipo: string | null } | null
  revisor: { nombre: string } | null
}

interface Visita {
  id: string
  cliente_nombre: string
  es_cliente_nuevo: boolean
  lat: number | null
  lng: number | null
  direccion_gps: string | null
  foto_exterior: string | null
  foto_exhibicion: string | null
  foto_competencia: string | null
  distancia_cliente_m: number | null
  dentro_geofence: boolean | null
  total_pedido: number
  tiene_venta: boolean | null
  iniciada_at: string
}

interface Carga {
  id: string
  monto: number
  litros: number | null
  foto_boleta_url: string | null
  registrado_at: string
}

const ESTADO_INFO: Record<string, { label: string; color: string }> = {
  abierta:   { label: 'En curso',              color: '#5B8AA8' },
  cerrada:   { label: 'Pendiente de revisión',  color: '#D4AF37' },
  aprobada:  { label: 'Aprobada',              color: '#22C55E' },
  rechazada: { label: 'Rechazada',             color: '#FF4444' },
}

export default function JornadaDetailClient({ jornadaId }: { jornadaId: string }) {
  const [jornada, setJornada] = useState<Jornada | null>(null)
  const [visitas, setVisitas] = useState<Visita[]>([])
  const [cargas, setCargas] = useState<Carga[]>([])
  const [loading, setLoading] = useState(true)
  const [nota, setNota] = useState('')
  const [procesando, setProcesando] = useState(false)

  function cargar() {
    setLoading(true)
    fetch(`/api/admin/jornadas/${jornadaId}`)
      .then(r => r.json())
      .then(data => {
        setJornada(data.jornada)
        setVisitas(data.visitas ?? [])
        setCargas(data.cargas ?? [])
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => { cargar() }, [jornadaId])

  async function resolver(estado: 'aprobada' | 'rechazada') {
    setProcesando(true)
    try {
      const res = await fetch(`/api/admin/jornadas/${jornadaId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado, nota_revision: nota.trim() || undefined }),
      })
      if (!res.ok) { alert('Error al procesar'); return }
      cargar()
    } finally {
      setProcesando(false)
    }
  }

  if (loading || !jornada) {
    return <div style={{ minHeight: '100vh', background: '#07070D' }} />
  }

  const info = ESTADO_INFO[jornada.estado] ?? { label: jornada.estado, color: 'rgba(255,255,255,0.4)' }
  const puntos: PuntoRuta[] = visitas
    .filter(v => v.lat != null && v.lng != null)
    .map(v => ({
      lat: v.lat!, lng: v.lng!, nombre: v.cliente_nombre,
      dentroGeofence: v.dentro_geofence, distanciaM: v.distancia_cliente_m,
      hora: new Date(v.iniciada_at).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }),
    }))

  const totalVentasNuevos = visitas.filter(v => v.es_cliente_nuevo).reduce((s, v) => s + (v.total_pedido || 0), 0)
  const totalVentasExistentes = visitas.filter(v => !v.es_cliente_nuevo).reduce((s, v) => s + (v.total_pedido || 0), 0)
  const totalCombustible = cargas.reduce((s, c) => s + c.monto, 0)
  const totalVentas = totalVentasNuevos + totalVentasExistentes
  const fueraGeofence = visitas.filter(v => v.dentro_geofence === false)

  return (
    <div style={{ minHeight: '100vh', background: '#07070D', color: '#F4EEDF' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 28px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(15,15,24,0.95)', backdropFilter: 'blur(10px)', position: 'sticky', top: 0, zIndex: 10 }}>
        <Logo size={28} />
        <Link href="/admin/jornadas" style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>
          Volver
        </Link>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 800 }}>{jornada.vendedor?.nombre ?? '—'}</div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>{new Date(jornada.fecha).toLocaleDateString('es-CL', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}</div>
        </div>
        <span style={{ padding: '5px 11px', borderRadius: 9, fontSize: 11, fontWeight: 800, color: info.color, background: `${info.color}18`, border: `1px solid ${info.color}40` }}>
          {info.label}
        </span>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '28px 24px' }}>

        {/* ── Comparativa km declarado vs GPS ── */}
        <div style={{
          background: jornada.requiere_revision ? 'rgba(255,68,68,0.05)' : 'rgba(34,197,94,0.05)',
          border: `1px solid ${jornada.requiere_revision ? 'rgba(255,68,68,0.25)' : 'rgba(34,197,94,0.25)'}`,
          borderRadius: 18, padding: 20, marginBottom: 20,
        }}>
          {jornada.requiere_revision && (
            <p style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 900, color: '#FF4444', marginBottom: 14 }}>
              ⚠ Diferencia supera la tolerancia ({jornada.tolerancia_pct}%) — requiere revisión
            </p>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
            <div>
              <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', marginBottom: 4 }}>Km declarados (tablero)</p>
              <p style={{ fontSize: 22, fontWeight: 900 }}>{jornada.km_declarados ?? '—'}</p>
            </div>
            <div>
              <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', marginBottom: 4 }}>Km reales (GPS)</p>
              <p style={{ fontSize: 22, fontWeight: 900 }}>{jornada.km_gps?.toFixed(1) ?? '—'}</p>
            </div>
            <div>
              <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', marginBottom: 4 }}>Diferencia</p>
              <p style={{ fontSize: 22, fontWeight: 900, color: jornada.requiere_revision ? '#FF4444' : '#22C55E' }}>{jornada.diferencia_pct?.toFixed(0) ?? '—'}%</p>
            </div>
            <div>
              <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', marginBottom: 4 }}>Reembolso</p>
              <p style={{ fontSize: 22, fontWeight: 900, color: '#D4AF37' }}>${jornada.monto_reembolso?.toLocaleString('es-CL') ?? '—'}</p>
            </div>
          </div>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 12 }}>
            Km GPS = distancia real entre los check-in de las {puntos.length} visita{puntos.length === 1 ? '' : 's'} de este día · Tarifa aplicada ${jornada.tarifa_aplicada ?? 0}/km
          </p>
        </div>

        {/* ── Mapa de la ruta ── */}
        <p style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10 }}>
          Ruta del día {fueraGeofence.length > 0 && <span style={{ color: '#FF4444' }}>· {fueraGeofence.length} visita{fueraGeofence.length === 1 ? '' : 's'} fuera de rango del cliente</span>}
        </p>
        <div style={{ marginBottom: 20 }}>
          <RutaMap puntos={puntos} />
        </div>

        {/* ── Visitas del día (prueba de trabajo real) ── */}
        <p style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10 }}>
          Visitas realizadas ({visitas.length})
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
          {visitas.length === 0 && <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>Sin visitas registradas en esta jornada.</p>}
          {visitas.map((v, i) => (
            <div key={v.id} style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${v.dentro_geofence === false ? 'rgba(255,68,68,0.3)' : 'rgba(255,255,255,0.07)'}`, borderRadius: 12, padding: '10px 14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <p style={{ fontSize: 12, fontWeight: 800 }}>{i + 1}. {v.cliente_nombre} {v.es_cliente_nuevo && <span style={{ fontSize: 9, color: '#22C55E', fontWeight: 700 }}>NUEVO</span>}</p>
                <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>{new Date(v.iniciada_at).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}</p>
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                {v.distancia_cliente_m != null ? (
                  <span style={{ fontSize: 10, color: v.dentro_geofence ? '#22C55E' : '#FF4444', fontWeight: 700 }}>
                    {v.dentro_geofence ? '✓' : '⚠'} {Math.round(v.distancia_cliente_m)}m del cliente registrado
                  </span>
                ) : (
                  <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>Sin cliente registrado para validar ubicación</span>
                )}
                {v.total_pedido > 0 && <span style={{ fontSize: 10, color: '#D4AF37' }}>· ${v.total_pedido.toLocaleString('es-CL')}</span>}
                {[v.foto_exterior, v.foto_exhibicion, v.foto_competencia].filter(Boolean).map((url, j) => (
                  <a key={j} href={url!} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, color: '#5B8AA8', textDecoration: 'underline' }}>Foto {j + 1}</a>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* ── Evidencia odómetro ── */}
        <p style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10 }}>
          Evidencia del odómetro
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
          {[
            { url: jornada.foto_odometro_inicio, label: `Inicio · ${jornada.km_inicio ?? '—'} km` },
            { url: jornada.foto_odometro_fin, label: `Fin · ${jornada.km_fin ?? '—'} km` },
          ].map(f => (
            <div key={f.label} style={{ borderRadius: 12, overflow: 'hidden', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
              {f.url ? (
                <a href={f.url} target="_blank" rel="noopener noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.url} alt={f.label} style={{ width: '100%', height: 140, objectFit: 'cover', display: 'block' }} />
                </a>
              ) : (
                <div style={{ height: 140, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.2)', fontSize: 11 }}>Sin foto</div>
              )}
              <p style={{ padding: '8px 12px', fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.5)' }}>{f.label}</p>
            </div>
          ))}
        </div>

        {/* ── Combustible ── */}
        <p style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10 }}>
          Cargas de combustible ({cargas.length})
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20 }}>
          {cargas.length === 0 && <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>Sin cargas registradas.</p>}
          {cargas.map(c => (
            <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: '9px 14px' }}>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
                {new Date(c.registrado_at).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}{c.litros ? ` · ${c.litros}L` : ''}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <strong style={{ fontSize: 13, color: '#D4AF37' }}>${c.monto.toLocaleString('es-CL')}</strong>
                {c.foto_boleta_url && <a href={c.foto_boleta_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, color: '#5B8AA8' }}>Ver boleta</a>}
              </div>
            </div>
          ))}
        </div>

        {/* ── ROI de traslado ── */}
        {(totalVentas > 0 || totalCombustible > 0) && (
          <div style={{ background: 'rgba(212,175,55,0.05)', border: '1px solid rgba(212,175,55,0.2)', borderRadius: 14, padding: 16, marginBottom: 20 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: '#D4AF37', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10 }}>ROI del traslado</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, fontSize: 12 }}>
              <div><span style={{ color: 'rgba(255,255,255,0.4)' }}>Ventas a clientes nuevos:</span> <strong style={{ color: '#22C55E' }}>${totalVentasNuevos.toLocaleString('es-CL')}</strong></div>
              <div><span style={{ color: 'rgba(255,255,255,0.4)' }}>Ventas a cartera existente:</span> <strong style={{ color: 'var(--cream)' }}>${totalVentasExistentes.toLocaleString('es-CL')}</strong></div>
              <div><span style={{ color: 'rgba(255,255,255,0.4)' }}>Costo combustible:</span> <strong style={{ color: '#FF4444' }}>${totalCombustible.toLocaleString('es-CL')}</strong></div>
            </div>
            {totalCombustible > 0 && (
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 8 }}>
                Cada peso de bencina generó ${(totalVentas / totalCombustible).toFixed(1)} en ventas.
              </p>
            )}
          </div>
        )}

        {/* ── Aprobación ── */}
        {jornada.estado === 'cerrada' && (
          <div style={{ background: 'var(--surface, #131313)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: 18 }}>
            <p style={{ fontSize: 13, fontWeight: 800, marginBottom: 10 }}>Resolución</p>
            <input
              value={nota} onChange={e => setNota(e.target.value)}
              placeholder="Nota (opcional) — ej: confirmado por WhatsApp, se descuenta diferencia..."
              style={{ width: '100%', padding: '10px 12px', borderRadius: 9, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.03)', color: '#F4EEDF', fontSize: 12, outline: 'none', marginBottom: 12 }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => resolver('aprobada')} disabled={procesando}
                style={{ flex: 1, padding: '11px 0', borderRadius: 10, border: 'none', cursor: 'pointer', background: '#22C55E', color: '#062', fontSize: 13, fontWeight: 900, opacity: procesando ? 0.6 : 1 }}>
                Aprobar reembolso
              </button>
              <button onClick={() => resolver('rechazada')} disabled={procesando}
                style={{ flex: 1, padding: '11px 0', borderRadius: 10, border: '1px solid rgba(255,68,68,0.4)', cursor: 'pointer', background: 'rgba(255,68,68,0.1)', color: '#FF4444', fontSize: 13, fontWeight: 900, opacity: procesando ? 0.6 : 1 }}>
                Rechazar
              </button>
            </div>
          </div>
        )}

        {(jornada.estado === 'aprobada' || jornada.estado === 'rechazada') && (
          <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: 16 }}>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
              {jornada.estado === 'aprobada' ? '✓ Aprobada' : '✕ Rechazada'} por {jornada.revisor?.nombre ?? '—'}
            </p>
            {jornada.nota_revision && <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 6, fontStyle: 'italic' }}>"{jornada.nota_revision}"</p>}
          </div>
        )}
      </div>
    </div>
  )
}
