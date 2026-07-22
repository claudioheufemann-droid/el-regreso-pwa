'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { ChevronLeft, CheckCircle2, FileText, Camera, PackageCheck } from 'lucide-react'
import type { PuntoEntrega } from './EntregaMap'

const EntregaMap = dynamic(() => import('./EntregaMap'), {
  ssr: false,
  loading: () => <div style={{ height: 340, borderRadius: 14, background: '#0A0A0A', border: '1px solid rgba(255,255,255,0.08)' }} />,
})

const F = '#D4AF37'

interface Entrega {
  id: string
  parada_id: string
  guia_url: string
  foto_entrega_url: string
  cantidad_entregada: number
  barriles: number
  cajas_cerveza: number
  cajas_kombucha: number
  estado: 'entregado' | 'rechazado' | 'devuelto'
  motivo_rechazo: string | null
  lat: number | null
  lng: number | null
  entregado_at: string
  aprobado: boolean
  aprobado_por: string | null
  aprobado_at: string | null
}

interface Parada {
  id: string
  cantidad_pedida: number
  estado: string
  cliente: { nombre_fantasia: string } | null
  cliente_terreno: { nombre_fantasia: string } | null
  entrega: Entrega[]
}

interface Despacho {
  id: string
  fecha: string
  region: string
  chofer: { nombre: string } | null
  vehiculo: { nombre: string; patente: string | null } | null
  paradas: Parada[]
}

function hoyISO() {
  return new Date().toISOString().slice(0, 10)
}

export default function EntregasAdminClient() {
  const router = useRouter()
  const [fecha, setFecha] = useState(hoyISO())
  const [despachos, setDespachos] = useState<Despacho[]>([])
  const [loading, setLoading] = useState(true)
  const [aprobando, setAprobando] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    fetch(`/api/logistica/despachos?fecha=${fecha}`)
      .then(r => r.json())
      .then(data => setDespachos(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false))
  }, [fecha])

  useEffect(() => { load() }, [load])

  const entregasFlat = useMemo(() => {
    const rows: { despacho: Despacho; parada: Parada; entrega: Entrega; nombreCliente: string }[] = []
    for (const d of despachos) {
      for (const p of d.paradas ?? []) {
        const ultima = [...(p.entrega ?? [])].sort((a, b) => (b.entregado_at ?? '').localeCompare(a.entregado_at ?? ''))[0]
        if (!ultima) continue
        rows.push({ despacho: d, parada: p, entrega: ultima, nombreCliente: p.cliente?.nombre_fantasia ?? p.cliente_terreno?.nombre_fantasia ?? 'Cliente' })
      }
    }
    return rows
  }, [despachos])

  const pendientesAprobar = entregasFlat.filter(r => r.entrega.estado === 'entregado' && !r.entrega.aprobado)

  const puntosMapa: PuntoEntrega[] = entregasFlat
    .filter(r => r.entrega.lat != null && r.entrega.lng != null)
    .map(r => ({
      id: r.entrega.id, lat: r.entrega.lat!, lng: r.entrega.lng!,
      nombre: r.nombreCliente, estado: r.entrega.estado,
      hora: new Date(r.entrega.entregado_at).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }),
      aprobado: r.entrega.aprobado,
    }))

  const inventario = despachos.map(d => {
    const pedido = (d.paradas ?? []).reduce((s, p) => s + (p.cantidad_pedida || 0), 0)
    const entregado = (d.paradas ?? []).reduce((s, p) => {
      const ultima = [...(p.entrega ?? [])].sort((a, b) => (b.entregado_at ?? '').localeCompare(a.entregado_at ?? ''))[0]
      return s + (ultima?.estado === 'entregado' ? ultima.cantidad_entregada : 0)
    }, 0)
    return { despacho: d, pedido, entregado }
  }).filter(i => i.pedido > 0 || i.entregado > 0)

  const totales = entregasFlat.reduce((acc, r) => {
    if (r.entrega.estado !== 'entregado') return acc
    acc.barriles += r.entrega.barriles
    acc.cajasCerveza += r.entrega.cajas_cerveza
    acc.cajasKombucha += r.entrega.cajas_kombucha
    return acc
  }, { barriles: 0, cajasCerveza: 0, cajasKombucha: 0 })

  async function aprobar(entregaId: string) {
    setAprobando(entregaId)
    try {
      const res = await fetch(`/api/logistica/entregas/${entregaId}/aprobar`, { method: 'PATCH' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        alert(err.error ?? 'Error al aprobar la entrega')
        return
      }
      load()
    } finally {
      setAprobando(null)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#080808', display: 'flex', flexDirection: 'column' }}>
      <div style={{ background: '#0F0F0F', borderBottom: '1px solid rgba(212,175,55,0.15)', padding: '14px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => router.push('/flota/admin')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: F, display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 600, padding: 0 }}>
            <ChevronLeft size={18} /> Admin
          </button>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 15, fontWeight: 800, color: '#F4EEDF' }}>Entregas y Aprobación</p>
            <p style={{ fontSize: 11, color: 'var(--muted)' }}>Prueba de entrega, mapa e inventario de despacho</p>
          </div>
          <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} style={{
            padding: '8px 10px', borderRadius: 9, border: '1px solid rgba(255,255,255,0.12)',
            background: '#131313', color: '#F4EEDF', fontSize: 12,
          }} />
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 16, maxWidth: 720, margin: '0 auto', width: '100%' }}>

        {/* KPIs del día */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 20 }}>
          {[
            { label: 'Entregas', value: entregasFlat.filter(r => r.entrega.estado === 'entregado').length },
            { label: 'Por aprobar', value: pendientesAprobar.length, color: pendientesAprobar.length > 0 ? '#D4AF37' : undefined },
            { label: 'Barriles', value: totales.barriles },
            { label: 'Cajas (cerv.+komb.)', value: totales.cajasCerveza + totales.cajasKombucha },
          ].map(k => (
            <div key={k.label} style={{ background: '#131313', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '10px 10px' }}>
              <p style={{ fontSize: 17, fontWeight: 900, color: k.color ?? '#F4EEDF' }}>{k.value}</p>
              <p style={{ fontSize: 9, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>{k.label}</p>
            </div>
          ))}
        </div>

        {loading ? (
          <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 13, padding: 30 }}>Cargando…</p>
        ) : (
          <>
            {/* Bandeja de aprobación */}
            <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 10 }}>
              Bandeja de aprobación {pendientesAprobar.length > 0 && `(${pendientesAprobar.length})`}
            </p>
            {pendientesAprobar.length === 0 ? (
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginBottom: 20 }}>Sin entregas pendientes de aprobar.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
                {pendientesAprobar.map(r => (
                  <div key={r.entrega.id} style={{ background: '#131313', border: '1px solid rgba(212,175,55,0.25)', borderRadius: 14, padding: '12px 14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                      <div>
                        <p style={{ fontSize: 13, fontWeight: 800, color: '#F4EEDF' }}>{r.nombreCliente}</p>
                        <p style={{ fontSize: 10, color: 'var(--muted)' }}>
                          {r.despacho.chofer?.nombre ?? '—'} · {r.despacho.vehiculo?.nombre ?? '—'} · {new Date(r.entrega.entregado_at).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                      <button
                        onClick={() => aprobar(r.entrega.id)}
                        disabled={aprobando === r.entrega.id}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 9, border: 'none', cursor: 'pointer',
                          background: 'rgba(74,222,128,0.15)', color: '#4ADE80', fontSize: 11, fontWeight: 800,
                          opacity: aprobando === r.entrega.id ? 0.5 : 1,
                        }}
                      >
                        <CheckCircle2 size={13} /> {aprobando === r.entrega.id ? 'Aprobando…' : 'Aprobar'}
                      </button>
                    </div>
                    <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 8 }}>
                      🍺 {r.entrega.barriles} barriles · 🥫 {r.entrega.cajas_cerveza} cajas cerveza · 🍵 {r.entrega.cajas_kombucha} cajas kombucha
                    </p>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {r.entrega.guia_url && (
                        <a href={r.entrega.guia_url} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: F, textDecoration: 'none' }}>
                          <FileText size={12} /> Ver guía
                        </a>
                      )}
                      {r.entrega.foto_entrega_url && (
                        <a href={r.entrega.foto_entrega_url} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: F, textDecoration: 'none' }}>
                          <Camera size={12} /> Ver foto
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Mapa en tiempo real */}
            <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 10 }}>
              Mapa de entregas
            </p>
            <div style={{ marginBottom: 20 }}>
              <EntregaMap puntos={puntosMapa} />
            </div>

            {/* Control de inventario: salida vs entregado */}
            <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 10 }}>
              Inventario: pedido vs. entregado
            </p>
            {inventario.length === 0 ? (
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>Sin despachos con movimiento en esta fecha.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {inventario.map(({ despacho, pedido, entregado }) => {
                  const pct = pedido > 0 ? Math.round((entregado / pedido) * 100) : 0
                  const color = pct >= 95 ? '#4ADE80' : pct >= 70 ? '#D4AF37' : '#FF6666'
                  return (
                    <div key={despacho.id} style={{ background: '#131313', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                      <PackageCheck size={16} color={color} />
                      <div style={{ flex: 1 }}>
                        <p style={{ fontSize: 12, fontWeight: 700, color: '#F4EEDF' }}>{despacho.vehiculo?.nombre ?? despacho.region} · {despacho.chofer?.nombre ?? '—'}</p>
                        <p style={{ fontSize: 10, color: 'var(--muted)' }}>{pedido} pedidas · {entregado} entregadas</p>
                      </div>
                      <p style={{ fontSize: 14, fontWeight: 900, color }}>{pct}%</p>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
