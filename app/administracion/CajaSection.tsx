'use client'

/**
 * Pestaña CAJA — "¿cuánta plata vamos a tener y cuándo podemos comprar?".
 * Un solo motor: la Caja real cobrada (lib/administracion/cajaCobrada.ts). Desde la
 * auditoría del 2-oct-2026 reemplaza a Flujo de Caja, a la proyección de "Plata que
 * entró" y a la curva de Cobranza, que daban tres números distintos para la misma semana.
 *
 * Orden: datos al día → 3 cifras → gráfico → planilla semanal → planilla mensual →
 * validaciones → cómo se calcula → calendario y lo que entró de verdad → carga manual.
 */

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { Wallet, ArrowDownToLine, CalendarRange, FileDown, CheckCircle2, TriangleAlert, Info, ChevronDown, ChevronRight, Database } from 'lucide-react'
import type { DatosCajaCobrada, EscenariosCaja } from '@/lib/administracion/cajaCobradaDatos'
import { CALIBRACION_BACKTEST } from '@/lib/administracion/cajaCobrada'
import type { DatosCobros, SaldoBanco } from './page'
import IngresoRealSection from './IngresoRealSection'
import CargaDatosCaja from './CargaDatosCaja'
import EscenariosMensuales from './EscenariosMensuales'

const C = {
  card: '#FFFFFF', text: '#0F172A', muted: '#64748B', faint: '#94A3B8', line: '#E2E8F0', bg: '#F8FAFC',
  blue: '#2563EB', blueSoft: '#EFF6FF', sky: '#93C5FD', teal: '#0D9488', green: '#059669', greenSoft: '#ECFDF5',
  amber: '#D97706', amberSoft: '#FFFBEB', amberBorder: '#FDE68A', red: '#DC2626', redSoft: '#FEF2F2', redBorder: '#FECACA',
  stone: '#A8A29E',
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const fMoney = (n: number) => (n < 0 ? '−$' : '$') + Math.round(Math.abs(n)).toLocaleString('es-CL')
const fM = (n: number) => `${n < 0 ? '−' : ''}$${(Math.abs(n) / 1e6).toFixed(1).replace('.', ',')} M`
const fDia = (iso: string) => { const [, m, d] = iso.split('-'); return `${d}/${m}` }
const fMes = (yyyymm: string) => { const [y, m] = yyyymm.split('-'); return `${MESES[Number(m) - 1]} ${y}` }
const fPct = (x: number) => `${(x * 100).toFixed(0)}%`

export interface FrescuraDato {
  nombre: string
  /** Hasta qué fecha llega el dato (null = nunca cargado). */
  fecha: string | null
  estado: 'ok' | 'viejo' | 'vacio'
  detalle: string
  href?: string
}

/** CSV para Excel en Chile: separador ";" y BOM para que respete tildes. */
function descargarCsv(nombre: string, filas: (string | number)[][]) {
  const txt = '﻿' + filas.map(f => f.map(v => (typeof v === 'number' ? Math.round(v) : `"${String(v).replace(/"/g, '""')}"`)).join(';')).join('\n')
  const url = URL.createObjectURL(new Blob([txt], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url; a.download = nombre; a.click()
  URL.revokeObjectURL(url)
}

function Card({ children, acento, padding = 20 }: { children: React.ReactNode; acento?: string; padding?: number | string }) {
  return <div style={{ background: C.card, border: `1px solid ${acento ?? C.line}`, borderRadius: 16, padding }}>{children}</div>
}

function Etiqueta({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <p title={title} style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: C.muted, display: 'flex', alignItems: 'center', gap: 5 }}>
      {children}
      {title && <Info size={11} style={{ opacity: 0.5 }} />}
    </p>
  )
}

function BotonCsv({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 9, border: `1px solid ${C.line}`, background: C.card, color: C.text, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
      <FileDown size={13} /> Excel (CSV)
    </button>
  )
}

const th: React.CSSProperties = { padding: '9px 12px', fontSize: 10.5, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase', color: C.muted, textAlign: 'right', whiteSpace: 'nowrap', background: C.bg, borderBottom: `1px solid ${C.line}` }
const td: React.CSSProperties = { padding: '8px 12px', fontSize: 13, textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', borderBottom: `1px solid ${C.line}` }

type Semaforo = 'rojo' | 'amarillo' | 'verde'
const COLOR_SEMAFORO: Record<Semaforo, string> = { rojo: C.red, amarillo: C.amber, verde: C.green }

export default function CajaSection({ datos, escenarios, cobros, saldoActual, hayCompras, frescura, hoyISO }: {
  datos: DatosCajaCobrada
  escenarios: EscenariosCaja
  cobros: DatosCobros
  saldoActual: { fecha: string; total: number; porBanco: SaldoBanco[] } | null
  hayCompras: boolean
  frescura: FrescuraDato[]
  hoyISO: string
}) {
  const { caja, supuestos } = datos
  const [verComo, setVerComo] = useState(false)
  const hayBanco = caja.saldoInicialBanco != null

  const prox4 = caja.semanas.slice(0, 4)
  const entra4 = prox4.reduce((s, x) => s + x.entradas, 0)
  const conf4 = prox4.reduce((s, x) => s + x.confirmado, 0)
  const proy4 = prox4.reduce((s, x) => s + x.proyectado, 0)
  const cont4 = prox4.reduce((s, x) => s + x.contado, 0)
  const atr4 = prox4.reduce((s, x) => s + x.atrasadas, 0)
  const ultima = caja.semanas[caja.semanas.length - 1]
  const peor = caja.semanas.reduce((m, s) => (s.acumulado < m.acumulado ? s : m), caja.semanas[0])

  // Semáforo por semana: rojo si el saldo acumulado queda negativo; amarillo si esa semana sale más de lo que entra.
  const semaforo = (s: (typeof caja.semanas)[number]): Semaforo => (hayBanco && s.acumulado < 0 ? 'rojo' : s.neto < 0 ? 'amarillo' : 'verde')

  const grafico = useMemo(() => caja.semanas.map(s => ({
    semana: `S${s.semanaIso}`,
    Confirmado: Math.round(s.confirmado),
    Proyectado: Math.round(s.proyectado),
    Atrasadas: Math.round(s.atrasadas),
    Contado: Math.round(s.contado),
    Salidas: -Math.round(s.salidas),
    Acumulado: Math.round(s.acumulado),
  })), [caja.semanas])

    const difErp = datos.carteraErp - datos.carteraReconstruida

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

      {/* ── Datos al día ── */}
      <Card padding="12px 16px">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 800, color: C.text }}><Database size={14} color={C.muted} /> Datos al día</span>
          {frescura.map(f => {
            const color = f.estado === 'ok' ? C.green : f.estado === 'viejo' ? C.amber : C.red
            const chip = (
              <span title={f.detalle} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 700, color: C.text, padding: '4px 10px', borderRadius: 999, border: `1px solid ${f.estado === 'ok' ? C.line : color}`, background: f.estado === 'ok' ? C.card : f.estado === 'viejo' ? C.amberSoft : C.redSoft }}>
                <span style={{ width: 7, height: 7, borderRadius: 99, background: color }} />
                {f.nombre}: <span style={{ fontWeight: 600, color: C.muted }}>{f.fecha ? `hasta ${fDia(f.fecha)}` : 'sin cargar'}</span>
              </span>
            )
            return f.href && f.estado !== 'ok' ? <Link key={f.nombre} href={f.href} style={{ textDecoration: 'none' }}>{chip}</Link> : <span key={f.nombre}>{chip}</span>
          })}
        </div>
      </Card>

      {/* ── Las 3 cifras ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 14 }}>
        <Card acento={!hayBanco ? C.amberBorder : undefined}>
          <Etiqueta title="Suma del último saldo cargado de cada cuenta (Chile, Santander, Itaú). El ERP no lo entrega: se carga a mano al pie de esta pestaña.">
            <Wallet size={12} /> Plata en bancos hoy
          </Etiqueta>
          {hayBanco && saldoActual ? (
            <>
              <p style={{ fontSize: 30, fontWeight: 900, color: C.text, marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>{fMoney(saldoActual.total)}</p>
              <p style={{ fontSize: 11.5, color: C.muted }}>al {fDia(saldoActual.fecha)} · {saldoActual.porBanco.length} de 3 cuentas</p>
            </>
          ) : (
            <>
              <p style={{ fontSize: 20, fontWeight: 800, color: C.amber, marginTop: 8 }}>Sin cargar</p>
              <p style={{ fontSize: 12, color: C.muted, marginTop: 4, lineHeight: 1.5 }}>Sin este dato la planilla muestra el flujo acumulado desde cero, no la plata disponible. <a href="#carga-datos" style={{ color: C.blue, fontWeight: 700 }}>Cargar saldos</a></p>
            </>
          )}
        </Card>
        <Card>
          <Etiqueta title="Entradas de esta semana y las 3 siguientes: facturas por cobrar (confirmado) + venta a crédito proyectada + venta al contado. En bruto: lo que llega al banco.">
            <ArrowDownToLine size={12} /> Entra en las próximas 4 semanas
          </Etiqueta>
          <p style={{ fontSize: 30, fontWeight: 900, color: C.blue, marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>{fMoney(entra4)}</p>
          <p style={{ fontSize: 11.5, color: C.muted }}>{fM(conf4)} confirmado · {fM(proy4)} proyectado · {fM(atr4)} atrasadas · {fM(cont4)} contado</p>
        </Card>
        <Card acento={hayBanco && ultima && ultima.acumulado < 0 ? C.redBorder : undefined}>
          <Etiqueta title={hayBanco ? 'Saldo de bancos + todo lo que entra − todo lo que sale hasta la última semana del año.' : 'Sin saldo de bancos: es lo que entra menos lo que sale de aquí al 31-dic, partiendo de cero.'}>
            <CalendarRange size={12} /> {hayBanco ? 'Saldo proyectado al 31-dic' : 'Flujo neto de aquí al 31-dic'}
          </Etiqueta>
          <p style={{ fontSize: 30, fontWeight: 900, color: ultima && ultima.acumulado < 0 ? C.red : C.green, marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>{ultima ? fMoney(ultima.acumulado) : '—'}</p>
          <p style={{ fontSize: 11.5, color: C.muted }}>
            {hayBanco && peor ? `punto más bajo: ${fMoney(peor.acumulado)} en S${peor.semanaIso}` : 'salidas = sólo compras de insumos (sin sueldos ni arriendos)'}
          </p>
        </Card>
      </div>

      {/* ── Por mes y escenario: mayoristas + enlatado ── */}
      <EscenariosMensuales datos={escenarios} hoyISO={hoyISO} />

      {/* ── Gráfico ── */}
      <Card>
        <h3 style={{ fontSize: 15, fontWeight: 800, color: C.text }}>Entradas y salidas por semana</h3>
        <p style={{ fontSize: 12, color: C.muted, marginTop: 3, marginBottom: 10 }}>Confirmado, proyectado y contado siempre van separados. La línea es el {hayBanco ? 'saldo' : 'flujo'} acumulado.</p>
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={grafico} stackOffset="sign">
            <CartesianGrid strokeDasharray="3 3" stroke={C.line} vertical={false} />
            <XAxis dataKey="semana" tick={{ fontSize: 11, fill: C.muted }} />
            <YAxis tickFormatter={v => fM(Number(v))} tick={{ fontSize: 11, fill: C.muted }} width={70} />
            <Tooltip formatter={(v) => fMoney(Number(v))} contentStyle={{ borderRadius: 10, border: `1px solid ${C.line}`, fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <ReferenceLine y={0} stroke={C.faint} />
            <Bar dataKey="Confirmado" stackId="e" fill={C.blue} />
            <Bar dataKey="Proyectado" stackId="e" fill={C.sky} />
            <Bar dataKey="Atrasadas" stackId="e" fill={C.red} />
            <Bar dataKey="Contado" stackId="e" fill={C.teal} />
            <Bar dataKey="Salidas" stackId="e" fill={C.stone} />
            <Line dataKey="Acumulado" stroke={C.text} strokeWidth={2} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </Card>

      {/* ── Planilla semanal ── */}
      <Card padding={0}>
        <div style={{ padding: '16px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 800, color: C.text }}>Semana a semana, hasta el 31 de diciembre</h3>
            <p style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>CLP brutos. Semáforo: rojo = el saldo queda negativo · amarillo = esa semana sale más de lo que entra.</p>
          </div>
          <BotonCsv onClick={() => descargarCsv(`caja-semanal-${hoyISO}.csv`, [
            ['Semana ISO', 'Desde', 'Confirmado', 'Proyectado', 'Atrasadas recuperadas', 'Contado', 'Total entradas', 'Salidas', 'Neto', 'Acumulado', 'Ajuste backtest (ya aplicado)'],
            ...caja.semanas.map(s => [s.semanaIso, s.lunes, s.confirmado, s.proyectado, s.atrasadas, s.contado, s.entradas, s.salidas, s.neto, s.acumulado, s.ajusteBacktest]),
          ])} />
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', minWidth: 860, borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: 'left' }}>Semana</th>
                <th style={th} title="Facturas ya emitidas e impagas que, según cómo paga cada cliente, deberían entrar esa semana, corregidas con el backtest (los clientes pagan más lento de lo que su perfil supone).">Confirmado</th>
                <th style={th} title="Venta a crédito que todavía no se factura (litros de Producción × precio real + pedidos sin despachar), cobrada con el patrón real de pago y corregida con el backtest.">Proyectado</th>
                <th style={th} title="Facturas atrasadas que se recuperan, al ritmo medido (6% / 1,4% / 0,6% del pendiente por mes).">Atrasadas</th>
                <th style={th} title="Mostrador PDV + restaurante BaseCamp: promedio real reciente.">Contado</th>
                <th style={th}>Total entradas</th>
                <th style={th} title="Pagos a proveedores cargados + compras de insumos proyectadas. No incluye sueldos, arriendos ni impuestos.">Salidas</th>
                <th style={th}>Neto</th>
                <th style={th}>{hayBanco ? 'Saldo' : 'Acumulado'}</th>
              </tr>
            </thead>
            <tbody>
              {caja.semanas.map(s => {
                const sem = semaforo(s)
                return (
                  <tr key={s.lunes}>
                    <td style={{ ...td, textAlign: 'left', fontWeight: 700 }}>
                      <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 99, background: COLOR_SEMAFORO[sem], marginRight: 8 }} />
                      S{s.semanaIso} <span style={{ color: C.muted, fontWeight: 500 }}>· {fDia(s.lunes)}</span>
                    </td>
                    <td style={{ ...td, color: C.blue }}>{fMoney(s.confirmado)}</td>
                    <td style={{ ...td, color: C.muted }}>{fMoney(s.proyectado)}</td>
                    <td style={{ ...td, color: C.red }}>{s.atrasadas ? fMoney(s.atrasadas) : '—'}</td>
                    <td style={{ ...td, color: C.teal }}>{fMoney(s.contado)}</td>
                    <td style={{ ...td, fontWeight: 800 }}>{fMoney(s.entradas)}</td>
                    <td style={{ ...td, color: C.muted }}>{s.salidas ? `−${fMoney(s.salidas)}` : '—'}</td>
                    <td style={{ ...td, color: s.neto < 0 ? C.amber : C.text }}>{fMoney(s.neto)}</td>
                    <td style={{ ...td, fontWeight: 800, color: hayBanco && s.acumulado < 0 ? C.red : C.text }}>{fMoney(s.acumulado)}</td>
                  </tr>
                )
              })}
              <tr>
                <td style={{ ...td, textAlign: 'left', fontWeight: 800, background: C.bg }}>Total</td>
                {(['confirmado', 'proyectado', 'atrasadas', 'contado', 'entradas', 'salidas', 'neto'] as const).map(k => (
                  <td key={k} style={{ ...td, fontWeight: 800, background: C.bg }}>{fMoney(caja.semanas.reduce((a, s) => a + s[k], 0) * (k === 'salidas' ? -1 : 1))}</td>
                ))}
                <td style={{ ...td, background: C.bg }} />
              </tr>
            </tbody>
          </table>
        </div>
        <p style={{ padding: '10px 18px 14px', fontSize: 12, color: C.muted, lineHeight: 1.55 }}>
          Hay <strong style={{ color: C.red }}>{fMoney(caja.atrasado.monto)}</strong> en {caja.atrasado.facturas} facturas que ya debieron pagarse: la columna Atrasadas sólo
          cuenta lo que se recupera solo al ritmo medido ({fMoney(caja.semanas.reduce((a, s) => a + s.atrasadas, 0))} a fin de año). El resto depende de la gestión de cobranza.
          {' '}Confirmado y proyectado ya vienen corregidos con el backtest: {fMoney(-caja.semanas.reduce((a, s) => a + s.ajusteBacktest, 0))} menos que lo que daba el modelo sin corregir.
        </p>
      </Card>

      {/* ── Planilla mensual ── */}
      <Card padding={0}>
        <div style={{ padding: '16px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 800, color: C.text }}>Mes a mes: lo que se factura vs. lo que se cobra (venta a crédito)</h3>
            <p style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>Meses calendario. El mes en curso suma lo ya facturado y cobrado más lo esperado.</p>
          </div>
          <BotonCsv onClick={() => descargarCsv(`caja-mensual-${hoyISO}.csv`, [
            ['Mes', 'Venta a crédito facturada', 'Caja cobrada a crédito', 'Diferencia', 'Saldo por cobrar al cierre'],
            ...caja.meses.map(m => [fMes(m.mes), m.facturado, m.cobrado, m.cobrado - m.facturado, m.saldoCierre]),
          ])} />
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', minWidth: 620, borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: 'left' }}>Mes</th>
                <th style={th}>Venta facturada</th>
                <th style={th}>Caja cobrada</th>
                <th style={th}>Diferencia</th>
                <th style={th}>Saldo por cobrar al cierre</th>
              </tr>
            </thead>
            <tbody>
              {caja.meses.map(m => (
                <tr key={m.mes}>
                  <td style={{ ...td, textAlign: 'left', fontWeight: 700, textTransform: 'capitalize' }}>{fMes(m.mes)}</td>
                  <td style={td}>{fMoney(m.facturado)}</td>
                  <td style={{ ...td, color: C.blue, fontWeight: 700 }}>{fMoney(m.cobrado)}</td>
                  <td style={{ ...td, color: m.cobrado - m.facturado < 0 ? C.amber : C.green }}>{fMoney(m.cobrado - m.facturado)}</td>
                  <td style={{ ...td, fontWeight: 800 }}>{fMoney(m.saldoCierre)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ── Validaciones ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14 }}>
        <Card acento={caja.cuadratura.ok ? undefined : C.redBorder}>
          <Etiqueta>Cuadratura</Etiqueta>
          <p style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 14, fontWeight: 800, color: caja.cuadratura.ok ? C.green : C.red, marginTop: 8 }}>
            {caja.cuadratura.ok ? <CheckCircle2 size={17} /> : <TriangleAlert size={17} />} {caja.cuadratura.ok ? 'Cuadra' : 'No cuadra'}
          </p>
          <p style={{ fontSize: 12, color: C.muted, marginTop: 6, lineHeight: 1.6, fontVariantNumeric: 'tabular-nums' }}>
            Cartera inicial {fMoney(caja.cuadratura.carteraInicial)} + facturado {fMoney(caja.cuadratura.facturadoFuturo)}
            {' '}= cobrado {fMoney(caja.cuadratura.cobradoFuturo)} + saldo por cobrar {fMoney(caja.cuadratura.saldoFinal)}
          </p>
          {!caja.cuadratura.ok && <p style={{ fontSize: 12, color: C.red, marginTop: 6, fontWeight: 700 }}>{caja.cuadratura.mensaje}</p>}
          <p style={{ fontSize: 11.5, color: C.muted, marginTop: 8, lineHeight: 1.5 }}>
            Contra el ERP: la cartera reconstruida factura por factura es {fMoney(datos.carteraReconstruida)}; el informe Deudores (cartera de venta) dice {fMoney(datos.carteraErp)}
            {' '}({difErp >= 0 ? 'el ERP tiene ' : 'el ERP tiene '}{fMoney(Math.abs(difErp))} {difErp >= 0 ? 'más' : 'menos'}: facturas de más de 120 días, maquila y abonos sin factura imputada).
          </p>
        </Card>
        <Card>
          <Etiqueta title="Parado el 1.º de cada mes de ene a sep 2026, con lo que se sabía ese día, se proyectaron los 3 meses siguientes y se comparó con lo que entró (scripts/analisis/backtest-escenarios-caja.ts).">Backtest: qué tan bien proyecta</Etiqueta>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 8 }}>
            <thead><tr>
              <th style={{ ...th, textAlign: 'left', padding: '6px 8px' }}>Proyectando a</th>
              <th style={{ ...th, padding: '6px 8px' }}>Sin corregir</th>
              <th style={{ ...th, padding: '6px 8px' }}>Corregido</th>
              <th style={{ ...th, padding: '6px 8px' }}>Factor</th>
            </tr></thead>
            <tbody>
              {[['1 mes', '25%, sesgo +13%'], ['2 meses', '33%, sesgo +25%'], ['3 meses', '26%, sesgo +27%']].map(([h, sin], i) => (
                <tr key={h}>
                  <td style={{ ...td, textAlign: 'left', padding: '6px 8px' }}>{h}</td>
                  <td style={{ ...td, padding: '6px 8px', color: C.amber }}>{sin}</td>
                  <td style={{ ...td, padding: '6px 8px', fontWeight: 700, color: C.green }}>{Math.round(CALIBRACION_BACKTEST.error[i] * 100)}%</td>
                  <td style={{ ...td, padding: '6px 8px' }}>{CALIBRACION_BACKTEST.k[i].toFixed(2).replace('.', ',')}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ fontSize: 11.5, color: C.muted, marginTop: 8, lineHeight: 1.5 }}>
            Error medio por mes, medido fuera de muestra. El modelo sin corregir era optimista: los clientes pagan más lento de lo que su perfil supone y ~19% de lo que
            entra llega sin factura imputada. Factor = lo que de verdad entra por cada $1 proyectado. Recalibrar cada mes corriendo el script.
          </p>
        </Card>
      </div>

      {/* ── Cómo se calcula ── */}
      <Card padding="14px 18px">
        <button onClick={() => setVerComo(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 13.5, fontWeight: 800, color: C.text }}>
          {verComo ? <ChevronDown size={15} /> : <ChevronRight size={15} />} Cómo se calcula
        </button>
        {verComo && (
          <div style={{ fontSize: 12.5, color: C.text, lineHeight: 1.7, marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <p><strong>Confirmado:</strong> cada factura impaga se cobra en su vencimiento (emisión + plazo de la ficha) más el desvío habitual del cliente, medido sobre sus pagos de los últimos 12 meses y ponderado por monto. Con menos de 3 pagos se usa el promedio de su segmento: hoy los clientes al día pagan {datos.segmentos.cumple.desvio.toFixed(1)} días después del vencimiento y los morosos {datos.segmentos.moroso.desvio.toFixed(1)}. Fin de semana pasa al lunes. El {fPct(datos.cobertura.propio / ((datos.cobertura.propio + datos.cobertura.segmento) || 1))} del monto usa historial propio.</p>
            <p><strong>Proyectado:</strong> forecast de venta × {fPct(supuestos.participacionCredito)} que es crédito × {supuestos.factorBruto.toFixed(2).replace('.', ',')} (neto→bruto), repartido en días según cómo se factura, y cobrado con el mix real de plazos: {datos.mix.filter(t => t.participacion >= 0.02).map(t => `${t.pactado} días ${fPct(t.participacion)} (pagan a ${Math.round(t.diasMedios)})`).join(' · ')}. Del mes en curso sólo entra lo que falta vender. Los pedidos sin despachar se cobran según su cliente.</p>
            <p><strong>Contado:</strong> {fMoney(supuestos.contadoSemanal)} por semana = mostrador {fMoney(supuestos.mostradorSemanal)} + BaseCamp {fMoney(supuestos.basecampSemanal)} (promedio real reciente).</p>
            <p><strong>Salidas:</strong> {supuestos.comprasComprometidasFuturas > 0 ? `${fMoney(supuestos.comprasComprometidasFuturas)} en pagos a proveedores cargados + ` : 'no hay pagos a proveedores con fecha futura cargados; '}compras de insumos proyectadas (forecast de compras + IVA), pagadas {supuestos.diasPagoProveedores} días después. No incluye sueldos, arriendos, créditos ni impuestos: si los cargas como pagos a proveedor, entran.</p>
            <p><strong>Fuera del modelo:</strong> cuentas propias (PDV, BaseCamp El Regreso, ferias, marketing, mermas, muestras) y {datos.clientesSinPlazo.length} clientes sin plazo en su ficha, que se proyectan con la mediana de la cartera.</p>
          </div>
        )}
      </Card>

      {/* ── Calendario de esta semana y lo que entró de verdad ── */}
      <IngresoRealSection datos={cobros} modo="caja" />

      <div id="carga-datos">
        <CargaDatosCaja hayCompras={hayCompras} saldoActual={saldoActual} hoyISO={hoyISO} />
      </div>
    </div>
  )
}
