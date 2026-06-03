'use client'

import { useState, useMemo } from 'react'
import { MapPin, CheckCircle, XCircle, Filter, ChevronDown, ChevronUp, Package, TrendingUp, AlertTriangle, Clock } from 'lucide-react'
import type { AppUser } from '@/lib/auth'
import { useIsDesktop } from '@/lib/useIsDesktop'

const T = '#D4AF37'
const T_DIM = 'rgba(212,175,55,0.12)'
const T_BORDER = 'rgba(212,175,55,0.25)'

// ── Types ──────────────────────────────────────────────────────
interface Visita {
  id: string; cliente_nombre: string; tiene_venta: boolean | null
  motivo_sin_venta: string | null; total_pedido: number | null
  estado: string; iniciada_at: string; completada_at: string | null
  vendedor_id: string; es_cliente_nuevo: boolean
  observaciones: string | null; direccion_gps: string | null
  lat: number | null; lng: number | null
  foto_exterior: string | null; foto_exhibicion: string | null; foto_competencia: string | null
}
interface Item { id: string; visita_id: string; producto: string; categoria: string; envase: string; cantidad: number; precio_unit: number; subtotal: number }
interface Deudor { nombre_fantasia: string; saldo_total: number; deuda_vencida: number; ultimo_pago: string | null; fecha_ultima_compra: string | null; limite_cta_cte: number | null }
interface VentaHist { nombre_fantasia: string; producto: string; litros: number | null; total_sin_impuesto: number | null; fecha_pedido: string | null }
interface Props {
  user: AppUser; visitas: Visita[]; items: Item[]
  vendedores: { id: string; nombre: string }[]
  deudores: Deudor[]; ventasHist: VentaHist[]
}

// ── Helpers ────────────────────────────────────────────────────
const fmtFecha = (iso: string) => new Date(iso).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })
const fmtHora  = (iso: string) => new Date(iso).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
const fmtPeso  = (n: number)   => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)
const fmtPesoCompact = (n: number) => new Intl.NumberFormat('es-CL', { notation: 'compact', style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)

function labelFecha(iso: string) {
  const hoy = new Date().toISOString().split('T')[0]
  const ayer = new Date(Date.now() - 86400000).toISOString().split('T')[0]
  const d = iso.split('T')[0]
  if (d === hoy) return 'Hoy'
  if (d === ayer) return 'Ayer'
  return fmtFecha(iso + 'T12:00:00')
}

function agruparPorFecha(visitas: Visita[]) {
  const grupos: Record<string, Visita[]> = {}
  for (const v of visitas) {
    const fecha = v.iniciada_at.split('T')[0]
    if (!grupos[fecha]) grupos[fecha] = []
    grupos[fecha].push(v)
  }
  return Object.entries(grupos).sort((a, b) => b[0].localeCompare(a[0]))
}

// ── Badge deuda ────────────────────────────────────────────────
function DeudaBadge({ deudor }: { deudor: Deudor | undefined }) {
  if (!deudor || deudor.saldo_total <= 0) return (
    <span style={{ fontSize: 10, fontWeight: 700, color: '#5A8A4A', background: 'rgba(90,138,74,0.12)', padding: '2px 7px', borderRadius: 20 }}>Al día</span>
  )
  if (deudor.deuda_vencida > 0) return (
    <span style={{ fontSize: 10, fontWeight: 700, color: '#B5543E', background: 'rgba(181,84,62,0.12)', padding: '2px 7px', borderRadius: 20 }}>
      ⚠ Vencida {fmtPesoCompact(deudor.deuda_vencida)}
    </span>
  )
  return (
    <span style={{ fontSize: 10, fontWeight: 700, color: '#D4AF37', background: 'rgba(212,175,55,0.1)', padding: '2px 7px', borderRadius: 20 }}>
      Saldo {fmtPesoCompact(deudor.saldo_total)}
    </span>
  )
}

// ── Panel deuda del cliente ────────────────────────────────────
function PanelDeuda({ deudor }: { deudor: Deudor }) {
  const color = deudor.deuda_vencida > 0 ? '#B5543E' : deudor.saldo_total > 0 ? '#D4AF37' : '#5A8A4A'
  const rgb   = deudor.deuda_vencida > 0 ? '239,68,68' : deudor.saldo_total > 0 ? '245,158,11' : '90,138,74'
  const tramos = [
    { label: '< 14 días',    val: (deudor as any).deuda_menor_14_dias ?? 0 },
    { label: '15–29 días',   val: (deudor as any).deuda_entre_15_29_dias ?? 0 },
    { label: '30–44 días',   val: (deudor as any).deuda_entre_30_44_dias ?? 0 },
    { label: '45–59 días',   val: (deudor as any).deuda_entre_45_59_dias ?? 0 },
    { label: '60–89 días',   val: (deudor as any).deuda_entre_60_89_dias ?? 0 },
    { label: '≥ 90 días',    val: (deudor as any).deuda_mas_90_dias ?? 0 },
  ].filter(t => t.val > 0)

  return (
    <div style={{ background: `rgba(${rgb},0.06)`, border: `1px solid rgba(${rgb},0.2)`, borderRadius: 12, padding: '12px 14px', marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <AlertTriangle size={14} color={color} />
        <p style={{ fontSize: 11, fontWeight: 800, color, textTransform: 'uppercase', letterSpacing: '0.8px' }}>Estado de cuenta</p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: tramos.length ? 10 : 0 }}>
        <div>
          <p style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 3 }}>Saldo total</p>
          <p style={{ fontSize: 18, fontWeight: 900, color, letterSpacing: '-0.5px' }}>{fmtPeso(deudor.saldo_total)}</p>
        </div>
        <div>
          <p style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 3 }}>Deuda vencida</p>
          <p style={{ fontSize: 18, fontWeight: 900, color: deudor.deuda_vencida > 0 ? '#B5543E' : '#5A8A4A', letterSpacing: '-0.5px' }}>
            {deudor.deuda_vencida > 0 ? fmtPeso(deudor.deuda_vencida) : 'Sin vencer'}
          </p>
        </div>
        {deudor.ultimo_pago && (
          <div>
            <p style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 3 }}>Último pago</p>
            <p style={{ fontSize: 12, fontWeight: 700, color: '#F4EEDF' }}>{fmtFecha(deudor.ultimo_pago)}</p>
          </div>
        )}
        {deudor.limite_cta_cte && deudor.limite_cta_cte > 0 && (
          <div>
            <p style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 3 }}>Límite cta. cte.</p>
            <p style={{ fontSize: 12, fontWeight: 700, color: '#F4EEDF' }}>{fmtPeso(deudor.limite_cta_cte)}</p>
          </div>
        )}
      </div>
      {tramos.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <p style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 2 }}>Antigüedad de deuda</p>
          {tramos.map(t => (
            <div key={t.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>{t.label}</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#F4EEDF' }}>{fmtPeso(t.val)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Panel historial del cliente ────────────────────────────────
function PanelHistorialCliente({ clienteNombre, ventasHist, visitasCliente, itemsPorVisita }: {
  clienteNombre: string
  ventasHist: VentaHist[]
  visitasCliente: Visita[]
  itemsPorVisita: Record<string, Item[]>
}) {
  const [tab, setTab] = useState<'visitas' | 'ventas'>('visitas')

  const totalVisitas = visitasCliente.length
  const totalFacturadoVisitas = visitasCliente.reduce((s, v) => s + (v.total_pedido ?? 0), 0)
  const totalFacturadoVentas  = ventasHist.reduce((s, v) => s + (v.total_sin_impuesto ?? 0), 0)
  const totalLitros = ventasHist.reduce((s, v) => s + (v.litros ?? 0), 0)

  // Top productos de terreno
  const topProductos: Record<string, number> = {}
  for (const v of visitasCliente) {
    for (const item of (itemsPorVisita[v.id] ?? [])) {
      topProductos[item.producto] = (topProductos[item.producto] ?? 0) + item.cantidad
    }
  }
  const topSorted = Object.entries(topProductos).sort((a, b) => b[1] - a[1]).slice(0, 5)

  return (
    <div style={{ marginTop: 10 }}>
      <p style={{ fontSize: 10, fontWeight: 700, color: T, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
        <TrendingUp size={12} color={T} /> Historial del cliente
      </p>

      {/* Stats rápidas */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 12 }}>
        {[
          { label: 'Visitas', val: totalVisitas },
          { label: 'Facturado terreno', val: totalFacturadoVisitas > 0 ? fmtPesoCompact(totalFacturadoVisitas) : '—' },
          { label: 'Facturado hist.', val: totalFacturadoVentas > 0 ? fmtPesoCompact(totalFacturadoVentas) : '—' },
        ].map(s => (
          <div key={s.label} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: '8px 10px', textAlign: 'center' }}>
            <p style={{ fontSize: 14, fontWeight: 900, color: T }}>{s.val}</p>
            <p style={{ fontSize: 9, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{s.label}</p>
          </div>
        ))}
      </div>

      {/* Top productos comprados en terreno */}
      {topSorted.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <p style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 6 }}>Productos más comprados (terreno)</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {topSorted.map(([prod, cant]) => (
              <div key={prod} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 8px', background: 'rgba(255,255,255,0.03)', borderRadius: 7 }}>
                <span style={{ fontSize: 12, color: '#F4EEDF' }}>{prod}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: T }}>{cant} ud.</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabs visitas / ventas históricas */}
      <div style={{ display: 'flex', gap: 4, background: '#111', borderRadius: 10, padding: 3, marginBottom: 10 }}>
        {(['visitas', 'ventas'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ flex: 1, padding: '7px 0', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 700, background: tab === t ? T : 'transparent', color: tab === t ? '#080808' : 'var(--muted)' }}>
            {t === 'visitas' ? `Visitas (${totalVisitas})` : `Ventas hist. (${ventasHist.length})`}
          </button>
        ))}
      </div>

      {tab === 'visitas' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 280, overflowY: 'auto' }}>
          {visitasCliente.slice(0, 20).map(v => (
            <div key={v.id} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 9, padding: '8px 10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#F4EEDF' }}>{fmtFecha(v.iniciada_at)}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: v.tiene_venta ? T : '#B5543E' }}>{v.tiene_venta ? fmtPeso(v.total_pedido ?? 0) : 'Sin venta'}</span>
              </div>
              {(itemsPorVisita[v.id] ?? []).length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                  {(itemsPorVisita[v.id] ?? []).map(item => (
                    <span key={item.id} style={{ fontSize: 10, background: 'rgba(212,175,55,0.1)', color: T, padding: '2px 6px', borderRadius: 5 }}>
                      {item.producto} ×{item.cantidad}
                    </span>
                  ))}
                </div>
              )}
              {v.motivo_sin_venta && <p style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>{v.motivo_sin_venta}</p>}
            </div>
          ))}
        </div>
      )}

      {tab === 'ventas' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 280, overflowY: 'auto' }}>
          {ventasHist.slice(0, 30).map((v, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: 8 }}>
              <div>
                <p style={{ fontSize: 12, fontWeight: 700, color: '#F4EEDF' }}>{v.producto}</p>
                <p style={{ fontSize: 10, color: 'var(--muted)' }}>{v.fecha_pedido ? fmtFecha(v.fecha_pedido) : '—'}{v.litros ? ` · ${v.litros}L` : ''}</p>
              </div>
              <p style={{ fontSize: 12, fontWeight: 700, color: T }}>{v.total_sin_impuesto ? fmtPesoCompact(v.total_sin_impuesto) : '—'}</p>
            </div>
          ))}
          {ventasHist.length === 0 && <p style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', padding: '12px 0' }}>Sin ventas históricas registradas</p>}
        </div>
      )}
    </div>
  )
}

// ── Card de visita ─────────────────────────────────────────────
function VisitaCard({ visita, items, deudor, ventasHist, visitasCliente, itemsPorVisita, vendedorNombre }: {
  visita: Visita; items: Item[]; deudor: Deudor | undefined
  ventasHist: VentaHist[]; visitasCliente: Visita[]
  itemsPorVisita: Record<string, Item[]>; vendedorNombre: string
}) {
  const [open, setOpen] = useState(false)
  const [tabDetalle, setTabDetalle] = useState<'pedido' | 'cliente'>('pedido')

  const totalItems = items.reduce((s, i) => s + i.cantidad, 0)
  const fotos = [visita.foto_exterior, visita.foto_exhibicion, visita.foto_competencia].filter(Boolean) as string[]

  return (
    <div style={{ background: '#111', border: `1px solid ${visita.tiene_venta ? 'rgba(212,175,55,0.15)' : 'rgba(255,255,255,0.06)'}`, borderRadius: 14, overflow: 'hidden' }}>
      {/* Header — siempre visible */}
      <div onClick={() => setOpen(!open)} style={{ padding: '12px 14px', cursor: 'pointer' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 3 }}>
              <p style={{ fontSize: 14, fontWeight: 800, color: '#F4EEDF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>
                {visita.cliente_nombre}
              </p>
              {visita.es_cliente_nuevo && <span style={{ fontSize: 9, fontWeight: 700, color: '#F4EEDF', background: 'rgba(107,163,245,0.12)', padding: '2px 6px', borderRadius: 10, flexShrink: 0 }}>NUEVO</span>}
              <DeudaBadge deudor={deudor} />
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>{fmtHora(visita.iniciada_at)}{visita.completada_at ? ` → ${fmtHora(visita.completada_at)}` : ''}</span>
              {vendedorNombre && <span style={{ fontSize: 11, color: 'var(--muted)' }}>· {vendedorNombre.split(' ')[0]}</span>}
              {items.length > 0 && <span style={{ fontSize: 11, color: T }}>· {totalItems} ud. / {items.length} productos</span>}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            {visita.tiene_venta ? (
              <div style={{ textAlign: 'right' }}>
                <p style={{ fontSize: 15, fontWeight: 900, color: T, letterSpacing: '-0.5px' }}>{visita.total_pedido ? fmtPeso(visita.total_pedido) : '—'}</p>
                <p style={{ fontSize: 9, color: 'var(--muted)', textTransform: 'uppercase' }}>Con venta</p>
              </div>
            ) : (
              <div style={{ textAlign: 'right' }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: '#B5543E' }}>Sin venta</p>
              </div>
            )}
            {open ? <ChevronUp size={14} color="var(--muted)" /> : <ChevronDown size={14} color="var(--muted)" />}
          </div>
        </div>
      </div>

      {/* Detalle expandible */}
      {open && (
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: '12px 14px' }}>

          {/* Tabs Pedido / Historial cliente */}
          <div style={{ display: 'flex', gap: 4, background: '#0A0A0A', borderRadius: 10, padding: 3, marginBottom: 12 }}>
            <button onClick={() => setTabDetalle('pedido')} style={{ flex: 1, padding: '7px 0', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 700, background: tabDetalle === 'pedido' ? T : 'transparent', color: tabDetalle === 'pedido' ? '#080808' : 'var(--muted)' }}>
              Pedido
            </button>
            <button onClick={() => setTabDetalle('cliente')} style={{ flex: 1, padding: '7px 0', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 700, background: tabDetalle === 'cliente' ? T : 'transparent', color: tabDetalle === 'cliente' ? '#080808' : 'var(--muted)' }}>
              Historial cliente
            </button>
          </div>

          {tabDetalle === 'pedido' && (
            <>
              {/* Deuda */}
              {deudor && deudor.saldo_total > 0 && <PanelDeuda deudor={deudor} />}

              {/* Items del pedido */}
              {items.length > 0 ? (
                <div style={{ marginBottom: 12 }}>
                  <p style={{ fontSize: 9, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 8 }}>
                    Detalle del pedido ({items.length} productos · {totalItems} unidades)
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {items.map(item => (
                      <div key={item.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: 9 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: 13, fontWeight: 700, color: '#F4EEDF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.producto}</p>
                          <p style={{ fontSize: 10, color: 'var(--muted)' }}>{item.categoria}{item.envase ? ` · ${item.envase}` : ''} · {fmtPeso(item.precio_unit)} c/u</p>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
                          <p style={{ fontSize: 14, fontWeight: 900, color: T }}>×{item.cantidad}</p>
                          <p style={{ fontSize: 11, color: 'var(--muted)' }}>{fmtPeso(item.subtotal)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  {visita.total_pedido && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 10px 0', borderTop: '1px solid rgba(255,255,255,0.06)', marginTop: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>Total pedido</span>
                      <span style={{ fontSize: 17, fontWeight: 900, color: T }}>{fmtPeso(visita.total_pedido)}</span>
                    </div>
                  )}
                </div>
              ) : visita.tiene_venta === false ? (
                <div style={{ marginBottom: 12, padding: '10px 12px', background: 'rgba(181,84,62,0.06)', borderRadius: 10, border: '1px solid rgba(181,84,62,0.15)' }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: '#B5543E', marginBottom: 3 }}>Sin venta</p>
                  {visita.motivo_sin_venta && <p style={{ fontSize: 12, color: '#F4EEDF' }}>{visita.motivo_sin_venta}</p>}
                </div>
              ) : null}

              {/* Observaciones */}
              {visita.observaciones && (
                <div style={{ marginBottom: 12, padding: '10px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: 10 }}>
                  <p style={{ fontSize: 9, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 4 }}>Observaciones</p>
                  <p style={{ fontSize: 12, color: '#F4EEDF' }}>{visita.observaciones}</p>
                </div>
              )}

              {/* Fotos */}
              {fotos.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <p style={{ fontSize: 9, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 6 }}>Fotos ({fotos.length})</p>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {[
                      { src: visita.foto_exterior,    label: 'Exterior' },
                      { src: visita.foto_exhibicion,  label: 'Exhibición' },
                      { src: visita.foto_competencia, label: 'Competencia' },
                    ].filter(f => f.src).map(f => (
                      <a key={f.label} href={f.src!} target="_blank" rel="noopener noreferrer" style={{ flexShrink: 0, textDecoration: 'none' }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={f.src!} alt={f.label} style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)' }} />
                        <p style={{ fontSize: 9, color: 'var(--muted)', textAlign: 'center', marginTop: 3 }}>{f.label}</p>
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* GPS */}
              {visita.lat && visita.lng && (
                <a href={`https://www.google.com/maps?q=${visita.lat},${visita.lng}`} target="_blank" rel="noopener noreferrer"
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', background: 'rgba(66,133,244,0.08)', border: '1px solid rgba(66,133,244,0.2)', borderRadius: 9, textDecoration: 'none', color: '#F4EEDF', fontSize: 12, fontWeight: 600 }}>
                  <MapPin size={13} />
                  {visita.direccion_gps ?? 'Ver ubicación en Google Maps'}
                </a>
              )}
            </>
          )}

          {tabDetalle === 'cliente' && (
            <PanelHistorialCliente
              clienteNombre={visita.cliente_nombre}
              ventasHist={ventasHist}
              visitasCliente={visitasCliente}
              itemsPorVisita={itemsPorVisita}
            />
          )}
        </div>
      )}
    </div>
  )
}

// ── Componentes auxiliares ─────────────────────────────────────
function FiltroChip({ label, active, onClick, color }: { label: string; active: boolean; onClick: () => void; color?: string }) {
  const c = color ?? T
  return (
    <button onClick={onClick} style={{
      padding: '5px 12px', borderRadius: 20, border: `1px solid ${active ? c : 'rgba(255,255,255,0.1)'}`,
      background: active ? `rgba(${c === T ? '212,175,55' : c === '#B5543E' ? '181,84,62' : '212,175,55'},0.12)` : 'transparent',
      color: active ? c : 'var(--muted)', fontSize: 12, fontWeight: 600, cursor: 'pointer',
    }}>
      {label}
    </button>
  )
}

// ── Main ───────────────────────────────────────────────────────
export default function HistorialClient({ user, visitas, items, vendedores, deudores, ventasHist }: Props) {
  const isDesktop = useIsDesktop()
  const [filtroVendedor, setFiltroVendedor]     = useState('todos')
  const [filtroResultado, setFiltroResultado]   = useState<'todos' | 'con_venta' | 'sin_venta'>('todos')
  const [showFiltros, setShowFiltros]           = useState(false)

  // Mapas para lookup rápido
  const deudorMap  = useMemo(() => Object.fromEntries(deudores.map(d => [d.nombre_fantasia, d])), [deudores])
  const vendedorMap = useMemo(() => Object.fromEntries(vendedores.map(v => [v.id, v.nombre])), [vendedores])
  const itemsByVisita = useMemo(() => {
    const m: Record<string, Item[]> = {}
    for (const item of items) {
      if (!m[item.visita_id]) m[item.visita_id] = []
      m[item.visita_id].push(item)
    }
    return m
  }, [items])
  const visitasByCliente = useMemo(() => {
    const m: Record<string, Visita[]> = {}
    for (const v of visitas) {
      if (!m[v.cliente_nombre]) m[v.cliente_nombre] = []
      m[v.cliente_nombre].push(v)
    }
    return m
  }, [visitas])
  const ventasByCliente = useMemo(() => {
    const m: Record<string, VentaHist[]> = {}
    for (const v of ventasHist) {
      if (!m[v.nombre_fantasia]) m[v.nombre_fantasia] = []
      m[v.nombre_fantasia].push(v)
    }
    return m
  }, [ventasHist])

  const filtradas = useMemo(() => visitas.filter(v => {
    if (filtroVendedor !== 'todos' && v.vendedor_id !== filtroVendedor) return false
    if (filtroResultado === 'con_venta'  && v.tiene_venta !== true)  return false
    if (filtroResultado === 'sin_venta'  && v.tiene_venta !== false) return false
    return true
  }), [visitas, filtroVendedor, filtroResultado])

  const grupos = useMemo(() => agruparPorFecha(filtradas), [filtradas])
  const hayFiltros = filtroVendedor !== 'todos' || filtroResultado !== 'todos'

  const kpis = useMemo(() => ({
    total:          filtradas.length,
    conVenta:       filtradas.filter(v => v.tiene_venta === true).length,
    sinVenta:       filtradas.filter(v => v.tiene_venta === false).length,
    totalFacturado: filtradas.reduce((s, v) => s + (v.total_pedido ?? 0), 0),
    totalUnidades:  items.filter(i => filtradas.some(v => v.id === i.visita_id)).reduce((s, i) => s + i.cantidad, 0),
  }), [filtradas, items])

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', paddingBottom: 80 }}>
      {/* Header */}
      <div style={{ padding: isDesktop ? '28px 28px 16px' : '16px 16px 14px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <p style={{ fontSize: 11, fontWeight: 500, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.4px', marginBottom: 6 }}>Ventas en terreno</p>
          <h1 style={{ fontSize: isDesktop ? 'var(--fs-title)' : 26, fontWeight: 900, color: '#F4EEDF', letterSpacing: '-1px', lineHeight: 1.1 }}>Historial</h1>
        </div>
        <button onClick={() => setShowFiltros(f => !f)} style={{ background: hayFiltros ? T_DIM : 'transparent', border: `1px solid ${hayFiltros ? T_BORDER : 'rgba(255,255,255,0.1)'}`, borderRadius: 8, padding: '6px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, color: hayFiltros ? T : 'var(--muted)' }}>
          <Filter size={14} /><span style={{ fontSize: 12, fontWeight: 600 }}>Filtros{hayFiltros ? ' •' : ''}</span>
        </button>
      </div>

      {/* Filtros */}
      {showFiltros && (
        <div style={{ background: 'var(--surface2)', borderBottom: '1px solid rgba(255,255,255,0.06)', padding: isDesktop ? '14px 28px' : '12px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {user.isAdmin && (
            <div>
              <p style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 6 }}>Vendedor</p>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <FiltroChip label="Todos" active={filtroVendedor === 'todos'} onClick={() => setFiltroVendedor('todos')} />
                {vendedores.map(v => <FiltroChip key={v.id} label={v.nombre.split(' ')[0]} active={filtroVendedor === v.id} onClick={() => setFiltroVendedor(v.id)} />)}
              </div>
            </div>
          )}
          <div>
            <p style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 6 }}>Resultado</p>
            <div style={{ display: 'flex', gap: 6 }}>
              <FiltroChip label="Todos"     active={filtroResultado === 'todos'}     onClick={() => setFiltroResultado('todos')} />
              <FiltroChip label="Con venta" active={filtroResultado === 'con_venta'} onClick={() => setFiltroResultado('con_venta')} color={T} />
              <FiltroChip label="Sin venta" active={filtroResultado === 'sin_venta'} onClick={() => setFiltroResultado('sin_venta')} color="#B5543E" />
            </div>
          </div>
        </div>
      )}

      <div style={{ padding: isDesktop ? '20px 28px' : '14px', maxWidth: 780 }}>
        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: isDesktop ? 'repeat(5,1fr)' : 'repeat(3,1fr)', gap: 8, marginBottom: 20 }}>
          {[
            { label: 'Visitas',     val: kpis.total,           color: '#F4EEDF' },
            { label: 'Con venta',   val: kpis.conVenta,        color: T },
            { label: 'Sin venta',   val: kpis.sinVenta,        color: '#B5543E' },
            { label: 'Facturado',   val: kpis.totalFacturado > 0 ? fmtPesoCompact(kpis.totalFacturado) : '—', color: T },
            { label: 'Unidades',    val: kpis.totalUnidades,   color: '#F4EEDF' },
          ].map(k => (
            <div key={k.label} style={{ background: '#101010', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, padding: '12px 8px', textAlign: 'center' }}>
              <p style={{ fontSize: 20, fontWeight: 900, color: k.color, letterSpacing: '-0.5px' }}>{k.val}</p>
              <p style={{ fontSize: 9, color: 'var(--muted)', marginTop: 3, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.6px' }}>{k.label}</p>
            </div>
          ))}
        </div>

        {/* Lista por fecha */}
        {grupos.length === 0 ? (
          <div style={{ textAlign: 'center', paddingTop: 48 }}>
            <Package size={40} color="var(--muted)" style={{ margin: '0 auto 12px', display: 'block', opacity: 0.4 }} />
            <p style={{ fontSize: 14, color: 'var(--muted)' }}>Sin visitas registradas</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {grupos.map(([fecha, grupo]) => (
              <div key={fecha}>
                <p style={{ fontSize: 11, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 8 }}>
                  {labelFecha(fecha + 'T12:00:00')} — {grupo.length} visita{grupo.length !== 1 ? 's' : ''}
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {grupo.map(v => (
                    <VisitaCard
                      key={v.id}
                      visita={v}
                      items={itemsByVisita[v.id] ?? []}
                      deudor={deudorMap[v.cliente_nombre]}
                      ventasHist={ventasByCliente[v.cliente_nombre] ?? []}
                      visitasCliente={visitasByCliente[v.cliente_nombre] ?? []}
                      itemsPorVisita={itemsByVisita}
                      vendedorNombre={vendedorMap[v.vendedor_id] ?? ''}
                    />
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
