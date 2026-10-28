'use client'

/**
 * Pestaña LITROS (principal desde el 27-oct-2026) — "¿cuántos litros nos pagaron y
 * cuántos vienen?". Todo en litros, que es la unidad de la bolsa de vendedores y de
 * Producción. El motor está en lib/administracion/litrosCobro.ts y usa el mismo modelo de
 * pago que la Caja, así que sus semanas calzan con las de la Caja en pesos.
 *
 * Orden: 3 cifras → semana a semana (pagado y esperado) → de dónde vienen los litros
 * pagados, por vendedor → cómo se calcula.
 */

import { useMemo, useState } from 'react'
import { ComposedChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts'
import { ChevronDown, ChevronRight, FileDown } from 'lucide-react'
import { ORIGENES, type DatosLitrosCobro, type Origen } from '@/lib/administracion/litrosCobro'
import { C, Card, Cifra, Etiqueta, Franja } from './tema'

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const MESES_LARGO = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const fL = (n: number) => `${Math.round(n).toLocaleString('es-CL')} L`
const fN = (n: number) => Math.round(n).toLocaleString('es-CL')
const fPct = (x: number) => `${Math.round(x * 100)}%`
const fDia = (iso: string) => { const [, m, d] = iso.split('-'); return `${Number(d)}-${MESES[Number(m) - 1]}` }
const fDiaCorto = (iso: string) => { const [, m, d] = iso.split('-'); return `${d}/${m}` }
const sumarDias = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
const nombreCiclo = (ciclo: string) => MESES_LARGO[Number(ciclo.slice(5, 7)) - 1]

const ORIGEN_LABEL: Record<Origen, string> = {
  mismo: 'Ventas del mismo ciclo',
  anterior: 'Del ciclo anterior',
  dosAntes: 'De hace 2 ciclos',
  antiguo: 'Más antiguas',
  estimado: 'Pagos sin factura (estimado)',
}
const ORIGEN_COLOR: Record<Origen, string> = {
  mismo: C.green, anterior: C.gold, dosAntes: C.sky, antiguo: C.amber, estimado: C.stone,
}

const th: React.CSSProperties = { padding: '9px 12px', fontSize: 10.5, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase', color: C.muted, textAlign: 'right', whiteSpace: 'nowrap', background: C.bg, borderBottom: `1px solid ${C.line}` }
const td: React.CSSProperties = { padding: '8px 12px', fontSize: 13, textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', borderBottom: `1px solid ${C.line}` }

/** CSV para Excel en Chile: separador ";" y BOM para que respete tildes. */
function descargarCsv(nombre: string, filas: (string | number)[][]) {
  const txt = '﻿' + filas.map(f => f.map(v => (typeof v === 'number' ? Math.round(v) : `"${String(v).replace(/"/g, '""')}"`)).join(';')).join('\n')
  const url = URL.createObjectURL(new Blob([txt], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url; a.download = nombre; a.click()
  URL.revokeObjectURL(url)
}

/** Barra 100% con el origen de los litros pagados. */
function BarraOrigen({ porOrigen, total, alto = 10 }: { porOrigen: Record<Origen, number>; total: number; alto?: number }) {
  if (total <= 0) return <div style={{ height: alto, borderRadius: 99, background: C.line }} />
  return (
    <div role="img" aria-label="Origen de los litros pagados" style={{ display: 'flex', height: alto, borderRadius: 99, overflow: 'hidden', background: C.line }}>
      {ORIGENES.filter(o => porOrigen[o] > 0).map(o => (
        <div key={o} title={`${ORIGEN_LABEL[o]}: ${fL(porOrigen[o])}`} style={{ width: `${(porOrigen[o] / total) * 100}%`, background: ORIGEN_COLOR[o] }} />
      ))}
    </div>
  )
}

function Linea({ color, label, valor, fuerte }: { color?: string; label: string; valor: string; fuerte?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, fontSize: 12.5 }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 7, color: C.muted, minWidth: 0 }}>
        {color && <span style={{ width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0 }} />}
        {label}
      </span>
      <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: fuerte ? 800 : 700, color: C.text, flexShrink: 0 }}>{valor}</span>
    </div>
  )
}

export default function LitrosSection({ datos, hoyISO }: { datos: DatosLitrosCobro; hoyISO: string }) {
  const { ciclos, semanas, porPagar, proximas, supuestos } = datos
  const [cicloSel, setCicloSel] = useState(ciclos[0]?.ciclo ?? '')
  const [verComo, setVerComo] = useState(false)
  const actual = ciclos[0]
  const sel = ciclos.find(c => c.ciclo === cicloSel) ?? actual
  const arrastrado = (o: Record<Origen, number>) => o.anterior + o.dosAntes + o.antiguo

  const grafico = useMemo(() => semanas.map(s => ({
    semana: `S${s.semanaIso}`,
    rango: `${fDiaCorto(s.lunes)} – ${fDiaCorto(sumarDias(s.lunes, 6))}`,
    Pagado: Math.round(s.pagados),
    'Facturas por pagar': Math.round(s.facturas),
    'Venta proyectada': Math.round(s.venta),
    Atrasadas: Math.round(s.atrasadas),
  })), [semanas])
  const semanaHoy = semanas.find(s => s.tipo === 'en_curso')
  const pasadas = semanas.filter(s => s.tipo === 'pasada')
  const promedioPasadas = pasadas.length ? pasadas.reduce((a, s) => a + s.pagados, 0) / pasadas.length : 0
  const promedioFuturas = proximas.semanas ? (proximas.total + (semanaHoy?.pagados ?? 0)) / proximas.semanas : 0

  if (!datos.hayDatos || !actual) {
    return (
      <Card>
        <p style={{ fontSize: 14, color: C.muted }}>Todavía no hay pagos de clientes cargados (informe Movimientos Cta. Cte.). Cuando se carguen, acá se ven los litros pagados y por pagar.</p>
      </Card>
    )
  }

  const totalSel = sel.litros
  const filasVend = sel.vendedores.filter(v => v.litros > 0.5 || (sel.enCurso && v.porPagar > 0.5))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

      {/* ── Las tres cifras ── */}
      <Franja min={280}>
        <Card>
          <Etiqueta title="Litros de las facturas que los clientes pagaron en el ciclo, sin importar cuándo se vendieron. Sólo clientes a crédito: sin PDV, BaseCamp ni cuentas propias.">
            Pagados este ciclo
          </Etiqueta>
          <Cifra tamano={32}>{fL(actual.litros)}</Cifra>
          <p style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>Ciclo {nombreCiclo(actual.ciclo)} · del {fDia(actual.desde)} al {fDia(actual.hasta)}</p>
          <div style={{ marginTop: 12 }}><BarraOrigen porOrigen={actual.porOrigen} total={actual.litros} /></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 10 }}>
            <Linea color={ORIGEN_COLOR.mismo} label="De ventas de este ciclo" valor={fL(actual.porOrigen.mismo)} />
            <Linea color={ORIGEN_COLOR.anterior} label="Arrastrados de ciclos anteriores" valor={fL(arrastrado(actual.porOrigen))} />
            {actual.porOrigen.estimado > 0.5 && <Linea color={ORIGEN_COLOR.estimado} label="Pagos sin factura (estimado)" valor={fL(actual.porOrigen.estimado)} />}
          </div>
        </Card>

        <Card>
          <Etiqueta title="Litros de las facturas ya emitidas que todavía no aparecen pagadas en el ERP. Atrasadas = la fecha en que ese cliente suele pagar ya pasó.">
            Por pagar hoy
          </Etiqueta>
          <Cifra tamano={32}>{fL(porPagar.litros)}</Cifra>
          <p style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{fN(porPagar.facturas)} facturas emitidas e impagas</p>
          <div style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', height: 10, borderRadius: 99, overflow: 'hidden', background: C.line }}>
              <div style={{ width: `${porPagar.litros ? (porPagar.alDia / porPagar.litros) * 100 : 0}%`, background: C.gold }} />
              <div style={{ width: `${porPagar.litros ? (porPagar.atrasados / porPagar.litros) * 100 : 0}%`, background: C.red }} />
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 10 }}>
            <Linea color={C.gold} label="Al día (todavía no les toca)" valor={fL(porPagar.alDia)} />
            <Linea color={C.red} label={`Atrasados · ${porPagar.clientesAtrasados} ${porPagar.clientesAtrasados === 1 ? 'cliente' : 'clientes'}`} valor={fL(porPagar.atrasados)} />
          </div>
        </Card>

        <Card acento={C.gold}>
          <Etiqueta title="Facturas por pagar según cómo paga cada cliente, más la venta proyectada que todavía no se factura y el recupero de lo atrasado. Mismo modelo y calibración que la Caja.">
            Entran las próximas {proximas.semanas} semanas
          </Etiqueta>
          <Cifra tamano={32} color={C.gold}>{fL(proximas.total)}</Cifra>
          <p style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
            ~{fL(promedioFuturas)} por semana · las últimas {pasadas.length} semanas: {fL(promedioPasadas)}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 14 }}>
            <Linea color={C.gold} label="De facturas ya emitidas" valor={fL(proximas.facturas)} />
            <Linea color={C.sky} label="De venta que viene (proyectada)" valor={fL(proximas.venta)} />
            <Linea color={C.amber} label="Recupero de atrasadas" valor={fL(proximas.atrasadas)} />
          </div>
        </Card>
      </Franja>

      {/* ── Semana a semana ── */}
      <Card>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 800, color: C.text }}>Litros que entran, semana a semana</h2>
            <p style={{ fontSize: 12.5, color: C.muted, marginTop: 3 }}>
              A la izquierda lo que ya se pagó; desde esta semana, lo que se espera. La semana en curso suma lo pagado hasta hoy y lo que falta.
            </p>
          </div>
          <button
            onClick={() => descargarCsv(`litros_semana_a_semana_${hoyISO}.csv`, [
              ['Semana', 'Desde', 'Hasta', 'Pagado', 'Facturas por pagar', 'Venta proyectada', 'Atrasadas', 'Total'],
              ...semanas.map(s => [`S${s.semanaIso}`, s.lunes, sumarDias(s.lunes, 6), s.pagados, s.facturas, s.venta, s.atrasadas, s.total]),
            ])}
            style={{ whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 9, border: `1px solid ${C.line}`, background: C.card, color: C.text, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
          >
            <FileDown size={13} /> Excel (CSV)
          </button>
        </div>
        <div style={{ marginTop: 14 }}>
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={grafico} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={C.line} vertical={false} />
              <XAxis dataKey="semana" tick={{ fontSize: 11, fill: C.muted }} tickLine={false} axisLine={{ stroke: C.line }} />
              <YAxis tick={{ fontSize: 11, fill: C.muted }} tickLine={false} axisLine={false} width={52} tickFormatter={v => fN(v)} />
              <Tooltip
                formatter={(v, n) => [fL(Number(v)), n]}
                labelFormatter={(l, p) => `${l} · ${p?.[0]?.payload?.rango ?? ''}`}
                contentStyle={{ borderRadius: 10, border: `1px solid ${C.line}`, fontSize: 12 }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} iconType="square" />
              {semanaHoy && <ReferenceLine x={`S${semanaHoy.semanaIso}`} stroke={C.hoy} strokeDasharray="3 3" label={{ value: 'hoy', position: 'top', fontSize: 11, fill: C.text }} />}
              <Bar dataKey="Pagado" stackId="l" fill={C.green} />
              <Bar dataKey="Facturas por pagar" stackId="l" fill={C.gold} />
              <Bar dataKey="Venta proyectada" stackId="l" fill={C.sky} />
              <Bar dataKey="Atrasadas" stackId="l" fill={C.amber} radius={[4, 4, 0, 0]} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div style={{ overflowX: 'auto', marginTop: 14, border: `1px solid ${C.line}`, borderRadius: 10 }}>
          <table style={{ width: '100%', minWidth: 680, borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: 'left' }}>Semana</th>
                <th style={th}>Pagado</th>
                <th style={th}>Facturas por pagar</th>
                <th style={th}>Venta proyectada</th>
                <th style={th}>Atrasadas</th>
                <th style={th}>Total</th>
              </tr>
            </thead>
            <tbody>
              {semanas.map(s => {
                const enCurso = s.tipo === 'en_curso'
                const vacio = (n: number) => (n > 0.5 ? fN(n) : <span style={{ color: C.faint }}>—</span>)
                return (
                  <tr key={s.lunes} style={{ background: enCurso ? C.goldSoft : undefined }}>
                    <td style={{ ...td, textAlign: 'left' }}>
                      <span style={{ fontWeight: 700, color: C.text }}>S{s.semanaIso}</span>
                      <span style={{ color: C.muted, marginLeft: 8 }}>{fDiaCorto(s.lunes)} – {fDiaCorto(sumarDias(s.lunes, 6))}</span>
                      {enCurso && <span style={{ marginLeft: 8, fontSize: 10.5, fontWeight: 800, color: C.gold, textTransform: 'uppercase', letterSpacing: '.05em' }}>en curso</span>}
                    </td>
                    <td style={{ ...td, color: C.green, fontWeight: 700 }}>{vacio(s.pagados)}</td>
                    <td style={td}>{vacio(s.facturas)}</td>
                    <td style={td}>{vacio(s.venta)}</td>
                    <td style={td}>{vacio(s.atrasadas)}</td>
                    <td style={{ ...td, fontWeight: 800 }}>{fN(s.total)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ── De dónde vienen los litros pagados ── */}
      <Card>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 800, color: C.text }}>De dónde vienen los litros pagados</h2>
            <p style={{ fontSize: 12.5, color: C.muted, marginTop: 3 }}>
              Lo pagado en el ciclo, separado por el ciclo en que se ENTREGÓ la venta. El vendedor es quien lleva hoy la cuenta.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {ciclos.map(c => {
              const activo = c.ciclo === sel.ciclo
              return (
                <button
                  key={c.ciclo}
                  onClick={() => setCicloSel(c.ciclo)}
                  aria-pressed={activo}
                  style={{
                    padding: '7px 13px', borderRadius: 999, cursor: 'pointer', fontSize: 12.5, fontWeight: 700,
                    border: `1px solid ${activo ? C.blue : C.line}`, background: activo ? C.blueSoft : 'transparent', color: activo ? C.blue : C.muted,
                  }}
                >
                  {nombreCiclo(c.ciclo)}{c.enCurso ? ' (en curso)' : ''}
                </button>
              )
            })}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
          <span className="adm-cifra" style={{ fontSize: 24, color: C.text }}>{fL(totalSel)}</span>
          <span style={{ fontSize: 12.5, color: C.muted }}>pagados del {fDia(sel.desde)} al {fDia(sel.hasta)}{sel.enCurso ? ' (hoy)' : ''}</span>
        </div>
        <div style={{ marginTop: 10 }}><BarraOrigen porOrigen={sel.porOrigen} total={totalSel} alto={14} /></div>
        <div style={{ display: 'flex', gap: '6px 16px', flexWrap: 'wrap', marginTop: 10 }}>
          {ORIGENES.filter(o => sel.porOrigen[o] > 0.5).map(o => (
            <span key={o} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.muted }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: ORIGEN_COLOR[o] }} />
              {ORIGEN_LABEL[o]}: <b style={{ color: C.text, fontVariantNumeric: 'tabular-nums' }}>{fL(sel.porOrigen[o])}</b>
              <span style={{ color: C.faint }}>({fPct(totalSel ? sel.porOrigen[o] / totalSel : 0)})</span>
            </span>
          ))}
        </div>

        <div style={{ overflowX: 'auto', marginTop: 16, border: `1px solid ${C.line}`, borderRadius: 10 }}>
          <table style={{ width: '100%', minWidth: sel.enCurso ? 820 : 640, borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: 'left' }}>Vendedor</th>
                <th style={th}>Litros pagados</th>
                <th style={th}>% del total</th>
                <th style={th}>Del mismo ciclo</th>
                <th style={th}>Arrastrados</th>
                <th style={th}>Sin factura (est.)</th>
                {sel.enCurso && <th style={th}>Por pagar hoy</th>}
                {sel.enCurso && <th style={th}>De eso, atrasado</th>}
              </tr>
            </thead>
            <tbody>
              {filasVend.map(v => (
                <tr key={v.vendedor}>
                  <td style={{ ...td, textAlign: 'left', fontWeight: 700, color: C.text }}>
                    {v.vendedor}
                    {v.clientes > 0 && <span style={{ fontWeight: 500, color: C.faint, marginLeft: 6 }}>{v.clientes} {v.clientes === 1 ? 'cliente' : 'clientes'}</span>}
                  </td>
                  <td style={{ ...td, fontWeight: 800 }}>{fN(v.litros)}</td>
                  <td style={{ ...td, color: C.muted }}>{fPct(totalSel ? v.litros / totalSel : 0)}</td>
                  <td style={td}>{fN(v.porOrigen.mismo)}</td>
                  <td style={td}>{fN(arrastrado(v.porOrigen))}</td>
                  <td style={{ ...td, color: C.muted }}>{fN(v.porOrigen.estimado)}</td>
                  {sel.enCurso && <td style={td}>{fN(v.porPagar)}</td>}
                  {sel.enCurso && <td style={{ ...td, color: v.atrasados > 0.5 ? C.red : C.faint, fontWeight: v.atrasados > 0.5 ? 700 : 400 }}>{fN(v.atrasados)}</td>}
                </tr>
              ))}
              <tr style={{ background: C.bg }}>
                <td style={{ ...td, textAlign: 'left', fontWeight: 800 }}>Total</td>
                <td style={{ ...td, fontWeight: 800 }}>{fN(totalSel)}</td>
                <td style={{ ...td, color: C.muted }}>100%</td>
                <td style={{ ...td, fontWeight: 700 }}>{fN(sel.porOrigen.mismo)}</td>
                <td style={{ ...td, fontWeight: 700 }}>{fN(arrastrado(sel.porOrigen))}</td>
                <td style={{ ...td, fontWeight: 700 }}>{fN(sel.porOrigen.estimado)}</td>
                {sel.enCurso && <td style={{ ...td, fontWeight: 700 }}>{fN(porPagar.litros)}</td>}
                {sel.enCurso && <td style={{ ...td, fontWeight: 700, color: C.red }}>{fN(porPagar.atrasados)}</td>}
              </tr>
            </tbody>
          </table>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: sel.sinLitros.monto > 0 ? 'space-between' : 'flex-end', gap: 12, flexWrap: 'wrap', marginTop: 10 }}>
          {sel.sinLitros.monto > 0 && (
            <p style={{ fontSize: 12, color: C.muted }}>
              Además entraron ${fN(sel.sinLitros.monto)} sin factura de {sel.sinLitros.clientes} {sel.sinLitros.clientes === 1 ? 'cliente' : 'clientes'} sin ventas en el año (abonos de deudas viejas): no se cuentan como litros.
            </p>
          )}
          <button
            onClick={() => descargarCsv(`litros_pagados_${sel.ciclo.slice(0, 7)}.csv`, [
              ['Vendedor', 'Litros pagados', 'Del mismo ciclo', 'Del ciclo anterior', 'De hace 2 ciclos', 'Más antiguas', 'Sin factura (estimado)', 'Por pagar hoy', 'Atrasado'],
              ...filasVend.map(v => [v.vendedor, v.litros, v.porOrigen.mismo, v.porOrigen.anterior, v.porOrigen.dosAntes, v.porOrigen.antiguo, v.porOrigen.estimado, v.porPagar, v.atrasados]),
            ])}
            style={{ whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 9, border: `1px solid ${C.line}`, background: C.card, color: C.text, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
          >
            <FileDown size={13} /> Excel (CSV)
          </button>
        </div>
      </Card>

      {/* ── Cómo se calcula ── */}
      <Card padding="14px 18px">
        <button
          onClick={() => setVerComo(v => !v)}
          aria-expanded={verComo}
          style={{ display: 'flex', alignItems: 'center', gap: 8, border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', fontSize: 13.5, fontWeight: 800, color: C.text }}
        >
          {verComo ? <ChevronDown size={16} /> : <ChevronRight size={16} />} Cómo se calcula
        </button>
        {verComo && (
          <ul style={{ marginTop: 12, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 7, fontSize: 12.5, color: C.muted, lineHeight: 1.5 }}>
            <li><b style={{ color: C.text }}>Pagado:</b> cada pago del ERP (informe Movimientos Cta. Cte.) se convierte en los litros de la factura que paga. Si es un abono parcial, cuenta la parte proporcional. Se cuenta por fecha de pago y el ciclo va del 24 al 23.</li>
            <li><b style={{ color: C.text }}>Arrastrado:</b> el pago es de una venta entregada en un ciclo anterior al del pago.</li>
            <li><b style={{ color: C.text }}>Sin factura (estimado):</b> pagos que el ERP no asocia a una factura. Se pasan a litros con el precio bruto por litro de ese cliente en el último año. Si el cliente no tiene ventas en el año (abonos de deudas viejas) no se cuentan como litros y se informan en pesos. Cuando el ERP les asigne factura, pasan a la columna que corresponde.</li>
            <li><b style={{ color: C.text }}>Por pagar:</b> facturas despachadas sin pago en el ERP, recortadas con el saldo del informe Deudores. Atrasada = ya pasó la fecha en que ese cliente suele pagar (su plazo pactado más su atraso medido).</li>
            <li><b style={{ color: C.text }}>Lo que entra:</b> el mismo modelo de la pestaña Caja, en litros. Cada factura se espera en la fecha en que ese cliente suele pagar. La venta que viene sale del forecast de Producción en litros: el {fPct(supuestos.participacionCreditoLitros)} que va a clientes a crédito, menos lo ya pedido este ciclo, más los pedidos sin despachar. Todo se corrige con la calibración del backtest ({supuestos.calibracion.k.map(k => fPct(k)).join(' / ')} según el mes).</li>
            <li><b style={{ color: C.text }}>No incluye:</b> PDV, BaseCamp, ferias, cuentas propias ni el enlatado móvil (EWU, Bundor: es un servicio, no litros nuestros). Es la venta a clientes a crédito, la misma base de la bolsa de vendedores.</li>
          </ul>
        )}
      </Card>
    </div>
  )
}
