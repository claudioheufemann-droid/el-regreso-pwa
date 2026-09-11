'use client'

import { useMemo, useState } from 'react'
import {
  ComposedChart, Bar, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceArea, Cell,
} from 'recharts'
import {
  Wallet, TrendingUp, TrendingDown, ArrowDownCircle, Beaker, RotateCcw,
  Info, Timer, Plus, Check,
} from 'lucide-react'
import type { DatosFlujo } from './page'
import type { SemanaFlujo } from '@/lib/administracion/flujoSemanal'

/**
 * Paleta cálida (dorados/naranjos) sobre fondo claro, pedida explícitamente
 * para esta sección. Convive con el celeste de las otras pestañas de
 * Administración: acá el dorado es el acento principal porque es el color con
 * el que se leen los valores PROYECTADOS, que son los que hay que poder
 * distinguir de un vistazo de los confirmados.
 */
const P = {
  card: '#FFFFFF',
  text: '#0F172A',
  muted: '#64748B',
  faint: '#94A3B8',
  line: '#E2E8F0',
  /** Confirmado: dorado profundo, trazo sólido. */
  gold: '#B45309',
  goldFill: 'rgba(180, 83, 9, 0.12)',
  /** Proyectado: naranjo claro, trazo punteado. */
  amber: '#F59E0B',
  amberSoft: '#FFFBEB',
  amberBorder: '#FDE68A',
  /** Compras a proveedores. */
  stone: '#78716C',
  stoneLight: '#D6D3D1',
  green: '#059669',
  greenSoft: '#ECFDF5',
  greenBand: 'rgba(5, 150, 105, 0.05)',
  red: '#DC2626',
  redSoft: '#FEF2F2',
  redBorder: '#FECACA',
  redBand: 'rgba(220, 38, 38, 0.06)',
}

const fMoney = (n: number) => (n < 0 ? '−$' : '$') + Math.round(Math.abs(n)).toLocaleString('es-CL')
const fCompact = (n: number) => {
  const abs = Math.abs(n)
  const signo = n < 0 ? '−' : ''
  if (abs >= 1_000_000) return `${signo}$${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `${signo}$${Math.round(abs / 1_000)}k`
  return `${signo}$${Math.round(abs)}`
}
const fDia = (iso: string) => {
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}
function semanaISO(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  const fecha = new Date(Date.UTC(y, m - 1, d))
  const diaLunes1 = (fecha.getUTCDay() + 6) % 7
  fecha.setUTCDate(fecha.getUTCDate() - diaLunes1 + 3)
  const primerJueves = new Date(Date.UTC(fecha.getUTCFullYear(), 0, 4))
  return 1 + Math.round((fecha.getTime() - primerJueves.getTime()) / (7 * 86_400_000))
}
const fRango = (iso: string) => {
  const fin = new Date(Date.parse(`${iso}T00:00:00Z`) + 6 * 86_400_000).toISOString().slice(0, 10)
  return `${fDia(iso)} – ${fDia(fin)}`
}

function Card({ children, acento, padding = 20 }: { children: React.ReactNode; acento?: string; padding?: number }) {
  return (
    <div style={{ background: P.card, border: `1px solid ${acento ?? P.line}`, borderRadius: 16, padding }}>
      {children}
    </div>
  )
}

function Etiqueta({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <p title={title} style={{
      fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase',
      color: P.muted, display: 'flex', alignItems: 'center', gap: 5,
    }}>
      {children}
      {title && <Info size={11} style={{ opacity: 0.5 }} />}
    </p>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 11px', borderRadius: 10, border: `1px solid ${P.line}`,
  fontSize: 13, color: P.text, background: '#fff', fontFamily: 'inherit', boxSizing: 'border-box',
}

interface Props {
  flujo: DatosFlujo
  hoyISO: string
}

export default function FlujoCajaDashboard({ flujo, hoyISO }: Props) {
  const [cliente, setCliente] = useState('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [simMonto, setSimMonto] = useState('')
  const [simSemana, setSimSemana] = useState('')
  const [simAplicada, setSimAplicada] = useState<{ monto: number; semana: string } | null>(null)

  const todas = flujo.semanas
  const saldoBase = todas.length > 0 ? todas[0].saldoAcumulado - todas[0].flujoNeto : 0

  /** Semanas dentro del rango elegido (por defecto, todas). */
  const enRango = useMemo(() => {
    const d = desde || todas[0]?.inicio || ''
    const h = hasta || todas[todas.length - 1]?.inicio || ''
    return todas.filter(s => s.inicio >= d && s.inicio <= h)
  }, [todas, desde, hasta])

  /**
   * Recalcula la cascada completa con el filtro de cliente y la simulación
   * aplicados. El saldo acumulado se arrastra desde el saldo real cargado, así
   * que cualquier cambio arriba mueve todas las semanas siguientes.
   */
  const semanas: SemanaFlujo[] = useMemo(() => {
    const sinSaldo = enRango.map(s => {
      const ingresosConfirmados = cliente
        ? (flujo.confirmadoPorClienteSemana[`${s.inicio}|${cliente}`] ?? 0)
        : s.ingresosConfirmados
      const ingresosProyectados = cliente
        ? (flujo.backlogPorClienteSemana[`${s.inicio}|${cliente}`] ?? 0)
        : s.ingresosProyectados
      const extra = simAplicada && simAplicada.semana === s.inicio ? simAplicada.monto : 0
      const comprasReales = s.comprasReales + extra
      return {
        ...s,
        ingresosConfirmados, ingresosProyectados, comprasReales,
        flujoNeto: ingresosConfirmados + ingresosProyectados - comprasReales - s.comprasProyectadas,
        deficit: comprasReales + s.comprasProyectadas > ingresosConfirmados + ingresosProyectados,
      }
    })
    // El saldo se arrastra: cada semana parte del cierre de la anterior.
    return sinSaldo.reduce<SemanaFlujo[]>((acc, s) => {
      const previo = acc.length === 0 ? saldoBase : acc[acc.length - 1].saldoAcumulado
      acc.push({ ...s, saldoAcumulado: previo + s.flujoNeto })
      return acc
    }, [])
  }, [enRango, cliente, simAplicada, saldoBase, flujo.confirmadoPorClienteSemana, flujo.backlogPorClienteSemana])

  const proxima = useMemo(() => {
    const lunesHoy = semanas.find(s => s.actual)?.inicio
    const idx = lunesHoy ? semanas.findIndex(s => s.inicio === lunesHoy) : -1
    return idx >= 0 && idx + 1 < semanas.length ? semanas[idx + 1] : semanas.find(s => !s.pasada && !s.actual) ?? null
  }, [semanas])

  const variacionSaldo = flujo.saldoActual && flujo.saldoPrevio && flujo.saldoPrevio.saldo !== 0
    ? ((flujo.saldoActual.saldo - flujo.saldoPrevio.saldo) / Math.abs(flujo.saldoPrevio.saldo)) * 100
    : null

  const datosChart = semanas.map(s => ({
    etiqueta: `S${semanaISO(s.inicio)}`,
    inicio: s.inicio,
    confirmados: Math.round(s.ingresosConfirmados),
    proyectados: Math.round(s.ingresosProyectados),
    comprasReales: Math.round(s.comprasReales),
    comprasProyectadas: Math.round(s.comprasProyectadas),
    deficit: s.deficit,
  }))

  function aplicarSimulacion() {
    const monto = Number(simMonto.replace(/[^\d]/g, ''))
    const semana = simSemana || semanas.find(s => !s.pasada)?.inicio
    if (!monto || !semana) return
    setSimAplicada({ monto, semana })
  }
  function resetSimulacion() {
    setSimAplicada(null)
    setSimMonto('')
    setSimSemana('')
  }

  const semanaSimulada = simAplicada ? semanas.find(s => s.inicio === simAplicada.semana) ?? null : null
  const originalSimulada = simAplicada ? enRango.find(s => s.inicio === simAplicada.semana) ?? null : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── Filtros ─────────────────────────────────────────────────────────── */}
      <Card padding={14}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
          <div style={{ minWidth: 200, flex: 1 }}>
            <Etiqueta>Cliente</Etiqueta>
            <select value={cliente} onChange={e => setCliente(e.target.value)} style={{ ...inputStyle, marginTop: 6 }}>
              <option value="">Todos los clientes</option>
              {flujo.clientesFiltro.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div style={{ minWidth: 150 }}>
            <Etiqueta>Desde</Etiqueta>
            <select value={desde} onChange={e => setDesde(e.target.value)} style={{ ...inputStyle, marginTop: 6 }}>
              <option value="">Primera</option>
              {todas.map(s => <option key={s.inicio} value={s.inicio}>Semana {semanaISO(s.inicio)}</option>)}
            </select>
          </div>
          <div style={{ minWidth: 150 }}>
            <Etiqueta>Hasta</Etiqueta>
            <select value={hasta} onChange={e => setHasta(e.target.value)} style={{ ...inputStyle, marginTop: 6 }}>
              <option value="">Última</option>
              {todas.map(s => <option key={s.inicio} value={s.inicio}>Semana {semanaISO(s.inicio)}</option>)}
            </select>
          </div>
          {(cliente || desde || hasta) && (
            <button
              onClick={() => { setCliente(''); setDesde(''); setHasta('') }}
              style={{
                padding: '9px 14px', borderRadius: 10, border: `1px solid ${P.line}`,
                background: '#fff', color: P.muted, fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
              }}
            >
              Limpiar filtros
            </button>
          )}
        </div>
        {cliente && (
          <p style={{ fontSize: 11.5, color: P.muted, marginTop: 10 }}>
            Con un cliente elegido sólo se muestra lo <strong>atribuible a él</strong>: sus ventas despachadas por
            cobrar y su backlog. La proyección del modelo de ventas es agregada (no sabe de qué cliente vendrá), así
            que queda fuera de este filtro.
          </p>
        )}
      </Card>

      {/* ── Tarjetas resumen ────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
        <Card>
          <Etiqueta title="Saldo bancario cargado a mano por Administración: el ERP no entrega saldo de cuenta corriente por ningún informe.">
            <Wallet size={12} /> Saldo de caja actual
          </Etiqueta>
          {flujo.saldoActual ? (
            <>
              <p style={{ fontSize: 28, fontWeight: 800, color: P.text, marginTop: 8, letterSpacing: '-0.02em' }}>
                {fMoney(flujo.saldoActual.saldo)}
              </p>
              <p style={{ fontSize: 12, color: variacionSaldo == null ? P.faint : variacionSaldo >= 0 ? P.green : P.red, marginTop: 4, fontWeight: 600 }}>
                {variacionSaldo == null
                  ? `Al ${fDia(flujo.saldoActual.fecha)} · sin saldo anterior para comparar`
                  : `${variacionSaldo >= 0 ? '▲' : '▼'} ${Math.abs(variacionSaldo).toFixed(1)}% vs. ${fDia(flujo.saldoPrevio!.fecha)}`}
              </p>
            </>
          ) : (
            <p style={{ fontSize: 13, color: P.faint, marginTop: 10, lineHeight: 1.5 }}>
              Sin saldo cargado. Cárgalo abajo para que el saldo acumulado de la tabla parta de un número real.
            </p>
          )}
        </Card>

        <Card acento={proxima && proxima.flujoNeto < 0 ? P.redBorder : undefined}>
          <Etiqueta title="Ingresos esperados menos compras comprometidas de la próxima semana.">
            {proxima && proxima.flujoNeto < 0 ? <TrendingDown size={12} /> : <TrendingUp size={12} />} Flujo neto próxima semana
          </Etiqueta>
          <p style={{
            fontSize: 28, fontWeight: 800, marginTop: 8, letterSpacing: '-0.02em',
            color: !proxima ? P.faint : proxima.flujoNeto >= 0 ? P.green : P.red,
          }}>
            {proxima ? fMoney(proxima.flujoNeto) : '—'}
          </p>
          <p style={{ fontSize: 12, color: P.muted, marginTop: 4 }}>
            {proxima ? `Semana ${semanaISO(proxima.inicio)} · ${fRango(proxima.inicio)}` : 'Fuera del rango elegido'}
          </p>
        </Card>

        <Card>
          <Etiqueta title="Confirmado = venta ya despachada, con el plazo corriendo. Proyectado = backlog sin despachar + lo que el modelo espera vender. Nunca se suman.">
            Ingresos próxima semana
          </Etiqueta>
          <div style={{ display: 'flex', gap: 18, marginTop: 8 }}>
            <div>
              <p style={{ fontSize: 22, fontWeight: 800, color: P.gold, letterSpacing: '-0.02em' }}>
                {proxima ? fCompact(proxima.ingresosConfirmados) : '—'}
              </p>
              <p style={{ fontSize: 11, color: P.muted, fontWeight: 600, marginTop: 2 }}>Confirmados</p>
            </div>
            <div style={{ borderLeft: `1px solid ${P.line}`, paddingLeft: 18 }}>
              <p style={{ fontSize: 22, fontWeight: 800, color: P.amber, letterSpacing: '-0.02em' }}>
                {proxima ? fCompact(proxima.ingresosProyectados) : '—'}
              </p>
              <p style={{ fontSize: 11, color: P.muted, fontWeight: 600, marginTop: 2 }}>Proyectados</p>
            </div>
          </div>
        </Card>

        <Card>
          <Etiqueta title="Pagos a proveedores con fecha de pago dentro de la próxima semana, cargados por Administración.">
            <ArrowDownCircle size={12} /> Compras comprometidas próx. semana
          </Etiqueta>
          <p style={{ fontSize: 28, fontWeight: 800, color: P.stone, marginTop: 8, letterSpacing: '-0.02em' }}>
            {proxima ? fMoney(proxima.comprasReales + proxima.comprasProyectadas) : '—'}
          </p>
          <p style={{ fontSize: 12, color: P.muted, marginTop: 4 }}>
            {!flujo.hayCompras
              ? 'Todavía no hay pagos cargados'
              : proxima ? `${fCompact(proxima.comprasReales)} en firme · ${fCompact(proxima.comprasProyectadas)} estimadas` : '—'}
          </p>
        </Card>
      </div>

      {/* ── Gráfico + Simulador ─────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2.2fr) minmax(260px, 1fr)', gap: 14 }}>
        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: P.text }}>Ingresos vs. compras por semana</h3>
              <p style={{ fontSize: 12, color: P.muted, marginTop: 2 }}>
                Banda roja: las compras superan todo el ingreso esperado. Banda verde: hay superávit.
              </p>
            </div>
          </div>
          <div style={{ height: 340, marginTop: 14 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={datosChart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={P.line} vertical={false} />
                {datosChart.map(d => (
                  <ReferenceArea
                    key={d.inicio}
                    x1={d.etiqueta} x2={d.etiqueta}
                    fill={d.deficit ? P.redBand : P.greenBand}
                    stroke="none"
                  />
                ))}
                <XAxis dataKey="etiqueta" tick={{ fontSize: 11, fill: P.muted }} axisLine={{ stroke: P.line }} tickLine={false} />
                <YAxis tickFormatter={fCompact} tick={{ fontSize: 11, fill: P.muted }} axisLine={false} tickLine={false} width={56} />
                <Tooltip
                  formatter={(v, name) => [fMoney(Number(v) || 0), String(name)]}
                  labelFormatter={l => {
                    const d = datosChart.find(x => x.etiqueta === l)
                    return d ? `Semana ${semanaISO(d.inicio)} · ${fRango(d.inicio)}` : String(l ?? '')
                  }}
                  contentStyle={{ borderRadius: 12, border: `1px solid ${P.line}`, fontSize: 12 }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="comprasReales" name="Compras en firme" stackId="compras" fill={P.stone} radius={[0, 0, 0, 0]}>
                  {datosChart.map(d => (
                    <Cell key={d.inicio} fill={d.deficit ? P.red : P.stone} />
                  ))}
                </Bar>
                <Bar dataKey="comprasProyectadas" name="Compras proyectadas" stackId="compras" fill={P.stoneLight} radius={[4, 4, 0, 0]} />
                <Area
                  type="monotone" dataKey="confirmados" name="Ingresos confirmados"
                  stroke={P.gold} strokeWidth={2.5} fill={P.goldFill} dot={false}
                />
                <Line
                  type="monotone" dataKey="proyectados" name="Ingresos proyectados (estimado)"
                  stroke={P.amber} strokeWidth={2.5} strokeDasharray="6 4" dot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Simulador de compras */}
        <Card acento={simAplicada ? P.amberBorder : undefined}>
          <Etiqueta><Beaker size={12} /> Simulador de compras</Etiqueta>
          <p style={{ fontSize: 12, color: P.muted, marginTop: 6, lineHeight: 1.5 }}>
            Inserta una compra hipotética y mira cómo queda el flujo de esa semana y el saldo de las siguientes.
          </p>

          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <Etiqueta>Monto</Etiqueta>
              <input
                value={simMonto}
                onChange={e => setSimMonto(e.target.value)}
                placeholder="$ 2.500.000"
                inputMode="numeric"
                style={{ ...inputStyle, marginTop: 6 }}
              />
            </div>
            <div>
              <Etiqueta>Semana de pago</Etiqueta>
              <select value={simSemana} onChange={e => setSimSemana(e.target.value)} style={{ ...inputStyle, marginTop: 6 }}>
                <option value="">La próxima</option>
                {semanas.filter(s => !s.pasada).map(s => (
                  <option key={s.inicio} value={s.inicio}>Semana {semanaISO(s.inicio)} · {fRango(s.inicio)}</option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={aplicarSimulacion}
                style={{
                  flex: 2, padding: '10px 0', borderRadius: 10, border: 'none', background: P.gold,
                  color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                }}
              >
                Simular
              </button>
              <button
                onClick={resetSimulacion}
                style={{
                  flex: 1, padding: '10px 0', borderRadius: 10, border: `1px solid ${P.line}`,
                  background: '#fff', color: P.muted, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                }}
              >
                <RotateCcw size={13} /> Reset
              </button>
            </div>
          </div>

          {simAplicada && semanaSimulada && originalSimulada && (
            <div style={{ marginTop: 16, borderTop: `1px solid ${P.line}`, paddingTop: 14 }}>
              <Etiqueta>Semana {semanaISO(simAplicada.semana)} · original vs. simulado</Etiqueta>
              {([
                { label: 'Original', valor: originalSimulada.flujoNeto, color: P.stone },
                { label: 'Simulado', valor: semanaSimulada.flujoNeto, color: semanaSimulada.flujoNeto >= 0 ? P.green : P.red },
              ]).map(b => {
                const max = Math.max(Math.abs(originalSimulada.flujoNeto), Math.abs(semanaSimulada.flujoNeto), 1)
                return (
                  <div key={b.label} style={{ marginTop: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                      <span style={{ color: P.muted, fontWeight: 600 }}>{b.label}</span>
                      <span style={{ color: b.color, fontWeight: 700 }}>{fMoney(b.valor)}</span>
                    </div>
                    <div style={{ height: 8, background: P.line, borderRadius: 4, marginTop: 4, overflow: 'hidden' }}>
                      <div style={{
                        width: `${(Math.abs(b.valor) / max) * 100}%`, height: '100%',
                        background: b.color, borderRadius: 4,
                      }} />
                    </div>
                  </div>
                )
              })}
              <p style={{ fontSize: 11.5, color: P.muted, marginTop: 12, lineHeight: 1.5 }}>
                Saldo al cierre de esa semana: <strong style={{ color: semanaSimulada.saldoAcumulado >= 0 ? P.green : P.red }}>
                  {fMoney(semanaSimulada.saldoAcumulado)}
                </strong>{' '}
                (antes {fMoney(originalSimulada.saldoAcumulado)}).
              </p>
            </div>
          )}
        </Card>
      </div>

      {/* ── Aging + Semáforo + Ciclo ────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14 }}>
        <Card>
          <Etiqueta title="Tramos tal como los entrega el informe de Deudores del ERP, sin re-agrupar. Mide la antigüedad del SALDO por cobrar, que no es lo mismo que la deuda vencida: hay clientes con saldo viejo que el ERP igual reporta sin deuda vencida.">
            Antigüedad del saldo por cobrar
          </Etiqueta>
          <p style={{ fontSize: 22, fontWeight: 800, color: P.text, marginTop: 8 }}>{fMoney(flujo.aging.total)}</p>
          <p style={{ fontSize: 12, color: P.muted, marginBottom: 12 }}>
            Saldo de clientes reales, sin cuentas internas
          </p>
          {flujo.aging.tramos.map(t => {
            const color = t.tono === 'verde' ? P.green : t.tono === 'amber' ? P.amber : t.tono === 'naranja' ? '#EA580C' : P.red
            return (
              <div key={t.label} style={{ marginBottom: 9 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                  <span style={{ color: P.muted, fontWeight: 600 }}>{t.label}</span>
                  <span style={{ color: P.text, fontWeight: 700 }}>{fCompact(t.monto)} · {t.pct.toFixed(0)}%</span>
                </div>
                <div style={{ height: 7, background: P.line, borderRadius: 4, marginTop: 4, overflow: 'hidden' }}>
                  <div style={{ width: `${t.pct}%`, height: '100%', background: color, borderRadius: 4 }} />
                </div>
              </div>
            )
          })}
        </Card>

        <Card>
          <Etiqueta title="Sólo clientes que el ERP marca con deuda vencida. Rojo: además tiene saldo de 60 días o más. Amarillo: saldo de 30 a 59 días, o paga sistemáticamente más de 7 días después de su plazo pactado. Verde: vencido pero sólo en tramos recientes.">
            Semáforo de riesgo por cliente
          </Etiqueta>
          <div style={{ display: 'flex', gap: 14, marginTop: 8, marginBottom: 10 }}>
            {(['rojo', 'amarillo', 'verde'] as const).map(n => {
              const color = n === 'rojo' ? P.red : n === 'amarillo' ? P.amber : P.green
              const total = flujo.riesgo.filter(r => r.nivel === n).length
              return (
                <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 9, height: 9, borderRadius: '50%', background: color, display: 'inline-block' }} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: P.text }}>{total}</span>
                </div>
              )
            })}
          </div>
          <div style={{ maxHeight: 240, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 7 }}>
            {flujo.riesgo.length === 0 && (
              <p style={{ fontSize: 12.5, color: P.faint }}>Ningún cliente con deuda pendiente.</p>
            )}
            {flujo.riesgo.slice(0, 40).map(r => {
              const color = r.nivel === 'rojo' ? P.red : r.nivel === 'amarillo' ? P.amber : P.green
              return (
                <div key={r.cliente} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <p style={{ fontSize: 12.5, fontWeight: 600, color: P.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {r.cliente}
                    </p>
                    <p style={{ fontSize: 11, color: P.muted }}>
                      {r.tramoMasViejo ?? 'al día'}
                      {r.excesoSobrePlazo != null && r.excesoSobrePlazo > 0 && ` · paga ${r.excesoSobrePlazo}d tarde`}
                    </p>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: P.text, flexShrink: 0 }}>{fCompact(r.deudaVencida)}</span>
                </div>
              )
            })}
          </div>
        </Card>

        <Card acento={flujo.ciclo.dias != null && flujo.ciclo.dias > 45 ? P.amberBorder : undefined}>
          <Etiqueta title="Días de inventario + días promedio de cobro − días promedio de pago a proveedores.">
            <Timer size={12} /> Ciclo de conversión de efectivo
          </Etiqueta>
          {flujo.ciclo.dias != null ? (
            <p style={{ fontSize: 40, fontWeight: 800, color: P.gold, marginTop: 10, letterSpacing: '-0.03em' }}>
              {flujo.ciclo.dias}<span style={{ fontSize: 16, color: P.muted, fontWeight: 600 }}> días</span>
            </p>
          ) : (
            <p style={{ fontSize: 13, color: P.faint, marginTop: 10, lineHeight: 1.5 }}>{flujo.ciclo.faltante}</p>
          )}
          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { label: 'Días de inventario', v: flujo.ciclo.diasInventario, signo: '+' },
              { label: 'Días de cobro a clientes', v: flujo.ciclo.diasCobro, signo: '+' },
              { label: 'Días de pago a proveedores', v: flujo.ciclo.diasPago, signo: '−' },
            ].map(t => (
              <div key={t.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
                <span style={{ color: P.muted }}>{t.signo} {t.label}</span>
                <span style={{ fontWeight: 700, color: t.v == null ? P.faint : P.text }}>
                  {t.v == null ? 'sin dato' : `${t.v} d`}
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* ── Tabla semanal ──────────────────────────────────────────────────── */}
      <Card padding={0}>
        <div style={{ padding: '18px 20px 12px' }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: P.text }}>Detalle semanal</h3>
          <p style={{ fontSize: 12, color: P.muted, marginTop: 2 }}>
            Los valores <span style={{ color: P.amber, fontWeight: 700 }}>en naranjo</span> son proyectados; los
            oscuros ya están confirmados. Las compras de semanas futuras sin ningún pago cargado a mano usan el
            promedio semanal real de los últimos 90 días como estimado.
          </p>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 860 }}>
            <thead>
              <tr style={{ background: '#F8FAFC' }}>
                {['Semana', 'Ing. confirmados', 'Ing. proyectados', 'Compras reales', 'Compras proyectadas', 'Flujo neto', 'Saldo acumulado'].map((h, i) => (
                  <th key={h} style={{
                    padding: '10px 14px', textAlign: i === 0 ? 'left' : 'right',
                    fontSize: 10.5, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase',
                    color: P.muted, borderBottom: `1px solid ${P.line}`, whiteSpace: 'nowrap',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {semanas.map(s => (
                <tr key={s.inicio} style={{
                  background: s.actual ? P.amberSoft : s.deficit ? P.redSoft : 'transparent',
                  opacity: s.pasada ? 0.6 : 1,
                }}>
                  <td style={{ padding: '10px 14px', borderBottom: `1px solid ${P.line}`, whiteSpace: 'nowrap' }}>
                    <span style={{ fontWeight: 700, color: P.text }}>Semana {semanaISO(s.inicio)}</span>
                    <span style={{ color: P.faint, marginLeft: 6, fontSize: 11 }}>{fRango(s.inicio)}</span>
                    {s.actual && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: P.gold }}>· EN CURSO</span>}
                  </td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', borderBottom: `1px solid ${P.line}`, fontWeight: 600, color: P.text }}>
                    {s.ingresosConfirmados > 0 ? fMoney(s.ingresosConfirmados) : '—'}
                  </td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', borderBottom: `1px solid ${P.line}`, fontWeight: 600, color: P.amber }}>
                    {s.ingresosProyectados > 0 ? fMoney(s.ingresosProyectados) : '—'}
                  </td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', borderBottom: `1px solid ${P.line}`, color: P.text }}>
                    {s.comprasReales > 0 ? fMoney(s.comprasReales) : '—'}
                  </td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', borderBottom: `1px solid ${P.line}`, color: P.amber }}>
                    {s.comprasProyectadas > 0 ? fMoney(s.comprasProyectadas) : '—'}
                  </td>
                  <td style={{
                    padding: '10px 14px', textAlign: 'right', borderBottom: `1px solid ${P.line}`,
                    fontWeight: 700, color: s.flujoNeto >= 0 ? P.green : P.red,
                  }}>
                    {fMoney(s.flujoNeto)}
                  </td>
                  <td style={{
                    padding: '10px 14px', textAlign: 'right', borderBottom: `1px solid ${P.line}`,
                    fontWeight: 700, color: s.saldoAcumulado >= 0 ? P.text : P.red,
                  }}>
                    {flujo.saldoActual ? fMoney(s.saldoAcumulado) : <span style={{ color: P.faint, fontWeight: 500 }}>sin saldo base</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <CargaDatos hayCompras={flujo.hayCompras} saldoActual={flujo.saldoActual} hoyISO={hoyISO} />
    </div>
  )
}

/**
 * Los dos datos que ningún informe del ERP entrega (saldo bancario y pagos a
 * proveedores) se cargan acá mismo. Sin esto el dashboard queda con la mitad
 * de las series en cero y el saldo acumulado sin punto de partida.
 */
function CargaDatos({ hayCompras, saldoActual, hoyISO }: {
  hayCompras: boolean
  saldoActual: { fecha: string; saldo: number } | null
  hoyISO: string
}) {
  const [saldo, setSaldo] = useState('')
  const [fechaSaldo, setFechaSaldo] = useState(hoyISO)
  const [proveedor, setProveedor] = useState('')
  const [monto, setMonto] = useState('')
  const [fechaPago, setFechaPago] = useState(hoyISO)
  const [fechaDoc, setFechaDoc] = useState('')
  const [estado, setEstado] = useState<'comprometida' | 'estimada' | 'pagada'>('comprometida')
  const [guardando, setGuardando] = useState<'saldo' | 'compra' | null>(null)
  const [ok, setOk] = useState<'saldo' | 'compra' | null>(null)
  const [error, setError] = useState('')

  async function guardar(tipo: 'saldo' | 'compra') {
    setGuardando(tipo); setError(''); setOk(null)
    try {
      const url = tipo === 'saldo' ? '/api/administracion/caja-saldo' : '/api/administracion/compras'
      const body = tipo === 'saldo'
        ? { fecha: fechaSaldo, saldo: Number(saldo.replace(/[^\d-]/g, '')) }
        : {
          proveedor, monto: Number(monto.replace(/[^\d]/g, '')),
          fecha_pago: fechaPago, fecha_documento: fechaDoc || null, estado,
        }
      const res = await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'No se pudo guardar')
      setOk(tipo)
      if (tipo === 'saldo') setSaldo('')
      else { setProveedor(''); setMonto(''); setFechaDoc('') }
      // El dashboard se arma en el servidor: hay que recargar para verlo.
      setTimeout(() => window.location.reload(), 700)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido')
    } finally {
      setGuardando(null)
    }
  }

  return (
    <Card>
      <Etiqueta><Plus size={12} /> Datos que carga Administración</Etiqueta>
      <p style={{ fontSize: 12, color: P.muted, marginTop: 6, lineHeight: 1.5 }}>
        El ERP no entrega saldo bancario ni compras a proveedores por ningún informe, así que estos dos se cargan a
        mano. {!hayCompras && <strong>Todavía no hay ningún pago a proveedor cargado</strong>}
        {!hayCompras && ', por eso las series de compras del gráfico están en cero.'}
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20, marginTop: 16 }}>
        <div>
          <p style={{ fontSize: 13, fontWeight: 700, color: P.text, marginBottom: 10 }}>Saldo de caja</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            <input value={saldo} onChange={e => setSaldo(e.target.value)} placeholder="Saldo en la cuenta" inputMode="numeric" style={inputStyle} />
            <input type="date" value={fechaSaldo} onChange={e => setFechaSaldo(e.target.value)} style={inputStyle} />
            <button
              onClick={() => guardar('saldo')}
              disabled={!saldo || guardando === 'saldo'}
              style={{
                padding: '10px 0', borderRadius: 10, border: 'none',
                background: !saldo ? P.line : P.gold, color: !saldo ? P.faint : '#fff',
                fontSize: 13, fontWeight: 700, cursor: !saldo ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
            >
              {ok === 'saldo' ? <><Check size={14} /> Guardado</> : guardando === 'saldo' ? 'Guardando…' : 'Guardar saldo'}
            </button>
          </div>
          {saldoActual && (
            <p style={{ fontSize: 11.5, color: P.muted, marginTop: 8 }}>
              Último cargado: {fMoney(saldoActual.saldo)} al {fDia(saldoActual.fecha)}.
            </p>
          )}
        </div>

        <div>
          <p style={{ fontSize: 13, fontWeight: 700, color: P.text, marginBottom: 10 }}>Pago a proveedor</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            <input value={proveedor} onChange={e => setProveedor(e.target.value)} placeholder="Proveedor" style={inputStyle} />
            <input value={monto} onChange={e => setMonto(e.target.value)} placeholder="Monto" inputMode="numeric" style={inputStyle} />
            <div style={{ display: 'flex', gap: 8 }}>
              <label style={{ flex: 1, fontSize: 11, color: P.muted }}>
                Fecha de pago
                <input type="date" value={fechaPago} onChange={e => setFechaPago(e.target.value)} style={{ ...inputStyle, marginTop: 3 }} />
              </label>
              <label style={{ flex: 1, fontSize: 11, color: P.muted }}>
                Fecha factura (opcional)
                <input type="date" value={fechaDoc} onChange={e => setFechaDoc(e.target.value)} style={{ ...inputStyle, marginTop: 3 }} />
              </label>
            </div>
            <select value={estado} onChange={e => setEstado(e.target.value as typeof estado)} style={inputStyle}>
              <option value="comprometida">En firme (compra real)</option>
              <option value="estimada">Estimada (proyectada)</option>
              <option value="pagada">Ya pagada</option>
            </select>
            <button
              onClick={() => guardar('compra')}
              disabled={!proveedor || !monto || guardando === 'compra'}
              style={{
                padding: '10px 0', borderRadius: 10, border: 'none',
                background: !proveedor || !monto ? P.line : P.gold, color: !proveedor || !monto ? P.faint : '#fff',
                fontSize: 13, fontWeight: 700, cursor: !proveedor || !monto ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
            >
              {ok === 'compra' ? <><Check size={14} /> Guardado</> : guardando === 'compra' ? 'Guardando…' : 'Agregar pago'}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <p style={{ fontSize: 12, color: P.red, marginTop: 12, background: P.redSoft, padding: '8px 12px', borderRadius: 9 }}>
          {error}
        </p>
      )}
    </Card>
  )
}
