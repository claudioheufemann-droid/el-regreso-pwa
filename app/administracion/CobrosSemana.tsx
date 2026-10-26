'use client'

import { useMemo, useState } from 'react'
import { CalendarDays, CheckCircle2, FileDown, TriangleAlert } from 'lucide-react'
import type { DatosCobros } from './page'
import { armarCobrosSemanales, type SemanaCobro } from '@/lib/administracion/cobrosSemanales'
import { DIAS_CORTOS } from '@/lib/administracion/calendarioEntradas'
import { C } from './tema'

/**
 * "Pagos de clientes, semana a semana" — reemplaza la planilla de nueve columnas del
 * modelo (Confirmado/Proyectado/Atrasadas/Contado/Salidas/Neto/Acumulado), que no se
 * entendía. Contesta tres cosas: cuánto entra esta semana y las que vienen según el
 * vencimiento de cada factura, cuánto va pagado de la semana, y qué día entra qué.
 * La lógica vive en lib/administracion/cobrosSemanales.ts.
 */

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const DIAS_LARGOS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']
const fMoney = (n: number) => '$' + Math.round(n).toLocaleString('es-CL')
const fCorto = (n: number) => (n === 0 ? '$0' : Math.abs(n) >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1).replace('.', ',')} M` : `$${Math.round(n / 1000)} mil`)
const fFecha = (iso: string) => { const [, m, d] = iso.split('-'); return `${Number(d)} ${MESES[Number(m) - 1]}` }
const fFechaLarga = (iso: string) => { const [, m, d] = iso.split('-'); return `${Number(d)} de ${MESES_LARGOS[Number(m) - 1]}` }

function descargarCsv(nombre: string, filas: (string | number)[][]) {
  const txt = '﻿' + filas.map(f => f.map(v => (typeof v === 'number' ? Math.round(v) : `"${String(v).replace(/"/g, '""')}"`)).join(';')).join('\n')
  const url = URL.createObjectURL(new Blob([txt], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url; a.download = nombre; a.click()
  URL.revokeObjectURL(url)
}

const etiquetaEstado = (s: SemanaCobro) => (s.estado === 'en_curso' ? 'Esta semana' : s.estado === 'pasada' ? 'Semana pasada' : null)

export default function CobrosSemana({ cobros, hoyISO }: { cobros: DatosCobros; hoyISO: string }) {
  const datos = useMemo(() => {
    const pagosPorDia: Record<string, number> = {}
    for (const [fecha, v] of Object.entries(cobros.calendario.realesPorDia)) pagosPorDia[fecha] = v.credito
    return armarCobrosSemanales({ pendientes: cobros.proyeccion.pendientes, pagosPorDia, hoyISO })
  }, [cobros, hoyISO])

  const enCurso = datos.semanas.find(s => s.estado === 'en_curso') ?? datos.semanas[0]
  const [lunesSel, setLunesSel] = useState(enCurso?.lunes)
  const [diaSel, setDiaSel] = useState<string | null>(null)
  const semana = datos.semanas.find(s => s.lunes === lunesSel) ?? enCurso
  if (!semana) return null

  const maxSemana = Math.max(...datos.semanas.map(s => s.total), 1)
  const maxDia = Math.max(...semana.dias.map(d => Math.max(d.entro ?? 0, d.porCobrar)), 1)
  const dia = semana.dias.find(d => d.fecha === diaSel && d.facturas.length > 0)
    ?? semana.dias.find(d => d.estado === 'hoy' && d.facturas.length > 0)
    ?? semana.dias.find(d => d.estado !== 'pasado' && d.facturas.length > 0)
    ?? semana.dias.find(d => d.facturas.length > 0)
  const vencidasEstaSemana = semana.estado === 'en_curso' ? semana.dias.filter(d => d.estado === 'pasado').reduce((s, d) => s + d.porCobrar, 0) : 0
  const pctEntro = semana.total > 0 ? Math.min(100, (semana.entro / semana.total) * 100) : 0
  const pagosAtrasados = datos.ultimoPago != null && datos.ultimoPago < hoyISO
    && Math.round((Date.parse(`${hoyISO}T00:00:00Z`) - Date.parse(`${datos.ultimoPago}T00:00:00Z`)) / 86_400_000) > 3

  const elegirSemana = (lunes: string) => {
    setLunesSel(lunes); setDiaSel(null)
    // En pantallas angostas la lista queda debajo del detalle: se sube a mostrarlo.
    if (window.innerWidth < 1000) document.getElementById('cs-detalle')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

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
        .cs-fila:focus-visible, .cs-dia:focus-visible { outline: 2px solid ${C.gold}; outline-offset: -2px; }
      `}</style>

      {/* Encabezado */}
      <div style={{ padding: '16px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', borderBottom: `1px solid ${C.line}` }}>
        <div style={{ minWidth: 0 }}>
          <h3 style={{ fontSize: 15, fontWeight: 800, color: C.text, display: 'flex', alignItems: 'center', gap: 7 }}>
            <CalendarDays size={16} style={{ color: C.gold }} /> Pagos de clientes, semana a semana
          </h3>
          <p style={{ fontSize: 12, color: C.muted, marginTop: 3, lineHeight: 1.55, maxWidth: 640 }}>
            Cada factura por cobrar cae en la semana en que vence (fecha de la factura + días de crédito). Lo que ya pasó es lo que entró de verdad. Montos con IVA: lo que llega al banco.
          </p>
        </div>
        <button
          onClick={() => descargarCsv(`pagos-por-semana-${hoyISO}.csv`, [
            ['Semana', 'Desde', 'Hasta', 'Ya entró', 'Por cobrar (vence)', 'Total semana', 'Facturas por cobrar'],
            ...datos.semanas.map(s => [`S${s.numero}`, s.lunes, s.domingo, s.entro, s.porCobrar, s.total, s.facturas]),
          ])}
          style={{ whiteSpace: 'nowrap', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 9, border: `1px solid ${C.line}`, background: C.card, color: C.text, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
        >
          <FileDown size={13} /> Excel (CSV)
        </button>
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
                    {etiqueta ?? `${s.facturas} ${s.facturas === 1 ? 'factura vence' : 'facturas vencen'}`}
                    {enCursoFila && <span style={{ color: C.muted, fontWeight: 500 }}> · entró {fCorto(s.entro)}</span>}
                  </span>
                  {/* barra a la escala de la semana más grande */}
                  <span style={{ display: 'flex', height: 4, borderRadius: 4, overflow: 'hidden', background: C.line, marginTop: 6, width: `${Math.max(4, (s.total / maxSemana) * 100)}%` }}>
                    {s.total > 0 && <span style={{ width: `${(s.entro / s.total) * 100}%`, background: C.green }} />}
                    {s.total > 0 && <span style={{ width: `${(s.porCobrar / s.total) * 100}%`, background: C.sky }} />}
                  </span>
                </span>
                <span style={{ fontSize: 14, fontWeight: 800, color: s.total === 0 ? C.faint : C.text, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                  {fCorto(s.total)}
                </span>
              </button>
            )
          })}
          <p style={{ padding: '10px 16px 14px', fontSize: 11, color: C.muted, lineHeight: 1.55, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: C.green, marginRight: 4 }} />ya entró</span>
            <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: C.sky, marginRight: 4 }} />por cobrar</span>
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
                  <p className="adm-eyebrow">Falta por cobrar</p>
                  <p className="adm-cifra" style={{ fontSize: 22, color: C.text, marginTop: 4 }}>{fMoney(semana.porCobrar)}</p>
                </div>
              </div>
              <div style={{ marginTop: 12, height: 8, borderRadius: 999, background: C.line, overflow: 'hidden' }}>
                <div style={{ width: `${pctEntro}%`, height: '100%', background: C.green, borderRadius: 999 }} />
              </div>
              <p style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>
                Va el <strong style={{ color: C.text }}>{Math.round(pctEntro)}%</strong> de la semana
                {vencidasEstaSemana > 0 && <> · <span style={{ color: C.red, fontWeight: 700 }}>{fMoney(vencidasEstaSemana)}</span> ya vencieron esta semana y no han llegado</>}
              </p>
            </div>
          ) : semana.estado === 'pasada' ? (
            <div>
              <p className="adm-eyebrow">Entró en la semana</p>
              <p className="adm-cifra" style={{ fontSize: 30, color: C.green, marginTop: 4 }}>{fMoney(semana.entro)}</p>
            </div>
          ) : (
            <div>
              <p className="adm-eyebrow">Vence en la semana</p>
              <p className="adm-cifra" style={{ fontSize: 30, color: C.text, marginTop: 4 }}>{fMoney(semana.porCobrar)}</p>
              <p style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{semana.facturas} {semana.facturas === 1 ? 'factura' : 'facturas'} por cobrar</p>
            </div>
          )}

          {/* Día a día */}
          <div>
            <p className="adm-eyebrow" style={{ marginBottom: 8 }}>Día a día</p>
            <div className="cs-dias">
              {semana.dias.map(d => {
                const esHoy = d.estado === 'hoy'
                const elegido = dia?.fecha === d.fecha
                const puedeAbrir = d.facturas.length > 0
                const finDeSemana = d.dow >= 5
                return (
                  <button
                    key={d.fecha} className="cs-dia" disabled={!puedeAbrir} onClick={() => setDiaSel(d.fecha)}
                    aria-label={`${DIAS_LARGOS[d.dow]} ${fFecha(d.fecha)}`}
                    style={{
                      textAlign: 'left', borderRadius: 11, padding: '10px 11px', minWidth: 0, minHeight: 92,
                      display: 'flex', flexDirection: 'column', gap: 4, cursor: puedeAbrir ? 'pointer' : 'default',
                      background: d.estado === 'pasado' ? C.bg : C.card,
                      border: `${esHoy || elegido ? 2 : 1}px solid ${esHoy ? C.hoy : elegido ? C.gold : C.line}`,
                      opacity: finDeSemana && (d.entro ?? 0) === 0 && d.porCobrar === 0 ? 0.6 : 1,
                    }}
                  >
                    <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 4 }}>
                      <span style={{ fontSize: 12, fontWeight: 800, color: C.text }}>{DIAS_CORTOS[d.dow]} {Number(d.fecha.slice(8))}</span>
                      {esHoy && <span style={{ fontSize: 9.5, fontWeight: 800, color: '#fff', background: C.hoy, borderRadius: 100, padding: '2px 7px' }}>HOY</span>}
                    </span>
                    {d.entro != null && (
                      <span style={{ display: 'flex', justifyContent: 'space-between', gap: 4, fontSize: 11.5 }}>
                        <span style={{ color: C.muted }}>Entró</span>
                        <span style={{ fontWeight: 800, color: d.entro > 0 ? C.green : C.faint, fontVariantNumeric: 'tabular-nums' }}>{fCorto(d.entro)}</span>
                      </span>
                    )}
                    {d.estado !== 'pasado' && semana.estado !== 'pasada' && (
                      <span style={{ display: 'flex', justifyContent: 'space-between', gap: 4, fontSize: 11.5 }}>
                        <span style={{ color: C.muted }}>Vence</span>
                        <span style={{ fontWeight: 800, color: d.porCobrar > 0 ? C.text : C.faint, fontVariantNumeric: 'tabular-nums' }}>{fCorto(d.porCobrar)}</span>
                      </span>
                    )}
                    {d.estado === 'pasado' && d.porCobrar > 0 && (
                      <span style={{ display: 'flex', justifyContent: 'space-between', gap: 4, fontSize: 11.5 }}>
                        <span style={{ color: C.red }}>Sin pagar</span>
                        <span style={{ fontWeight: 800, color: C.red, fontVariantNumeric: 'tabular-nums' }}>{fCorto(d.porCobrar)}</span>
                      </span>
                    )}
                    <span style={{ display: 'flex', gap: 2, height: 5, marginTop: 'auto' }}>
                      {(d.entro ?? 0) > 0 && <span style={{ width: `${((d.entro ?? 0) / maxDia) * 100}%`, background: C.green, borderRadius: 3 }} />}
                      {d.porCobrar > 0 && <span style={{ width: `${(d.porCobrar / maxDia) * 100}%`, background: d.estado === 'pasado' ? C.red : C.sky, borderRadius: 3 }} />}
                    </span>
                    {puedeAbrir && <span style={{ fontSize: 10.5, color: C.gold, fontWeight: 700 }}>{d.facturas.length} {d.facturas.length === 1 ? 'factura' : 'facturas'} ›</span>}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Quiénes pagan el día elegido */}
          {dia && (
            <div style={{ border: `1px solid ${C.line}`, borderRadius: 11, overflow: 'hidden' }}>
              <div style={{ background: C.bg, padding: '9px 14px', display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <p style={{ fontSize: 12.5, fontWeight: 800, color: dia.estado === 'pasado' ? C.red : C.text }}>
                  {dia.estado === 'pasado'
                    ? `Vencieron el ${DIAS_LARGOS[dia.dow]} ${fFecha(dia.fecha)} y siguen sin pagar`
                    : `Vencen el ${DIAS_LARGOS[dia.dow]} ${fFecha(dia.fecha)}`}
                </p>
                <p style={{ fontSize: 12.5, fontWeight: 800, color: C.text, fontVariantNumeric: 'tabular-nums' }}>{fMoney(dia.porCobrar)}</p>
              </div>
              <div style={{ maxHeight: 280, overflowY: 'auto' }}>
                {dia.facturas.map(f => (
                  <div key={f.factura} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '8px 14px', borderTop: `1px solid ${C.line}`, alignItems: 'baseline' }}>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontSize: 12.5, fontWeight: 600, color: C.text, overflowWrap: 'anywhere' }}>{f.cliente}</p>
                      <p style={{ fontSize: 11, color: C.muted }}>
                        factura {f.factura} · {f.diasCredito} días de crédito
                        {f.vencimiento !== dia.fecha && ` · vence ${DIAS_LARGOS[(new Date(`${f.vencimiento}T00:00:00Z`).getUTCDay() + 6) % 7]} ${fFecha(f.vencimiento)}, se cuenta el lunes`}
                      </p>
                    </div>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: C.text, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{fMoney(f.bruto)}</span>
                  </div>
                ))}
              </div>
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
          <p style={{ fontSize: 11.5, color: pagosAtrasados ? C.amber : C.muted, lineHeight: 1.6 }}>
            {pagosAtrasados && <TriangleAlert size={12} style={{ verticalAlign: '-2px', marginRight: 4 }} />}
            Pagos cargados hasta el {datos.ultimoPago ? fFechaLarga(datos.ultimoPago) : '—'}
            {pagosAtrasados ? ': los días posteriores pueden mostrar $0 aunque hayan pagado.' : '.'}
            {' '}Sólo cuenta facturas ya despachadas; lo que se venda de aquí en adelante aparece cuando se despache. No incluye mostrador ni BaseCamp (se cobran al contado).
          </p>
        </div>
      </div>
    </div>
  )
}
