'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, CalendarDays, TriangleAlert, CheckCircle2 } from 'lucide-react'
import type { DatosCobros } from './page'
import {
  armarSemana, atrasadoEnEscenario, DIAS_CORTOS, lunesDisponibles,
  type BaseBasecamp, type Escenario,
} from '@/lib/administracion/calendarioEntradas'
import { C } from './tema'

/**
 * "Calendario de entradas": qué día de la semana entra cuánta plata y de qué
 * concepto de venta. La lógica vive en lib/administracion/calendarioEntradas.ts
 * (probada contra datos reales: las facturas cuadran con la proyección semanal).
 * Acá sólo se elige semana/escenario y se dibuja.
 */

const CONCEPTOS = [
  { id: 'facturas', label: 'Cobranza de facturas', corto: 'Facturas', color: C.blue },
  { id: 'mostrador', label: 'Mostrador PDV', corto: 'Mostrador', color: C.green },
  { id: 'basecamp', label: 'BaseCamp', corto: 'BaseCamp', color: C.purple },
] as const

const fMoney = (n: number) => '$' + Math.round(n).toLocaleString('es-CL')
const fMillones = (n: number) => `$${(n / 1_000_000).toFixed(1).replace('.', ',')} M`
const fCorto = (n: number) => (Math.abs(n) >= 1_000_000 ? fMillones(n) : n === 0 ? '$0' : `$${Math.round(n / 1000)}k`)
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const fFecha = (iso: string) => { const [, m, d] = iso.split('-'); return `${Number(d)} ${MESES[Number(m) - 1]}` }
const fDia = (iso: string) => String(Number(iso.split('-')[2]))

export default function CalendarioSemana({ datos }: { datos: DatosCobros }) {
  const cal = datos.calendario
  const pendientes = datos.proyeccion.pendientes
  const semanasOpciones = useMemo(() => lunesDisponibles(cal.hoyISO, 1, 5), [cal.hoyISO])
  const [idx, setIdx] = useState(1) // 0 = semana pasada, 1 = esta semana
  const [escenario, setEscenario] = useState<Escenario>('real')
  const [baseBc, setBaseBc] = useState<BaseBasecamp>('promedio')
  const [diaElegido, setDiaElegido] = useState<string | null>(null)

  const semana = useMemo(
    () => armarSemana(cal, pendientes, semanasOpciones[idx], escenario, baseBc),
    [cal, pendientes, semanasOpciones, idx, escenario, baseBc]
  )
  const atrasado = useMemo(() => atrasadoEnEscenario(pendientes, escenario), [pendientes, escenario])

  const maxDia = Math.max(...semana.dias.map(d => d.total), 1)
  const diaSel = semana.dias.find(d => d.fecha === diaElegido)
    ?? semana.dias.find(d => d.estado === 'hoy' && d.detalleFacturas.length > 0)
    ?? semana.dias.find(d => d.detalleFacturas.length > 0)
  const hayPasados = semana.dias.some(d => d.estado === 'real')

  // BaseCamp: el forecast del modelo suele no coincidir con lo que realmente vende; se muestra el contraste.
  const usaForecast = cal.basecampFuente === 'forecast' && cal.basecampPromedioReal != null
  const forecastSemana = cal.basecampSemanal[semanasOpciones[idx]] ?? 0
  const brechaForecast = usaForecast && cal.basecampPromedioReal! > 0 ? forecastSemana / cal.basecampPromedioReal! - 1 : 0
  const basecampAtrasado = cal.ultimaFechaBasecamp != null && cal.ultimaFechaBasecamp < cal.hoyISO
    && Math.round((Date.parse(`${cal.hoyISO}T00:00:00Z`) - Date.parse(`${cal.ultimaFechaBasecamp}T00:00:00Z`)) / 86_400_000) > 3

  const botonSeg = (activo: boolean) => ({
    padding: '6px 12px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700,
    background: activo ? C.card : 'transparent', color: activo ? C.text : C.muted, boxShadow: activo ? '0 1px 2px rgba(0,0,0,.06)' : 'none',
  } as const)

  return (
    <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <style>{`
        .cal-grid { display: grid; gap: 8px; grid-template-columns: repeat(auto-fit, minmax(128px, 1fr)); }
        @media (min-width: 1100px) { .cal-grid { grid-template-columns: repeat(7, minmax(0, 1fr)); } }
        .cal-dia:focus-visible, .cal-nav:focus-visible { outline: 2px solid ${C.blue}; outline-offset: 2px; }
      `}</style>

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div>
          <h3 style={{ fontSize: 15, fontWeight: 800, color: C.text, display: 'flex', alignItems: 'center', gap: 7 }}>
            <CalendarDays size={16} style={{ color: C.blue }} /> Calendario de entradas
          </h3>
          <p style={{ fontSize: 12.5, color: C.muted, marginTop: 3, lineHeight: 1.6, maxWidth: 560 }}>
            Qué día entra cuánta plata y por qué concepto de venta. Los días que ya pasaron muestran lo que entró de verdad.
            Todo en bruto (lo que llega al banco).
          </p>
        </div>
        <div style={{ display: 'flex', gap: 2, background: C.bg, borderRadius: 9, padding: 3 }} role="group" aria-label="Escenario de cobranza">
          <button style={botonSeg(escenario === 'real')} onClick={() => setEscenario('real')} aria-pressed={escenario === 'real'}>Según comportamiento real</button>
          <button style={botonSeg(escenario === 'pactado')} onClick={() => setEscenario('pactado')} aria-pressed={escenario === 'pactado'}>Si pagan como pactaron</button>
        </div>
      </div>

      {/* Selector de semana */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <button className="cal-nav" aria-label="Semana anterior" disabled={idx === 0} onClick={() => setIdx(i => i - 1)}
          style={{ border: `1px solid ${C.line}`, background: C.card, borderRadius: 8, padding: 6, display: 'flex', cursor: idx === 0 ? 'not-allowed' : 'pointer', opacity: idx === 0 ? 0.4 : 1 }}>
          <ChevronLeft size={16} />
        </button>
        <div style={{ minWidth: 190 }}>
          <p style={{ fontSize: 14, fontWeight: 800, color: C.text }}>Semana {semana.numeroSemana}</p>
          <p style={{ fontSize: 12, color: C.muted }}>{fFecha(semana.lunes)} – {fFecha(semana.domingo)}{idx === 1 ? ' · esta semana' : idx === 0 ? ' · semana pasada' : ''}</p>
        </div>
        <button className="cal-nav" aria-label="Semana siguiente" disabled={idx === semanasOpciones.length - 1} onClick={() => setIdx(i => i + 1)}
          style={{ border: `1px solid ${C.line}`, background: C.card, borderRadius: 8, padding: 6, display: 'flex', cursor: idx === semanasOpciones.length - 1 ? 'not-allowed' : 'pointer', opacity: idx === semanasOpciones.length - 1 ? 0.4 : 1 }}>
          <ChevronRight size={16} />
        </button>
        {idx !== 1 && (
          <button onClick={() => setIdx(1)} style={{ background: 'none', border: 'none', color: C.blue, fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>Volver a esta semana</button>
        )}
      </div>

      {/* Resumen de la semana */}
      <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div>
          <p style={{ fontSize: 11.5, fontWeight: 700, color: C.muted }}>Entra en la semana</p>
          <p style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.035em', color: C.text, fontVariantNumeric: 'tabular-nums' }}>{fMoney(semana.totales.total)}</p>
          {hayPasados && (
            <p style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
              <CheckCircle2 size={12} style={{ color: C.green, verticalAlign: '-2px' }} /> ya entró <strong style={{ color: C.text }}>{fMoney(semana.yaEntro)}</strong>
              {semana.falta > 0 && <> · falta <strong style={{ color: C.text }}>{fMoney(semana.falta)}</strong></>}
            </p>
          )}
        </div>
        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
          {CONCEPTOS.map(c => (
            <div key={c.id}>
              <p style={{ fontSize: 11.5, fontWeight: 700, color: C.muted, display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 9, height: 9, borderRadius: 100, background: c.color, display: 'inline-block' }} /> {c.label}
              </p>
              <p style={{ fontSize: 17, fontWeight: 800, color: C.text, fontVariantNumeric: 'tabular-nums' }}>{fMoney(semana.totales[c.id])}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Los 7 días */}
      <div className="cal-grid">
        {semana.dias.map(d => {
          const esHoy = d.estado === 'hoy'
          const elegido = diaSel?.fecha === d.fecha
          const puedeAbrir = d.detalleFacturas.length > 0
          return (
            <button
              key={d.fecha} className="cal-dia" onClick={() => puedeAbrir && setDiaElegido(d.fecha)} disabled={!puedeAbrir}
              aria-label={`${DIAS_CORTOS[d.dow]} ${fDia(d.fecha)}: ${fMoney(d.total)}`}
              style={{
                textAlign: 'left', borderRadius: 11, padding: '10px 11px', cursor: puedeAbrir ? 'pointer' : 'default',
                background: d.estado === 'real' ? C.bg : C.card,
                border: `${esHoy || elegido ? 2 : 1}px solid ${esHoy ? C.hoy : elegido ? C.blue : C.line}`,
                display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0,
              }}
            >
              <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: C.text }}>{DIAS_CORTOS[d.dow]} {fDia(d.fecha)}</span>
                {esHoy && <span style={{ fontSize: 9.5, fontWeight: 800, color: '#fff', background: C.hoy, borderRadius: 100, padding: '2px 7px' }}>HOY</span>}
                {d.estado === 'real' && <span style={{ fontSize: 10, fontWeight: 700, color: C.green }}>entró</span>}
              </span>
              <span style={{ fontSize: 16, fontWeight: 800, color: d.total === 0 ? C.faint : C.text, fontVariantNumeric: 'tabular-nums' }}>{fCorto(d.total)}</span>
              {/* barra apilada por concepto, a la escala del día más fuerte de la semana */}
              <span style={{ display: 'flex', height: 6, borderRadius: 4, overflow: 'hidden', background: C.line, width: `${Math.max(6, (d.total / maxDia) * 100)}%` }}>
                {CONCEPTOS.map(c => d.total > 0 && d[c.id] > 0 && <span key={c.id} style={{ width: `${(d[c.id] / d.total) * 100}%`, background: c.color }} />)}
              </span>
              {CONCEPTOS.map(c => (
                <span key={c.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 4, fontSize: 11, color: C.muted }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 6, height: 6, borderRadius: 100, background: c.color, display: 'inline-block' }} />{c.corto}
                  </span>
                  <span style={{ fontVariantNumeric: 'tabular-nums', color: C.text, fontWeight: 600 }}>
                    {fCorto(d[c.id])}{c.id === 'basecamp' && d.basecampSinDato ? '*' : ''}
                  </span>
                </span>
              ))}
              {puedeAbrir && <span style={{ fontSize: 10.5, color: C.blue, fontWeight: 700 }}>{d.detalleFacturas.length} {d.detalleFacturas.length === 1 ? 'factura' : 'facturas'} ›</span>}
            </button>
          )
        })}
      </div>

      {/* Detalle del día elegido */}
      {diaSel && diaSel.detalleFacturas.length > 0 && (
        <div style={{ border: `1px solid ${C.line}`, borderRadius: 11, overflow: 'hidden' }}>
          <div style={{ background: C.bg, padding: '9px 14px', display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <p style={{ fontSize: 12.5, fontWeight: 800, color: C.text }}>
              Quiénes deberían pagar el {DIAS_CORTOS[diaSel.dow].toLowerCase()} {fFecha(diaSel.fecha)}
            </p>
            <p style={{ fontSize: 12.5, fontWeight: 800, color: C.text, fontVariantNumeric: 'tabular-nums' }}>{fMoney(diaSel.facturas)}</p>
          </div>
          <div style={{ maxHeight: 260, overflowY: 'auto' }}>
            {diaSel.detalleFacturas.map(f => (
              <div key={f.factura} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '8px 14px', borderTop: `1px solid ${C.line}`, alignItems: 'baseline' }}>
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: 12.5, fontWeight: 600, color: C.text, overflowWrap: 'anywhere' }}>{f.cliente}</p>
                  <p style={{ fontSize: 11, color: C.muted }}>factura {f.factura}</p>
                </div>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: C.text, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{fMoney(f.bruto)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* BaseCamp: forecast vs. lo que realmente vende */}
      {usaForecast && (
        <div style={{
          borderRadius: 11, padding: '11px 14px', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between',
          background: Math.abs(brechaForecast) > 0.2 ? C.amberSoft : C.bg, border: `1px solid ${Math.abs(brechaForecast) > 0.2 ? C.amberBorder : C.line}`,
        }}>
          <p style={{ fontSize: 12, color: C.text, lineHeight: 1.6, flex: '1 1 320px' }}>
            {Math.abs(brechaForecast) > 0.2 && <TriangleAlert size={13} style={{ color: C.amber, verticalAlign: '-2px', marginRight: 5 }} />}
            <strong>BaseCamp:</strong> el forecast del modelo da <strong>{fMillones(forecastSemana)}</strong> por semana y lo que realmente vendió en las
            últimas semanas fue <strong>{fMillones(cal.basecampPromedioReal!)}</strong> por semana
            {Math.abs(brechaForecast) > 0.2 && <> — el forecast está un <strong>{Math.round(brechaForecast * 100)}%</strong> {brechaForecast > 0 ? 'por encima' : 'por debajo'}. Revisa cuál usar para planificar caja.</>}
          </p>
          <div style={{ display: 'flex', gap: 2, background: C.card, borderRadius: 9, padding: 3, border: `1px solid ${C.line}` }} role="group" aria-label="Base de BaseCamp">
            <button style={botonSeg(baseBc === 'forecast')} onClick={() => setBaseBc('forecast')} aria-pressed={baseBc === 'forecast'}>Forecast</button>
            <button style={botonSeg(baseBc === 'promedio')} onClick={() => setBaseBc('promedio')} aria-pressed={baseBc === 'promedio'}>Promedio real</button>
          </div>
        </div>
      )}

      {basecampAtrasado && (
        <div style={{ display: 'flex', gap: 9, background: C.amberSoft, border: `1px solid ${C.amberBorder}`, borderRadius: 11, padding: '10px 14px' }}>
          <TriangleAlert size={14} style={{ color: C.amber, flexShrink: 0, marginTop: 2 }} />
          <p style={{ fontSize: 12, color: C.text, lineHeight: 1.6 }}>
            Las ventas de BaseCamp están cargadas sólo hasta el <strong>{fFecha(cal.ultimaFechaBasecamp!)}</strong>. Los días posteriores ya pasados
            (marcados con *) muestran lo <strong>esperado</strong>, no lo que entró, y no cuentan como &quot;ya entró&quot;.{' '}
            <Link href="/administracion/forecast/cargar-restaurante" style={{ color: C.text, fontWeight: 700 }}>Cargar el informe de Toteat</Link>
          </p>
        </div>
      )}

      <div style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.7 }}>
        {atrasado.monto > 0 && (
          <p>
            Además hay <strong style={{ color: C.text }}>{fMoney(atrasado.monto)}</strong> en {atrasado.facturas} facturas que ya debieron entrar y siguen
            impagas: no se calendarizan porque su fecha pasó (se ven en el detalle de cobranza más abajo).
          </p>
        )}
        <p>
          Cómo se arma: las <strong>facturas</strong> caen en su fecha esperada de pago (si cae sábado o domingo pasa al lunes: los clientes con crédito sólo pagan de lunes
          a viernes). El <strong>mostrador</strong> reparte su promedio semanal ({fMoney(cal.mostradorSemanal)}) según cuánto vende cada día de la semana
          (viernes y sábado concentran la mitad). <strong>BaseCamp</strong> reparte su monto semanal ({baseBc === 'promedio' && cal.basecampPromedioReal != null ? 'promedio real reciente' : 'forecast del modelo'}) con su propio patrón por día.
        </p>
      </div>
    </div>
  )
}
