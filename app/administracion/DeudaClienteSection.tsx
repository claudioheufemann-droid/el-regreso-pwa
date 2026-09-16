'use client'

/**
 * Deuda real por cliente — lo que antes era la página aparte
 * /administracion/cobranza (CobranzaClient.tsx). Absorbida acá adentro como
 * la mitad "dato duro" de la pestaña Cobranza y Deuda: la otra mitad, más
 * arriba en AdministracionClient, es la PROYECCIÓN (nuestro modelo de
 * cuándo debería entrar la plata); ésta es el ESTADO actual según el ERP —
 * quién debe, hace cuánto, y con qué herramienta cobrarle. Decisión del
 * usuario, 15-sep-2026: una sola pestaña, no una página aparte con su
 * propio ítem de menú para un solo destino más.
 *
 * Mismo dato y misma reconstrucción de facturas que antes (lib/cobranza.ts),
 * sólo que repintado en la paleta CLARA del resto de Administración en vez
 * del tema oscuro que usaba la página vieja — la razón visual concreta por
 * la que esa página se sentía "aparte" del resto del módulo.
 */
import { Fragment, useMemo, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, ResponsiveContainer } from 'recharts'
import { ChevronDown, ChevronUp, ChevronsUpDown, ChevronRight, Search, FileDown, MessageCircle, Phone, Info, X, Users } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { VENDEDORES_CARTERA_COBRANZA, vendedorCanonico, grupoCarteraDe, nombreCorto } from '@/lib/types'
import { diasMoraDeudor } from '@/lib/cobranza'
import WAModal, { type WATarget } from '@/components/ui/WAModal'
import PanelCobranza, { documentosParaWA, type DatosCobranza } from '@/components/deudores/PanelCobranza'

const C = {
  card: '#FFFFFF', bg: '#F1F5F9', text: '#0F172A', muted: '#64748B',
  line: '#E2E8F0', gold: '#B45309', goldSoft: '#FFFBEB',
  red: '#DC2626', redSoft: '#FEF2F2', green: '#059669', purple: '#7C3AED',
}

export interface DeudorRaw {
  id: string
  nombre_fantasia: string
  razon_social?: string
  email?: string | null
  telefono?: string | null
  localidad?: string | null
  saldo_total: number
  deuda_vencida: number
  barriles_adeudados: number
  ultimo_pago?: string | null
  vendedor?: string | null
  tipo_cliente?: string | null
  fecha_ultima_compra?: string | null
  fecha_alta?: string | null
  limite_cta_cte?: number
  deuda_menor_14_dias: number
  deuda_entre_15_29_dias: number
  deuda_entre_30_44_dias: number
  deuda_entre_45_59_dias: number
  deuda_entre_60_89_dias: number
  deuda_mas_90_dias: number
  dias_pago?: number
  external_fecha?: string | null
  external_remito_mas_antiguo?: number | null
  updated_at: string
}

interface Deudor extends DeudorRaw {
  maquila_vencida: number
  deuda_comercial: number
  saldo_comercial: number
}

type SortKey = 'cliente' | 'vendedor' | 'deuda' | 'dias' | 'saldo' | 'barriles' | 'ultimoPago'
interface SortConfig { key: SortKey; dir: 'asc' | 'desc' }

interface Props {
  initialDeudores: DeudorRaw[]
  clientesPorVendedor: Record<string, number>
  maquilaPorCliente: Record<string, number>
}

function conDeudaComercial(filas: DeudorRaw[], maquilaPorCliente: Record<string, number>): Deudor[] {
  return filas.map(d => {
    const maquila = maquilaPorCliente[d.nombre_fantasia] ?? 0
    return {
      ...d,
      maquila_vencida: Math.round(maquila),
      deuda_comercial: Math.round(Math.max(0, (d.deuda_vencida || 0) - maquila)),
      saldo_comercial: Math.round(Math.max(0, (d.saldo_total || 0) - maquila)),
    }
  })
}

function esCarteraDeVenta(d: Deudor): boolean {
  return grupoCarteraDe(d.vendedor) === 'vendedor'
}
function diasMoraDe(d: Deudor): number {
  return diasMoraDeudor({ ...d, deuda_vencida: d.deuda_comercial })
}
function saldoNoVencidoDe(d: Pick<Deudor, 'saldo_total' | 'deuda_vencida'>): number {
  return Math.max(0, (d.saldo_total || 0) - (d.deuda_vencida || 0))
}

interface FilaCartera { vendedor: string; deudores: number; clientes: number; vencida: number; saldo: number }

function resumenCarteras(deudores: Deudor[], clientesPorVendedor: Record<string, number>) {
  const acc = new Map<string, FilaCartera>(
    (VENDEDORES_CARTERA_COBRANZA as readonly string[]).map(v => [v, { vendedor: v, deudores: 0, clientes: clientesPorVendedor[v] ?? 0, vencida: 0, saldo: 0 }]),
  )
  for (const d of deudores) {
    const fila = acc.get(vendedorCanonico(d.vendedor))
    if (!fila) continue
    fila.deudores++
    fila.vencida += d.deuda_comercial || 0
    fila.saldo += d.saldo_comercial || 0
  }
  const filas = [...acc.values()].sort((a, b) => b.vencida - a.vencida)
  const total = filas.reduce(
    (t, f) => ({ deudores: t.deudores + f.deudores, clientes: t.clientes + f.clientes, vencida: t.vencida + f.vencida, saldo: t.saldo + f.saldo }),
    { deudores: 0, clientes: 0, vencida: 0, saldo: 0 },
  )
  return { filas, total }
}

const TRAMOS_CHART = [
  { key: 'deuda_menor_14_dias', label: '1–14' },
  { key: 'deuda_entre_15_29_dias', label: '15–29' },
  { key: 'deuda_entre_30_44_dias', label: '30–44' },
  { key: 'deuda_entre_45_59_dias', label: '45–59' },
  { key: 'deuda_entre_60_89_dias', label: '60–89' },
  { key: 'deuda_mas_90_dias', label: '+90' },
] as const

// Verde→rojo a medida que la mora envejece — mismo criterio de color que el
// resto del módulo (60 días o más es rojo).
function colorTramo(i: number): string {
  return ['#4ADE80', '#A3E635', '#FBBF24', '#FB923C', '#F87171', '#DC2626'][i] ?? '#DC2626'
}

function csvEscape(v: string | number): string {
  const s = String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
function fFecha(iso: string): string {
  const [y, m, d] = iso.split('T')[0].split('-')
  const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
  return `${parseInt(d)} ${meses[parseInt(m) - 1]} ${y}`
}
function exportarCSV(deudores: Deudor[]) {
  const headers = ['Cliente', 'Localidad', 'Vendedor', 'Deuda vencida', 'Días vencida', 'Doc. más antiguo', 'Maquila (no comercial)', 'Saldo total', 'Barriles', 'Último pago']
  const filas = deudores.map(d => [
    d.nombre_fantasia, d.localidad ?? '', vendedorCanonico(d.vendedor) || '',
    d.deuda_comercial, diasMoraDe(d),
    d.external_fecha ? fFecha(d.external_fecha) : '',
    Math.round(d.maquila_vencida),
    d.saldo_comercial, d.barriles_adeudados,
    d.ultimo_pago ? fFecha(d.ultimo_pago) : '',
  ])
  const csv = [headers, ...filas].map(fila => fila.map(csvEscape).join(',')).join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `cobranza-${new Date().toISOString().split('T')[0]}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

function Card({ children, acento }: { children: React.ReactNode; acento?: string }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${acento ?? C.line}`, borderRadius: 16, padding: 20 }}>
      {children}
    </div>
  )
}
function Etiqueta({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <p title={title} style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: C.muted, display: 'flex', alignItems: 'center', gap: 5 }}>
      {children}
      {title && <Info size={11} style={{ opacity: 0.5 }} />}
    </p>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', background: C.card, border: `1px solid ${C.line}`,
  borderRadius: 9, color: C.text, fontSize: 13, outline: 'none', boxSizing: 'border-box',
}
const selectStyle: React.CSSProperties = {
  ...inputStyle, appearance: 'none',
  backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'12\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%2364748B\' stroke-width=\'2\'%3E%3Cpolyline points=\'6 9 12 15 18 9\'/%3E%3C/svg%3E")',
  backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center', paddingRight: 32,
}
const fCompact = (n: number) => {
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `$${Math.round(n / 1_000)}k`
  return `$${Math.round(n)}`
}

export default function DeudaClienteSection({ initialDeudores, clientesPorVendedor, maquilaPorCliente }: Props) {
  const [cartera, setCartera] = useState<string>('todos')
  const [estado, setEstado] = useState<'todos' | 'vencida' | 'sin-vencida'>('todos')
  const [searchText, setSearchText] = useState('')
  const [expandedRow, setExpandedRow] = useState<string | null>(null)
  const [sortConfig, setSortConfig] = useState<SortConfig | null>(null)
  const [waTarget, setWaTarget] = useState<WATarget | null>(null)
  const [cobranza, setCobranza] = useState<DatosCobranza | null>(null)
  const [verSaldoNoVencido, setVerSaldoNoVencido] = useState(false)

  const universo = useMemo(
    () => conDeudaComercial(initialDeudores, maquilaPorCliente).filter(esCarteraDeVenta),
    [initialDeudores, maquilaPorCliente],
  )
  const { filas: carteras, total } = useMemo(() => resumenCarteras(universo, clientesPorVendedor), [universo, clientesPorVendedor])

  const filtrados = useMemo(() => universo.filter(d => {
    if (cartera !== 'todos' && vendedorCanonico(d.vendedor) !== cartera) return false
    if (estado === 'vencida' && d.deuda_comercial <= 0) return false
    if (estado === 'sin-vencida' && d.deuda_comercial > 0) return false
    if (searchText && !d.nombre_fantasia.toLowerCase().includes(searchText.toLowerCase())) return false
    return true
  }), [universo, cartera, estado, searchText])

  const filtradosOrdenados = useMemo(() => {
    if (!sortConfig) return filtrados
    const { key, dir } = sortConfig
    const mult = dir === 'asc' ? 1 : -1
    const valor = (d: Deudor): string | number => {
      switch (key) {
        case 'cliente': return d.nombre_fantasia
        case 'vendedor': return vendedorCanonico(d.vendedor) || ''
        case 'deuda': return d.deuda_comercial
        case 'dias': return diasMoraDe(d)
        case 'saldo': return d.saldo_comercial
        case 'barriles': return d.barriles_adeudados
        case 'ultimoPago': return d.ultimo_pago ?? ''
      }
    }
    return [...filtrados].sort((a, b) => {
      const va = valor(a), vb = valor(b)
      if (typeof va === 'string' || typeof vb === 'string') return String(va).localeCompare(String(vb)) * mult
      return (va - vb) * mult
    })
  }, [filtrados, sortConfig])

  function toggleSort(key: SortKey) {
    setSortConfig(prev => {
      if (prev?.key === key) return { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
      // Texto empieza A→Z; números/fecha empiezan con lo más urgente primero (mayor/más antiguo)
      return { key, dir: key === 'cliente' || key === 'vendedor' ? 'asc' : 'desc' }
    })
  }

  const totals = useMemo(() => ({
    deudores: filtrados.length,
    conVencida: filtrados.filter(d => d.deuda_comercial > 0).length,
    deuda_vencida: filtrados.reduce((s, d) => s + (d.deuda_comercial || 0), 0),
    saldo_total: filtrados.reduce((s, d) => s + (d.saldo_comercial || 0), 0),
    barriles: filtrados.reduce((s, d) => s + (d.barriles_adeudados || 0), 0),
  }), [filtrados])

  const saldoNoVencido = totals.saldo_total - totals.deuda_vencida
  const clientesUniverso = cartera === 'todos' ? total.clientes : (clientesPorVendedor[cartera] ?? 0)

  const clientesConSaldoNoVencido = useMemo(
    () => filtrados.map(d => ({ nombre: d.nombre_fantasia, monto: saldoNoVencidoDe(d) })).filter(c => c.monto > 0).sort((a, b) => b.monto - a.monto),
    [filtrados],
  )
  const datosAging = useMemo(() => TRAMOS_CHART.map(t => ({
    label: t.label,
    monto: filtrados.reduce((s, d) => s + (Number(d[t.key as keyof Deudor]) || 0), 0),
  })), [filtrados])

  function abrirWA(d: Deudor) {
    setWaTarget({
      nombre: d.nombre_fantasia, telefono: d.telefono,
      contexto: 'cobranza', alertTipo: 'cobranza',
      subtitulo: d.localidad ?? undefined,
      contacto: cobranza?.contacto?.contacto ?? null,
      diasVencida: cobranza?.detalle.diasMoraMaxima ?? diasMoraDe(d),
      montoVencido: d.deuda_comercial,
      documentos: cobranza ? documentosParaWA(cobranza.detalle) : undefined,
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Users size={16} style={{ color: C.gold }} />
          <h2 style={{ fontSize: 14.5, fontWeight: 800, color: C.text }}>
            Deuda actual por cliente — dato del ERP
          </h2>
        </div>
        {filtrados.length > 0 && (
          <button onClick={() => exportarCSV(filtradosOrdenados)}
            style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 14px', borderRadius: 9,
              border: `1px solid ${C.line}`, background: C.card, color: C.text, fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
            <FileDown size={14} /> Exportar CSV
          </button>
        )}
      </div>
      <p style={{ fontSize: 12.5, color: C.muted, marginTop: -10 }}>
        Suma de las 4 carteras de venta más la de Claudio. No incluye incobrables, CERVECERÍA ni cuentas
        internas — ni el co-packing a terceros (maquila), que se muestra aparte de la deuda comercial.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
        <Card>
          <Etiqueta>Total deudores</Etiqueta>
          <p style={{ fontSize: 26, fontWeight: 900, color: C.text, marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>
            {totals.deudores}
            {clientesUniverso > 0 && (
              <span style={{ fontSize: 13, fontWeight: 500, color: C.muted }}> de {clientesUniverso} ({Math.round((totals.deudores / clientesUniverso) * 100)}%)</span>
            )}
          </p>
          <p style={{ fontSize: 11.5, color: C.muted, marginTop: 6 }}>
            {totals.conVencida} con deuda vencida{totals.deudores - totals.conVencida > 0 ? ` · ${totals.deudores - totals.conVencida} sólo dentro de plazo` : ''}
          </p>
        </Card>
        <Card acento={totals.deuda_vencida > 0 ? '#FECACA' : undefined}>
          <Etiqueta title="Deuda ya vencida, sin la maquila (co-packing a terceros).">Deuda vencida</Etiqueta>
          <p style={{ fontSize: 26, fontWeight: 900, color: C.red, marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(totals.deuda_vencida)}</p>
          <p style={{ fontSize: 11.5, color: C.muted, marginTop: 6 }}>lo que persigue el área comercial</p>
        </Card>
        <Card>
          <Etiqueta title="Vencida + no vencida (plata dentro de plazo, todavía no exigible).">Saldo total</Etiqueta>
          <p style={{ fontSize: 26, fontWeight: 900, color: C.gold, marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(totals.saldo_total)}</p>
          <button onClick={() => setVerSaldoNoVencido(v => !v)}
            style={{ display: 'flex', alignItems: 'center', gap: 3, marginTop: 6, padding: 0, background: 'none', border: 'none', cursor: 'pointer', color: C.muted, fontSize: 11.5, fontWeight: 600 }}>
            {formatCurrency(saldoNoVencido)} aún no vence
            {verSaldoNoVencido ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>
        </Card>
        <Card>
          <Etiqueta>Barriles adeudados</Etiqueta>
          <p style={{ fontSize: 26, fontWeight: 900, color: C.purple, marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>{totals.barriles.toLocaleString('es-CL')}</p>
          <p style={{ fontSize: 11.5, color: C.muted, marginTop: 6 }}>sin devolver, cartera filtrada</p>
        </Card>
      </div>

      {verSaldoNoVencido && (
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <h3 style={{ fontSize: 14, fontWeight: 800, color: C.text }}>Saldo no vencido por cliente — {formatCurrency(saldoNoVencido)}</h3>
            <button onClick={() => setVerSaldoNoVencido(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted }}><X size={16} /></button>
          </div>
          {clientesConSaldoNoVencido.length === 0 ? (
            <p style={{ fontSize: 13, color: C.muted }}>Nadie de la cartera filtrada tiene saldo dentro de plazo.</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8, maxHeight: 260, overflowY: 'auto' }}>
              {clientesConSaldoNoVencido.map(c => (
                <div key={c.nombre} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '8px 12px', background: C.bg, borderRadius: 9, border: `1px solid ${C.line}` }}>
                  <span style={{ fontSize: 12.5, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nombre}</span>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: C.muted, flexShrink: 0 }}>{formatCurrency(c.monto)}</span>
                </div>
              ))}
            </div>
          )}
          <p style={{ fontSize: 11, color: C.muted, marginTop: 10 }}>
            El detalle por factura de cada cliente está en su fila de la tabla — desplegarla y abrir &quot;aún no vencido&quot;.
          </p>
        </Card>
      )}

      <Card>
        <h3 style={{ fontSize: 14, fontWeight: 800, color: C.text, marginBottom: 14 }}>Deuda vencida por antigüedad</h3>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={datosAging}>
            <CartesianGrid strokeDasharray="3 3" stroke={C.line} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: C.muted }} />
            <YAxis tickFormatter={fCompact} tick={{ fontSize: 11, fill: C.muted }} width={56} />
            <Tooltip formatter={(v) => formatCurrency(Number(v))} labelFormatter={l => `${l} días`}
              contentStyle={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 10, fontSize: 12 }} />
            <Bar dataKey="monto" radius={[4, 4, 0, 0]}>
              {datosAging.map((_, i) => <Cell key={i} fill={colorTramo(i)} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <p style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>Días desde el vencimiento de cada documento, según los tramos que informa el ERP.</p>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(140px, 1fr))`, gap: 12 }}>
        {[{ vendedor: 'todos', nombre: 'Todos', deudores: total.deudores, clientes: total.clientes, vencida: total.vencida },
          ...carteras.map(f => ({ vendedor: f.vendedor, nombre: nombreCorto(f.vendedor), deudores: f.deudores, clientes: f.clientes, vencida: f.vencida })),
        ].map(f => {
          const activo = cartera === f.vendedor
          return (
            <button key={f.vendedor} onClick={() => setCartera(f.vendedor)}
              style={{
                textAlign: 'left', cursor: 'pointer', font: 'inherit',
                background: activo ? C.goldSoft : C.card,
                border: `1px solid ${activo ? C.gold : C.line}`,
                borderRadius: 12, padding: '13px 16px',
              }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: activo ? C.gold : C.muted, letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: 6 }}>{f.nombre}</p>
              <p style={{ fontSize: 17, fontWeight: 900, color: C.red }}>{formatCurrency(f.vencida)}</p>
              <p style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>{f.deudores} deudor{f.deudores === 1 ? '' : 'es'}{f.clientes > 0 ? ` de ${f.clientes}` : ''}</p>
            </button>
          )
        })}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: '16px 20px' }}>
        <div>
          <label style={{ fontSize: 11, color: C.muted, fontWeight: 700, display: 'block', marginBottom: 6 }}>BUSCAR</label>
          <div style={{ position: 'relative' }}>
            <Search size={14} color={C.muted} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
            <input type="text" value={searchText} onChange={e => setSearchText(e.target.value)} placeholder="Nombre cliente…" style={{ ...inputStyle, paddingLeft: 30 }} />
          </div>
        </div>
        <div>
          <label style={{ fontSize: 11, color: C.muted, fontWeight: 700, display: 'block', marginBottom: 6 }}>VENDEDOR</label>
          <select value={cartera} onChange={e => setCartera(e.target.value)} style={selectStyle}>
            <option value="todos">Todos los vendedores</option>
            {carteras.map(f => <option key={f.vendedor} value={f.vendedor}>{f.vendedor}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 11, color: C.muted, fontWeight: 700, display: 'block', marginBottom: 6 }}>ESTADO</label>
          <select value={estado} onChange={e => setEstado(e.target.value as typeof estado)} style={selectStyle}>
            <option value="todos">Todos</option>
            <option value="vencida">Con deuda vencida</option>
            <option value="sin-vencida">Sin deuda vencida</option>
          </select>
        </div>
      </div>

      <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, overflow: 'hidden' }}>
        {filtrados.length === 0 ? (
          <div style={{ padding: '40px 24px', textAlign: 'center' }}>
            <p style={{ color: C.muted, fontSize: 14 }}>
              {universo.length === 0 ? 'Todavía no hay deudores cargados.' : 'No hay deudores que coincidan con los filtros.'}
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: 720, borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: C.bg, borderBottom: `1px solid ${C.line}` }}>
                  {([
                    { label: 'Cliente', key: 'cliente', align: 'left' },
                    { label: 'Vendedor', key: 'vendedor', align: 'left' },
                    { label: 'Deuda Vencida', key: 'deuda', align: 'right' },
                    { label: 'Días Vencida', key: 'dias', align: 'right' },
                    { label: 'Saldo Total', key: 'saldo', align: 'right' },
                    { label: 'Barriles', key: 'barriles', align: 'right' },
                    { label: 'Último Pago', key: 'ultimoPago', align: 'left' },
                    { label: '', key: null, align: 'center' },
                  ] as { label: string; key: SortKey | null; align: 'left' | 'right' | 'center' }[]).map(col => {
                    const activo = sortConfig?.key === col.key
                    return (
                      <th key={col.label || 'acciones'} onClick={col.key ? () => toggleSort(col.key as SortKey) : undefined}
                        style={{
                          padding: '10px 14px',
                          textAlign: col.align,
                          fontSize: 11, fontWeight: 700, color: activo ? C.gold : C.muted, letterSpacing: '0.5px', textTransform: 'uppercase', whiteSpace: 'nowrap',
                          cursor: col.key ? 'pointer' : 'default', userSelect: 'none',
                        }}>
                        {col.key ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, justifyContent: col.align === 'right' ? 'flex-end' : 'flex-start' }}>
                            {col.label}
                            {activo
                              ? (sortConfig!.dir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)
                              : <ChevronsUpDown size={11} style={{ opacity: 0.4 }} />}
                          </span>
                        ) : col.label}
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {filtradosOrdenados.map(d => {
                  const abierto = expandedRow === d.id
                  // Estimado rápido salvo que esta fila esté desplegada y ya
                  // haya llegado el detalle real (fecha_pedido + dias_pago).
                  const dias = abierto && cobranza ? cobranza.detalle.diasMoraMaxima : diasMoraDe(d)
                  return (
                    <Fragment key={d.id}>
                      <tr
                        onClick={() => { setExpandedRow(abierto ? null : d.id); setCobranza(null) }}
                        style={{ borderTop: `1px solid ${C.line}`, cursor: 'pointer', background: abierto ? C.goldSoft : 'transparent' }}
                      >
                        <td style={{ padding: '11px 14px', fontWeight: 700, color: C.text, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.nombre_fantasia}</td>
                        <td style={{ padding: '11px 14px', color: C.muted }}>{vendedorCanonico(d.vendedor) || '—'}</td>
                        <td style={{ padding: '11px 14px', textAlign: 'right', fontWeight: 700, color: d.deuda_comercial > 0 ? C.red : C.green }}>
                          {formatCurrency(d.deuda_comercial)}
                          {d.maquila_vencida > 0 && (
                            <span style={{ display: 'block', fontSize: 10.5, fontWeight: 500, color: C.muted }}>+ {formatCurrency(Math.round(d.maquila_vencida))} maquila</span>
                          )}
                        </td>
                        <td style={{ padding: '11px 14px', textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap', color: dias >= 60 ? C.red : dias > 0 ? '#D97706' : C.muted }}>
                          {dias > 0 ? `${dias} días` : '—'}
                        </td>
                        <td style={{ padding: '11px 14px', textAlign: 'right', color: C.text, fontWeight: 600 }}>{formatCurrency(d.saldo_comercial)}</td>
                        <td style={{ padding: '11px 14px', textAlign: 'right', color: d.barriles_adeudados > 0 ? C.purple : C.muted, fontWeight: 600 }}>{d.barriles_adeudados}</td>
                        <td style={{ padding: '11px 14px', color: C.muted }}>{d.ultimo_pago ? new Date(d.ultimo_pago).toLocaleDateString('es-CL') : '—'}</td>
                        <td style={{ padding: '11px 14px', textAlign: 'center' }}>
                          {abierto ? <ChevronDown size={14} style={{ color: C.gold }} /> : <ChevronRight size={14} style={{ color: C.muted }} />}
                        </td>
                      </tr>

                      {abierto && (
                        <tr key={`${d.id}-detalle`}>
                          <td colSpan={8} style={{ padding: '20px 24px', background: C.goldSoft, borderBottom: `1px solid ${C.line}`, borderLeft: `3px solid ${C.gold}` }}>
                            <PanelCobranza cliente={d.nombre_fantasia} tema="claro" onDatos={setCobranza} />

                            <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
                              <button onClick={e => { e.stopPropagation(); abrirWA(d) }}
                                style={{ minHeight: 38, padding: '0 16px', display: 'flex', alignItems: 'center', gap: 7,
                                  background: 'rgba(37,211,102,0.10)', border: '1px solid rgba(37,211,102,0.35)',
                                  borderRadius: 10, color: '#128C3E', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
                                <MessageCircle size={14} /> Cobrar por WhatsApp
                              </button>
                              {d.telefono && (
                                <a href={`tel:${d.telefono}`} onClick={e => e.stopPropagation()}
                                  style={{ minHeight: 38, padding: '0 16px', display: 'flex', alignItems: 'center', gap: 7,
                                    background: 'rgba(37,99,235,0.08)', border: '1px solid rgba(37,99,235,0.3)',
                                    borderRadius: 10, color: '#2563EB', fontSize: 12.5, fontWeight: 700, textDecoration: 'none' }}>
                                  <Phone size={14} /> Llamar
                                </a>
                              )}
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 24 }}>
                              <div>
                                <p style={{ fontSize: 11, fontWeight: 700, color: C.gold, letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: 10 }}>Contacto</p>
                                {[
                                  { label: 'Email', value: d.email },
                                  { label: 'Teléfono', value: d.telefono },
                                  { label: 'Localidad', value: d.localidad },
                                  { label: 'Razón Social', value: d.razon_social },
                                ].map(({ label, value }) => (
                                  <div key={label} style={{ marginBottom: 6 }}>
                                    <span style={{ fontSize: 11, color: C.muted }}>{label}: </span>
                                    <span style={{ fontSize: 12, color: C.text }}>{value || '—'}</span>
                                  </div>
                                ))}
                              </div>
                              <div>
                                <p style={{ fontSize: 11, fontWeight: 700, color: C.gold, letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: 10 }}>Deuda por Antigüedad</p>
                                {[
                                  { label: '0–14 días', value: d.deuda_menor_14_dias },
                                  { label: '15–29 días', value: d.deuda_entre_15_29_dias },
                                  { label: '30–44 días', value: d.deuda_entre_30_44_dias },
                                  { label: '45–59 días', value: d.deuda_entre_45_59_dias },
                                  { label: '60–89 días', value: d.deuda_entre_60_89_dias },
                                  { label: '+90 días', value: d.deuda_mas_90_dias },
                                ].map(({ label, value }) => (
                                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                                    <span style={{ fontSize: 12, color: C.muted }}>{label}</span>
                                    <span style={{ fontSize: 12, fontWeight: 700, color: (value || 0) > 0 ? C.red : C.muted }}>{formatCurrency(value || 0)}</span>
                                  </div>
                                ))}
                              </div>
                              <div>
                                <p style={{ fontSize: 11, fontWeight: 700, color: C.gold, letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: 10 }}>Cuenta</p>
                                {[
                                  { label: 'Tipo Cliente', value: d.tipo_cliente },
                                  { label: 'Límite Cta Cte', value: d.limite_cta_cte ? formatCurrency(d.limite_cta_cte) : null },
                                  { label: 'Días Pago', value: d.dias_pago ? `${d.dias_pago} días` : null },
                                  { label: 'Última Compra', value: d.fecha_ultima_compra ? new Date(d.fecha_ultima_compra).toLocaleDateString('es-CL') : null },
                                  { label: 'Fecha Alta', value: d.fecha_alta ? new Date(d.fecha_alta).toLocaleDateString('es-CL') : null },
                                ].map(({ label, value }) => (
                                  <div key={label} style={{ marginBottom: 6 }}>
                                    <span style={{ fontSize: 11, color: C.muted }}>{label}: </span>
                                    <span style={{ fontSize: 12, color: C.text }}>{value || '—'}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p style={{ fontSize: 11, color: C.muted, textAlign: 'right' }}>Mostrando {filtrados.length} de {universo.length} deudores</p>

      {waTarget && <WAModal target={waTarget} onClose={() => setWaTarget(null)} />}
    </div>
  )
}
