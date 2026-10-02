'use client'

/**
 * Cuánto entra por mes de clientes MAYORISTAS + ENLATADO MÓVIL (EWU y Bundor), en tres
 * escenarios, del mes en curso a diciembre. Pedido del usuario el 2-oct-2026: "verlo por
 * escenario de proyección y mensual de octubre a diciembre". La lógica está en
 * construirEscenarios (lib/administracion/cajaCobradaDatos.ts).
 */

import { FileDown } from 'lucide-react'
import type { EscenariosCaja, EscenarioMes } from '@/lib/administracion/cajaCobradaDatos'

const C = {
  card: '#FFFFFF', text: '#0F172A', muted: '#64748B', faint: '#94A3B8', line: '#E2E8F0', bg: '#F8FAFC',
  blue: '#2563EB', blueSoft: '#EFF6FF', amber: '#B45309', amberSoft: '#FFFBEB', green: '#047857', greenSoft: '#ECFDF5',
}
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const fMes = (yyyymm: string) => MESES[Number(yyyymm.split('-')[1]) - 1]
const fMoney = (n: number) => '$' + Math.round(n).toLocaleString('es-CL')
const fM = (n: number) => `$${(n / 1e6).toFixed(1).replace('.', ',')} M`

const ESTILO: Record<string, { color: string; fondo: string }> = {
  conservador: { color: C.amber, fondo: C.amberSoft },
  base: { color: C.blue, fondo: C.blueSoft },
  optimista: { color: C.green, fondo: C.greenSoft },
}

const th: React.CSSProperties = { padding: '10px 14px', fontSize: 10.5, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase', color: C.muted, textAlign: 'right', whiteSpace: 'nowrap', background: C.bg, borderBottom: `1px solid ${C.line}` }
const td: React.CSSProperties = { padding: '10px 14px', textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', borderBottom: `1px solid ${C.line}`, verticalAlign: 'top' }

function Celda({ m, color, fuerte }: { m: EscenarioMes; color: string; fuerte?: boolean }) {
  return (
    <td style={{ ...td, background: fuerte ? C.bg : undefined }}>
      <div style={{ fontSize: fuerte ? 15.5 : 14.5, fontWeight: 900, color }}>{fMoney(m.total)}</div>
      <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>may {fM(m.mayoristas)} · enl {fM(m.enlatado)}</div>
    </td>
  )
}

const sumar = (ms: EscenarioMes[]): EscenarioMes => ms.reduce(
  (a, m) => ({ mes: 'total', mayoristas: a.mayoristas + m.mayoristas, enlatado: a.enlatado + m.enlatado, total: a.total + m.total }),
  { mes: 'total', mayoristas: 0, enlatado: 0, total: 0 },
)

export default function EscenariosMensuales({ datos, hoyISO }: { datos: EscenariosCaja; hoyISO: string }) {
  const { escenarios, anioAnterior, supuestos } = datos
  const meses = escenarios[0]?.meses.map(m => m.mes) ?? []
  const anio = Number(hoyISO.slice(0, 4))

  function csv() {
    const filas: (string | number)[][] = [['Mes', 'Escenario', 'Mayoristas', 'Enlatado móvil', 'Total']]
    for (const e of escenarios) for (const m of e.meses) filas.push([fMes(m.mes), e.nombre, m.mayoristas, m.enlatado, m.total])
    for (const m of anioAnterior) filas.push([fMes(m.mes), `Real ${anio - 1}`, m.mayoristas, m.enlatado, m.total])
    const txt = '﻿' + filas.map(f => f.map(v => (typeof v === 'number' ? Math.round(v) : `"${v}"`)).join(';')).join('\n')
    const url = URL.createObjectURL(new Blob([txt], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a'); a.href = url; a.download = `escenarios-cobro-${hoyISO}.csv`; a.click(); URL.revokeObjectURL(url)
  }

  return (
    <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 16 }}>
      <div style={{ padding: '16px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ fontSize: 15, fontWeight: 800, color: C.text }}>Cuánto entra por mes: mayoristas + enlatado móvil</h3>
          <p style={{ fontSize: 12, color: C.muted, marginTop: 3, maxWidth: 680, lineHeight: 1.5 }}>
            Tres escenarios, en bruto (lo que llega al banco). No incluye el mostrador PDV ni BaseCamp. El mes en curso suma lo ya cobrado.
          </p>
        </div>
        <button onClick={csv} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 9, border: `1px solid ${C.line}`, background: C.card, color: C.text, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
          <FileDown size={13} /> Excel (CSV)
        </button>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', minWidth: 760, borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: 'left' }}>Mes</th>
              {escenarios.map(e => <th key={e.id} style={{ ...th, color: ESTILO[e.id].color }}>{e.nombre}</th>)}
              <th style={th} title="Lo que de verdad cobraron los mismos clientes ese mes del año anterior.">Real {anio - 1}</th>
            </tr>
          </thead>
          <tbody>
            {meses.map((mes, i) => (
              <tr key={mes}>
                <td style={{ ...td, textAlign: 'left', fontSize: 13.5, fontWeight: 800, color: C.text, textTransform: 'capitalize' }}>
                  {fMes(mes)}
                  {mes === hoyISO.slice(0, 7) && <div style={{ fontSize: 10.5, fontWeight: 600, color: C.muted, textTransform: 'none' }}>en curso</div>}
                </td>
                {escenarios.map(e => <Celda key={e.id} m={e.meses[i]} color={ESTILO[e.id].color} />)}
                <Celda m={anioAnterior[i]} color={C.muted} />
              </tr>
            ))}
            <tr>
              <td style={{ ...td, textAlign: 'left', fontSize: 13.5, fontWeight: 900, color: C.text, background: C.bg }}>Total</td>
              {escenarios.map(e => <Celda key={e.id} m={sumar(e.meses)} color={ESTILO[e.id].color} fuerte />)}
              <Celda m={sumar(anioAnterior)} color={C.muted} fuerte />
            </tr>
          </tbody>
        </table>
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
        Datos de los supuestos: venta a crédito al ritmo actual {fM(supuestos.ritmoCicloCredito)} por ciclo · EWU pagó entre {fM(supuestos.ewu.min)} y {fM(supuestos.ewu.max)} al mes
        en los últimos {supuestos.ewu.meses} meses (no aparece en el informe de ventas, por eso se proyecta con su ritmo de pago) · hoy hay {fM(supuestos.atrasado)} atrasado por cobrar.
        Error del modelo medido mes a mes: ±16% promedio.
      </p>
    </div>
  )
}
