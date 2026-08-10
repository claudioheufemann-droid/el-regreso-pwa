'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ChevronLeft, ChevronDown, ChevronRight, ArrowRight, Droplet, Users, ShoppingBag,
  DollarSign, AlertTriangle, TrendingUp, TrendingDown, Calendar, CheckCircle2, Truck, RefreshCw,
  Building2,
} from 'lucide-react'
import SettingsPanel from '@/components/ui/SettingsPanel'
import NotificationsBell from '@/components/ui/NotificationsBell'
import MiComision from './MiComision'
import MiComisionVendedor from '@/app/terreno/MiComisionVendedor'
import { RANGOS, type RangoKey, type HoyData, type VendedorRango, type DatosRango } from './hoyTypes'

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
/** Monto siempre completo, nunca abreviado ($254.150, no "$254k"): el
 *  redondeo a "k"/"M" esconde plata real. */
function fPesoFull(n: number) { return `$${Math.round(n).toLocaleString('es-CL')}` }
function fFechaCorta(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
  return `${d} ${meses[m - 1]} ${y}`
}
function fFechaHora(iso: string) {
  return new Date(iso).toLocaleString('es-CL', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Santiago' })
}
/** "23:56" a partir de un timestamp SIN zona horaria (fecha_entrega_hora):
 *  se extrae el texto tal cual, sin pasar por Date/timeZone — es la hora
 *  literal que reportó el ERP, no admite conversión de huso horario. */
function fHoraLiteral(iso: string): string | null {
  const m = iso.match(/T(\d{2}:\d{2})/)
  return m ? m[1] : null
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
/** Tarjeta horizontal compacta (pedido de Claudio, 28-jul): fondo tonal
 *  suave del color de la categoría, ícono en círculo blanco a la izquierda,
 *  nombre+valor al centro, flecha en círculo blanco a la derecha. Sin
 *  gráfico ni guión de "sin dato" — si no hay pct, esa fila simplemente no
 *  muestra nada ahí, en vez de un "—" vacío. */
function KpiCard({ icon: Icon, tint, tintSoft, label, valor, pct, onClick, big = false }: {
  icon: typeof Droplet; tint: string; tintSoft: string
  label: string; valor: string; pct: number | null
  /** Si viene, la tarjeta abre el detalle correspondiente */
  onClick?: () => void
  /** Desktop: la tarjeta ya no compite por un ancho de 760px completo —
   *  con más aire alrededor, el número puede crecer sin apretarse. */
  big?: boolean
}) {
  const Contenedor = onClick ? 'button' : 'div'
  return (
    <Contenedor
      onClick={onClick}
      style={{
        background: tintSoft, borderRadius: 18, padding: big ? '18px 18px 18px 16px' : '14px 14px 14px 12px',
        display: 'flex', alignItems: 'center', gap: big ? 14 : 12, minWidth: 0, width: '100%',
        border: 'none', textAlign: 'left', cursor: onClick ? 'pointer' : 'default', font: 'inherit', color: 'inherit',
      }}
    >
      <div style={{ width: big ? 52 : 44, height: big ? 52 : 44, borderRadius: 14, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={big ? 24 : 20} color={tint} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: big ? 13 : 12, fontWeight: 700, color: tint, marginBottom: big ? 5 : 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</p>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: big ? 28 : 21, fontWeight: 800, color: C.text, letterSpacing: '-0.5px', lineHeight: 1.15, whiteSpace: 'nowrap' }}>
            {valor}
          </span>
          {pct !== null && <Delta pct={pct} size={big ? 13 : 11} />}
        </div>
      </div>
      {onClick && (
        <span style={{ width: big ? 38 : 34, height: big ? 38 : 34, borderRadius: '50%', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <ArrowRight size={big ? 18 : 16} color="#F59E0B" />
        </span>
      )}
    </Contenedor>
  )
}

// ── Detalle (drill-down de tarjetas del dashboard) ──────────────────────────
interface FilaProducto {
  producto: string; envase: string; categoria: string
  litros: number; revenue: number; pedidos: number; clientes: number; unidades: number
}
interface FilaCliente {
  cliente: string; vendedor: string; localidad: string | null
  litros: number; revenue: number; pedidos: number; ultimaCompra: string | null
  /** Hora real de entrega (fecha_entrega_hora del ERP) — sólo viene poblada
   *  cuando el evento más reciente del cliente fue una entrega; si lo más
   *  reciente es un pedido aún pendiente, no hay hora real disponible y
   *  esto viene null (no se inventa una hora). */
  ultimaCompraHora?: string | null
  /** litros/revenue de pedidos de ese cliente aun sin despachar — pedidos
   *  de hoy sin entregar todavia cuentan igual para el orden de la lista
   *  (ver ultimaCompra), aunque litros siga en 0 hasta que se entreguen. */
  litrosPorEntregar?: number; revenuePorEntregar?: number
}
interface FilaPedido {
  pedido: string; cliente: string; vendedor: string
  fechaPedido: string | null; fechaEntrega: string | null
  litros: number; revenue: number
  /** Sólo en pedidos-periodo: hora literal del ERP + estado de despacho. */
  fechaEntregaHora?: string | null
  entregado?: boolean
  localidad?: string | null
}
/** "24 latas" / "2 barriles" — singular/plural según el envase. */
function fUnidades(unidades: number, envase: string): string {
  if (unidades <= 0) return ''
  const esBarril = envase.toLowerCase().includes('barril')
  const palabra = esBarril ? (unidades === 1 ? 'barril' : 'barriles') : (unidades === 1 ? 'lata' : 'latas')
  return `${unidades.toLocaleString('es-CL')} ${palabra}`
}
/** "$1.297 c/u" — revenue ya incluye el prorrateo de Empaque y Distribución,
 *  así que esto es el precio real por lata/barril, no el de lista. */
function fPrecioUnitario(revenue: number, unidades: number): string {
  if (unidades <= 0) return ''
  return `${fPesoFull(revenue / unidades)} c/u`
}
interface FilaPedidoProducto {
  producto: string; envase: string; categoria: string
  litros: number; revenue: number; unidades: number
}

/** Qué contiene un pedido — se despliega al tocar su fila en "Ya
 *  despachados" / "Pendientes de entrega". No usa rango de fechas: un
 *  pedido es un hecho puntual. */
function DetallePedidoProductos({ pedido }: { pedido: string }) {
  const [items, setItems] = useState<FilaPedidoProducto[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    fetch(`/api/ventas/detalle?tipo=pedido-productos&pedido=${encodeURIComponent(pedido)}`)
      .then(r => r.ok ? r.json() : r.json().then(j => Promise.reject(j.error ?? 'Error')))
      .then(d => { if (vivo) setItems(Array.isArray(d) ? d : []) })
      .catch(e => { if (vivo) setError(String(e)) })
    return () => { vivo = false }
  }, [pedido])

  if (error) return <p style={{ fontSize: 12, color: C.red, padding: '8px 0 2px' }}>No se pudo cargar: {error}</p>
  if (!items) return <p style={{ fontSize: 12, color: C.muted, padding: '8px 0 2px' }}>Cargando…</p>
  if (items.length === 0) return <p style={{ fontSize: 12, color: C.muted, padding: '8px 0 2px' }}>Sin detalle de productos.</p>

  return (
    <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.line}`, display: 'flex', flexDirection: 'column', gap: 7 }}>
      <p style={{ fontSize: 10, fontWeight: 700, color: C.faint, letterSpacing: '.06em' }}>QUÉ CONTIENE ESTE PEDIDO</p>
      {items.map((it, j) => (
        <div key={j} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <span style={{
            width: 6, height: 6, borderRadius: '50%', marginTop: 6, flexShrink: 0,
            background: it.categoria === 'Kombucha' ? C.green : it.categoria === 'Cerveza' ? C.hero : C.purple,
          }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 13, color: C.text, lineHeight: 1.3, wordBreak: 'break-word' }}>{it.producto}</p>
            <p style={{ fontSize: 11, color: C.muted, marginTop: 1 }}>
              {[it.envase, fUnidades(it.unidades, it.envase)].filter(Boolean).join(' · ')}
            </p>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: C.text, whiteSpace: 'nowrap' }}>{fL(it.litros)}</p>
            <p style={{ fontSize: 11, color: C.muted, whiteSpace: 'nowrap' }}>{fPesoFull(it.revenue)}</p>
            {it.unidades > 0 && (
              <p style={{ fontSize: 10, color: C.faint, whiteSpace: 'nowrap', marginTop: 1 }}>{fPrecioUnitario(it.revenue, it.unidades)}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

/** Detalle de productos de un pedido, en línea bajo su fila (ver
 *  DetallePedidosCliente). Mismo shape que DetallePedidoProductos
 *  pero sin encabezado propio ni borde: el pedido que lo contiene ya pone
 *  el contexto. */
function DetallePedidoProductosInline({ pedido }: { pedido: string }) {
  const [items, setItems] = useState<FilaPedidoProducto[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    fetch(`/api/ventas/detalle?tipo=pedido-productos&pedido=${encodeURIComponent(pedido)}`)
      .then(r => r.ok ? r.json() : r.json().then(j => Promise.reject(j.error ?? 'Error')))
      .then(d => { if (vivo) setItems(Array.isArray(d) ? d : []) })
      .catch(e => { if (vivo) setError(String(e)) })
    return () => { vivo = false }
  }, [pedido])

  if (error) return <p style={{ fontSize: 11, color: C.red, marginTop: 4, paddingLeft: 14 }}>No se pudo cargar el detalle.</p>
  if (!items) return <p style={{ fontSize: 11, color: C.muted, marginTop: 4, paddingLeft: 14 }}>Cargando…</p>
  if (items.length === 0) return null

  return (
    <div style={{ marginTop: 4, paddingLeft: 14, display: 'flex', flexDirection: 'column', gap: 4 }}>
      {items.map((it, j) => (
        <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            width: 5, height: 5, borderRadius: '50%', flexShrink: 0,
            background: it.categoria === 'Kombucha' ? C.green : it.categoria === 'Cerveza' ? C.hero : C.purple,
          }} />
          <span style={{ flex: 1, minWidth: 0, fontSize: 11, color: C.muted, wordBreak: 'break-word' }}>
            {[it.producto, it.envase, fUnidades(it.unidades, it.envase)].filter(Boolean).join(' · ')}
          </span>
          <span style={{ fontSize: 11, color: C.text, flexShrink: 0, whiteSpace: 'nowrap' }}>{fL(it.litros)}</span>
        </div>
      ))}
    </div>
  )
}

interface FilaPedidoCliente {
  pedido: string; fechaPedido: string | null
  estado: 'entregado' | 'pendiente' | 'sin_informar'
  fechaEntrega: string | null; fechaEntregaHora: string | null
  litros: number; revenue: number
}

/** Todos los pedidos de UN cliente en el rango, pendientes y entregados
 *  juntos en una sola lista por pedido — se despliega al tocar su fila en
 *  "Clientes que compraron", "Clientes con venta por entregar", "LOCALES"
 *  de un vendedor, y "Clientes que compraron este producto".
 *
 *  Pedido de Claudio (29-jul-2026): antes se mostraba un agregado "QUÉ SE LE
 *  VENDIÓ" (por producto, sin decir de qué pedido) separado de "PEDIDOS
 *  ENTREGADOS" (por pedido) — quedaba duplicado y confuso cuando había un
 *  solo pedido. Ahora es siempre UNA lista por pedido: número (#0...),
 *  fecha del pedido, estado (pendiente o entregado con su hora), y el
 *  detalle de productos de ese pedido.
 *
 *  Hay un tercer estado, "sin_informar": pedidos que el ERP todavía no marcó
 *  ni pendiente ni entregado (entrega_informada=false, sin fecha_entrega).
 *  Bug real detectado el 2026-08-03: con porEntrega=false (rangos anchos tipo
 *  "Año") el conteo del cliente los incluye -filtra sólo por fecha_pedido-
 *  pero antes no aparecían en ninguna de las dos listas de acá, así que el
 *  cliente mostraba "2 pedidos" y al tocarlo salía "Sin pedidos en este
 *  rango". Se piden aparte y sólo cuando porEntrega=false: con
 *  porEntrega=true jamás se cuentan (no tienen fecha_entrega para caer en el
 *  rango), así que pedirlos ahí sería ruido.
 *
 *  NO se muestra hora de pedido (sólo fecha): se intentó usar
 *  `ventas.created_at` como aproximación, pero el sync borra e reinserta
 *  filas completas en cada corrida -no hace UPDATE-, así que created_at
 *  refleja "última vez que el sync tocó esta fila", no cuándo se hizo el
 *  pedido (verificado: una sola corrida puso el mismo created_at a pedidos
 *  de hace 6 semanas y de hoy). La hora de ENTREGA sí es real, viene tal
 *  cual del ERP en fecha_entrega_hora. */
function DetallePedidosCliente({ cliente, desde, hasta, porEntrega }: {
  cliente: string; desde: string; hasta: string; porEntrega: boolean
}) {
  const [pedidos, setPedidos] = useState<FilaPedidoCliente[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    const base = `cliente=${encodeURIComponent(cliente)}&desde=${desde}&hasta=${hasta}`
    const fetches = [
      fetch(`/api/ventas/detalle?tipo=pedidos-pendientes-cliente&${base}`)
        .then(r => r.ok ? r.json() : r.json().then(j => Promise.reject(j.error ?? 'Error'))),
      fetch(`/api/ventas/detalle?tipo=pedidos-entregados-cliente&${base}&porEntrega=${porEntrega}`)
        .then(r => r.ok ? r.json() : r.json().then(j => Promise.reject(j.error ?? 'Error'))),
      porEntrega
        ? Promise.resolve([])
        : fetch(`/api/ventas/detalle?tipo=pedidos-sin-informar-cliente&${base}`)
            .then(r => r.ok ? r.json() : r.json().then(j => Promise.reject(j.error ?? 'Error'))),
    ] as const
    Promise.all(fetches)
      .then(([pend, ent, sinInformar]) => {
        if (!vivo) return
        const pendientes: FilaPedidoCliente[] = (Array.isArray(pend) ? pend : []).map((p: Record<string, unknown>) => ({
          pedido: String(p.pedido ?? ''), fechaPedido: (p.fechaPedido as string) ?? null,
          estado: 'pendiente', fechaEntrega: null, fechaEntregaHora: null,
          litros: Number(p.litros ?? 0), revenue: Number(p.revenue ?? 0),
        }))
        const entregados: FilaPedidoCliente[] = (Array.isArray(ent) ? ent : []).map((p: Record<string, unknown>) => ({
          pedido: String(p.pedido ?? ''), fechaPedido: (p.fechaPedido as string) ?? null,
          estado: 'entregado', fechaEntrega: (p.fechaEntrega as string) ?? null, fechaEntregaHora: (p.fechaEntregaHora as string) ?? null,
          litros: Number(p.litros ?? 0), revenue: Number(p.revenue ?? 0),
        }))
        const sinInformarFilas: FilaPedidoCliente[] = (Array.isArray(sinInformar) ? sinInformar : []).map((p: Record<string, unknown>) => ({
          pedido: String(p.pedido ?? ''), fechaPedido: (p.fechaPedido as string) ?? null,
          estado: 'sin_informar', fechaEntrega: null, fechaEntregaHora: null,
          litros: Number(p.litros ?? 0), revenue: Number(p.revenue ?? 0),
        }))
        setPedidos([...pendientes, ...entregados, ...sinInformarFilas])
      })
      .catch(e => { if (vivo) setError(String(e)) })
    return () => { vivo = false }
  }, [cliente, desde, hasta, porEntrega])

  if (error) return <p style={{ fontSize: 12, color: C.red, padding: '8px 0 2px' }}>No se pudo cargar: {error}</p>
  if (!pedidos) return <p style={{ fontSize: 12, color: C.muted, padding: '8px 0 2px' }}>Cargando…</p>
  if (pedidos.length === 0) return <p style={{ fontSize: 12, color: C.muted, padding: '8px 0 2px' }}>Sin pedidos en este rango.</p>

  const fechaOrden = (p: FilaPedidoCliente) => (p.estado === 'entregado' ? p.fechaEntrega : p.fechaPedido) ?? ''
  const ordenados = [...pedidos].sort((a, b) => fechaOrden(b).localeCompare(fechaOrden(a)))

  return (
    <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.line}`, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <p style={{ fontSize: 10, fontWeight: 700, color: C.faint, letterSpacing: '.06em' }}>PEDIDOS · {ordenados.length}</p>
      {ordenados.map(ped => {
        const horaEntrega = ped.fechaEntregaHora ? fHoraLiteral(ped.fechaEntregaHora) : null
        const colorEstado = ped.estado === 'entregado' ? C.green : ped.estado === 'pendiente' ? C.amber : C.faint
        return (
          <div key={ped.pedido}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', marginTop: 6, flexShrink: 0, background: colorEstado }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, color: C.text, lineHeight: 1.3 }}>#{ped.pedido}</p>
                <p style={{ fontSize: 11, color: C.muted, marginTop: 1 }}>
                  {ped.fechaPedido ? `Pedido el ${fFechaCorta(ped.fechaPedido)}` : 'Sin fecha de pedido'}
                </p>
                <p style={{ fontSize: 11, fontWeight: 600, marginTop: 1, color: colorEstado }}>
                  {ped.estado === 'entregado'
                    ? `Entregado el ${ped.fechaEntrega ? fFechaCorta(ped.fechaEntrega) : '—'}${horaEntrega ? ` a las ${horaEntrega}` : ''}`
                    : ped.estado === 'pendiente'
                      ? 'Pendiente de entrega'
                      : 'Sin información de entrega del ERP'}
                </p>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: C.text, whiteSpace: 'nowrap' }}>{fL(ped.litros)}</p>
                <p style={{ fontSize: 11, color: C.muted, whiteSpace: 'nowrap' }}>{fPesoFull(ped.revenue)}</p>
              </div>
            </div>
            <DetallePedidoProductosInline pedido={ped.pedido} />
          </div>
        )
      })}
    </div>
  )
}

type TipoDetalle = 'productos' | 'clientes' | 'envase' | 'pedidos-origen' | 'clientes-por-entregar' | 'pedidos-periodo'
/** Vistas intercambiables desde el selector de "Venta área comercial". */
const VISTAS_SELECTOR: { key: TipoDetalle; label: string }[] = [
  { key: 'clientes', label: 'Clientes' },
  { key: 'pedidos-periodo', label: 'Pedidos' },
  { key: 'productos', label: 'Productos' },
]

/** Totales del período tal como los muestra el dashboard. Se pasan ya
 *  calculados a propósito (ver comentario en el encabezado del sheet). */
interface TotalesDetalle {
  litros: number; revenue: number
  litrosPorEntregar: number; revenuePorEntregar: number
  litrosCerveza: number; litrosKombucha: number
  clientes: number; pedidos: number
}

function SheetDetalle({ tipo, envaseBucket, categoria, origenPedidos, porEntrega = true, conSelector = false, tituloBase, totales, desde, hasta, onClose, isDesktop = false }: {
  tipo: TipoDetalle
  envaseBucket?: string; categoria?: string; origenPedidos?: 'backlog' | 'mismo-periodo'
  /** Debe coincidir con el criterio de la tarjeta que abrió esto (ver ventas_dashboard_kpis) */
  porEntrega?: boolean
  /** Muestra el selector Clientes/Pedidos/Productos y deja cambiar de vista sin cerrar. */
  conSelector?: boolean
  /** Encabezado fijo cuando hay selector — el subtítulo cambia con la vista, el título no. */
  tituloBase?: string
  totales?: TotalesDetalle
  desde: string; hasta: string; onClose: () => void
  /** Desktop: modal centrado en vez de hoja pegada abajo a todo el ancho —
   *  una bottom sheet de 1600px de ancho se ve rota, no premium. */
  isDesktop?: boolean
}) {
  const [vista, setVista] = useState<TipoDetalle>(tipo)
  // Las filas se guardan junto a la vista de la que vinieron, y `filas` se
  // DERIVA de eso. Así, al cambiar de vista, la lista pasa a "cargando" sola
  // — sin resetear estado dentro del effect (cascada de renders) y sin el
  // riesgo de mostrar un instante las filas de la vista anterior.
  const [datos, setDatos] = useState<{ tipo: TipoDetalle; filas: (FilaProducto | FilaCliente | FilaPedido)[] } | null>(null)
  const [errorDe, setErrorDe] = useState<{ tipo: TipoDetalle; msg: string } | null>(null)
  const [busca, setBusca] = useState('')
  const [abierto, setAbierto] = useState<string | null>(null)

  // Con selector la vista la manda el estado interno; sin selector, la prop.
  const tipoActivo = conSelector ? vista : tipo
  const filas = datos && datos.tipo === tipoActivo ? datos.filas : null
  const error = errorDe && errorDe.tipo === tipoActivo ? errorDe.msg : null

  useEffect(() => {
    let vivo = true
    const qs = [
      tipoActivo === 'envase' ? `bucket=${encodeURIComponent(envaseBucket ?? '')}` : '',
      tipoActivo === 'productos' && categoria ? `categoria=${encodeURIComponent(categoria)}` : '',
      tipoActivo === 'pedidos-origen' ? `origen=${origenPedidos}` : '',
      `porEntrega=${porEntrega}`,
    ].filter(Boolean).join('&')
    fetch(`/api/ventas/detalle?tipo=${tipoActivo}&${qs}&desde=${desde}&hasta=${hasta}`)
      .then(r => r.ok ? r.json() : r.json().then(j => Promise.reject(j.error ?? 'Error')))
      .then(d => { if (vivo) setDatos({ tipo: tipoActivo, filas: Array.isArray(d) ? d : [] }) })
      .catch(e => { if (vivo) setErrorDe({ tipo: tipoActivo, msg: String(e) }) })
    return () => { vivo = false }
  }, [tipoActivo, envaseBucket, categoria, origenPedidos, porEntrega, desde, hasta])

  const esProd = tipoActivo === 'productos' || tipoActivo === 'envase'
  const esPedidos = tipoActivo === 'pedidos-origen' || tipoActivo === 'pedidos-periodo'
  const titulo = tituloBase ? tituloBase
    : tipoActivo === 'envase' ? `Productos · ${envaseBucket}`
    : tipoActivo === 'productos' && categoria ? `Productos · ${categoria}`
    : tipoActivo === 'pedidos-periodo' ? 'Pedidos del período'
    : tipoActivo === 'pedidos-origen' ? (origenPedidos === 'backlog' ? 'Pedidos de backlog anterior' : 'Pedidos tomados este período')
    : esProd ? 'Productos vendidos'
    : tipoActivo === 'clientes-por-entregar' ? 'Clientes con venta por entregar' : 'Clientes que compraron'

  const visibles = useMemo(() => {
    if (!filas) return []
    const q = busca.trim().toLowerCase()
    if (!q) return filas
    return filas.filter(f => {
      if (esProd) {
        const p = f as FilaProducto
        // También por envase y categoría: buscar "barril" o "kombucha" es
        // tan natural como buscar el nombre del producto.
        return p.producto.toLowerCase().includes(q) || p.envase.toLowerCase().includes(q) || p.categoria.toLowerCase().includes(q)
      }
      if (esPedidos) {
        const p = f as FilaPedido
        return p.pedido.toLowerCase().includes(q) || p.cliente.toLowerCase().includes(q)
          || (p.vendedor ?? '').toLowerCase().includes(q) || (p.localidad ?? '').toLowerCase().includes(q)
      }
      const c = f as FilaCliente
      return c.cliente.toLowerCase().includes(q) || (c.vendedor ?? '').toLowerCase().includes(q)
        || (c.localidad ?? '').toLowerCase().includes(q)
    })
  }, [filas, busca, esProd, esPedidos])

  const totalLitros = visibles.reduce((s, f) => s + f.litros, 0)

  /** Conteo del subtítulo. En Pedidos se desglosa entregados vs por entregar
   *  a propósito: la lista trae ambos, pero la tarjeta "Pedidos" de arriba
   *  cuenta sólo los entregados — mostrar el total pelado (ej. "133 pedidos"
   *  contra "98" arriba) parecería un número que no calza. */
  const resumenFilas = useMemo(() => {
    if (!filas) return null
    if (tipoActivo === 'pedidos-periodo') {
      const entregados = filas.filter(f => (f as FilaPedido).entregado === true).length
      const pendientes = filas.length - entregados
      return pendientes > 0
        ? `${fNum(entregados)} entregados · ${fNum(pendientes)} por entregar`
        : `${fNum(entregados)} ${entregados === 1 ? 'pedido' : 'pedidos'}`
    }
    return `${fNum(filas.length)} ${esProd ? 'productos' : esPedidos ? 'pedidos' : 'clientes'}`
  }, [filas, tipoActivo, esProd, esPedidos])

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(15,23,42,.45)', display: 'flex',
        flexDirection: 'column', justifyContent: isDesktop ? 'center' : 'flex-end',
        alignItems: isDesktop ? 'center' : 'stretch',
      }}
    >
      <div style={{
        background: C.bg, display: 'flex', flexDirection: 'column',
        ...(isDesktop
          ? { borderRadius: 20, maxHeight: '85vh', width: '640px', maxWidth: '92vw', boxShadow: '0 24px 60px rgba(15,23,42,.35)' }
          : { borderRadius: '20px 20px 0 0', maxHeight: '86vh' }),
      }}>
        {!isDesktop && (
        <div style={{ padding: '10px 0 6px', display: 'flex', justifyContent: 'center' }}>
          <div style={{ width: 38, height: 4, borderRadius: 2, background: '#CBD5E1' }} />
        </div>
        )}

        <div style={{ padding: isDesktop ? '16px 20px 12px' : '4px 16px 12px', borderBottom: `1px solid ${C.line}` }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 17, fontWeight: 800, color: C.text }}>{titulo}</p>
              <p style={{ fontSize: 12, color: C.muted }}>
                {fFechaCorta(desde)} – {fFechaCorta(hasta)}
                {resumenFilas && ` · ${resumenFilas}`}
              </p>
            </div>
            <button onClick={onClose} aria-label="Cerrar"
              style={{ width: 32, height: 32, borderRadius: '50%', border: 'none', background: '#E2E8F0', color: C.text, cursor: 'pointer', flexShrink: 0, fontSize: 15 }}>
              ✕
            </button>
          </div>

          {/* Totales del período — vienen del dashboard, NO se recalculan de las
              filas de cada vista: así Clientes, Pedidos y Productos muestran
              exactamente los mismos números y es imposible que "no calcen".
              (La vista Productos no puede desglosar lo pendiente por producto,
              y recalcular por vista habría dado tres totales distintos.) */}
          {totales && (
            <div style={{ marginTop: 10, background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: '10px 12px' }}>
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: 10.5, color: C.muted, fontWeight: 600 }}>Entregado</p>
                  <p style={{ fontSize: 15, fontWeight: 800, color: C.text, whiteSpace: 'nowrap' }}>{fL(totales.litros)}</p>
                  <p style={{ fontSize: 11.5, color: C.muted, whiteSpace: 'nowrap' }}>{fPesoFull(totales.revenue)}</p>
                </div>
                {totales.litrosPorEntregar > 0 && (
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontSize: 10.5, color: C.amber, fontWeight: 600 }}>Por entregar</p>
                    <p style={{ fontSize: 15, fontWeight: 800, color: C.amber, whiteSpace: 'nowrap' }}>{fL(totales.litrosPorEntregar)}</p>
                    <p style={{ fontSize: 11.5, color: C.amber, whiteSpace: 'nowrap' }}>{fPesoFull(totales.revenuePorEntregar)}</p>
                  </div>
                )}
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: 10.5, color: C.muted, fontWeight: 600 }}>Total</p>
                  <p style={{ fontSize: 15, fontWeight: 800, color: C.blue, whiteSpace: 'nowrap' }}>{fL(totales.litros + totales.litrosPorEntregar)}</p>
                  <p style={{ fontSize: 11.5, color: C.blue, whiteSpace: 'nowrap' }}>{fPesoFull(totales.revenue + totales.revenuePorEntregar)}</p>
                </div>
              </div>
              {(totales.litrosCerveza > 0 || totales.litrosKombucha > 0) && (
                <p style={{ fontSize: 11, color: C.muted, marginTop: 8, paddingTop: 8, borderTop: `1px solid ${C.line}` }}>
                  🍺 Cerveza {fL(totales.litrosCerveza)} · 🧃 Kombucha {fL(totales.litrosKombucha)}
                  {' · '}{fNum(totales.clientes)} {totales.clientes === 1 ? 'cliente' : 'clientes'}
                  {/* "entregados" explícito: es el mismo número de la tarjeta
                      "Pedidos" de arriba, que no cuenta los pendientes. */}
                  {' · '}{fNum(totales.pedidos)} {totales.pedidos === 1 ? 'pedido entregado' : 'pedidos entregados'}
                </p>
              )}
            </div>
          )}

          {conSelector && (
            <div style={{ display: 'flex', gap: 4, background: '#E2E8F0', borderRadius: 11, padding: 3, marginTop: 10 }}>
              {VISTAS_SELECTOR.map(v => {
                const on = v.key === vista
                return (
                  <button
                    key={v.key}
                    onClick={() => { setVista(v.key); setBusca(''); setAbierto(null) }}
                    style={{
                      flex: 1, padding: '8px 0', borderRadius: 9, border: 'none', cursor: 'pointer',
                      background: on ? C.card : 'transparent', color: on ? C.text : C.muted,
                      fontSize: 13, fontWeight: on ? 700 : 600, minHeight: 36,
                      boxShadow: on ? '0 1px 3px rgba(15,23,42,.12)' : 'none',
                    }}
                  >
                    {v.label}
                  </button>
                )
              })}
            </div>
          )}

          {/* Con selector el buscador queda SIEMPRE montado (aunque las filas
              estén cargando): si se desmontara al cambiar de vista, parpadearía
              y se perdería el foco del teclado en el celular. */}
          {(conSelector || (filas && filas.length > 6)) && (
            <input
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder={esProd ? 'Buscar producto…' : esPedidos ? 'Buscar pedido, cliente o vendedor…' : 'Buscar cliente o vendedor…'}
              style={{
                marginTop: 10, width: '100%', padding: '10px 12px', borderRadius: 10,
                border: `1px solid ${C.line}`, background: C.card, fontSize: 13, color: C.text, outline: 'none',
              }}
            />
          )}
          {/* Subtotal de la búsqueda — etiquetado aparte del total del período
              para que no se confunda con él. */}
          {busca.trim() && filas && (
            <p style={{ fontSize: 11.5, color: C.muted, marginTop: 7 }}>
              {visibles.length} {visibles.length === 1 ? 'resultado' : 'resultados'}
              {visibles.length > 0 && <> · <b style={{ color: C.text }}>{fL(totalLitros)}</b> · <b style={{ color: C.text }}>{fPesoFull(visibles.reduce((s, f) => s + f.revenue, 0))}</b></>}
            </p>
          )}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 16px 24px' }}>
          {error ? (
            <p style={{ textAlign: 'center', color: C.red, fontSize: 13, padding: 28 }}>No se pudo cargar: {error}</p>
          ) : !filas ? (
            <p style={{ textAlign: 'center', color: C.muted, fontSize: 13, padding: 28 }}>Cargando…</p>
          ) : visibles.length === 0 ? (
            <p style={{ textAlign: 'center', color: C.muted, fontSize: 13, padding: 28 }}>
              {busca ? 'Sin coincidencias'
                : esPedidos ? 'Sin pedidos en este origen'
                : tipo === 'clientes-por-entregar' ? 'Sin pedidos pendientes en este rango'
                : 'Sin ventas en este rango'}
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {visibles.map((f, i) => {
                const share = totalLitros > 0 ? (f.litros / totalLitros) * 100 : 0
                const p = esProd ? (f as FilaProducto) : null
                const ped = esPedidos ? (f as FilaPedido) : null
                const c = esProd || esPedidos ? null : (f as FilaCliente)
                const soloPendiente = !!c && c.litros === 0 && !!c.litrosPorEntregar && c.litrosPorEntregar > 0
                const pedPendiente = !!ped && ped.entregado === false
                const tintCat = p?.categoria === 'Kombucha' ? C.green : p?.categoria === 'Cerveza' ? C.hero : C.purple
                // Clave de expansión: cliente, pedido o producto+envase, según
                // la vista. Las tres caben en el mismo estado `abierto` porque
                // una instancia de SheetDetalle siempre muestra un solo tipo
                // de fila. producto+envase porque esa es la clave real de la
                // fila (un mismo producto puede salir dos veces con envases
                // distintos, ver ventas_detalle_productos).
                const claveExpand = c ? c.cliente : ped ? ped.pedido : p ? `${p.producto}|${p.envase}` : null
                const expandible = !!claveExpand
                const expandido = expandible && abierto === claveExpand
                const Fila = expandible ? 'button' : 'div'
                return (
                  <div key={i} style={{ background: C.card, border: `1px solid ${expandido ? C.blue : C.line}`, borderRadius: 12, padding: '11px 13px' }}>
                    <Fila
                      onClick={expandible ? () => setAbierto(prev => prev === claveExpand ? null : claveExpand) : undefined}
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
                            ? [p.envase, fUnidades(p.unidades, p.envase), p.categoria, `${p.clientes} ${p.clientes === 1 ? 'cliente' : 'clientes'}`].filter(Boolean).join(' · ')
                            : ped
                            ? (
                              <>
                                {[`#${ped.pedido}`, ped.vendedor, ped.localidad].filter(Boolean).join(' · ')}
                                {ped.fechaPedido && (
                                  <>
                                    {' · '}
                                    <span style={{ whiteSpace: 'nowrap' }}>pedido {fFechaCorta(ped.fechaPedido)}</span>
                                  </>
                                )}
                                {/* La hora sólo existe cuando el ERP informó la entrega
                                    (fecha_entrega_hora); el pedido en sí nunca trae hora. */}
                                {ped.fechaEntrega ? (
                                  <>
                                    {' · '}
                                    <span style={{ color: C.text, fontWeight: 600, whiteSpace: 'nowrap' }}>
                                      entregado {fFechaCorta(ped.fechaEntrega)}
                                      {ped.fechaEntregaHora && ` a las ${fHoraLiteral(ped.fechaEntregaHora)}`}
                                    </span>
                                  </>
                                ) : ped.entregado === false ? (
                                  <>
                                    {' · '}
                                    <span style={{ color: C.amber, fontWeight: 600, whiteSpace: 'nowrap' }}>por entregar</span>
                                  </>
                                ) : null}
                              </>
                            )
                            : (
                              <>
                                {[c!.vendedor, c!.localidad].filter(Boolean).join(' · ')}
                                {/* La fecha (+ hora real cuando la última actividad fue una
                                    entrega) es el criterio de orden de la lista (más
                                    reciente primero), así que va destacada para poder
                                    escanearla. Un pedido de HOY aunque siga pendiente
                                    ordena por delante de una entrega de ayer. */}
                                {c!.ultimaCompra && (
                                  <>
                                    {' · '}
                                    <span style={{ color: C.text, fontWeight: 600, whiteSpace: 'nowrap' }}>
                                      {fFechaCorta(c!.ultimaCompra)}
                                      {c!.ultimaCompraHora && ` a las ${fHoraLiteral(c!.ultimaCompraHora)}`}
                                    </span>
                                  </>
                                )}
                                {soloPendiente && (
                                  <>
                                    {' · '}
                                    <span style={{ color: C.amber, fontWeight: 600, whiteSpace: 'nowrap' }}>pendiente</span>
                                  </>
                                )}
                              </>
                            )}
                        </p>
                      </div>
                      {/* nowrap: globals.css pone overflow-wrap:anywhere a todo en
                          mobile y sin esto un monto largo se parte a mitad del número. */}
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        {soloPendiente ? (
                          <>
                            <p style={{ fontSize: 14, fontWeight: 700, color: C.amber, whiteSpace: 'nowrap' }}>{fL(c!.litrosPorEntregar!)}</p>
                            <p style={{ fontSize: 12, color: C.amber, whiteSpace: 'nowrap' }}>{fPesoFull(c!.revenuePorEntregar ?? 0)}</p>
                          </>
                        ) : (
                          <>
                            {/* Un pedido aún sin despachar se pinta ámbar, igual que
                                el "por entregar" del resto de la pantalla. */}
                            <p style={{ fontSize: 14, fontWeight: 700, color: pedPendiente ? C.amber : C.text, whiteSpace: 'nowrap' }}>{fL(f.litros)}</p>
                            <p style={{ fontSize: 12, color: pedPendiente ? C.amber : C.muted, whiteSpace: 'nowrap' }}>{fPesoFull(f.revenue)}</p>
                          </>
                        )}
                        {p && p.unidades > 0 && (
                          <p style={{ fontSize: 10, color: C.faint, whiteSpace: 'nowrap', marginTop: 1 }}>{fPrecioUnitario(p.revenue, p.unidades)}</p>
                        )}
                      </div>
                      {expandible && (
                        <ChevronDown size={16} color={expandido ? C.blue : C.faint} style={{
                          flexShrink: 0, marginTop: 3,
                          transform: expandido ? 'rotate(180deg)' : undefined, transition: 'transform .15s',
                        }} />
                      )}
                    </Fila>
                    {ped ? null : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ flex: 1, height: 5, borderRadius: 3, background: C.line, overflow: 'hidden' }}>
                          <div style={{ width: `${share}%`, height: '100%', background: p ? tintCat : C.blue, borderRadius: 3 }} />
                        </div>
                        <span style={{ fontSize: 11, color: C.faint, flexShrink: 0 }}>
                          {(f as FilaProducto | FilaCliente).pedidos} {(f as FilaProducto | FilaCliente).pedidos === 1 ? 'pedido' : 'pedidos'}
                        </span>
                      </div>
                    )}
                    {expandido && c && (
                      <DetallePedidosCliente cliente={c.cliente} desde={desde} hasta={hasta} porEntrega={porEntrega} />
                    )}
                    {expandido && ped && (
                      <DetallePedidoProductos pedido={ped.pedido} />
                    )}
                    {expandido && p && (
                      <DetalleClientesProducto producto={p.producto} envase={p.envase} desde={desde} hasta={hasta} porEntrega={porEntrega} />
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
/** Fila clickeable de "Mix de productos" dentro del hero —
 *  mismo patrón (ícono, barra, litros, % y flecha) pero con los tokens de
 *  color del hero en vez de los de tarjeta clara. Reemplaza a la extinta
 *  tarjeta blanca "PRODUCT MIX", que quedaba duplicando esta misma info.
 *
 *  Único % de variación por categoría en toda la pantalla — "Latas y
 *  barriles" (más abajo) ya NO muestra su propio %, a propósito: mostrar
 *  dos números de crecimiento distintos para la misma categoría (uno
 *  combinando lata+barril, otro por formato) generaba dudas constantes de
 *  que algo estaba mal calculado, aunque ambos fueran matemáticamente
 *  correctos. Se resolvió eliminando el segundo número, no explicándolo. */
function FilaMixHero({ nombre, litros, total, pct, color, colorSoft, emoji, onClick }: {
  nombre: string; litros: number; total: number; pct: number | null
  color: string; colorSoft: string; emoji: string; onClick: () => void
}) {
  const share = total > 0 ? (litros / total) * 100 : 0
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, width: '100%',
        background: 'transparent', border: 'none', padding: 0, cursor: 'pointer',
        textAlign: 'left', font: 'inherit', color: 'inherit',
      }}
    >
      <div style={{ width: 34, height: 34, borderRadius: 10, background: colorSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 16 }}>
        {emoji}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: '#fff', marginBottom: 5 }}>{nombre}</p>
        <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,.12)', overflow: 'hidden' }}>
          <div style={{ width: `${share}%`, height: '100%', background: color, borderRadius: 3, transition: 'width .4s' }} />
        </div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0, minWidth: 92 }}>
        <p style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{fL(litros)}</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#CBD5E1', background: 'rgba(255,255,255,.1)', borderRadius: 6, padding: '1px 5px' }}>
            {Math.round(share)}%
          </span>
          <Delta pct={pct} size={11} />
        </div>
      </div>
      <ChevronRight size={14} color="#94A3B8" style={{ flexShrink: 0 }} />
    </button>
  )
}

// ── Ranking ──────────────────────────────────────────────────────────────────
const COLOR_VEND = ['#0F172A', C.green, C.purple, '#EA580C', C.blue, '#0891B2']
function iniciales(nombre: string) {
  return nombre.split(/\s+/).filter(Boolean).map(p => p[0]).join('').slice(0, 2).toUpperCase()
}

/** Locales de un vendedor/región — se despliega al tocar su fila en el
 *  ranking. Cada local, a su vez, se puede desplegar para ver sus pedidos
 *  (reutiliza DetallePedidosCliente, igual que en "Clientes que
 *  compraron"). */
function DetalleClientesVendedor({ vendedor, desde, hasta, porEntrega }: {
  vendedor: string; desde: string; hasta: string; porEntrega: boolean
}) {
  const [clientes, setClientes] = useState<FilaCliente[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [abierto, setAbierto] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    const qs = `tipo=clientes-vendedor&vendedor=${encodeURIComponent(vendedor)}&desde=${desde}&hasta=${hasta}&porEntrega=${porEntrega}`
    fetch(`/api/ventas/detalle?${qs}`)
      .then(r => r.ok ? r.json() : r.json().then(j => Promise.reject(j.error ?? 'Error')))
      .then(d => { if (vivo) setClientes(Array.isArray(d) ? d : []) })
      .catch(e => { if (vivo) setError(String(e)) })
    return () => { vivo = false }
  }, [vendedor, desde, hasta, porEntrega])

  if (error) return <p style={{ fontSize: 12, color: C.red, padding: '8px 0 2px' }}>No se pudo cargar: {error}</p>
  if (!clientes) return <p style={{ fontSize: 12, color: C.muted, padding: '8px 0 2px' }}>Cargando…</p>
  if (clientes.length === 0) return <p style={{ fontSize: 12, color: C.muted, padding: '8px 0 2px' }}>Sin locales en este rango.</p>

  return (
    <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.line}`, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <p style={{ fontSize: 10, fontWeight: 700, color: C.faint, letterSpacing: '.06em' }}>LOCALES · {clientes.length}</p>
      {clientes.map(c => {
        const abiertoAqui = abierto === c.cliente
        const soloPendiente = c.litros === 0 && !!c.litrosPorEntregar && c.litrosPorEntregar > 0
        return (
          <div key={c.cliente} style={{ background: C.bg, border: `1px solid ${abiertoAqui ? C.blue : C.line}`, borderRadius: 10, padding: '9px 11px' }}>
            <button
              onClick={() => setAbierto(prev => prev === c.cliente ? null : c.cliente)}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 8, width: '100%', textAlign: 'left',
                background: 'transparent', border: 'none', padding: 0, font: 'inherit', color: 'inherit', cursor: 'pointer',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: C.text, lineHeight: 1.3, wordBreak: 'break-word' }}>{c.cliente}</p>
                <p style={{ fontSize: 10, color: C.muted, marginTop: 1 }}>
                  {[c.localidad, c.ultimaCompra ? fFechaCorta(c.ultimaCompra) : null].filter(Boolean).join(' · ')}
                </p>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                {soloPendiente ? (
                  <>
                    <p style={{ fontSize: 13, fontWeight: 700, color: C.amber, whiteSpace: 'nowrap' }}>{fL(c.litrosPorEntregar!)}</p>
                    <p style={{ fontSize: 11, color: C.amber, whiteSpace: 'nowrap' }}>{fPesoFull(c.revenuePorEntregar ?? 0)}</p>
                  </>
                ) : (
                  <>
                    <p style={{ fontSize: 13, fontWeight: 700, color: C.text, whiteSpace: 'nowrap' }}>{fL(c.litros)}</p>
                    <p style={{ fontSize: 11, color: C.muted, whiteSpace: 'nowrap' }}>{fPesoFull(c.revenue)}</p>
                  </>
                )}
              </div>
              <ChevronDown size={14} color={abiertoAqui ? C.blue : C.faint} style={{
                flexShrink: 0, marginTop: 2,
                transform: abiertoAqui ? 'rotate(180deg)' : undefined, transition: 'transform .15s',
              }} />
            </button>
            {soloPendiente ? (
              <p style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>Por entregar · sin nada despachado aún</p>
            ) : !!c.litrosPorEntregar && c.litrosPorEntregar > 0 && (
              <p style={{ fontSize: 11, color: C.amber, marginTop: 6 }}>
                + {fL(c.litrosPorEntregar)} por entregar
              </p>
            )}
            {abiertoAqui && (
              <DetallePedidosCliente cliente={c.cliente} desde={desde} hasta={hasta} porEntrega={porEntrega} />
            )}
          </div>
        )
      })}
    </div>
  )
}

/** Clientes que compraron UN producto — se despliega al tocar su fila en
 *  "Productos vendidos" o "Latas y barriles". Cada cliente, a su vez, se
 *  puede desplegar para ver TODOS sus pedidos (no sólo este producto),
 *  reutilizando DetallePedidosCliente igual que en el resto. */
function DetalleClientesProducto({ producto, envase, desde, hasta, porEntrega }: {
  producto: string; envase: string; desde: string; hasta: string; porEntrega: boolean
}) {
  const [clientes, setClientes] = useState<FilaCliente[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [abierto, setAbierto] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    const qs = `tipo=clientes-producto&producto=${encodeURIComponent(producto)}&envase=${encodeURIComponent(envase)}&desde=${desde}&hasta=${hasta}&porEntrega=${porEntrega}`
    fetch(`/api/ventas/detalle?${qs}`)
      .then(r => r.ok ? r.json() : r.json().then(j => Promise.reject(j.error ?? 'Error')))
      .then(d => { if (vivo) setClientes(Array.isArray(d) ? d : []) })
      .catch(e => { if (vivo) setError(String(e)) })
    return () => { vivo = false }
  }, [producto, envase, desde, hasta, porEntrega])

  if (error) return <p style={{ fontSize: 12, color: C.red, padding: '8px 0 2px' }}>No se pudo cargar: {error}</p>
  if (!clientes) return <p style={{ fontSize: 12, color: C.muted, padding: '8px 0 2px' }}>Cargando…</p>
  if (clientes.length === 0) return <p style={{ fontSize: 12, color: C.muted, padding: '8px 0 2px' }}>Sin clientes en este rango.</p>

  return (
    <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.line}`, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <p style={{ fontSize: 10, fontWeight: 700, color: C.faint, letterSpacing: '.06em' }}>CLIENTES · {clientes.length}</p>
      {clientes.map(c => {
        const abiertoAqui = abierto === c.cliente
        return (
          <div key={c.cliente} style={{ background: C.bg, border: `1px solid ${abiertoAqui ? C.blue : C.line}`, borderRadius: 10, padding: '9px 11px' }}>
            <button
              onClick={() => setAbierto(prev => prev === c.cliente ? null : c.cliente)}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 8, width: '100%', textAlign: 'left',
                background: 'transparent', border: 'none', padding: 0, font: 'inherit', color: 'inherit', cursor: 'pointer',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: C.text, lineHeight: 1.3, wordBreak: 'break-word' }}>{c.cliente}</p>
                <p style={{ fontSize: 10, color: C.muted, marginTop: 1 }}>
                  {[c.vendedor, c.localidad, c.ultimaCompra ? fFechaCorta(c.ultimaCompra) : null].filter(Boolean).join(' · ')}
                </p>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: C.text, whiteSpace: 'nowrap' }}>{fL(c.litros)}</p>
                <p style={{ fontSize: 11, color: C.muted, whiteSpace: 'nowrap' }}>{fPesoFull(c.revenue)}</p>
              </div>
              <ChevronDown size={14} color={abiertoAqui ? C.blue : C.faint} style={{
                flexShrink: 0, marginTop: 2,
                transform: abiertoAqui ? 'rotate(180deg)' : undefined, transition: 'transform .15s',
              }} />
            </button>
            {abiertoAqui && <DetallePedidosCliente cliente={c.cliente} desde={desde} hasta={hasta} porEntrega={porEntrega} />}
          </div>
        )
      })}
    </div>
  )
}

/**
 * Fila del ranking en DOS niveles: arriba el nombre completo (sin truncar) y
 * abajo las métricas. Antes iba todo en una línea con 6 columnas y los nombres
 * largos ("Claudio Heufemann", "Yadro Fabijancic") quedaban cortados.
 * Se toca para desplegar los locales de esa cartera (antes navegaba a
 * /ventas/ranking; ahora es in-situ, igual que "Clientes que compraron").
 */
function FilaVendedor({ v, pos, total, desde, hasta, porEntrega }: {
  v: VendedorRango; pos: number; total: number; desde: string; hasta: string; porEntrega: boolean
}) {
  const [abierto, setAbierto] = useState(false)
  const share = total > 0 ? (v.litros / total) * 100 : 0
  const color = COLOR_VEND[pos % COLOR_VEND.length]
  return (
    <div style={{ borderTop: pos === 0 ? 'none' : `1px solid ${C.line}`, padding: '12px 0' }}>
      <button
        onClick={() => setAbierto(a => !a)}
        style={{ display: 'block', width: '100%', textAlign: 'left', background: 'transparent', border: 'none', padding: 0, font: 'inherit', color: 'inherit', cursor: 'pointer' }}
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
          <ChevronDown size={15} color={abierto ? C.blue : C.faint} style={{
            flexShrink: 0, transform: abierto ? 'rotate(180deg)' : undefined, transition: 'transform .15s',
          }} />
        </div>

        {/* Métricas, alineadas bajo el nombre */}
        <div style={{ paddingLeft: 58 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 2 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{fL(v.litros)}</span>
            <span style={{ fontSize: 12, color: C.muted }}>{share.toFixed(1)}% del total</span>
            <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Delta pct={variacion(v.litros, v.litrosPrev)} size={11} />
              <span style={{ fontSize: 10, color: C.faint }}>vs ant.</span>
            </span>
          </div>
          <p style={{ fontSize: 12, fontWeight: 600, color: C.muted, marginBottom: 6 }}>{fPesoFull(v.revenue)}</p>
          <div style={{ height: 6, borderRadius: 3, background: C.line, overflow: 'hidden' }}>
            <div style={{ width: `${share}%`, height: '100%', background: color, borderRadius: 3, transition: 'width .4s' }} />
          </div>
          {v.litrosPorEntregar > 0 && (
            <p style={{ fontSize: 11, color: C.amber, marginTop: 6 }}>
              + {fL(v.litrosPorEntregar)} · {fPesoFull(v.revenuePorEntregar)} por entregar
              <span style={{ color: C.muted }}> · {fL(v.litros + v.litrosPorEntregar)} total</span>
            </p>
          )}
        </div>
      </button>
      {abierto && (
        <div style={{ paddingLeft: 58 }}>
          <DetalleClientesVendedor vendedor={v.vendedor} desde={desde} hasta={hasta} porEntrega={porEntrega} />
        </div>
      )}
    </div>
  )
}

// ── Vista ────────────────────────────────────────────────────────────────────
export default function VentasHoyClient({ data, veComision = false, veComisionVendedor = false }: {
  data: HoyData; veComision?: boolean; veComisionVendedor?: boolean
}) {
  const router = useRouter()
  // Desktop usa un layout de dos columnas (grid) para aprovechar el ancho de
  // pantalla; mobile sigue siendo una sola columna apilada. Mismo patrón
  // isDesktop que ya usan DashboardClient y MisionesClient — acá faltaba.
  const [isDesktop, setIsDesktop] = useState(false)
  useEffect(() => {
    const check = () => setIsDesktop(window.innerWidth >= 1024)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])
  // Si la URL trae un rango a mano, se entra directo en esa vista
  const [rango, setRango] = useState<RangoKey>(data.custom ? 'custom' : 'periodo')
  const [periodoIdx, setPeriodoIdx] = useState(0)   // 0 = período activo
  const [showSettings, setShowSettings] = useState(false)
  const [detalle, setDetalle] = useState<TipoDetalle | null>(null)
  const [detalleEnvaseBucket, setDetalleEnvaseBucket] = useState<string | undefined>(undefined)
  const [detalleCategoria, setDetalleCategoria] = useState<string | undefined>(undefined)
  const [detalleOrigenPedidos, setDetalleOrigenPedidos] = useState<'backlog' | 'mismo-periodo' | undefined>(undefined)
  const [detalleConSelector, setDetalleConSelector] = useState(false)
  const [detalleTitulo, setDetalleTitulo] = useState<string | undefined>(undefined)
  function abrirDetalle(tipo: TipoDetalle, extra?: {
    envaseBucket?: string; categoria?: string; origenPedidos?: 'backlog' | 'mismo-periodo'
    conSelector?: boolean; titulo?: string
  }) {
    setDetalleEnvaseBucket(extra?.envaseBucket)
    setDetalleCategoria(extra?.categoria)
    setDetalleOrigenPedidos(extra?.origenPedidos)
    setDetalleConSelector(extra?.conSelector ?? false)
    setDetalleTitulo(extra?.titulo)
    setDetalle(tipo)
  }
  const [showPeriodos, setShowPeriodos] = useState(false)
  // Litros/monto de TODOS los períodos (no sólo los recientes que ya vienen
  // calculados) — se piden recién al abrir el selector, una sola vez, para
  // no cargar cada período completo (ranking, mix, envases) en cada visita
  // a /ventas. Antes el selector no mostraba nada para los períodos viejos,
  // lo que se veía roto (pedido de Claudio: "se sigue sin ver nada").
  const [resumenPeriodos, setResumenPeriodos] = useState<Record<number, { litros: number; revenue: number }> | null>(null)
  useEffect(() => {
    if (!showPeriodos || resumenPeriodos !== null) return
    fetch('/api/ventas/periodos-resumen')
      .then(r => r.ok ? r.json() : Promise.reject())
      .then((filas: { id: number; litros: number; revenue: number }[]) => {
        const mapa: Record<number, { litros: number; revenue: number }> = {}
        for (const f of filas) mapa[f.id] = { litros: f.litros, revenue: f.revenue }
        setResumenPeriodos(mapa)
      })
      .catch(() => setResumenPeriodos({}))
  }, [showPeriodos, resumenPeriodos])
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
  // Si el rango a mano calza con un período histórico (elegido desde el
  // selector, no tipeado a mano), mostrar su nombre en vez de "Rango elegido".
  const customPeriodoNombre = useMemo(() => {
    if (!data.custom) return null
    return data.periodosDisponibles.find(p => p.inicio === data.custom!.desde && p.fin === data.custom!.hasta)?.nombre ?? null
  }, [data.custom, data.periodosDisponibles])

  // "Período" = el período 24→23 elegido; "custom" = rango a mano (viene del
  // servidor por searchParams, ver aplicarRango); el resto son rangos
  // relativos a hoy. Si por lo que sea `data.custom` llegara vacío (rango a
  // mano roto o inexistente), cae al período activo en vez de a null -mejor
  // mostrar algo con sentido que "No hay períodos de venta configurados".
  const periodoActivoDatos = data.periodos[0]?.datos ?? null
  const d: DatosRango | null =
    rango === 'periodo' ? (periodoSel?.datos ?? periodoActivoDatos)
    : rango === 'custom' ? (data.custom ?? periodoActivoDatos)
    : (data.rangos[rango as Exclude<RangoKey, 'periodo' | 'custom'>] ?? periodoActivoDatos)

  function aplicarRango(desde: string, hasta: string) {
    if (!desde || !hasta) return
    // Navegación de página COMPLETA a propósito, no router.push() de Next.
    // Ya se probaron dos variantes con el router del cliente (con y sin
    // router.refresh(), con y sin setRango('custom')) y en producción seguía
    // sin traer los datos nuevos para períodos fuera de la ventana reciente
    // -la pantalla se quedaba mostrando el período de antes sin avisar error
    // ni actualizar-. Un recambio de documento entero no puede quedar a
    // medias: el navegador SIEMPRE pide la página de nuevo al servidor
    // (force-dynamic en page.tsx) y la vuelve a montar desde cero.
    window.location.assign(`/ventas?desde=${desde}&hasta=${hasta}`)
  }
  function limpiarRango() {
    window.location.assign('/ventas')
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

  const { actual, previo } = d
  const metaLitros = rango === 'periodo' ? (periodoSel?.metaLitros ?? 0) : 0

  const ticket = actual.pedidos > 0 ? actual.revenue / actual.pedidos : 0

  const hoyTxt = new Date().toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Santiago' })
  // La meta se define por período de venta (24→23), así que sólo aplica ahí
  const avanceMeta = metaLitros > 0 ? Math.min(100, (actual.litros / metaLitros) * 100) : null

  return (
    <div style={{ background: C.bg, minHeight: '100%', margin: -1, padding: '1px 0 0' }}>
      <div style={{
        maxWidth: isDesktop ? 2200 : 760, margin: '0 auto',
        padding: isDesktop ? '28px 32px 48px' : '14px 16px 32px',
        display: 'flex', flexDirection: 'column', gap: isDesktop ? 20 : 14,
      }}>

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
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, position: 'relative' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: C.text, letterSpacing: '-0.5px', lineHeight: 1.1 }}>Ventas</h1>
            <p style={{ fontSize: 12, color: C.muted, textTransform: 'capitalize', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {hoyTxt}
            </p>
          </div>
          <div style={{ flexShrink: 0 }}>
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
                  position: 'absolute', top: 'calc(100% + 6px)', left: '50%', transform: 'translateX(-50%)', width: 280, maxWidth: '80vw', zIndex: 41,
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

          <NotificationsBell inline variant="light" />
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
                    : rango === 'custom' ? (customPeriodoNombre ?? 'Rango elegido')
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
                  <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                    {data.periodosDisponibles.map(p => {
                      // Los primeros N (ventana visible) ya traen sus datos
                      // calculados y se seleccionan al instante; el resto del
                      // historial navega al servidor a calcularlos (mismo
                      // mecanismo que "elegir fechas" a mano).
                      const iEager = data.periodos.findIndex(pe => pe.id === p.id)
                      const eager = iEager >= 0 ? data.periodos[iEager] : null
                      const on = eager ? (rango === 'periodo' && periodoIdx === iEager) : (rango === 'custom' && data.custom?.desde === p.inicio && data.custom?.hasta === p.fin)
                      return (
                        <button
                          key={p.id}
                          onClick={() => {
                            if (eager) { setPeriodoIdx(iEager); setRango('periodo'); setShowPeriodos(false) }
                            else aplicarRango(p.inicio, p.fin)
                          }}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
                            background: on ? C.blueSoft : 'transparent', border: 'none',
                            borderTop: `1px solid ${C.line}`, padding: '10px 12px', cursor: 'pointer',
                          }}
                        >
                          <span style={{ minWidth: 0, flex: 1 }}>
                            <span style={{ display: 'block', fontSize: 13, fontWeight: on ? 700 : 500, color: on ? C.blue : C.text }}>
                              {p.nombre}{eager?.activo ? ' · en curso' : ''}
                            </span>
                            <span style={{ display: 'block', fontSize: 11, color: C.muted }}>
                              {fFechaCorta(p.inicio)} – {fFechaCorta(p.fin)}
                            </span>
                          </span>
                          {(() => {
                            // Los eager ya tienen su dato calculado en memoria;
                            // el resto se pide una vez al abrir el selector.
                            if (eager) return (
                              <span style={{ textAlign: 'right', flexShrink: 0 }}>
                                <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: on ? C.blue : C.muted }}>{fL(eager.datos.actual.litros)}</span>
                                <span style={{ display: 'block', fontSize: 10, color: C.faint }}>{fPesoFull(eager.datos.actual.revenue)}</span>
                              </span>
                            )
                            const r = resumenPeriodos?.[p.id]
                            if (r) return (
                              <span style={{ textAlign: 'right', flexShrink: 0 }}>
                                <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: on ? C.blue : C.muted }}>{fL(r.litros)}</span>
                                <span style={{ display: 'block', fontSize: 10, color: C.faint }}>{fPesoFull(r.revenue)}</span>
                              </span>
                            )
                            if (resumenPeriodos === null) return <span style={{ fontSize: 11, color: C.faint, flexShrink: 0 }}>…</span>
                            return null
                          })()}
                        </button>
                      )
                    })}
                  </div>

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

        {/* Desktop: grid de dos columnas para aprovechar el ancho — columna
            principal (comisión, hero, KPIs, venta de equipo, ranking) y
            columna lateral (desgloses secundarios). En mobile ambos <div>
            quedan en una sola columna (gridTemplateColumns:1fr) y apilados
            en el mismo orden de siempre, así el recorrido no cambia — sólo
            cómo se agrupan visualmente en pantallas anchas. */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: isDesktop ? 'minmax(0,1fr) 380px' : '1fr',
          gap: isDesktop ? 20 : 14, alignItems: 'start',
        }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: isDesktop ? 20 : 14, minWidth: 0 }}>

        {/* "Lo que gano yo" + hero de ventas, uno al lado del otro cuando el
            ancho alcanza (auto-fit: si no entran los 480px mínimos, caen a
            una sola columna solos, igual que en mobile) — antes cada uno
            ocupaba TODO el ancho de la columna principal por separado, dos
            tarjetas navy angostas de contenido apiladas una arriba de la
            otra con montones de aire a los costados. */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: isDesktop ? 'repeat(auto-fit, minmax(480px, 1fr))' : '1fr',
          gap: isDesktop ? 20 : 14, alignItems: 'start',
        }}>
        {/* Remuneración variable propia (cláusula NOVENA del contrato). Va
            arriba de todo, antes del hero, por pedido de Claudio: es lo que
            quiere ver primero al abrir. Sólo se monta con el permiso
            ve_comision_gerente — no lo ven los demás admins. */}
        {veComision && (
          <MiComision
            key={`${d.desde}_${d.hasta}`}
            isDesktop={isDesktop}
            desde={d.desde}
            hasta={d.hasta}
            nombrePeriodo={
              rango === 'periodo' && periodoSel ? periodoSel.nombre
                : rango === 'custom' ? (customPeriodoNombre ?? 'Rango elegido')
                : (RANGOS.find(r => r.key === rango)?.label ?? 'Período')
            }
          />
        )}

        {/* Remuneración variable propia (cláusula TERCERA del contrato) para
            Yadro y Marcelo — pedido de Claudio: debe vivir en Ventas, en el
            mismo lugar que la suya, no en Terreno. */}
        {veComisionVendedor && (
          <MiComisionVendedor
            key={`vendedor_${d.desde}_${d.hasta}`}
            isDesktop={isDesktop}
            desde={d.desde}
            hasta={d.hasta}
            nombrePeriodo={
              rango === 'periodo' && periodoSel ? periodoSel.nombre
                : rango === 'custom' ? (customPeriodoNombre ?? 'Rango elegido')
                : (RANGOS.find(r => r.key === rango)?.label ?? 'Período')
            }
          />
        )}

        {/* Hero — rediseño pedido por Claudio: "por entregar" y "total" pasan
            a ser tan grandes como litros entregado (antes iban en una línea
            de 12px); se saca Clientes; se agrega el monto total de la venta
            completa (entregado + por entregar, no sólo lo ya entregado); y
            abajo "Mix de productos" con el mismo look que tenía la extinta
            tarjeta blanca "PRODUCT MIX" (duplicaba esta info). Va en un
            <div> aparte, no dentro del <button> del hero, porque cada
            categoría necesita ser su propio botón clickeable — un <button>
            no puede anidar otro. El overflow:hidden del contenedor exterior
            es lo que hace que las dos piezas se vean como una sola tarjeta
            con esquinas redondeadas. */}
        <div style={{ borderRadius: 20, overflow: 'hidden' }}>
        <button
          onClick={() => abrirDetalle('productos')}
          style={{ background: C.hero, padding: 20, color: '#fff', border: 'none', cursor: 'pointer', textAlign: 'left', width: '100%', display: 'block', font: 'inherit' }}
        >
          <p style={{ fontSize: 11, letterSpacing: '0.08em', color: '#94A3B8', fontWeight: 600, marginBottom: 8 }}>
            {rango === 'periodo' && periodoSel
              ? `VENTAS · ${periodoSel.nombre.toUpperCase()}`
              : rango === 'custom' ? `VENTAS · ${(customPeriodoNombre ?? 'RANGO ELEGIDO').toUpperCase()}` : 'VENTAS DEL RANGO'}
          </p>
          <p style={{ fontSize: isDesktop ? 56 : 42, fontWeight: 800, letterSpacing: '-2px', lineHeight: 1 }}>
            {actual.litros.toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
            <span style={{ fontSize: isDesktop ? 26 : 20, marginLeft: 4, color: '#CBD5E1' }}>L</span>
            <span style={{ fontSize: isDesktop ? 15 : 13, fontWeight: 500, color: '#94A3B8', marginLeft: 8 }}>{d.porEntrega ? 'entregado' : 'pedido'}</span>
          </p>
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
          {/* Cifras absolutas del período anterior — antes solo se veía el %,
              y para comparar bien (pedido de Claudio) hace falta ver también
              cuánto fue en litros y en plata, no solo la variación relativa. */}
          {previo.litros > 0 && (
            <p style={{ fontSize: 12, color: '#94A3B8', marginTop: 4 }}>
              Período anterior: <span style={{ color: '#CBD5E1', fontWeight: 600 }}>{fL(previo.litros)} · {fPesoFull(previo.revenue)}</span>
            </p>
          )}
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

          {/* Desktop: litros por entregar/total y el bloque de plata van uno
              al lado del otro (antes, uno abajo del otro) — mismo contenido y
              mismas etiquetas, sólo se usa el ancho en vez de apilar hacia
              abajo. En mobile queda exactamente como antes. */}
          <div style={isDesktop
            ? { display: 'grid', gridTemplateColumns: d.entregas.litrosPorEntregar > 0 ? '1fr 1fr' : '1fr', gap: 28, marginTop: 20, paddingTop: 20, borderTop: '1px solid rgba(255,255,255,.1)', alignItems: 'start' }
            : undefined}>
            {d.entregas.litrosPorEntregar > 0 && (
              <>
                {!isDesktop && <div style={{ height: 1, background: 'rgba(255,255,255,.1)', margin: '18px 0' }} />}
                <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
                  {/* Mismo texto ("Por entregar" y "Total") en las dos etiquetas
                      para que midan lo mismo y los números de abajo queden
                      parejos — antes "Total (entregado + por entregar)" se
                      partía en dos líneas y desalineaba el número. */}
                  <div style={{ flex: '1 1 130px', minWidth: 0 }}>
                    <p style={{ fontSize: 12, color: '#94A3B8', marginBottom: 4, whiteSpace: 'nowrap' }}>Por entregar</p>
                    <p style={{ fontSize: isDesktop ? 34 : 28, fontWeight: 800, letterSpacing: '-1px', lineHeight: 1, color: '#F59E0B' }}>
                      {fL(d.entregas.litrosPorEntregar)}
                    </p>
                  </div>
                  <div style={{ flex: '1 1 130px', minWidth: 0 }}>
                    <p style={{ fontSize: 12, color: '#94A3B8', marginBottom: 4, whiteSpace: 'nowrap' }}>Total</p>
                    <p style={{ fontSize: isDesktop ? 34 : 28, fontWeight: 800, letterSpacing: '-1px', lineHeight: 1 }}>
                      {fL(actual.litros + d.entregas.litrosPorEntregar)}
                    </p>
                  </div>
                </div>
              </>
            )}

            {!isDesktop && <div style={{ height: 1, background: 'rgba(255,255,255,.1)', margin: '18px 0' }} />}
            <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
              <span style={{ width: 42, height: 42, borderRadius: 12, background: 'rgba(16,185,129,.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <DollarSign size={20} color="#34D399" />
              </span>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: 11, color: '#94A3B8', marginBottom: 1 }}>Total de la venta completa</p>
                <p style={{ fontSize: isDesktop ? 32 : 26, fontWeight: 800, letterSpacing: '-0.5px', lineHeight: 1.1 }}>
                  {fPesoFull(actual.revenue)}
                </p>
                {d.entregas.revenuePorEntregar > 0 && (
                  <>
                    <p style={{ fontSize: 11, color: '#94A3B8', marginTop: 3 }}>
                      Por entregar <span style={{ color: '#F59E0B', fontWeight: 600 }}>{fPesoFull(d.entregas.revenuePorEntregar)}</span>
                    </p>
                    <p style={{ fontSize: 11, color: '#94A3B8', marginTop: 3 }}>
                      Total (entregado + por entregar) <span style={{ color: '#CBD5E1', fontWeight: 600 }}>{fPesoFull(actual.revenue + d.entregas.revenuePorEntregar)}</span>
                    </p>
                  </>
                )}
                {actual.pedidos > 0 && (
                  <p style={{ fontSize: 11, color: '#94A3B8', marginTop: 3 }}>
                    Ticket promedio <span style={{ color: '#CBD5E1', fontWeight: 600 }}>{fPesoFull(ticket)}</span>
                  </p>
                )}
              </div>
            </div>
          </div>

        </button>

        {/* Mix de productos — reemplaza a la extinta tarjeta blanca
            "PRODUCT MIX" (misma info, quedaba duplicada). Cada categoría es
            clickeable y abre el mismo detalle que ya abría la tarjeta
            blanca; el litraje y la plata sumados siguen mostrándose en la
            fila "Total" de abajo. */}
        <div style={{ background: C.hero, padding: '0 20px 20px', color: '#fff' }}>
          <div style={{ height: 1, background: 'rgba(255,255,255,.1)', margin: '0 0 18px' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
            <div>
              <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.04em' }}>MIX DE PRODUCTOS</p>
              {/* Aclaración pedida por Claudio: el % de variación acá suma lata +
                  barril de la categoría — puede no calzar con el % de la tarjeta
                  "Latas y barriles" de más abajo, que mide cada formato aparte
                  (ej. si el barril de algo cae mucho más fuerte que la lata, el
                  combinado queda entre medio de los dos, no igual a ninguno). */}
              <p style={{ fontSize: 10.5, color: '#64748B', marginTop: 1 }}>% incluye lata + barril combinados</p>
            </div>
            <span style={{ fontSize: 12, color: '#94A3B8' }}>{fNum(actual.clientes)} clientes</span>
          </div>
          {actual.litros === 0 ? (
            <p style={{ fontSize: 13, color: '#94A3B8', textAlign: 'center', padding: '14px 0' }}>Sin ventas en este período</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <FilaMixHero nombre="Cerveza" emoji="🍺" litros={actual.litrosCerveza} total={actual.litros}
                pct={variacion(actual.litrosCerveza, previo.litrosCerveza)} color="#F59E0B" colorSoft="rgba(245,158,11,.18)"
                onClick={() => abrirDetalle('productos', { categoria: 'Cerveza' })} />
              <FilaMixHero nombre="Kombucha" emoji="🧃" litros={actual.litrosKombucha} total={actual.litros}
                pct={variacion(actual.litrosKombucha, previo.litrosKombucha)} color="#34D399" colorSoft="rgba(52,211,153,.18)"
                onClick={() => abrirDetalle('productos', { categoria: 'Kombucha' })} />
              {actual.litrosOtros > 0 && (
                <FilaMixHero nombre="Otros" emoji="📦" litros={actual.litrosOtros} total={actual.litros}
                  pct={variacion(actual.litrosOtros, previo.litrosOtros)} color="#A78BFA" colorSoft="rgba(167,139,250,.18)"
                  onClick={() => abrirDetalle('productos', { categoria: 'Otros' })} />
              )}
              <div style={{ height: 1, background: 'rgba(255,255,255,.08)', margin: '2px 0' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#CBD5E1', flex: 1, minWidth: 0 }}>Total</span>
                <span style={{ fontSize: 13, fontWeight: 700, flexShrink: 0 }}>{fL(actual.litros)}</span>
                <span style={{ fontSize: 12, color: '#CBD5E1', fontWeight: 600, flexShrink: 0, textAlign: 'right', whiteSpace: 'nowrap' }}>{fPesoFull(actual.revenue)}</span>
              </div>
            </div>
          )}
        </div>
        </div>
        </div>

        {/* KPIs — en desktop, grid con más columnas a medida que hay ancho
            disponible: antes cada tarjeta se estiraba a los 760px con casi
            todo vacío a la derecha del ícono; en un grid usan el espacio real. */}
        <div style={isDesktop
          ? { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }
          : { display: 'flex', flexDirection: 'column', gap: 10 }}>
          <KpiCard big={isDesktop} icon={Droplet} tint={C.blue} tintSoft={C.blueSoft} label="Litros vendidos"
            valor={fL(actual.litros)} pct={variacion(actual.litros, previo.litros)}
            onClick={() => abrirDetalle('productos')} />
          <KpiCard big={isDesktop} icon={Users} tint={C.green} tintSoft={C.greenSoft} label="Ventas por Clientes"
            valor={fNum(actual.clientes)} pct={variacion(actual.clientes, previo.clientes)}
            onClick={() => abrirDetalle('clientes')} />
          <KpiCard big={isDesktop} icon={ShoppingBag} tint={C.purple} tintSoft={C.purpleSoft} label="Pedidos"
            valor={fNum(actual.pedidos)} pct={variacion(actual.pedidos, previo.pedidos)}
            onClick={() => abrirDetalle('productos')} />
          <KpiCard big={isDesktop} icon={Truck} tint={C.amber} tintSoft={C.amberSoft} label="Venta por entregar"
            valor={fPesoFull(d.entregas.revenuePorEntregar)} pct={null}
            onClick={() => abrirDetalle('clientes-por-entregar')} />
        </div>

        {/* Venta área comercial — el "total" del equipo, justo antes del
            ranking que lo desglosa por vendedor. Los números son los MISMOS
            de las tarjetas de arriba (entregado = Litros vendidos, por
            entregar = Venta por entregar): es la misma verdad agrupada, no
            otro cálculo. Es la única puerta de entrada al detalle con
            selector Clientes/Pedidos/Productos. */}
        {(() => {
          const litrosTotal = actual.litros + d.entregas.litrosPorEntregar
          const revenueTotal = actual.revenue + d.entregas.revenuePorEntregar
          const pctEntregado = litrosTotal > 0 ? (actual.litros / litrosTotal) * 100 : 0
          return (
            <button
              onClick={() => abrirDetalle('clientes', { conSelector: true, titulo: 'Venta área comercial' })}
              style={{
                background: C.card, borderRadius: 18, padding: isDesktop ? 24 : 18, width: '100%',
                border: `1px solid ${C.line}`, textAlign: 'left', cursor: 'pointer', font: 'inherit', color: C.text,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <span style={{ width: 36, height: 36, borderRadius: 11, background: C.amberSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Building2 size={18} color={C.amber} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: C.text, letterSpacing: '0.04em' }}>VENTA ÁREA COMERCIAL</p>
                  <p style={{ fontSize: 11, color: C.muted, marginTop: 1 }}>
                    Todos los vendedores · {fNum(actual.clientes)} {actual.clientes === 1 ? 'cliente' : 'clientes'}
                  </p>
                </div>
                <span style={{ width: 34, height: 34, borderRadius: '50%', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <ArrowRight size={16} color="#F59E0B" />
                </span>
              </div>

              <p style={{ fontSize: isDesktop ? 40 : 30, fontWeight: 800, color: C.text, letterSpacing: '-1px', lineHeight: 1 }}>
                {fPesoFull(revenueTotal)}
              </p>
              <p style={{ fontSize: 12.5, color: C.muted, marginTop: 4 }}>
                {fL(litrosTotal)} · entregado + por entregar
              </p>

              {litrosTotal > 0 && (
                <div style={{ display: 'flex', height: 7, borderRadius: 4, overflow: 'hidden', background: C.line, marginTop: 14 }}>
                  <div style={{ width: `${pctEntregado}%`, background: C.green }} />
                  <div style={{ width: `${100 - pctEntregado}%`, background: C.amber }} />
                </div>
              )}

              <div style={isDesktop
                ? { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 24, marginTop: 16 }
                : { display: 'flex', gap: 16, marginTop: 12, flexWrap: 'wrap' }}>
                <div style={isDesktop ? { minWidth: 0 } : { flex: '1 1 130px', minWidth: 0 }}>
                  <p style={{ fontSize: 11, color: C.muted, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: C.green, flexShrink: 0 }} />
                    Entregado
                  </p>
                  <p style={{ fontSize: isDesktop ? 24 : 17, fontWeight: 800, color: C.green, letterSpacing: '-0.4px', marginTop: 3, whiteSpace: 'nowrap' }}>
                    {fL(actual.litros)}
                  </p>
                  <p style={{ fontSize: 12, color: C.muted, whiteSpace: 'nowrap' }}>{fPesoFull(actual.revenue)}</p>
                </div>
                <div style={isDesktop ? { minWidth: 0 } : { flex: '1 1 130px', minWidth: 0 }}>
                  <p style={{ fontSize: 11, color: C.muted, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: C.amber, flexShrink: 0 }} />
                    Por entregar
                  </p>
                  <p style={{ fontSize: isDesktop ? 24 : 17, fontWeight: 800, color: C.amber, letterSpacing: '-0.4px', marginTop: 3, whiteSpace: 'nowrap' }}>
                    {fL(d.entregas.litrosPorEntregar)}
                  </p>
                  <p style={{ fontSize: 12, color: C.muted, whiteSpace: 'nowrap' }}>{fPesoFull(d.entregas.revenuePorEntregar)}</p>
                </div>
              </div>

              {/* Cerveza vs kombucha. Va rotulado "del entregado" a propósito:
                  estas cifras salen de los KPIs de lo ENTREGADO y no incluyen
                  lo por entregar, así que no suman el total grande de arriba.
                  Sin el rótulo parecería que los números no calzan. */}
              {actual.litros > 0 && (
                <>
                  <div style={{ height: 1, background: C.line, margin: '14px 0 12px' }} />
                  <p style={{ fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: '0.04em', marginBottom: 9 }}>
                    MIX DEL ENTREGADO
                  </p>
                  {([
                    { nombre: 'Cerveza',  emoji: '🍺', litros: actual.litrosCerveza,  revenue: actual.revenueCerveza,  color: C.amber },
                    { nombre: 'Kombucha', emoji: '🧃', litros: actual.litrosKombucha, revenue: actual.revenueKombucha, color: C.green },
                    { nombre: 'Otros',    emoji: '📦', litros: actual.litrosOtros,    revenue: actual.revenueOtros,    color: C.purple },
                  ] as const).filter(cat => cat.litros > 0 || cat.revenue !== 0).map(cat => {
                    const pct = (cat.litros / actual.litros) * 100
                    return (
                      <div key={cat.nombre} style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 9 }}>
                        <span style={{ fontSize: 15, flexShrink: 0 }}>{cat.emoji}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 4 }}>
                            <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{cat.nombre}</span>
                            <span style={{ fontSize: 11.5, fontWeight: 700, color: cat.color }}>{Math.round(pct)}%</span>
                          </div>
                          <div style={{ height: 5, borderRadius: 3, background: C.line, overflow: 'hidden' }}>
                            <div style={{ width: `${pct}%`, height: '100%', background: cat.color, borderRadius: 3 }} />
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <p style={{ fontSize: 13, fontWeight: 700, color: C.text, whiteSpace: 'nowrap' }}>{fL(cat.litros)}</p>
                          <p style={{ fontSize: 11.5, color: C.muted, whiteSpace: 'nowrap' }}>{fPesoFull(cat.revenue)}</p>
                        </div>
                      </div>
                    )
                  })}
                </>
              )}
            </button>
          )
        })()}

        {/* Ranking */}
        <div style={{ background: C.card, borderRadius: 16, border: `1px solid ${C.line}`, padding: '16px 16px 6px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: C.text, letterSpacing: '0.04em' }}>RANKING DE VENDEDORES</p>
            <span style={{ fontSize: 12, color: C.muted }}>por litros vendidos</span>
          </div>
          {d.vendedores.map((v, i) => (
            <FilaVendedor key={v.vendedor} v={v} pos={i} total={actual.litros}
              desde={d.desde} hasta={d.hasta} porEntrega={d.porEntrega} />
          ))}
        </div>

        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: isDesktop ? 20 : 14, minWidth: 0 }}>

        {/* De dónde viene lo entregado este período (decisión de Claudio,
            27-jul): el período lo define la fecha de ENTREGA — sin importar
            cuándo se tomó el pedido, si el ERP lo marcó entregado en este
            rango, cuenta para este período. Por eso esta tarjeta usa la
            MISMA población que "Litros vendidos" de arriba (litrosTotal
            calza exacto con actual.litros) y sólo la reparte según si el
            pedido se tomó antes de este período (backlog que se puso al
            día) o dentro de él. Ya NO es un desglose de "pedidos tomados,
            cuántos siguen sin despachar" — ese pipeline se ve en el "+ X
            por entregar" de la tarjeta principal, que sigue igual. */}
        {d.origenEntregado.litrosTotal > 0 && (() => {
          const { litrosTotal, litrosBacklog, litrosMismoPeriodo } = d.origenEntregado
          const pctMismo = litrosTotal > 0 ? (litrosMismoPeriodo / litrosTotal) * 100 : 0
          return (
            <div style={{ background: C.card, borderRadius: 16, border: `1px solid ${C.line}`, padding: 16 }}>
              <div style={{ marginBottom: 12 }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: C.text, letterSpacing: '0.04em' }}>DE DÓNDE VIENE LO ENTREGADO</p>
                <p style={{ fontSize: 11, color: C.muted, marginTop: 3, lineHeight: 1.45 }}>
                  Estos {fL(litrosTotal)} son los mismos de &quot;Litros vendidos&quot; arriba
                  —el período lo define la fecha de entrega—, repartidos según si el
                  pedido se tomó antes de este período o dentro de él.
                </p>
              </div>

              <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', background: C.line, marginBottom: 14 }}>
                <div style={{ width: `${100 - pctMismo}%`, background: C.amber }} />
                <div style={{ width: `${pctMismo}%`, background: C.green }} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
                <button
                  onClick={() => abrirDetalle('pedidos-origen', { origenPedidos: 'backlog' })}
                  style={{ background: C.amberSoft, borderRadius: 12, padding: '12px 13px', border: 'none', cursor: 'pointer', textAlign: 'left', width: '100%' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 7 }}>
                    <Truck size={15} color={C.amber} />
                    <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>De backlog anterior</span>
                    <ChevronRight size={14} color={C.faint} style={{ marginLeft: 'auto', flexShrink: 0 }} />
                  </div>
                  <p style={{ fontSize: 20, fontWeight: 800, color: C.amber, letterSpacing: '-0.5px', lineHeight: 1.1 }}>
                    {fL(litrosBacklog)}
                  </p>
                  <p style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                    {fNum(d.origenEntregado.pedidosBacklog)} {d.origenEntregado.pedidosBacklog === 1 ? 'pedido' : 'pedidos'} · {fPesoFull(d.origenEntregado.revenueBacklog)}
                  </p>
                </button>

                <button
                  onClick={() => abrirDetalle('pedidos-origen', { origenPedidos: 'mismo-periodo' })}
                  style={{ background: C.greenSoft, borderRadius: 12, padding: '12px 13px', border: 'none', cursor: 'pointer', textAlign: 'left', width: '100%' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 7 }}>
                    <CheckCircle2 size={15} color={C.green} />
                    <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>Tomados este período</span>
                    <ChevronRight size={14} color={C.faint} style={{ marginLeft: 'auto', flexShrink: 0 }} />
                  </div>
                  <p style={{ fontSize: 20, fontWeight: 800, color: C.green, letterSpacing: '-0.5px', lineHeight: 1.1 }}>
                    {fL(litrosMismoPeriodo)}
                  </p>
                  <p style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                    {fNum(d.origenEntregado.pedidosMismoPeriodo)} {d.origenEntregado.pedidosMismoPeriodo === 1 ? 'pedido' : 'pedidos'} · {fPesoFull(d.origenEntregado.revenueMismoPeriodo)}
                  </p>
                </button>
              </div>
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
                const esCerveza = e.tipo.includes('Cerveza')
                const esKombucha = e.tipo.includes('Kombucha')
                const tint = esCerveza ? C.hero : esKombucha ? C.green : C.amber
                const soft = esCerveza ? '#E2E8F0' : esKombucha ? C.greenSoft : C.amberSoft
                // Foto real representativa por bucket (no hay una foto "genérica
                // de cerveza en lata" o "de kombucha en lata" en sí, así que se usa
                // un producto real de cada categoría) — pedido de Claudio en vez
                // de los emoji 🥫/🛢️ genéricos de antes.
                const foto = esBarril
                  ? '/productos/cerveza/barril.webp'
                  : esCerveza ? '/productos/cerveza/mocho.webp'
                  : esKombucha ? '/productos/kombucha/berry-menta.webp'
                  : null
                return (
                  <button
                    key={e.tipo}
                    onClick={() => abrirDetalle('envase', { envaseBucket: e.tipo })}
                    style={{ background: soft, borderRadius: 12, padding: '12px 13px', border: 'none', cursor: 'pointer', textAlign: 'left', width: '100%' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
                      {foto ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={foto} alt="" width={22} height={22} style={{ width: 22, height: 22, borderRadius: 6, objectFit: 'contain', background: '#fff', flexShrink: 0 }} />
                      ) : (
                        <span style={{ fontSize: 17 }}>🥫</span>
                      )}
                      <span style={{ fontSize: 12, fontWeight: 600, color: C.text, minWidth: 0, wordBreak: 'break-word' }}>{e.tipo}</span>
                      <ChevronRight size={14} color={C.faint} style={{ marginLeft: 'auto', flexShrink: 0 }} />
                    </div>
                    <p style={{ fontSize: 22, fontWeight: 800, color: tint, letterSpacing: '-0.6px', lineHeight: 1.1 }}>
                      {fNum(Math.round(e.unidades))}
                    </p>
                    <p style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                      {esBarril ? 'barriles' : 'latas'} · {fL(e.litros)}
                    </p>
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
        </div>
      </div>

      {detalle && (
        <SheetDetalle
          isDesktop={isDesktop}
          tipo={detalle}
          envaseBucket={detalleEnvaseBucket}
          categoria={detalleCategoria}
          origenPedidos={detalleOrigenPedidos}
          conSelector={detalleConSelector}
          tituloBase={detalleTitulo}
          totales={detalleConSelector ? {
            litros: actual.litros,
            revenue: actual.revenue,
            litrosPorEntregar: d.entregas.litrosPorEntregar,
            revenuePorEntregar: d.entregas.revenuePorEntregar,
            litrosCerveza: actual.litrosCerveza,
            litrosKombucha: actual.litrosKombucha,
            clientes: actual.clientes,
            pedidos: actual.pedidos,
          } : undefined}
          porEntrega={d.porEntrega}
          desde={d.desde}
          hasta={d.hasta}
          onClose={() => {
            setDetalle(null)
            setDetalleEnvaseBucket(undefined)
            setDetalleCategoria(undefined)
            setDetalleOrigenPedidos(undefined)
            setDetalleConSelector(false)
            setDetalleTitulo(undefined)
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
