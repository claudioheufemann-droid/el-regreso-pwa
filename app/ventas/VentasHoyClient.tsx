'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ChevronLeft, Bell, ChevronDown, ChevronRight, Droplet, Users, ShoppingBag,
  DollarSign, AlertTriangle, TrendingUp, TrendingDown, Calendar, CheckCircle2, Truck, RefreshCw,
} from 'lucide-react'
import SettingsPanel from '@/components/ui/SettingsPanel'
import { RANGOS, type RangoKey, type HoyData, type PuntoSerie, type VendedorRango, type DatosRango } from './hoyTypes'

/**
 * Vista principal de Ventas — tema CLARO, propio de esta pantalla.
 *
 * El resto de la app es oscura (variables --bg/--cream de globals.css). Acá los
 * colores van hardcodeados a propósito y NO se usan esas variables: si se
 * usaran, al cambiar el tema global esta pantalla quedaría con texto claro
 * sobre fondo claro. El contenedor pinta su propio fondo para cubrir el <main>.
 */

const C = {
  bg: '#F1F5F9',
  card: '#FFFFFF',
  hero: '#0F172A',
  heroSoft: '#1E293B',
  text: '#0F172A',
  muted: '#64748B',
  faint: '#94A3B8',
  line: '#E2E8F0',
  blue: '#2563EB',
  blueSoft: '#EFF6FF',
  green: '#059669',
  greenSoft: '#ECFDF5',
  purple: '#7C3AED',
  purpleSoft: '#F5F3FF',
  amber: '#D97706',
  amberSoft: '#FFFBEB',
  red: '#DC2626',
}

// ── Formato ──────────────────────────────────────────────────────────────────
const fL = (n: number) => `${n.toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} L`
const fNum = (n: number) => n.toLocaleString('es-CL')
function fPeso(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toLocaleString('es-CL', { maximumFractionDigits: 1 })}M`
  if (n >= 1_000) return `$${Math.round(n / 1000)}k`
  return `$${Math.round(n).toLocaleString('es-CL')}`
}
function fFechaCorta(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
  return `${d} ${meses[m - 1]} ${y}`
}
function fFechaHora(iso: string) {
  return new Date(iso).toLocaleString('es-CL', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Santiago' })
}
function fTiempoRelativo(iso: string): string {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (min < 1) return 'justo ahora'
  if (min < 60) return `hace ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `hace ${h}h`
  return `hace ${Math.floor(h / 24)}d`
}
/** % de variación; null cuando no hay base con que comparar (evita "+∞%"). */
function variacion(actual: number, previo: number): number | null {
  if (previo <= 0) return null
  return ((actual - previo) / previo) * 100
}

// ── Sparkline ────────────────────────────────────────────────────────────────
function Sparkline({ puntos, color }: { puntos: number[]; color: string }) {
  const w = 120, h = 34
  if (puntos.length < 2) return <div style={{ height: h }} />
  const max = Math.max(...puntos), min = Math.min(...puntos)
  const span = max - min || 1
  const paso = w / (puntos.length - 1)
  const pts = puntos.map((v, i) => [i * paso, h - ((v - min) / span) * (h - 6) - 3] as const)
  const linea = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const area = `${linea} L${w},${h} L0,${h} Z`
  const gid = `sp-${color.replace('#', '')}`
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ display: 'block' }}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`} />
      <path d={linea} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function Delta({ pct, size = 12 }: { pct: number | null; size?: number }) {
  if (pct === null) return <span style={{ fontSize: size, color: C.faint }}>—</span>
  const pos = pct >= 0
  const Icon = pos ? TrendingUp : TrendingDown
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: size, fontWeight: 600, color: pos ? C.green : C.red }}>
      <Icon size={size + 1} /> {pos ? '+' : ''}{Math.round(pct)}%
    </span>
  )
}

// ── KPI card ─────────────────────────────────────────────────────────────────
function KpiCard({ icon: Icon, tint, tintSoft, label, valor, pct, serie, onClick }: {
  icon: typeof Droplet; tint: string; tintSoft: string
  label: string; valor: string; pct: number | null; serie: number[]
  /** Si viene, la tarjeta abre el detalle correspondiente */
  onClick?: () => void
}) {
  const Contenedor = onClick ? 'button' : 'div'
  return (
    <Contenedor
      onClick={onClick}
      style={{
        background: C.card, borderRadius: 16, border: `1px solid ${C.line}`, padding: 14,
        minWidth: 0, width: '100%', textAlign: 'left', display: 'block',
        cursor: onClick ? 'pointer' : 'default', font: 'inherit', color: 'inherit',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        <div style={{ width: 34, height: 34, borderRadius: 10, background: tintSoft, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={17} color={tint} />
        </div>
        {onClick && <ChevronRight size={15} color={C.faint} style={{ marginLeft: 'auto' }} />}
      </div>
      <p style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>{label}</p>
      <p style={{ fontSize: 20, fontWeight: 800, color: C.text, letterSpacing: '-0.5px', lineHeight: 1.15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {valor}
      </p>
      <div style={{ marginTop: 4, marginBottom: 6 }}><Delta pct={pct} /></div>
      <Sparkline puntos={serie} color={tint} />
    </Contenedor>
  )
}

// ── Detalle (drill-down de tarjetas del dashboard) ──────────────────────────
interface FilaProducto {
  producto: string; envase: string; categoria: string
  litros: number; revenue: number; pedidos: number; clientes: number
}
interface FilaCliente {
  cliente: string; vendedor: string; localidad: string | null
  litros: number; revenue: number; pedidos: number; ultimaCompra: string | null
}
interface FilaPedido {
  pedido: string; cliente: string; vendedor: string
  fechaPedido: string | null; fechaEntrega: string | null
  litros: number; revenue: number
}
interface FilaClienteProducto {
  producto: string; envase: string; categoria: string
  litros: number; revenue: number; pedidos: number
}

/** Qué se le vendió a un cliente — se despliega al tocar su fila. */
function DetalleCompraCliente({ cliente, desde, hasta, porEntrega }: {
  cliente: string; desde: string; hasta: string; porEntrega: boolean
}) {
  const [items, setItems] = useState<FilaClienteProducto[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    const qs = `tipo=cliente-productos&cliente=${encodeURIComponent(cliente)}&desde=${desde}&hasta=${hasta}&porEntrega=${porEntrega}`
    fetch(`/api/ventas/detalle?${qs}`)
      .then(r => r.ok ? r.json() : r.json().then(j => Promise.reject(j.error ?? 'Error')))
      .then(d => { if (vivo) setItems(Array.isArray(d) ? d : []) })
      .catch(e => { if (vivo) setError(String(e)) })
    return () => { vivo = false }
  }, [cliente, desde, hasta, porEntrega])

  if (error) return <p style={{ fontSize: 12, color: C.red, padding: '8px 0 2px' }}>No se pudo cargar: {error}</p>
  if (!items) return <p style={{ fontSize: 12, color: C.muted, padding: '8px 0 2px' }}>Cargando…</p>
  if (items.length === 0) return <p style={{ fontSize: 12, color: C.muted, padding: '8px 0 2px' }}>Sin detalle de productos.</p>

  return (
    <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.line}`, display: 'flex', flexDirection: 'column', gap: 7 }}>
      <p style={{ fontSize: 10, fontWeight: 700, color: C.faint, letterSpacing: '.06em' }}>QUÉ SE LE VENDIÓ</p>
      {items.map((it, j) => (
        <div key={j} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <span style={{
            width: 6, height: 6, borderRadius: '50%', marginTop: 6, flexShrink: 0,
            background: it.categoria === 'Kombucha' ? C.green : it.categoria === 'Cerveza' ? C.hero : C.purple,
          }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 13, color: C.text, lineHeight: 1.3, wordBreak: 'break-word' }}>{it.producto}</p>
            <p style={{ fontSize: 11, color: C.muted, marginTop: 1 }}>
              {it.envase} · {it.pedidos} {it.pedidos === 1 ? 'pedido' : 'pedidos'}
            </p>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{fL(it.litros)}</p>
            <p style={{ fontSize: 11, color: C.muted }}>{fPeso(it.revenue)}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

function SheetDetalle({ tipo, envaseBucket, categoria, estadoPedidos, porEntrega = true, desde, hasta, onClose }: {
  tipo: 'productos' | 'clientes' | 'envase' | 'pedidos'
  envaseBucket?: string; categoria?: string; estadoPedidos?: 'despachado' | 'pendiente'
  /** Debe coincidir con el criterio de la tarjeta que abrió esto (ver ventas_dashboard_kpis) */
  porEntrega?: boolean
  desde: string; hasta: string; onClose: () => void
}) {
  const [filas, setFilas] = useState<(FilaProducto | FilaCliente | FilaPedido)[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [abierto, setAbierto] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    const qs = [
      tipo === 'envase' ? `bucket=${encodeURIComponent(envaseBucket ?? '')}` : '',
      tipo === 'productos' && categoria ? `categoria=${encodeURIComponent(categoria)}` : '',
      tipo === 'pedidos' ? `estado=${estadoPedidos}` : '',
      `porEntrega=${porEntrega}`,
    ].filter(Boolean).join('&')
    fetch(`/api/ventas/detalle?tipo=${tipo}&${qs}&desde=${desde}&hasta=${hasta}`)
      .then(r => r.ok ? r.json() : r.json().then(j => Promise.reject(j.error ?? 'Error')))
      .then(d => { if (vivo) setFilas(Array.isArray(d) ? d : []) })
      .catch(e => { if (vivo) setError(String(e)) })
    return () => { vivo = false }
  }, [tipo, envaseBucket, categoria, estadoPedidos, porEntrega, desde, hasta])

  const esProd = tipo === 'productos' || tipo === 'envase'
  const esPedidos = tipo === 'pedidos'
  const titulo = tipo === 'envase' ? `Productos · ${envaseBucket}`
    : tipo === 'productos' && categoria ? `Productos · ${categoria}`
    : esPedidos ? (estadoPedidos === 'pendiente' ? 'Pedidos pendientes de entrega' : 'Pedidos ya despachados')
    : esProd ? 'Productos vendidos' : 'Clientes que compraron'

  const visibles = useMemo(() => {
    if (!filas) return []
    const q = busca.trim().toLowerCase()
    if (!q) return filas
    return filas.filter(f => {
      if (esProd) return (f as FilaProducto).producto.toLowerCase().includes(q)
      if (esPedidos) {
        const p = f as FilaPedido
        return p.pedido.toLowerCase().includes(q) || p.cliente.toLowerCase().includes(q) || (p.vendedor ?? '').toLowerCase().includes(q)
      }
      return (f as FilaCliente).cliente.toLowerCase().includes(q) || ((f as FilaCliente).vendedor ?? '').toLowerCase().includes(q)
    })
  }, [filas, busca, esProd, esPedidos])

  const totalLitros = visibles.reduce((s, f) => s + f.litros, 0)

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(15,23,42,.45)', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}
    >
      <div style={{ background: C.bg, borderRadius: '20px 20px 0 0', maxHeight: '86vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '10px 0 6px', display: 'flex', justifyContent: 'center' }}>
          <div style={{ width: 38, height: 4, borderRadius: 2, background: '#CBD5E1' }} />
        </div>

        <div style={{ padding: '4px 16px 12px', borderBottom: `1px solid ${C.line}` }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 17, fontWeight: 800, color: C.text }}>{titulo}</p>
              <p style={{ fontSize: 12, color: C.muted }}>
                {fFechaCorta(desde)} – {fFechaCorta(hasta)}
                {filas && ` · ${filas.length} ${esProd ? 'productos' : esPedidos ? 'pedidos' : 'clientes'}`}
              </p>
            </div>
            <button onClick={onClose} aria-label="Cerrar"
              style={{ width: 32, height: 32, borderRadius: '50%', border: 'none', background: '#E2E8F0', color: C.text, cursor: 'pointer', flexShrink: 0, fontSize: 15 }}>
              ✕
            </button>
          </div>
          {filas && filas.length > 6 && (
            <input
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder={esProd ? 'Buscar producto…' : esPedidos ? 'Buscar pedido, cliente o vendedor…' : 'Buscar cliente o vendedor…'}
              style={{
                marginTop: 10, width: '100%', padding: '9px 12px', borderRadius: 10,
                border: `1px solid ${C.line}`, background: C.card, fontSize: 13, color: C.text, outline: 'none',
              }}
            />
          )}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 16px 24px' }}>
          {error ? (
            <p style={{ textAlign: 'center', color: C.red, fontSize: 13, padding: 28 }}>No se pudo cargar: {error}</p>
          ) : !filas ? (
            <p style={{ textAlign: 'center', color: C.muted, fontSize: 13, padding: 28 }}>Cargando…</p>
          ) : visibles.length === 0 ? (
            <p style={{ textAlign: 'center', color: C.muted, fontSize: 13, padding: 28 }}>
              {busca ? 'Sin coincidencias' : esPedidos ? 'Sin pedidos en este estado' : 'Sin ventas en este rango'}
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {visibles.map((f, i) => {
                const share = totalLitros > 0 ? (f.litros / totalLitros) * 100 : 0
                const p = esProd ? (f as FilaProducto) : null
                const ped = esPedidos ? (f as FilaPedido) : null
                const c = esProd || esPedidos ? null : (f as FilaCliente)
                const tintCat = p?.categoria === 'Kombucha' ? C.green : p?.categoria === 'Cerveza' ? C.hero : C.purple
                const diasEsperando = ped?.fechaPedido
                  ? Math.round((Date.now() - new Date(ped.fechaPedido + 'T12:00:00').getTime()) / 86400000)
                  : null
                const expandible = !!c
                const expandido = expandible && abierto === c!.cliente
                const Fila = expandible ? 'button' : 'div'
                return (
                  <div key={i} style={{ background: C.card, border: `1px solid ${expandido ? C.blue : C.line}`, borderRadius: 12, padding: '11px 13px' }}>
                    <Fila
                      onClick={expandible ? () => setAbierto(prev => prev === c!.cliente ? null : c!.cliente) : undefined}
                      style={{
                        display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 7,
                        width: '100%', textAlign: 'left', background: 'transparent', border: 'none',
                        padding: 0, font: 'inherit', color: 'inherit', cursor: expandible ? 'pointer' : 'default',
                      }}
                    >
                      <span style={{ fontSize: 12, fontWeight: 700, color: C.faint, minWidth: 18, flexShrink: 0 }}>{i + 1}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 14, fontWeight: 600, color: C.text, lineHeight: 1.3, wordBreak: 'break-word' }}>
                          {p ? p.producto : ped ? ped.cliente : c!.cliente}
                        </p>
                        <p style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                          {p
                            ? `${p.envase} · ${p.categoria} · ${p.clientes} ${p.clientes === 1 ? 'cliente' : 'clientes'}`
                            : ped
                            ? `#${ped.pedido} · ${ped.vendedor}${ped.fechaPedido ? ` · ${fFechaCorta(ped.fechaPedido)}` : ''}`
                            : [c!.vendedor, c!.localidad].filter(Boolean).join(' · ')}
                        </p>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <p style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{fL(f.litros)}</p>
                        <p style={{ fontSize: 11, color: C.muted }}>{fPeso(f.revenue)}</p>
                      </div>
                      {expandible && (
                        <ChevronDown size={16} color={expandido ? C.blue : C.faint} style={{
                          flexShrink: 0, marginTop: 3,
                          transform: expandido ? 'rotate(180deg)' : undefined, transition: 'transform .15s',
                        }} />
                      )}
                    </Fila>
                    {ped ? (
                      diasEsperando !== null && estadoPedidos === 'pendiente' && (
                        <p style={{ fontSize: 11, color: diasEsperando >= 7 ? C.red : C.amber, fontWeight: 600 }}>
                          {diasEsperando <= 0 ? 'Tomado hoy' : `${diasEsperando} ${diasEsperando === 1 ? 'día' : 'días'} esperando despacho`}
                        </p>
                      )
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ flex: 1, height: 5, borderRadius: 3, background: C.line, overflow: 'hidden' }}>
                          <div style={{ width: `${share}%`, height: '100%', background: p ? tintCat : C.blue, borderRadius: 3 }} />
                        </div>
                        <span style={{ fontSize: 11, color: C.faint, flexShrink: 0 }}>
                          {(f as FilaProducto | FilaCliente).pedidos} {(f as FilaProducto | FilaCliente).pedidos === 1 ? 'pedido' : 'pedidos'}
                        </span>
                      </div>
                    )}
                    {expandido && (
                      <DetalleCompraCliente cliente={c!.cliente} desde={desde} hasta={hasta} porEntrega={porEntrega} />
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Barra de mix ─────────────────────────────────────────────────────────────
function FilaMix({ nombre, litros, total, pct, color, colorSoft, emoji, onClick }: {
  nombre: string; litros: number; total: number; pct: number | null
  color: string; colorSoft: string; emoji: string; onClick?: () => void
}) {
  const share = total > 0 ? (litros / total) * 100 : 0
  const Contenedor = onClick ? 'button' : 'div'
  return (
    <Contenedor
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, width: '100%',
        background: 'transparent', border: 'none', padding: 0, cursor: onClick ? 'pointer' : 'default',
        textAlign: 'left', font: 'inherit', color: 'inherit',
      }}
    >
      <div style={{ width: 34, height: 34, borderRadius: 10, background: colorSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 16 }}>
        {emoji}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 5 }}>{nombre}</p>
        <div style={{ height: 6, borderRadius: 3, background: C.line, overflow: 'hidden' }}>
          <div style={{ width: `${share}%`, height: '100%', background: color, borderRadius: 3, transition: 'width .4s' }} />
        </div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0, minWidth: 92 }}>
        <p style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{fL(litros)}</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: C.muted, background: C.bg, borderRadius: 6, padding: '1px 5px' }}>
            {Math.round(share)}%
          </span>
          <Delta pct={pct} size={11} />
        </div>
      </div>
      {onClick && <ChevronRight size={14} color={C.faint} style={{ flexShrink: 0 }} />}
    </Contenedor>
  )
}

// ── Ranking ──────────────────────────────────────────────────────────────────
const COLOR_VEND = ['#0F172A', C.green, C.purple, '#EA580C', C.blue, '#0891B2']
function iniciales(nombre: string) {
  return nombre.split(/\s+/).filter(Boolean).map(p => p[0]).join('').slice(0, 2).toUpperCase()
}

/**
 * Fila del ranking en DOS niveles: arriba el nombre completo (sin truncar) y
 * abajo las métricas. Antes iba todo en una línea con 6 columnas y los nombres
 * largos ("Claudio Heufemann", "Yadro Fabijancic") quedaban cortados.
 */
function FilaVendedor({ v, pos, total, onClick }: { v: VendedorRango; pos: number; total: number; onClick: () => void }) {
  const share = total > 0 ? (v.litros / total) * 100 : 0
  const color = COLOR_VEND[pos % COLOR_VEND.length]
  return (
    <button
      onClick={onClick}
      style={{
        display: 'block', width: '100%', textAlign: 'left',
        background: 'transparent', border: 'none', borderTop: pos === 0 ? 'none' : `1px solid ${C.line}`,
        padding: '12px 0', cursor: 'pointer',
      }}
    >
      {/* Nombre — se permite que ocupe dos líneas si hace falta */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <span style={{ width: 18, fontSize: 12, fontWeight: 700, color: pos === 0 ? C.text : C.faint, flexShrink: 0 }}>
          {pos + 1}
        </span>
        <span style={{
          width: 30, height: 30, borderRadius: '50%', background: color, color: '#fff', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700,
        }}>
          {iniciales(v.vendedor)}
        </span>
        <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 600, color: C.text, lineHeight: 1.3, wordBreak: 'break-word' }}>
          {v.vendedor}
        </span>
        <ChevronRight size={15} color={C.faint} style={{ flexShrink: 0 }} />
      </div>

      {/* Métricas, alineadas bajo el nombre */}
      <div style={{ paddingLeft: 58 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{fL(v.litros)}</span>
          <span style={{ fontSize: 12, color: C.muted }}>{share.toFixed(1)}% del total</span>
          <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Delta pct={variacion(v.litros, v.litrosPrev)} size={11} />
            <span style={{ fontSize: 10, color: C.faint }}>vs ant.</span>
          </span>
        </div>
        <div style={{ height: 6, borderRadius: 3, background: C.line, overflow: 'hidden' }}>
          <div style={{ width: `${share}%`, height: '100%', background: color, borderRadius: 3, transition: 'width .4s' }} />
        </div>
        {v.litrosPorEntregar > 0 && (
          <p style={{ fontSize: 11, color: C.amber, marginTop: 6 }}>
            + {fL(v.litrosPorEntregar)} por entregar
            <span style={{ color: C.muted }}> · {fL(v.litros + v.litrosPorEntregar)} total</span>
          </p>
        )}
      </div>
    </button>
  )
}

// ── Vista ────────────────────────────────────────────────────────────────────
export default function VentasHoyClient({ data }: { data: HoyData }) {
  const router = useRouter()
  // Si la URL trae un rango a mano, se entra directo en esa vista
  const [rango, setRango] = useState<RangoKey>(data.custom ? 'custom' : 'periodo')
  const [periodoIdx, setPeriodoIdx] = useState(0)   // 0 = período activo
  const [showSettings, setShowSettings] = useState(false)
  const [detalle, setDetalle] = useState<'productos' | 'clientes' | 'envase' | 'pedidos' | null>(null)
  const [detalleEnvaseBucket, setDetalleEnvaseBucket] = useState<string | undefined>(undefined)
  const [detalleCategoria, setDetalleCategoria] = useState<string | undefined>(undefined)
  const [detalleEstadoPedidos, setDetalleEstadoPedidos] = useState<'despachado' | 'pendiente' | undefined>(undefined)
  function abrirDetalle(tipo: 'productos' | 'clientes' | 'envase' | 'pedidos', extra?: {
    envaseBucket?: string; categoria?: string; estadoPedidos?: 'despachado' | 'pendiente'
  }) {
    setDetalleEnvaseBucket(extra?.envaseBucket)
    setDetalleCategoria(extra?.categoria)
    setDetalleEstadoPedidos(extra?.estadoPedidos)
    setDetalle(tipo)
  }
  const [showPeriodos, setShowPeriodos] = useState(false)
  const [customDesde, setCustomDesde] = useState(data.custom?.desde ?? '')
  const [customHasta, setCustomHasta] = useState(data.custom?.hasta ?? '')

  const [showActualizaciones, setShowActualizaciones] = useState(false)
  const [eventosSync, setEventosSync] = useState<{ hora: string; filas: number }[] | null>(null)
  const [errorSync, setErrorSync] = useState(false)
  useEffect(() => {
    if (!showActualizaciones || eventosSync !== null) return
    fetch('/api/ventas/actualizaciones')
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(evs => setEventosSync(Array.isArray(evs) ? evs : []))
      .catch(() => setErrorSync(true))
  }, [showActualizaciones, eventosSync])

  const [syncStale, setSyncStale] = useState(false)
  useEffect(() => {
    if (!data.ultimaSync) return
    const tick = () => setSyncStale((Date.now() - new Date(data.ultimaSync!).getTime()) / 60000 > 30)
    tick()
    const t = setInterval(tick, 60000)
    return () => clearInterval(t)
  }, [data.ultimaSync])

  const periodoSel = data.periodos[periodoIdx] ?? null

  // "Período" = el período 24→23 elegido; "custom" = rango a mano (viene del
  // servidor por searchParams); el resto son rangos relativos a hoy.
  const d: DatosRango | null =
    rango === 'periodo' ? (periodoSel?.datos ?? null)
    : rango === 'custom' ? data.custom
    : data.rangos[rango as Exclude<RangoKey, 'periodo' | 'custom'>]

  function aplicarRango(desde: string, hasta: string) {
    if (!desde || !hasta) return
    // Se recarga en el servidor: el rango alimenta tarjetas, mix, ranking y detalles
    router.push(`/ventas?desde=${desde}&hasta=${hasta}`)
    setShowPeriodos(false)
  }
  function limpiarRango() {
    setRango('periodo')
    setCustomDesde(''); setCustomHasta('')
    router.push('/ventas')
  }

  if (!d) {
    return (
      <div style={{ background: C.bg, minHeight: '100%', padding: 24 }}>
        <p style={{ fontSize: 14, color: C.muted, textAlign: 'center' }}>
          No hay períodos de venta configurados.
        </p>
      </div>
    )
  }

  const { actual, previo, serie } = d
  const metaLitros = rango === 'periodo' ? (periodoSel?.metaLitros ?? 0) : 0

  const serieDe = (campo: keyof PuntoSerie) =>
    serie.map(p => Number(p[campo] ?? 0))

  const ticket = actual.pedidos > 0 ? actual.revenue / actual.pedidos : 0
  const ticketPrev = previo.pedidos > 0 ? previo.revenue / previo.pedidos : 0
  const totalMix = actual.litrosCerveza + actual.litrosKombucha + actual.litrosOtros
  const clientesNuevos = actual.clientes - previo.clientes

  const serieTicket = useMemo(
    () => serie.map(p => (p.pedidos > 0 ? p.revenue / p.pedidos : 0)),
    [serie],
  )

  const hoyTxt = new Date().toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Santiago' })
  // La meta se define por período de venta (24→23), así que sólo aplica ahí
  const avanceMeta = metaLitros > 0 ? Math.min(100, (actual.litros / metaLitros) * 100) : null

  return (
    <div style={{ background: C.bg, minHeight: '100%', margin: -1, padding: '1px 0 0' }}>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '14px 16px 32px', display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Volver — mismo botón que el resto de la app, lleva al hub principal */}
        <button
          onClick={() => router.push('/')}
          aria-label="Volver"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4, alignSelf: 'flex-start',
            background: C.card, border: `1px solid ${C.line}`,
            borderRadius: 100, padding: '7px 14px 7px 10px',
            color: C.text, fontSize: 13, fontWeight: 700, cursor: 'pointer',
            minHeight: 36,
          }}
        >
          <ChevronLeft size={17} strokeWidth={2.5} color={C.blue} />
          Volver
        </button>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: C.text, letterSpacing: '-0.5px', lineHeight: 1.1 }}>Ventas</h1>
            <p style={{ fontSize: 12, color: C.muted, textTransform: 'capitalize', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {hoyTxt}
            </p>
          </div>
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <button
              onClick={() => setShowActualizaciones(v => !v)}
              aria-label="Cargas de datos"
              style={{ position: 'relative', width: 40, height: 40, borderRadius: 12, background: C.card, border: `1px solid ${showActualizaciones ? C.blue : C.line}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
            >
              <RefreshCw size={17} color={C.text} />
              {data.ultimaSync && (
                <span style={{ position: 'absolute', top: 9, right: 9, width: 8, height: 8, borderRadius: '50%', background: syncStale ? C.red : C.green, border: `2px solid ${C.card}` }} />
              )}
            </button>

            {showActualizaciones && (
              <>
                <div onClick={() => setShowActualizaciones(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
                <div style={{
                  position: 'absolute', top: 'calc(100% + 6px)', right: 0, width: 280, maxWidth: '80vw', zIndex: 41,
                  background: C.card, border: `1px solid ${C.line}`, borderRadius: 12,
                  boxShadow: '0 8px 28px rgba(15,23,42,.14)', overflow: 'hidden',
                }}>
                  <p style={{ fontSize: 10, fontWeight: 700, color: C.faint, letterSpacing: '.06em', padding: '10px 12px 6px' }}>
                    CARGAS DE DATOS · VENTAS
                  </p>
                  <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                    {errorSync ? (
                      <p style={{ textAlign: 'center', color: C.red, fontSize: 12, padding: 20 }}>No se pudo cargar el historial.</p>
                    ) : eventosSync === null ? (
                      <p style={{ textAlign: 'center', color: C.muted, fontSize: 12, padding: 20 }}>Cargando…</p>
                    ) : eventosSync.length === 0 ? (
                      <p style={{ textAlign: 'center', color: C.muted, fontSize: 12, padding: 20 }}>Sin cargas en los últimos 7 días.</p>
                    ) : (
                      eventosSync.map((ev, i) => (
                        <div key={ev.hora} style={{
                          display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px',
                          borderTop: i === 0 ? 'none' : `1px solid ${C.line}`,
                          background: i === 0 ? C.greenSoft : 'transparent',
                        }}>
                          <span style={{ width: 7, height: 7, borderRadius: '50%', background: i === 0 ? C.green : C.faint, flexShrink: 0 }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontSize: 12, fontWeight: 600, color: C.text, textTransform: 'capitalize' }}>{fFechaHora(ev.hora)}</p>
                            <p style={{ fontSize: 10, color: C.muted }}>{fTiempoRelativo(ev.hora)} · {ev.filas} filas</p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </>
            )}
          </div>

          <button
            onClick={() => router.push('/ventas/misiones')}
            aria-label="Alertas"
            style={{ position: 'relative', width: 40, height: 40, borderRadius: 12, background: C.card, border: `1px solid ${C.line}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
          >
            <Bell size={18} color={C.text} />
            {data.alertas.some(a => a.tipo === 'alerta') && (
              <span style={{ position: 'absolute', top: 9, right: 9, width: 8, height: 8, borderRadius: '50%', background: C.blue, border: `2px solid ${C.card}` }} />
            )}
          </button>
          <button
            onClick={() => setShowSettings(true)}
            aria-label="Cuenta"
            style={{ width: 40, height: 40, borderRadius: '50%', overflow: 'hidden', border: `1px solid ${C.line}`, background: C.hero, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', flexShrink: 0, padding: 0 }}
          >
            {data.usuario?.avatarUrl
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={data.usuario.avatarUrl} alt={data.usuario.nombre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : (data.usuario?.iniciales || '··')}
          </button>
        </div>

        {/* Rango + pestañas */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {/* Selector: períodos de venta 24→23 + rango a mano. Se puede abrir
              desde cualquier pestaña para elegir fechas. */}
          <div style={{ position: 'relative', flex: '1 1 230px', minWidth: 0 }}>
            <button
              onClick={() => setShowPeriodos(v => !v)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                background: C.card, border: `1px solid ${showPeriodos ? C.blue : C.line}`,
                borderRadius: 12, padding: '9px 12px', cursor: 'pointer', textAlign: 'left',
              }}
            >
              <Calendar size={15} color={C.faint} style={{ flexShrink: 0 }} />
              <span style={{ minWidth: 0, overflow: 'hidden' }}>
                <span style={{ display: 'block', fontSize: 13, color: C.text, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {rango === 'periodo' && periodoSel ? periodoSel.nombre
                    : rango === 'custom' ? 'Rango elegido'
                    : `${fFechaCorta(d.desde)} – ${fFechaCorta(d.hasta)}`}
                </span>
                {(rango === 'periodo' || rango === 'custom') && (
                  <span style={{ display: 'block', fontSize: 11, color: C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {fFechaCorta(d.desde)} – {fFechaCorta(d.hasta)}
                  </span>
                )}
              </span>
              <ChevronDown size={15} color={C.faint} style={{ marginLeft: 'auto', flexShrink: 0, transform: showPeriodos ? 'rotate(180deg)' : undefined, transition: 'transform .15s' }} />
            </button>

            {showPeriodos && (
              <>
                <div onClick={() => setShowPeriodos(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
                <div style={{
                  position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 41,
                  background: C.card, border: `1px solid ${C.line}`, borderRadius: 12,
                  boxShadow: '0 8px 28px rgba(15,23,42,.14)', overflow: 'hidden',
                }}>
                  <p style={{ fontSize: 10, fontWeight: 700, color: C.faint, letterSpacing: '.06em', padding: '9px 12px 5px' }}>
                    PERÍODO DE VENTA (24 → 23)
                  </p>
                  {/* Atajos: los dos períodos que más se consultan */}
                  <div style={{ display: 'flex', gap: 6, padding: '0 12px 9px' }}>
                    {[0, 1].map(i => {
                      const p = data.periodos[i]
                      if (!p) return null
                      const on = rango === 'periodo' && periodoIdx === i
                      return (
                        <button
                          key={p.id}
                          onClick={() => { setPeriodoIdx(i); setRango('periodo'); setShowPeriodos(false) }}
                          style={{
                            flex: 1, padding: '8px 6px', borderRadius: 9, cursor: 'pointer',
                            border: `1px solid ${on ? C.blue : C.line}`,
                            background: on ? C.blue : C.card, color: on ? '#fff' : C.text,
                            fontSize: 12, fontWeight: 700,
                          }}
                        >
                          {i === 0 ? 'Período actual' : 'Período anterior'}
                        </button>
                      )
                    })}
                  </div>
                  {data.periodos.map((p, i) => {
                    const on = i === periodoIdx
                    return (
                      <button
                        key={p.id}
                        onClick={() => { setPeriodoIdx(i); setShowPeriodos(false) }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
                          background: on ? C.blueSoft : 'transparent', border: 'none',
                          borderTop: `1px solid ${C.line}`, padding: '10px 12px', cursor: 'pointer',
                        }}
                      >
                        <span style={{ minWidth: 0, flex: 1 }}>
                          <span style={{ display: 'block', fontSize: 13, fontWeight: on ? 700 : 500, color: on ? C.blue : C.text }}>
                            {p.nombre}{p.activo ? ' · en curso' : ''}
                          </span>
                          <span style={{ display: 'block', fontSize: 11, color: C.muted }}>
                            {fFechaCorta(p.inicio)} – {fFechaCorta(p.fin)}
                          </span>
                        </span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: on ? C.blue : C.muted, flexShrink: 0 }}>
                          {fL(p.datos.actual.litros)}
                        </span>
                      </button>
                    )
                  })}

                  {/* Rango a mano */}
                  <div style={{ borderTop: `1px solid ${C.line}`, padding: '10px 12px', background: C.bg }}>
                    <p style={{ fontSize: 10, fontWeight: 700, color: C.faint, letterSpacing: '.06em', marginBottom: 8 }}>
                      O ELEGIR FECHAS
                    </p>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8 }}>
                      <input
                        type="date" value={customDesde} max={customHasta || undefined}
                        onChange={e => setCustomDesde(e.target.value)}
                        style={{ flex: 1, minWidth: 0, padding: '7px 8px', borderRadius: 8, border: `1px solid ${C.line}`, background: C.card, fontSize: 12, color: C.text }}
                      />
                      <span style={{ fontSize: 12, color: C.faint }}>a</span>
                      <input
                        type="date" value={customHasta} min={customDesde || undefined}
                        onChange={e => setCustomHasta(e.target.value)}
                        style={{ flex: 1, minWidth: 0, padding: '7px 8px', borderRadius: 8, border: `1px solid ${C.line}`, background: C.card, fontSize: 12, color: C.text }}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        onClick={() => aplicarRango(customDesde, customHasta)}
                        disabled={!customDesde || !customHasta || customDesde > customHasta}
                        style={{
                          flex: 1, padding: '8px 10px', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 700,
                          background: (!customDesde || !customHasta || customDesde > customHasta) ? C.line : C.blue,
                          color: (!customDesde || !customHasta || customDesde > customHasta) ? C.faint : '#fff',
                          cursor: (!customDesde || !customHasta || customDesde > customHasta) ? 'not-allowed' : 'pointer',
                        }}
                      >
                        Aplicar
                      </button>
                      {data.custom && (
                        <button onClick={limpiarRango}
                          style={{ padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.line}`, background: C.card, fontSize: 12, color: C.muted, cursor: 'pointer' }}>
                          Quitar
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          <div style={{ display: 'flex', gap: 2, background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: 3, flexWrap: 'wrap' }}>
            {/* La pestaña del rango a mano sólo existe si hay uno aplicado */}
            {(data.custom ? [...RANGOS, { key: 'custom' as RangoKey, label: 'Rango' }] : RANGOS).map(r => {
              const on = r.key === rango
              return (
                <button
                  key={r.key}
                  onClick={() => { setRango(r.key); setShowPeriodos(false) }}
                  style={{
                    padding: '7px 12px', borderRadius: 9, border: 'none', cursor: 'pointer',
                    background: on ? C.hero : 'transparent', color: on ? '#fff' : C.muted,
                    fontSize: 13, fontWeight: on ? 700 : 500, whiteSpace: 'nowrap',
                  }}
                >
                  {r.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Hero */}
        <button
          onClick={() => abrirDetalle('productos')}
          style={{ background: C.hero, borderRadius: 20, padding: 20, color: '#fff', border: 'none', cursor: 'pointer', textAlign: 'left', width: '100%', display: 'block', font: 'inherit' }}
        >
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 190px', minWidth: 0 }}>
              <p style={{ fontSize: 11, letterSpacing: '0.08em', color: '#94A3B8', fontWeight: 600, marginBottom: 8 }}>
                {rango === 'periodo' && periodoSel
                  ? `VENTAS · ${periodoSel.nombre.toUpperCase()}`
                  : rango === 'custom' ? 'VENTAS · RANGO ELEGIDO' : 'VENTAS DEL RANGO'}
              </p>
              <p style={{ fontSize: 42, fontWeight: 800, letterSpacing: '-2px', lineHeight: 1 }}>
                {actual.litros.toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                <span style={{ fontSize: 20, marginLeft: 4, color: '#CBD5E1' }}>L</span>
              </p>
              {d.entregas.litrosPorEntregar > 0 && (
                <p style={{ fontSize: 12, color: '#94A3B8', marginTop: 4 }}>
                  entregado{' '}
                  <span style={{ color: '#F59E0B', fontWeight: 600 }}>
                    + {fL(d.entregas.litrosPorEntregar)} por entregar
                  </span>
                  {' '}= {fL(actual.litros + d.entregas.litrosPorEntregar)} total
                </p>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                {(() => {
                  const p = variacion(actual.litros, previo.litros)
                  if (p === null) return <span style={{ fontSize: 12, color: '#94A3B8' }}>Sin período anterior</span>
                  const pos = p >= 0
                  return (
                    <>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: pos ? 'rgba(16,185,129,.16)' : 'rgba(239,68,68,.16)', color: pos ? '#34D399' : '#F87171', borderRadius: 8, padding: '3px 8px', fontSize: 12, fontWeight: 700 }}>
                        {pos ? <TrendingUp size={13} /> : <TrendingDown size={13} />} {pos ? '+' : ''}{Math.round(p)}%
                      </span>
                      <span style={{ fontSize: 12, color: '#94A3B8' }}>{d.etiquetaComparacion}</span>
                    </>
                  )
                })()}
              </div>
              {avanceMeta !== null && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 5 }}>
                    <span style={{ color: '#94A3B8' }}>Meta: {fNum(Math.round(metaLitros))} L</span>
                    <span style={{ fontWeight: 700 }}>{Math.round(avanceMeta)}%</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,.12)', overflow: 'hidden' }}>
                    <div style={{ width: `${avanceMeta}%`, height: '100%', background: C.blue, borderRadius: 3, transition: 'width .4s' }} />
                  </div>
                </div>
              )}
            </div>

            <div style={{ flex: '1 1 190px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14, justifyContent: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                <span style={{ width: 42, height: 42, borderRadius: 12, background: 'rgba(37,99,235,.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Users size={20} color="#60A5FA" />
                </span>
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.1 }}>
                    {fNum(actual.clientes)} <span style={{ fontSize: 13, fontWeight: 500, color: '#94A3B8' }}>Clientes</span>
                  </p>
                  {clientesNuevos !== 0 && (
                    <p style={{ fontSize: 12, color: clientesNuevos > 0 ? '#34D399' : '#F87171' }}>
                      {clientesNuevos > 0 ? '+' : ''}{clientesNuevos} vs anterior
                    </p>
                  )}
                </div>
              </div>
              <div style={{ height: 1, background: 'rgba(255,255,255,.08)' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                <span style={{ width: 42, height: 42, borderRadius: 12, background: 'rgba(16,185,129,.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <DollarSign size={20} color="#34D399" />
                </span>
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.1 }}>{fPeso(actual.revenue)}</p>
                  <div style={{ fontSize: 12, color: '#94A3B8', display: 'flex', gap: 5, alignItems: 'center' }}>
                    {(() => {
                      const p = variacion(actual.revenue, previo.revenue)
                      if (p === null) return <span>Sin comparación</span>
                      const pos = p >= 0
                      return <><span style={{ color: pos ? '#34D399' : '#F87171', fontWeight: 600 }}>{pos ? '↑' : '↓'} {Math.abs(Math.round(p))}%</span> vs anterior</>
                    })()}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </button>

        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
          <KpiCard icon={Droplet} tint={C.blue} tintSoft={C.blueSoft} label="Litros vendidos"
            valor={fL(actual.litros)} pct={variacion(actual.litros, previo.litros)} serie={serieDe('litros')}
            onClick={() => abrirDetalle('productos')} />
          <KpiCard icon={Users} tint={C.green} tintSoft={C.greenSoft} label="Clientes"
            valor={fNum(actual.clientes)} pct={variacion(actual.clientes, previo.clientes)} serie={serieDe('clientes')}
            onClick={() => abrirDetalle('clientes')} />
          <KpiCard icon={ShoppingBag} tint={C.purple} tintSoft={C.purpleSoft} label="Pedidos"
            valor={fNum(actual.pedidos)} pct={variacion(actual.pedidos, previo.pedidos)} serie={serieDe('pedidos')}
            onClick={() => abrirDetalle('productos')} />
          <KpiCard icon={DollarSign} tint={C.amber} tintSoft={C.amberSoft} label="Ticket promedio"
            valor={fPeso(ticket)} pct={variacion(ticket, ticketPrev)} serie={serieTicket}
            onClick={() => abrirDetalle('clientes')} />
        </div>

        {/* Product mix */}
        <div style={{ background: C.card, borderRadius: 16, border: `1px solid ${C.line}`, padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: C.text, letterSpacing: '0.04em' }}>PRODUCT MIX</p>
            <span style={{ fontSize: 12, color: C.muted }}>{fNum(actual.clientes)} clientes</span>
          </div>
          {totalMix === 0 ? (
            <p style={{ fontSize: 13, color: C.faint, textAlign: 'center', padding: '14px 0' }}>Sin ventas en este período</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <FilaMix nombre="Cerveza" emoji="🍺" litros={actual.litrosCerveza} total={totalMix}
                pct={variacion(actual.litrosCerveza, previo.litrosCerveza)} color={C.hero} colorSoft="#E2E8F0"
                onClick={() => abrirDetalle('productos', { categoria: 'Cerveza' })} />
              <FilaMix nombre="Kombucha" emoji="🧃" litros={actual.litrosKombucha} total={totalMix}
                pct={variacion(actual.litrosKombucha, previo.litrosKombucha)} color={C.green} colorSoft={C.greenSoft}
                onClick={() => abrirDetalle('productos', { categoria: 'Kombucha' })} />
              {actual.litrosOtros > 0 && (
                <FilaMix nombre="Otros" emoji="📦" litros={actual.litrosOtros} total={totalMix}
                  pct={variacion(actual.litrosOtros, previo.litrosOtros)} color={C.purple} colorSoft={C.purpleSoft}
                  onClick={() => abrirDetalle('productos', { categoria: 'Otros' })} />
              )}
            </div>
          )}
        </div>

        {/* Ranking */}
        <div style={{ background: C.card, borderRadius: 16, border: `1px solid ${C.line}`, padding: '16px 16px 6px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: C.text, letterSpacing: '0.04em' }}>RANKING DE VENDEDORES</p>
            <span style={{ fontSize: 12, color: C.muted }}>por litros vendidos</span>
          </div>
          {d.vendedores.map((v, i) => (
            <FilaVendedor key={v.vendedor} v={v} pos={i} total={actual.litros}
              onClick={() => router.push('/ventas/ranking')} />
          ))}
        </div>

        {/* Pedidos tomados en el período, según su estado de despacho.
            OJO: esto NO es un desglose de la tarjeta "Litros vendidos" de
            arriba. Esa tarjeta ya sólo cuenta litros ENTREGADOS dentro del
            rango de fechas (fecha_entrega); "vendido" = "entregado" es la
            premisa del negocio. Esta tarjeta mira otra población — pedidos
            por FECHA DE PEDIDO — para responder una pregunta distinta y
            complementaria: de lo que los vendedores cerraron en este
            período, ¿cuánto ya salió de bodega y cuánto sigue pendiente?
            Por eso los números de acá no tienen por qué calzar con los de
            arriba (un pedido puede cerrarse en el período y entregarse
            semanas después, quedando fuera del "vendido" hasta que eso pase). */}
        {(d.entregas.litrosEntregados > 0 || d.entregas.litrosPorEntregar > 0) && (() => {
          const tot = d.entregas.litrosEntregados + d.entregas.litrosPorEntregar
          const pctEnt = tot > 0 ? (d.entregas.litrosEntregados / tot) * 100 : 0
          const sinDato = d.entregas.litrosSinDato
          return (
            <div style={{ background: C.card, borderRadius: 16, border: `1px solid ${C.line}`, padding: 16 }}>
              <div style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: C.text, letterSpacing: '0.04em' }}>PEDIDOS DE ESTE PERÍODO</p>
                  <span style={{ fontSize: 12, color: C.muted }}>{Math.round(pctEnt)}% ya despachado</span>
                </div>
                <p style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>
                  Por fecha en que se tomó el pedido — no es el mismo total que &quot;Litros vendidos&quot;
                </p>
              </div>

              <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', background: C.line, marginBottom: 14 }}>
                <div style={{ width: `${pctEnt}%`, background: C.green }} />
                <div style={{ width: `${100 - pctEnt}%`, background: C.amber }} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
                <button
                  onClick={() => abrirDetalle('pedidos', { estadoPedidos: 'despachado' })}
                  style={{ background: C.greenSoft, borderRadius: 12, padding: '12px 13px', border: 'none', cursor: 'pointer', textAlign: 'left', width: '100%' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 7 }}>
                    <CheckCircle2 size={15} color={C.green} />
                    <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>Ya despachados</span>
                    <ChevronRight size={14} color={C.faint} style={{ marginLeft: 'auto', flexShrink: 0 }} />
                  </div>
                  <p style={{ fontSize: 20, fontWeight: 800, color: C.green, letterSpacing: '-0.5px', lineHeight: 1.1 }}>
                    {fL(d.entregas.litrosEntregados)}
                  </p>
                  <p style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                    {fNum(d.entregas.pedidosEntregados)} {d.entregas.pedidosEntregados === 1 ? 'pedido' : 'pedidos'} · {fPeso(d.entregas.revenueEntregado)}
                  </p>
                </button>

                <button
                  onClick={() => abrirDetalle('pedidos', { estadoPedidos: 'pendiente' })}
                  style={{ background: C.amberSoft, borderRadius: 12, padding: '12px 13px', border: 'none', cursor: 'pointer', textAlign: 'left', width: '100%' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 7 }}>
                    <Truck size={15} color={C.amber} />
                    <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>Pendientes de entrega</span>
                    <ChevronRight size={14} color={C.faint} style={{ marginLeft: 'auto', flexShrink: 0 }} />
                  </div>
                  <p style={{ fontSize: 20, fontWeight: 800, color: C.amber, letterSpacing: '-0.5px', lineHeight: 1.1 }}>
                    {fL(d.entregas.litrosPorEntregar)}
                  </p>
                  <p style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                    {fNum(d.entregas.pedidosPorEntregar)} {d.entregas.pedidosPorEntregar === 1 ? 'pedido' : 'pedidos'} · {fPeso(d.entregas.revenuePorEntregar)}
                  </p>
                </button>
              </div>

              {d.entregas.litrosPorEntregar > 0 && (
                <p style={{ fontSize: 11, color: C.muted, marginTop: 10, lineHeight: 1.45 }}>
                  Estos {fL(d.entregas.litrosPorEntregar)} pendientes aún no cuentan como
                  vendidos en ningún período — se sumarán a &quot;Litros vendidos&quot; recién cuando
                  el ERP registre su entrega.
                </p>
              )}
              {sinDato > 0 && (
                <p style={{ fontSize: 11, color: C.faint, marginTop: 6, lineHeight: 1.45 }}>
                  Otros {fL(sinDato)} del período son anteriores a que se registrara el
                  estado de entrega, así que no se cuentan acá.
                </p>
              )}
            </div>
          )
        })()}

        {/* Envases — cuánto se vendió en latas y barriles */}
        {d.envases.length > 0 && (
          <div style={{ background: C.card, borderRadius: 16, border: `1px solid ${C.line}`, padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: C.text, letterSpacing: '0.04em' }}>LATAS Y BARRILES</p>
              <span style={{ fontSize: 12, color: C.muted }}>unidades del período</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
              {d.envases.map(e => {
                const esBarril = e.tipo.toLowerCase().includes('barril')
                const tint = esBarril ? C.amber : e.tipo.includes('473') ? C.hero : C.green
                const soft = esBarril ? C.amberSoft : e.tipo.includes('473') ? '#E2E8F0' : C.greenSoft
                return (
                  <button
                    key={e.tipo}
                    onClick={() => abrirDetalle('envase', { envaseBucket: e.tipo })}
                    style={{ background: soft, borderRadius: 12, padding: '12px 13px', border: 'none', cursor: 'pointer', textAlign: 'left', width: '100%' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
                      <span style={{ fontSize: 17 }}>{esBarril ? '🛢️' : '🥫'}</span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: C.text, minWidth: 0, wordBreak: 'break-word' }}>{e.tipo}</span>
                      <ChevronRight size={14} color={C.faint} style={{ marginLeft: 'auto', flexShrink: 0 }} />
                    </div>
                    <p style={{ fontSize: 22, fontWeight: 800, color: tint, letterSpacing: '-0.6px', lineHeight: 1.1 }}>
                      {fNum(Math.round(e.unidades))}
                    </p>
                    <p style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                      {esBarril ? 'barriles' : 'latas'} · {fL(e.litros)}
                    </p>
                    <div style={{ marginTop: 5 }}>
                      <Delta pct={variacion(e.unidades, e.unidadesPrev)} size={11} />
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Consumo interno y promocional — PDV, Ferias y BaseCamp. No son
            clientes reales asi que no cuentan como "litros vendidos" (eso lo
            filtra _excluir_cliente en las funciones SQL del dashboard), pero
            son volumen real que vale la pena ver aparte. */}
        {d.consumoInterno.length > 0 && (
          <div style={{ background: C.card, borderRadius: 16, border: `1px solid ${C.line}`, padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: C.text, letterSpacing: '0.04em' }}>CONSUMO INTERNO Y PROMOCIONAL</p>
            </div>
            <p style={{ fontSize: 11, color: C.muted, marginBottom: 12 }}>
              PDV, ferias y BaseCamp — no cuentan como litros vendidos
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10 }}>
              {d.consumoInterno.map(c => (
                <div key={c.categoria} style={{ background: C.purpleSoft, borderRadius: 12, padding: '12px 13px' }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{c.categoria}</span>
                  <p style={{ fontSize: 20, fontWeight: 800, color: C.purple, letterSpacing: '-0.5px', lineHeight: 1.3, marginTop: 4 }}>
                    {fL(c.litros)}
                  </p>
                  <p style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                    {fNum(c.pedidos)} {c.pedidos === 1 ? 'pedido' : 'pedidos'}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Alertas e insights */}
        {data.alertas.length > 0 && (
          <div style={{ background: C.card, borderRadius: 16, border: `1px solid ${C.line}`, padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: C.text, letterSpacing: '0.04em' }}>ALERTAS E INSIGHTS</p>
              <button onClick={() => router.push('/ventas/misiones')}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: C.blue, fontWeight: 600, padding: 0 }}>
                Ver todas
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 10 }}>
              {data.alertas.slice(0, 4).map((a, i) => {
                const esAlerta = a.tipo === 'alerta'
                return (
                  <button
                    key={i}
                    onClick={() => a.href && router.push(a.href)}
                    style={{
                      display: 'flex', alignItems: 'flex-start', gap: 9, textAlign: 'left', width: '100%',
                      background: esAlerta ? C.amberSoft : C.greenSoft,
                      border: `1px solid ${esAlerta ? '#FDE68A' : '#A7F3D0'}`,
                      borderRadius: 12, padding: '11px 12px', cursor: a.href ? 'pointer' : 'default',
                    }}
                  >
                    {esAlerta
                      ? <AlertTriangle size={16} color={C.amber} style={{ flexShrink: 0, marginTop: 1 }} />
                      : <TrendingUp size={16} color={C.green} style={{ flexShrink: 0, marginTop: 1 }} />}
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: C.text, lineHeight: 1.35 }}>{a.titulo}</span>
                      <span style={{ display: 'block', fontSize: 11, color: C.muted, marginTop: 2 }}>{a.detalle}</span>
                    </span>
                    {a.href && <ChevronRight size={15} color={C.faint} style={{ flexShrink: 0, marginLeft: 'auto', alignSelf: 'center' }} />}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {data.ultimaSync && (
          <p style={{ fontSize: 11, color: C.faint, textAlign: 'center' }}>
            Datos actualizados: {new Date(data.ultimaSync).toLocaleString('es-CL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Santiago' })}
          </p>
        )}
      </div>

      {detalle && (
        <SheetDetalle
          tipo={detalle}
          envaseBucket={detalleEnvaseBucket}
          categoria={detalleCategoria}
          estadoPedidos={detalleEstadoPedidos}
          porEntrega={rango !== 'anio'}
          desde={d.desde}
          hasta={d.hasta}
          onClose={() => {
            setDetalle(null)
            setDetalleEnvaseBucket(undefined)
            setDetalleCategoria(undefined)
            setDetalleEstadoPedidos(undefined)
          }}
        />
      )}

      {showSettings && (
        <SettingsPanel
          onClose={() => setShowSettings(false)}
          userName={data.usuario?.nombre ?? ''}
          userEmail=""
          avatarUrl={data.usuario?.avatarUrl ?? undefined}
        />
      )}
    </div>
  )
}
