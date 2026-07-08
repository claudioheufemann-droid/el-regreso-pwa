'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import AppHeader from '@/components/ui/AppHeader'
import { REGIONES_OPERATIVAS } from '@/lib/regiones'
import { Plus, ArrowUp, ArrowDown, Truck, Camera } from 'lucide-react'

interface PedidoPendiente {
  visita_terreno_id: string
  cliente_nombre: string
  cliente_terreno_id: string | null
  total_pedido: number
  cantidad_total: number
  completada_at: string
}

interface Parada {
  id: string
  secuencia: number
  eta_comprometida: string
  cantidad_pedida: number
  estado: string
  cliente: { nombre_fantasia: string } | null
  cliente_terreno: { nombre_fantasia: string } | null
}

interface Despacho {
  id: string
  fecha: string
  region: string
  estado: string
  paradas: Parada[]
}

const ORANGE = '#F97316'

function nombreParada(p: Parada): string {
  return p.cliente?.nombre_fantasia ?? p.cliente_terreno?.nombre_fantasia ?? 'Cliente'
}

export default function DespachosClient() {
  const router = useRouter()
  const [despachos, setDespachos] = useState<Despacho[]>([])
  const [pendientes, setPendientes] = useState<PedidoPendiente[]>([])
  const [loading, setLoading] = useState(true)
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10))
  const [region, setRegion] = useState<string>(REGIONES_OPERATIVAS[0])
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set())
  const [creando, setCreando] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([
      fetch(`/api/logistica/despachos?fecha=${fecha}`).then(r => r.json()),
      fetch('/api/logistica/pedidos-pendientes').then(r => r.json()),
    ]).then(([d, p]) => {
      setDespachos(Array.isArray(d) ? d : [])
      setPendientes(Array.isArray(p) ? p : [])
    }).finally(() => setLoading(false))
  }, [fecha])

  useEffect(() => { load() }, [load])

  function toggleSeleccion(id: string) {
    setSeleccionados(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function crearDespacho() {
    if (!seleccionados.size) return
    setCreando(true)
    try {
      const paradas = pendientes
        .filter(p => seleccionados.has(p.visita_terreno_id))
        .map(p => ({
          cliente_terreno_id: p.cliente_terreno_id ?? undefined,
          visita_terreno_id: p.visita_terreno_id,
          eta_comprometida: new Date(Date.now() + 4 * 3600000).toISOString(), // default: +4h, ajustable después
          cantidad_pedida: p.cantidad_total || 1,
        }))

      const res = await fetch('/api/logistica/despachos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fecha, region, paradas }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        alert(err.error ?? 'Error al crear el despacho')
        return
      }
      setSeleccionados(new Set())
      load()
    } finally {
      setCreando(false)
    }
  }

  async function mover(despachoId: string, paradas: Parada[], index: number, dir: -1 | 1) {
    const nuevo = [...paradas]
    const j = index + dir
    if (j < 0 || j >= nuevo.length) return
    ;[nuevo[index], nuevo[j]] = [nuevo[j], nuevo[index]]
    setDespachos(prev => prev.map(d => d.id === despachoId ? { ...d, paradas: nuevo } : d))
    await fetch(`/api/logistica/despachos/${despachoId}/paradas`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orden: nuevo.map(p => p.id) }),
    })
  }

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh' }}>
      <AppHeader eyebrow="Logística" title="Despachos" backHref="/" />

      <div style={{ maxWidth: 640, margin: '0 auto', padding: '0 16px 100px' }}>

        {/* ── Selector de fecha/región ── */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
          <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} style={inputStyle} />
          <select value={region} onChange={e => setRegion(e.target.value)} style={inputStyle}>
            {REGIONES_OPERATIVAS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>

        {/* ── Pedidos pendientes de asignar ── */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, padding: 18, marginBottom: 24 }}>
          <p style={{ fontSize: 14, fontWeight: 800, color: 'var(--cream)', marginBottom: 4 }}>Pedidos sin despacho</p>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginBottom: 12 }}>
            Selecciona los pedidos de terreno completados y arma la ruta del día
          </p>

          {loading ? (
            <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>Cargando…</p>
          ) : pendientes.length === 0 ? (
            <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>No hay pedidos pendientes de despacho.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
              {pendientes.map(p => (
                <label key={p.visita_terreno_id} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 10,
                  background: seleccionados.has(p.visita_terreno_id) ? `${ORANGE}12` : 'rgba(255,255,255,0.02)',
                  border: `1px solid ${seleccionados.has(p.visita_terreno_id) ? ORANGE+'55' : 'var(--border)'}`,
                  cursor: 'pointer',
                }}>
                  <input type="checkbox" checked={seleccionados.has(p.visita_terreno_id)} onChange={() => toggleSeleccion(p.visita_terreno_id)} />
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--cream)' }}>{p.cliente_nombre}</p>
                    <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>
                      {p.cantidad_total} unidades · ${p.total_pedido?.toLocaleString('es-CL')}
                    </p>
                  </div>
                </label>
              ))}
            </div>
          )}

          <button
            onClick={crearDespacho}
            disabled={!seleccionados.size || creando}
            style={{
              width: '100%', padding: '12px 0', borderRadius: 12, border: 'none', cursor: seleccionados.size ? 'pointer' : 'default',
              background: `linear-gradient(135deg, ${ORANGE}, #C2410C)`, color: '#080808', fontSize: 13, fontWeight: 900,
              opacity: seleccionados.size && !creando ? 1 : 0.4,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            <Plus size={14} /> Crear despacho con {seleccionados.size} pedido{seleccionados.size === 1 ? '' : 's'}
          </button>
        </div>

        {/* ── Despachos del día ── */}
        <p style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10 }}>
          Ruta del {new Date(fecha + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'long' })}
        </p>

        {despachos.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'rgba(255,255,255,0.3)' }}>
            <Truck size={28} style={{ marginBottom: 8, opacity: 0.4 }} />
            <p style={{ fontSize: 13 }}>Sin despachos armados para esta fecha.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {despachos.map(d => (
              <div key={d.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 14 }}>
                <p style={{ fontSize: 12, fontWeight: 800, color: ORANGE, marginBottom: 10 }}>{d.region} · {d.paradas.length} paradas</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {d.paradas.map((p, i) => (
                    <div key={p.id} style={{
                      display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 10,
                      background: p.estado !== 'pendiente' ? 'rgba(74,222,128,0.06)' : 'rgba(255,255,255,0.02)',
                    }}>
                      <span style={{ fontSize: 11, fontWeight: 800, color: 'rgba(255,255,255,0.3)', width: 18 }}>{i + 1}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--cream)' }}>{nombreParada(p)}</p>
                        <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>
                          {p.estado === 'pendiente' ? `ETA ${new Date(p.eta_comprometida).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}` : p.estado}
                        </p>
                      </div>
                      {p.estado === 'pendiente' && (
                        <>
                          <button onClick={() => mover(d.id, d.paradas, i, -1)} style={iconBtnStyle}><ArrowUp size={12} /></button>
                          <button onClick={() => mover(d.id, d.paradas, i, 1)} style={iconBtnStyle}><ArrowDown size={12} /></button>
                          <button onClick={() => router.push(`/logistica/despachos/${d.id}/entregar?parada=${p.id}`)} style={{ ...iconBtnStyle, color: ORANGE, borderColor: `${ORANGE}55` }}>
                            <Camera size={12} />
                          </button>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  flex: 1, padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)',
  background: 'var(--surface2)', color: 'var(--cream)', fontSize: 13, outline: 'none', colorScheme: 'dark',
}
const iconBtnStyle: React.CSSProperties = {
  width: 28, height: 28, borderRadius: 8, border: '1px solid var(--border)', background: 'transparent',
  color: 'rgba(255,255,255,0.5)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
}
