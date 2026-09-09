'use client'

import { useMemo, useState } from 'react'
import {
  ComposedChart, Bar, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine,
} from 'recharts'
import {
  TrendingUp, Wallet, AlertTriangle, Info, CalendarClock, Truck, HelpCircle,
} from 'lucide-react'
import type { SerieFinanzas, AvanceCiclo, ResumenDeuda } from './page'
import type { ProyeccionCaja } from '@/lib/administracion/finanzas'

interface Props {
  series: SerieFinanzas[]
  avance: AvanceCiclo
  mtd: { neto: number; bruto: number }
  caja: ProyeccionCaja
  deuda: ResumenDeuda
  ultimaCorrida: string | null
  clientesSinPlazo: number
  /** Viene del servidor, no de `new Date()` acá: el mismo valor en render de
   *  servidor y de cliente evita un desajuste de hidratación. */
  hoyISO: string
}

const MESES_ES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

const fMoney = (n: number) => '$' + Math.round(n).toLocaleString('es-CL')
const fCompact = (n: number) => {
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `$${Math.round(n / 1_000)}k`
  return `$${Math.round(n)}`
}
const fMes = (iso: string) => {
  const [y, m] = iso.split('-')
  return `${MESES_ES[Number(m) - 1]} ${y.slice(2)}`
}
const fDia = (iso: string) => {
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}

/** Tarjeta con el mismo tratamiento visual en todo el módulo. */
function Card({ children, acento }: { children: React.ReactNode; acento?: string }) {
  return (
    <div style={{
      background: 'var(--surface)',
      border: `1px solid ${acento ?? 'var(--border)'}`,
      borderRadius: 16, padding: 20,
    }}>
      {children}
    </div>
  )
}

function Etiqueta({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <p
      title={title}
      style={{
        fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase',
        color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 5,
      }}
    >
      {children}
      {title && <Info size={11} style={{ opacity: 0.5 }} />}
    </p>
  )
}

export default function AdministracionClient({
  series, avance, mtd, caja, deuda, ultimaCorrida, clientesSinPlazo, hoyISO,
}: Props) {
  const [tab, setTab] = useState<'ingresos' | 'caja'>('ingresos')
  const [serieId, setSerieId] = useState('general::')
  const [verModelo, setVerModelo] = useState(false)

  const serieActual = series.find(s => s.id === serieId) ?? series.find(s => s.nivel === 'general') ?? null

  // "Facturado este ciclo" tiene que moverse con la serie elegida (Total
  // empresa / Cerveza / Kombucha / Otros) — si no, "El modelo proyectó" de
  // abajo compara el objetivo de UNA categoría contra el MTD de TODA la
  // empresa y el % de cumplimiento sale sin sentido (confirmado con una
  // corrida real: 232% al mirar Cerveza, porque el MTD seguía siendo el
  // total). `mtd` (prop, fijo) es sólo el fallback antes de que carguen las
  // series con su propio montoCicloEnCurso.
  const mtdSerie = serieActual ? { neto: serieActual.montoCicloEnCurso } : mtd

  // Extrapolación lineal del ciclo en curso, en días HÁBILES: no se factura
  // fin de semana, así que dividir por días corridos subestima el ritmo.
  // Mismo criterio que "a este ritmo cerrarías con X L" en Producción.
  const ritmoProyectado = avance.diasHabilesTranscurridos > 0
    ? (mtdSerie.neto / avance.diasHabilesTranscurridos) * avance.diasHabilesEnCiclo
    : 0

  const datosGrafico = useMemo(() => {
    if (!serieActual) return []
    return serieActual.puntos.map(p => ({
      mes: p.mes,
      historico: p.tipo === 'historico' ? p.monto : null,
      proyectado: p.tipo === 'forecast' ? p.monto : null,
      banda: p.tipo === 'forecast' && p.montoMin != null && p.montoMax != null
        ? [p.montoMin, p.montoMax] as [number, number]
        : null,
      tendencia: p.tendencia,
    }))
  }, [serieActual])

  /** Lo que el modelo proyectó para el ciclo que está corriendo ahora. Si el
   *  ciclo en curso ya tiene punto de forecast, ese es el objetivo a comparar
   *  contra el ritmo real. */
  const objetivoCiclo = useMemo(() => {
    const p = serieActual?.puntos.find(x => x.mes === avance.ciclo && x.tipo === 'forecast')
    return p?.monto ?? null
  }, [serieActual, avance.ciclo])

  const pctCumplimiento = objetivoCiclo && objetivoCiclo > 0 ? (ritmoProyectado / objetivoCiclo) * 100 : null
  const cumple = pctCumplimiento != null && pctCumplimiento >= 95
  const avancePct = Math.min(100, (avance.diaActual / avance.diasEnCiclo) * 100)

  const proximas8 = useMemo(
    () => caja.periodos.filter(p => !p.vencido).slice(0, 8),
    [caja.periodos]
  )
  const atrasadas = useMemo(() => caja.periodos.filter(p => p.vencido), [caja.periodos])
  const totalAtrasado = atrasadas.reduce((s, p) => s + p.bruto, 0)

  const hayModelo = series.length > 0

  return (
    <div style={{ padding: '28px 32px 60px', maxWidth: 1400 }}>
      {/* ── Encabezado ───────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap', marginBottom: 22 }}>
        <div>
          <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--gold)' }}>
            Administración
          </p>
          <h1 style={{ fontSize: 30, fontWeight: 900, color: 'var(--cream)', letterSpacing: '-0.8px', lineHeight: 1.1, marginTop: 2 }}>
            Finanzas
          </h1>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 6, maxWidth: 620 }}>
            Proyección de facturación e ingreso de caja. La unidad de venta es el neto
            (Total s/imp $); la de caja, el bruto que entra al banco.
          </p>
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--muted)', textAlign: 'right' }}>
          <p>Ciclo {fMes(avance.ciclo)} · día {avance.diaActual} de {avance.diasEnCiclo}</p>
          <p style={{ marginTop: 3 }}>
            {ultimaCorrida ? `Modelo: ${ultimaCorrida.slice(0, 10)}` : 'Modelo sin corridas'}
          </p>
        </div>
      </div>

      {/* ── Pestañas ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 2, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 4, width: 'fit-content', marginBottom: 24 }}>
        {([['ingresos', 'Ingresos', TrendingUp], ['caja', 'Flujo de Caja', Wallet]] as const).map(([id, label, Icon]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '9px 18px', borderRadius: 9, border: 'none', cursor: 'pointer',
              fontWeight: 700, fontSize: 13,
              background: tab === id ? 'var(--gold)' : 'transparent',
              color: tab === id ? '#1a1200' : 'var(--muted)',
            }}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {/* ══════════════ INGRESOS ══════════════ */}
      {tab === 'ingresos' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* Las tres tarjetas: lo vendido, la extrapolación y lo que dijo el
              modelo — mismo trío que Producción, en $ en vez de litros. */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
            <Card>
              <Etiqueta title="Cuenta por fecha de pedido, no de entrega ni de factura — misma señal temprana que el forecast de litros de Producción. Se mueve con la categoría elegida abajo.">
                Facturado este ciclo{serieActual && serieActual.nivel !== 'general' ? ` — ${serieActual.clave}` : ''}
              </Etiqueta>
              <p style={{ fontSize: 30, fontWeight: 900, color: 'var(--cream)', marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>
                {fMoney(mtdSerie.neto)}
              </p>
              <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                {/* El bruto (con IVA/ILA) sólo está calculado para el total de
                    la empresa — desglosarlo por categoría necesitaría repetir
                    brutoLinea() por fila en el servidor, no vale la pena para
                    un dato secundario acá. */}
                {serieActual && serieActual.nivel !== 'general' ? 'neto' : `neto · ${fMoney(mtd.bruto)} con impuestos`}
              </p>
              <div style={{ marginTop: 10, height: 5, borderRadius: 999, background: 'var(--surface2)', overflow: 'hidden' }}>
                <div style={{ width: `${avancePct}%`, height: '100%', background: 'var(--muted)', borderRadius: 999 }} />
              </div>
              <p style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 6 }}>
                día {avance.diaActual} de {avance.diasEnCiclo} del ciclo
              </p>
            </Card>

            <Card>
              <Etiqueta title="Extrapolación lineal de lo facturado hasta hoy, sobre días hábiles: no se factura fin de semana.">
                A este ritmo cerrarías con
              </Etiqueta>
              <p style={{ fontSize: 30, fontWeight: 900, color: 'var(--gold)', marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>
                {fMoney(ritmoProyectado)}
              </p>
              <p style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 8 }}>
                {avance.diasHabilesTranscurridos} de {avance.diasHabilesEnCiclo} días hábiles corridos
              </p>
            </Card>

            <Card>
              <Etiqueta title="Proyección de Prophet para este ciclo, calculada antes de que empezara.">
                El modelo proyectó
              </Etiqueta>
              {objetivoCiclo == null ? (
                <>
                  <p style={{ fontSize: 20, fontWeight: 700, color: 'var(--muted)', marginTop: 8 }}>—</p>
                  <p style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 6 }}>
                    {hayModelo ? 'El modelo todavía no cubre este ciclo.' : 'Falta la primera corrida del modelo.'}
                  </p>
                </>
              ) : (
                <>
                  <p style={{ fontSize: 30, fontWeight: 900, color: '#4ADE80', marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>
                    {fMoney(objetivoCiclo)}
                  </p>
                  <div style={{ marginTop: 10, height: 5, borderRadius: 999, background: 'var(--surface2)', overflow: 'hidden' }}>
                    <div style={{
                      width: `${Math.min(100, pctCumplimiento ?? 0)}%`, height: '100%', borderRadius: 999,
                      background: cumple ? '#4ADE80' : '#F87171',
                    }} />
                  </div>
                  <p style={{ fontSize: 11.5, fontWeight: 700, marginTop: 6, color: cumple ? '#4ADE80' : '#F87171' }}>
                    {cumple ? '✓' : '⚠'} vas al {(pctCumplimiento ?? 0).toFixed(0)}% de lo proyectado
                  </p>
                </>
              )}
            </Card>
          </div>

          {!hayModelo ? (
            <Card acento="rgba(251,191,36,0.25)">
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <AlertTriangle size={17} style={{ color: '#F0B429', flexShrink: 0, marginTop: 1 }} />
                <div>
                  <p style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--cream)' }}>
                    El modelo de ingresos todavía no corrió
                  </p>
                  <p style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 4, lineHeight: 1.5 }}>
                    Las tarjetas de arriba y el flujo de caja funcionan igual —salen de las ventas reales—,
                    pero la proyección a 8 meses aparece recién después de la primera corrida de Prophet
                    (workflow <code>forecast-produccion</code>, que ahora también modela el dinero).
                  </p>
                </div>
              </div>
            </Card>
          ) : (
            <Card>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', marginBottom: 16 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  {series.map(s => (
                    <button
                      key={s.id}
                      onClick={() => setSerieId(s.id)}
                      style={{
                        padding: '7px 14px', borderRadius: 999, cursor: 'pointer', fontSize: 12.5, fontWeight: 700,
                        border: `1px solid ${serieId === s.id ? 'var(--gold)' : 'var(--border)'}`,
                        background: serieId === s.id ? 'var(--gold-dim)' : 'transparent',
                        color: serieId === s.id ? 'var(--gold)' : 'var(--muted)',
                      }}
                    >
                      {s.nivel === 'general' ? 'Total empresa' : s.clave}
                    </button>
                  ))}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {serieActual?.mape != null && (
                    <span
                      title="Error promedio del backtest: se entrena hasta el mes M-1 y se predice el mes M, repetido en 6 puntos del historial."
                      style={{
                        fontSize: 11.5, fontWeight: 700, padding: '4px 10px', borderRadius: 999,
                        border: '1px solid var(--border)', color: serieActual.mape <= 30 ? '#4ADE80' : '#F0B429',
                      }}
                    >
                      desvío {serieActual.mape.toFixed(0)}%
                    </span>
                  )}
                  <button
                    onClick={() => setVerModelo(v => !v)}
                    style={{
                      padding: '7px 14px', borderRadius: 9, cursor: 'pointer', fontSize: 12.5, fontWeight: 700,
                      border: `1px solid ${verModelo ? 'var(--gold)' : 'var(--border)'}`,
                      background: verModelo ? 'var(--gold-dim)' : 'transparent',
                      color: verModelo ? 'var(--gold)' : 'var(--muted)',
                    }}
                  >
                    Ver tendencia
                  </button>
                </div>
              </div>

              <ResponsiveContainer width="100%" height={340}>
                <ComposedChart data={datosGrafico}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="mes" tickFormatter={fMes} tick={{ fontSize: 11, fill: 'var(--muted)' }} />
                  <YAxis tickFormatter={fCompact} tick={{ fontSize: 11, fill: 'var(--muted)' }} width={62} />
                  <Tooltip
                    formatter={(v) => (Array.isArray(v) ? `${fMoney(Number(v[0]))} – ${fMoney(Number(v[1]))}` : fMoney(Number(v)))}
                    labelFormatter={(l) => fMes(String(l))}
                    contentStyle={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 12 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Area dataKey="banda" name="Rango probable" fill="rgba(212,175,55,0.12)" stroke="none" />
                  <Bar dataKey="historico" name="Facturado" fill="#D4AF37" radius={[3, 3, 0, 0]} />
                  <Line dataKey="proyectado" name="Proyección" stroke="#60A5FA" strokeWidth={2.5} dot={{ r: 3 }} connectNulls />
                  {verModelo && (
                    <Line dataKey="tendencia" name="Tendencia" stroke="#A855F7" strokeWidth={1.5} strokeDasharray="5 4" dot={false} connectNulls />
                  )}
                  <ReferenceLine x={avance.ciclo} stroke="var(--muted)" strokeDasharray="3 3" />
                </ComposedChart>
              </ResponsiveContainer>
              <p style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 10 }}>
                Los meses son ciclos internos (24 al 23), no meses calendario — mismo corte que Producción y
                la tabla de períodos. El ciclo en curso no tiene barra porque todavía no cerró.
              </p>
            </Card>
          )}
        </div>
      )}

      {/* ══════════════ FLUJO DE CAJA ══════════════ */}
      {tab === 'caja' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
            <Card>
              <Etiqueta title="Suma de las ventas ya despachadas cuyo plazo de pago vence de hoy en adelante.">
                Por cobrar proyectado
              </Etiqueta>
              <p style={{ fontSize: 28, fontWeight: 900, color: 'var(--gold)', marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>
                {fMoney(caja.totalProyectado.bruto)}
              </p>
              <p style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>
                entra al banco · {fMoney(caja.totalProyectado.neto)} neto
              </p>
            </Card>

            <Card acento={totalAtrasado > 0 ? 'rgba(248,113,113,0.25)' : undefined}>
              <Etiqueta title="Cobros cuya fecha esperada ya pasó (últimas 2 semanas) y que, según el modelo, deberían haber entrado.">
                Debería haber entrado
              </Etiqueta>
              <p style={{ fontSize: 28, fontWeight: 900, color: totalAtrasado > 0 ? '#F87171' : 'var(--cream)', marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>
                {fMoney(totalAtrasado)}
              </p>
              <p style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>
                en las últimas 2 semanas
              </p>
            </Card>

            <Card>
              <Etiqueta title="Dato duro del informe de Deudores del ERP — no sale de esta proyección.">
                Vencido según el ERP
              </Etiqueta>
              <p style={{ fontSize: 28, fontWeight: 900, color: '#F87171', marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>
                {fMoney(deuda.vencida)}
              </p>
              <p style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>
                {deuda.clientes} clientes{deuda.ultimaCarga ? ` · al ${deuda.ultimaCarga.slice(0, 10)}` : ''}
              </p>
            </Card>

            <Card>
              <Etiqueta title="Vendido pero todavía no despachado: el plazo de pago recién arranca cuando sale de bodega.">
                Aún sin despachar
              </Etiqueta>
              <p style={{ fontSize: 28, fontWeight: 900, color: 'var(--cream)', marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>
                {fMoney(caja.sinDespachar.bruto)}
              </p>
              <p style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>
                {caja.sinDespachar.filas} líneas · entra después de la entrega
              </p>
            </Card>
          </div>

          {/* Curva semanal */}
          <Card>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <CalendarClock size={16} style={{ color: 'var(--gold)' }} />
              <h2 style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--cream)' }}>
                Cuándo entra la plata — próximas 8 semanas
              </h2>
            </div>
            {proximas8.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--muted)', padding: '20px 0' }}>
                No hay cobros proyectados hacia adelante. Puede pasar si hace días que no se despacha nada.
              </p>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={260}>
                  <ComposedChart data={proximas8}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="inicio" tickFormatter={fDia} tick={{ fontSize: 11, fill: 'var(--muted)' }} />
                    <YAxis tickFormatter={fCompact} tick={{ fontSize: 11, fill: 'var(--muted)' }} width={62} />
                    <Tooltip
                      formatter={(v, n) => [fMoney(Number(v)), n === 'bruto' ? 'Entra al banco' : 'Venta neta']}
                      labelFormatter={(l) => `Semana del ${fDia(String(l))}`}
                      contentStyle={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 12 }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} formatter={v => v === 'bruto' ? 'Entra al banco (bruto)' : 'Venta neta'} />
                    <Bar dataKey="bruto" fill="#D4AF37" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="neto" fill="rgba(212,175,55,0.35)" radius={[3, 3, 0, 0]} />
                  </ComposedChart>
                </ResponsiveContainer>

                <div style={{ marginTop: 14, border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: 'var(--surface2)' }}>
                        <th style={{ textAlign: 'left', padding: '10px 14px', color: 'var(--muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em' }}>Semana</th>
                        <th style={{ textAlign: 'right', padding: '10px 14px', color: 'var(--muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em' }}>Venta neta</th>
                        <th style={{ textAlign: 'right', padding: '10px 14px', color: 'var(--muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em' }}>Entra al banco</th>
                        <th style={{ textAlign: 'right', padding: '10px 14px', color: 'var(--muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em' }}>Documentos</th>
                      </tr>
                    </thead>
                    <tbody>
                      {proximas8.map((p, i) => (
                        <tr key={p.inicio} style={{ borderTop: i === 0 ? 'none' : '1px solid var(--border)' }}>
                          <td style={{ padding: '10px 14px', color: 'var(--cream)', fontWeight: 600 }}>
                            {fDia(p.inicio)} <span style={{ color: 'var(--muted)', fontWeight: 400 }}>en adelante</span>
                          </td>
                          <td style={{ padding: '10px 14px', textAlign: 'right', color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>{fMoney(p.neto)}</td>
                          <td style={{ padding: '10px 14px', textAlign: 'right', color: 'var(--gold)', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fMoney(p.bruto)}</td>
                          <td style={{ padding: '10px 14px', textAlign: 'right', color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>{p.filas}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </Card>

          {/* Lo que no se puede proyectar — visible a propósito */}
          {(caja.sinPlazo.filas > 0 || caja.sinDespachar.filas > 0) && (
            <Card acento="rgba(251,191,36,0.25)">
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <HelpCircle size={17} style={{ color: '#F0B429', flexShrink: 0, marginTop: 1 }} />
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--cream)' }}>
                    {fMoney(caja.sinPlazo.bruto)} sin fecha de cobro estimable
                  </p>
                  <p style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 4, lineHeight: 1.5 }}>
                    Son ventas ya despachadas a {caja.sinPlazo.clientes.length} cliente(s) que no tienen
                    &quot;días de pago&quot; cargado en el maestro ({clientesSinPlazo} fichas sin el dato en total),
                    así que no se pueden repartir en ninguna semana. No están sumadas arriba: aparecen acá para
                    que se corrija la ficha, no para que se pierdan de vista.
                  </p>
                  {caja.sinPlazo.clientes.length > 0 && (
                    <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8, lineHeight: 1.6 }}>
                      {caja.sinPlazo.clientes.slice(0, 12).join(' · ')}
                      {caja.sinPlazo.clientes.length > 12 ? ` · +${caja.sinPlazo.clientes.length - 12} más` : ''}
                    </p>
                  )}
                </div>
              </div>
            </Card>
          )}

          {/* Quién debe */}
          {caja.porCliente.length > 0 && (
            <Card>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <Truck size={16} style={{ color: 'var(--gold)' }} />
                <h2 style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--cream)' }}>
                  Quién tiene esa plata — top 15
                </h2>
              </div>
              <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: 'var(--surface2)' }}>
                      <th style={{ textAlign: 'left', padding: '10px 14px', color: 'var(--muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em' }}>Cliente</th>
                      <th style={{ textAlign: 'right', padding: '10px 14px', color: 'var(--muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em' }}>Plazo</th>
                      <th style={{ textAlign: 'right', padding: '10px 14px', color: 'var(--muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em' }}>Cobro estimado</th>
                      <th style={{ textAlign: 'right', padding: '10px 14px', color: 'var(--muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em' }}>Entra al banco</th>
                    </tr>
                  </thead>
                  <tbody>
                    {caja.porCliente.slice(0, 15).map((c, i) => (
                      <tr key={c.cliente} style={{ borderTop: i === 0 ? 'none' : '1px solid var(--border)' }}>
                        <td style={{ padding: '10px 14px', color: 'var(--cream)', fontWeight: 600, maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.cliente}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', color: 'var(--muted)' }}>{c.diasPago} días</td>
                        {/* En rojo cuando la fecha ya pasó: es plata que
                            debería estar cobrada, no un cobro por venir. */}
                        <td style={{
                          padding: '10px 14px', textAlign: 'right', fontVariantNumeric: 'tabular-nums',
                          color: c.proximoCobro < hoyISO ? '#F87171' : 'var(--muted)',
                          fontWeight: c.proximoCobro < hoyISO ? 700 : 400,
                        }}>
                          {fDia(c.proximoCobro)}{c.proximoCobro < hoyISO ? ' · vencido' : ''}
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', color: 'var(--gold)', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fMoney(c.bruto)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}
