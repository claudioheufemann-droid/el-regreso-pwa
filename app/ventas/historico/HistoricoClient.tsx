'use client'

/**
 * Histórico de Ventas — Capa A (visión macro). Año-vs-año para medir
 * estacionalidad y crecimiento, filtros en cascada por canal y línea de
 * producto, y matriz de Pareto 80/20 (clientes A). RLS scopea automáticamente
 * (admin = todo; vendedor = su región).
 */
import { useState, useMemo, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Droplets, DollarSign, TrendingUp, Award, Loader2, Filter } from 'lucide-react'
import AppHeader from '@/components/ui/AppHeader'

interface MensualRow { anio: number; mes: number; litros: number; revenue: number }
interface ParetoRow { cliente: string; revenue: number; litros: number; pct_acum: number; es_a: boolean }

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
// Color por año (más reciente = dorado fuerte)
const ANIO_COLOR = ['#D4AF37', '#60A5FA', '#4ADE80', '#F87171', '#A78BFA', '#FB923C']

function fmtPeso(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1000) return `$${Math.round(n / 1000)}k`
  return `$${Math.round(n)}`
}
function fmtPesoFull(n: number) { return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n) }
function fmtL(n: number) { return n >= 1000 ? `${(n / 1000).toFixed(1)}k L` : `${Math.round(n)} L` }

export default function HistoricoClient({ mensualInicial, paretoInicial, canales, lineas, anioActual, isAdmin }: {
  mensualInicial: MensualRow[]
  paretoInicial: ParetoRow[]
  canales: string[]
  lineas: string[]
  anioActual: number
  isAdmin: boolean
}) {
  const [mensual, setMensual] = useState<MensualRow[]>(mensualInicial)
  const [pareto, setPareto]   = useState<ParetoRow[]>(paretoInicial)
  const [canal, setCanal]     = useState<string | null>(null)
  const [linea, setLinea]     = useState<string | null>(null)
  const [metrica, setMetrica] = useState<'revenue' | 'litros'>('revenue')
  const [cargando, setCargando] = useState(false)

  const refetch = useCallback(async (nuevoCanal: string | null, nuevaLinea: string | null) => {
    setCargando(true)
    try {
      const supabase = createClient()
      const [{ data: m }, { data: p }] = await Promise.all([
        supabase.rpc('ventas_historico_mensual', { p_canal: nuevoCanal, p_linea: nuevaLinea }),
        supabase.rpc('ventas_pareto', { p_anio: anioActual, p_canal: nuevoCanal, p_linea: nuevaLinea }),
      ])
      setMensual((m ?? []) as MensualRow[])
      setPareto((p ?? []) as ParetoRow[])
    } finally { setCargando(false) }
  }, [anioActual])

  function pickCanal(c: string | null) { setCanal(c); refetch(c, linea) }
  function pickLinea(l: string | null) { setLinea(l); refetch(canal, l) }

  const anios = useMemo(() => [...new Set(mensual.map(r => r.anio))].sort((a, b) => a - b), [mensual])

  // Totales por año para KPIs
  const totalesAnio = useMemo(() => {
    const m = new Map<number, { litros: number; revenue: number }>()
    for (const r of mensual) {
      const acc = m.get(r.anio) ?? { litros: 0, revenue: 0 }
      acc.litros += r.litros; acc.revenue += r.revenue
      m.set(r.anio, acc)
    }
    return m
  }, [mensual])

  const tActual = totalesAnio.get(anioActual) ?? { litros: 0, revenue: 0 }
  const tPrev   = totalesAnio.get(anioActual - 1) ?? { litros: 0, revenue: 0 }
  const deltaRev = tPrev.revenue > 0 ? ((tActual.revenue - tPrev.revenue) / tPrev.revenue) * 100 : 0
  const deltaLit = tPrev.litros > 0 ? ((tActual.litros - tPrev.litros) / tPrev.litros) * 100 : 0

  // ── Gráfico año-vs-año ──
  const chart = useMemo(() => {
    const W = 720, H = 260, padL = 44, padR = 16, padT = 16, padB = 28
    const val = (r: MensualRow) => metrica === 'revenue' ? r.revenue : r.litros
    const maxVal = Math.max(1, ...mensual.map(val))
    const x = (mes: number) => padL + ((mes - 1) / 11) * (W - padL - padR)
    const y = (v: number) => padT + (1 - v / maxVal) * (H - padT - padB)
    const series = anios.map((anio, i) => {
      const porMes = new Map(mensual.filter(r => r.anio === anio).map(r => [r.mes, val(r)]))
      const pts: { x: number; y: number; mes: number; v: number }[] = []
      for (let mes = 1; mes <= 12; mes++) {
        if (porMes.has(mes)) pts.push({ x: x(mes), y: y(porMes.get(mes)!), mes, v: porMes.get(mes)! })
      }
      return { anio, color: ANIO_COLOR[anios.length - 1 - i] ?? '#888', pts }
    })
    return { W, H, padL, padB, padT, maxVal, x, y, series }
  }, [mensual, anios, metrica])

  const clientesA = pareto.filter(p => p.es_a)
  const revTotal  = pareto.reduce((s, p) => s + p.revenue, 0)
  const revA      = clientesA.reduce((s, p) => s + p.revenue, 0)

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', paddingBottom: 100 }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 16px' }}>
        <div style={{ paddingTop: 'max(16px, env(safe-area-inset-top, 16px))' }}>
          <AppHeader eyebrow={isAdmin ? 'Inteligencia de ventas' : 'Tu región'} title="Histórico" />
        </div>

        {/* ── Filtros en cascada ── */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <Filter size={12} color="rgba(255,255,255,0.4)" />
            <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.6px', textTransform: 'uppercase' }}>Canal</span>
            {cargando && <Loader2 size={12} color="#60A5FA" style={{ animation: 'spin 0.8s linear infinite' }} />}
          </div>
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', scrollbarWidth: 'none', marginBottom: 8 }}>
            <Chip activo={canal === null} onClick={() => pickCanal(null)}>Todos</Chip>
            {canales.map(c => <Chip key={c} activo={canal === c} onClick={() => pickCanal(c)}>{c}</Chip>)}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <Chip activo={linea === null} onClick={() => pickLinea(null)} color="#4ADE80">Toda la línea</Chip>
            {lineas.map(l => <Chip key={l} activo={linea === l} onClick={() => pickLinea(l)} color="#4ADE80">{l}</Chip>)}
          </div>
        </div>

        {/* ── KPIs año actual vs anterior ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 16 }}>
          <KpiAnio icon={DollarSign} label={`Facturación ${anioActual}`} value={fmtPesoFull(tActual.revenue)} delta={deltaRev} prevLabel={`${anioActual - 1}: ${fmtPeso(tPrev.revenue)}`} color="#4ADE80" />
          <KpiAnio icon={Droplets} label={`Volumen ${anioActual}`} value={fmtL(tActual.litros)} delta={deltaLit} prevLabel={`${anioActual - 1}: ${fmtL(tPrev.litros)}`} color="#D4AF37" />
        </div>

        {/* ── Gráfico año-vs-año ── */}
        <div className="card card-pad-lg" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <div>
              <p style={{ fontSize: 13, fontWeight: 800, color: 'var(--cream)' }}>Estacionalidad — año vs año</p>
              <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>Comparación mensual de todos los años con historial</p>
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              {(['revenue', 'litros'] as const).map(m => (
                <button key={m} onClick={() => setMetrica(m)} style={{
                  padding: '5px 12px', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                  background: metrica === m ? 'var(--gold)' : 'rgba(255,255,255,0.04)',
                  border: 'none', color: metrica === m ? '#080808' : 'var(--muted)',
                }}>{m === 'revenue' ? '$ Facturación' : 'Litros'}</button>
              ))}
            </div>
          </div>

          {/* Leyenda */}
          <div style={{ display: 'flex', gap: 14, marginBottom: 10, flexWrap: 'wrap' }}>
            {chart.series.map(s => (
              <div key={s.anio} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 14, height: 3, borderRadius: 2, background: s.color }} />
                <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>{s.anio}</span>
              </div>
            ))}
          </div>

          <svg viewBox={`0 0 ${chart.W} ${chart.H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
            {/* Grid horizontal */}
            {[0, 0.25, 0.5, 0.75, 1].map(f => {
              const yy = chart.padT + f * (chart.H - chart.padT - chart.padB)
              return <line key={f} x1={chart.padL} y1={yy} x2={chart.W - 16} y2={yy} stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
            })}
            {/* Labels meses */}
            {MESES.map((m, i) => (
              <text key={m} x={chart.x(i + 1)} y={chart.H - 8} textAnchor="middle" fontSize="9" fill="rgba(255,255,255,0.3)">{m}</text>
            ))}
            {/* Líneas por año */}
            {chart.series.map(s => s.pts.length > 0 && (
              <g key={s.anio}>
                <polyline points={s.pts.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke={s.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity={0.9} />
                {s.pts.map(p => <circle key={p.mes} cx={p.x} cy={p.y} r="2.5" fill={s.color} />)}
              </g>
            ))}
          </svg>
        </div>

        {/* ── Pareto 80/20 ── */}
        <div className="card card-pad-lg">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Award size={15} color="#D4AF37" />
            <p style={{ fontSize: 13, fontWeight: 800, color: 'var(--cream)' }}>Clientes A — regla 80/20</p>
          </div>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 14 }}>
            <strong style={{ color: '#D4AF37' }}>{clientesA.length}</strong> de {pareto.length} clientes ({pareto.length ? Math.round(clientesA.length / pareto.length * 100) : 0}%) generan el <strong style={{ color: '#D4AF37' }}>{revTotal ? Math.round(revA / revTotal * 100) : 0}%</strong> de los ingresos de {anioActual}. Cuídalos.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 360, overflowY: 'auto' }}>
            {clientesA.slice(0, 25).map((p, i) => (
              <div key={p.cliente} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 10, background: 'rgba(212,175,55,0.04)', border: '1px solid rgba(212,175,55,0.1)' }}>
                <span style={{ fontSize: 11, fontWeight: 900, color: '#D4AF37', width: 22, flexShrink: 0 }}>{i + 1}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--cream)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.cliente}</p>
                  <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.06)', marginTop: 4, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${Math.min(p.revenue / (clientesA[0]?.revenue || 1) * 100, 100)}%`, background: '#D4AF37', borderRadius: 2 }} />
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <p style={{ fontSize: 12, fontWeight: 800, color: '#D4AF37' }}>{fmtPeso(p.revenue)}</p>
                  <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)' }}>{fmtL(p.litros)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}

function Chip({ children, activo, onClick, color = '#D4AF37' }: { children: React.ReactNode; activo: boolean; onClick: () => void; color?: string }) {
  return (
    <button onClick={onClick} style={{
      flexShrink: 0, minHeight: 34, padding: '0 13px', borderRadius: 20, cursor: 'pointer', whiteSpace: 'nowrap',
      background: activo ? color : 'var(--surface)',
      border: `1px solid ${activo ? color : 'var(--border)'}`,
      color: activo ? '#080808' : 'var(--muted)', fontSize: 12, fontWeight: 700,
    }}>{children}</button>
  )
}

function KpiAnio({ icon: Icon, label, value, delta, prevLabel, color }: {
  icon: typeof DollarSign; label: string; value: string; delta: number; prevLabel: string; color: string
}) {
  const pos = delta >= 0
  return (
    <div className="card card-pad" style={{ borderTop: `2px solid ${color}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <Icon size={13} color={color} />
        <span style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.6px', textTransform: 'uppercase' }}>{label}</span>
      </div>
      <p style={{ fontSize: 22, fontWeight: 900, color: 'var(--cream)', letterSpacing: '-0.8px', lineHeight: 1, marginBottom: 6 }}>{value}</p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: pos ? '#4ADE80' : '#F87171', display: 'flex', alignItems: 'center', gap: 2 }}>
          <TrendingUp size={11} style={{ transform: pos ? 'none' : 'scaleY(-1)' }} /> {pos ? '+' : ''}{delta.toFixed(0)}%
        </span>
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>{prevLabel}</span>
      </div>
    </div>
  )
}
