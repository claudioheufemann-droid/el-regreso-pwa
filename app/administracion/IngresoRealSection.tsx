'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import {
  Banknote, ArrowUpRight, ArrowDownRight, Clock, Upload, Search, ArrowUpDown,
  TriangleAlert, Info, CalendarCheck, ArrowRight, ChevronDown, Target, Activity,
} from 'lucide-react'
import type { DatosCobros, ComportamientoPago } from './page'
import { LABEL_METODO, type MetodoPago } from '@/lib/administracion/movimientosCtaCte'
import { BACKTEST_MAE_SEMANAL } from '@/lib/administracion/proyeccionCobros'

/**
 * "Plata que entró" — la pestaña que responde cuánto dinero llegó de verdad
 * al negocio y cuánto se demora cada cliente en pagar.
 *
 * Está escrita para que la lea Administración sin tener que interpretar nada:
 * cada número dice en palabras qué significa, y los tres conceptos que se
 * confunden fácil (plata que entró vs. venta despachada vs. deuda) se aclaran
 * explícitamente. El resto del módulo trabaja con promesas de pago; esta
 * pestaña es la única que trabaja con plata efectivamente cobrada.
 */

const C = {
  bg: '#F1F5F9', card: '#FFFFFF', text: '#0F172A', muted: '#64748B', faint: '#94A3B8',
  line: '#E2E8F0', blue: '#2563EB', blueSoft: '#EFF6FF', green: '#059669', greenSoft: '#ECFDF5',
  purple: '#7C3AED', amber: '#D97706', amberSoft: '#FFFBEB', amberBorder: '#FDE68A',
  red: '#DC2626', redSoft: '#FEF2F2', teal: '#0D9488',
}

const COLOR_METODO: Record<string, string> = {
  deposito: C.blue,
  tarjeta_debito: C.purple,
  tarjeta_credito: C.amber,
  efectivo: C.green,
  transferencia: C.teal,
  otro: C.faint,
}

/** Orden de mayor a menor peso habitual, para que la barra apilada se lea
 *  siempre igual aunque una semana no tenga algún método. */
const ORDEN_METODO: MetodoPago[] = ['deposito', 'tarjeta_debito', 'tarjeta_credito', 'efectivo', 'transferencia', 'otro']

const fMoney = (n: number) => '$' + Math.round(n).toLocaleString('es-CL')
const fCorto = (n: number) =>
  Math.abs(n) >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : `$${Math.round(n / 1000)}k`

function fFechaCorta(iso: string): string {
  const [, m, d] = iso.split('-')
  const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
  return `${Number(d)} ${meses[Number(m) - 1]}`
}

/** Número de semana del año (ISO 8601: la semana que contiene el primer jueves
 *  de enero es la semana 1). Se usa para etiquetar la proyección porque es la
 *  forma en que Administración habla de "la semana X", no "próxima semana". */
function semanaISO(fechaISO: string): number {
  const d = new Date(Date.parse(`${fechaISO}T00:00:00Z`))
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7))
  const inicioAno = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil(((d.getTime() - inicioAno.getTime()) / 86_400_000 + 1) / 7)
}

/** Tramos de comportamiento, en lenguaje de negocio y no de percentiles. */
const TRAMOS = [
  { id: 'al_dia', label: 'Pagan al toque', detalle: '0 a 7 días', min: 0, max: 7, color: C.green },
  { id: 'rapido', label: 'Pagan rápido', detalle: '8 a 15 días', min: 8, max: 15, color: C.teal },
  { id: 'normal', label: 'Plazo normal', detalle: '16 a 30 días', min: 16, max: 30, color: C.blue },
  { id: 'lento', label: 'Pagan lento', detalle: '31 a 45 días', min: 31, max: 45, color: C.amber },
  { id: 'muy_lento', label: 'Muy lentos', detalle: 'más de 45 días', min: 46, max: 9999, color: C.red },
] as const

type TramoId = (typeof TRAMOS)[number]['id']
type OrdenCol = 'monto' | 'p50' | 'brecha' | 'cliente'

export default function IngresoRealSection({ datos }: { datos: DatosCobros }) {
  const [verDesglose, setVerDesglose] = useState(true)
  const [tramoActivo, setTramoActivo] = useState<TramoId | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [orden, setOrden] = useState<OrdenCol>('monto')

  /* Se excluye PDV de los plazos: cobra al contado por definición y
     distorsiona cualquier lectura de "cuánto se demoran en pagarnos". */
  const cartera = useMemo(
    () => datos.comportamiento.filter(c => !/pdv/i.test(c.cliente)),
    [datos.comportamiento]
  )

  const datosGrafico = useMemo(
    () => datos.semanas.map(s => ({
      semana: fFechaCorta(s.semana),
      total: s.total,
      ...Object.fromEntries(ORDEN_METODO.map(m => [m, s.porMetodo[m] ?? 0])),
    })),
    [datos.semanas]
  )

  /** Métodos que de verdad aparecen en el período — no se dibujan series vacías. */
  const metodosPresentes = useMemo(() => {
    const vistos = new Set<string>()
    for (const s of datos.semanas) {
      for (const [m, v] of Object.entries(s.porMetodo)) if (v > 0) vistos.add(m)
    }
    return ORDEN_METODO.filter(m => vistos.has(m))
  }, [datos.semanas])

  const porTramo = useMemo(() => {
    return TRAMOS.map(t => {
      const clientes = cartera.filter(c => c.p50 >= t.min && c.p50 <= t.max)
      return { ...t, clientes: clientes.length, monto: clientes.reduce((s, c) => s + c.montoCruzado, 0) }
    })
  }, [cartera])

  const maxMontoTramo = Math.max(...porTramo.map(t => t.monto), 1)

  const tabla = useMemo(() => {
    let filas = cartera
    if (tramoActivo) {
      const t = TRAMOS.find(x => x.id === tramoActivo)!
      filas = filas.filter(c => c.p50 >= t.min && c.p50 <= t.max)
    }
    const q = busqueda.trim().toLowerCase()
    if (q) filas = filas.filter(c => c.cliente.toLowerCase().includes(q))
    const brecha = (c: ComportamientoPago) => (c.declarado == null ? -1 : c.p50 - c.declarado)
    return [...filas].sort((a, b) => {
      if (orden === 'cliente') return a.cliente.localeCompare(b.cliente)
      if (orden === 'p50') return b.p50 - a.p50
      if (orden === 'brecha') return brecha(b) - brecha(a)
      return b.montoCruzado - a.montoCruzado
    })
  }, [cartera, tramoActivo, busqueda, orden])

  /** Clientes que tardan 10+ días más de lo que dice su ficha: son los que
   *  hacen que la proyección de caja prometa plata antes de tiempo. */
  const desalineados = useMemo(
    () => cartera.filter(c => c.declarado != null && c.p50 - c.declarado >= 10),
    [cartera]
  )

  if (!datos.hayDatos) {
    return (
      <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: 40, textAlign: 'center' }}>
        <Banknote size={34} style={{ color: C.faint }} />
        <h3 style={{ fontSize: 17, fontWeight: 800, color: C.text, marginTop: 12 }}>
          Todavía no hay pagos cargados
        </h3>
        <p style={{ fontSize: 13.5, color: C.muted, marginTop: 8, maxWidth: 480, marginInline: 'auto', lineHeight: 1.6 }}>
          Esta pestaña muestra la plata que entró de verdad al negocio. Se alimenta del informe
          <strong> &quot;Movimientos Cta. Cte.&quot;</strong> del ERP.
        </p>
        <Link
          href="/administracion/cargar-cobros"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 18,
            background: C.blue, color: '#fff', padding: '11px 20px', borderRadius: 10,
            fontSize: 13.5, fontWeight: 700, textDecoration: 'none',
          }}
        >
          <Upload size={15} /> Cargar el informe
        </Link>
      </div>
    )
  }

  const variacion = datos.totalPrevias4 > 0
    ? ((datos.totalUltimas4 - datos.totalPrevias4) / datos.totalPrevias4) * 100
    : null
  const subio = (variacion ?? 0) >= 0
  const brechaGlobal = datos.medianaGlobal != null && datos.declaradaGlobal != null
    ? datos.medianaGlobal - datos.declaradaGlobal
    : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

      {/* ── Qué estoy mirando ─────────────────────────────────────────────── */}
      <div style={{ background: C.blueSoft, border: '1px solid #BFDBFE', borderRadius: 12, padding: '13px 16px', display: 'flex', gap: 10 }}>
        <Info size={16} style={{ color: C.blue, flexShrink: 0, marginTop: 1 }} />
        <p style={{ fontSize: 12.5, color: C.text, lineHeight: 1.65 }}>
          Acá ves <strong>la plata que entró de verdad a la empresa</strong>, según los pagos registrados en
          el ERP. Es distinto de lo facturado (que es lo que se vendió) y de la deuda (que es lo que falta
          cobrar): esto es dinero ya recibido.
        </p>
      </div>

      {/* ── Los dos grandes items: optimista (pactado) vs. real (comportamiento) ── */}
      <PanoramaCobranza datos={datos} />

      {/* ── Detalle de la proyección: atrasados y quiénes pagan próximo ─────── */}
      <ProyeccionProximaSemana datos={datos} />

      {/* ── Los 4 números principales (plata YA cobrada, historia reciente) ─── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 14 }}>
        <Tarjeta
          icono={<Banknote size={15} />}
          titulo="Entró en las últimas 4 semanas"
          ayuda="Suma de todos los pagos recibidos en las últimas 4 semanas completas. No cuenta la semana en curso, que todavía está a medias."
        >
          <p style={{ fontSize: 28, fontWeight: 900, color: C.text, fontVariantNumeric: 'tabular-nums' }}>
            {fMoney(datos.totalUltimas4)}
          </p>
          {variacion != null && (
            <p style={{ fontSize: 12, fontWeight: 700, color: subio ? C.green : C.red, display: 'flex', alignItems: 'center', gap: 3, marginTop: 3 }}>
              {subio ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
              {Math.abs(variacion).toFixed(0)}% vs. las 4 semanas anteriores
            </p>
          )}
        </Tarjeta>

        <Tarjeta
          icono={<CalendarCheck size={15} />}
          titulo="Promedio por semana"
          ayuda="Promedio de las últimas 12 semanas completas. Sirve como referencia de cuánto entra en una semana normal."
        >
          <p style={{ fontSize: 28, fontWeight: 900, color: C.text, fontVariantNumeric: 'tabular-nums' }}>
            {fMoney(datos.promedioSemanal)}
          </p>
          <p style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>promedio de 12 semanas</p>
        </Tarjeta>

        <Tarjeta
          icono={<Clock size={15} />}
          titulo="Un cliente típico nos paga en"
          ayuda="Mediana de días entre la entrega y el pago, medida sobre los pagos reales. No incluye las ventas de mostrador (PDV), que se cobran al instante."
        >
          <p style={{ fontSize: 28, fontWeight: 900, color: C.text, fontVariantNumeric: 'tabular-nums' }}>
            {datos.medianaGlobal ?? '—'} <span style={{ fontSize: 15, fontWeight: 700, color: C.muted }}>días</span>
          </p>
          {datos.declaradaGlobal != null && (
            <p style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>
              la ficha dice {datos.declaradaGlobal} días
              {brechaGlobal != null && brechaGlobal > 0 && (
                <strong style={{ color: C.amber }}> · {brechaGlobal} más de lo pactado</strong>
              )}
            </p>
          )}
        </Tarjeta>

        <Tarjeta
          icono={<TriangleAlert size={15} />}
          titulo="Clientes que se atrasan"
          ayuda="Clientes que en la práctica tardan 10 días o más de lo que dice su ficha. Son los que hacen que la proyección de caja prometa plata antes de tiempo."
          acento={desalineados.length > 0 ? C.amber : undefined}
        >
          <p style={{ fontSize: 28, fontWeight: 900, color: desalineados.length > 0 ? C.amber : C.text, fontVariantNumeric: 'tabular-nums' }}>
            {desalineados.length}
          </p>
          <p style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>
            tardan 10+ días más de lo pactado
          </p>
        </Tarjeta>
      </div>

      {/* ── Gráfico semanal ───────────────────────────────────────────────── */}
      <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: '18px 18px 8px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap', marginBottom: 6 }}>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 800, color: C.text }}>Plata que entró, semana a semana</h3>
            <p style={{ fontSize: 12.5, color: C.muted, marginTop: 3 }}>
              Últimos 6 meses. Cada barra es una semana, de lunes a domingo.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 2, background: C.bg, borderRadius: 9, padding: 3 }}>
            {([[true, 'Por medio de pago'], [false, 'Sólo el total']] as const).map(([v, label]) => (
              <button
                key={label}
                onClick={() => setVerDesglose(v)}
                style={{
                  padding: '6px 13px', borderRadius: 7, border: 'none', cursor: 'pointer',
                  fontSize: 12, fontWeight: 700,
                  background: verDesglose === v ? C.card : 'transparent',
                  color: verDesglose === v ? C.text : C.muted,
                  boxShadow: verDesglose === v ? '0 1px 2px rgba(0,0,0,.06)' : 'none',
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ height: 290 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={datosGrafico} margin={{ top: 10, right: 8, left: 4, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.line} vertical={false} />
              <XAxis dataKey="semana" tick={{ fontSize: 11, fill: C.muted }} tickLine={false} axisLine={{ stroke: C.line }} interval="preserveStartEnd" minTickGap={24} />
              <YAxis tickFormatter={fCorto} tick={{ fontSize: 11, fill: C.muted }} tickLine={false} axisLine={false} width={52} />
              <Tooltip
                cursor={{ fill: 'rgba(37,99,235,.05)' }}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null
                  const filas = payload.filter(p => Number(p.value) > 0)
                  const total = filas.reduce((s, p) => s + Number(p.value), 0)
                  return (
                    <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 10, padding: '10px 12px', boxShadow: '0 4px 14px rgba(0,0,0,.08)' }}>
                      <p style={{ fontSize: 12, fontWeight: 800, color: C.text, marginBottom: 6 }}>
                        Semana del {label}
                      </p>
                      {filas.map(p => (
                        <p key={String(p.dataKey)} style={{ fontSize: 12, color: C.muted, display: 'flex', justifyContent: 'space-between', gap: 14 }}>
                          <span style={{ color: p.color, fontWeight: 600 }}>
                            {LABEL_METODO[p.dataKey as MetodoPago] ?? 'Total'}
                          </span>
                          <span style={{ fontVariantNumeric: 'tabular-nums', color: C.text, fontWeight: 600 }}>
                            {fMoney(Number(p.value))}
                          </span>
                        </p>
                      ))}
                      {verDesglose && filas.length > 1 && (
                        <p style={{ fontSize: 12, fontWeight: 800, color: C.text, display: 'flex', justifyContent: 'space-between', gap: 14, borderTop: `1px solid ${C.line}`, marginTop: 6, paddingTop: 5 }}>
                          <span>Total</span>
                          <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fMoney(total)}</span>
                        </p>
                      )}
                    </div>
                  )
                }}
              />
              {verDesglose ? (
                <>
                  <Legend
                    verticalAlign="bottom" height={34} iconType="circle" iconSize={8}
                    formatter={v => <span style={{ fontSize: 11.5, color: C.muted }}>{LABEL_METODO[v as MetodoPago] ?? v}</span>}
                  />
                  {metodosPresentes.map((m, i) => (
                    <Bar
                      key={m} dataKey={m} stackId="a" fill={COLOR_METODO[m]}
                      radius={i === metodosPresentes.length - 1 ? [3, 3, 0, 0] : undefined}
                    />
                  ))}
                </>
              ) : (
                <Bar dataKey="total" fill={C.blue} radius={[3, 3, 0, 0]} />
              )}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Comportamiento de pago ────────────────────────────────────────── */}
      <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: 18 }}>
        <h3 style={{ fontSize: 15, fontWeight: 800, color: C.text }}>¿Cuánto se demoran en pagarnos?</h3>
        <p style={{ fontSize: 12.5, color: C.muted, marginTop: 3, lineHeight: 1.6, maxWidth: 720 }}>
          Medido sobre {cartera.length} clientes con al menos 3 pagos registrados. Hacé clic en un grupo para
          ver quiénes son.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 16 }}>
          {porTramo.map(t => {
            const activo = tramoActivo === t.id
            return (
              <button
                key={t.id}
                onClick={() => setTramoActivo(activo ? null : t.id)}
                style={{
                  display: 'grid', gridTemplateColumns: 'minmax(140px, 190px) 1fr auto', gap: 12,
                  alignItems: 'center', width: '100%', textAlign: 'left', cursor: 'pointer',
                  background: activo ? C.blueSoft : 'transparent',
                  border: `1px solid ${activo ? '#BFDBFE' : 'transparent'}`,
                  borderRadius: 9, padding: '8px 10px',
                }}
              >
                <div>
                  <p style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{t.label}</p>
                  <p style={{ fontSize: 11, color: C.muted }}>{t.detalle}</p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <div style={{ flex: 1, height: 9, background: C.bg, borderRadius: 5, overflow: 'hidden' }}>
                    <div style={{ width: `${(t.monto / maxMontoTramo) * 100}%`, height: '100%', background: t.color, borderRadius: 5 }} />
                  </div>
                  <span style={{ fontSize: 11.5, color: C.muted, minWidth: 62, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {fCorto(t.monto)}
                  </span>
                </div>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: t.clientes > 0 ? C.text : C.faint, minWidth: 74, textAlign: 'right' }}>
                  {t.clientes} {t.clientes === 1 ? 'cliente' : 'clientes'}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Tabla por cliente ─────────────────────────────────────────────── */}
      <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ padding: '16px 18px', borderBottom: `1px solid ${C.line}`, display: 'flex', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 800, color: C.text }}>Cliente por cliente</h3>
            <p style={{ fontSize: 12.5, color: C.muted, marginTop: 3 }}>
              {tramoActivo
                ? <>Mostrando el grupo <strong>{TRAMOS.find(t => t.id === tramoActivo)!.label}</strong> · <button onClick={() => setTramoActivo(null)} style={{ background: 'none', border: 'none', color: C.blue, fontWeight: 700, cursor: 'pointer', padding: 0, fontSize: 12.5 }}>ver todos</button></>
                : `${tabla.length} clientes con historial de pago medido`}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: C.bg, borderRadius: 9, padding: '7px 11px' }}>
              <Search size={14} style={{ color: C.faint }} />
              <input
                value={busqueda}
                onChange={e => setBusqueda(e.target.value)}
                placeholder="Buscar cliente…"
                style={{ background: 'transparent', border: 'none', outline: 'none', fontSize: 12.5, color: C.text, width: 150 }}
              />
            </div>
            <select
              value={orden}
              onChange={e => setOrden(e.target.value as OrdenCol)}
              style={{ background: C.bg, border: 'none', borderRadius: 9, padding: '8px 11px', fontSize: 12.5, fontWeight: 600, color: C.text, cursor: 'pointer' }}
            >
              <option value="monto">Ordenar: más cobrado</option>
              <option value="p50">Ordenar: más lentos</option>
              <option value="brecha">Ordenar: más desviados del plazo</option>
              <option value="cliente">Ordenar: por nombre</option>
            </select>
          </div>
        </div>

        <div style={{ overflowX: 'auto', maxHeight: 520, overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead style={{ position: 'sticky', top: 0, background: C.bg, zIndex: 1 }}>
              <tr>
                <Th>Cliente</Th>
                <Th centro ayuda="Cuántos pagos suyos pudimos medir. Mientras más, más confiable el dato.">Pagos medidos</Th>
                <Th centro ayuda="Lo habitual: la mitad de las veces paga antes de estos días, la mitad después.">Normalmente paga en</Th>
                <Th centro ayuda="En sus peores casos (1 de cada 10 pagos) se demora esto. Sirve para el escenario pesimista.">En el peor caso</Th>
                <Th centro ayuda="El plazo que figura en la ficha del cliente en el ERP.">Plazo pactado</Th>
                <Th derecha ayuda="Total cobrado a este cliente en los pagos que pudimos cruzar con su guía.">Cobrado</Th>
              </tr>
            </thead>
            <tbody>
              {tabla.map(c => {
                const brecha = c.declarado != null ? c.p50 - c.declarado : null
                const alerta = brecha != null && brecha >= 10
                return (
                  <tr key={c.cliente} style={{ borderTop: `1px solid ${C.line}` }}>
                    <td style={{ padding: '10px 18px', color: C.text, fontWeight: 600 }}>
                      {c.cliente}
                      {alerta && (
                        <span title={`Se demora ${brecha} días más de lo pactado`} style={{ marginLeft: 7, fontSize: 10.5, fontWeight: 800, color: C.amber, background: C.amberSoft, border: `1px solid ${C.amberBorder}`, borderRadius: 100, padding: '2px 7px', whiteSpace: 'nowrap' }}>
                          +{brecha}d
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '10px 8px', textAlign: 'center', color: C.muted, fontVariantNumeric: 'tabular-nums' }}>{c.muestras}</td>
                    <td style={{ padding: '10px 8px', textAlign: 'center', fontWeight: 800, color: C.text, fontVariantNumeric: 'tabular-nums' }}>{c.p50} d</td>
                    <td style={{ padding: '10px 8px', textAlign: 'center', color: C.muted, fontVariantNumeric: 'tabular-nums' }}>{c.p90} d</td>
                    <td style={{ padding: '10px 8px', textAlign: 'center', color: c.declarado == null ? C.faint : C.muted, fontVariantNumeric: 'tabular-nums' }}>
                      {c.declarado == null ? 'sin plazo' : `${c.declarado} d`}
                    </td>
                    <td style={{ padding: '10px 18px', textAlign: 'right', color: C.text, fontVariantNumeric: 'tabular-nums' }}>{fMoney(c.montoCruzado)}</td>
                  </tr>
                )
              })}
              {tabla.length === 0 && (
                <tr><td colSpan={6} style={{ padding: 28, textAlign: 'center', color: C.muted, fontSize: 13 }}>
                  No hay clientes que coincidan con la búsqueda.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div style={{ padding: '11px 18px', borderTop: `1px solid ${C.line}`, background: C.bg, display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <p style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.6 }}>
            Los días se miden entre la entrega y el pago, usando los pagos que el ERP asocia a su guía.
            El plazo &quot;normalmente paga en&quot; es el que usa la proyección de caja cuando hay 3 o más pagos medidos.
          </p>
          <Link href="/administracion/cargar-cobros" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: C.blue, textDecoration: 'none', whiteSpace: 'nowrap' }}>
            <Upload size={13} /> Actualizar con un informe nuevo
          </Link>
        </div>
      </div>
    </div>
  )
}

/* ── Los dos grandes items: optimista (pactado) vs. real (comportamiento) ── */

/**
 * El corazón de la pestaña, pedido explícitamente por Administración
 * (23-sep-2026) como el "apartado principal" de todo el módulo: dos cifras
 * que contestan la misma pregunta —cuánto va a entrar— desde dos ángulos
 * distintos, para que la diferencia entre ambos sea visible y no un dato
 * escondido en una tabla.
 *
 *   · "Si todos pagan como pactaron": usa `SemanaProyectada.pactado`, el
 *     reparto que asume CERO atraso frente al plazo que cada cliente tiene
 *     en su ficha (`PlazoCliente.pactado`) — el escenario ideal.
 *   · "Lo que realmente va a entrar": usa `SemanaProyectada.base`, el reparto
 *     que ya usaba el resto del módulo, calculado con el COMPORTAMIENTO
 *     medido de cada cliente (ver BACKTEST_MAE_SEMANAL) — el número honesto
 *     para planificar.
 *
 * Son dos repartos independientes de universos de facturas parcialmente
 * distintos (cada uno con su propio criterio de atraso — ver el comentario en
 * proyeccionCobros.ts), así que cada total se arma sumando su propio bucket
 * semanal MÁS su propio atrasado, igual que ya hacía `ProyeccionProximaSemana`
 * para una sola semana.
 */
function PanoramaCobranza({ datos }: { datos: DatosCobros }) {
  const p = datos.proyeccion

  const filas = useMemo(() => p.semanas.map(s => ({
    lunes: s.lunes,
    etiqueta: `Sem. ${semanaISO(s.lunes)}`,
    subetiqueta: fFechaCorta(s.lunes),
    pactado: Math.round(s.pactado + p.mostradorSemanal),
    real: Math.round(s.base + p.mostradorSemanal),
  })), [p.semanas, p.mostradorSemanal])

  if (!p.hayDatos) return null

  const nSemanas = p.semanas.length
  const totalOptimista = p.semanas.reduce((s, x) => s + x.pactado, 0) + p.atrasadoPactado.monto + p.mostradorSemanal * nSemanas
  const totalReal = p.semanas.reduce((s, x) => s + x.base, 0) + p.atrasado.monto + p.mostradorSemanal * nSemanas
  const brecha = totalOptimista - totalReal

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
        <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 16, padding: 20, borderTop: `3px solid ${C.blue}` }}>
          <p style={{ fontSize: 11.5, fontWeight: 800, color: C.blue, textTransform: 'uppercase', letterSpacing: '.03em', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Target size={14} /> Dinero que entra, optimistamente
          </p>
          <p style={{ fontSize: 32, fontWeight: 900, color: C.text, marginTop: 9, fontVariantNumeric: 'tabular-nums' }}>
            {fMoney(totalOptimista)}
          </p>
          <p style={{ fontSize: 12.5, color: C.muted, marginTop: 7, lineHeight: 1.65 }}>
            Si <strong>todos</strong> los clientes pagaran exactamente al plazo que tienen pactado en su
            ficha, sin ningún atraso — el escenario ideal, en las próximas {nSemanas} semanas.
          </p>
        </div>

        <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 16, padding: 20, borderTop: `3px solid ${C.teal}` }}>
          <p style={{ fontSize: 11.5, fontWeight: 800, color: C.teal, textTransform: 'uppercase', letterSpacing: '.03em', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Activity size={14} /> Lo que verdaderamente va a entrar
          </p>
          <p style={{ fontSize: 32, fontWeight: 900, color: C.text, marginTop: 9, fontVariantNumeric: 'tabular-nums' }}>
            {fMoney(totalReal)}
          </p>
          <p style={{ fontSize: 12.5, color: C.muted, marginTop: 7, lineHeight: 1.65 }}>
            Según el <strong>comportamiento de pago real</strong> medido de cada cliente (no lo que promete
            su ficha) — el número a usar para planificar caja.
          </p>
        </div>
      </div>

      {brecha > 0 && (
        <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start', background: C.amberSoft, border: `1px solid ${C.amberBorder}`, borderRadius: 12, padding: '12px 15px' }}>
          <TriangleAlert size={15} style={{ color: C.amber, flexShrink: 0, marginTop: 1 }} />
          <p style={{ fontSize: 12.5, color: C.text, lineHeight: 1.6 }}>
            La diferencia entre ambos escenarios es <strong>{fMoney(brecha)}</strong>: es lo que le cuesta
            al flujo de caja que los clientes se demoren más de lo que prometieron.
          </p>
        </div>
      )}

      <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: '18px 18px 8px' }}>
        <h3 style={{ fontSize: 15, fontWeight: 800, color: C.text }}>Cuánto entra, semana a semana</h3>
        <p style={{ fontSize: 12.5, color: C.muted, marginTop: 3, marginBottom: 4 }}>
          Próximas {nSemanas} semanas, identificadas por su número de semana del año. Incluye la venta de
          mostrador, que se cobra al instante.
        </p>
        <div style={{ height: 260 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={filas} margin={{ top: 10, right: 8, left: 4, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.line} vertical={false} />
              <XAxis dataKey="etiqueta" tick={{ fontSize: 11, fill: C.muted }} tickLine={false} axisLine={{ stroke: C.line }} />
              <YAxis tickFormatter={fCorto} tick={{ fontSize: 11, fill: C.muted }} tickLine={false} axisLine={false} width={52} />
              <Tooltip
                cursor={{ fill: 'rgba(37,99,235,.05)' }}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null
                  const d = payload[0]?.payload as (typeof filas)[number]
                  return (
                    <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 10, padding: '11px 13px', boxShadow: '0 4px 14px rgba(0,0,0,.08)', minWidth: 220 }}>
                      <p style={{ fontSize: 12, fontWeight: 800, color: C.text, marginBottom: 7 }}>
                        {label} · semana del {d.subetiqueta}
                      </p>
                      <LineaTooltip color={C.blue} label="Si pagan como pactaron" valor={d.pactado} />
                      <LineaTooltip color={C.teal} label="Según comportamiento real" valor={d.real} />
                    </div>
                  )
                }}
              />
              <Legend
                verticalAlign="bottom" height={30} iconType="circle" iconSize={8}
                formatter={v => <span style={{ fontSize: 11.5, color: C.muted }}>{v}</span>}
              />
              <Bar dataKey="pactado" name="Si pagan como pactaron" fill={C.blue} radius={[3, 3, 0, 0]} />
              <Bar dataKey="real" name="Según comportamiento real" fill={C.teal} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}

/* ── Proyección de lo que debería entrar ────────────────────────────────── */

/**
 * Responde "¿cuánta plata entra la próxima semana?" cruzando las facturas que
 * siguen impagas con el comportamiento de pago real de cada cliente.
 *
 * Se muestran DOS escenarios en vez de un número solo porque el mismo cliente
 * a veces paga a 10 días y a veces a 30: dar una cifra única sería fingir una
 * precisión que los datos no tienen. Y la venta de mostrador va en su propia
 * línea, no sumada a la cobranza, porque no es plata que se esté esperando —
 * es venta nueva que se cobra en el momento.
 */
function ProyeccionProximaSemana({ datos }: { datos: DatosCobros }) {
  const [verDetalle, setVerDetalle] = useState(false)
  const [verAtrasados, setVerAtrasados] = useState(false)
  const p = datos.proyeccion

  if (!p.hayDatos) {
    return (
      <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: 20 }}>
        <h3 style={{ fontSize: 15, fontWeight: 800, color: C.text }}>Lo que debería entrar</h3>
        <p style={{ fontSize: 12.5, color: C.muted, marginTop: 6, lineHeight: 1.6 }}>
          No hay facturas pendientes de cobro en la ventana analizada. Si esperabas ver algo acá,
          puede que falte cargar ventas recientes o un informe de pagos más nuevo.
        </p>
      </div>
    )
  }

  return (
    <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, overflow: 'hidden' }}>
      <div style={{ padding: '18px 18px 0' }}>
        <h3 style={{ fontSize: 15, fontWeight: 800, color: C.text }}>
          Detalle de la cobranza esperada
        </h3>
        <p style={{ fontSize: 12.5, color: C.muted, marginTop: 3, lineHeight: 1.6 }}>
          Qué tan confiable es el número de arriba, qué está atrasado y quiénes deberían pagar la
          semana del {fFechaCorta(p.proximaSemana.lunes)}.
        </p>
      </div>

      {/* Qué tan confiable es este número. Se muestra el error medido en el
          backtest en vez de presentar la cifra como exacta: una proyección sin
          su margen de error invita a tomar decisiones que no aguanta. */}
      <div style={{ margin: '0 18px 18px', display: 'flex', gap: 9, alignItems: 'flex-start', background: C.bg, borderRadius: 11, padding: 13 }}>
        <Info size={15} style={{ color: C.muted, flexShrink: 0, marginTop: 1 }} />
        <p style={{ fontSize: 12, color: C.text, lineHeight: 1.6 }}>
          Probado contra las últimas 26 semanas reales: el modelo se equivoca en promedio{' '}
          <strong>±{fMoney(BACKTEST_MAE_SEMANAL)}</strong> por semana, sin inclinarse a quedar corto ni largo.
          Usar el comportamiento real de cada cliente en vez del plazo que dice su ficha baja ese error un
          28%. Sirve para saber si viene una semana floja o cargada, no para cuadrar un pago al peso.
        </p>
      </div>

      {/* Atrasado: lo más accionable de toda la pestaña */}
      {p.atrasado.monto > 0 && (
        <div style={{ margin: '0 18px 18px', background: C.amberSoft, border: `1px solid ${C.amberBorder}`, borderRadius: 11, padding: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 9 }}>
              <TriangleAlert size={16} style={{ color: C.amber, flexShrink: 0, marginTop: 2 }} />
              <div>
                <p style={{ fontSize: 13, fontWeight: 800, color: C.text }}>
                  Ya debería haber entrado: {fMoney(p.atrasado.monto)}
                </p>
                <p style={{ fontSize: 11.5, color: C.muted, marginTop: 2, lineHeight: 1.5 }}>
                  {p.atrasado.facturas} {p.atrasado.facturas === 1 ? 'factura pasó' : 'facturas pasaron'} la fecha
                  en que ese cliente suele pagar y siguen sin aparecer pagadas. No se cuentan en la
                  proyección de arriba: se probó estimarlas y el modelo empeoraba.
                </p>
              </div>
            </div>
            <button
              onClick={() => setVerAtrasados(v => !v)}
              style={{ display: 'flex', alignItems: 'center', gap: 4, background: C.card, border: `1px solid ${C.amberBorder}`, borderRadius: 8, padding: '7px 12px', fontSize: 12, fontWeight: 700, color: C.text, cursor: 'pointer', whiteSpace: 'nowrap' }}
            >
              {verAtrasados ? 'Ocultar' : 'Ver quiénes'}
              <ChevronDown size={13} style={{ transform: verAtrasados ? 'rotate(180deg)' : undefined }} />
            </button>
          </div>

          {verAtrasados && (
            <div style={{ marginTop: 12, maxHeight: 260, overflowY: 'auto', background: C.card, borderRadius: 9 }}>
              {p.atrasado.detalle.slice(0, 40).map(f => (
                <div key={f.factura} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '8px 12px', borderBottom: `1px solid ${C.line}`, alignItems: 'baseline' }}>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontSize: 12.5, fontWeight: 600, color: C.text }}>{f.cliente}</p>
                    <p style={{ fontSize: 11, color: C.muted }}>
                      factura {f.factura} · entregada {fFechaCorta(f.fechaEntrega)} · {f.diasAtraso} días de atraso
                    </p>
                  </div>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: C.text, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                    {fMoney(f.bruto)}
                  </span>
                </div>
              ))}
              {p.atrasado.detalle.length > 40 && (
                <p style={{ fontSize: 11.5, color: C.muted, padding: '9px 12px' }}>
                  y {p.atrasado.detalle.length - 40} facturas más.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Detalle de quién paga la próxima semana */}
      {p.proximaSemana.detalle.length > 0 && (
        <div style={{ borderTop: `1px solid ${C.line}` }}>
          <button
            onClick={() => setVerDetalle(v => !v)}
            style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '13px 18px', background: 'transparent', border: 'none', cursor: 'pointer' }}
          >
            <span style={{ fontSize: 12.5, fontWeight: 700, color: C.blue, display: 'flex', alignItems: 'center', gap: 6 }}>
              <ArrowRight size={14} /> Quiénes deberían pagar la próxima semana
            </span>
            <ChevronDown size={15} style={{ color: C.muted, transform: verDetalle ? 'rotate(180deg)' : undefined }} />
          </button>
          {verDetalle && (
            <div style={{ maxHeight: 300, overflowY: 'auto', borderTop: `1px solid ${C.line}` }}>
              {p.proximaSemana.detalle.map(f => (
                <div key={f.factura} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '9px 18px', borderBottom: `1px solid ${C.line}`, alignItems: 'baseline' }}>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontSize: 12.5, fontWeight: 600, color: C.text }}>
                      {f.cliente}
                      {f.fuente !== 'medido' && (
                        <span
                          title={f.fuente === 'declarado'
                            ? 'Sin historial de pagos suficiente: se usó el plazo de su ficha.'
                            : 'Sin plazo en la ficha ni historial: se usó el promedio de la cartera.'}
                          style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: C.muted, background: C.bg, borderRadius: 100, padding: '2px 7px', cursor: 'help' }}
                        >
                          {f.fuente === 'declarado' ? 'plazo de ficha' : 'estimado'}
                        </span>
                      )}
                    </p>
                    <p style={{ fontSize: 11, color: C.muted }}>
                      entregada {fFechaCorta(f.fechaEntrega)} · paga a {f.dias} días · esperada {fFechaCorta(f.fechaEsperada)}
                    </p>
                  </div>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: C.text, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                    {fMoney(f.bruto)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Transparencia sobre la calidad del dato */}
      <div style={{ background: C.bg, borderTop: `1px solid ${C.line}`, padding: '11px 18px' }}>
        <p style={{ fontSize: 11, color: C.muted, lineHeight: 1.6 }}>
          Total pendiente de cobro: <strong>{fMoney(p.totalPendiente)}</strong>.
          {' '}{pct(p.cobertura.medido, p.totalPendiente)}% se proyectó con el comportamiento real del cliente,
          {' '}{pct(p.cobertura.declarado, p.totalPendiente)}% con el plazo de su ficha y
          {' '}{pct(p.cobertura.estimado, p.totalPendiente)}% con el promedio de la cartera.
          {p.sinRastreo.monto > 0 && (
            <> Quedan fuera {fMoney(p.sinRastreo.monto)} de ventas despachadas sin número de factura, que no se
            pueden cruzar contra los pagos.</>
          )}
        </p>
      </div>
    </div>
  )
}

const pct = (parte: number, total: number) => (total > 0 ? Math.round((parte / total) * 100) : 0)

function LineaTooltip({ color, label, valor }: { color: string; label: string; valor: number }) {
  if (valor <= 0) return null
  return (
    <p style={{ fontSize: 12, display: 'flex', justifyContent: 'space-between', gap: 14, marginTop: 2 }}>
      <span style={{ color: C.muted, display: 'flex', alignItems: 'center', gap: 5 }}>
        <span style={{ width: 8, height: 8, borderRadius: 100, background: color, display: 'inline-block' }} />
        {label}
      </span>
      <span style={{ color: C.text, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{fMoney(valor)}</span>
    </p>
  )
}

/* ── Piezas chicas ──────────────────────────────────────────────────────── */

function Tarjeta({ icono, titulo, ayuda, acento, children }: {
  icono: React.ReactNode; titulo: string; ayuda: string; acento?: string; children: React.ReactNode
}) {
  return (
    <div style={{
      background: C.card, border: `1px solid ${acento ?? C.line}`, borderRadius: 14, padding: 16,
      borderTop: acento ? `3px solid ${acento}` : undefined,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: C.muted, marginBottom: 7 }}>
        <span style={{ color: acento ?? C.blue, display: 'flex' }}>{icono}</span>
        <span
          title={ayuda}
          style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.01em', cursor: 'help', borderBottom: `1px dotted ${C.line}` }}
        >
          {titulo}
        </span>
      </div>
      {children}
    </div>
  )
}

function Th({ children, centro, derecha, ayuda }: {
  children: React.ReactNode; centro?: boolean; derecha?: boolean; ayuda?: string
}) {
  return (
    <th
      title={ayuda}
      style={{
        padding: '10px 8px', textAlign: centro ? 'center' : derecha ? 'right' : 'left',
        paddingLeft: !centro && !derecha ? 18 : 8, paddingRight: derecha ? 18 : 8,
        fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.04em',
        color: C.muted, whiteSpace: 'nowrap', cursor: ayuda ? 'help' : 'default',
      }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        {children}
        {ayuda && <ArrowUpDown size={0} style={{ display: 'none' }} />}
      </span>
    </th>
  )
}
