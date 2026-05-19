'use client'

import { useState, useEffect } from 'react'
import { RcTask, AREA_CFG, MACRO_AREAS, MacroKey } from '@/lib/gestion-types'
import {
  calcAreaKpis,
  calcSemaphoreDistribution,
  calcNetProductivity,
  calcOTCR,
  calcReactionTime,
  SEMAPHORE_HEX,
} from '@/lib/kpis'
import ReportPanel from '@/components/reports/ReportPanel'

const ALL_AREAS = (Object.values(MACRO_AREAS) as typeof MACRO_AREAS[MacroKey][])
  .flatMap(m => [...m.areas])

interface Props { tasks: RcTask[] }

// ── Helpers ───────────────────────────────────────────────────

function statusColor(value: number, target: number, inverted = false): string {
  const ratio = value / target
  if (inverted) {
    if (value <= target * 0.5) return '#16A34A'
    if (value <= target)       return '#D97706'
    return '#DC2626'
  }
  if (ratio >= 1)    return '#16A34A'
  if (ratio >= 0.75) return '#D97706'
  return '#DC2626'
}

function StatusBadge({ ok }: { ok: boolean }) {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 10px', borderRadius: 100,
      background: ok ? 'rgba(22,163,74,0.12)' : 'rgba(220,38,38,0.12)',
      border: `1px solid ${ok ? 'rgba(22,163,74,0.3)' : 'rgba(220,38,38,0.3)'}`,
      fontSize: 9, fontWeight: 800, letterSpacing: 1,
      color: ok ? '#16A34A' : '#DC2626',
    }}>
      <span style={{ fontSize: 10 }}>{ok ? '✓' : '!'}</span>
      {ok ? 'CUMPLIDO' : 'NO CUMPLIDO'}
    </div>
  )
}

function ProgressBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = Math.min(100, max > 0 ? Math.round((value / max) * 100) : 0)
  return (
    <div style={{ height: 6, background: 'rgba(128,128,128,0.12)', borderRadius: 6, overflow: 'hidden' }}>
      <div style={{
        height: '100%', width: `${pct}%`, background: color,
        borderRadius: 6, transition: 'width 0.6s cubic-bezier(0.16,1,0.3,1)',
      }} />
    </div>
  )
}

interface KpiCardProps {
  title: string
  description: string
  formula: string
  value: string | number
  unit?: string
  target: string
  targetMet: boolean
  color: string
  barValue?: number
  barMax?: number
  sub?: string
}

function KpiCard({ title, description, formula, value, unit, target, targetMet, color, barValue, barMax, sub }: KpiCardProps) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 20, padding: '22px 22px 18px',
      display: 'flex', flexDirection: 'column', gap: 14,
      borderTop: `3px solid ${color}`,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--cream)', letterSpacing: -0.3, marginBottom: 4 }}>{title}</div>
          <div style={{ fontSize: 10, color: 'var(--muted)', lineHeight: 1.5 }}>{description}</div>
        </div>
        <StatusBadge ok={targetMet} />
      </div>

      {/* Main number */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6 }}>
        <span style={{ fontSize: 48, fontWeight: 900, lineHeight: 1, letterSpacing: -2, color }}>{value}</span>
        {unit && <span style={{ fontSize: 18, fontWeight: 700, color, marginBottom: 4, opacity: 0.7 }}>{unit}</span>}
      </div>

      {/* Progress bar */}
      {barValue !== undefined && barMax !== undefined && barMax > 0 && (
        <ProgressBar value={barValue} max={barMax} color={color} />
      )}

      {/* Footer */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 4, borderTop: '1px solid rgba(128,128,128,0.08)' }}>
        <div>
          <div style={{ fontSize: 8, color: 'var(--muted)', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 2 }}>Fórmula</div>
          <div style={{ fontSize: 9, color: 'var(--muted)', fontStyle: 'italic' }}>{formula}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 8, color: 'var(--muted)', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 2 }}>Meta</div>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)' }}>{target}</div>
        </div>
      </div>

      {sub && <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: -8 }}>{sub}</div>}
    </div>
  )
}

// ── Area ranking row ──────────────────────────────────────────

function RankRow({ rank, kpi, pimponeo, isBest, isWorst }: {
  rank: number
  kpi: ReturnType<typeof calcAreaKpis>[0]
  pimponeo: number
  isBest: boolean
  isWorst: boolean
}) {
  const cfg = AREA_CFG[kpi.area]
  const otcrColor = kpi.otcr >= 85 ? '#16A34A' : kpi.otcr >= 60 ? '#D97706' : '#DC2626'
  const accent = isBest ? '#16A34A' : isWorst ? '#DC2626' : 'transparent'

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '28px 1fr 40px 40px 40px 40px 56px 56px',
      gap: 8, alignItems: 'center',
      padding: '12px 16px',
      background: isBest ? 'rgba(22,163,74,0.05)' : isWorst ? 'rgba(220,38,38,0.05)' : 'transparent',
      borderRadius: 12,
      borderLeft: `3px solid ${accent}`,
      transition: 'background 0.15s',
    }}>
      {/* Rank */}
      <div style={{
        width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
        background: isBest ? 'rgba(22,163,74,0.15)' : isWorst ? 'rgba(220,38,38,0.15)' : 'rgba(128,128,128,0.1)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 9, fontWeight: 800,
        color: isBest ? '#16A34A' : isWorst ? '#DC2626' : 'var(--muted)',
      }}>{rank}</div>

      {/* Area */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
        <div style={{
          width: 22, height: 22, borderRadius: 6, flexShrink: 0,
          background: `${cfg?.color ?? '#888'}18`, border: `1px solid ${cfg?.color ?? '#888'}30`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 7, fontWeight: 800, color: cfg?.color ?? '#888',
        }}>{cfg?.code ?? '?'}</div>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--cream)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{kpi.area}</span>
        {isBest && <span style={{ fontSize: 8, color: '#16A34A', fontWeight: 700, flexShrink: 0 }}>↑ Mejor</span>}
        {isWorst && <span style={{ fontSize: 8, color: '#DC2626', fontWeight: 700, flexShrink: 0 }}>↓ Peor</span>}
      </div>

      {/* Red */}
      <div style={{ textAlign: 'center' }}>
        {kpi.red > 0
          ? <span style={{ fontSize: 12, fontWeight: 800, color: SEMAPHORE_HEX.red, background: 'rgba(220,38,38,0.1)', borderRadius: 6, padding: '2px 6px' }}>{kpi.red}</span>
          : <span style={{ fontSize: 11, color: 'rgba(128,128,128,0.3)' }}>—</span>
        }
      </div>

      {/* Yellow */}
      <div style={{ textAlign: 'center' }}>
        {kpi.yellow > 0
          ? <span style={{ fontSize: 12, fontWeight: 700, color: SEMAPHORE_HEX.yellow }}>{kpi.yellow}</span>
          : <span style={{ fontSize: 11, color: 'rgba(128,128,128,0.3)' }}>—</span>
        }
      </div>

      {/* Green */}
      <div style={{ textAlign: 'center' }}>
        {kpi.green > 0
          ? <span style={{ fontSize: 12, fontWeight: 700, color: SEMAPHORE_HEX.green }}>{kpi.green}</span>
          : <span style={{ fontSize: 11, color: 'rgba(128,128,128,0.3)' }}>—</span>
        }
      </div>

      {/* Blue (done) */}
      <div style={{ textAlign: 'center' }}>
        {kpi.blue > 0
          ? <span style={{ fontSize: 12, fontWeight: 700, color: SEMAPHORE_HEX.blue }}>{kpi.blue}</span>
          : <span style={{ fontSize: 11, color: 'rgba(128,128,128,0.3)' }}>—</span>
        }
      </div>

      {/* OTCR */}
      <div style={{ textAlign: 'center' }}>
        <span style={{ fontSize: 12, fontWeight: 800, color: otcrColor }}>
          {kpi.otcr > 0 ? `${kpi.otcr}%` : '—'}
        </span>
      </div>

      {/* Pimponeo */}
      <div style={{ textAlign: 'center' }}>
        <span style={{ fontSize: 11, color: pimponeo >= 3 ? '#DC2626' : pimponeo >= 1.5 ? '#D97706' : 'var(--muted)' }}>
          {pimponeo > 0 ? pimponeo.toFixed(1) : '—'}
        </span>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────

export default function GestionPanel({ tasks }: Props) {
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({})

  useEffect(() => {
    fetch('/api/analytics')
      .then(r => r.json())
      .then(d => setCommentCounts(d ?? {}))
      .catch(() => {})
  }, [])

  const activeTasks = tasks.filter(t => t.area !== 'Mi Cerebro')
  const dist        = calcSemaphoreDistribution(activeTasks)
  const netProd     = calcNetProductivity(activeTasks)
  const globalOtcr  = calcOTCR(activeTasks)
  const reaction    = calcReactionTime(activeTasks)

  const areaKpis = calcAreaKpis(activeTasks, ALL_AREAS).map(kpi => ({
    ...kpi,
    pimponeo: (() => {
      const areaTasks = activeTasks.filter(t => t.area === kpi.area)
      const totalComments = areaTasks.reduce((s, t) => s + (commentCounts[t.id] ?? 0), 0)
      return areaTasks.length > 0 ? Math.round((totalComments / areaTasks.length) * 10) / 10 : 0
    })(),
  }))

  const ranked = [...areaKpis]
    .filter(a => a.total > 0)
    .sort((a, b) => b.red - a.red || b.yellow - a.yellow || a.otcr - b.otcr)

  const bestArea  = ranked.length > 0 ? [...ranked].sort((a, b) => b.otcr - a.otcr || a.red - b.red)[0]  : null
  const worstArea = ranked.length > 0 ? ranked[0] : null

  // Global pimponeo avg
  const totalComments = Object.values(commentCounts).reduce((s, n) => s + n, 0)
  const pimponeoProm  = activeTasks.length > 0 ? Math.round((totalComments / activeTasks.length) * 10) / 10 : 0

  // Red %
  const redPct   = dist.total > 0 ? Math.round((dist.red / dist.total) * 100) : 0
  const today    = new Date().toLocaleDateString('es-CL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>

      {/* ── Page header ── */}
      <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: 20 }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--gold)', letterSpacing: 2.5, textTransform: 'uppercase', marginBottom: 8 }}>
          Panel de Gestión
        </div>
        <div style={{ fontSize: 26, fontWeight: 900, color: 'var(--cream)', letterSpacing: -1, lineHeight: 1, marginBottom: 6 }}>
          Reporte de Desempeño
        </div>
        <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'capitalize' }}>{today}</div>
        <div style={{ display: 'flex', gap: 16, marginTop: 14, flexWrap: 'wrap' }}>
          {[
            { label: 'Total tareas', value: dist.total, color: 'var(--cream)' },
            { label: 'Activas', value: dist.red + dist.yellow + dist.green, color: 'var(--cream)' },
            { label: 'Completadas', value: dist.blue, color: SEMAPHORE_HEX.blue },
            { label: 'Áreas evaluadas', value: ranked.length, color: 'var(--gold)' },
          ].map(s => (
            <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 16, fontWeight: 900, color: s.color }}>{s.value}</span>
              <span style={{ fontSize: 10, color: 'var(--muted)' }}>{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── KPI Cards 2×2 ── */}
      <div>
        <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--muted)', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 16 }}>
          Indicadores Clave de Desempeño
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>

          {/* OTCR */}
          <KpiCard
            title="Efectividad de Entrega"
            description="Tareas completadas sin haber registrado retrasos sobre el total cerrado"
            formula="Sin retrasos ÷ Total completadas"
            value={globalOtcr.total > 0 ? globalOtcr.rate : '—'}
            unit={globalOtcr.total > 0 ? '%' : ''}
            target="≥ 85%"
            targetMet={globalOtcr.rate >= 85}
            color={statusColor(globalOtcr.rate, 85)}
            barValue={globalOtcr.onTime}
            barMax={globalOtcr.total}
          />

          {/* Tareas en rojo */}
          <KpiCard
            title="Nivel de Riesgo"
            description="Porcentaje de tareas vencidas o con menos de 24h de plazo sobre el total activo"
            formula="Tareas rojas ÷ Total activo"
            value={redPct}
            unit="%"
            target="< 15%"
            targetMet={redPct < 15}
            color={statusColor(redPct, 15, true)}
            barValue={dist.red}
            barMax={dist.red + dist.yellow + dist.green || 1}
            sub={`${dist.red} tarea${dist.red !== 1 ? 's' : ''} en estado crítico`}
          />

          {/* Productividad neta */}
          <KpiCard
            title="Productividad Neta"
            description="Relación entre tareas cerradas y creadas durante la semana actual"
            formula="Cerradas ÷ Creadas esta semana"
            value={netProd.created > 0 ? netProd.ratio.toFixed(1) : '—'}
            unit={netProd.created > 0 ? 'x' : ''}
            target="≥ 1.0x"
            targetMet={netProd.ratio >= 1}
            color={statusColor(netProd.ratio, 1)}
            barValue={netProd.closed}
            barMax={Math.max(netProd.created, netProd.closed, 1)}
            sub={`${netProd.closed} cerradas · ${netProd.created} creadas esta semana`}
          />

          {/* Pimponeo */}
          <KpiCard
            title="Índice de Pimponeo"
            description="Promedio de comentarios por tarea. Alto índice indica ambigüedad o falta de claridad en las instrucciones"
            formula="Total comentarios ÷ Total tareas"
            value={pimponeoProm}
            unit="msg/t"
            target="< 2.0"
            targetMet={pimponeoProm < 2}
            color={statusColor(pimponeoProm, 2, true)}
            barValue={Math.min(pimponeoProm, 5)}
            barMax={5}
            sub={`${totalComments} comentarios en ${activeTasks.length} tareas`}
          />

          {/* Tiempo de Reacción — full width */}
          <div style={{
            gridColumn: '1 / -1',
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 20, padding: '22px 22px 18px',
            borderTop: `3px solid ${statusColor(reaction.avgPendingDays, 1, true)}`,
          }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 18 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--cream)', letterSpacing: -0.3, marginBottom: 4 }}>
                  Velocidad de Adopción
                </div>
                <div style={{ fontSize: 10, color: 'var(--muted)', lineHeight: 1.5 }}>
                  Tiempo entre la asignación de la tarea y que el responsable la inicia (cambia a En Proceso)
                </div>
              </div>
              <StatusBadge ok={reaction.avgPendingDays <= 1 && reaction.pendingOver24h === 0} />
            </div>

            {/* Métricas en fila */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 18 }}>
              {[
                {
                  label: 'Espera promedio',
                  value: reaction.pending > 0 ? `${reaction.avgPendingDays}d` : '—',
                  sub: 'tareas asignadas sin iniciar',
                  color: statusColor(reaction.avgPendingDays, 1, true),
                  big: true,
                },
                {
                  label: 'Sin iniciar',
                  value: reaction.pending,
                  sub: 'en estado Asignada ahora',
                  color: reaction.pending > 0 ? '#D97706' : '#16A34A',
                  big: false,
                },
                {
                  label: '> 24h sin tomar',
                  value: reaction.pendingOver24h,
                  sub: 'requieren atención',
                  color: reaction.pendingOver24h > 0 ? '#DC2626' : '#16A34A',
                  big: false,
                },
                {
                  label: '> 72h sin tomar',
                  value: reaction.pendingOver72h,
                  sub: 'riesgo de incumplimiento',
                  color: reaction.pendingOver72h > 0 ? '#DC2626' : 'rgba(128,128,128,0.3)',
                  big: false,
                },
              ].map(m => (
                <div key={m.label} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 14, padding: '14px 16px' }}>
                  <div style={{ fontSize: 9, color: 'var(--muted)', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 8 }}>{m.label}</div>
                  <div style={{ fontSize: m.big ? 36 : 28, fontWeight: 900, color: m.color, letterSpacing: -1.5, lineHeight: 1, marginBottom: 4 }}>{m.value}</div>
                  <div style={{ fontSize: 9, color: 'var(--muted)' }}>{m.sub}</div>
                </div>
              ))}
            </div>

            {/* Real data note + barra visual de pendingOver */}
            {reaction.pending > 0 && (
              <div>
                <ProgressBar
                  value={reaction.pending - reaction.pendingOver24h}
                  max={reaction.pending}
                  color="#16A34A"
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5 }}>
                  <span style={{ fontSize: 9, color: 'var(--muted)' }}>Recién asignadas (≤ 24h)</span>
                  <span style={{ fontSize: 9, color: 'var(--muted)' }}>Sin iniciar ({reaction.pending} total)</span>
                </div>
              </div>
            )}

            <div style={{ paddingTop: 14, borderTop: '1px solid rgba(128,128,128,0.08)', display: 'flex', justifyContent: 'space-between', marginTop: 14 }}>
              <div>
                <div style={{ fontSize: 8, color: 'var(--muted)', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 2 }}>Fórmula</div>
                <div style={{ fontSize: 9, color: 'var(--muted)', fontStyle: 'italic' }}>
                  avg(started_at − created_at) · proxy: días en estado Asignada
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 8, color: 'var(--muted)', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 2 }}>Meta</div>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)' }}>≤ 1 día · 0 tareas &gt; 24h</div>
              </div>
            </div>

            {reaction.samplesReal > 0 && (
              <div style={{ marginTop: 10, padding: '8px 12px', background: 'rgba(22,163,74,0.06)', border: '1px solid rgba(22,163,74,0.15)', borderRadius: 10, fontSize: 10, color: '#16A34A' }}>
                ✓ Dato exacto disponible para {reaction.samplesReal} tarea{reaction.samplesReal !== 1 ? 's' : ''} — promedio real: {reaction.avgDays}d desde asignación hasta inicio
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Best / Worst spotlight ── */}
      {(bestArea || worstArea) && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {bestArea && (
            <div style={{ background: 'rgba(22,163,74,0.06)', border: '1px solid rgba(22,163,74,0.2)', borderRadius: 16, padding: '16px 18px' }}>
              <div style={{ fontSize: 9, fontWeight: 800, color: '#16A34A', letterSpacing: 1.6, textTransform: 'uppercase', marginBottom: 10 }}>↑ Mejor Área</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--cream)', marginBottom: 4 }}>{bestArea.area}</div>
              <div style={{ fontSize: 24, fontWeight: 900, color: '#16A34A', letterSpacing: -1, lineHeight: 1 }}>{bestArea.otcr}%</div>
              <div style={{ fontSize: 9, color: '#16A34A', marginTop: 4, opacity: 0.8 }}>efectividad · {bestArea.red} tarea{bestArea.red !== 1 ? 's' : ''} en rojo</div>
            </div>
          )}
          {worstArea && worstArea.area !== bestArea?.area && (
            <div style={{ background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.2)', borderRadius: 16, padding: '16px 18px' }}>
              <div style={{ fontSize: 9, fontWeight: 800, color: '#DC2626', letterSpacing: 1.6, textTransform: 'uppercase', marginBottom: 10 }}>↓ Mayor Riesgo</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--cream)', marginBottom: 4 }}>{worstArea.area}</div>
              <div style={{ fontSize: 24, fontWeight: 900, color: '#DC2626', letterSpacing: -1, lineHeight: 1 }}>{worstArea.red}</div>
              <div style={{ fontSize: 9, color: '#DC2626', marginTop: 4, opacity: 0.8 }}>tarea{worstArea.red !== 1 ? 's' : ''} en rojo · {worstArea.otcr}% efectividad</div>
            </div>
          )}
        </div>
      )}

      {/* ── Ranking por macro-área ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--cream)', marginBottom: 2 }}>Ranking por Área</div>
          <div style={{ fontSize: 10, color: 'var(--muted)' }}>Agrupado por unidad de negocio · mayor riesgo primero dentro de cada grupo</div>
        </div>

        {(Object.entries(MACRO_AREAS) as [MacroKey, typeof MACRO_AREAS[MacroKey]][]).map(([macroKey, macro]) => {
          const macroAreaNames = macro.areas as readonly string[]
          const macroKpis = areaKpis
            .filter(a => macroAreaNames.includes(a.area) && a.total > 0)
            .sort((a, b) => b.red - a.red || b.yellow - a.yellow || a.otcr - b.otcr)

          if (macroKpis.length === 0) return null

          // Subtotales del grupo
          const mTotal  = macroKpis.reduce((s, a) => s + a.total, 0)
          const mRed    = macroKpis.reduce((s, a) => s + a.red, 0)
          const mYellow = macroKpis.reduce((s, a) => s + a.yellow, 0)
          const mGreen  = macroKpis.reduce((s, a) => s + a.green, 0)
          const mBlue   = macroKpis.reduce((s, a) => s + a.blue, 0)
          const mOtcr   = macroKpis.filter(a => a.otcr > 0).length > 0
            ? Math.round(macroKpis.reduce((s, a) => s + a.otcr, 0) / macroKpis.filter(a => a.otcr > 0).length)
            : 0
          const mRedPct = mTotal > 0 ? Math.round((mRed / mTotal) * 100) : 0
          const mOtcrColor = mOtcr >= 85 ? '#16A34A' : mOtcr >= 60 ? '#D97706' : '#DC2626'
          const macroBest  = [...macroKpis].sort((a, b) => b.otcr - a.otcr || a.red - b.red)[0]
          const macroWorst = macroKpis[0]

          return (
            <div key={macroKey} style={{ background: 'var(--surface)', border: `1px solid ${macro.color}30`, borderRadius: 20, overflow: 'hidden' }}>

              {/* Macro header */}
              <div style={{
                padding: '16px 20px',
                background: `${macro.color}08`,
                borderBottom: `1px solid ${macro.color}20`,
                display: 'flex', alignItems: 'center', gap: 14,
              }}>
                {/* Icon */}
                <div style={{
                  width: 40, height: 40, borderRadius: 13, flexShrink: 0,
                  background: `${macro.color}18`, border: `1px solid ${macro.color}35`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 900, color: macro.color,
                }}>{macro.code}</div>

                {/* Name + subtitle */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 900, color: 'var(--cream)', letterSpacing: -0.4 }}>{macro.label}</div>
                  <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>
                    {mTotal} tareas · {macroKpis.length} área{macroKpis.length !== 1 ? 's' : ''}
                  </div>
                </div>

                {/* Subtotals chips */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  {mRed > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 20, background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.25)' }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: SEMAPHORE_HEX.red }} />
                      <span style={{ fontSize: 11, fontWeight: 800, color: SEMAPHORE_HEX.red }}>{mRed}</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 20, background: `${mOtcrColor}12`, border: `1px solid ${mOtcrColor}30` }}>
                    <span style={{ fontSize: 10, color: 'var(--muted)' }}>OTCR</span>
                    <span style={{ fontSize: 12, fontWeight: 900, color: mOtcrColor }}>{mOtcr > 0 ? `${mOtcr}%` : '—'}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 20, background: 'rgba(128,128,128,0.08)', border: '1px solid rgba(128,128,128,0.15)' }}>
                    <span style={{ fontSize: 10, color: 'var(--muted)' }}>Riesgo</span>
                    <span style={{ fontSize: 12, fontWeight: 900, color: mRed > 0 ? '#DC2626' : '#16A34A' }}>{mRedPct}%</span>
                  </div>
                </div>
              </div>

              {/* Progress bar of group */}
              <div style={{ height: 3, background: 'rgba(128,128,128,0.08)', display: 'flex' }}>
                {mRed > 0    && <div style={{ flex: mRed,    background: SEMAPHORE_HEX.red    }} />}
                {mYellow > 0 && <div style={{ flex: mYellow, background: SEMAPHORE_HEX.yellow }} />}
                {mGreen > 0  && <div style={{ flex: mGreen,  background: SEMAPHORE_HEX.green  }} />}
                {mBlue > 0   && <div style={{ flex: mBlue,   background: SEMAPHORE_HEX.blue   }} />}
              </div>

              {/* Column headers */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '28px 1fr 40px 40px 40px 40px 56px 56px',
                gap: 8, padding: '10px 16px',
                borderBottom: '1px solid rgba(128,128,128,0.07)',
                background: 'rgba(128,128,128,0.02)',
              }}>
                {['#', 'Área', '🔴', '🟡', '🟢', '🔵', 'OTCR', 'Ping'].map((h, i) => (
                  <div key={i} style={{
                    fontSize: 8, fontWeight: 800, color: 'var(--muted)',
                    letterSpacing: 1, textTransform: 'uppercase',
                    textAlign: i > 1 ? 'center' : 'left',
                  }}>{h}</div>
                ))}
              </div>

              {/* Area rows */}
              <div style={{ padding: '6px 8px 8px' }}>
                {macroKpis.map((kpi, idx) => (
                  <RankRow
                    key={kpi.area}
                    rank={idx + 1}
                    kpi={kpi}
                    pimponeo={kpi.pimponeo}
                    isBest={kpi.area === macroBest?.area && macroBest?.otcr > 0}
                    isWorst={kpi.area === macroWorst?.area && macroWorst?.red > 0 && kpi.area !== macroBest?.area}
                  />
                ))}
              </div>

              {/* Macro footer: best / worst */}
              {(macroBest || macroWorst) && (
                <div style={{ padding: '10px 16px 14px', borderTop: '1px solid rgba(128,128,128,0.07)', display: 'flex', gap: 10 }}>
                  {macroBest && macroBest.otcr > 0 && (
                    <div style={{ flex: 1, padding: '8px 12px', background: 'rgba(22,163,74,0.06)', border: '1px solid rgba(22,163,74,0.18)', borderRadius: 10 }}>
                      <div style={{ fontSize: 8, fontWeight: 700, color: '#16A34A', letterSpacing: 1.2, marginBottom: 3 }}>↑ MEJOR</div>
                      <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--cream)' }}>{macroBest.area}</div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#16A34A' }}>{macroBest.otcr}% efectividad</div>
                    </div>
                  )}
                  {macroWorst && macroWorst.red > 0 && macroWorst.area !== macroBest?.area && (
                    <div style={{ flex: 1, padding: '8px 12px', background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.18)', borderRadius: 10 }}>
                      <div style={{ fontSize: 8, fontWeight: 700, color: '#DC2626', letterSpacing: 1.2, marginBottom: 3 }}>↓ MAYOR RIESGO</div>
                      <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--cream)' }}>{macroWorst.area}</div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#DC2626' }}>{macroWorst.red} tarea{macroWorst.red !== 1 ? 's' : ''} en rojo</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}

        {/* Legend */}
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', paddingTop: 4 }}>
          {[
            { label: 'OTCR: Efectividad de entrega (meta ≥ 85%)' },
            { label: 'Ping: Comentarios promedio por tarea (meta < 2)' },
          ].map(l => (
            <span key={l.label} style={{ fontSize: 9, color: 'var(--muted)' }}>{l.label}</span>
          ))}
        </div>
      </div>

      {/* ── Report Generator ── */}
      <ReportPanel tasks={tasks} commentCounts={commentCounts} />

    </div>
  )
}
