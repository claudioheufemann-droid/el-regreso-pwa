'use client'

/**
 * Análisis de Brecha de Margen — admin-only. Margen real (CLP) = revenue
 * verificado (tabla ventas) × % margen cargado en costos_productos.
 *
 * Nota de calidad de datos: los % de margen vienen de una planilla de costos
 * entregada por el usuario. Los SKUs sin % cargado se muestran aparte, sin
 * inventar un margen — "sin dato de costo" es honesto, 0% sería falso.
 */
import { useState, useMemo } from 'react'
import { TrendingUp, AlertTriangle, Droplets } from 'lucide-react'
import AppHeader from '@/components/ui/AppHeader'
import type { MargenRow } from './page'

function fmtPeso(n: number) {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (Math.abs(n) >= 1000) return `$${Math.round(n / 1000)}k`
  return `$${Math.round(n)}`
}
function fmtPesoFull(n: number) { return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n) }

function colorMargen(pct: number) {
  if (pct >= 65) return '#4ADE80'
  if (pct >= 50) return '#D4AF37'
  return '#F87171'
}

export default function MargenClient({ rows }: { rows: MargenRow[] }) {
  const [orden, setOrden] = useState<'margen_clp' | 'ppl' | 'margen_pct' | 'litros'>('margen_clp')

  const conDato = rows.filter(r => r.margen_pct != null)
  const sinDato = rows.filter(r => r.margen_pct == null)

  const ordenados = useMemo(() => {
    return [...conDato].sort((a, b) => (b[orden] ?? 0) - (a[orden] ?? 0))
  }, [conDato, orden])

  const totalRevenue = conDato.reduce((s, r) => s + r.revenue, 0)
  const totalMargen  = conDato.reduce((s, r) => s + (r.margen_clp ?? 0), 0)
  const margenPromedioPonderado = totalRevenue > 0 ? (totalMargen / totalRevenue) * 100 : 0
  const litrosSinDato = sinDato.reduce((s, r) => s + r.litros, 0)
  const revenueSinDato = sinDato.reduce((s, r) => s + r.revenue, 0)

  const maxMargen = Math.max(1, ...ordenados.map(r => r.margen_clp ?? 0))

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', paddingBottom: 100 }}>
      <div style={{ maxWidth: 1300, margin: '0 auto', padding: '0 16px' }}>
        <div style={{ paddingTop: 'max(16px, env(safe-area-inset-top, 16px))' }}>
          <AppHeader eyebrow="Solo administración" title="Brecha de Margen" />
        </div>

        {/* KPI resumen */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 14 }}>
          <div className="card card-pad" style={{ borderTop: '2px solid #4ADE80' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <TrendingUp size={13} color="#4ADE80" />
              <span style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.6px', textTransform: 'uppercase' }}>Margen total</span>
            </div>
            <p style={{ fontSize: 20, fontWeight: 900, color: 'var(--cream)', letterSpacing: '-0.6px' }}>{fmtPesoFull(totalMargen)}</p>
            <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 4 }}>{margenPromedioPonderado.toFixed(1)}% ponderado sobre {fmtPeso(totalRevenue)}</p>
          </div>
          <div className="card card-pad" style={{ borderTop: '2px solid #D4AF37' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <Droplets size={13} color="#D4AF37" />
              <span style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.6px', textTransform: 'uppercase' }}>SKUs con costo</span>
            </div>
            <p style={{ fontSize: 20, fontWeight: 900, color: 'var(--cream)', letterSpacing: '-0.6px' }}>{conDato.length} / {rows.length}</p>
            <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 4 }}>{sinDato.length} SKUs sin dato de costo cargado</p>
          </div>
        </div>

        {/* Orden */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 12, overflowX: 'auto', scrollbarWidth: 'none' }}>
          {([['margen_clp', 'Margen $'], ['ppl', 'PPL (margen/L)'], ['margen_pct', '% Margen'], ['litros', 'Litros']] as const).map(([k, label]) => (
            <button key={k} onClick={() => setOrden(k)} style={{
              flexShrink: 0, minHeight: 34, padding: '0 13px', borderRadius: 20, cursor: 'pointer', whiteSpace: 'nowrap',
              background: orden === k ? 'var(--gold)' : 'var(--surface)',
              border: `1px solid ${orden === k ? 'var(--gold)' : 'var(--border)'}`,
              color: orden === k ? '#080808' : 'var(--muted)', fontSize: 12, fontWeight: 700,
            }}>{label}</button>
          ))}
        </div>

        {/* Ranking de margen */}
        <div className="card card-pad-lg" style={{ marginBottom: 14 }}>
          <p style={{ fontSize: 13, fontWeight: 800, color: 'var(--cream)', marginBottom: 4 }}>Ranking de margen por SKU</p>
          <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginBottom: 14 }}>
            PPL = margen real en CLP por litro vendido. Mide cuánto deja cada litro, no solo cuánto se vende.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {ordenados.map((r, i) => {
              const pct = r.margen_pct ?? 0
              const color = colorMargen(pct)
              return (
                <div key={r.producto} style={{ padding: '10px 12px', borderRadius: 12, background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                      <span style={{ fontSize: 11, fontWeight: 900, color: i < 3 ? '#D4AF37' : 'rgba(255,255,255,0.3)', width: 18, flexShrink: 0 }}>{i + 1}</span>
                      <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--cream)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.producto}</p>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 800, color, padding: '2px 8px', borderRadius: 8, background: `${color}15`, flexShrink: 0 }}>{pct.toFixed(1)}%</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ flex: 1, height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${((r.margen_clp ?? 0) / maxMargen) * 100}%`, background: color, borderRadius: 3 }} />
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--cream)', flexShrink: 0, minWidth: 64, textAlign: 'right' }}>{fmtPeso(r.margen_clp ?? 0)}</span>
                  </div>
                  <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', marginTop: 4 }}>
                    {r.litros.toLocaleString('es-CL')} L · PPL {fmtPesoFull(Math.round(r.ppl ?? 0))} · revenue {fmtPeso(r.revenue)}
                  </p>
                </div>
              )
            })}
          </div>
        </div>

        {/* Sin dato de costo */}
        {sinDato.length > 0 && (
          <div className="card card-pad-lg">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <AlertTriangle size={14} color="#F97316" />
              <p style={{ fontSize: 13, fontWeight: 800, color: 'var(--cream)' }}>Sin dato de costo cargado</p>
            </div>
            <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginBottom: 12 }}>
              {sinDato.length} SKUs · {litrosSinDato.toLocaleString('es-CL')} L · {fmtPeso(revenueSinDato)} de revenue sin margen calculable. Carga su costo para incluirlos.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {sinDato.sort((a, b) => b.revenue - a.revenue).map(r => (
                <div key={r.producto} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.02)' }}>
                  <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.producto}</span>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', flexShrink: 0, marginLeft: 8 }}>{fmtPeso(r.revenue)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
