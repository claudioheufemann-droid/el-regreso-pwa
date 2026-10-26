'use client'

import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, CheckCircle2, FileDown, TriangleAlert } from 'lucide-react'
import type { DatosCobros } from './page'
import { armarCobrosSemanales, SEGMENTOS, type DiaCobro, type Segmento, type SemanaCobro } from '@/lib/administracion/cobrosSemanales'
import { DIAS_CORTOS } from '@/lib/administracion/calendarioEntradas'
import { lunesDe } from '@/lib/administracion/finanzas'
import { C } from './tema'

/**
 * "Plata que entra, semana a semana" — reemplaza la planilla de nueve columnas del
 * modelo (Confirmado/Proyectado/Atrasadas/Contado/Salidas/Neto/Acumulado), que no se
 * entendía. Contesta: cuánto entra esta semana y las que vienen, cuánto va pagado de la
 * semana y qué día entra qué, filtrable por tipo de venta (fábrica, enlatado, PDV,
 * BaseCamp). La lógica vive en lib/administracion/cobrosSemanales.ts.
 */

const SEG: Record<Segmento, { label: string; color: string }> = {
  fabrica: { label: 'Fábrica', color: C.gold },
  enlatado: { label: 'Enlatado móvil', color: C.teal },
  pdv: { label: 'PDV', color: C.purple },
  basecamp: { label: 'BaseCamp', color: C.amber },
}
const CLAVE_FILTRO = 'adm-cobros-segmentos'

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const DIAS_LARGOS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']
const fMoney = (n: number) => '$' + Math.round(n).toLocaleString('es-CL')
const fCorto = (n: number) => (n === 0 ? '$0' : Math.abs(n) >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1).replace('.', ',')} M` : `$${Math.round(n / 1000)} mil`)
const fFecha = (iso: string) => { const [, m, d] = iso.split('-'); return `${Number(d)} ${MESES[Number(m) - 1]}` }
const fFechaLarga = (iso: string) => { const [, m, d] = iso.split('-'); return `${Number(d)} de ${MESES_LARGOS[Number(m) - 1]}` }
const dowDe = (iso: string) => (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7

function descargarCsv(nombre: string, filas: (string | number)[][]) {
  const txt = '﻿' + filas.map(f => f.map(v => (typeof v === 'number' ? Math.round(v) : `"${String(v).replace(/"/g, '""')}"`)).join(';')).join('\n')
  const url = URL.createObjectURL(new Blob([txt], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url; a.download = nombre; a.click()
  URL.revokeObjectURL(url)
}

const etiquetaEstado = (s: SemanaCobro) => (s.estado === 'en_curso' ? 'Esta semana' : s.estado === 'pasada' ? 'Semana pasada' : null)
const Punto = ({ color, size = 8 }: { color: string; size?: number }) => (
  <span style={{ display: 'inline-block', width: size, height: size, borderRadius: 99, background: color, flexShrink: 0 }} />
)

/** Barra apilada: por tipo de venta, sólido lo que entró y tenue lo que falta. */
function Barra({ entro, falta, max, segmentos, alto = 5 }: { entro: Record<Segmento, number>; falta: Record<Segmento, number>; max: number; segmentos: Segmento[]; alto?: number }) {
  const trozos = segmentos.flatMap(s => [
    { k: `${s}-e`, v: entro[s], color: SEG[s].color, op: 1 },
    { k: `${s}-f`, v: falta[s], color: SEG[s].color, op: 0.35 },
  ]).filter(t => t.v > 0)
  return (
    <span style={{ display: 'flex', gap: 1, height: alto }}>
      {trozos.map(t => <span key={t.k} style={{ width: `${(t.v / max) * 100}%`, background: t.color, opacity: t.op, borderRadius: 2 }} />)}
    </span>
  )
}

export default function CobrosSemana({ cobros, hoyISO }: { cobros: DatosCobros; hoyISO: string }) {
  const [segmentos, setSegmentos] = useState<Segmento[]>(['fabrica'])
  useEffect(() => {
    try {
      const guardado = JSON.parse(localStorage.getItem(CLAVE_FILTRO) ?? 'null') as unknown
      if (Array.isArray(guardado)) {
        const validos = SEGMENTOS.filter(s => guardado.includes(s))
        // eslint-disable-next-line react-hooks/set-state-in-effect -- preferencia leída una vez al montar
        if (validos.length) setSegmentos(validos)
      }
    } catch { /* sin almacenamiento: queda Fábrica */ }
  }, [])
  const cambiarSegmentos = (nuevos: Segmento[]) => {
    if (nuevos.length === 0) return
    setSegmentos(nuevos)
    try { localStorage.setItem(CLAVE_FILTRO, JSON.stringify(nuevos)) } catch { /* sin almacenamiento */ }
  }
  const todos = segmentos.length === SEGMENTOS.length
  const alternar = (s: Segmento) => cambiarSegmentos(segmentos.includes(s) ? segmentos.filter(x => x !== s) : SEGMENTOS.filter(x => x === s || segmentos.includes(x)))

  const cal = cobros.calendario
  const datos = useMemo(() => armarCobrosSemanales({
    pendientes: cobros.proyeccion.pendientes,
    pagos: cobros.pagosRecientes,
    hoyISO,
    segmentos,
    contado: {
      mostradorSemanal: cal.mostradorSemanal,
      patronMostrador: cal.patronMostrador,
      ventasBasecamp: cal.realesBasecamp,
      ultimaFechaBasecamp: cal.ultimaFechaBasecamp,
      basecampSemanal: cal.basecampPromedioReal ?? cal.basecampSemanal[lunesDe(hoyISO)] ?? 0,
      patronBasecamp: cal.patronBasecamp,
    },
  }), [cobros, cal, hoyISO, segmentos])

  const enCurso = datos.semanas.find(s => s.estado === 'en_curso') ?? datos.semanas[0]
  const [lunesSel, setLunesSel] = useState(enCurso?.lunes)
  const [diaSel, setDiaSel] = useState<string | null>(null)
  const semana = datos.semanas.find(s => s.lunes === lunesSel) ?? enCurso
  if (!semana) return null

  // Con sólo fábrica / enlatado todo lo que falta son facturas que vencen; con PDV o BaseCamp hay estimación.
  const soloFacturas = segmentos.every(s => s === 'fabrica' || s === 'enlatado')
  const verbo = soloFacturas ? 'Vence' : 'Por entrar'
  const hayContado = segmentos.includes('pdv') || segmentos.includes('basecamp')
  const varios = segmentos.length > 1

  const maxSemana = Math.max(...datos.semanas.map(s => s.total), 1)
  const maxDia = Math.max(...semana.dias.map(d => (d.entro ?? 0) + d.porEntrar), 1)
  const tieneAlgo = (d: DiaCobro) => d.facturas.length > 0 || d.porEntrar > 0 || (d.entro ?? 0) > 0
  const dia = semana.dias.find(d => d.fecha === diaSel && tieneAlgo(d))
    ?? semana.dias.find(d => d.estado === 'hoy' && tieneAlgo(d))
    ?? semana.dias.find(d => d.estado !== 'pasado' && tieneAlgo(d))
    ?? semana.dias.find(tieneAlgo)
  const vencidasEstaSemana = semana.estado === 'en_curso' ? semana.dias.filter(d => d.estado === 'pasado').reduce((s, d) => s + d.facturasMonto, 0) : 0
  const pctEntro = semana.total > 0 ? Math.min(100, (semana.entro / semana.total) * 100) : 0
  const pagosAtrasados = datos.ultimoPago != null && datos.ultimoPago < hoyISO
    && Math.round((Date.parse(`${hoyISO}T00:00:00Z`) - Date.parse(`${datos.ultimoPago}T00:00:00Z`)) / 86_400_000) > 3
  const entroSemanaPor = (s: SemanaCobro) => Object.fromEntries(SEGMENTOS.map(x => [x, s.dias.reduce((a, d) => a + d.entroPor[x], 0)])) as Record<Segmento, number>
  const faltaSemanaPor = (s: SemanaCobro) => Object.fromEntries(SEGMENTOS.map(x => [x, s.dias.reduce((a, d) => a + d.porEntrarPor[x], 0)])) as Record<Segmento, number>

  const elegirSemana = (lunes: string) => {
    setLunesSel(lunes); setDiaSel(null)
    // En pantallas angostas la lista queda debajo del detalle: se sube a mostrarlo.
    if (window.innerWidth < 1000) document.getElementById('cs-detalle')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const chip = (activo: boolean) => ({
    display: 'inline-flex', alignItems: 'center', gap: 7, minHeight: 36, padding: '6px 13px', borderRadius: 999, cursor: 'pointer',
    fontSize: 12.5, fontWeight: 700, border: `1px solid ${activo ? C.text : C.line}`,
    background: activo ? C.text : C.card, color: activo ? '#fff' : C.muted,
  } as const)

  return (
    <div className="adm-card" style={{ border: `1px solid ${C.line}`, padding: 0, overflow: 'hidden' }}>
      <style>{`
        .cs-cuerpo { display: grid; grid-template-columns: 1fr; }
        .cs-lista { order: 2; border-top: 1px solid ${C.line}; }
        .cs-detalle { order: 1; min-width: 0; }
        @media (min-width: 1000px) {
          .cs-cuerpo { grid-template-columns: minmax(300px, 360px) 1fr; }
          .cs-lista { order: 0; border-top: none; border-right: 1px solid ${C.line}; }
        }
        .cs-dias { display: grid; gap: 8px; grid-template-columns: repeat(auto-fit, minmax(118px, 1fr)); }
        @media (min-width: 1200px) { .cs-dias { grid-template-columns: repeat(7, minmax(0, 1fr)); } }
        .cs-fila:hover { background: ${C.bg}; }
        .cs-fila:focus-visible, .cs-dia:focus-visible, .cs-chip:focus-visible { outline: 2px solid ${C.gold}; outline-offset: 2px; }
      `}</style>

      {/* Encabezado + filtros */}
      <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12, borderBottom: `1px solid ${C.line}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0 }}>
            <h3 style={{ fontSize: 15, fontWeight: 800, color: C.text, display: 'flex', alignItems: 'center', gap: 7 }}>
              <CalendarDays size={16} style={{ color: C.gold }} /> Plata que entra, semana a semana
            </h3>
            <p style={{ fontSize: 12, color: C.muted, marginTop: 3, lineHeight: 1.55, maxWidth: 680 }}>
              Las facturas por cobrar caen en la semana en que vencen (fecha de la factura + días de crédito). PDV y BaseCamp se cobran al contado: lo que viene es un estimado según su promedio. Lo que ya pasó es lo que entró de verdad. Montos con IVA: lo que llega al banco.
            </p>
          </div>
          <button
            onClick={() => descargarCsv(`plata-que-entra-${hoyISO}.csv`, [
              ['Semana', 'Desde', 'Hasta', 'Ya entró', 'Por entrar', 'Total semana', ...segmentos.map(s => SEG[s].label)],
              ...datos.semanas.map(s => [`S${s.numero}`, s.lunes, s.domingo, s.entro, s.porEntrar, s.total, ...segmentos.map(x => s.totalPor[x])]),
            ])}
            style={{ whiteSpace: 'nowrap', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 9, border: `1px solid ${C.line}`, background: C.card, color: C.text, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
          >
            <FileDown size={13} /> Excel (CSV)
          </button>
        </div>
        <div role="group" aria-label="Qué plata ver" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: C.muted, marginRight: 2 }}>Ver:</span>
          <button className="cs-chip" style={chip(todos)} aria-pressed={todos} onClick={() => cambiarSegmentos(todos ? ['fabrica'] : [...SEGMENTOS])}>Todos</button>
          {SEGMENTOS.map(s => {
            const activo = segmentos.includes(s)
            return (
              <button key={s} className="cs-chip" style={chip(activo && !todos)} aria-pressed={activo} onClick={() => (todos ? cambiarSegmentos([s]) : alternar(s))}>
                <Punto color={SEG[s].color} /> {SEG[s].label}
              </button>
            )
          })}
        </div>
      </div>

      <div className="cs-cuerpo">
        {/* ── Lista de semanas ── */}
        <div className="cs-lista" role="list" aria-label="Semanas">
          {datos.semanas.map(s => {
            const activa = s.lunes === semana.lunes
            const enCursoFila = s.estado === 'en_curso'
            const etiqueta = etiquetaEstado(s)
            return (
              <button
                key={s.lunes} role="listitem" className="cs-fila" onClick={() => elegirSemana(s.lunes)} aria-current={activa ? 'true' : undefined}
                style={{
                  display: 'grid', gridTemplateColumns: 'auto 1fr auto', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left',
                  padding: '11px 16px', border: 'none', borderBottom: `1px solid ${C.line}`, cursor: 'pointer', minHeight: 56,
                  background: activa ? C.goldSoft : enCursoFila ? '#FBF8F1' : 'transparent',
                  boxShadow: activa ? `inset 3px 0 0 ${C.gold}` : 'none',
                  opacity: s.estado === 'pasada' && !activa ? 0.75 : 1,
                }}
              >
                <span style={{
                  fontSize: 13, fontWeight: 800, minWidth: 44, textAlign: 'center', padding: '5px 0', borderRadius: 8,
                  background: enCursoFila ? C.hoy : C.bg, color: enCursoFila ? '#fff' : C.text,
                }}>S{s.numero}</span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: C.text }}>{fFecha(s.lunes)} – {fFecha(s.domingo)}</span>
                  <span style={{ display: 'block', fontSize: 11.5, color: enCursoFila ? C.gold : C.muted, fontWeight: enCursoFila ? 800 : 500, marginTop: 1 }}>
                    {etiqueta ?? (s.facturas > 0 ? `${s.facturas} ${s.facturas === 1 ? 'factura vence' : 'facturas vencen'}` : s.estimado > 0 ? 'estimado' : 'sin vencimientos')}
                    {enCursoFila && <span style={{ color: C.muted, fontWeight: 500 }}> · entró {fCorto(s.entro)}</span>}
                  </span>
                  <span style={{ display: 'block', marginTop: 6, width: `${Math.max(4, (s.total / maxSemana) * 100)}%` }}>
                    <Barra entro={entroSemanaPor(s)} falta={faltaSemanaPor(s)} max={Math.max(s.total, 1)} segmentos={segmentos} alto={4} />
                  </span>
                </span>
                <span style={{ fontSize: 14, fontWeight: 800, color: s.total === 0 ? C.faint : C.text, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                  {fCorto(s.total)}
                </span>
              </button>
            )
          })}
          <p style={{ padding: '10px 16px 14px', fontSize: 11, color: C.muted, lineHeight: 1.55 }}>
            Color lleno = ya entró · tenue = {soloFacturas ? 'por cobrar' : 'por entrar'}
          </p>
        </div>

        {/* ── Detalle de la semana elegida ── */}
        <div id="cs-detalle" className="cs-detalle" style={{ padding: '16px 18px 18px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <p style={{ fontSize: 22, fontWeight: 800, color: C.text, letterSpacing: '-0.02em' }}>Semana {semana.numero}</p>
            {semana.estado === 'en_curso' && <span style={{ fontSize: 10.5, fontWeight: 800, color: '#fff', background: C.hoy, borderRadius: 100, padding: '3px 9px', letterSpacing: '.04em' }}>EN CURSO</span>}
            {semana.estado === 'pasada' && <span style={{ fontSize: 10.5, fontWeight: 800, color: C.muted, background: C.bg, borderRadius: 100, padding: '3px 9px' }}>SEMANA PASADA</span>}
            <p style={{ fontSize: 13, color: C.muted, flexBasis: '100%', marginTop: -6 }}>
              Del lunes {fFechaLarga(semana.lunes)} al domingo {fFechaLarga(semana.domingo)}
            </p>
            {semana.estado !== 'en_curso' && enCurso && (
              <button onClick={() => elegirSemana(enCurso.lunes)} style={{ background: 'none', border: 'none', padding: 0, color: C.gold, fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                ← Volver a esta semana
              </button>
            )}
          </div>

          {/* Las cifras de la semana */}
          {semana.estado === 'en_curso' ? (
            <div>
              <div style={{ display: 'flex', gap: 'clamp(16px, 4vw, 34px)', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div>
                  <p className="adm-eyebrow">Debería entrar esta semana</p>
                  <p className="adm-cifra" style={{ fontSize: 30, color: C.text, marginTop: 4 }}>{fMoney(semana.total)}</p>
                </div>
                <div>
                  <p className="adm-eyebrow" style={{ display: 'flex', alignItems: 'center', gap: 4 }}><CheckCircle2 size={11} style={{ color: C.green }} /> Ya entró</p>
                  <p className="adm-cifra" style={{ fontSize: 22, color: C.green, marginTop: 4 }}>{fMoney(semana.entro)}</p>
                </div>
                <div>
                  <p className="adm-eyebrow">{soloFacturas ? 'Falta por cobrar' : 'Falta por entrar'}</p>
                  <p className="adm-cifra" style={{ fontSize: 22, color: C.text, marginTop: 4 }}>{fMoney(semana.porEntrar)}</p>
                </div>
              </div>
              <div style={{ marginTop: 12, height: 8, borderRadius: 999, background: C.line, overflow: 'hidden' }}>
                <div style={{ width: `${pctEntro}%`, height: '100%', background: C.green, borderRadius: 999 }} />
              </div>
              <p style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>
                Va el <strong style={{ color: C.text }}>{Math.round(pctEntro)}%</strong> de la semana
                {vencidasEstaSemana > 0 && <> · <span style={{ color: C.red, fontWeight: 700 }}>{fMoney(vencidasEstaSemana)}</span> en facturas ya vencieron esta semana y no han llegado</>}
              </p>
            </div>
          ) : semana.estado === 'pasada' ? (
            <div>
              <p className="adm-eyebrow">Entró en la semana</p>
              <p className="adm-cifra" style={{ fontSize: 30, color: C.green, marginTop: 4 }}>{fMoney(semana.entro)}</p>
              {semana.estimado > 0 && <p style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>+ {fMoney(semana.estimado)} estimado de BaseCamp (días sin venta cargada)</p>}
            </div>
          ) : (
            <div>
              <p className="adm-eyebrow">{soloFacturas ? 'Vence en la semana' : 'Debería entrar en la semana'}</p>
              <p className="adm-cifra" style={{ fontSize: 30, color: C.text, marginTop: 4 }}>{fMoney(semana.porEntrar)}</p>
              <p style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
                {semana.facturas} {semana.facturas === 1 ? 'factura' : 'facturas'} por cobrar
                {semana.estimado > 0 && <> · {fMoney(semana.estimado)} estimado de contado</>}
              </p>
            </div>
          )}

          {/* Desglose por tipo de venta cuando hay más de uno elegido */}
          {varios && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {segmentos.map(s => (
                <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '6px 11px', borderRadius: 9, background: C.bg, fontSize: 12, color: C.muted }}>
                  <Punto color={SEG[s].color} /> {SEG[s].label}
                  <strong style={{ color: C.text, fontVariantNumeric: 'tabular-nums' }}>{fMoney(semana.totalPor[s])}</strong>
                </span>
              ))}
            </div>
          )}

          {/* Día a día */}
          <div>
            <p className="adm-eyebrow" style={{ marginBottom: 8 }}>Día a día</p>
            <div className="cs-dias">
              {semana.dias.map(d => {
                const esHoy = d.estado === 'hoy'
                const elegido = dia?.fecha === d.fecha
                const puedeAbrir = tieneAlgo(d)
                const vacio = (d.entro ?? 0) === 0 && d.porEntrar === 0
                const sinPagar = d.estado === 'pasado' ? d.facturasMonto : 0
                const porEntrarVisible = d.porEntrar - sinPagar
                return (
                  <button
                    key={d.fecha} className="cs-dia" disabled={!puedeAbrir} onClick={() => setDiaSel(d.fecha)}
                    aria-label={`${DIAS_LARGOS[d.dow]} ${fFecha(d.fecha)}`}
                    style={{
                      textAlign: 'left', borderRadius: 11, padding: '10px 11px', minWidth: 0, minHeight: 92,
                      display: 'flex', flexDirection: 'column', gap: 4, cursor: puedeAbrir ? 'pointer' : 'default',
                      background: d.estado === 'pasado' ? C.bg : C.card,
                      border: `${esHoy || elegido ? 2 : 1}px solid ${esHoy ? C.hoy : elegido ? C.gold : C.line}`,
                      opacity: d.dow >= 5 && vacio ? 0.6 : 1,
                    }}
                  >
                    <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 4 }}>
                      <span style={{ fontSize: 12, fontWeight: 800, color: C.text }}>{DIAS_CORTOS[d.dow]} {Number(d.fecha.slice(8))}</span>
                      {esHoy && <span style={{ fontSize: 9.5, fontWeight: 800, color: '#fff', background: C.hoy, borderRadius: 100, padding: '2px 7px' }}>HOY</span>}
                    </span>
                    {d.entro != null && (
                      <span style={{ display: 'flex', justifyContent: 'space-between', gap: 4, fontSize: 11.5 }}>
                        <span style={{ color: C.muted }}>Entró</span>
                        <span style={{ fontWeight: 800, color: d.entro > 0 ? C.green : C.faint, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{fCorto(d.entro)}</span>
                      </span>
                    )}
                    {(d.estado !== 'pasado' || porEntrarVisible > 0) && semana.estado !== 'pasada' && (
                      <span style={{ display: 'flex', justifyContent: 'space-between', gap: 4, fontSize: 11.5 }}>
                        <span style={{ color: C.muted }}>{d.facturasMonto > 0 || soloFacturas ? verbo : 'Aprox.'}</span>
                        <span style={{ fontWeight: 800, color: porEntrarVisible > 0 ? C.text : C.faint, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{d.estimado > 0 && d.facturasMonto === 0 ? '≈' : ''}{fCorto(porEntrarVisible)}</span>
                      </span>
                    )}
                    {semana.estado === 'pasada' && d.estimado > 0 && (
                      <span style={{ display: 'flex', justifyContent: 'space-between', gap: 4, fontSize: 11.5 }}>
                        <span style={{ color: C.muted }}>Aprox.</span>
                        <span style={{ fontWeight: 800, color: C.text, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>≈{fCorto(d.estimado)}</span>
                      </span>
                    )}
                    {sinPagar > 0 && (
                      <span style={{ display: 'flex', justifyContent: 'space-between', gap: 4, fontSize: 11.5 }}>
                        <span style={{ color: C.red }}>Sin pagar</span>
                        <span style={{ fontWeight: 800, color: C.red, fontVariantNumeric: 'tabular-nums' }}>{fCorto(sinPagar)}</span>
                      </span>
                    )}
                    <span style={{ marginTop: 'auto', display: 'block', width: `${Math.max(4, (((d.entro ?? 0) + d.porEntrar) / maxDia) * 100)}%` }}>
                      <Barra entro={d.entroPor} falta={d.porEntrarPor} max={Math.max((d.entro ?? 0) + d.porEntrar, 1)} segmentos={segmentos} />
                    </span>
                    {d.facturas.length > 0 && <span style={{ fontSize: 10.5, color: C.gold, fontWeight: 700 }}>{d.facturas.length} {d.facturas.length === 1 ? 'factura' : 'facturas'} ›</span>}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Detalle del día elegido */}
          {dia && (
            <div style={{ border: `1px solid ${C.line}`, borderRadius: 11, overflow: 'hidden' }}>
              <div style={{ background: C.bg, padding: '9px 14px' }}>
                <p style={{ fontSize: 12.5, fontWeight: 800, color: C.text, textTransform: 'capitalize' }}>{DIAS_LARGOS[dia.dow]} {fFecha(dia.fecha)}</p>
              </div>
              {/* Lo que entró y lo estimado, por tipo de venta */}
              {segmentos.filter(s => dia.entroPor[s] > 0 || (dia.porEntrarPor[s] > 0 && (s === 'pdv' || s === 'basecamp'))).map(s => (
                <div key={s} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '8px 14px', borderTop: `1px solid ${C.line}`, alignItems: 'baseline', flexWrap: 'wrap' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 600, color: C.text }}><Punto color={SEG[s].color} /> {SEG[s].label}</span>
                  <span style={{ fontSize: 12.5, fontVariantNumeric: 'tabular-nums', display: 'flex', gap: 12 }}>
                    {dia.entroPor[s] > 0 && <span style={{ color: C.green, fontWeight: 700 }}>entró {fMoney(dia.entroPor[s])}</span>}
                    {(s === 'pdv' || s === 'basecamp') && dia.porEntrarPor[s] > 0 && (
                      <span style={{ color: C.muted }}>
                        {dia.estado === 'pasado' ? 'sin venta cargada, estimado ' : dia.entroPor[s] > 0 ? 'falta estimado ' : 'estimado '}
                        <strong style={{ color: C.text }}>≈{fMoney(dia.porEntrarPor[s])}</strong>
                      </span>
                    )}
                  </span>
                </div>
              ))}
              {dia.facturas.length > 0 && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '9px 14px', borderTop: `1px solid ${C.line}`, background: C.bg }}>
                    <p style={{ fontSize: 12, fontWeight: 800, color: dia.estado === 'pasado' ? C.red : C.text }}>
                      {dia.estado === 'pasado' ? 'Facturas que vencieron este día y siguen sin pagar' : 'Facturas que vencen este día'}
                    </p>
                    <p style={{ fontSize: 12, fontWeight: 800, color: C.text, fontVariantNumeric: 'tabular-nums' }}>{fMoney(dia.facturasMonto)}</p>
                  </div>
                  <div style={{ maxHeight: 280, overflowY: 'auto' }}>
                    {dia.facturas.map(f => (
                      <div key={f.factura} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '8px 14px', borderTop: `1px solid ${C.line}`, alignItems: 'baseline' }}>
                        <div style={{ minWidth: 0 }}>
                          <p style={{ fontSize: 12.5, fontWeight: 600, color: C.text, overflowWrap: 'anywhere', display: 'flex', alignItems: 'center', gap: 6 }}>
                            {varios && <Punto color={SEG[f.segmento].color} size={7} />}{f.cliente}
                          </p>
                          <p style={{ fontSize: 11, color: C.muted }}>
                            factura {f.factura} · {f.diasCredito} días de crédito
                            {f.vencimiento !== dia.fecha && ` · vence ${DIAS_LARGOS[dowDe(f.vencimiento)]} ${fFecha(f.vencimiento)}, se cuenta el lunes`}
                          </p>
                        </div>
                        <span style={{ fontSize: 12.5, fontWeight: 700, color: C.text, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{fMoney(f.bruto)}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Lo vencido de antes y cómo leer los datos */}
          {datos.vencidoAntes.monto > 0 && (
            <div style={{ display: 'flex', gap: 9, background: C.redSoft, border: `1px solid ${C.redBorder}`, borderRadius: 11, padding: '10px 14px' }}>
              <TriangleAlert size={14} style={{ color: C.red, flexShrink: 0, marginTop: 2 }} />
              <p style={{ fontSize: 12, color: C.text, lineHeight: 1.6 }}>
                Además hay <strong style={{ color: C.red }}>{fMoney(datos.vencidoAntes.monto)}</strong> en {datos.vencidoAntes.facturas} facturas que vencieron
                antes de esta semana y siguen sin pagar. No se suman a ninguna semana porque no se sabe cuándo van a llegar: se gestionan en la pestaña Cobranza.
              </p>
            </div>
          )}
          <div style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.6, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <p style={{ color: pagosAtrasados ? C.amber : C.muted }}>
              {pagosAtrasados && <TriangleAlert size={12} style={{ verticalAlign: '-2px', marginRight: 4 }} />}
              Pagos cargados hasta el {datos.ultimoPago ? fFechaLarga(datos.ultimoPago) : '—'}
              {pagosAtrasados ? ': los días posteriores pueden mostrar $0 aunque hayan pagado.' : '.'}
              {segmentos.some(s => s === 'fabrica' || s === 'enlatado') && ' Las facturas son las ya despachadas; lo que se venda de aquí en adelante aparece cuando se despache.'}
            </p>
            {hayContado && (
              <p>
                {segmentos.includes('pdv') && <>PDV (mostrador y ferias): se estima {fMoney(cal.mostradorSemanal)} por semana, repartido según cuánto vende cada día. </>}
                {segmentos.includes('basecamp') && <>BaseCamp: venta del restaurante (Toteat), cargada hasta el {cal.ultimaFechaBasecamp ? fFechaLarga(cal.ultimaFechaBasecamp) : '—'}; los días sin dato se estiman con su promedio semanal. </>}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
