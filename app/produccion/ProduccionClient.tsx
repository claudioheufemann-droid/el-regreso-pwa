'use client'

import { useMemo, useState } from 'react'
import { AlertTriangle, Info, TrendingUp } from 'lucide-react'
import AppHeader from '@/components/ui/AppHeader'
import type { SerieForecast, ValidacionSerie, CalidadItem, PuntoForecast } from './page'

const C = {
  bg: '#0A0A0D', card: '#131318', card2: '#1A1A21', border: 'rgba(255,255,255,0.08)',
  text: '#F4EEDF', muted: 'rgba(255,255,255,0.55)', faint: 'rgba(255,255,255,0.32)',
  accent: '#A855F7', accentSoft: 'rgba(168,85,247,0.14)',
  green: '#4ADE80', amber: '#F0B429', red: '#F87171',
}

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
function fMes(iso: string, corto = false) {
  const [y, m] = iso.split('-').map(Number)
  return corto ? `${MESES[m - 1]} '${String(y).slice(2)}` : `${MESES[m - 1]} ${y}`
}
const fNum = (n: number) => Math.round(n).toLocaleString('es-CL')

const ENVASE_LABEL: Record<string, string> = {
  barril_30: 'Barril 30L', barril_50: 'Barril 50L',
  lata_354: 'Lata 354ml', lata_473: 'Lata 473ml', otros: 'Otros formatos',
}

type Vista = 'general' | 'producto' | 'envase'

export default function ProduccionClient({ series, validacion, calidad, ultimaCorrida }: {
  series: SerieForecast[]; validacion: ValidacionSerie[]; calidad: CalidadItem[]; ultimaCorrida: string | null
}) {
  const [vista, setVista] = useState<Vista>('general')
  const [clave, setClave] = useState<string | null>(null)

  const serieGeneral = series.find(s => s.nivel === 'general')
  const productos = series.filter(s => s.nivel === 'producto')
  const envases = series.filter(s => s.nivel === 'envase')

  const opcionesProducto = useMemo(() =>
    [...productos].sort((a, b) => sumaHistorica(b) - sumaHistorica(a)).map(s => s.clave!),
    [productos])
  const opcionesEnvase = useMemo(() => {
    const orden = ['barril_30', 'barril_50', 'lata_354', 'lata_473', 'otros']
    return envases.map(s => s.clave!).sort((a, b) => orden.indexOf(a) - orden.indexOf(b))
  }, [envases])

  const claveActual = vista === 'general' ? null : (clave ?? (vista === 'producto' ? opcionesProducto[0] : opcionesEnvase[0]) ?? null)
  const serieActual = vista === 'general'
    ? serieGeneral
    : series.find(s => s.nivel === vista && s.clave === claveActual)

  const etiquetaActual = vista === 'general' ? 'Total compañía' : vista === 'envase' ? ENVASE_LABEL[claveActual ?? ''] ?? claveActual : claveActual

  const validacionActual = validacion.find(v => v.nivel === vista && v.clave === (vista === 'general' ? null : claveActual))

  const advertencias = calidad.filter(c => c.severidad === 'advertencia')

  return (
    <div style={{ background: C.bg, minHeight: '100vh', color: C.text }}>
      <div style={{ maxWidth: 780, margin: '0 auto', padding: '0 16px 100px' }}>
        <AppHeader eyebrow="Producción" title="Forecast de demanda" />

        <p style={{ fontSize: 12.5, color: C.muted, marginTop: -8, marginBottom: 18 }}>
          Proyección a 8 meses con Prophet, sólo ventas reales (sin clientes internos ni mermas).
          {ultimaCorrida && <> Última corrida: <b style={{ color: C.text }}>{ultimaCorrida.slice(0, 10)}</b>.</>}
        </p>

        {!serieGeneral && (
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 20, textAlign: 'center', color: C.muted, fontSize: 13.5 }}>
            Todavía no corrió el modelo. Se genera automáticamente cada semana — o corré el script manualmente (<code>scripts/forecast/generar_forecast.py</code>).
          </div>
        )}

        {serieGeneral && (
          <>
            {/* ── Selector de vista ── */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
              {(['general', 'producto', 'envase'] as Vista[]).map(v => (
                <button key={v} onClick={() => { setVista(v); setClave(null) }} style={{
                  flex: 1, padding: '10px 8px', borderRadius: 10, border: `1px solid ${vista === v ? C.accent : C.border}`,
                  background: vista === v ? C.accentSoft : C.card, color: vista === v ? C.accent : C.muted,
                  fontSize: 13, fontWeight: 700, cursor: 'pointer',
                }}>
                  {v === 'general' ? 'General' : v === 'producto' ? 'Por producto' : 'Por envase'}
                </button>
              ))}
            </div>

            {/* ── Selector secundario ── */}
            {vista !== 'general' && (
              <div className="scroll-x-mobile" style={{ display: 'flex', gap: 6, marginBottom: 16, overflowX: 'auto', paddingBottom: 4 }}>
                {(vista === 'producto' ? opcionesProducto : opcionesEnvase).map(op => {
                  const activo = op === claveActual
                  const label = vista === 'envase' ? (ENVASE_LABEL[op] ?? op) : op
                  return (
                    <button key={op} onClick={() => setClave(op)} style={{
                      flexShrink: 0, padding: '7px 13px', borderRadius: 999,
                      border: `1px solid ${activo ? C.accent : C.border}`,
                      background: activo ? C.accentSoft : 'transparent',
                      color: activo ? C.accent : C.muted, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
                    }}>
                      {label}
                    </button>
                  )
                })}
              </div>
            )}

            {serieActual ? (
              <>
                <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '18px 16px 10px', marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
                    <p style={{ fontSize: 14, fontWeight: 800, color: C.text }}>{etiquetaActual}</p>
                    {validacionActual && <ChipConfiabilidad mape={validacionActual.mape} />}
                  </div>
                  <Chart puntos={serieActual.puntos} />
                  <Leyenda />
                </div>

                <Tabla puntos={serieActual.puntos} />

                {validacionActual && (
                  <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16, marginTop: 16 }}>
                    <p style={{ fontSize: 12.5, fontWeight: 800, color: C.text, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <TrendingUp size={14} color={C.accent} /> Validación del modelo
                    </p>
                    <p style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.5 }}>
                      Se entrenó sin los últimos {validacionActual.mesesEvaluados} meses y se compararon esos meses contra lo que realmente se vendió.
                      Error promedio: <b style={{ color: C.text }}>{fNum(validacionActual.mae ?? 0)} L/mes</b>
                      {validacionActual.mape != null && <> (<b style={{ color: C.text }}>{validacionActual.mape.toFixed(0)}%</b> de desvío)</>}
                      , sobre {validacionActual.mesesHistorial} meses de historial.
                    </p>
                  </div>
                )}
              </>
            ) : (
              <p style={{ color: C.muted, fontSize: 13, textAlign: 'center', padding: 20 }}>Sin datos para esta serie.</p>
            )}

            {/* ── Validación general (todas las series) ── */}
            <TablaValidacion validacion={validacion} />

            {/* ── Calidad de datos ── */}
            {calidad.length > 0 && (
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16, marginTop: 16 }}>
                <p style={{ fontSize: 12.5, fontWeight: 800, color: C.text, marginBottom: 10 }}>
                  Calidad de datos {advertencias.length > 0 && <span style={{ color: C.amber }}>· {advertencias.length} advertencia{advertencias.length === 1 ? '' : 's'}</span>}
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {calidad.map((c, i) => (
                    <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                      {c.severidad === 'advertencia'
                        ? <AlertTriangle size={14} color={C.amber} style={{ flexShrink: 0, marginTop: 2 }} />
                        : <Info size={14} color={C.faint} style={{ flexShrink: 0, marginTop: 2 }} />}
                      <p style={{ fontSize: 12, color: C.muted, lineHeight: 1.5 }}>{c.detalle}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function sumaHistorica(s: SerieForecast) {
  return s.puntos.filter(p => p.tipo === 'historico').reduce((acc, p) => acc + p.litros, 0)
}

function ChipConfiabilidad({ mape }: { mape: number | null }) {
  if (mape == null) return null
  const color = mape < 15 ? C.green : mape < 30 ? C.amber : C.red
  const label = mape < 15 ? 'Confiable' : mape < 30 ? 'Aproximado' : 'Poco confiable'
  return (
    <span style={{ fontSize: 10.5, fontWeight: 700, color, background: `${color}22`, borderRadius: 999, padding: '3px 9px' }}>
      {label} · {mape.toFixed(0)}% desvío
    </span>
  )
}

function Leyenda() {
  return (
    <div style={{ display: 'flex', gap: 16, marginTop: 6, marginBottom: 4 }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: C.muted }}>
        <span style={{ width: 14, height: 2, background: C.text, display: 'inline-block' }} /> Histórico
      </span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: C.muted }}>
        <svg width="14" height="8"><line x1="0" y1="4" x2="14" y2="4" stroke={C.accent} strokeWidth="2" strokeDasharray="3,2" /></svg> Proyección
      </span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: C.muted }}>
        <span style={{ width: 14, height: 8, background: C.accentSoft, borderRadius: 2, display: 'inline-block' }} /> Rango estimado
      </span>
    </div>
  )
}

/* ── Gráfico de líneas (SVG a mano, sin librería — misma convención que
   app/flota/kpis/KpisClient.tsx) ── */
function Chart({ puntos }: { puntos: PuntoForecast[] }) {
  const W = 680, H = 220, PAD_L = 44, PAD_R = 10, PAD_T = 14, PAD_B = 24
  if (puntos.length < 2) {
    return <div style={{ height: H, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.faint, fontSize: 12.5 }}>No hay suficientes puntos para graficar.</div>
  }

  const n = puntos.length
  const x = (i: number) => PAD_L + (i / (n - 1)) * (W - PAD_L - PAD_R)

  const valores = puntos.flatMap(p => [p.litros, p.litrosMin ?? p.litros, p.litrosMax ?? p.litros])
  const maxY = Math.max(...valores) * 1.12 || 1
  const y = (v: number) => H - PAD_B - (v / maxY) * (H - PAD_T - PAD_B)

  const idxCorte = puntos.findIndex(p => p.tipo === 'forecast')
  const historicos = idxCorte === -1 ? puntos.map((p, i) => [i, p] as const) : puntos.slice(0, idxCorte).map((p, i) => [i, p] as const)
  // La línea de proyección arranca en el último punto histórico (idxCorte-1)
  // para que las dos líneas se junten sin cortarse en el gráfico.
  const inicioProy = idxCorte <= 0 ? idxCorte : idxCorte - 1
  const proyectados = idxCorte === -1 ? [] : puntos.slice(inicioProy).map((p, i) => [inicioProy + i, p] as const)

  const pathHist = historicos.map(([i, p], k) => `${k === 0 ? 'M' : 'L'}${x(i)},${y(p.litros)}`).join(' ')
  const pathProy = proyectados.map(([i, p], k) => `${k === 0 ? 'M' : 'L'}${x(i)},${y(p.litros)}`).join(' ')
  const bandaArriba = proyectados.map(([i, p]) => `${x(i)},${y(p.litrosMax ?? p.litros)}`)
  const bandaAbajo = [...proyectados].reverse().map(([i, p]) => `${x(i)},${y(p.litrosMin ?? p.litros)}`)
  const bandaPath = proyectados.length > 0 ? `M${bandaArriba.join(' L')} L${bandaAbajo.join(' L')} Z` : ''

  // Grillas horizontales + etiquetas de mes cada ~2 puntos para no amontonar
  const gridY = [0.25, 0.5, 0.75, 1].map(f => f * maxY)
  const pasoEtiqueta = Math.ceil(n / 6)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="Proyección de litros por mes">
      {gridY.map(v => (
        <g key={v}>
          <line x1={PAD_L} y1={y(v)} x2={W - PAD_R} y2={y(v)} stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
          <text x={PAD_L - 6} y={y(v) + 3} textAnchor="end" fontSize="9" fill={C.faint}>{fNum(v)}</text>
        </g>
      ))}
      {bandaPath && <path d={bandaPath} fill={C.accent} fillOpacity={0.15} stroke="none" />}
      <path d={pathHist} fill="none" stroke={C.text} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      {pathProy && <path d={pathProy} fill="none" stroke={C.accent} strokeWidth={2} strokeDasharray="5,4" strokeLinecap="round" strokeLinejoin="round" />}
      {puntos.map((p, i) => (i % pasoEtiqueta === 0 || i === n - 1) && (
        <text key={i} x={x(i)} y={H - 6} textAnchor="middle" fontSize="9" fill={C.faint}>{fMes(p.mes, true)}</text>
      ))}
      {idxCorte > 0 && <line x1={x(idxCorte)} y1={PAD_T} x2={x(idxCorte)} y2={H - PAD_B} stroke="rgba(255,255,255,0.15)" strokeWidth={1} strokeDasharray="2,3" />}
    </svg>
  )
}

function Tabla({ puntos }: { puntos: PuntoForecast[] }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
      <div style={{ overflowX: 'auto' }}>
        <div style={{ minWidth: 460 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr 1.4fr', padding: '10px 14px', borderBottom: `1px solid ${C.border}`, fontSize: 10.5, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            <span>Mes</span><span>Tipo</span><span style={{ textAlign: 'right' }}>Litros</span><span style={{ textAlign: 'right' }}>Rango estimado</span>
          </div>
          {puntos.map((p, i) => (
            <div key={i} style={{
              display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr 1.4fr', padding: '9px 14px',
              borderBottom: i === puntos.length - 1 ? 'none' : `1px solid ${C.border}`, fontSize: 12.5,
            }}>
              <span style={{ color: C.text, fontWeight: 600 }}>{fMes(p.mes)}</span>
              <span style={{ color: p.tipo === 'forecast' ? C.accent : C.muted, fontWeight: 600 }}>{p.tipo === 'forecast' ? 'Proyectado' : 'Real'}</span>
              <span style={{ textAlign: 'right', color: C.text, fontVariantNumeric: 'tabular-nums' }}>{fNum(p.litros)} L</span>
              <span style={{ textAlign: 'right', color: C.faint, fontVariantNumeric: 'tabular-nums' }}>
                {p.litrosMin != null && p.litrosMax != null ? `${fNum(p.litrosMin)}–${fNum(p.litrosMax)} L` : '—'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function TablaValidacion({ validacion }: { validacion: ValidacionSerie[] }) {
  if (validacion.length === 0) return null
  const filas = [...validacion].sort((a, b) => (a.mape ?? 999) - (b.mape ?? 999))
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, marginTop: 16, overflow: 'hidden' }}>
      <p style={{ fontSize: 12.5, fontWeight: 800, color: C.text, padding: '14px 16px 10px' }}>Confiabilidad por serie</p>
      <div style={{ overflowX: 'auto' }}>
        <div style={{ minWidth: 460 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', padding: '8px 16px', borderTop: `1px solid ${C.border}`, fontSize: 10.5, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            <span>Serie</span><span style={{ textAlign: 'right' }}>Desvío</span><span style={{ textAlign: 'right' }}>Error</span><span style={{ textAlign: 'right' }}>Historial</span>
          </div>
          {filas.map((v, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', padding: '8px 16px', borderTop: `1px solid ${C.border}`, fontSize: 12 }}>
              <span style={{ color: C.text }}>{v.nivel === 'general' ? 'Total compañía' : (ENVASE_LABEL[v.clave ?? ''] ?? v.clave)}</span>
              <span style={{ textAlign: 'right', color: v.mape != null && v.mape < 15 ? C.green : v.mape != null && v.mape < 30 ? C.amber : C.red, fontVariantNumeric: 'tabular-nums' }}>
                {v.mape != null ? `${v.mape.toFixed(0)}%` : '—'}
              </span>
              <span style={{ textAlign: 'right', color: C.muted, fontVariantNumeric: 'tabular-nums' }}>{v.mae != null ? `${fNum(v.mae)} L` : '—'}</span>
              <span style={{ textAlign: 'right', color: C.faint, fontVariantNumeric: 'tabular-nums' }}>{v.mesesHistorial} m.</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
