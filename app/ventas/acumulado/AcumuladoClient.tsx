'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useIsDesktop } from '@/lib/useIsDesktop'
import type { KpiData, EvoDia, CatRow, TopCliente, MixItem, InsightItem, AlertaItem, DivVend } from './page'
import type { Periodo } from '@/lib/types'
import { TrendingUp, TrendingDown, Users, Award, DollarSign, Droplets, Bell, Lightbulb, ChevronRight, BarChart2, Target } from 'lucide-react'

// ── Colores ──────────────────────────────────────────────────────────────────
const VEND_COLOR: Record<string, string> = {
  'Javier Badilla':  '#60A5FA',
  'Carlos Urrejola': '#D4AF37',
}
const CAT_COLOR: Record<string, string> = {
  'Bar': '#D4AF37', 'Minimarket': '#60A5FA', 'Cafetería': '#4ADE80',
  'Botillería': '#A78BFA', 'Almacén': '#FB923C', 'Restaurante': '#F472B6',
  'Supermercado': '#38BDF8', 'Distribuidor': '#86EFAC',
  'Cliente Directo': '#E879F9', 'Otros': '#6B7280',
}
const MIX_COLORS = ['#60A5FA','#D4AF37','#34D399','#F472B6','#A78BFA','#FB923C','#38BDF8','#6B7280']

// ── Helpers ──────────────────────────────────────────────────────────────────
const fL  = (n: number) => n >= 1000 ? `${(n/1000).toFixed(1)}k` : n.toFixed(1)
const fLn = (n: number) => n.toFixed(1)
const fP  = (n: number) => n >= 1_000_000 ? `$${(n/1_000_000).toFixed(2)}M` : `$${Math.round(n).toLocaleString('es-CL')}`
const fPk = (n: number) => `$${Math.round(n).toLocaleString('es-CL')}`
const delta = (a: number, b: number) => b > 0 ? Math.round(((a - b) / b) * 100) : 0
const meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
const fFecha = (s: string) => { const [,m,d] = s.split('-'); return `${parseInt(d)} ${meses[parseInt(m)-1]}` }

// ── Mini sparkline ───────────────────────────────────────────────────────────
function Spark({ values, color, positive }: { values: number[]; color: string; positive: boolean }) {
  if (values.length < 2) return null
  const w = 60; const h = 24; const pad = 2
  const min = Math.min(...values); const max = Math.max(...values)
  const range = max - min || 1
  const xs = values.map((_, i) => pad + (i / (values.length - 1)) * (w - 2 * pad))
  const ys = values.map(v => h - pad - ((v - min) / range) * (h - 2 * pad))
  let d = `M ${xs[0]} ${ys[0]}`
  for (let i = 1; i < xs.length; i++) {
    const cpx = (xs[i] + xs[i-1]) / 2
    d += ` C ${cpx} ${ys[i-1]}, ${cpx} ${ys[i]}, ${xs[i]} ${ys[i]}`
  }
  const fill = `${d} L ${xs[xs.length-1]} ${h} L ${xs[0]} ${h} Z`
  return (
    <svg width={w} height={h} style={{ overflow: 'visible' }}>
      <defs>
        <linearGradient id={`sg-${color.replace('#','')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={fill} fill={`url(#sg-${color.replace('#','')})`} />
      <path d={d} stroke={color} strokeWidth="1.5" fill="none" />
    </svg>
  )
}

// ── KPI card ─────────────────────────────────────────────────────────────────
function KpiCard({ icon: Icon, label, value, sub, deltaVal, spark, color, wide }:
  { icon: React.ElementType; label: string; value: string; sub?: string; deltaVal?: number; spark?: number[]; color: string; wide?: boolean }) {
  const isPos = (deltaVal ?? 0) >= 0
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 16, padding: '16px 18px',
      minWidth: wide ? 220 : 160, flex: '1 1 160px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon size={13} color={color} />
          <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{label}</span>
        </div>
        {spark && <Spark values={spark} color={color} positive={isPos} />}
      </div>
      <p style={{ fontSize: 26, fontWeight: 900, color: 'var(--cream)', letterSpacing: '-0.8px', lineHeight: 1, marginBottom: 4 }}>{value}</p>
      {sub && <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>{sub}</p>}
      {deltaVal !== undefined && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {isPos ? <TrendingUp size={11} color="#34D399" /> : <TrendingDown size={11} color="#F87171" />}
          <span style={{ fontSize: 11, fontWeight: 700, color: isPos ? '#34D399' : '#F87171' }}>
            {isPos ? '+' : ''}{deltaVal}%
          </span>
          <span style={{ fontSize: 10, color: 'var(--muted)' }}>vs período ant.</span>
        </div>
      )}
    </div>
  )
}

// ── Gráfico de líneas SVG ─────────────────────────────────────────────────────
function LineChart({ data, vendedores }: { data: EvoDia[]; vendedores: string[] }) {
  const W = 680; const H = 200; const PL = 40; const PR = 10; const PT = 10; const PB = 30
  const iW = W - PL - PR; const iH = H - PT - PB
  if (!data.length) return <div style={{ height: H, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><p style={{ color: 'var(--muted)', fontSize: 12 }}>Sin datos</p></div>

  const allVals = data.flatMap(d => vendedores.map(v => (d[v] as number) ?? 0))
  const maxV = Math.max(...allVals, 1)
  const ticks = [0, maxV * 0.25, maxV * 0.5, maxV * 0.75, maxV].map(v => Math.round(v))

  const x = (i: number) => PL + (i / Math.max(data.length - 1, 1)) * iW
  const y = (v: number) => PT + iH - (v / maxV) * iH

  const path = (vend: string) => {
    const pts = data.map((d, i) => ({ x: x(i), y: y((d[vend] as number) ?? 0) }))
    if (!pts.length) return ''
    let d = `M ${pts[0].x} ${pts[0].y}`
    for (let i = 1; i < pts.length; i++) {
      const cpx = (pts[i].x + pts[i-1].x) / 2
      d += ` C ${cpx} ${pts[i-1].y}, ${cpx} ${pts[i].y}, ${pts[i].x} ${pts[i].y}`
    }
    return d
  }

  const labelIdx = data.length <= 10 ? data.map((_, i) => i) : [0, Math.floor(data.length * 0.25), Math.floor(data.length * 0.5), Math.floor(data.length * 0.75), data.length - 1]

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: H }} preserveAspectRatio="none">
      {/* Grid lines */}
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={PL} y1={y(t)} x2={W - PR} y2={y(t)} stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
          <text x={PL - 4} y={y(t) + 4} textAnchor="end" fontSize="9" fill="#555">{t > 0 ? fL(t) : '0'}</text>
        </g>
      ))}
      {/* X labels */}
      {labelIdx.map(i => (
        <text key={i} x={x(i)} y={H - 4} textAnchor="middle" fontSize="9" fill="#555">{fFecha(data[i].fecha)}</text>
      ))}
      {/* Lines per vendedor */}
      {vendedores.map(vend => {
        const color = VEND_COLOR[vend] ?? '#888'
        const p = path(vend)
        const pts = data.map((d, i) => ({ x: x(i), y: y((d[vend] as number) ?? 0) }))
        // Area fill
        const area = p + ` L ${pts[pts.length-1].x} ${PT + iH} L ${pts[0].x} ${PT + iH} Z`
        return (
          <g key={vend}>
            <defs>
              <linearGradient id={`lg-${vend.replace(/ /g,'')}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity="0.18" />
                <stop offset="100%" stopColor={color} stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={area} fill={`url(#lg-${vend.replace(/ /g,'')})`} />
            <path d={p} stroke={color} strokeWidth="2" fill="none" />
          </g>
        )
      })}
    </svg>
  )
}

// ── Donut chart ───────────────────────────────────────────────────────────────
function DonutChart({ items }: { items: { label: string; value: number; color: string }[] }) {
  const total = items.reduce((s, i) => s + i.value, 0)
  if (!total) return null
  let cumAngle = -Math.PI / 2
  const R = 60; const r = 36; const cx = 80; const cy = 80

  const arcs = items.map(item => {
    const angle = (item.value / total) * 2 * Math.PI
    const x1 = cx + R * Math.cos(cumAngle)
    const y1 = cy + R * Math.sin(cumAngle)
    cumAngle += angle
    const x2 = cx + R * Math.cos(cumAngle)
    const y2 = cy + R * Math.sin(cumAngle)
    const x3 = cx + r * Math.cos(cumAngle)
    const y3 = cy + r * Math.sin(cumAngle)
    const x4 = cx + r * Math.cos(cumAngle - angle)
    const y4 = cy + r * Math.sin(cumAngle - angle)
    const large = angle > Math.PI ? 1 : 0
    return { d: `M ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2} L ${x3} ${y3} A ${r} ${r} 0 ${large} 0 ${x4} ${y4} Z`, color: item.color }
  })

  return (
    <svg width={160} height={160} viewBox="0 0 160 160" style={{ flexShrink: 0 }}>
      {arcs.map((arc, i) => <path key={i} d={arc.d} fill={arc.color} />)}
    </svg>
  )
}

// ── Tabla de categorías por vendedor ─────────────────────────────────────────
function CatTable({ vendedor, cats, color }: { vendedor: string; cats: Record<string, CatRow>; color: string }) {
  const totalLitros = Object.values(cats).reduce((s, c) => s + c.litros, 0)
  const totalVenta  = Object.values(cats).reduce((s, c) => s + c.venta,  0)
  const sorted = Object.entries(cats).sort((a, b) => b[1].litros - a[1].litros)
  const router = useRouter()

  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 12 }}>
        <div>
          <p style={{ fontSize: 13, fontWeight: 900, color, letterSpacing: '0.03em' }}>{vendedor.toUpperCase()}</p>
          <p style={{ fontSize: 10, color: 'var(--muted)' }}>{Math.round((totalLitros / Math.max(totalLitros, 1)) * 100)}% del total</p>
        </div>
        <p style={{ fontSize: 22, fontWeight: 900, color: 'var(--cream)', letterSpacing: '-0.5px' }}>{fLn(totalLitros)} L</p>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <th style={{ textAlign: 'left', color: 'var(--muted)', fontWeight: 600, paddingBottom: 6 }}>Categoría</th>
            <th style={{ textAlign: 'right', color: 'var(--muted)', fontWeight: 600, paddingBottom: 6 }}>Litros</th>
            <th style={{ textAlign: 'right', color: 'var(--muted)', fontWeight: 600, paddingBottom: 6 }}>% Mix</th>
            <th style={{ textAlign: 'right', color: 'var(--muted)', fontWeight: 600, paddingBottom: 6 }}>vs Ant.</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(([cat, d]) => {
            const pct = totalLitros > 0 ? (d.litros / totalLitros) * 100 : 0
            const dlt = delta(d.litros, d.litrosAnterior)
            const catColor = CAT_COLOR[cat] ?? '#888'
            return (
              <tr key={cat} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                <td style={{ padding: '7px 0', display: 'flex', alignItems: 'center', gap: 7 }}>
                  <div style={{ width: 22, height: 3, borderRadius: 2, background: catColor, flexShrink: 0 }} />
                  <span style={{ color: 'var(--cream)' }}>{cat}</span>
                </td>
                <td style={{ textAlign: 'right', color: 'var(--cream)', fontWeight: 700, padding: '7px 0' }}>{fLn(d.litros)} L</td>
                <td style={{ textAlign: 'right', color: 'var(--muted)', padding: '7px 0' }}>{pct.toFixed(1)}%</td>
                <td style={{ textAlign: 'right', padding: '7px 0' }}>
                  {d.litrosAnterior > 0 ? (
                    <span style={{ color: dlt >= 0 ? '#34D399' : '#F87171', fontWeight: 700 }}>
                      {dlt >= 0 ? '↑' : '↓'}{Math.abs(dlt)}%
                    </span>
                  ) : <span style={{ color: '#555' }}>—</span>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <button
        onClick={() => router.push('/ventas/clientes')}
        style={{ marginTop: 12, background: 'none', border: 'none', color: color, fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, padding: 0 }}
      >
        Ver detalle completo <ChevronRight size={12} />
      </button>
    </div>
  )
}

// ── Diversificación barra ─────────────────────────────────────────────────────
function DivBar({ vendedor, div, color }: { vendedor: string; div: DivVend; color: string }) {
  const total = Object.values(div.categorias).reduce((s, v) => s + v, 0)
  const sorted = Object.entries(div.categorias).sort((a, b) => b[1] - a[1])
  const score = div.score
  const scoreColor = score >= 65 ? '#34D399' : score >= 45 ? '#F59E0B' : '#F87171'

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <p style={{ fontSize: 12, fontWeight: 800, color }}>{vendedor.toUpperCase()}</p>
        <div style={{ background: `${scoreColor}20`, border: `1px solid ${scoreColor}40`, borderRadius: 8, padding: '2px 10px' }}>
          <span style={{ fontSize: 12, fontWeight: 900, color: scoreColor }}>Score {score}/100</span>
        </div>
      </div>
      <div style={{ height: 12, borderRadius: 8, overflow: 'hidden', display: 'flex', marginBottom: 6 }}>
        {sorted.map(([cat, lit], i) => {
          const pct = total > 0 ? (lit / total) * 100 : 0
          const c = CAT_COLOR[cat] ?? MIX_COLORS[i % MIX_COLORS.length]
          return <div key={cat} style={{ width: `${pct}%`, background: c, minWidth: pct > 2 ? 2 : 0 }} />
        })}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', marginBottom: 6 }}>
        {sorted.slice(0, 5).map(([cat, lit]) => {
          const pct = total > 0 ? Math.round((lit / total) * 100) : 0
          const c = CAT_COLOR[cat] ?? '#888'
          return (
            <span key={cat} style={{ fontSize: 10, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 3 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: c, display: 'inline-block' }} />
              {cat} {pct}%
            </span>
          )
        })}
      </div>
      <p style={{ fontSize: 10, color: score < 50 ? '#F59E0B' : 'var(--muted)', fontStyle: 'italic' }}>{div.descripcion}</p>
    </div>
  )
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface Props {
  periodo: Periodo | null
  periodoAnteriorNombre: string
  kpis: KpiData
  evolucion: EvoDia[]
  promedioDiario: number
  proyeccionFin: number
  diasTranscurridos: number
  diasTotales: number
  mejorDia: { fecha: string; total: number } | null
  catPorVendedor: Record<string, Record<string, CatRow>>
  mixEstilos: MixItem[]
  topClientes: TopCliente[]
  metasPorVendedor: Record<string, number>
  metaTotal: number
  diversificacion: Record<string, DivVend>
  insights: InsightItem[]
  alertas: AlertaItem[]
  vendedoresScope: string[]
  isAdmin: boolean
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function AcumuladoClient({
  periodo, periodoAnteriorNombre, kpis, evolucion,
  promedioDiario, proyeccionFin, diasTranscurridos, diasTotales,
  mejorDia, catPorVendedor, mixEstilos, topClientes,
  metasPorVendedor, metaTotal, diversificacion, insights,
  alertas, vendedoresScope, isAdmin,
}: Props) {
  const isDesktop = useIsDesktop()
  const router = useRouter()

  const totalLitrosVend = vendedoresScope.reduce((s, v) => {
    return s + Object.values(catPorVendedor[v] ?? {}).reduce((ss, c) => ss + c.litros, 0)
  }, 0)

  const metaTotal2 = Object.values(metasPorVendedor).reduce((s, v) => s + v, 0) || metaTotal
  const pctMeta = metaTotal2 > 0 ? Math.round((kpis.litros / metaTotal2) * 100) : 0
  const metaColor = pctMeta >= 90 ? '#34D399' : pctMeta >= 70 ? '#F59E0B' : '#F87171'

  const insightIcon = (tipo: string) => tipo === 'positive' ? '↗' : tipo === 'negative' ? '↘' : tipo === 'warning' ? '⚡' : '●'
  const insightColor = (tipo: string) => tipo === 'positive' ? '#34D399' : tipo === 'negative' ? '#F87171' : tipo === 'warning' ? '#F59E0B' : '#60A5FA'
  const alertIcon = (tipo: string) => tipo === 'danger' ? '🔴' : tipo === 'warning' ? '🟡' : tipo === 'success' ? '✅' : '🔵'

  const nombreMes = periodo?.nombre ?? 'Período'

  return (
    <div style={{ padding: isDesktop ? '24px 28px 60px' : '14px 14px 80px', maxWidth: 1280, margin: '0 auto', width: '100%' }}>

      {/* ── Encabezado ──────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h1 style={{ fontSize: isDesktop ? 22 : 18, fontWeight: 900, color: 'var(--cream)', letterSpacing: '-0.5px' }}>
              Período Acumulado
            </h1>
            <span style={{ fontSize: 13, color: 'var(--gold)', fontWeight: 700 }}>{nombreMes}</span>
            <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', borderRadius: 8, padding: '4px 10px', fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>
              VS {periodoAnteriorNombre}
            </div>
          </div>
          {periodo && (
            <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>
              {periodo.fecha_inicio} — {periodo.fecha_fin}
            </p>
          )}
        </div>
      </div>

      {/* ── KPI Row ──────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
        <KpiCard icon={Droplets}    label="Litros Vendidos"  value={`${fL(kpis.litros)} L`}   deltaVal={delta(kpis.litros, kpis.litrosAnterior)}           color="#60A5FA" spark={evolucion.map(d => vendedoresScope.reduce((s, v) => s + ((d[v] as number) ?? 0), 0))} />
        <KpiCard icon={DollarSign}  label="Facturación"     value={fP(kpis.venta)}            deltaVal={delta(kpis.venta, kpis.ventaAnterior)}             color="#34D399" />
        <KpiCard icon={BarChart2}   label="Ticket Promedio" value={fPk(kpis.ticketPromedio)}   deltaVal={delta(kpis.ticketPromedio, kpis.ticketPromedioAnterior)} color="#F59E0B" />
        <KpiCard icon={Users}       label="Clientes Activos" value={String(kpis.clientesActivos)} sub={`${kpis.clientesActivos - kpis.clientesActivosAnterior >= 0 ? '+' : ''}${kpis.clientesActivos - kpis.clientesActivosAnterior} vs ant.`} color="#A78BFA" />
        <KpiCard icon={Award}       label="Categoría Líder" value={kpis.categoriaLider}       sub={`${kpis.categoriaLiderPct}% del total`} deltaVal={kpis.categoriaLiderPct - kpis.categoriaLiderPctAnterior} color="#D4AF37" wide />
      </div>

      {/* ── Fila principal: Evolución + Insights + Alertas ───────────────── */}
      <div style={{ display: isDesktop ? 'grid' : 'flex', gridTemplateColumns: '1fr 280px', flexDirection: 'column', gap: 14, marginBottom: 14 }}>

        {/* Evolución */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, padding: '16px 18px 14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <div>
              <p style={{ fontSize: 13, fontWeight: 800, color: 'var(--cream)' }}>EVOLUCIÓN DE LITROS VENDIDOS</p>
              <p style={{ fontSize: 10, color: 'var(--muted)' }}>Comparación diaria</p>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {vendedoresScope.map(v => (
                <div key={v} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <div style={{ width: 20, height: 2, background: VEND_COLOR[v] ?? '#888', borderRadius: 2 }} />
                  <span style={{ fontSize: 10, color: 'var(--muted)' }}>{v.split(' ')[0]}</span>
                </div>
              ))}
            </div>
          </div>

          <LineChart data={evolucion} vendedores={vendedoresScope} />

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
            {[
              { label: 'PROMEDIO DIARIO', value: `${fLn(promedioDiario)} L`, delta2: delta(promedioDiario, promedioDiario * 0.88) },
              { label: 'MEJOR DÍA', value: mejorDia ? `${fFecha(mejorDia.fecha)} — ${fLn(mejorDia.total)} L` : '—', delta2: null },
              { label: 'PROYECCIÓN FIN DE MES', value: `${fL(proyeccionFin)} L`, delta2: metaTotal2 > 0 ? delta(proyeccionFin, metaTotal2) : null },
            ].map(s => (
              <div key={s.label}>
                <p style={{ fontSize: 9, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.08em', marginBottom: 4 }}>{s.label}</p>
                <p style={{ fontSize: 14, fontWeight: 800, color: 'var(--cream)' }}>{s.value}</p>
                {s.delta2 !== null && s.delta2 !== undefined && (
                  <p style={{ fontSize: 10, color: s.delta2 >= 0 ? '#34D399' : '#F87171', marginTop: 2 }}>
                    {s.delta2 >= 0 ? '↑' : '↓'}{Math.abs(s.delta2)}% {s.label === 'PROYECCIÓN FIN DE MES' ? 'vs meta' : ''}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Insights + Alertas */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Insights */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, padding: '14px 16px', flex: insights.length ? '1' : undefined }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
              <Lightbulb size={13} color="#D4AF37" />
              <p style={{ fontSize: 11, fontWeight: 800, color: 'var(--cream)', letterSpacing: '0.04em' }}>INSIGHTS DEL PERÍODO</p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {insights.slice(0, 5).map((ins, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <span style={{ fontSize: 12, color: insightColor(ins.tipo), flexShrink: 0, marginTop: 1 }}>{insightIcon(ins.tipo)}</span>
                  <p style={{ fontSize: 11, color: '#aaa', lineHeight: 1.4 }}>{ins.texto}</p>
                </div>
              ))}
              {insights.length === 0 && <p style={{ fontSize: 11, color: 'var(--muted)' }}>Acumulando datos del período…</p>}
            </div>
          </div>

          {/* Alertas */}
          {alertas.length > 0 && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, padding: '14px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Bell size={13} color="#F59E0B" />
                  <p style={{ fontSize: 11, fontWeight: 800, color: 'var(--cream)', letterSpacing: '0.04em' }}>ALERTAS</p>
                </div>
                <span style={{ fontSize: 10, color: 'var(--gold)', fontWeight: 700 }}>Ver todas ({alertas.length})</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {alertas.slice(0, 4).map((a, i) => {
                  const borderColor = a.tipo === 'danger' ? '#EF4444' : a.tipo === 'warning' ? '#F59E0B' : a.tipo === 'success' ? '#34D399' : '#60A5FA'
                  return (
                    <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', borderLeft: `2px solid ${borderColor}`, paddingLeft: 8 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--cream)', lineHeight: 1.3 }}>{a.titulo}</p>
                        <p style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>{a.subtexto}</p>
                      </div>
                      <span style={{ fontSize: 9, color: '#555', flexShrink: 0 }}>{a.hace}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Comparación por categoría ────────────────────────────────────── */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, padding: '16px 20px', marginBottom: 14 }}>
        <p style={{ fontSize: 11, fontWeight: 800, color: 'var(--muted)', letterSpacing: '0.08em', marginBottom: 16 }}>COMPARACIÓN POR CATEGORÍA</p>
        <div style={{ display: isDesktop ? 'grid' : 'flex', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', flexDirection: 'column', gap: 24 }}>
          {vendedoresScope.map(v => (
            <CatTable key={v} vendedor={v} cats={catPorVendedor[v] ?? {}} color={VEND_COLOR[v] ?? '#888'} />
          ))}
        </div>
      </div>

      {/* ── Fila: Mix + Top Clientes + Metas ─────────────────────────────── */}
      <div style={{ display: isDesktop ? 'grid' : 'flex', gridTemplateColumns: '260px 1fr 260px', flexDirection: 'column', gap: 14, marginBottom: 14 }}>

        {/* Mix de estilos */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, padding: '16px 18px' }}>
          <p style={{ fontSize: 11, fontWeight: 800, color: 'var(--muted)', letterSpacing: '0.08em', marginBottom: 14 }}>MIX DE ESTILOS (LITROS)</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <DonutChart items={mixEstilos.slice(0, 7).map((m, i) => ({ label: m.categoria, value: m.litros, color: MIX_COLORS[i % MIX_COLORS.length] }))} />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {mixEstilos.slice(0, 5).map((m, i) => {
                const total = mixEstilos.reduce((s, x) => s + x.litros, 0)
                const pct = total > 0 ? Math.round((m.litros / total) * 100) : 0
                return (
                  <div key={m.categoria} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: MIX_COLORS[i], flexShrink: 0 }} />
                    <span style={{ fontSize: 10, color: 'var(--cream)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.categoria}</span>
                    <span style={{ fontSize: 10, color: 'var(--muted)' }}>{pct}%</span>
                    <span style={{ fontSize: 10, color: 'var(--muted)', minWidth: 40, textAlign: 'right' }}>{fLn(m.litros)}L</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Top clientes */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, padding: '16px 18px' }}>
          <p style={{ fontSize: 11, fontWeight: 800, color: 'var(--muted)', letterSpacing: '0.08em', marginBottom: 14 }}>TOP CLIENTES DEL PERÍODO</p>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                {['Cliente','Categoría','Litros','vs Ant.'].map(h => (
                  <th key={h} style={{ textAlign: h === 'Litros' || h === 'vs Ant.' ? 'right' : 'left', fontSize: 10, color: 'var(--muted)', fontWeight: 600, paddingBottom: 8 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {topClientes.slice(0, 6).map((c, i) => {
                const dlt = c.litrosAnterior > 0 ? delta(c.litros, c.litrosAnterior) : null
                return (
                  <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', cursor: 'pointer' }} onClick={() => router.push('/ventas/clientes')}>
                    <td style={{ padding: '8px 0', fontSize: 12, fontWeight: 600, color: 'var(--cream)', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nombre}</td>
                    <td style={{ padding: '8px 4px', fontSize: 10, color: 'var(--muted)' }}>{c.categoria}</td>
                    <td style={{ padding: '8px 0', textAlign: 'right', fontSize: 12, fontWeight: 700, color: 'var(--cream)' }}>{fLn(c.litros)} L</td>
                    <td style={{ padding: '8px 0', textAlign: 'right', fontSize: 11, fontWeight: 700, color: dlt === null ? '#555' : dlt >= 0 ? '#34D399' : '#F87171' }}>
                      {dlt !== null ? `${dlt >= 0 ? '↑' : '↓'}${Math.abs(dlt)}%` : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <button
            onClick={() => router.push('/ventas/clientes')}
            style={{ marginTop: 10, background: 'none', border: 'none', color: 'var(--gold)', fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, padding: 0 }}
          >
            Ver todos los clientes <ChevronRight size={12} />
          </button>
        </div>

        {/* Metas y proyección */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, padding: '16px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <p style={{ fontSize: 11, fontWeight: 800, color: 'var(--muted)', letterSpacing: '0.08em' }}>METAS Y PROYECCIÓN</p>
            <Target size={13} color="var(--gold)" />
          </div>

          {metaTotal2 > 0 ? (
            <>
              <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>PROGRESO ACTUAL</p>
              <p style={{ fontSize: 32, fontWeight: 900, color: metaColor, letterSpacing: '-1px', lineHeight: 1, marginBottom: 8 }}>{pctMeta}%</p>
              <div style={{ height: 8, background: 'rgba(255,255,255,0.06)', borderRadius: 8, overflow: 'hidden', marginBottom: 6 }}>
                <div style={{ height: '100%', width: `${Math.min(100, pctMeta)}%`, background: metaColor, borderRadius: 8, transition: 'width 0.5s' }} />
              </div>
              <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 14 }}>{fLn(kpis.litros)} L / {fLn(metaTotal2)} L</p>

              {/* Por vendedor */}
              {vendedoresScope.map(v => {
                const meta = metasPorVendedor[v] ?? 0
                const litros = Object.values(catPorVendedor[v] ?? {}).reduce((s, c) => s + c.litros, 0)
                const pct2 = meta > 0 ? Math.round((litros / meta) * 100) : 0
                const c2 = VEND_COLOR[v] ?? '#888'
                return (
                  <div key={v} style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 10, color: c2, fontWeight: 700 }}>{v.split(' ')[0]}</span>
                      <span style={{ fontSize: 10, color: 'var(--muted)' }}>{fLn(litros)} / {fLn(meta)} L</span>
                    </div>
                    <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${Math.min(100, pct2)}%`, background: c2, borderRadius: 4 }} />
                    </div>
                  </div>
                )
              })}

              <div style={{ paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                <p style={{ fontSize: 11, fontWeight: 800, color: 'var(--cream)' }}>
                  {fL(proyeccionFin)} L <span style={{ fontSize: 10, color: delta(proyeccionFin, metaTotal2) >= 0 ? '#34D399' : '#F87171', fontWeight: 700 }}>{delta(proyeccionFin, metaTotal2) >= 0 ? '↑' : '↓'}{Math.abs(delta(proyeccionFin, metaTotal2))}% vs meta</span>
                </p>
                <p style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>
                  {kpis.litros < metaTotal2 ? `Faltan ${fLn(metaTotal2 - kpis.litros)} L para la meta` : '¡Meta superada! 🎉'}
                </p>
              </div>
            </>
          ) : (
            <p style={{ fontSize: 12, color: 'var(--muted)' }}>Sin metas configuradas para este período</p>
          )}
        </div>
      </div>

      {/* ── Diversificación de canales ────────────────────────────────────── */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, padding: '16px 20px' }}>
        <p style={{ fontSize: 11, fontWeight: 800, color: 'var(--muted)', letterSpacing: '0.08em', marginBottom: 16 }}>DIVERSIFICACIÓN DE CANALES</p>
        <div style={{ display: isDesktop ? 'grid' : 'flex', gridTemplateColumns: 'repeat(auto-fit, minmax(300px,1fr))', flexDirection: 'column', gap: 24 }}>
          {vendedoresScope.map(v => (
            diversificacion[v] && (
              <DivBar key={v} vendedor={v} div={diversificacion[v]} color={VEND_COLOR[v] ?? '#888'} />
            )
          ))}
        </div>
      </div>
    </div>
  )
}
