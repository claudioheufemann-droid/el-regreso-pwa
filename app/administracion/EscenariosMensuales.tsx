'use client'

/**
 * Cuánto entra por mes de clientes MAYORISTAS + ENLATADO MÓVIL (EWU y Bundor), en tres
 * escenarios, del mes en curso a diciembre, y DE DÓNDE sale: facturas que quedan por pagar
 * (al día y atrasadas) vs. venta proyectada. Pedidos del usuario del 2-oct-2026. La lógica
 * está en construirEscenarios (lib/administracion/cajaCobradaDatos.ts).
 */

import { useState } from 'react'
import { FileDown } from 'lucide-react'
import type { EscenariosCaja, EscenarioMes, EscenarioCaja } from '@/lib/administracion/cajaCobradaDatos'

const C = {
  card: '#FFFFFF', text: '#0F172A', muted: '#64748B', faint: '#94A3B8', line: '#E2E8F0', bg: '#F8FAFC',
  blue: '#2563EB', blueSoft: '#EFF6FF', amber: '#B45309', amberSoft: '#FFFBEB', green: '#047857', greenSoft: '#ECFDF5',
  red: '#B91C1C', teal: '#0F766E', violet: '#6D28D9',
}
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const fMes = (yyyymm: string) => MESES[Number(yyyymm.split('-')[1]) - 1]
const fMoney = (n: number) => '$' + Math.round(n).toLocaleString('es-CL')
const fM = (n: number) => `$${(n / 1e6).toFixed(1).replace('.', ',')} M`

const ESTILO: Record<EscenarioCaja['id'], { color: string; fondo: string }> = {
  conservador: { color: C.amber, fondo: C.amberSoft },
  base: { color: C.blue, fondo: C.blueSoft },
  optimista: { color: C.green, fondo: C.greenSoft },
}

/** Columnas de la composición, en el orden en que la plata es más segura. */
const PARTES: { key: 'real' | 'facturas' | 'atrasadas' | 'venta' | 'ewu'; label: string; color: string; ayuda: string }[] = [
  { key: 'real', label: 'Ya cobrado', color: C.text, ayuda: 'Lo que ya entró en el mes en curso.' },
  { key: 'facturas', label: 'Facturas por pagar', color: C.blue, ayuda: 'Facturas ya emitidas, todavía al día, que según cómo paga cada cliente se cobran ese mes.' },
  { key: 'atrasadas', label: 'Atrasadas recuperadas', color: C.red, ayuda: 'Parte de las facturas que ya debieron pagarse y no se han pagado, al ritmo de recuperación medido del escenario.' },
  { key: 'venta', label: 'Venta proyectada', color: C.violet, ayuda: 'Venta que todavía no se factura (forecast o ritmo actual, más pedidos sin despachar), cobrada con el patrón real de plazos.' },
  { key: 'ewu', label: 'EWU (ritmo)', color: C.teal, ayuda: 'EWU no aparece en el informe de ventas: se proyecta con lo que viene pagando cada mes.' },
]

const th: React.CSSProperties = { padding: '10px 14px', fontSize: 10.5, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase', color: C.muted, textAlign: 'right', whiteSpace: 'nowrap', background: C.bg, borderBottom: `1px solid ${C.line}` }
const td: React.CSSProperties = { padding: '10px 14px', textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', borderBottom: `1px solid ${C.line}`, verticalAlign: 'top', fontSize: 13.5 }

const VACIO: EscenarioMes = { mes: 'total', mayoristas: 0, enlatado: 0, total: 0, real: 0, facturas: 0, atrasadas: 0, venta: 0, ewu: 0 }
const sumar = (ms: EscenarioMes[]): EscenarioMes => ms.reduce((a, m) => ({
  mes: 'total', mayoristas: a.mayoristas + m.mayoristas, enlatado: a.enlatado + m.enlatado, total: a.total + m.total,
  real: a.real + m.real, facturas: a.facturas + m.facturas, atrasadas: a.atrasadas + m.atrasadas, venta: a.venta + m.venta, ewu: a.ewu + m.ewu,
}), VACIO)

function CeldaTotal({ m, color, fuerte }: { m: EscenarioMes; color: string; fuerte?: boolean }) {
  return (
    <td style={{ ...td, background: fuerte ? C.bg : undefined }}>
      <div style={{ fontSize: fuerte ? 15.5 : 14.5, fontWeight: 900, color }}>{fMoney(m.total)}</div>
      <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>may {fM(m.mayoristas)} · enl {fM(m.enlatado)}</div>
    </td>
  )
}

export default function EscenariosMensuales({ datos, hoyISO }: { datos: EscenariosCaja; hoyISO: string }) {
  const { escenarios, anioAnterior, supuestos } = datos
  const [activo, setActivo] = useState<EscenarioCaja['id']>('base')
  const esc = escenarios.find(e => e.id === activo) ?? escenarios[0]
  const meses = escenarios[0]?.meses.map(m => m.mes) ?? []
  const anio = Number(hoyISO.slice(0, 4))
  const totalEsc = sumar(esc.meses)
  const carteraHoy = supuestos.facturasAlDia + supuestos.atrasado
  const cobradoDeFacturas = totalEsc.facturas + totalEsc.atrasadas

  function csv() {
    const filas: (string | number)[][] = [['Mes', 'Escenario', 'Ya cobrado', 'Facturas por pagar', 'Atrasadas recuperadas', 'Venta proyectada', 'EWU', 'Mayoristas', 'Enlatado móvil', 'Total']]
    for (const e of escenarios) for (const m of e.meses) filas.push([fMes(m.mes), e.nombre, m.real, m.facturas, m.atrasadas, m.venta, m.ewu, m.mayoristas, m.enlatado, m.total])
    for (const m of anioAnterior) filas.push([fMes(m.mes), `Real ${anio - 1}`, m.total, 0, 0, 0, 0, m.mayoristas, m.enlatado, m.total])
    const txt = '﻿' + filas.map(f => f.map(v => (typeof v === 'number' ? Math.round(v) : `"${v}"`)).join(';')).join('\n')
    const url = URL.createObjectURL(new Blob([txt], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a'); a.href = url; a.download = `escenarios-cobro-${hoyISO}.csv`; a.click(); URL.revokeObjectURL(url)
  }

  return (
    <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 16 }}>
      <div style={{ padding: '16px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ fontSize: 15, fontWeight: 800, color: C.text }}>Cuánto entra por mes: mayoristas + enlatado móvil</h3>
          <p style={{ fontSize: 12, color: C.muted, marginTop: 3, maxWidth: 700, lineHeight: 1.5 }}>
            Facturas que quedan por pagar + venta proyectada, en tres escenarios. Bruto (lo que llega al banco). No incluye el mostrador PDV ni BaseCamp.
          </p>
        </div>
        <button onClick={csv} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 9, border: `1px solid ${C.line}`, background: C.card, color: C.text, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
          <FileDown size={13} /> Excel (CSV)
        </button>
      </div>

      {/* ── Totales por escenario ── */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', minWidth: 760, borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: 'left' }}>Mes</th>
              {escenarios.map(e => <th key={e.id} style={{ ...th, color: ESTILO[e.id].color }}>{e.nombre}</th>)}
              <th style={th} title="Lo que de verdad cobraron los clientes a crédito ese mes del año anterior.">Real {anio - 1}</th>
            </tr>
          </thead>
          <tbody>
            {meses.map((mes, i) => (
              <tr key={mes}>
                <td style={{ ...td, textAlign: 'left', fontWeight: 800, color: C.text, textTransform: 'capitalize' }}>
                  {fMes(mes)}
                  {mes === hoyISO.slice(0, 7) && <div style={{ fontSize: 10.5, fontWeight: 600, color: C.muted, textTransform: 'none' }}>en curso</div>}
                </td>
                {escenarios.map(e => <CeldaTotal key={e.id} m={e.meses[i]} color={ESTILO[e.id].color} />)}
                <CeldaTotal m={anioAnterior[i]} color={C.muted} />
              </tr>
            ))}
            <tr>
              <td style={{ ...td, textAlign: 'left', fontWeight: 900, color: C.text, background: C.bg }}>Total</td>
              {escenarios.map(e => <CeldaTotal key={e.id} m={sumar(e.meses)} color={ESTILO[e.id].color} fuerte />)}
              <CeldaTotal m={sumar(anioAnterior)} color={C.muted} fuerte />
            </tr>
          </tbody>
        </table>
      </div>

      {/* ── De dónde sale la plata del escenario elegido ── */}
      <div style={{ padding: '18px 18px 6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <p style={{ fontSize: 13.5, fontWeight: 800, color: C.text }}>De dónde sale: facturas por pagar vs. venta proyectada</p>
        <div style={{ display: 'flex', gap: 6 }}>
          {escenarios.map(e => (
            <button key={e.id} onClick={() => setActivo(e.id)} style={{
              padding: '6px 12px', borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: 'pointer',
              border: `1px solid ${activo === e.id ? ESTILO[e.id].color : C.line}`,
              background: activo === e.id ? ESTILO[e.id].fondo : 'transparent', color: activo === e.id ? ESTILO[e.id].color : C.muted,
            }}>{e.nombre}</button>
          ))}
        </div>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', minWidth: 820, borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: 'left' }}>Mes</th>
              {PARTES.map(p => <th key={p.key} style={{ ...th, color: p.color }} title={p.ayuda}>{p.label}</th>)}
              <th style={th}>Total</th>
            </tr>
          </thead>
          <tbody>
            {[...esc.meses, totalEsc].map(m => {
              const esTotal = m.mes === 'total'
              return (
                <tr key={m.mes}>
                  <td style={{ ...td, textAlign: 'left', fontWeight: 800, textTransform: 'capitalize', background: esTotal ? C.bg : undefined }}>{esTotal ? 'Total' : fMes(m.mes)}</td>
                  {PARTES.map(p => (
                    <td key={p.key} style={{ ...td, color: m[p.key] ? p.color : C.faint, fontWeight: esTotal ? 800 : 500, background: esTotal ? C.bg : undefined }}>{m[p.key] ? fMoney(m[p.key]) : '—'}</td>
                  ))}
                  <td style={{ ...td, fontWeight: 900, color: ESTILO[esc.id].color, background: esTotal ? C.bg : undefined }}>{fMoney(m.total)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* ── Las facturas que quedan por pagar hoy ── */}
      <div style={{ margin: '14px 18px 0', padding: '12px 14px', borderRadius: 11, background: C.bg, fontSize: 12.5, color: C.text, lineHeight: 1.65 }}>
        <strong>Facturas que quedan por pagar hoy: {fMoney(carteraHoy)}</strong> = {fMoney(supuestos.facturasAlDia)} al día + <span style={{ color: C.red, fontWeight: 700 }}>{fMoney(supuestos.atrasado)} atrasadas</span>.
        {' '}En el escenario {esc.nombre.toLowerCase()} se cobran {fMoney(cobradoDeFacturas)} de aquí a fin de año y <strong>quedan {fMoney(supuestos.quedanAlCierre[esc.id])} por cobrar al 31-dic</strong> (casi todo, atrasadas que no se recuperan al ritmo medido).
        {' '}El resto del total ({fMoney(totalEsc.venta + totalEsc.ewu)}) depende de ventas que todavía no ocurren.
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10, padding: '14px 18px 4px' }}>
        {escenarios.map(e => (
          <div key={e.id} style={{ background: ESTILO[e.id].fondo, borderRadius: 11, padding: '10px 12px' }}>
            <p style={{ fontSize: 12, fontWeight: 800, color: ESTILO[e.id].color }}>{e.nombre}</p>
            <p style={{ fontSize: 11.5, color: C.text, marginTop: 3, lineHeight: 1.5 }}>{e.descripcion}</p>
          </div>
        ))}
      </div>
      <p style={{ padding: '10px 18px 16px', fontSize: 11.5, color: C.muted, lineHeight: 1.6 }}>
        Supuestos: venta a crédito al ritmo actual {fM(supuestos.ritmoCicloCredito)} por ciclo · EWU pagó entre {fM(supuestos.ewu.min)} y {fM(supuestos.ewu.max)} al mes en los últimos {supuestos.ewu.meses} meses ·
        recuperación de atrasadas medida entre 0% y 13% al mes (abr-sep 2026). Error del modelo mes a mes: ±16% promedio.
      </p>
    </div>
  )
}
