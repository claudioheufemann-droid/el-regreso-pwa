'use client'

import { useEffect, useMemo, useState } from 'react'
import AppHeader from '@/components/ui/AppHeader'
import GraficoVentasAnual, { type PuntoSerie } from '@/components/control-comercial/GraficoVentasAnual'
import { formatCLP, formatLitros } from '@/components/control-comercial/KpiCard'
import type { FilaVentaAgregada } from '@/lib/control-comercial/tipos'

type Unidad = 'clp' | 'litros'
type Cat = 'total' | 'Cerveza' | 'Kombucha'

interface FilaSerieAPI {
  mes: number; nombre: string
  litros_total: number; litros_cerveza: number; litros_kombucha: number
  monto_total: number; monto_cerveza: number; monto_kombucha: number
}

interface VentasResponse {
  anio: number; anioComparado: number
  serieActual: FilaSerieAPI[]
  serieComparada: FilaSerieAPI[]
  ventasPorTerritorio: FilaVentaAgregada[]
}

function valorDe(f: FilaSerieAPI, unidad: Unidad, cat: Cat): number {
  const campo = cat === 'total' ? 'total' : cat === 'Cerveza' ? 'cerveza' : 'kombucha'
  return unidad === 'clp' ? f[`monto_${campo}` as const] : f[`litros_${campo}` as const]
}

function agruparPorTerritorio(filas: FilaVentaAgregada[], cat: Cat) {
  const map = new Map<string, { territorio: string; litros: number; monto: number; cerveza: number; kombucha: number }>()
  for (const f of filas) {
    // Cuentas ERP sin territorio/responsable mapeado — a pedido de Claudio no se listan
    // acá (el total del gráfico de arriba sí las incluye).
    if (f.territorio === 'Sin territorio asignado') continue
    if (cat !== 'total' && f.categoria_producto !== cat) continue
    const cur = map.get(f.territorio) ?? { territorio: f.territorio, litros: 0, monto: 0, cerveza: 0, kombucha: 0 }
    cur.litros += Number(f.litros)
    cur.monto += Number(f.monto)
    if (f.categoria_producto === 'Cerveza') cur.cerveza += Number(f.monto)
    if (f.categoria_producto === 'Kombucha') cur.kombucha += Number(f.monto)
    map.set(f.territorio, cur)
  }
  return [...map.values()].sort((a, b) => b.monto - a.monto)
}

export default function VentasClient() {
  const [data, setData] = useState<VentasResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [unidad, setUnidad] = useState<Unidad>('clp')
  const [cat, setCat] = useState<Cat>('total')
  const [anio, setAnio] = useState(new Date().getFullYear())

  useEffect(() => {
    let cancelado = false
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    setError(null)
    fetch(`/api/control-comercial/ventas?anio=${anio}&anioComparado=${anio - 1}`)
      .then(async r => {
        if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? 'Error al cargar Ventas')
        return r.json()
      })
      .then(d => { if (!cancelado) setData(d) })
      .catch(e => { if (!cancelado) setError(e.message) })
      .finally(() => { if (!cancelado) setLoading(false) })
    return () => { cancelado = true }
  }, [anio])

  const serieActual: PuntoSerie[] = useMemo(
    () => (data?.serieActual ?? []).map(f => ({ nombre: f.nombre, valor: valorDe(f, unidad, cat) })),
    [data, unidad, cat],
  )
  const serieComparada: PuntoSerie[] = useMemo(
    () => (data?.serieComparada ?? []).map(f => ({ nombre: f.nombre, valor: valorDe(f, unidad, cat) })),
    [data, unidad, cat],
  )
  const territorios = useMemo(() => data ? agruparPorTerritorio(data.ventasPorTerritorio, cat) : [], [data, cat])
  const formatear = unidad === 'clp' ? formatCLP : formatLitros

  const totalActual = serieActual.reduce((a, p) => a + p.valor, 0)
  const totalComparado = serieComparada.reduce((a, p) => a + p.valor, 0)
  const crecimiento = totalComparado ? ((totalActual - totalComparado) / Math.abs(totalComparado)) * 100 : null

  return (
    <div style={{ padding: '0 16px 24px', maxWidth: 1180, width: '100%', margin: '0 auto' }}>
      <AppHeader eyebrow="Control Comercial" title="Ventas" />

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        <Pills value={anio} options={[anio - 2, anio - 1, anio, anio + 0].filter((v, i, a) => a.indexOf(v) === i)} onChange={setAnio} label="Año" />
        <Pills value={unidad} options={['clp', 'litros'] as Unidad[]} labels={{ clp: '$', litros: 'Litros' }} onChange={setUnidad} />
        <Pills value={cat} options={['total', 'Cerveza', 'Kombucha'] as Cat[]} labels={{ total: 'Total', Cerveza: 'Cerveza', Kombucha: 'Kombucha' }} onChange={setCat} />
      </div>

      {loading && <div style={{ height: 300, borderRadius: 16, background: 'var(--surface)', border: '1px solid var(--border)', opacity: 0.5 }} />}
      {!loading && error && <p style={{ color: 'var(--muted)', textAlign: 'center', padding: 24 }}>{error}</p>}

      {!loading && !error && data && (
        <>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 18, marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
              <div>
                <p style={{ fontSize: 20, fontWeight: 900, color: 'var(--cream)' }}>{formatear(totalActual)}</p>
                <p style={{ fontSize: 11, color: 'var(--muted)' }}>
                  {data.anio} · {cat === 'total' ? 'Cerveza + Kombucha' : cat}
                </p>
              </div>
              {crecimiento !== null && (
                <span style={{ fontSize: 13, fontWeight: 800, color: crecimiento >= 0 ? 'var(--green)' : 'var(--red)' }}>
                  {crecimiento >= 0 ? '+' : ''}{crecimiento.toFixed(1)}% vs {data.anioComparado}
                </span>
              )}
            </div>
            <GraficoVentasAnual
              actual={serieActual}
              comparado={serieComparada}
              anioActual={data.anio}
              anioComparado={data.anioComparado}
              formatear={formatear}
            />
          </div>

          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 18 }}>
            <h2 style={{ fontSize: 15, fontWeight: 800, color: 'var(--cream)', marginBottom: 14 }}>
              Por territorio y canal — {data.anio}
            </h2>
            {territorios.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'center', padding: '24px 0' }}>Sin ventas en este año.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 560 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--muted)', fontWeight: 700 }}>Territorio</th>
                      <th style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--muted)', fontWeight: 700 }}>Cerveza</th>
                      <th style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--muted)', fontWeight: 700 }}>Kombucha</th>
                      <th style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--muted)', fontWeight: 700 }}>Total</th>
                      <th style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--muted)', fontWeight: 700 }}>Litros</th>
                    </tr>
                  </thead>
                  <tbody>
                    {territorios.map(t => (
                      <tr key={t.territorio} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                        <td style={{ padding: '8px', fontWeight: 700, color: 'var(--cream)' }}>{t.territorio}</td>
                        <td style={{ padding: '8px', textAlign: 'right', color: 'var(--muted)' }}>{formatCLP(t.cerveza)}</td>
                        <td style={{ padding: '8px', textAlign: 'right', color: 'var(--muted)' }}>{formatCLP(t.kombucha)}</td>
                        <td style={{ padding: '8px', textAlign: 'right', fontWeight: 700, color: 'var(--cream)' }}>{formatCLP(t.monto)}</td>
                        <td style={{ padding: '8px', textAlign: 'right', color: 'var(--muted)' }}>{formatLitros(t.litros)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function Pills<T extends string | number>({ value, options, onChange, labels, label }: {
  value: T; options: T[]; onChange: (v: T) => void; labels?: Record<string, string>; label?: string
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      {label && <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700 }}>{label}</span>}
      <div style={{ display: 'flex', gap: 4, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 3 }}>
        {options.map(opt => (
          <button
            key={String(opt)}
            onClick={() => onChange(opt)}
            style={{
              padding: '6px 10px', borderRadius: 7, border: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: 700,
              background: value === opt ? 'var(--gold-dim)' : 'transparent',
              color: value === opt ? 'var(--gold)' : 'var(--muted)',
            }}
          >
            {labels?.[String(opt)] ?? String(opt)}
          </button>
        ))}
      </div>
    </div>
  )
}
