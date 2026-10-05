'use client'

/**
 * Pestaña COBRANZA — "¿a quién hay que llamar?". Desde la auditoría del 2-oct-2026
 * reemplaza las seis versiones de "lo atrasado" que tenía el módulo por una sola lista:
 * facturas que, según cómo paga cada cliente, ya debieron entrar y no entraron (misma
 * fuente que la pestaña Caja). Debajo, la deuda que reporta el ERP (cartera de venta) y
 * cómo paga cada cliente.
 */

import { useMemo, useState } from 'react'
import { FileDown, PhoneCall, UserX, ClipboardList } from 'lucide-react'
import type { DatosCajaCobrada } from '@/lib/administracion/cajaCobradaDatos'
import type { DatosCobros, ResumenDeuda } from './page'
import IngresoRealSection from './IngresoRealSection'
import DeudaClienteSection, { type DeudorRaw } from './DeudaClienteSection'
import type { BarrilesFuera } from '@/lib/barrilesFuera'
import { C, Card, Etiqueta, Franja } from './tema'

const fMoney = (n: number) => '$' + Math.round(n).toLocaleString('es-CL')

const th: React.CSSProperties = { padding: '9px 12px', fontSize: 10.5, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase', color: C.muted, textAlign: 'right', whiteSpace: 'nowrap', background: C.bg, borderBottom: `1px solid ${C.line}` }
const td: React.CSSProperties = { padding: '8px 12px', fontSize: 13, textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', borderBottom: `1px solid ${C.line}` }

export default function CobranzaSection({ caja, deuda, cobros, deudoresDetalle, clientesPorVendedor, maquilaPorCliente, barrilesFuera, hoyISO }: {
  caja: DatosCajaCobrada
  deuda: ResumenDeuda
  cobros: DatosCobros
  deudoresDetalle: DeudorRaw[]
  clientesPorVendedor: Record<string, number>
  maquilaPorCliente: Record<string, number>
  barrilesFuera: BarrilesFuera
  hoyISO: string
}) {
  const [vendedor, setVendedor] = useState('todos')
  const [verTodos, setVerTodos] = useState(false)
  const lista = caja.atrasadoPorCliente
  const vendedores = useMemo(() => [...new Set(lista.map(a => a.vendedor ?? 'Sin vendedor'))].sort(), [lista])
  const filtrada = vendedor === 'todos' ? lista : lista.filter(a => (a.vendedor ?? 'Sin vendedor') === vendedor)
  const total = filtrada.reduce((s, a) => s + a.monto, 0)
  const mas30 = filtrada.filter(a => a.diasAtraso > 30)
  // Backtest: de lo atrasado, solo se recupera ~6% el primer mes, 1,4% el segundo y 0,6% el
  // tercero sin gestión extra. Lo que no entra a ese ritmo depende de cobrar activamente.
  const recuperoSolo = caja.caja.meses.reduce((s, m) => s + m.atrasadas, 0)
  const atrasadoTotal = caja.caja.atrasado.monto

  function csv() {
    const filas = [['Cliente', 'Vendedor', 'Facturas', 'Monto atrasado', 'Días de atraso', 'Vencido según ERP'],
      ...filtrada.map(a => [a.cliente, a.vendedor ?? '', a.facturas, Math.round(a.monto), a.diasAtraso, Math.round(a.vencidaErp)])]
    const txt = '﻿' + filas.map(f => f.map(v => (typeof v === 'number' ? v : `"${String(v).replace(/"/g, '""')}"`)).join(';')).join('\n')
    const url = URL.createObjectURL(new Blob([txt], { type: 'text/csv;charset=utf-8' }))
    const el = document.createElement('a'); el.href = url; el.download = `cobranza-atrasados-${hoyISO}.csv`; el.click(); URL.revokeObjectURL(url)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* ── Las 3 cifras ── */}
      <Franja min={250}>
        <Card acento={total > 0 ? C.redBorder : undefined}>
          <Etiqueta title="Facturas cuya fecha de pago esperada (vencimiento + lo que suele demorarse ese cliente) ya pasó y siguen sin pago en el ERP. Es lo accionable: plata que debió entrar.">
            <PhoneCall size={12} /> Debió entrar y no entró
          </Etiqueta>
          <p style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.035em', color: C.red, marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>{fMoney(total)}</p>
          <p style={{ fontSize: 11.5, color: C.muted }}>{filtrada.length} clientes · {filtrada.reduce((s, a) => s + a.facturas, 0)} facturas</p>
          {vendedor === 'todos' && atrasadoTotal > 0 && (
            <p style={{ fontSize: 11.5, color: C.text, marginTop: 6, lineHeight: 1.5 }}>
              A su ritmo histórico, solas entrarían {fMoney(recuperoSolo)} ({Math.round((recuperoSolo / atrasadoTotal) * 100)}%) de aquí a fin de año.
              {' '}<strong>{fMoney(atrasadoTotal - recuperoSolo)} dependen de la gestión de cobranza.</strong>
            </p>
          )}
        </Card>
        <Card>
          <Etiqueta title="Del informe Deudores del ERP, sólo la cartera de venta (4 carteras + Claudio): sin cuentas internas, incobrables ni muestras.">
            <UserX size={12} /> Vencido según el ERP
          </Etiqueta>
          <p style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.035em', color: C.text, marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>{fMoney(deuda.vencida)}</p>
          <p style={{ fontSize: 11.5, color: C.muted }}>{deuda.clientes} clientes{deuda.ultimaCarga ? ` · al ${deuda.ultimaCarga.slice(8, 10)}/${deuda.ultimaCarga.slice(5, 7)}` : ''}</p>
        </Card>
        <Card acento={mas30.length > 0 ? C.amberBorder : undefined}>
          <Etiqueta title="Clientes con al menos una factura más de 30 días después de cuando suelen pagar: prioridad de llamada.">Más de 30 días de atraso</Etiqueta>
          <p style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.035em', color: mas30.length ? C.amber : C.text, marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>{mas30.length}</p>
          <p style={{ fontSize: 11.5, color: C.muted }}>{fMoney(mas30.reduce((s, a) => s + a.monto, 0))} en juego</p>
        </Card>
      </Franja>

      {/* ── Lista única de atrasados ── */}
      <Card padding={0}>
        <div style={{ padding: '16px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 800, color: C.text }}>A quién llamar</h3>
            <p style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>Ordenado por monto. Días = desde cuando, según su comportamiento, ya debía haber pagado.</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <select value={vendedor} onChange={e => setVendedor(e.target.value)} style={{ padding: '7px 10px', borderRadius: 9, border: `1px solid ${C.line}`, fontSize: 12.5, fontWeight: 600 }}>
              <option value="todos">Todos los vendedores</option>
              {vendedores.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
            <button onClick={csv} style={{ whiteSpace: 'nowrap', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 9, border: `1px solid ${C.line}`, background: C.card, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              <FileDown size={13} /> Excel (CSV)
            </button>
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', minWidth: 720, borderCollapse: 'collapse' }}>
            <thead><tr>
              <th style={{ ...th, textAlign: 'left' }}>Cliente</th>
              <th style={{ ...th, textAlign: 'left' }}>Vendedor</th>
              <th style={th}>Facturas</th>
              <th style={th}>Monto atrasado</th>
              <th style={th}>Días</th>
              <th style={th} title="Deuda vencida que el ERP reporta para ese cliente.">Vencido ERP</th>
            </tr></thead>
            <tbody>
              {(verTodos ? filtrada : filtrada.slice(0, 25)).map(a => (
                <tr key={a.cliente}>
                  <td style={{ ...td, textAlign: 'left', fontWeight: 700, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.cliente}</td>
                  <td style={{ ...td, textAlign: 'left', color: C.muted }}>{a.vendedor ?? '—'}</td>
                  <td style={td}>{a.facturas}</td>
                  <td style={{ ...td, fontWeight: 800, color: C.red }}>{fMoney(a.monto)}</td>
                  <td style={{ ...td, fontWeight: 700, color: a.diasAtraso > 30 ? C.red : a.diasAtraso > 7 ? C.amber : C.muted }}>{a.diasAtraso}</td>
                  <td style={{ ...td, color: C.muted }}>{a.vencidaErp ? fMoney(a.vencidaErp) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtrada.length > 25 && (
          <button onClick={() => setVerTodos(v => !v)} style={{ margin: '10px 18px 14px', background: 'none', border: 'none', color: C.blue, fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}>
            {verTodos ? 'Ver sólo los 25 primeros' : `Ver los ${filtrada.length}`}
          </button>
        )}
      </Card>

      {/* ── Fichas por completar (datos que faltan) ── */}
      {caja.clientesSinPlazo.length > 0 && (
        <Card acento={C.amberBorder} padding="14px 18px">
          <p style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13.5, fontWeight: 800, color: C.text }}>
            <ClipboardList size={15} color={C.amber} /> {caja.clientesSinPlazo.length} clientes a crédito sin plazo de pago en su ficha
          </p>
          <p style={{ fontSize: 12, color: C.muted, marginTop: 4, lineHeight: 1.55 }}>
            Se proyectan con la mediana de la cartera. Cargar el plazo pactado en el ERP mejora la proyección de caja y el aviso de atraso.
          </p>
          <p style={{ fontSize: 12, color: C.text, marginTop: 8, lineHeight: 1.7 }}>{caja.clientesSinPlazo.slice(0, 30).join(' · ')}{caja.clientesSinPlazo.length > 30 ? ` · +${caja.clientesSinPlazo.length - 30} más` : ''}</p>
        </Card>
      )}

      {/* ── Deuda que reporta el ERP (cartera de venta) ── */}
      <DeudaClienteSection
        initialDeudores={deudoresDetalle}
        clientesPorVendedor={clientesPorVendedor}
        maquilaPorCliente={maquilaPorCliente}
        barrilesFuera={barrilesFuera}
      />

      {/* ── Cómo paga cada cliente ── */}
      <IngresoRealSection datos={cobros} modo="cobranza" />
    </div>
  )
}
