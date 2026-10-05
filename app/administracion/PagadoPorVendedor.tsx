'use client'

/**
 * "¿Qué parte de lo entregado ya se pagó?" — pestaña Cobranza (5-oct-2026).
 *
 * Lo entregado en un ciclo (24→23, por fecha de entrega) a clientes con factura,
 * separado en pagado / vencido / en plazo / sin plazo, por vendedor y con el
 * detalle de sus clientes al abrir la fila. Sin PDV (cobra al contado) ni
 * BaseCamp (consumo interno). Datos: RPC `pagado_por_ciclo`, lógica en
 * lib/administracion/pagadoPorCiclo.ts.
 */

import { Fragment, useMemo, useState } from 'react'
import { ChevronRight, FileDown } from 'lucide-react'
import { ciclosDisponibles, impagoDe, resumirPagadoCiclo, totalDe, type FilaPagadoCiclo, type Montos } from '@/lib/administracion/pagadoPorCiclo'
import { inicioDeCiclo, finDeCiclo } from '@/lib/produccion/reglas'
import { C, Card } from './tema'

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const MESES_LARGO = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const fFecha = (iso: string) => `${Number(iso.slice(8, 10))} ${MESES[Number(iso.slice(5, 7)) - 1]}`
const nombreCiclo = (c: string) => `${MESES_LARGO[Number(c.slice(5, 7)) - 1]} ${c.slice(2, 4)}`

/** Colores por estado: lo pagado en verde, lo vencido en rojo (lo accionable). */
const COLOR = { pagada: C.green, vencida: C.red, en_plazo: C.sky, sin_plazo: C.stone } as const
const ETIQUETA = { pagada: 'Pagado', vencida: 'Vencido', en_plazo: 'En plazo', sin_plazo: 'Sin plazo' } as const

const th: React.CSSProperties = { padding: '9px 12px', fontSize: 10.5, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase', color: C.muted, textAlign: 'right', whiteSpace: 'nowrap', background: C.bg, borderBottom: `1px solid ${C.line}` }
const td: React.CSSProperties = { padding: '9px 12px', fontSize: 13, textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', borderBottom: `1px solid ${C.line}` }

/** Barra apilada pagado → vencido → en plazo → sin plazo. */
function Barra({ m, alto = 8 }: { m: Montos; alto?: number }) {
  const t = totalDe(m)
  return (
    <div style={{ display: 'flex', height: alto, borderRadius: 99, overflow: 'hidden', background: C.line }} aria-hidden>
      {t > 0 && (Object.keys(COLOR) as (keyof typeof COLOR)[]).map(k => m[k] > 0 && (
        <div key={k} style={{ width: `${(m[k] / t) * 100}%`, background: COLOR[k] }} />
      ))}
    </div>
  )
}

export default function PagadoPorVendedor({ filas, cicloEnCurso, hoyISO }: { filas: FilaPagadoCiclo[]; cicloEnCurso: string; hoyISO: string }) {
  const ciclos = useMemo(() => ciclosDisponibles(filas), [filas])
  // Por defecto el último ciclo CERRADO: el en curso todavía está entregando.
  const [ciclo, setCiclo] = useState(() => ciclos.find(c => c < cicloEnCurso) ?? ciclos[0] ?? cicloEnCurso)
  const [unidad, setUnidad] = useState<'litros' | 'neto'>('litros')
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set())

  const r = useMemo(() => resumirPagadoCiclo(filas, ciclo), [filas, ciclo])
  const fmt = (n: number) => unidad === 'litros' ? `${Math.round(n).toLocaleString('es-CL')} L` : '$' + Math.round(n).toLocaleString('es-CL')
  const fCelda = (n: number) => n > 0.5 ? fmt(n) : '—'
  const pct = (m: Montos) => totalDe(m) > 0 ? Math.round((m.pagada / totalDe(m)) * 100) : 0
  const tot = r.total[unidad]
  // Un vendedor sin nada en la unidad elegida (p. ej. una factura de servicio con 0 L)
  // sería una fila vacía con un 0% en rojo que no dice nada.
  const vendedores = r.vendedores.filter(v => totalDe(v[unidad]) >= 0.5)

  function alternar(v: string) {
    setAbiertos(prev => { const s = new Set(prev); if (s.has(v)) s.delete(v); else s.add(v); return s })
  }

  function csv() {
    const filasCsv = [['Ciclo', 'Vendedor', 'Cliente', 'Litros entregados', 'Litros pagados', 'Litros vencidos', 'Litros en plazo', 'Litros sin plazo', 'Neto entregado', 'Neto pagado', 'Neto vencido', 'Neto en plazo', 'Neto sin plazo'],
      ...r.vendedores.flatMap(v => v.detalle.map(c => [nombreCiclo(ciclo), v.vendedor, c.cliente,
        ...[totalDe(c.litros), c.litros.pagada, c.litros.vencida, c.litros.en_plazo, c.litros.sin_plazo].map(n => Math.round(n)),
        ...[totalDe(c.neto), c.neto.pagada, c.neto.vencida, c.neto.en_plazo, c.neto.sin_plazo].map(n => Math.round(n))]))]
    const txt = '﻿' + filasCsv.map(f => f.map(v => (typeof v === 'number' ? v : `"${String(v).replace(/"/g, '""')}"`)).join(';')).join('\n')
    const url = URL.createObjectURL(new Blob([txt], { type: 'text/csv;charset=utf-8' }))
    const el = document.createElement('a'); el.href = url; el.download = `pagado-por-vendedor-${ciclo.slice(0, 7)}-${hoyISO}.csv`; el.click(); URL.revokeObjectURL(url)
  }

  const chip = (activo: boolean): React.CSSProperties => ({
    padding: '6px 12px', borderRadius: 999, cursor: 'pointer', fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap',
    border: `1px solid ${activo ? C.blue : C.line}`, background: activo ? C.blueSoft : C.card, color: activo ? C.blue : C.muted,
  })

  return (
    <Card padding={0}>
      {/* ── Encabezado y controles ── */}
      <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0 }}>
            <h3 style={{ fontSize: 15, fontWeight: 800, color: C.text }}>¿Qué parte de lo entregado ya se pagó?</h3>
            <p style={{ fontSize: 12, color: C.muted, marginTop: 3, lineHeight: 1.5 }}>
              Entregado del {fFecha(inicioDeCiclo(ciclo))} al {fFecha(finDeCiclo(ciclo))}{ciclo === cicloEnCurso ? ' (ciclo en curso)' : ''}, facturado a clientes.
              Sin PDV (cobra al contado) ni BaseCamp. Vencido = la entrega más el plazo de la ficha ya pasó.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <div role="group" aria-label="Unidad" style={{ display: 'flex', gap: 4 }}>
              <button onClick={() => setUnidad('litros')} aria-pressed={unidad === 'litros'} style={chip(unidad === 'litros')}>Litros</button>
              <button onClick={() => setUnidad('neto')} aria-pressed={unidad === 'neto'} style={chip(unidad === 'neto')}>$ neto</button>
            </div>
            <button onClick={csv} style={{ whiteSpace: 'nowrap', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 9, border: `1px solid ${C.line}`, background: C.card, fontSize: 12, fontWeight: 700, cursor: 'pointer', color: C.text }}>
              <FileDown size={13} /> Excel (CSV)
            </button>
          </div>
        </div>

        <div role="group" aria-label="Ciclo" style={{ display: 'flex', gap: 6, overflowX: 'auto', scrollbarWidth: 'none' }}>
          {ciclos.map(c => (
            <button key={c} onClick={() => { setCiclo(c); setAbiertos(new Set()) }} aria-pressed={c === ciclo} style={chip(c === ciclo)}>
              {nombreCiclo(c)}{c === cicloEnCurso ? ' · en curso' : ''}
            </button>
          ))}
        </div>

        {/* ── Resumen del ciclo ── */}
        {totalDe(tot) > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <p style={{ fontSize: 14, color: C.text, lineHeight: 1.5 }}>
              De <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(totalDe(tot))}</strong> entregados,{' '}
              <strong style={{ color: C.green, fontVariantNumeric: 'tabular-nums' }}>{fmt(tot.pagada)} ya están pagados ({pct(tot)}%)</strong> y{' '}
              <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(impagoDe(tot))}</strong> no:{' '}
              <strong style={{ color: C.red, fontVariantNumeric: 'tabular-nums' }}>{fmt(tot.vencida)} vencidos</strong> en {r.total.clientesVencidos} {r.total.clientesVencidos === 1 ? 'cliente' : 'clientes'}.
            </p>
            <Barra m={tot} alto={10} />
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              {(Object.keys(COLOR) as (keyof typeof COLOR)[]).map(k => (
                <span key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: C.muted }}>
                  <span style={{ width: 9, height: 9, borderRadius: 3, background: COLOR[k] }} />
                  {ETIQUETA[k]} <span style={{ color: C.text, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmt(tot[k])}</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {vendedores.length === 0 ? (
        <p style={{ padding: '0 18px 18px', fontSize: 13, color: C.muted }}>No hay entregas facturadas en este ciclo.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', minWidth: 860, borderCollapse: 'collapse' }}>
            <thead><tr>
              <th style={{ ...th, textAlign: 'left' }}>Vendedor</th>
              <th style={th}>Clientes</th>
              <th style={th}>Entregado</th>
              <th style={{ ...th, color: C.green }}>Pagado</th>
              <th style={th}>Sin pagar</th>
              <th style={{ ...th, color: C.red }}>Vencido</th>
              <th style={th}>En plazo</th>
              <th style={th} title="El cliente no tiene plazo de pago en su ficha: no se puede saber si ya venció.">Sin plazo</th>
              <th style={{ ...th, width: 150 }}>% pagado</th>
            </tr></thead>
            <tbody>
              {vendedores.map(v => {
                const m = v[unidad]
                const abierto = abiertos.has(v.vendedor)
                return (
                  <Fragment key={v.vendedor}>
                    <tr onClick={() => alternar(v.vendedor)} style={{ cursor: 'pointer' }}>
                      <td style={{ ...td, textAlign: 'left' }}>
                        <button
                          onClick={e => { e.stopPropagation(); alternar(v.vendedor) }}
                          aria-expanded={abierto}
                          aria-label={`${abierto ? 'Ocultar' : 'Ver'} clientes de ${v.vendedor}`}
                          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontWeight: 800, fontSize: 13, color: C.text }}
                        >
                          <ChevronRight size={14} color={C.muted} style={{ transform: abierto ? 'rotate(90deg)' : 'none', transition: 'transform 160ms var(--adm-ease)' }} />
                          {v.vendedor}
                        </button>
                      </td>
                      <td style={{ ...td, color: C.muted }}>{v.clientes}</td>
                      <td style={{ ...td, fontWeight: 700 }}>{fCelda(totalDe(m))}</td>
                      <td style={{ ...td, color: C.green, fontWeight: 700 }}>{fCelda(m.pagada)}</td>
                      <td style={td}>{fCelda(impagoDe(m))}</td>
                      <td style={{ ...td, color: m.vencida > 0.5 ? C.red : C.muted, fontWeight: 800 }}>
                        {fCelda(m.vencida)}
                        {v.clientesVencidos > 0 && <span style={{ display: 'block', fontSize: 10.5, fontWeight: 600, color: C.muted }}>{v.clientesVencidos} {v.clientesVencidos === 1 ? 'cliente' : 'clientes'}</span>}
                      </td>
                      <td style={{ ...td, color: C.muted }}>{fCelda(m.en_plazo)}</td>
                      <td style={{ ...td, color: C.muted }}>{fCelda(m.sin_plazo)}</td>
                      <td style={td}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
                          <div style={{ width: 80 }}><Barra m={m} /></div>
                          <span style={{ fontWeight: 800, width: 36, color: pct(m) === 0 ? C.red : C.text }}>{pct(m)}%</span>
                        </div>
                      </td>
                    </tr>
                    {abierto && v.detalle.filter(c => totalDe(c[unidad]) >= 0.5).map(c => {
                      const mc = c[unidad]
                      return (
                        <tr key={c.cliente} style={{ background: C.bg }}>
                          <td style={{ ...td, textAlign: 'left', paddingLeft: 34, fontSize: 12.5, maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis' }} title={c.cliente}>{c.cliente}</td>
                          <td style={{ ...td, fontSize: 12, color: C.faint }}>{c.facturasImpagas > 0 ? `${c.facturasImpagas} ${c.facturasImpagas === 1 ? 'fact. impaga' : 'fact. impagas'}` : ''}</td>
                          <td style={{ ...td, fontSize: 12.5 }}>{fCelda(totalDe(mc))}</td>
                          <td style={{ ...td, fontSize: 12.5, color: C.green }}>{fCelda(mc.pagada)}</td>
                          <td style={{ ...td, fontSize: 12.5 }}>{fCelda(impagoDe(mc))}</td>
                          <td style={{ ...td, fontSize: 12.5, color: mc.vencida > 0.5 ? C.red : C.muted, fontWeight: 700 }}>{fCelda(mc.vencida)}</td>
                          <td style={{ ...td, fontSize: 12.5, color: C.muted }}>{fCelda(mc.en_plazo)}</td>
                          <td style={{ ...td, fontSize: 12.5, color: C.muted }}>{fCelda(mc.sin_plazo)}</td>
                          <td style={{ ...td, fontSize: 12.5 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
                              <div style={{ width: 80 }}><Barra m={mc} alto={6} /></div>
                              <span style={{ width: 36, color: C.muted }}>{pct(mc)}%</span>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </Fragment>
                )
              })}
              <tr>
                <td style={{ ...td, textAlign: 'left', fontWeight: 800, borderBottom: 'none' }}>Total</td>
                <td style={{ ...td, color: C.muted, borderBottom: 'none' }}>{r.total.clientes}</td>
                <td style={{ ...td, fontWeight: 800, borderBottom: 'none' }}>{fCelda(totalDe(tot))}</td>
                <td style={{ ...td, fontWeight: 800, color: C.green, borderBottom: 'none' }}>{fCelda(tot.pagada)}</td>
                <td style={{ ...td, fontWeight: 800, borderBottom: 'none' }}>{fCelda(impagoDe(tot))}</td>
                <td style={{ ...td, fontWeight: 800, color: C.red, borderBottom: 'none' }}>{fCelda(tot.vencida)}</td>
                <td style={{ ...td, fontWeight: 700, color: C.muted, borderBottom: 'none' }}>{fCelda(tot.en_plazo)}</td>
                <td style={{ ...td, fontWeight: 700, color: C.muted, borderBottom: 'none' }}>{fCelda(tot.sin_plazo)}</td>
                <td style={{ ...td, fontWeight: 800, borderBottom: 'none' }}>{pct(tot)}%</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}
