'use client'

/**
 * Ranking del equipo — leaderboard comparativo por región.
 * Nombres reales visibles. Compiten en KPIs de ejecución (transparencia en el
 * QUÉ); NUNCA se exponen cartera, deudas ni comisiones (privacidad en el CÓMO).
 * La fila del usuario actual queda destacada con su brecha al líder.
 */
import { useState, useMemo } from 'react'
import { Trophy, TrendingUp, Target, Zap, Package } from 'lucide-react'
import AppHeader from '@/components/ui/AppHeader'
import type { RankingRow } from './page'

const G = '#D4AF37'

type KpiKey = 'pct_meta' | 'strike_rate' | 'drop_size' | 'litros'
type Periodo = 'mes' | 'semana'

const KPIS: { key: KpiKey; label: string; icon: typeof Target; fmt: (r: RankingRow) => string; raw: (r: RankingRow) => number; unidad: string }[] = [
  { key: 'pct_meta',    label: '% Meta',      icon: Target,     fmt: r => `${r.pct_meta.toFixed(0)}%`,                          raw: r => r.pct_meta,            unidad: 'pts' },
  { key: 'strike_rate', label: 'Strike Rate', icon: Zap,        fmt: r => r.strike_rate != null ? `${r.strike_rate.toFixed(0)}%` : '—', raw: r => r.strike_rate ?? -1,  unidad: 'pts' },
  { key: 'drop_size',   label: 'Drop Size',   icon: TrendingUp, fmt: r => r.drop_size != null ? fmtPeso(r.drop_size) : '—',     raw: r => r.drop_size ?? -1,     unidad: '$' },
  { key: 'litros',      label: 'Litros',      icon: Package,    fmt: r => `${fmtNum(r.litros)} L`,                              raw: r => r.litros,              unidad: 'L' },
]

function fmtPeso(n: number) { return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n) }
function fmtNum(n: number)  { return new Intl.NumberFormat('es-CL', { maximumFractionDigits: n % 1 === 0 ? 0 : 1 }).format(n) }

const MEDAL = ['🥇', '🥈', '🥉']

export default function RankingClient({ rankingMes, rankingSemana, miRegion, isAdmin, periodoNombre }: {
  rankingMes: RankingRow[]
  rankingSemana: RankingRow[]
  miRegion: string | null
  isAdmin: boolean
  periodoNombre: string
}) {
  const [kpi, setKpi]         = useState<KpiKey>('pct_meta')
  const [periodo, setPeriodo] = useState<Periodo>('mes')

  const data = periodo === 'mes' ? rankingMes : rankingSemana
  const kpiCfg = KPIS.find(k => k.key === kpi)!

  // Orden descendente por el KPI elegido
  const ordenado = useMemo(() => {
    return [...data].sort((a, b) => kpiCfg.raw(b) - kpiCfg.raw(a))
  }, [data, kpiCfg])

  const miIndex = miRegion ? ordenado.findIndex(r => r.region === miRegion) : -1
  const miRow   = miIndex >= 0 ? ordenado[miIndex] : null
  const lider   = ordenado[0]

  // Brecha al líder en la unidad del KPI activo
  const brecha = useMemo(() => {
    if (!miRow || !lider || miIndex === 0) return null
    if (kpi === 'pct_meta')    return `a ${(lider.pct_meta - miRow.pct_meta).toFixed(0)} pts de la meta del líder`
    if (kpi === 'litros')      return `a ${fmtNum(lider.litros - miRow.litros)} L del 1º`
    if (kpi === 'drop_size' && lider.drop_size != null && miRow.drop_size != null)
      return `a ${fmtPeso(lider.drop_size - miRow.drop_size)} del 1º`
    if (kpi === 'strike_rate' && lider.strike_rate != null && miRow.strike_rate != null)
      return `a ${(lider.strike_rate - miRow.strike_rate).toFixed(0)} pts del 1º`
    return null
  }, [miRow, lider, miIndex, kpi])

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg, #0A090F 0%, #080808 100%)', paddingBottom: 110 }}>
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '16px 16px 0' }}>

        <AppHeader eyebrow="Equipo de ventas" title="Ranking" />

        {/* ── Banner de mi posición + brecha al líder ── */}
        {miRow && (
          <div style={{
            background: 'linear-gradient(135deg, rgba(212,175,55,0.14) 0%, rgba(212,175,55,0.05) 100%)',
            border: `1px solid rgba(212,175,55,0.3)`,
            borderRadius: 18, padding: '14px 16px', marginBottom: 14,
            display: 'flex', alignItems: 'center', gap: 14,
          }}>
            <div style={{
              width: 46, height: 46, borderRadius: 14, flexShrink: 0,
              background: 'rgba(212,175,55,0.18)', border: '1px solid rgba(212,175,55,0.35)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 20, fontWeight: 900, color: G,
            }}>
              {miIndex < 3 ? MEDAL[miIndex] : `${miIndex + 1}º`}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 13, fontWeight: 800, color: '#F0EDE8' }}>
                Vas {miIndex + 1}º de {ordenado.length} · {miRow.region}
              </p>
              <p style={{ fontSize: 12, color: 'rgba(212,175,55,0.85)', fontWeight: 600, marginTop: 2 }}>
                {miIndex === 0 ? '¡Vas liderando! 🏆' : brecha ?? 'Sigue así'}
              </p>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <p style={{ fontSize: 20, fontWeight: 900, color: G, letterSpacing: '-0.5px' }}>{kpiCfg.fmt(miRow)}</p>
              <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{kpiCfg.label}</p>
            </div>
          </div>
        )}
        {isAdmin && !miRow && (
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 14 }}>
            Vista de gerente · ranking global de las 4 regiones
          </p>
        )}

        {/* ── Selector de período ── */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          {([['mes', periodoNombre], ['semana', 'Semana actual']] as [Periodo, string][]).map(([p, label]) => (
            <button key={p} onClick={() => setPeriodo(p)} style={{
              flex: 1, minHeight: 38, borderRadius: 11, cursor: 'pointer',
              background: periodo === p ? 'rgba(212,175,55,0.14)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${periodo === p ? 'rgba(212,175,55,0.3)' : 'rgba(255,255,255,0.07)'}`,
              color: periodo === p ? G : 'rgba(255,255,255,0.4)',
              fontSize: 12, fontWeight: 700,
            }}>{label}</button>
          ))}
        </div>

        {/* ── Tabs de KPI ── */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 14, overflowX: 'auto', scrollbarWidth: 'none' }}>
          {KPIS.map(({ key, label, icon: Icon }) => (
            <button key={key} onClick={() => setKpi(key)} style={{
              flexShrink: 0, minHeight: 38, padding: '0 14px', borderRadius: 20, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
              background: kpi === key ? G : 'rgba(255,255,255,0.04)',
              border: `1px solid ${kpi === key ? G : 'rgba(255,255,255,0.08)'}`,
              color: kpi === key ? '#080808' : 'rgba(255,255,255,0.5)',
              fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap',
            }}>
              <Icon size={13} /> {label}
            </button>
          ))}
        </div>

        {/* ── Lista de ranking ── */}
        {ordenado.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 0' }}>
            <Trophy size={36} color="rgba(255,255,255,0.12)" style={{ margin: '0 auto 12px' }} />
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.3)' }}>Sin datos para este período</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {ordenado.map((r, i) => {
              const esYo = r.region === miRegion
              return (
                <div key={r.region} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
                  borderRadius: 16,
                  background: esYo ? 'rgba(212,175,55,0.10)' : 'rgba(255,255,255,0.025)',
                  border: `1px solid ${esYo ? 'rgba(212,175,55,0.35)' : 'rgba(255,255,255,0.06)'}`,
                  boxShadow: esYo ? '0 0 0 1px rgba(212,175,55,0.15), 0 4px 20px rgba(212,175,55,0.08)' : 'none',
                }}>
                  {/* Posición */}
                  <div style={{
                    width: 32, height: 32, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: i < 3 ? 18 : 13, fontWeight: 900,
                    color: i < 3 ? G : 'rgba(255,255,255,0.4)',
                  }}>
                    {i < 3 ? MEDAL[i] : `${i + 1}`}
                  </div>
                  {/* Nombre + región */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 14, fontWeight: 700, color: esYo ? G : '#F0EDE8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.vendedor}{esYo && <span style={{ fontSize: 10, marginLeft: 6, color: 'rgba(212,175,55,0.7)' }}>· tú</span>}
                    </p>
                    <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.32)', marginTop: 1 }}>
                      {r.region} · {fmtNum(r.litros)} L · {r.pedidos} ped.
                    </p>
                  </div>
                  {/* KPI activo destacado */}
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <p style={{ fontSize: 16, fontWeight: 900, color: esYo ? G : '#F0EDE8', letterSpacing: '-0.4px' }}>
                      {kpiCfg.fmt(r)}
                    </p>
                    {kpi === 'pct_meta' && (
                      <div style={{ width: 56, height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.08)', marginTop: 4, marginLeft: 'auto', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${Math.min(r.pct_meta, 100)}%`, background: r.pct_meta >= 90 ? '#4ADE80' : r.pct_meta >= 60 ? G : '#FB923C', borderRadius: 2 }} />
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Nota de privacidad */}
        <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', textAlign: 'center', marginTop: 16, lineHeight: 1.5 }}>
          Solo se comparten resultados de ejecución. La cartera, deudas y comisiones de cada vendedor son privadas.
        </p>
      </div>
    </div>
  )
}
