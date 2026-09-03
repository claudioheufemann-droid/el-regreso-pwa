'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { TrendingUp, AlertTriangle, FileText } from 'lucide-react'
import AppHeader from '@/components/ui/AppHeader'
import KpiCard, { formatCLP, formatLitros } from '@/components/control-comercial/KpiCard'
import type { ResumenEjecutivoResponse, FilaVentaAgregada } from '@/lib/control-comercial/tipos'

type Comparar = 'anio_anterior' | 'anterior'
interface Insight { texto: string; tipo: 'oportunidad' | 'alerta'; drillHref: string }

function agruparPorTerritorio(filas: FilaVentaAgregada[]) {
  const map = new Map<string, { territorio: string; tipo: string; litros: number; monto: number }>()
  for (const f of filas) {
    const cur = map.get(f.territorio) ?? { territorio: f.territorio, tipo: f.tipo, litros: 0, monto: 0 }
    cur.litros += Number(f.litros)
    cur.monto += Number(f.monto)
    map.set(f.territorio, cur)
  }
  return [...map.values()].sort((a, b) => b.monto - a.monto)
}

export default function ResumenClient() {
  const [data, setData] = useState<ResumenEjecutivoResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [comparar, setComparar] = useState<Comparar>('anio_anterior')
  const [insights, setInsights] = useState<Insight[]>([])

  useEffect(() => {
    fetch('/api/control-comercial/insights').then(r => r.json()).then(d => setInsights(d.insights ?? [])).catch(() => {})
  }, [])

  useEffect(() => {
    let cancelado = false
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    setError(null)
    fetch(`/api/control-comercial/resumen?comparar=${comparar}`)
      .then(async r => {
        if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? 'Error al cargar el resumen')
        return r.json()
      })
      .then(d => { if (!cancelado) setData(d) })
      .catch(e => { if (!cancelado) setError(e.message) })
      .finally(() => { if (!cancelado) setLoading(false) })
    return () => { cancelado = true }
  }, [comparar])

  const territorios = data ? agruparPorTerritorio(data.ventasPorTerritorio) : []
  const montoMax = Math.max(1, ...territorios.map(t => t.monto))

  return (
    <div style={{ padding: '0 16px 24px', maxWidth: 1180, width: '100%', margin: '0 auto' }}>
      <AppHeader
        eyebrow={data ? `${data.periodo.nombre}${data.periodo.truncado ? ' · en curso' : ''}` : 'Control Comercial'}
        title="Resumen Ejecutivo"
        extraAction={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ display: 'flex', gap: 4, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 3 }}>
              {(['anio_anterior', 'anterior'] as Comparar[]).map(c => (
                <button
                  key={c}
                  onClick={() => setComparar(c)}
                  style={{
                    padding: '6px 10px', borderRadius: 7, border: 'none', cursor: 'pointer',
                    fontSize: 12, fontWeight: 700,
                    background: comparar === c ? 'var(--gold-dim)' : 'transparent',
                    color: comparar === c ? 'var(--gold)' : 'var(--muted)',
                  }}
                >
                  {c === 'anio_anterior' ? 'vs año anterior' : 'vs período anterior'}
                </button>
              ))}
            </div>
            <Link href="/control-comercial/reportes" style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 10,
              background: 'var(--gold)', color: '#0A0A0A', fontWeight: 800, fontSize: 12.5, textDecoration: 'none',
            }}>
              <FileText size={13} /> Generar Reporte
            </Link>
          </div>
        }
      />

      {loading && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} style={{ height: 108, borderRadius: 16, background: 'var(--surface)', border: '1px solid var(--border)', opacity: 0.5 }} />
          ))}
        </div>
      )}

      {!loading && error && (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)' }}>
          <p style={{ fontWeight: 700, color: 'var(--cream)', marginBottom: 6 }}>No se pudo cargar el Resumen Ejecutivo</p>
          <p style={{ fontSize: 13 }}>{error}</p>
        </div>
      )}

      {!loading && !error && data && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12, marginBottom: 24 }}>
            {data.kpis.map(kpi => <KpiCard key={kpi.id} kpi={kpi} />)}
          </div>

          {insights.length > 0 && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 18, marginBottom: 24 }}>
              <h2 style={{ fontSize: 15, fontWeight: 800, color: 'var(--cream)', marginBottom: 12 }}>Oportunidades y alertas</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {insights.map((ins, i) => (
                  <Link key={i} href={ins.drillHref} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 10,
                    textDecoration: 'none', background: 'var(--bg)',
                  }}>
                    {ins.tipo === 'oportunidad' ? <TrendingUp size={15} color="var(--green)" style={{ flexShrink: 0 }} /> : <AlertTriangle size={15} color="var(--red)" style={{ flexShrink: 0 }} />}
                    <span style={{ fontSize: 13, color: 'var(--cream)', fontWeight: 600 }}>{ins.texto}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 18 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
              <h2 style={{ fontSize: 15, fontWeight: 800, color: 'var(--cream)' }}>Venta por territorio y canal</h2>
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>{data.periodo.nombre}</span>
            </div>

            {territorios.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'center', padding: '24px 0' }}>
                Sin ventas reconocidas en este período todavía.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {territorios.map(t => (
                  <div key={t.territorio} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
                      <span style={{ fontWeight: 700, color: t.territorio === 'Sin territorio asignado' ? 'var(--muted)' : 'var(--cream)' }}>
                        {t.territorio}
                        {t.tipo === 'canal' && <span style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, marginLeft: 6 }}>· canal</span>}
                      </span>
                      <span style={{ color: 'var(--muted)', fontWeight: 600 }}>
                        {formatCLP(t.monto)} · {formatLitros(t.litros)}
                      </span>
                    </div>
                    <div style={{ height: 6, borderRadius: 4, background: 'var(--surface2)', overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', width: `${(t.monto / montoMax) * 100}%`, borderRadius: 4,
                        background: t.territorio === 'Sin territorio asignado' ? 'var(--muted)' : 'var(--gold)',
                      }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
            {territorios.some(t => t.territorio === 'Sin territorio asignado') && (
              <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 12, lineHeight: 1.5 }}>
                &quot;Sin territorio asignado&quot; agrupa ventas de cuentas ERP que no están mapeadas a un territorio/responsable
                (ej. bolsa histórica &quot;Equipo Ventas&quot;, cuenta &quot;CERVECERÍA&quot;) — se muestra aparte a propósito en vez de repartirla, para no inventar una atribución que no existe.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  )
}
