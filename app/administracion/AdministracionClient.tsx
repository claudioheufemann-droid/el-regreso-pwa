'use client'

import { Fragment, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ComposedChart, Bar, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine,
} from 'recharts'
import {
  TrendingUp, Wallet, AlertTriangle, Info, CalendarClock, Truck, HelpCircle, ChevronLeft, ChevronDown,
  ChevronRight, Target, UserX,
} from 'lucide-react'
import type { SerieFinanzas, AvanceCiclo, ResumenDeuda } from './page'
import type { ProyeccionCaja, PrecisionCobro, ClienteEnPeriodo } from '@/lib/administracion/finanzas'

interface Props {
  series: SerieFinanzas[]
  avance: AvanceCiclo
  mtd: { neto: number; bruto: number }
  caja: ProyeccionCaja
  deuda: ResumenDeuda
  precisionCobro: PrecisionCobro
  ultimaCorrida: string | null
  clientesSinPlazo: number
  /** Viene del servidor, no de `new Date()` acá: el mismo valor en render de
   *  servidor y de cliente evita un desajuste de hidratación. */
  hoyISO: string
}

/**
 * Mismo esquema de colores que /ventas (VentasHoyClient.tsx): tema CLARO,
 * hardcodeado a propósito — el resto de la app (Producción, el sidebar) usa
 * las variables oscuras de globals.css, pero esta sección lo pidió así
 * explícitamente (10-sep-2026) porque el negro predominaba demasiado. Mismos
 * valores exactos que Ventas para que las dos secciones se vean como parte
 * de una misma familia visual.
 */
const C = {
  bg: '#F1F5F9',
  card: '#FFFFFF',
  hero: '#0F172A',
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
  amberBorder: '#FDE68A',
  red: '#DC2626',
  redSoft: '#FEF2F2',
  redBorder: '#FECACA',
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
/** Número de semana ISO 8601 (lunes a domingo, semana 1 = la que contiene el
 *  primer jueves del año) — el mismo criterio que usa un calendario de
 *  pared. Pedido explícito del usuario: la fecha sola no dice mucho de un
 *  vistazo, pero "semana 37" sí se ubica directo en el año. */
function semanaISO(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  const fecha = new Date(Date.UTC(y, m - 1, d))
  const diaLunes1 = (fecha.getUTCDay() + 6) % 7 // lunes=0 ... domingo=6
  fecha.setUTCDate(fecha.getUTCDate() - diaLunes1 + 3) // jueves de esa semana
  const primerJueves = new Date(Date.UTC(fecha.getUTCFullYear(), 0, 4))
  const diffSemanas = (fecha.getTime() - primerJueves.getTime()) / (7 * 86_400_000)
  return 1 + Math.round(diffSemanas)
}
const fSemana = (iso: string) => `Semana ${semanaISO(iso)}`
/** "07/09 – 13/09" — el inicio de semana ya viene en lunes (ver lunesDe en
 *  lib/administracion/finanzas.ts), así que el fin es +6 días corridos. */
function fRangoSemana(iso: string): string {
  const fin = new Date(Date.parse(`${iso}T00:00:00Z`) + 6 * 86_400_000).toISOString().slice(0, 10)
  return `${fDia(iso)} – ${fDia(fin)}`
}

/** Bajo 3 días de plazo observado no es "crédito" en ningún sentido útil —
 *  es un cliente (típico HORECA chico) que paga al contado o al día
 *  siguiente. Separarlo evita el absurdo de mostrar "Crédito 1 días". */
function etiquetaPlazo(dias: number): string {
  if (dias <= 2) return 'Contado'
  return `Crédito ${dias} día${dias === 1 ? '' : 's'}`
}

/** Agrupa los clientes de una semana por plazo de pago (7, 15, 30... días),
 *  de menor a mayor plazo — así se ve de un vistazo si el cobro de la semana
 *  depende de crédito corto o largo. Se redondea el plazo al entero más
 *  cercano: el plazo "real" (mediana observada) puede venir fraccionado,
 *  pero el cupo que importa acá es el nominal (7/15/30/45/60/90). */
function agruparPorPlazo(clientes: ClienteEnPeriodo[]) {
  const porDias = new Map<number, ClienteEnPeriodo[]>()
  for (const c of clientes) {
    const dias = Math.round(c.diasPago)
    const arr = porDias.get(dias) ?? []
    arr.push(c)
    porDias.set(dias, arr)
  }
  return [...porDias.entries()]
    .sort(([a], [b]) => a - b)
    .map(([dias, arr]) => ({
      dias,
      bruto: arr.reduce((s, c) => s + c.bruto, 0),
      clientes: arr.sort((a, b) => b.bruto - a.bruto),
    }))
}

/** Tarjeta blanca con el mismo tratamiento visual que Ventas: fondo blanco,
 *  borde gris claro, esquinas redondeadas — nada de fondo oscuro. */
function Card({ children, acento }: { children: React.ReactNode; acento?: string }) {
  return (
    <div style={{
      background: C.card,
      border: `1px solid ${acento ?? C.line}`,
      borderRadius: 16, padding: 'clamp(14px, 4vw, 20px)',
    }}>
      {children}
    </div>
  )
}

/** Tarjeta de alerta pastel — mismo patrón que "Alertas e Insights" en
 *  Ventas (fondo suave + borde del mismo tono, nunca fondo oscuro). */
function CardAlerta({ children, tono = 'amber' }: { children: React.ReactNode; tono?: 'amber' | 'red' }) {
  const bg = tono === 'amber' ? C.amberSoft : C.redSoft
  const border = tono === 'amber' ? C.amberBorder : C.redBorder
  return (
    <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 16, padding: 20 }}>
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
        color: C.muted, display: 'flex', alignItems: 'center', gap: 5,
      }}
    >
      {children}
      {title && <Info size={11} style={{ opacity: 0.5 }} />}
    </p>
  )
}

export default function AdministracionClient({
  series, avance, mtd, caja, deuda, precisionCobro, ultimaCorrida, clientesSinPlazo, hoyISO,
}: Props) {
  const router = useRouter()
  const [tab, setTab] = useState<'ingresos' | 'caja'>('ingresos')
  const [serieId, setSerieId] = useState('general::')
  const [verModelo, setVerModelo] = useState(false)
  const [semanaExpandida, setSemanaExpandida] = useState<string | null>(null)

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
    <div style={{ background: C.bg, minHeight: '100%', margin: -1, padding: '1px 0 0' }}>
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '20px clamp(12px, 4vw, 32px) 60px' }}>

        {/* ── Volver — mismo botón pill que el resto de la app ─────────────── */}
        <button
          onClick={() => router.push('/')}
          aria-label="Volver"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 18,
            background: C.card, border: `1px solid ${C.line}`,
            borderRadius: 100, padding: '7px 14px 7px 10px',
            color: C.text, fontSize: 13, fontWeight: 700, cursor: 'pointer',
          }}
        >
          <ChevronLeft size={17} strokeWidth={2.5} color={C.blue} />
          Volver
        </button>

        {/* ── Encabezado ───────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap', marginBottom: 22 }}>
          <div>
            <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: C.blue }}>
              Administración y Finanzas
            </p>
            <h1 style={{ fontSize: 30, fontWeight: 900, color: C.text, letterSpacing: '-0.8px', lineHeight: 1.1, marginTop: 2 }}>
              Finanzas
            </h1>
            <p style={{ fontSize: 13, color: C.muted, marginTop: 6, maxWidth: 620 }}>
              Proyección de facturación e ingreso de caja. La unidad de venta es el neto
              (Total s/imp $); la de caja, el bruto que entra al banco.
            </p>
          </div>
          <div style={{ fontSize: 11.5, color: C.muted, textAlign: 'right' }}>
            <p>Ciclo {fMes(avance.ciclo)} · día {avance.diaActual} de {avance.diasEnCiclo}</p>
            <p style={{ marginTop: 3 }}>
              {ultimaCorrida ? `Modelo: ${ultimaCorrida.slice(0, 10)}` : 'Modelo sin corridas'}
            </p>
          </div>
        </div>

        {/* ── Pestañas ─────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 2, background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: 4, width: 'fit-content', marginBottom: 24 }}>
          {([['ingresos', 'Ingresos', TrendingUp], ['caja', 'Flujo de Caja', Wallet]] as const).map(([id, label, Icon]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 7,
                padding: '9px 18px', borderRadius: 9, border: 'none', cursor: 'pointer',
                fontWeight: 700, fontSize: 13,
                background: tab === id ? C.blue : 'transparent',
                color: tab === id ? '#fff' : C.muted,
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
                <p style={{ fontSize: 30, fontWeight: 900, color: C.text, marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>
                  {fMoney(mtdSerie.neto)}
                </p>
                <p style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                  {/* El bruto (con IVA/ILA) sólo está calculado para el total de
                      la empresa — desglosarlo por categoría necesitaría repetir
                      brutoLinea() por fila en el servidor, no vale la pena para
                      un dato secundario acá. */}
                  {serieActual && serieActual.nivel !== 'general' ? 'neto' : `neto · ${fMoney(mtd.bruto)} con impuestos`}
                </p>
                <div style={{ marginTop: 10, height: 5, borderRadius: 999, background: C.line, overflow: 'hidden' }}>
                  <div style={{ width: `${avancePct}%`, height: '100%', background: C.blue, borderRadius: 999 }} />
                </div>
                <p style={{ fontSize: 11.5, color: C.muted, marginTop: 6 }}>
                  día {avance.diaActual} de {avance.diasEnCiclo} del ciclo
                </p>
              </Card>

              <Card>
                <Etiqueta title="Extrapolación lineal de lo facturado hasta hoy, sobre días hábiles: no se factura fin de semana.">
                  A este ritmo cerrarías con
                </Etiqueta>
                <p style={{ fontSize: 30, fontWeight: 900, color: C.amber, marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>
                  {fMoney(ritmoProyectado)}
                </p>
                <p style={{ fontSize: 11.5, color: C.muted, marginTop: 8 }}>
                  {avance.diasHabilesTranscurridos} de {avance.diasHabilesEnCiclo} días hábiles corridos
                </p>
              </Card>

              <Card>
                <Etiqueta title="Proyección de Prophet para este ciclo, calculada antes de que empezara.">
                  El modelo proyectó
                </Etiqueta>
                {objetivoCiclo == null ? (
                  <>
                    <p style={{ fontSize: 20, fontWeight: 700, color: C.muted, marginTop: 8 }}>—</p>
                    <p style={{ fontSize: 11.5, color: C.muted, marginTop: 6 }}>
                      {hayModelo ? 'El modelo todavía no cubre este ciclo.' : 'Falta la primera corrida del modelo.'}
                    </p>
                  </>
                ) : (
                  <>
                    <p style={{ fontSize: 30, fontWeight: 900, color: C.green, marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>
                      {fMoney(objetivoCiclo)}
                    </p>
                    <div style={{ marginTop: 10, height: 5, borderRadius: 999, background: C.line, overflow: 'hidden' }}>
                      <div style={{
                        width: `${Math.min(100, pctCumplimiento ?? 0)}%`, height: '100%', borderRadius: 999,
                        background: cumple ? C.green : C.red,
                      }} />
                    </div>
                    <p style={{ fontSize: 11.5, fontWeight: 700, marginTop: 6, color: cumple ? C.green : C.red }}>
                      {cumple ? '✓' : '⚠'} vas al {(pctCumplimiento ?? 0).toFixed(0)}% de lo proyectado
                    </p>
                  </>
                )}
              </Card>
            </div>

            {!hayModelo ? (
              <CardAlerta>
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <AlertTriangle size={17} style={{ color: C.amber, flexShrink: 0, marginTop: 1 }} />
                  <div>
                    <p style={{ fontSize: 13.5, fontWeight: 700, color: C.text }}>
                      El modelo de ingresos todavía no corrió
                    </p>
                    <p style={{ fontSize: 12.5, color: C.muted, marginTop: 4, lineHeight: 1.5 }}>
                      Las tarjetas de arriba y el flujo de caja funcionan igual —salen de las ventas reales—,
                      pero la proyección a 8 meses aparece recién después de la primera corrida de Prophet
                      (workflow <code>forecast-produccion</code>, que ahora también modela el dinero).
                    </p>
                  </div>
                </div>
              </CardAlerta>
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
                          border: `1px solid ${serieId === s.id ? C.blue : C.line}`,
                          background: serieId === s.id ? C.blueSoft : 'transparent',
                          color: serieId === s.id ? C.blue : C.muted,
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
                          border: `1px solid ${C.line}`, color: serieActual.mape <= 30 ? C.green : C.amber,
                        }}
                      >
                        desvío {serieActual.mape.toFixed(0)}%
                      </span>
                    )}
                    <button
                      onClick={() => setVerModelo(v => !v)}
                      style={{
                        padding: '7px 14px', borderRadius: 9, cursor: 'pointer', fontSize: 12.5, fontWeight: 700,
                        border: `1px solid ${verModelo ? C.blue : C.line}`,
                        background: verModelo ? C.blueSoft : 'transparent',
                        color: verModelo ? C.blue : C.muted,
                      }}
                    >
                      Ver tendencia
                    </button>
                  </div>
                </div>

                <ResponsiveContainer width="100%" height={340}>
                  <ComposedChart data={datosGrafico}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.line} />
                    <XAxis dataKey="mes" tickFormatter={fMes} tick={{ fontSize: 11, fill: C.muted }} />
                    <YAxis tickFormatter={fCompact} tick={{ fontSize: 11, fill: C.muted }} width={62} />
                    <Tooltip
                      formatter={(v) => (Array.isArray(v) ? `${fMoney(Number(v[0]))} – ${fMoney(Number(v[1]))}` : fMoney(Number(v)))}
                      labelFormatter={(l) => fMes(String(l))}
                      contentStyle={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 10, fontSize: 12 }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Area dataKey="banda" name="Rango probable" fill={C.blueSoft} stroke="none" />
                    <Bar dataKey="historico" name="Facturado" fill={C.blue} radius={[3, 3, 0, 0]} />
                    <Line dataKey="proyectado" name="Proyección" stroke={C.green} strokeWidth={2.5} dot={{ r: 3 }} connectNulls />
                    {verModelo && (
                      <Line dataKey="tendencia" name="Tendencia" stroke={C.purple} strokeWidth={1.5} strokeDasharray="5 4" dot={false} connectNulls />
                    )}
                    <ReferenceLine x={avance.ciclo} stroke={C.faint} strokeDasharray="3 3" />
                  </ComposedChart>
                </ResponsiveContainer>
                <p style={{ fontSize: 11.5, color: C.muted, marginTop: 10 }}>
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

            {/* Precisión de cobro — calibra la proyección contra la realidad:
                de lo que en el pasado esperábamos cobrar, ¿cuánto entró de
                verdad? No hay tabla de pagos/recibos sincronizada todavía, así
                que se infiere cruzando contra Deudores del ERP (dato duro):
                si el cliente sigue con deuda vencida, no pagó cuando debía. */}
            <Card acento={precisionCobro.pctCumplimiento != null && precisionCobro.pctCumplimiento < 70 ? C.redBorder : undefined}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <span style={{
                    width: 52, height: 52, borderRadius: 16, flexShrink: 0,
                    background: precisionCobro.pctCumplimiento != null && precisionCobro.pctCumplimiento >= 85 ? C.greenSoft : C.amberSoft,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Target size={24} color={precisionCobro.pctCumplimiento != null && precisionCobro.pctCumplimiento >= 85 ? C.green : C.amber} />
                  </span>
                  <div>
                    <Etiqueta title="De las ventas cuya fecha de cobro esperada (fecha de entrega + días de pago del cliente) cayó en los últimos 60 días, qué porcentaje del monto NO tiene hoy deuda vencida en el ERP — la mejor aproximación posible sin una tabla de pagos real. No es exacto a nivel de factura: mide si el CLIENTE está al día, no si pagó exactamente esta venta.">
                      Precisión de cobro — últimos 60 días
                    </Etiqueta>
                    <p style={{ fontSize: 30, fontWeight: 900, marginTop: 4, fontVariantNumeric: 'tabular-nums', color: precisionCobro.pctCumplimiento == null ? C.muted : precisionCobro.pctCumplimiento >= 85 ? C.green : precisionCobro.pctCumplimiento >= 70 ? C.amber : C.red }}>
                      {precisionCobro.pctCumplimiento != null ? `${precisionCobro.pctCumplimiento}%` : '—'}
                    </p>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                  <div>
                    <p style={{ fontSize: 11, color: C.muted, textTransform: 'uppercase', fontWeight: 700, letterSpacing: '.04em' }}>Esperado</p>
                    <p style={{ fontSize: 17, fontWeight: 800, color: C.text, marginTop: 2 }}>{fMoney(precisionCobro.totalEsperado.bruto)}</p>
                    <p style={{ fontSize: 11, color: C.muted }}>{precisionCobro.totalEsperado.clientes} clientes</p>
                  </div>
                  <div>
                    <p style={{ fontSize: 11, color: C.muted, textTransform: 'uppercase', fontWeight: 700, letterSpacing: '.04em' }}>Confirmado al día</p>
                    <p style={{ fontSize: 17, fontWeight: 800, color: C.green, marginTop: 2 }}>{fMoney(precisionCobro.totalConfirmadoPagado.bruto)}</p>
                    <p style={{ fontSize: 11, color: C.muted }}>{precisionCobro.totalConfirmadoPagado.clientes} clientes</p>
                  </div>
                  <div>
                    <p style={{ fontSize: 11, color: C.muted, textTransform: 'uppercase', fontWeight: 700, letterSpacing: '.04em' }}>Sigue vencido</p>
                    <p style={{ fontSize: 17, fontWeight: 800, color: C.red, marginTop: 2 }}>{fMoney(precisionCobro.totalIncumplido.bruto)}</p>
                    <p style={{ fontSize: 11, color: C.muted }}>{precisionCobro.totalIncumplido.clientes} clientes</p>
                  </div>
                </div>
              </div>

              {precisionCobro.clientesIncumplidos.length > 0 && (
                <div style={{ marginTop: 16, borderTop: `1px solid ${C.line}`, paddingTop: 14 }}>
                  <p style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 10 }}>
                    <UserX size={14} color={C.red} />
                    Clientes que no pagaron cuando correspondía
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {precisionCobro.clientesIncumplidos.slice(0, 8).map(c => (
                      <div key={c.cliente} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, background: C.bg, borderRadius: 10, padding: '9px 12px' }}>
                        <div style={{ minWidth: 0 }}>
                          <p style={{ fontSize: 13, fontWeight: 700, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.cliente}</p>
                          <p style={{ fontSize: 11, color: C.muted }}>Debería haber pagado desde el {fDia(c.fechaEsperadaMasAntigua)}</p>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <p style={{ fontSize: 13, fontWeight: 700, color: C.red }}>{fMoney(c.brutoEsperado)}</p>
                          <p style={{ fontSize: 11, color: C.muted }}>deuda total: {fMoney(c.deudaVencidaReal)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  {precisionCobro.clientesIncumplidos.length > 8 && (
                    <p style={{ fontSize: 11.5, color: C.muted, marginTop: 8 }}>
                      +{precisionCobro.clientesIncumplidos.length - 8} clientes más — el detalle completo está en Cobranza.
                    </p>
                  )}
                </div>
              )}
            </Card>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
              <Card>
                <Etiqueta title="Suma de las ventas ya despachadas cuyo plazo de pago vence de hoy en adelante.">
                  Por cobrar proyectado
                </Etiqueta>
                <p style={{ fontSize: 28, fontWeight: 900, color: C.blue, marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>
                  {fMoney(caja.totalProyectado.bruto)}
                </p>
                <p style={{ fontSize: 11.5, color: C.muted, marginTop: 2 }}>
                  entra al banco · {fMoney(caja.totalProyectado.neto)} neto
                </p>
              </Card>

              <Card acento={totalAtrasado > 0 ? C.redBorder : undefined}>
                <Etiqueta title="Cobros cuya fecha esperada ya pasó (últimas 2 semanas) y que, según el modelo, deberían haber entrado.">
                  Debería haber entrado
                </Etiqueta>
                <p style={{ fontSize: 28, fontWeight: 900, color: totalAtrasado > 0 ? C.red : C.text, marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>
                  {fMoney(totalAtrasado)}
                </p>
                <p style={{ fontSize: 11.5, color: C.muted, marginTop: 2 }}>
                  en las últimas 2 semanas
                </p>
              </Card>

              <Card>
                <Etiqueta title="Dato duro del informe de Deudores del ERP — no sale de esta proyección.">
                  Vencido según el ERP
                </Etiqueta>
                <p style={{ fontSize: 28, fontWeight: 900, color: C.red, marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>
                  {fMoney(deuda.vencida)}
                </p>
                <p style={{ fontSize: 11.5, color: C.muted, marginTop: 2 }}>
                  {deuda.clientes} clientes{deuda.ultimaCarga ? ` · al ${deuda.ultimaCarga.slice(0, 10)}` : ''}
                </p>
              </Card>

              <Card>
                <Etiqueta title="Vendido pero todavía no despachado: el plazo de pago recién arranca cuando sale de bodega.">
                  Aún sin despachar
                </Etiqueta>
                <p style={{ fontSize: 28, fontWeight: 900, color: C.text, marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>
                  {fMoney(caja.sinDespachar.bruto)}
                </p>
                <p style={{ fontSize: 11.5, color: C.muted, marginTop: 2 }}>
                  {caja.sinDespachar.filas} líneas · entra después de la entrega
                </p>
              </Card>
            </div>

            {/* Curva semanal */}
            <Card>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <CalendarClock size={16} style={{ color: C.blue }} />
                <h2 style={{ fontSize: 14.5, fontWeight: 800, color: C.text }}>
                  Cuándo entra la plata — próximas 8 semanas
                </h2>
              </div>
              {proximas8.length === 0 ? (
                <p style={{ fontSize: 13, color: C.muted, padding: '20px 0' }}>
                  No hay cobros proyectados hacia adelante. Puede pasar si hace días que no se despacha nada.
                </p>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={260}>
                    <ComposedChart data={proximas8}>
                      <CartesianGrid strokeDasharray="3 3" stroke={C.line} />
                      <XAxis dataKey="inicio" tickFormatter={(iso) => `S${semanaISO(iso)}`} tick={{ fontSize: 11, fill: C.muted }} />
                      <YAxis tickFormatter={fCompact} tick={{ fontSize: 11, fill: C.muted }} width={62} />
                      <Tooltip
                        formatter={(v, n) => [fMoney(Number(v)), n === 'bruto' ? 'Entra al banco' : 'Venta neta']}
                        labelFormatter={(l) => `${fSemana(String(l))} (${fRangoSemana(String(l))})`}
                        contentStyle={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 10, fontSize: 12 }}
                      />
                      <Legend wrapperStyle={{ fontSize: 12 }} formatter={v => v === 'bruto' ? 'Entra al banco (bruto)' : 'Venta neta'} />
                      <Bar dataKey="bruto" fill={C.blue} radius={[3, 3, 0, 0]} />
                      <Bar dataKey="neto" fill={C.blueSoft} radius={[3, 3, 0, 0]} />
                    </ComposedChart>
                  </ResponsiveContainer>

                  <div style={{ marginTop: 14, border: `1px solid ${C.line}`, borderRadius: 12, overflow: 'hidden' }}>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', minWidth: 540, borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                          <tr style={{ background: C.bg }}>
                            <th style={{ textAlign: 'left', padding: '10px 14px', color: C.muted, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em', whiteSpace: 'nowrap' }}>Semana</th>
                            <th style={{ textAlign: 'right', padding: '10px 14px', color: C.muted, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em', whiteSpace: 'nowrap' }}>Venta neta</th>
                            <th style={{ textAlign: 'right', padding: '10px 14px', color: C.muted, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em', whiteSpace: 'nowrap' }}>Entra al banco</th>
                            <th style={{ textAlign: 'right', padding: '10px 14px', color: C.muted, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em', whiteSpace: 'nowrap' }}>Documentos</th>
                          </tr>
                        </thead>
                        <tbody>
                          {proximas8.map((p, i) => {
                            const expandido = semanaExpandida === p.inicio
                            const grupos = expandido ? agruparPorPlazo(p.clientes) : []
                            return (
                              <Fragment key={p.inicio}>
                                <tr
                                  onClick={() => setSemanaExpandida(expandido ? null : p.inicio)}
                                  style={{
                                    borderTop: i === 0 ? 'none' : `1px solid ${C.line}`, cursor: 'pointer',
                                    background: expandido ? C.blueSoft : 'transparent',
                                  }}
                                >
                                  <td style={{ padding: '10px 14px', color: C.text, fontWeight: 600, whiteSpace: 'nowrap' }}>
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                                      {expandido ? <ChevronDown size={14} color={C.muted} /> : <ChevronRight size={14} color={C.muted} />}
                                      {fSemana(p.inicio)}
                                    </span>
                                    <span style={{ color: C.muted, fontWeight: 400 }}> · {fRangoSemana(p.inicio)}</span>
                                  </td>
                                  <td style={{ padding: '10px 14px', textAlign: 'right', color: C.muted, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{fMoney(p.neto)}</td>
                                  <td style={{ padding: '10px 14px', textAlign: 'right', color: C.blue, fontWeight: 700, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{fMoney(p.bruto)}</td>
                                  <td style={{ padding: '10px 14px', textAlign: 'right', color: C.muted, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{p.filas}</td>
                                </tr>
                                {expandido && (
                                  <tr>
                                    <td colSpan={4} style={{ padding: 0, background: C.bg, borderBottom: `1px solid ${C.line}` }}>
                                      <div style={{ padding: '4px 14px 16px' }}>
                                        {grupos.length === 0 ? (
                                          <p style={{ fontSize: 12.5, color: C.muted, padding: '10px 0' }}>Sin clientes identificados para esta semana.</p>
                                        ) : grupos.map(g => (
                                          <div key={g.dias} style={{ marginTop: 12 }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6, flexWrap: 'wrap', gap: 4 }}>
                                              <span style={{
                                                fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.04em',
                                                color: g.dias <= 2 ? C.green : C.blue, background: g.dias <= 2 ? C.greenSoft : C.blueSoft,
                                                padding: '3px 9px', borderRadius: 999, whiteSpace: 'nowrap',
                                              }}>
                                                {etiquetaPlazo(g.dias)}
                                              </span>
                                              <span style={{ fontSize: 12, color: C.muted, whiteSpace: 'nowrap' }}>
                                                {fMoney(g.bruto)} · {g.clientes.length} cliente{g.clientes.length !== 1 ? 's' : ''}
                                              </span>
                                            </div>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                              {/* Nombre y monto uno debajo del otro, no lado a lado: si van en la
                                                  misma línea (justify-content: space-between), el monto queda al
                                                  borde derecho de la tabla ANCHA (min-width 540), invisible sin
                                                  arrastrar el scroll horizontal — pasó en la primera versión. */}
                                              {g.clientes.map(c => (
                                                <div key={c.cliente} style={{
                                                  background: C.card, border: `1px solid ${C.line}`, borderRadius: 8,
                                                  padding: '7px 10px', maxWidth: 280,
                                                }}>
                                                  <p style={{ fontSize: 12.5, color: C.text, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {c.cliente}
                                                  </p>
                                                  <p style={{ fontSize: 13.5, color: C.blue, fontWeight: 800, fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>
                                                    {fMoney(c.bruto)}
                                                  </p>
                                                </div>
                                              ))}
                                            </div>
                                          </div>
                                        ))}
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
                  </div>
                </>
              )}
            </Card>

            {/* Lo que no se puede proyectar — visible a propósito */}
            {(caja.sinPlazo.filas > 0 || caja.sinDespachar.filas > 0) && (
              <CardAlerta>
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <HelpCircle size={17} style={{ color: C.amber, flexShrink: 0, marginTop: 1 }} />
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontSize: 13.5, fontWeight: 700, color: C.text }}>
                      {fMoney(caja.sinPlazo.bruto)} sin fecha de cobro estimable
                    </p>
                    <p style={{ fontSize: 12.5, color: C.muted, marginTop: 4, lineHeight: 1.5 }}>
                      Son ventas ya despachadas a {caja.sinPlazo.clientes.length} cliente(s) que no tienen
                      &quot;días de pago&quot; cargado en el maestro ({clientesSinPlazo} fichas sin el dato en total),
                      así que no se pueden repartir en ninguna semana. No están sumadas arriba: aparecen acá para
                      que se corrija la ficha, no para que se pierdan de vista.
                    </p>
                    {caja.sinPlazo.clientes.length > 0 && (
                      <p style={{ fontSize: 12, color: C.muted, marginTop: 8, lineHeight: 1.6 }}>
                        {caja.sinPlazo.clientes.slice(0, 12).join(' · ')}
                        {caja.sinPlazo.clientes.length > 12 ? ` · +${caja.sinPlazo.clientes.length - 12} más` : ''}
                      </p>
                    )}
                  </div>
                </div>
              </CardAlerta>
            )}

            {/* Quién debe */}
            {caja.porCliente.length > 0 && (
              <Card>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                  <Truck size={16} style={{ color: C.blue }} />
                  <h2 style={{ fontSize: 14.5, fontWeight: 800, color: C.text }}>
                    Quién tiene esa plata — top 15
                  </h2>
                </div>
                <div style={{ border: `1px solid ${C.line}`, borderRadius: 12, overflow: 'hidden' }}>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', minWidth: 560, borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr style={{ background: C.bg }}>
                          <th style={{ textAlign: 'left', padding: '10px 14px', color: C.muted, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em', whiteSpace: 'nowrap' }}>Cliente</th>
                          <th style={{ textAlign: 'right', padding: '10px 14px', color: C.muted, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em', whiteSpace: 'nowrap' }}>Plazo</th>
                          <th style={{ textAlign: 'right', padding: '10px 14px', color: C.muted, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em', whiteSpace: 'nowrap' }}>Cobro estimado</th>
                          <th style={{ textAlign: 'right', padding: '10px 14px', color: C.muted, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em', whiteSpace: 'nowrap' }}>Entra al banco</th>
                        </tr>
                      </thead>
                      <tbody>
                        {caja.porCliente.slice(0, 15).map((c, i) => (
                          <tr key={c.cliente} style={{ borderTop: i === 0 ? 'none' : `1px solid ${C.line}` }}>
                            <td style={{ padding: '10px 14px', color: C.text, fontWeight: 600, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.cliente}</td>
                            <td style={{ padding: '10px 14px', textAlign: 'right', color: C.muted, whiteSpace: 'nowrap' }}>{c.diasPago} días</td>
                            {/* En rojo cuando la fecha ya pasó: es plata que
                                debería estar cobrada, no un cobro por venir. */}
                            <td style={{
                              padding: '10px 14px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
                              color: c.proximoCobro < hoyISO ? C.red : C.muted,
                              fontWeight: c.proximoCobro < hoyISO ? 700 : 400,
                            }}>
                              {fSemana(c.proximoCobro)} · {fDia(c.proximoCobro)}{c.proximoCobro < hoyISO ? ' · vencido' : ''}
                            </td>
                            <td style={{ padding: '10px 14px', textAlign: 'right', color: C.blue, fontWeight: 700, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{fMoney(c.bruto)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
