'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { MapPin, CheckCircle, XCircle, Filter, ChevronDown, ChevronUp, ChevronLeft, Package, TrendingUp, AlertTriangle, Clock, Camera, Trash2 } from 'lucide-react'
import type { AppUser } from '@/lib/auth'
import { useIsDesktop } from '@/lib/useIsDesktop'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { SLOTS_FOTO, fotosCompletas } from '@/lib/fotosVisita'

const T        = '#0F172A'   // acento del tema claro (antes dorado)
const T_DIM    = '#EFF6FF'
const T_BORDER = '#E2E8F0'

// ── Types ─────────────────────────────────────────────────────────────────────
interface Visita {
  id: string; cliente_nombre: string; tiene_venta: boolean | null
  motivo_sin_venta: string | null; total_pedido: number | null
  estado: string; iniciada_at: string; completada_at: string | null
  vendedor_id: string; es_cliente_nuevo: boolean
  observaciones: string | null; direccion_gps: string | null
  lat: number | null; lng: number | null
  foto_exterior: string | null; foto_interior: string | null
  foto_exhibicion: string | null; foto_competencia: string | null
  fotos_status: 'PENDIENTE' | 'COMPLETO'
}
interface Item { id: string; visita_id: string; producto: string; categoria: string; envase: string; cantidad: number; precio_unit: number; subtotal: number }
interface Deudor {
  nombre_fantasia: string; saldo_total: number; deuda_vencida: number
  ultimo_pago: string | null; fecha_ultima_compra: string | null; limite_cta_cte: number | null
  /** Tramos de antigüedad de la deuda — opcionales: no todas las consultas los traen. */
  deuda_menor_14_dias?: number | null
  deuda_entre_15_29_dias?: number | null
  deuda_entre_30_44_dias?: number | null
  deuda_entre_45_59_dias?: number | null
  deuda_entre_60_89_dias?: number | null
  deuda_mas_90_dias?: number | null
}
interface VentaHist { nombre_fantasia: string; producto: string; litros: number | null; total_sin_impuesto: number | null; fecha_pedido: string | null }
interface Props {
  user: AppUser; visitas: Visita[]; items: Item[]
  vendedores: { id: string; nombre: string }[]
  deudores: Deudor[]; ventasHist: VentaHist[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtFecha  = (iso: string) => new Date(iso).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })
const fmtHora   = (iso: string) => new Date(iso).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
const fmtPeso   = (n: number) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)
const fmtCompact = (n: number) => new Intl.NumberFormat('es-CL', { notation: 'compact', style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)

function labelFecha(iso: string) {
  const hoy  = new Date().toISOString().split('T')[0]
  const ayer = new Date(Date.now() - 86400000).toISOString().split('T')[0]
  const d    = iso.split('T')[0]
  if (d === hoy)  return 'Hoy'
  if (d === ayer) return 'Ayer'
  return new Date(iso + 'T12:00:00').toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })
}

function agruparPorFecha(visitas: Visita[]) {
  const g: Record<string, Visita[]> = {}
  for (const v of visitas) {
    const d = v.iniciada_at.split('T')[0]
    if (!g[d]) g[d] = []
    g[d].push(v)
  }
  return Object.entries(g).sort((a, b) => b[0].localeCompare(a[0]))
}

function iniciales(nombre: string) {
  return nombre.split(' ').slice(0, 2).map(n => n[0]?.toUpperCase() ?? '').join('')
}

// ── Status Badge premium ──────────────────────────────────────────────────────
function StatusBadge({ tieneVenta, montoTotal, deudor, cancelada }: { tieneVenta: boolean | null; montoTotal?: number | null; deudor: Deudor | undefined; cancelada?: boolean }) {
  if (cancelada) {
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        fontSize: 10, fontWeight: 700, letterSpacing: '0.2px',
        color: '#64748B', background: '#F1F5F9',
        border: '1px solid #E2E8F0',
        padding: '3px 8px', borderRadius: 20,
      }}>
        <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#64748B', flexShrink: 0 }} />
        Cancelada
      </span>
    )
  }
  // "Con venta" solo si de verdad hay un monto registrado — una visita
  // marcada tiene_venta=true pero sin monto (dato viejo, antes del boton
  // "Sin venta" dedicado) no es una venta real, así que se muestra como
  // "Visita" neutro en vez del verde engañoso.
  if (tieneVenta === true && montoTotal && montoTotal > 0) {
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        fontSize: 10, fontWeight: 700, letterSpacing: '0.2px',
        color: '#059669', background: '#ECFDF5',
        border: '1px solid #ECFDF5',
        padding: '3px 8px', borderRadius: 20,
      }}>
        <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#059669', flexShrink: 0 }} />
        Con venta
      </span>
    )
  }
  if (tieneVenta === true) {
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        fontSize: 10, fontWeight: 700, letterSpacing: '0.2px',
        color: '#0F172A', background: '#F1F5F9',
        border: '1px solid #E2E8F0',
        padding: '3px 8px', borderRadius: 20,
      }}>
        <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#0F172A', flexShrink: 0 }} />
        Visita
      </span>
    )
  }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: 10, fontWeight: 700, letterSpacing: '0.2px',
      color: '#DC2626', background: '#FEF2F2',
      border: '1px solid #FEF2F2',
      padding: '3px 8px', borderRadius: 20,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#DC2626', flexShrink: 0 }} />
      Sin venta
    </span>
  )
}

function DeudaBadge({ deudor }: { deudor: Deudor | undefined }) {
  if (!deudor || deudor.saldo_total <= 0) return (
    <span style={{ fontSize: 9, fontWeight: 700, color: '#059669', background: '#ECFDF5', border: '1px solid #ECFDF5', padding: '2px 7px', borderRadius: 20 }}>Al día</span>
  )
  if (deudor.deuda_vencida > 0) return (
    <span style={{ fontSize: 9, fontWeight: 700, color: '#92400E', background: '#FFFBEB', border: '1px solid #FFFBEB', padding: '2px 7px', borderRadius: 20 }}>
      ⚠ {fmtCompact(deudor.deuda_vencida)}
    </span>
  )
  return (
    <span style={{ fontSize: 9, fontWeight: 700, color: T, background: T_DIM, border: `1px solid ${T_BORDER}`, padding: '2px 7px', borderRadius: 20 }}>
      {fmtCompact(deudor.saldo_total)}
    </span>
  )
}

// ── Panel deuda ───────────────────────────────────────────────────────────────
function PanelDeuda({ deudor }: { deudor: Deudor }) {
  const esVencida = deudor.deuda_vencida > 0
  const color = esVencida ? '#92400E' : deudor.saldo_total > 0 ? T : '#059669'
  const rgb   = esVencida ? '220,38,38' : deudor.saldo_total > 0 ? '217,119,6' : '5,150,105'
  const tramos = [
    { label: '< 14 días',  val: deudor.deuda_menor_14_dias       ?? 0 },
    { label: '15–29 días', val: deudor.deuda_entre_15_29_dias    ?? 0 },
    { label: '30–44 días', val: deudor.deuda_entre_30_44_dias    ?? 0 },
    { label: '45–59 días', val: deudor.deuda_entre_45_59_dias    ?? 0 },
    { label: '60–89 días', val: deudor.deuda_entre_60_89_dias    ?? 0 },
    { label: '≥ 90 días',  val: deudor.deuda_mas_90_dias         ?? 0 },
  ].filter(t => t.val > 0)

  return (
    <div style={{ background: `rgba(${rgb},0.05)`, border: `1px solid rgba(${rgb},0.18)`, borderRadius: 14, padding: '14px 16px', marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 12 }}>
        <div style={{ width: 22, height: 22, borderRadius: 6, background: `rgba(${rgb},0.15)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <AlertTriangle size={12} color={color} />
        </div>
        <p style={{ fontSize: 10, fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '1px' }}>Estado de cuenta</p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: tramos.length ? 12 : 0 }}>
        <div>
          <p style={{ fontSize: 9, color: '#64748B', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 4 }}>Saldo total</p>
          <p style={{ fontSize: 18, fontWeight: 900, color, letterSpacing: '-0.5px' }}>{fmtPeso(deudor.saldo_total)}</p>
        </div>
        <div>
          <p style={{ fontSize: 9, color: '#64748B', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 4 }}>Deuda vencida</p>
          <p style={{ fontSize: 18, fontWeight: 900, color: deudor.deuda_vencida > 0 ? '#92400E' : '#059669', letterSpacing: '-0.5px' }}>
            {deudor.deuda_vencida > 0 ? fmtPeso(deudor.deuda_vencida) : 'Sin vencer'}
          </p>
        </div>
        {deudor.ultimo_pago && (
          <div>
            <p style={{ fontSize: 9, color: '#64748B', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 4 }}>Último pago</p>
            <p style={{ fontSize: 12, fontWeight: 700, color: '#0F172A' }}>{fmtFecha(deudor.ultimo_pago)}</p>
          </div>
        )}
        {deudor.limite_cta_cte && deudor.limite_cta_cte > 0 && (
          <div>
            <p style={{ fontSize: 9, color: '#64748B', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 4 }}>Límite</p>
            <p style={{ fontSize: 12, fontWeight: 700, color: '#0F172A' }}>{fmtPeso(deudor.limite_cta_cte)}</p>
          </div>
        )}
      </div>
      {tramos.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <p style={{ fontSize: 9, color: '#64748B', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 2 }}>Antigüedad de deuda</p>
          {tramos.map(t => (
            <div key={t.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0' }}>
              <span style={{ fontSize: 11, color: '#64748B' }}>{t.label}</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#0F172A' }}>{fmtPeso(t.val)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Panel historial cliente ───────────────────────────────────────────────────
function PanelHistorialCliente({ clienteNombre, ventasHist, visitasCliente, itemsPorVisita }: {
  clienteNombre: string; ventasHist: VentaHist[]
  visitasCliente: Visita[]; itemsPorVisita: Record<string, Item[]>
}) {
  const [tab, setTab] = useState<'visitas' | 'ventas'>('visitas')
  const totalVisitas         = visitasCliente.length
  const totalFacturadoVisitas = visitasCliente.reduce((s, v) => s + (v.total_pedido ?? 0), 0)
  const totalFacturadoVentas  = ventasHist.reduce((s, v) => s + (v.total_sin_impuesto ?? 0), 0)
  const topProductos: Record<string, number> = {}
  for (const v of visitasCliente) {
    for (const item of (itemsPorVisita[v.id] ?? [])) {
      topProductos[item.producto] = (topProductos[item.producto] ?? 0) + item.cantidad
    }
  }
  const topSorted = Object.entries(topProductos).sort((a, b) => b[1] - a[1]).slice(0, 5)

  return (
    <div style={{ marginTop: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
        <TrendingUp size={13} color={T} />
        <p style={{ fontSize: 10, fontWeight: 700, color: T, textTransform: 'uppercase', letterSpacing: '1px' }}>Historial del cliente</p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 14 }}>
        {[
          { label: 'Visitas', val: totalVisitas },
          { label: 'Facturado', val: totalFacturadoVisitas > 0 ? fmtCompact(totalFacturadoVisitas) : '—' },
          { label: 'Historial', val: totalFacturadoVentas > 0 ? fmtCompact(totalFacturadoVentas) : '—' },
        ].map(s => (
          <div key={s.label} style={{ background: '#F1F5F9', border: '1px solid #F1F5F9', borderRadius: 12, padding: '10px 8px', textAlign: 'center' }}>
            <p style={{ fontSize: 15, fontWeight: 900, color: T, letterSpacing: '-0.3px' }}>{s.val}</p>
            <p style={{ fontSize: 9, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: 3 }}>{s.label}</p>
          </div>
        ))}
      </div>
      {topSorted.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <p style={{ fontSize: 9, color: '#64748B', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 8 }}>Top productos</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {topSorted.map(([prod, cant]) => (
              <div key={prod} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', background: '#F1F5F9', borderRadius: 8 }}>
                <span style={{ fontSize: 12, color: '#0F172A' }}>{prod}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: T }}>{cant} ud.</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <div style={{ display: 'flex', gap: 3, background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 3, marginBottom: 12 }}>
        {(['visitas', 'ventas'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ flex: 1, padding: '8px 0', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 700, background: tab === t ? T : 'transparent', color: tab === t ? '#FFFFFF' : '#94A3B8', transition: 'all 0.15s' }}>
            {t === 'visitas' ? `Visitas (${totalVisitas})` : `Ventas (${ventasHist.length})`}
          </button>
        ))}
      </div>
      {tab === 'visitas' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 260, overflowY: 'auto' }}>
          {visitasCliente.slice(0, 20).map(v => (
            <div key={v.id} style={{ background: '#F1F5F9', borderRadius: 10, padding: '9px 12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#0F172A' }}>{fmtFecha(v.iniciada_at)}</span>
                <span style={{ fontSize: 11, fontWeight: 800, color: v.tiene_venta ? T : '#DC2626' }}>{v.tiene_venta ? fmtPeso(v.total_pedido ?? 0) : 'Sin venta'}</span>
              </div>
              {(itemsPorVisita[v.id] ?? []).length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {(itemsPorVisita[v.id] ?? []).map(item => (
                    <span key={item.id} style={{ fontSize: 9, background: T_DIM, color: T, padding: '2px 6px', borderRadius: 5, border: `1px solid ${T_BORDER}` }}>
                      {item.producto} ×{item.cantidad}
                    </span>
                  ))}
                </div>
              )}
              {v.motivo_sin_venta && <p style={{ fontSize: 10, color: '#64748B', marginTop: 3 }}>{v.motivo_sin_venta}</p>}
            </div>
          ))}
        </div>
      )}
      {tab === 'ventas' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 260, overflowY: 'auto' }}>
          {ventasHist.length === 0 && <p style={{ fontSize: 12, color: '#64748B', textAlign: 'center', padding: '12px 0' }}>Sin ventas históricas</p>}
          {ventasHist.slice(0, 30).map((v, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 10px', background: '#F1F5F9', borderRadius: 9 }}>
              <div>
                <p style={{ fontSize: 12, fontWeight: 700, color: '#0F172A' }}>{v.producto}</p>
                <p style={{ fontSize: 10, color: '#64748B' }}>{v.fecha_pedido ? fmtFecha(v.fecha_pedido) : '—'}{v.litros ? ` · ${v.litros}L` : ''}</p>
              </div>
              <p style={{ fontSize: 12, fontWeight: 700, color: T }}>{v.total_sin_impuesto ? fmtCompact(v.total_sin_impuesto) : '—'}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Lightbox fotos ────────────────────────────────────────────────────────────
interface FotoEntry { src: string; label: string }

function FotoLightbox({ fotos, startIdx, onClose }: { fotos: FotoEntry[]; startIdx: number; onClose: () => void }) {
  const [idx, setIdx] = useState(startIdx)
  const prev = () => setIdx(i => (i - 1 + fotos.length) % fotos.length)
  const next = () => setIdx(i => (i + 1) % fotos.length)
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])
  const foto = fotos[idx]
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.96)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <button onClick={onClose} style={{ position: 'absolute', top: 'max(16px,env(safe-area-inset-top,16px))', right: 16, width: 36, height: 36, borderRadius: '50%', background: '#E2E8F0', border: '1px solid #E2E8F0', color: '#fff', fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
      <div style={{ position: 'absolute', top: 'max(16px,env(safe-area-inset-top,16px))', left: 16, fontSize: 11, fontWeight: 700, color: '#64748B', background: 'rgba(0,0,0,0.5)', padding: '4px 10px', borderRadius: 20 }}>{idx + 1} / {fotos.length}</div>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 520, padding: '0 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={foto.src} alt={foto.label} style={{ width: '100%', maxHeight: '70vh', objectFit: 'contain', borderRadius: 14, border: '1px solid #E2E8F0' }} />
        <p style={{ fontSize: 13, fontWeight: 600, color: '#0F172A' }}>{foto.label}</p>
        {fotos.length > 1 && (
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={prev} style={{ padding: '10px 24px', borderRadius: 10, border: '1px solid #E2E8F0', background: '#F1F5F9', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>← Anterior</button>
            <button onClick={next} style={{ padding: '10px 24px', borderRadius: 10, border: '1px solid #E2E8F0', background: '#F1F5F9', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Siguiente →</button>
          </div>
        )}
        {fotos.length > 1 && (
          <div style={{ display: 'flex', gap: 6 }}>
            {fotos.map((_, i) => (
              <div key={i} onClick={() => setIdx(i)} style={{ width: i === idx ? 20 : 6, height: 6, borderRadius: 3, cursor: 'pointer', background: i === idx ? T : '#94A3B8', transition: 'all 0.2s' }} />
            ))}
          </div>
        )}
      </div>
      {fotos.length > 1 && (
        <div onClick={e => e.stopPropagation()} style={{ position: 'absolute', bottom: 'max(24px,env(safe-area-inset-bottom,24px))', display: 'flex', gap: 8 }}>
          {fotos.map((f, i) => (
            <div key={f.label} onClick={() => setIdx(i)} style={{ width: 52, height: 52, borderRadius: 8, overflow: 'hidden', cursor: 'pointer', border: `2px solid ${i === idx ? T : '#E2E8F0'}`, transition: 'border-color 0.2s' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={f.src} alt={f.label} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── VisitaCard premium ────────────────────────────────────────────────────────
function VisitaCard({ visita, items, deudor, ventasHist, visitasCliente, itemsPorVisita, vendedorNombre, isAdmin, currentUserId, onEliminar, onFotoActualizada }: {
  visita: Visita; items: Item[]; deudor: Deudor | undefined
  ventasHist: VentaHist[]; visitasCliente: Visita[]
  itemsPorVisita: Record<string, Item[]>; vendedorNombre: string
  isAdmin: boolean; currentUserId: string; onEliminar: (id: string) => void
  onFotoActualizada: (visitaId: string, campo: string, url: string, completo: boolean) => void
}) {
  const [open, setOpen]             = useState(false)
  const [tabDetalle, setTabDetalle] = useState<'pedido' | 'cliente'>('pedido')
  const [lightbox, setLightbox]     = useState<{ idx: number } | null>(null)
  const [borrando, setBorrando]     = useState(false)
  const [subiendo, setSubiendo]     = useState<Record<string, boolean>>({})
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({})

  // No confiar solo en fotos_status (columna resumen que puede quedar
  // desactualizada) — se recalcula directo contra las 4 columnas reales.
  const puedeAdjuntarFotos = !fotosCompletas(visita) && (isAdmin || visita.vendedor_id === currentUserId)

  async function adjuntarFotoTardia(campo: string, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setSubiendo(prev => ({ ...prev, [campo]: true }))
    try {
      const supabase = createClient()
      const path = `${visita.id}/${campo}.jpg`
      const { error: upErr } = await supabase.storage.from('terreno-fotos').upload(path, file, { upsert: true })
      if (upErr) throw upErr
      const { data: pub } = supabase.storage.from('terreno-fotos').getPublicUrl(path)
      // Completo solo si, CON esta foto recién subida, las 4 columnas quedan
      // llenas — antes se marcaba COMPLETO con solo subir una, aunque
      // faltaran las demás (bug: silenciaba los recordatorios de las otras).
      const completo = fotosCompletas({ ...visita, [campo]: pub.publicUrl })
      const { error: updErr } = await supabase.from('visitas_terreno')
        .update({ [campo]: pub.publicUrl, fotos_status: completo ? 'COMPLETO' : 'PENDIENTE' })
        .eq('id', visita.id)
      if (updErr) throw updErr
      onFotoActualizada(visita.id, campo, pub.publicUrl, completo)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'No se pudo subir la foto')
    } finally {
      setSubiendo(prev => ({ ...prev, [campo]: false }))
    }
  }

  async function eliminar(e: React.MouseEvent) {
    e.stopPropagation()
    if (!window.confirm(`¿Eliminar del historial la visita a "${visita.cliente_nombre}"? Esta acción no se puede deshacer.`)) return
    setBorrando(true)
    try {
      const res = await fetch(`/api/terreno/visitas/${visita.id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'No se pudo eliminar')
      onEliminar(visita.id)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'No se pudo eliminar la visita')
      setBorrando(false)
    }
  }

  const totalItems = items.reduce((s, i) => s + i.cantidad, 0)
  const fotoEntries: FotoEntry[] = [
    { src: visita.foto_exterior    ?? '', label: 'Frontis'     },
    { src: visita.foto_interior    ?? '', label: 'Interior'    },
    { src: visita.foto_exhibicion  ?? '', label: 'Exhibición'  },
    { src: visita.foto_competencia ?? '', label: 'Competencia' },
  ].filter(f => f.src)

  const tieneVenta     = visita.tiene_venta === true
  const borderColor    = '#E2E8F0'
  const bgCard         = '#FFFFFF'
  const accentLeft     = tieneVenta ? T : 'transparent'

  return (
    <>
      {lightbox && <FotoLightbox fotos={fotoEntries} startIdx={lightbox.idx} onClose={() => setLightbox(null)} />}

      <div style={{
        background: bgCard,
        border: `1px solid ${borderColor}`,
        borderRadius: 20,
        overflow: 'hidden',
        transition: 'all 0.2s',
        borderLeft: `3px solid ${accentLeft}`,
      }}>
        {/* ── Header ── */}
        <div onClick={() => setOpen(!open)} style={{ padding: '16px 18px', cursor: 'pointer' }}>

          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            {/* Avatar inicial */}
            <div style={{
              width: 44, height: 44, borderRadius: 14, flexShrink: 0,
              background: tieneVenta ? '#E2E8F0' : '#F1F5F9',
              border: `1px solid ${tieneVenta ? '#CBD5E1' : '#E2E8F0'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{ fontSize: 14, fontWeight: 900, color: tieneVenta ? T : '#64748B', letterSpacing: '-0.5px' }}>
                {iniciales(visita.cliente_nombre)}
              </span>
            </div>

            {/* Contenido central */}
            <div style={{ flex: 1, minWidth: 0 }}>
              {/* Nombre + badges */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 5 }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', letterSpacing: '-0.2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>
                  {visita.cliente_nombre}
                </span>
                {visita.es_cliente_nuevo && (
                  <span style={{ fontSize: 8, fontWeight: 800, color: '#2563EB', background: '#EFF6FF', border: '1px solid #EFF6FF', padding: '2px 6px', borderRadius: 10, flexShrink: 0, letterSpacing: '0.5px', textTransform: 'uppercase' }}>NUEVO</span>
                )}
                <DeudaBadge deudor={deudor} />
                {!fotosCompletas(visita) && (
                  <span style={{ fontSize: 8, fontWeight: 800, color: '#92400E', background: '#FFFBEB', border: '1px solid #FDE68A', padding: '2px 6px', borderRadius: 10, flexShrink: 0, letterSpacing: '0.5px', textTransform: 'uppercase' }}>Fotos pendientes</span>
                )}
              </div>
              {/* Meta secundaria */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, color: '#64748B', display: 'flex', alignItems: 'center', gap: 3 }}>
                  <Clock size={10} />
                  {fmtHora(visita.iniciada_at)}
                  {visita.completada_at ? ` → ${fmtHora(visita.completada_at)}` : ''}
                </span>
                {vendedorNombre && (
                  <span style={{ fontSize: 11, color: '#64748B' }}>· {vendedorNombre.split(' ')[0]}</span>
                )}
                {fotoEntries.length > 0 && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, color: '#64748B' }}>
                    <Camera size={9} /> {fotoEntries.length}
                  </span>
                )}
              </div>
            </div>

            {/* Derecha: monto + badge + chevron */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
              <div style={{ textAlign: 'right' }}>
                {tieneVenta && visita.total_pedido ? (
                  <>
                    <p style={{ fontSize: 17, fontWeight: 900, color: T, letterSpacing: '-0.6px', lineHeight: 1.1, marginBottom: 4 }}>
                      {fmtPeso(visita.total_pedido)}
                    </p>
                    <StatusBadge tieneVenta={true} montoTotal={visita.total_pedido} deudor={deudor} />
                  </>
                ) : tieneVenta ? (
                  <StatusBadge tieneVenta={true} montoTotal={visita.total_pedido} deudor={deudor} />
                ) : (
                  <StatusBadge tieneVenta={false} deudor={deudor} cancelada={visita.estado === 'cancelada'} />
                )}
              </div>
              {isAdmin && (
                <button
                  onClick={eliminar}
                  disabled={borrando}
                  title="Eliminar del historial"
                  style={{
                    width: 28, height: 28, borderRadius: 9, flexShrink: 0,
                    background: '#FEF2F2', border: '1px solid #FEF2F2',
                    color: '#DC2626', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: borrando ? 'default' : 'pointer', opacity: borrando ? 0.4 : 1,
                  }}
                >
                  <Trash2 size={13} />
                </button>
              )}

              <div style={{ color: '#64748B', transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'none' }}>
                <ChevronDown size={16} />
              </div>
            </div>
          </div>

          {/* Footer de la card: items resumen */}
          {items.length > 0 && (
            <div style={{ marginTop: 12, marginLeft: 58, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 10, color: '#64748B' }}>
                {totalItems} ud. · {items.length} producto{items.length !== 1 ? 's' : ''}
              </span>
              {items.slice(0, 3).map(item => (
                <span key={item.id} style={{ fontSize: 9, background: T_DIM, color: T, border: `1px solid ${T_BORDER}`, padding: '2px 6px', borderRadius: 6, fontWeight: 600 }}>
                  {item.producto.split(' ')[0]}
                </span>
              ))}
              {items.length > 3 && (
                <span style={{ fontSize: 9, color: '#64748B' }}>+{items.length - 3}</span>
              )}
            </div>
          )}
        </div>

        {/* ── Detalle expandible ── */}
        {open && (
          <div style={{ borderTop: '1px solid #F1F5F9', padding: '14px 18px' }}>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 3, background: 'rgba(0,0,0,0.35)', borderRadius: 12, padding: 3, marginBottom: 14 }}>
              {([['pedido', 'Pedido'], ['cliente', 'Historial cliente']] as const).map(([key, label]) => (
                <button key={key} onClick={() => setTabDetalle(key)} style={{
                  flex: 1, padding: '8px 0', borderRadius: 10, border: 'none', cursor: 'pointer',
                  fontSize: 11, fontWeight: 700,
                  background: tabDetalle === key ? T : 'transparent',
                  color: tabDetalle === key ? '#FFFFFF' : '#94A3B8',
                  transition: 'all 0.15s',
                }}>
                  {label}
                </button>
              ))}
            </div>

            {tabDetalle === 'pedido' && (
              <>
                {deudor && deudor.saldo_total > 0 && <PanelDeuda deudor={deudor} />}

                {/* Items pedido */}
                {items.length > 0 ? (
                  <div style={{ marginBottom: 12 }}>
                    <p style={{ fontSize: 9, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 10 }}>
                      Detalle · {items.length} productos · {totalItems} unidades
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      {items.map(item => (
                        <div key={item.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: '#F1F5F9', border: '1px solid #F1F5F9', borderRadius: 12 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 2 }}>{item.producto}</p>
                            <p style={{ fontSize: 10, color: '#64748B' }}>{item.categoria}{item.envase ? ` · ${item.envase}` : ''} · {fmtPeso(item.precio_unit)} c/u</p>
                          </div>
                          <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 14 }}>
                            <p style={{ fontSize: 14, fontWeight: 900, color: T, letterSpacing: '-0.3px' }}>×{item.cantidad}</p>
                            <p style={{ fontSize: 11, color: '#64748B' }}>{fmtPeso(item.subtotal)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                    {visita.total_pedido && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 12px 0', marginTop: 8, borderTop: '1px solid #F1F5F9' }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total pedido</span>
                        <span style={{ fontSize: 18, fontWeight: 900, color: T, letterSpacing: '-0.5px' }}>{fmtPeso(visita.total_pedido)}</span>
                      </div>
                    )}
                  </div>
                ) : visita.tiene_venta === false ? (
                  <div style={{ marginBottom: 12, padding: '12px 14px', background: '#FEF2F2', borderRadius: 12, border: '1px solid #FEF2F2' }}>
                    <p style={{ fontSize: 11, fontWeight: 700, color: '#DC2626', marginBottom: 4 }}>Sin venta</p>
                    {visita.motivo_sin_venta && <p style={{ fontSize: 12, color: '#0F172A' }}>{visita.motivo_sin_venta}</p>}
                  </div>
                ) : null}

                {/* Observaciones */}
                {visita.observaciones && (
                  <div style={{ marginBottom: 12, padding: '12px 14px', background: '#F1F5F9', borderRadius: 12, border: '1px solid #F1F5F9' }}>
                    <p style={{ fontSize: 9, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 5 }}>Observaciones</p>
                    <p style={{ fontSize: 12, color: '#0F172A', lineHeight: 1.5 }}>{visita.observaciones}</p>
                  </div>
                )}

                {/* Fotos */}
                {fotoEntries.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <p style={{ fontSize: 9, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 10 }}>
                      Fotos del local
                    </p>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(64px, 1fr))', gap: 8 }}>
                      {fotoEntries.map((f, i) => (
                        <button key={f.label} onClick={() => setLightbox({ idx: i })} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
                          <div style={{ borderRadius: 12, overflow: 'hidden', border: `1px solid ${T_BORDER}`, aspectRatio: '1', position: 'relative' }}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={f.src} alt={f.label} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          </div>
                          <p style={{ fontSize: 9, color: '#64748B', textAlign: 'center', marginTop: 5, fontWeight: 600 }}>{f.label}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Adjuntar fotos pendientes — solo si falta evidencia y es tu visita (o eres admin) */}
                {puedeAdjuntarFotos && (
                  <div style={{ marginBottom: 12, padding: '12px 14px', background: '#E2E8F0', border: '1px solid #E2E8F0', borderRadius: 12 }}>
                    <p style={{ fontSize: 9, fontWeight: 700, color: T, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 10 }}>
                      Adjuntar fotos pendientes
                    </p>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(64px, 1fr))', gap: 8 }}>
                      {SLOTS_FOTO.filter(s => !visita[s.campo as keyof Visita]).map(slot => (
                        <div key={slot.campo}>
                          <input
                            ref={el => { fileRefs.current[slot.campo] = el }}
                            type="file" accept="image/*" style={{ display: 'none' }}
                            onChange={e => adjuntarFotoTardia(slot.campo, e)}
                          />
                          <div
                            onClick={() => fileRefs.current[slot.campo]?.click()}
                            style={{ height: 64, borderRadius: 10, cursor: 'pointer', background: '#F1F5F9', border: '1.5px dashed #CBD5E1', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}
                          >
                            {subiendo[slot.campo] ? (
                              <div style={{ width: 16, height: 16, border: `2px solid ${T_BORDER}`, borderTopColor: T, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                            ) : (
                              <>
                                <span style={{ fontSize: 16 }}>{slot.emoji}</span>
                                <Camera size={11} color="#64748B" />
                              </>
                            )}
                          </div>
                          <p style={{ fontSize: 8, textAlign: 'center', color: '#64748B', marginTop: 4, fontWeight: 600 }}>{slot.label}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* GPS */}
                {visita.lat && visita.lng && (
                  <a href={`https://www.google.com/maps?q=${visita.lat},${visita.lng}`} target="_blank" rel="noopener noreferrer"
                    style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '10px 14px', background: '#EFF6FF', border: '1px solid #EFF6FF', borderRadius: 12, textDecoration: 'none', color: '#0F172A', fontSize: 12, fontWeight: 600 }}>
                    <MapPin size={13} color="#2563EB" />
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
    </>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function HistorialClient({ user, visitas: visitasIniciales, items, vendedores, deudores, ventasHist }: Props) {
  const isDesktop = useIsDesktop()
  const [visitas, setVisitas]                 = useState(visitasIniciales)
  const [filtroVendedor, setFiltroVendedor]   = useState('todos')
  const [filtroResultado, setFiltroResultado] = useState<'todos' | 'con_venta' | 'sin_venta'>('todos')
  const [showFiltros, setShowFiltros]         = useState(false)

  function eliminarVisita(id: string) {
    setVisitas(vs => vs.filter(v => v.id !== id))
  }

  function actualizarFotoVisita(visitaId: string, campo: string, url: string, completo: boolean) {
    setVisitas(vs => vs.map(v => v.id === visitaId ? { ...v, [campo]: url, fotos_status: completo ? 'COMPLETO' : 'PENDIENTE' } : v))
  }

  const deudorMap     = useMemo(() => Object.fromEntries(deudores.map(d => [d.nombre_fantasia, d])), [deudores])
  const vendedorMap   = useMemo(() => Object.fromEntries(vendedores.map(v => [v.id, v.nombre])), [vendedores])
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
    if (filtroResultado === 'con_venta' && v.tiene_venta !== true)  return false
    if (filtroResultado === 'sin_venta' && v.tiene_venta !== false) return false
    return true
  }), [visitas, filtroVendedor, filtroResultado])

  const grupos    = useMemo(() => agruparPorFecha(filtradas), [filtradas])
  const hayFiltros = filtroVendedor !== 'todos' || filtroResultado !== 'todos'

  const kpis = useMemo(() => ({
    total:          filtradas.length,
    conVenta:       filtradas.filter(v => v.tiene_venta === true).length,
    sinVenta:       filtradas.filter(v => v.tiene_venta === false).length,
    totalFacturado: filtradas.reduce((s, v) => s + (v.total_pedido ?? 0), 0),
    totalUnidades:  items.filter(i => filtradas.some(v => v.id === i.visita_id)).reduce((s, i) => s + i.cantidad, 0),
  }), [filtradas, items])

  const conversionRate = kpis.total > 0 ? Math.round((kpis.conVenta / kpis.total) * 100) : 0

  return (
    <div style={{ minHeight: '100vh', background: '#F1F5F9', paddingBottom: 100 }}>

      {/* ── Header ── */}
      <div style={{ padding: isDesktop ? '20px 28px 0' : '20px 20px 0' }}>
        <Link
          href="/terreno"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4, minHeight: 36, textDecoration: 'none',
            background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 100,
            padding: '7px 14px 7px 10px', color: '#2563EB', fontSize: 13, fontWeight: 700, marginBottom: 14,
          }}
        >
          <ChevronLeft size={17} strokeWidth={2.5} color="#2563EB" />
          Volver
        </Link>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: '#64748B', letterSpacing: '0.04em' }}>VENTAS EN TERRENO</p>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: '#0F172A', letterSpacing: '-0.5px' }}>Historial</h1>
          </div>
          <button
            onClick={() => setShowFiltros(f => !f)}
            style={{
              background: hayFiltros ? T_DIM : '#FFFFFF',
              border: `1px solid ${hayFiltros ? '#2563EB' : '#E2E8F0'}`,
              borderRadius: 12, padding: '9px 13px', cursor: 'pointer', flexShrink: 0, minHeight: 40,
              display: 'flex', alignItems: 'center', gap: 6,
              color: hayFiltros ? '#2563EB' : '#64748B',
            }}
          >
            <Filter size={14} />
            <span style={{ fontSize: 12.5, fontWeight: 700 }}>Filtros{hayFiltros ? ' ·' : ''}</span>
          </button>
        </div>
      </div>

      {/* ── Filtros expandibles ── */}
      {showFiltros && (
        <div style={{
          margin: isDesktop ? '12px 28px' : '10px 20px',
          padding: '16px 18px',
          background: '#F1F5F9',
          border: '1px solid #E2E8F0',
          borderRadius: 16,
          backdropFilter: 'blur(12px)',
          display: 'flex', flexDirection: 'column', gap: 14,
        }}>
          {user.isAdmin && (
            <div>
              <p style={{ fontSize: 9, color: '#64748B', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 8 }}>Vendedor</p>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {[{ id: 'todos', nombre: 'Todos' }, ...vendedores].map(v => (
                  <button key={v.id} onClick={() => setFiltroVendedor(v.id)} style={{
                    padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    border: `1px solid ${filtroVendedor === v.id ? T_BORDER : '#E2E8F0'}`,
                    background: filtroVendedor === v.id ? T_DIM : 'transparent',
                    color: filtroVendedor === v.id ? T : '#64748B',
                  }}>{v.nombre.split(' ')[0]}</button>
                ))}
              </div>
            </div>
          )}
          <div>
            <p style={{ fontSize: 9, color: '#64748B', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 8 }}>Resultado</p>
            <div style={{ display: 'flex', gap: 6 }}>
              {([
                { key: 'todos', label: 'Todos', color: '#64748B', accent: T },
                { key: 'con_venta', label: 'Con venta', color: '#059669', accent: '#059669' },
                { key: 'sin_venta', label: 'Sin venta', color: '#DC2626', accent: '#DC2626' },
              ] as const).map(opt => (
                <button key={opt.key} onClick={() => setFiltroResultado(opt.key)} style={{
                  padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  border: `1px solid ${filtroResultado === opt.key ? `${opt.accent}40` : '#E2E8F0'}`,
                  background: filtroResultado === opt.key ? `${opt.accent}12` : 'transparent',
                  color: filtroResultado === opt.key ? opt.accent : '#64748B',
                }}>{opt.label}</button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div style={{ padding: isDesktop ? '20px 28px' : '16px 20px', maxWidth: 780 }}>

        {/* ── KPI Hero ── */}
        <div style={{
          background: 'linear-gradient(135deg, #E2E8F0 0%, #E2E8F0 60%, rgba(0,0,0,0) 100%)',
          border: `1px solid ${T_BORDER}`,
          borderRadius: 22,
          padding: '20px 22px',
          marginBottom: 12,
          position: 'relative', overflow: 'hidden',
        }}>
          {/* Glow decoration */}
          <div style={{ position: 'absolute', top: -40, right: -40, width: 120, height: 120, borderRadius: '50%', background: '#E2E8F0', filter: 'blur(30px)', pointerEvents: 'none' }} />
          <p style={{ fontSize: 9, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: 8 }}>Total facturado</p>
          <p style={{ fontSize: 36, fontWeight: 900, color: T, letterSpacing: '-1.5px', lineHeight: 1 }}>
            {kpis.totalFacturado > 0 ? fmtPeso(kpis.totalFacturado) : '—'}
          </p>
          {kpis.total > 0 && (
            <p style={{ fontSize: 12, color: '#64748B', marginTop: 8, fontWeight: 500 }}>
              {conversionRate}% conversión · {kpis.total} visitas registradas
            </p>
          )}
        </div>

        {/* ── KPI chips ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 24 }}>
          {[
            { label: 'Visitas',    val: kpis.total,          icon: '👁', color: '#0F172A' },
            { label: 'Con venta',  val: kpis.conVenta,       icon: '↗', color: '#059669' },
            { label: 'Sin venta',  val: kpis.sinVenta,       icon: '✕', color: '#DC2626' },
            { label: 'Unidades',   val: kpis.totalUnidades,  icon: '◉', color: T },
          ].map(k => (
            <div key={k.label} style={{
              background: '#F1F5F9',
              border: '1px solid #F1F5F9',
              borderRadius: 16, padding: '12px 10px', textAlign: 'center',
            }}>
              <p style={{ fontSize: 18, fontWeight: 900, color: k.color, letterSpacing: '-0.5px', lineHeight: 1, marginBottom: 5 }}>{k.val}</p>
              <p style={{ fontSize: 9, color: '#64748B', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{k.label}</p>
            </div>
          ))}
        </div>

        {/* ── Lista ── */}
        {grupos.length === 0 ? (
          <div style={{ textAlign: 'center', paddingTop: 56 }}>
            <Package size={40} color="#E2E8F0" style={{ margin: '0 auto 16px', display: 'block' }} />
            <p style={{ fontSize: 15, color: '#64748B', fontWeight: 500 }}>Sin visitas registradas</p>
            <p style={{ fontSize: 12, color: '#64748B', marginTop: 6 }}>Ajusta los filtros o registra una nueva visita</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {grupos.map(([fecha, grupo]) => {
              const facturadoDia = grupo.reduce((s, v) => s + (v.total_pedido ?? 0), 0)
              const conVentaDia  = grupo.filter(v => v.tiene_venta).length
              return (
                <div key={fecha}>
                  {/* ── Separador de día ── */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                    <div style={{ flex: 1, height: 1, background: '#F1F5F9' }} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'capitalize', letterSpacing: '0.1px' }}>
                        {labelFecha(fecha + 'T12:00:00')}
                      </span>
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#64748B', background: '#E2E8F0', padding: '2px 7px', borderRadius: 10 }}>
                        {grupo.length}
                      </span>
                      {facturadoDia > 0 && (
                        <span style={{ fontSize: 10, fontWeight: 700, color: T, background: T_DIM, border: `1px solid ${T_BORDER}`, padding: '2px 8px', borderRadius: 10 }}>
                          {fmtCompact(facturadoDia)}
                        </span>
                      )}
                    </div>
                    <div style={{ flex: 1, height: 1, background: '#F1F5F9' }} />
                  </div>

                  {/* Cards del día */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
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
                        isAdmin={user.isAdmin}
                        currentUserId={user.id}
                        onEliminar={eliminarVisita}
                        onFotoActualizada={actualizarFotoVisita}
                      />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
