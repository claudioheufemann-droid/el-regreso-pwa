'use client'

import { Fragment, useMemo, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, ResponsiveContainer,
} from 'recharts'
import {
  Wallet, ChevronDown, ChevronRight, Search, FileDown, MessageCircle, Phone, Info, X,
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { VENDEDORES_CARTERA_COBRANZA, vendedorCanonico, grupoCarteraDe, nombreCorto } from '@/lib/types'
import { diasMoraDeudor } from '@/lib/cobranza'
import WAModal, { type WATarget } from '@/components/ui/WAModal'
import PanelCobranza, { documentosParaWA, type DatosCobranza } from '@/components/deudores/PanelCobranza'

// ── Tipos ────────────────────────────────────────────────────────────────────
interface DeudorRaw {
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
  /** Parte de `deuda_vencida` que es co-packing (litros/latas de maquila). */
  maquila_vencida: number
  /** `deuda_vencida` menos la maquila: lo que persigue el área comercial. */
  deuda_comercial: number
  /** `saldo_total` menos la maquila. */
  saldo_comercial: number
}

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

// Universo del módulo: las 4 carteras de venta + la de Claudio. Todo lo que
// el ERP aparca bajo un pseudo-vendedor (Incobrable, CERVECERÍA, Inactivo,
// Vendedor Muestras, OnLine, sin vendedor) queda fuera — mismo criterio que
// /ventas/deudores (lib/types.ts → grupoCarteraDe).
function esCarteraDeVenta(d: Deudor): boolean {
  return grupoCarteraDe(d.vendedor) === 'vendedor'
}

function diasMoraDe(d: Deudor): number {
  return diasMoraDeudor({ ...d, deuda_vencida: d.deuda_comercial })
}

function saldoNoVencidoDe(d: Pick<Deudor, 'saldo_total' | 'deuda_vencida'>): number {
  return Math.max(0, (d.saldo_total || 0) - (d.deuda_vencida || 0))
}

interface FilaCartera {
  vendedor: string
  deudores: number
  clientes: number
  vencida: number
  saldo: number
}

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

function colorTramo(i: number): string {
  // Verde→rojo a medida que la mora envejece — mismo criterio de color que
  // el resto del módulo (>=60 días es rojo).
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

// ── UI compartida con el resto de Administración ─────────────────────────────
function Card({ children, acento, style }: { children: React.ReactNode; acento?: string; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: 'var(--surface)', border: `1px solid ${acento ?? 'var(--border)'}`,
      borderRadius: 16, padding: 20, ...style,
    }}>
      {children}
    </div>
  )
}

function Etiqueta({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <p title={title} style={{
      fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase',
      color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 5,
    }}>
      {children}
      {title && <Info size={11} style={{ opacity: 0.5 }} />}
    </p>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', background: 'var(--bg)', border: '1px solid var(--border)',
  borderRadius: 9, color: 'var(--cream)', fontSize: 13, outline: 'none',
}

const selectStyle: React.CSSProperties = {
  ...inputStyle, appearance: 'none',
  backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'12\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%23888\' stroke-width=\'2\'%3E%3Cpolyline points=\'6 9 12 15 18 9\'/%3E%3C/svg%3E")',
  backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center', paddingRight: 32,
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function CobranzaClient({ initialDeudores, clientesPorVendedor, maquilaPorCliente }: Props) {
  const [cartera, setCartera] = useState<string>('todos')
  const [estado, setEstado] = useState<'todos' | 'vencida' | 'sin-vencida'>('todos')
  const [searchText, setSearchText] = useState('')
  const [expandedRow, setExpandedRow] = useState<string | null>(null)
  const [waTarget, setWaTarget] = useState<WATarget | null>(null)
  const [cobranza, setCobranza] = useState<DatosCobranza | null>(null)
  const [verSaldoNoVencido, setVerSaldoNoVencido] = useState(false)

  const universo = useMemo(
    () => conDeudaComercial(initialDeudores, maquilaPorCliente).filter(esCarteraDeVenta),
    [initialDeudores, maquilaPorCliente],
  )

  const { filas: carteras, total } = useMemo(
    () => resumenCarteras(universo, clientesPorVendedor),
    [universo, clientesPorVendedor],
  )

  const filtrados = useMemo(() => universo.filter(d => {
    if (cartera !== 'todos' && vendedorCanonico(d.vendedor) !== cartera) return false
    if (estado === 'vencida' && d.deuda_comercial <= 0) return false
    if (estado === 'sin-vencida' && d.deuda_comercial > 0) return false
    if (searchText && !d.nombre_fantasia.toLowerCase().includes(searchText.toLowerCase())) return false
    return true
  }), [universo, cartera, estado, searchText])

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
    () => filtrados
      .map(d => ({ nombre: d.nombre_fantasia, monto: saldoNoVencidoDe(d) }))
      .filter(c => c.monto > 0)
      .sort((a, b) => b.monto - a.monto),
    [filtrados],
  )

  const datosAging = useMemo(() => TRAMOS_CHART.map(t => ({
    label: t.label,
    monto: filtrados.reduce((s, d) => s + (Number(d[t.key as keyof Deudor]) || 0), 0),
  })), [filtrados])

  const fCompact = (n: number) => {
    const abs = Math.abs(n)
    if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
    if (abs >= 1_000) return `$${Math.round(n / 1_000)}k`
    return `$${Math.round(n)}`
  }

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
    <div style={{ padding: '28px 32px 60px', maxWidth: 1400 }}>
      {/* ── Encabezado ───────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap', marginBottom: 22 }}>
        <div>
          <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--gold)' }}>
            Administración y Finanzas
          </p>
          <h1 style={{ fontSize: 30, fontWeight: 900, color: 'var(--cream)', letterSpacing: '-0.8px', lineHeight: 1.1, marginTop: 2 }}>
            Cobranza
          </h1>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 6, maxWidth: 640 }}>
            Suma de las 4 carteras de venta más la de Claudio. No incluye incobrables, CERVECERÍA
            ni cuentas internas — ni el co-packing a terceros (maquila), que se muestra aparte.
          </p>
        </div>
        {filtrados.length > 0 && (
          <button onClick={() => exportarCSV(filtrados)}
            style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 16px', borderRadius: 9,
              border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--cream)',
              fontSize: 12.5, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>
            <FileDown size={14} /> Exportar CSV
          </button>
        )}
      </div>

      {/* ── KPIs ─────────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 18 }}>
        <Card>
          <Etiqueta>Total deudores</Etiqueta>
          <p style={{ fontSize: 28, fontWeight: 900, color: 'var(--cream)', marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>
            {totals.deudores}
            {clientesUniverso > 0 && (
              <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--muted)' }}>
                {' '}de {clientesUniverso} ({Math.round((totals.deudores / clientesUniverso) * 100)}%)
              </span>
            )}
          </p>
          <p style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 6 }}>
            {totals.conVencida} con deuda vencida{totals.deudores - totals.conVencida > 0 ? ` · ${totals.deudores - totals.conVencida} solo dentro de plazo` : ''}
          </p>
        </Card>

        <Card acento={totals.deuda_vencida > 0 ? 'rgba(248,113,113,0.25)' : undefined}>
          <Etiqueta title="Deuda ya vencida, sin la maquila (co-packing a terceros).">Deuda vencida</Etiqueta>
          <p style={{ fontSize: 28, fontWeight: 900, color: '#F87171', marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>
            {formatCurrency(totals.deuda_vencida)}
          </p>
          <p style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 6 }}>lo que persigue el área comercial</p>
        </Card>

        <Card>
          <Etiqueta title="Vencida + no vencida (plata dentro de plazo, todavía no exigible).">Saldo total</Etiqueta>
          <p style={{ fontSize: 28, fontWeight: 900, color: 'var(--gold)', marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>
            {formatCurrency(totals.saldo_total)}
          </p>
          <button onClick={() => setVerSaldoNoVencido(v => !v)}
            style={{ display: 'flex', alignItems: 'center', gap: 3, marginTop: 6, padding: 0,
              background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 11.5, fontWeight: 600 }}>
            {formatCurrency(saldoNoVencido)} aún no vence
            {verSaldoNoVencido ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>
        </Card>

        <Card>
          <Etiqueta>Barriles adeudados</Etiqueta>
          <p style={{ fontSize: 28, fontWeight: 900, color: '#C084FC', marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>
            {totals.barriles.toLocaleString('es-CL')}
          </p>
          <p style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 6 }}>sin devolver, cartera filtrada</p>
        </Card>
      </div>

      {/* ── Saldo no vencido, detalle por cliente ───────────────────────────── */}
      {verSaldoNoVencido && (
        <Card style={{ marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <h2 style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--cream)' }}>
              Saldo no vencido por cliente — {formatCurrency(saldoNoVencido)}
            </h2>
            <button onClick={() => setVerSaldoNoVencido(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}>
              <X size={16} />
            </button>
          </div>
          {clientesConSaldoNoVencido.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--muted)' }}>Nadie de la cartera filtrada tiene saldo dentro de plazo.</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 8, maxHeight: 260, overflowY: 'auto' }}>
              {clientesConSaldoNoVencido.map(c => (
                <div key={c.nombre} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '8px 12px', background: 'var(--bg)', borderRadius: 9, border: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 12.5, color: 'var(--cream)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nombre}</span>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--muted)', flexShrink: 0 }}>{formatCurrency(c.monto)}</span>
                </div>
              ))}
            </div>
          )}
          <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 10 }}>
            El detalle por factura de cada cliente está en su fila de la tabla — desplegarla y abrir &quot;aún no vencido&quot;.
          </p>
        </Card>
      )}

      {/* ── Antigüedad de la deuda ───────────────────────────────────────── */}
      <Card style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <h2 style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--cream)' }}>Deuda vencida por antigüedad</h2>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={datosAging}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--muted)' }} />
            <YAxis tickFormatter={fCompact} tick={{ fontSize: 11, fill: 'var(--muted)' }} width={56} />
            <Tooltip
              formatter={(v) => formatCurrency(Number(v))}
              labelFormatter={l => `${l} días`}
              contentStyle={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 12 }}
            />
            <Bar dataKey="monto" radius={[4, 4, 0, 0]}>
              {datosAging.map((_, i) => <Cell key={i} fill={colorTramo(i)} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
          Días desde el vencimiento de cada documento, según los tramos que informa el ERP.
        </p>
      </Card>

      {/* ── Desglose por cartera (también filtro) ───────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${carteras.length + 1}, 1fr)`, gap: 12, marginBottom: 18 }}>
        {[{ vendedor: 'todos', nombre: 'Todos', deudores: total.deudores, clientes: total.clientes, vencida: total.vencida },
          ...carteras.map(f => ({ vendedor: f.vendedor, nombre: nombreCorto(f.vendedor), deudores: f.deudores, clientes: f.clientes, vencida: f.vencida })),
        ].map(f => {
          const activo = cartera === f.vendedor
          return (
            <button key={f.vendedor} onClick={() => setCartera(f.vendedor)}
              style={{
                textAlign: 'left', cursor: 'pointer', font: 'inherit',
                background: activo ? 'rgba(212,175,55,0.08)' : 'var(--surface)',
                border: `1px solid ${activo ? 'var(--gold)' : 'var(--border)'}`,
                borderRadius: 12, padding: '13px 16px',
              }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: activo ? 'var(--gold)' : 'var(--muted)', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: 6 }}>
                {f.nombre}
              </p>
              <p style={{ fontSize: 17, fontWeight: 900, color: '#F87171' }}>{formatCurrency(f.vencida)}</p>
              <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>
                {f.deudores} deudor{f.deudores === 1 ? '' : 'es'}{f.clientes > 0 ? ` de ${f.clientes}` : ''}
              </p>
            </button>
          )
        })}
      </div>

      {/* ── Filtros ──────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px', marginBottom: 16 }}>
        <div>
          <label style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, display: 'block', marginBottom: 6 }}>BUSCAR</label>
          <div style={{ position: 'relative' }}>
            <Search size={14} color="var(--muted)" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
            <input type="text" value={searchText} onChange={e => setSearchText(e.target.value)} placeholder="Nombre cliente…" style={{ ...inputStyle, paddingLeft: 30 }} />
          </div>
        </div>
        <div>
          <label style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, display: 'block', marginBottom: 6 }}>VENDEDOR</label>
          <select value={cartera} onChange={e => setCartera(e.target.value)} style={selectStyle}>
            <option value="todos">Todos los vendedores</option>
            {carteras.map(f => <option key={f.vendedor} value={f.vendedor}>{f.vendedor}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, display: 'block', marginBottom: 6 }}>ESTADO</label>
          <select value={estado} onChange={e => setEstado(e.target.value as typeof estado)} style={selectStyle}>
            <option value="todos">Todos</option>
            <option value="vencida">Con deuda vencida</option>
            <option value="sin-vencida">Sin deuda vencida</option>
          </select>
        </div>
      </div>

      {/* ── Tabla ────────────────────────────────────────────────────────── */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        {filtrados.length === 0 ? (
          <div style={{ padding: '48px 24px', textAlign: 'center' }}>
            <Wallet size={28} style={{ color: 'var(--muted)', margin: '0 auto 10px' }} />
            <p style={{ color: 'var(--muted)', fontSize: 14 }}>
              {universo.length === 0 ? 'Todavía no hay deudores cargados.' : 'No hay deudores que coincidan con los filtros.'}
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Cliente', 'Vendedor', 'Deuda Vencida', 'Días Vencida', 'Saldo Total', 'Barriles', 'Último Pago', ''].map(h => (
                    <th key={h} style={{
                      padding: '10px 14px',
                      textAlign: ['Deuda Vencida', 'Saldo Total', 'Barriles', 'Días Vencida'].includes(h) ? 'right' : 'left',
                      fontSize: 11, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.5px', textTransform: 'uppercase', whiteSpace: 'nowrap',
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtrados.map(d => {
                  const abierto = expandedRow === d.id
                  const dias = diasMoraDe(d)
                  return (
                    <Fragment key={d.id}>
                      <tr
                        onClick={() => { setExpandedRow(abierto ? null : d.id); setCobranza(null) }}
                        style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', background: abierto ? 'rgba(212,175,55,0.04)' : 'transparent' }}
                        onMouseEnter={e => { if (!abierto) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.03)' }}
                        onMouseLeave={e => { if (!abierto) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                      >
                        <td style={{ padding: '11px 14px', fontWeight: 700, color: 'var(--cream)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {d.nombre_fantasia}
                        </td>
                        <td style={{ padding: '11px 14px', color: 'var(--muted)' }}>{vendedorCanonico(d.vendedor) || '—'}</td>
                        <td style={{ padding: '11px 14px', textAlign: 'right', fontWeight: 700, color: d.deuda_comercial > 0 ? '#F87171' : '#4ADE80' }}>
                          {formatCurrency(d.deuda_comercial)}
                          {d.maquila_vencida > 0 && (
                            <span style={{ display: 'block', fontSize: 10.5, fontWeight: 500, color: 'var(--muted)' }}>
                              + {formatCurrency(Math.round(d.maquila_vencida))} maquila
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '11px 14px', textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap', color: dias >= 60 ? '#F87171' : dias > 0 ? '#FBBF24' : 'var(--muted)' }}>
                          {dias > 0 ? `${dias} días` : '—'}
                        </td>
                        <td style={{ padding: '11px 14px', textAlign: 'right', color: 'var(--cream)', fontWeight: 600 }}>{formatCurrency(d.saldo_comercial)}</td>
                        <td style={{ padding: '11px 14px', textAlign: 'right', color: d.barriles_adeudados > 0 ? '#C084FC' : 'var(--muted)', fontWeight: 600 }}>{d.barriles_adeudados}</td>
                        <td style={{ padding: '11px 14px', color: 'var(--muted)' }}>{d.ultimo_pago ? new Date(d.ultimo_pago).toLocaleDateString('es-CL') : '—'}</td>
                        <td style={{ padding: '11px 14px', textAlign: 'center' }}>
                          {abierto ? <ChevronDown size={14} style={{ color: 'var(--gold)' }} /> : <ChevronRight size={14} style={{ color: 'var(--muted)' }} />}
                        </td>
                      </tr>

                      {abierto && (
                        <tr key={`${d.id}-detalle`}>
                          <td colSpan={8} style={{ padding: '20px 24px', background: 'rgba(212,175,55,0.03)', borderBottom: '1px solid var(--border)', borderLeft: '3px solid var(--gold)' }}>
                            <PanelCobranza cliente={d.nombre_fantasia} tema="oscuro" onDatos={setCobranza} />

                            <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
                              <button onClick={e => { e.stopPropagation(); abrirWA(d) }}
                                style={{ minHeight: 38, padding: '0 16px', display: 'flex', alignItems: 'center', gap: 7,
                                  background: 'rgba(37,211,102,0.12)', border: '1px solid rgba(37,211,102,0.3)',
                                  borderRadius: 10, color: '#25D366', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
                                <MessageCircle size={14} /> Cobrar por WhatsApp
                              </button>
                              {d.telefono && (
                                <a href={`tel:${d.telefono}`} onClick={e => e.stopPropagation()}
                                  style={{ minHeight: 38, padding: '0 16px', display: 'flex', alignItems: 'center', gap: 7,
                                    background: 'rgba(96,165,250,0.10)', border: '1px solid rgba(96,165,250,0.28)',
                                    borderRadius: 10, color: '#60A5FA', fontSize: 12.5, fontWeight: 700, textDecoration: 'none' }}>
                                  <Phone size={14} /> Llamar
                                </a>
                              )}
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 24 }}>
                              <div>
                                <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--gold)', letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: 10 }}>Contacto</p>
                                {[
                                  { label: 'Email', value: d.email },
                                  { label: 'Teléfono', value: d.telefono },
                                  { label: 'Localidad', value: d.localidad },
                                  { label: 'Razón Social', value: d.razon_social },
                                ].map(({ label, value }) => (
                                  <div key={label} style={{ marginBottom: 6 }}>
                                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>{label}: </span>
                                    <span style={{ fontSize: 12, color: 'var(--cream)' }}>{value || '—'}</span>
                                  </div>
                                ))}
                              </div>
                              <div>
                                <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--gold)', letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: 10 }}>Deuda por Antigüedad</p>
                                {[
                                  { label: '0–14 días', value: d.deuda_menor_14_dias },
                                  { label: '15–29 días', value: d.deuda_entre_15_29_dias },
                                  { label: '30–44 días', value: d.deuda_entre_30_44_dias },
                                  { label: '45–59 días', value: d.deuda_entre_45_59_dias },
                                  { label: '60–89 días', value: d.deuda_entre_60_89_dias },
                                  { label: '+90 días', value: d.deuda_mas_90_dias },
                                ].map(({ label, value }) => (
                                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>{label}</span>
                                    <span style={{ fontSize: 12, fontWeight: 700, color: (value || 0) > 0 ? '#F87171' : 'var(--muted)' }}>{formatCurrency(value || 0)}</span>
                                  </div>
                                ))}
                              </div>
                              <div>
                                <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--gold)', letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: 10 }}>Cuenta</p>
                                {[
                                  { label: 'Tipo Cliente', value: d.tipo_cliente },
                                  { label: 'Límite Cta Cte', value: d.limite_cta_cte ? formatCurrency(d.limite_cta_cte) : null },
                                  { label: 'Días Pago', value: d.dias_pago ? `${d.dias_pago} días` : null },
                                  { label: 'Última Compra', value: d.fecha_ultima_compra ? new Date(d.fecha_ultima_compra).toLocaleDateString('es-CL') : null },
                                  { label: 'Fecha Alta', value: d.fecha_alta ? new Date(d.fecha_alta).toLocaleDateString('es-CL') : null },
                                ].map(({ label, value }) => (
                                  <div key={label} style={{ marginBottom: 6 }}>
                                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>{label}: </span>
                                    <span style={{ fontSize: 12, color: 'var(--cream)' }}>{value || '—'}</span>
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

      <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8, textAlign: 'right' }}>
        Mostrando {filtrados.length} de {universo.length} deudores
      </p>

      {waTarget && <WAModal target={waTarget} onClose={() => setWaTarget(null)} />}
    </div>
  )
}
