'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Award, Boxes, DollarSign, TrendingUp, UserPlus } from 'lucide-react'
import CCHeader from '@/components/control-comercial/CCHeader'
import { PerformanceCard } from '@/components/control-comercial/cards'
import {
  CCPage, ErrorState, FilaLeyenda, PageSkeleton, ProgressBar, SegmentedControl,
  formatCLPCompacto, formatLitros, formatNumero, formatPctPlano, type Tono,
} from '@/components/control-comercial/ui'

interface FilaEquipo {
  territorio: string; tipo: string; responsable: string | null
  venta_clp: number; litros: number
  clientes_activos: number; clientes_nuevos: number; clientes_perdidos: number
  deuda_vencida: number; barriles_criticos: number; barriles_total: number
  serieVenta: number[]
  crecimientoYoyPct: number | null; cumplimientoMetaPct: number | null
  retencionPct: number | null; penetracionMulticategoriaPct: number | null
}
interface EquipoResponse { periodo: { nombre: string }; filas: FilaEquipo[]; puedeVerMargen: boolean }

type Tab = 'venta' | 'meta' | 'crecimiento' | 'clientes' | 'cobranza' | 'barriles'

const TABS: { value: Tab; label: string }[] = [
  { value: 'venta', label: 'Venta $' },
  { value: 'meta', label: 'Meta' },
  { value: 'crecimiento', label: 'Crecimiento' },
  { value: 'clientes', label: 'Clientes' },
  { value: 'cobranza', label: 'Cobranza' },
  { value: 'barriles', label: 'Barriles' },
]

function etiquetaDesempeno(f: FilaEquipo): { texto: string; tono: Tono } {
  if (f.venta_clp <= 0) return { texto: 'Sin ventas', tono: 'neutral' }
  if (f.cumplimientoMetaPct !== null && f.cumplimientoMetaPct < 75) return { texto: 'Atención', tono: 'critico' }
  if (f.crecimientoYoyPct !== null && f.crecimientoYoyPct > 25) return { texto: 'Fuerte crecimiento', tono: 'ok' }
  if (f.cumplimientoMetaPct !== null && f.cumplimientoMetaPct >= 100) return { texto: 'Líder en venta', tono: 'marca' }
  if (f.crecimientoYoyPct !== null && f.crecimientoYoyPct < 0) return { texto: 'En desarrollo', tono: 'alerta' }
  return { texto: 'Desempeño sólido', tono: 'info' }
}

function ordenPorTab(filas: FilaEquipo[], tab: Tab): FilaEquipo[] {
  const copia = [...filas]
  const porNulo = (v: number | null) => v === null ? -Infinity : v
  switch (tab) {
    case 'meta': return copia.sort((a, b) => porNulo(b.cumplimientoMetaPct) - porNulo(a.cumplimientoMetaPct))
    case 'crecimiento': return copia.sort((a, b) => porNulo(b.crecimientoYoyPct) - porNulo(a.crecimientoYoyPct))
    case 'clientes': return copia.sort((a, b) => b.clientes_activos - a.clientes_activos)
    case 'cobranza': return copia.sort((a, b) => b.deuda_vencida - a.deuda_vencida)
    case 'barriles': return copia.sort((a, b) => b.barriles_criticos - a.barriles_criticos)
    default: return copia.sort((a, b) => b.venta_clp - a.venta_clp)
  }
}

export default function EquipoClient() {
  const [data, setData] = useState<EquipoResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('venta')
  const [expandido, setExpandido] = useState<string | null>(null)

  const cargar = useCallback(() => {
    let cancelado = false
    setLoading(true)
    setError(null)
    fetch('/api/control-comercial/equipo')
      .then(async r => {
        if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? 'Error al cargar Equipo')
        return r.json()
      })
      .then(d => { if (!cancelado) setData(d) })
      .catch(e => { if (!cancelado) setError(e instanceof Error ? e.message : 'Error al cargar') })
      .finally(() => { if (!cancelado) setLoading(false) })
    return () => { cancelado = true }
  }, [])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => cargar(), [cargar])

  const filas = useMemo(() => data ? ordenPorTab(data.filas, tab) : [], [data, tab])

  return (
    <CCPage>
      <CCHeader title="Equipo" subtitle={data ? `${data.periodo.nombre} · performance comercial por territorio` : 'Cargando…'} />

      <SegmentedControl variant="pill" value={tab} onChange={setTab} options={TABS} />

      {loading && <PageSkeleton />}
      {!loading && error && <ErrorState mensaje={error} onReintentar={cargar} />}

      {!loading && !error && data && (
        <div
          className="cc-enter"
          style={{
            padding: '11px 14px', borderRadius: 15, background: 'var(--cc-gold-soft)',
            display: 'flex', gap: 10, alignItems: 'flex-start',
          }}
        >
          <TrendingUp size={16} color="var(--cc-gold-deep)" style={{ flexShrink: 0, marginTop: 1 }} />
          <p style={{ fontSize: 12, color: 'var(--cc-gold-deep)', lineHeight: 1.5 }}>
            <strong>Comparación multidimensional</strong> — no es un ranking por litros. Las métricas
            combinan venta, cumplimiento, crecimiento, clientes, cobranza y criticidad.
          </p>
        </div>
      )}

      {!loading && !error && data && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filas.map((f, i) => {
            const desempeno = etiquetaDesempeno(f)
            return (
              <PerformanceCard
                key={f.territorio}
                posicion={i + 1}
                titulo={f.territorio}
                responsable={f.responsable}
                badge={desempeno.texto}
                badgeTono={desempeno.tono}
                badgeIcon={desempeno.tono === 'marca' ? Award : desempeno.tono === 'ok' ? TrendingUp : undefined}
                serie={f.serieVenta}
                serieColor={f.crecimientoYoyPct !== null && f.crecimientoYoyPct < 0 ? 'var(--cc-red)' : 'var(--cc-green)'}
                metricas={[
                  { label: 'Venta $', valor: formatCLPCompacto(f.venta_clp) },
                  { label: 'Cumpl. meta', valor: f.cumplimientoMetaPct !== null ? formatPctPlano(f.cumplimientoMetaPct) : '—', tono: f.cumplimientoMetaPct === null ? undefined : f.cumplimientoMetaPct >= 100 ? 'ok' : f.cumplimientoMetaPct >= 80 ? 'alerta' : 'critico' },
                  { label: 'Crec. YoY', valor: f.crecimientoYoyPct !== null ? formatPctPlano(f.crecimientoYoyPct) : '—', tono: f.crecimientoYoyPct === null ? undefined : f.crecimientoYoyPct >= 0 ? 'ok' : 'critico' },
                ]}
                miniMetricas={[
                  { icon: UserPlus, label: 'Nuevos clientes', valor: formatNumero(f.clientes_nuevos) },
                  { icon: DollarSign, label: 'Deuda vencida', valor: formatCLPCompacto(f.deuda_vencida), tono: f.deuda_vencida > 0 ? 'critico' : 'ok' },
                  { icon: Boxes, label: 'Barriles críticos', valor: formatNumero(f.barriles_criticos), tono: f.barriles_criticos > 0 ? 'critico' : 'ok' },
                ]}
                expandible
                expandido={expandido === f.territorio}
                onToggle={() => setExpandido(v => v === f.territorio ? null : f.territorio)}
                contenidoExpandido={
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <FilaLeyenda color="var(--cc-gold)" label="Litros del período" valor={formatLitros(f.litros)} />
                      <FilaLeyenda color="var(--cc-green)" label="Clientes activos" valor={formatNumero(f.clientes_activos)} />
                      <FilaLeyenda color="var(--cc-red)" label="Clientes perdidos" valor={formatNumero(f.clientes_perdidos)} />
                      {f.retencionPct !== null && <FilaLeyenda color="var(--cc-blue)" label="Retención de cartera" valor={formatPctPlano(f.retencionPct)} />}
                      {f.penetracionMulticategoriaPct !== null && <FilaLeyenda color="var(--cc-amber)" label="Multicategoría (cerveza + kombucha)" valor={formatPctPlano(f.penetracionMulticategoriaPct)} />}
                      <FilaLeyenda color="var(--cc-neutral)" label="Barriles totales" valor={`${f.barriles_criticos} críticos / ${f.barriles_total}`} />
                    </div>
                    {f.cumplimientoMetaPct !== null && (
                      <div>
                        <p style={{ fontSize: 10.5, color: 'var(--cc-ink-3)', fontWeight: 700, marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.3 }}>Avance de meta</p>
                        <ProgressBar pct={f.cumplimientoMetaPct} mostrarValor tono={f.cumplimientoMetaPct >= 100 ? 'ok' : f.cumplimientoMetaPct >= 80 ? 'alerta' : 'critico'} />
                      </div>
                    )}
                  </div>
                }
              />
            )
          })}

          {filas.length === 0 && (
            <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--cc-ink-3)', fontSize: 13 }}>
              Sin datos de equipo para este período.
            </div>
          )}
        </div>
      )}
    </CCPage>
  )
}
