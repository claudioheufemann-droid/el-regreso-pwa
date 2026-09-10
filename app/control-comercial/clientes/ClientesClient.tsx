'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle, Beer, ChevronDown, ChevronRight, Eye, GlassWater, PieChart, RefreshCw,
  Sparkles, TrendingDown, TrendingUp, UserMinus, UserPlus, Users, Target,
} from 'lucide-react'
import CCHeader from '@/components/control-comercial/CCHeader'
import { Donut, Sparkline } from '@/components/control-comercial/charts'
import { KpiCompacto } from '@/components/control-comercial/cards'
import {
  CCPage, Card, CardHeader, EmptyState, ErrorState, FilaLeyenda, IconoCircular, NotaPie,
  PageSkeleton, formatCLP, formatLitros, formatNumero, formatPctPlano, TONO, type Tono,
} from '@/components/control-comercial/ui'

interface EstadoCliente { nombre_fantasia: string; dias_sin_compra: number; ciclo_promedio_dias: number | null; estado: string; territorio: string }
interface ClienteNuevo { nombre_fantasia: string; primera_compra: string; litros: number; monto: number; territorio: string }
interface Reactivado { nombre_fantasia: string; fecha_reactivacion: string; dias_inactivo: number; litros: number; territorio: string }
interface ClientePerdido { nombre_fantasia: string; ultima_compra: string; dias_sin_compra: number; territorio: string }
interface CrossRow { clasificacion: string; cantidad: number }
interface Oportunidad { nombre_fantasia: string; litros_cerveza: number; territorio: string }
interface FilaSerieCli { mes: number; clientes_activos: number; clientes_nuevos: number }

interface ClientesResponse {
  periodo: { nombre: string; inicio: string; fin: string; mes: number; anio: number }
  estadoResumen: Record<string, number>
  estados: EstadoCliente[]
  serie: FilaSerieCli[]
  anioAnterior: { nuevos: number; reactivados: number; perdidos: number; consolidacionPct: number | null }
  nuevos: ClienteNuevo[]
  consolidacion: { nuevos: number; consolidados: number; tasa_pct: number } | null
  reactivados: Reactivado[]
  perdidosPeriodo: ClientePerdido[]
  crossSelling: CrossRow[]
  oportunidadKombucha: Oportunidad[]
}

const ESTADOS = [
  { key: 'activo', label: 'Activos', color: 'var(--cc-green)' },
  { key: 'riesgo', label: 'En riesgo', color: '#E3B341' },
  { key: 'inactivo', label: 'Inactivos', color: '#EE7B32' },
  { key: 'perdido', label: 'Perdidos', color: 'var(--cc-red)' },
] as const

function variacion(actual: number, previo: number): number | null {
  if (!previo) return null
  return ((actual - previo) / previo) * 100
}

/** Cross-selling: la RPC devuelve la clasificación como texto libre del ERP. */
function iconoCross(clasificacion: string) {
  const l = clasificacion.toLowerCase()
  if (l.includes('ambas') || l.includes('las dos')) return { icon: Sparkles, tono: 'ok' as Tono }
  if (l.includes('kombucha')) return { icon: GlassWater, tono: 'info' as Tono }
  return { icon: Beer, tono: 'marca' as Tono }
}

export default function ClientesClient() {
  const [data, setData] = useState<ClientesResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [verLista, setVerLista] = useState<'nuevos' | 'reactivados' | 'perdidos' | null>(null)

  const cargar = useCallback(() => {
    let cancelado = false
    setLoading(true)
    setError(null)
    fetch('/api/control-comercial/clientes')
      .then(async r => {
        if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? 'Error al cargar Clientes')
        return r.json()
      })
      .then(d => { if (!cancelado) setData(d) })
      .catch(e => { if (!cancelado) setError(e instanceof Error ? e.message : 'Error al cargar') })
      .finally(() => { if (!cancelado) setLoading(false) })
    return () => { cancelado = true }
  }, [])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => cargar(), [cargar])

  const nuevos = data?.nuevos.length ?? 0
  const reactivados = data?.reactivados.length ?? 0
  const perdidos = data?.perdidosPeriodo.length ?? 0
  const crecimientoNeto = nuevos + reactivados - perdidos
  const netoPrevio = data ? data.anioAnterior.nuevos + data.anioAnterior.reactivados - data.anioAnterior.perdidos : 0

  const totalCartera = useMemo(
    () => ESTADOS.reduce((a, e) => a + (data?.estadoResumen[e.key] ?? 0), 0),
    [data],
  )

  const serieActivos = useMemo(() => (data?.serie ?? []).map(f => Number(f.clientes_activos)), [data])

  // "Frecuencia y riesgo": el estado ya viene calculado con la frecuencia real de
  // cada cliente (mv_clientes_estado), así que no se recalcula acá.
  const frecuencia = useMemo(() => {
    const estados = data?.estados ?? []
    // Umbral 0.25x (no 0.5x): con la mitad del ciclo, ~6 de cada 10 activos calificaban —
    // "muy por encima de lo normal" debe ser una señal poco común, no la mayoría de la cartera.
    const adelantados = estados.filter(e => e.estado === 'activo' && e.ciclo_promedio_dias !== null && e.dias_sin_compra <= e.ciclo_promedio_dias * 0.25).length
    return [
      { icon: TrendingUp, tono: 'ok' as Tono, titulo: 'Compras muy por encima del normal', sub: 'Activos que recompraron en menos de la mitad de su ciclo habitual.', valor: adelantados },
      { icon: AlertTriangle, tono: 'alerta' as Tono, titulo: 'Clientes en riesgo de inactividad', sub: 'Pasaron 1,5x su frecuencia habitual sin comprar.', valor: data?.estadoResumen.riesgo ?? 0 },
      { icon: Eye, tono: 'info' as Tono, titulo: 'En monitoreo', sub: 'Inactivos: 2x su frecuencia habitual sin comprar, todavía no perdidos.', valor: data?.estadoResumen.inactivo ?? 0 },
    ]
  }, [data])

  return (
    <CCPage>
      <CCHeader
        title="Clientes"
        subtitle={data ? `${data.periodo.nombre} · cartera y ciclo de vida` : 'Cargando…'}
        subtitleTag={data ? 'En curso' : undefined}
      />

      {loading && <PageSkeleton />}
      {!loading && error && <ErrorState mensaje={error} onReintentar={cargar} />}

      {!loading && !error && data && (
        <div className="cc-enter" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Card padding="14px 8px">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 2 }}>
              <KpiCompacto icon={UserPlus} tono="ok" label="Clientes nuevos" valor={formatNumero(nuevos)} deltaPct={variacion(nuevos, data.anioAnterior.nuevos)} />
              <KpiCompacto
                icon={Target} tono="marca" label="Consolidación"
                valor={data.consolidacion ? formatPctPlano(data.consolidacion.tasa_pct) : '—'}
                deltaPct={data.consolidacion && data.anioAnterior.consolidacionPct !== null
                  ? data.consolidacion.tasa_pct - data.anioAnterior.consolidacionPct
                  : null}
                deltaSufijo="pp"
              />
              <KpiCompacto icon={RefreshCw} tono="ok" label="Reactivados" valor={formatNumero(reactivados)} deltaPct={variacion(reactivados, data.anioAnterior.reactivados)} />
              <KpiCompacto icon={UserMinus} tono="critico" label="Perdidos" valor={formatNumero(perdidos)} deltaPct={variacion(perdidos, data.anioAnterior.perdidos)} subirEsBueno={false} />
              <KpiCompacto
                icon={crecimientoNeto >= 0 ? TrendingUp : TrendingDown}
                tono={crecimientoNeto >= 0 ? 'ok' : 'critico'}
                label="Crecim. neto"
                valor={`${crecimientoNeto > 0 ? '+' : ''}${formatNumero(crecimientoNeto)}`}
                notaDelta={`${netoPrevio > 0 ? '+' : ''}${netoPrevio} año ant.`}
              />
            </div>
            {serieActivos.length >= 2 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14, padding: '10px 8px 0', borderTop: '1px solid var(--cc-line-soft)' }}>
                <span style={{ fontSize: 11.5, color: 'var(--cc-ink-3)', fontWeight: 600, flex: 1, minWidth: 0 }}>
                  Clientes activos por período · {data.periodo.anio}
                </span>
                <Sparkline valores={serieActivos} color="var(--cc-gold)" ancho={92} alto={26} />
                <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--cc-ink)' }}>
                  {formatNumero(serieActivos[serieActivos.length - 1])}
                </span>
              </div>
            )}
          </Card>

          <Card>
            <CardHeader
              icon={PieChart}
              titulo="Estado de la cartera"
              accion={
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, fontWeight: 700, color: 'var(--cc-ink-3)' }}>
                  Por N° de clientes <ChevronDown size={13} />
                </span>
              }
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0, flexWrap: 'wrap' }}>
              <Donut
                size={124}
                grosor={22}
                centroTitulo="Total de clientes"
                centroValor={formatNumero(totalCartera)}
                segmentos={ESTADOS.map(e => ({ label: e.label, valor: data.estadoResumen[e.key] ?? 0, color: e.color }))}
              />
              <div style={{ flex: '1 1 170px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 9 }}>
                {ESTADOS.map(e => {
                  const v = data.estadoResumen[e.key] ?? 0
                  return (
                    <FilaLeyenda
                      key={e.key}
                      color={e.color}
                      label={e.label}
                      valor={formatNumero(v)}
                      secundario={totalCartera ? `${Math.round((v / totalCartera) * 100)}%` : '—'}
                    />
                  )
                })}
              </div>
            </div>
            <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 12, background: 'var(--cc-card-2)' }}>
              <p style={{ fontSize: 11.5, color: 'var(--cc-ink-2)', lineHeight: 1.5 }}>
                {totalCartera > 0
                  ? `${Math.round(((data.estadoResumen.activo ?? 0) / totalCartera) * 100)}% de la cartera está activa. Enfoca acciones en los ${formatNumero(data.estadoResumen.riesgo ?? 0)} clientes en riesgo.`
                  : 'Sin clientes en la cartera todavía.'}
              </p>
            </div>
          </Card>

          <Card>
            <CardHeader icon={AlertTriangle} titulo="Frecuencia y riesgo" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {frecuencia.map(f => (
                <div
                  key={f.titulo}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 11, padding: '11px 12px',
                    borderRadius: 14, background: 'var(--cc-card-2)', minWidth: 0,
                  }}
                >
                  <IconoCircular icon={f.icon} tono={f.tono} size={34} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 800, color: 'var(--cc-ink)', lineHeight: 1.3 }}>{f.titulo}</p>
                    <p style={{ fontSize: 11.5, color: 'var(--cc-ink-3)', lineHeight: 1.4, marginTop: 1 }}>{f.sub}</p>
                  </div>
                  <span
                    style={{
                      flexShrink: 0, minWidth: 40, textAlign: 'center', padding: '5px 9px', borderRadius: 999,
                      background: TONO[f.tono].bg, color: TONO[f.tono].fg, fontSize: 13, fontWeight: 800,
                    }}
                  >
                    {formatNumero(f.valor)}
                  </span>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <CardHeader icon={Sparkles} titulo="Oportunidades (Cross-sell)" />
            {data.crossSelling.length === 0 ? (
              <EmptyState icon={Sparkles} titulo="Sin datos de cross-selling" />
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(3, data.crossSelling.length)}, 1fr)`, gap: 8 }}>
                {data.crossSelling.slice(0, 3).map(c => {
                  const { icon, tono } = iconoCross(c.clasificacion)
                  return (
                    <div
                      key={c.clasificacion}
                      style={{
                        padding: '12px 10px', borderRadius: 14, background: 'var(--cc-card-2)',
                        display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0,
                      }}
                    >
                      <IconoCircular icon={icon} tono={tono} size={32} />
                      <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--cc-ink-2)', lineHeight: 1.3 }}>{c.clasificacion}</span>
                      <span style={{ fontSize: 19, fontWeight: 900, color: 'var(--cc-ink)', letterSpacing: '-0.6px', lineHeight: 1 }}>
                        {formatNumero(c.cantidad)}
                      </span>
                      <span style={{ fontSize: 10.5, color: 'var(--cc-ink-3)' }}>Clientes</span>
                    </div>
                  )
                })}
              </div>
            )}

            {data.oportunidadKombucha.length > 0 && (
              <div style={{ marginTop: 12, borderTop: '1px solid var(--cc-line-soft)', paddingTop: 12 }}>
                <p style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--cc-ink)', marginBottom: 8 }}>
                  {data.oportunidadKombucha.length} clientes activos de cerveza sin Kombucha
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 190, overflowY: 'auto' }}>
                  {data.oportunidadKombucha.map(o => (
                    <div key={o.nombre_fantasia} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, minWidth: 0, flexShrink: 0 }}>
                      <span style={{ fontSize: 12.5, color: 'var(--cc-ink-2)', fontWeight: 600, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {o.nombre_fantasia}
                      </span>
                      <span style={{ fontSize: 12, color: 'var(--cc-ink-3)', flexShrink: 0 }}>{formatLitros(o.litros_cerveza)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>

          <Card padding={0}>
            <div style={{ padding: '16px 16px 4px' }}>
              <CardHeader icon={Users} titulo={`Movimiento del período — ${data.periodo.nombre}`} />
            </div>
            {([
              { key: 'nuevos' as const, label: 'Clientes nuevos', valor: nuevos, tono: 'ok' as Tono, icon: UserPlus },
              { key: 'reactivados' as const, label: 'Reactivados', valor: reactivados, tono: 'ok' as Tono, icon: RefreshCw },
              { key: 'perdidos' as const, label: 'Perdidos (cruzaron 90 días)', valor: perdidos, tono: 'critico' as Tono, icon: UserMinus },
            ]).map(sec => (
              <div key={sec.key} style={{ borderTop: '1px solid var(--cc-line-soft)' }}>
                <button
                  onClick={() => setVerLista(v => (v === sec.key ? null : sec.key))}
                  className="cc-tap"
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 11, padding: '13px 16px',
                    background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left',
                  }}
                >
                  <IconoCircular icon={sec.icon} tono={sec.tono} size={32} />
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 700, color: 'var(--cc-ink)' }}>{sec.label}</span>
                  <span style={{ fontSize: 15, fontWeight: 800, color: TONO[sec.tono].fg }}>{formatNumero(sec.valor)}</span>
                  <ChevronRight
                    size={17} color="var(--cc-ink-3)"
                    style={{ transform: verLista === sec.key ? 'rotate(90deg)' : undefined, transition: 'transform 0.2s' }}
                  />
                </button>

                {verLista === sec.key && (
                  <div style={{ padding: '0 16px 14px', display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 280, overflowY: 'auto' }}>
                    {sec.key === 'nuevos' && data.nuevos.map(n => (
                      <FilaCliente key={n.nombre_fantasia} nombre={n.nombre_fantasia} sub={n.territorio} valor={formatCLP(n.monto)} />
                    ))}
                    {sec.key === 'reactivados' && data.reactivados.map(r => (
                      <FilaCliente key={r.nombre_fantasia} nombre={r.nombre_fantasia} sub={`${r.territorio} · llevaba ${r.dias_inactivo} días`} valor={formatLitros(r.litros)} tono="ok" />
                    ))}
                    {sec.key === 'perdidos' && data.perdidosPeriodo.map(p => (
                      <FilaCliente key={p.nombre_fantasia} nombre={p.nombre_fantasia} sub={p.territorio} valor={`${p.dias_sin_compra} d`} tono="critico" />
                    ))}
                    {((sec.key === 'nuevos' && nuevos === 0) || (sec.key === 'reactivados' && reactivados === 0) || (sec.key === 'perdidos' && perdidos === 0)) && (
                      <p style={{ fontSize: 12.5, color: 'var(--cc-ink-3)', padding: '8px 0' }}>Sin movimientos en este período.</p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </Card>

          <NotaPie>
            Con 3 o más pedidos de historial el estado usa la frecuencia real del cliente (1,5x = en riesgo,
            2x = inactivo). Sin historial suficiente se aplica el corte fijo de 45/60/89 días. 90+ días sin
            comprar es cliente perdido siempre. El estado de la cartera es la foto acumulada de hoy, no del período.
          </NotaPie>
        </div>
      )}
    </CCPage>
  )
}

function FilaCliente({ nombre, sub, valor, tono }: { nombre: string; sub: string; valor: string; tono?: Tono }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, minWidth: 0, flexShrink: 0 }}>
      <div style={{ minWidth: 0 }}>
        <p style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--cc-ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nombre}</p>
        <p style={{ fontSize: 11, color: 'var(--cc-ink-3)' }}>{sub}</p>
      </div>
      <span style={{ fontSize: 12.5, fontWeight: 800, color: tono ? TONO[tono].fg : 'var(--cc-ink-2)', flexShrink: 0 }}>{valor}</span>
    </div>
  )
}
