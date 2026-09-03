'use client'

import { useEffect, useMemo, useState } from 'react'
import { ArrowUpDown } from 'lucide-react'
import AppHeader from '@/components/ui/AppHeader'
import { formatCLP, formatLitros, formatNumero } from '@/components/control-comercial/KpiCard'

interface FilaEquipo {
  territorio: string; tipo: string; responsable: string | null
  venta_clp: number; litros: number
  clientes_activos: number; clientes_nuevos: number; clientes_perdidos: number
  deuda_vencida: number; barriles_criticos: number; barriles_total: number
  crecimientoYoyPct: number | null; cumplimientoMetaPct: number | null
  retencionPct: number | null; penetracionMulticategoriaPct: number | null
  margenClp: number | null; margenPct: number | null; margenCoberturaPct: number | null
}
interface EquipoResponse { periodo: { nombre: string }; filas: FilaEquipo[]; puedeVerMargen: boolean }

type Col = { key: keyof FilaEquipo | 'territorio'; label: string; fmt: (f: FilaEquipo) => string; align?: 'right' }

const COLS: Col[] = [
  { key: 'territorio', label: 'Territorio / Canal', fmt: f => f.territorio },
  { key: 'venta_clp', label: 'Venta $', fmt: f => formatCLP(f.venta_clp), align: 'right' },
  { key: 'litros', label: 'Litros', fmt: f => formatLitros(f.litros), align: 'right' },
  { key: 'crecimientoYoyPct', label: 'Crec. YoY', fmt: f => f.crecimientoYoyPct !== null ? `${f.crecimientoYoyPct >= 0 ? '+' : ''}${f.crecimientoYoyPct.toFixed(1)}%` : '—', align: 'right' },
  { key: 'cumplimientoMetaPct', label: 'Cumpl. meta', fmt: f => f.cumplimientoMetaPct !== null ? `${f.cumplimientoMetaPct.toFixed(0)}%` : '—', align: 'right' },
  { key: 'clientes_activos', label: 'Clientes activos', fmt: f => formatNumero(f.clientes_activos), align: 'right' },
  { key: 'clientes_nuevos', label: 'Nuevos', fmt: f => formatNumero(f.clientes_nuevos), align: 'right' },
  { key: 'clientes_perdidos', label: 'Perdidos', fmt: f => formatNumero(f.clientes_perdidos), align: 'right' },
  { key: 'retencionPct', label: 'Retención', fmt: f => f.retencionPct !== null ? `${f.retencionPct.toFixed(0)}%` : '—', align: 'right' },
  { key: 'deuda_vencida', label: 'Deuda vencida', fmt: f => formatCLP(f.deuda_vencida), align: 'right' },
  { key: 'barriles_criticos', label: 'Barriles críticos', fmt: f => `${f.barriles_criticos} / ${f.barriles_total}`, align: 'right' },
  { key: 'penetracionMulticategoriaPct', label: 'Multicategoría', fmt: f => f.penetracionMulticategoriaPct !== null ? `${f.penetracionMulticategoriaPct.toFixed(0)}%` : '—', align: 'right' },
]

const COLS_MARGEN: Col[] = [
  { key: 'margenPct', label: 'Margen %', fmt: f => f.margenPct !== null ? `${f.margenPct.toFixed(1)}%` : '—', align: 'right' },
  { key: 'margenClp', label: 'Margen $', fmt: f => f.margenClp !== null ? formatCLP(f.margenClp) : '—', align: 'right' },
]

export default function EquipoClient() {
  const [data, setData] = useState<EquipoResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<keyof FilaEquipo>('venta_clp')
  const [sortDir, setSortDir] = useState<1 | -1>(-1)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    fetch('/api/control-comercial/equipo')
      .then(async r => {
        if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? 'Error al cargar Equipo')
        return r.json()
      })
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const filas = useMemo(() => {
    if (!data) return []
    return [...data.filas].sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey]
      if (av === null) return 1
      if (bv === null) return -1
      if (typeof av === 'string') return sortDir * av.localeCompare(String(bv))
      return sortDir * ((av as number) - (bv as number))
    })
  }, [data, sortKey, sortDir])

  function toggleSort(key: keyof FilaEquipo) {
    if (key === sortKey) setSortDir(d => (d === 1 ? -1 : 1))
    else { setSortKey(key); setSortDir(-1) }
  }

  const cols = useMemo(() => data?.puedeVerMargen ? [...COLS, ...COLS_MARGEN] : COLS, [data?.puedeVerMargen])

  return (
    <div style={{ padding: '0 16px 24px', maxWidth: 1200, width: '100%', margin: '0 auto' }}>
      <AppHeader eyebrow={data?.periodo.nombre ?? 'Control Comercial'} title="Equipo" />

      {loading && <div style={{ height: 300, borderRadius: 16, background: 'var(--surface)', border: '1px solid var(--border)', opacity: 0.5 }} />}
      {!loading && error && <p style={{ color: 'var(--muted)', textAlign: 'center', padding: 24 }}>{error}</p>}

      {!loading && !error && data && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 18 }}>
          <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>
            Comparación multidimensional — no es un ranking por litros. Click en una columna para ordenar.
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 1000 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {cols.map(c => (
                    <th
                      key={c.key}
                      onClick={() => toggleSort(c.key as keyof FilaEquipo)}
                      style={{
                        textAlign: c.align ?? 'left', padding: '8px', color: sortKey === c.key ? 'var(--gold)' : 'var(--muted)',
                        fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', userSelect: 'none',
                      }}
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        {c.label} {sortKey === c.key && <ArrowUpDown size={11} />}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filas.map(f => (
                  <tr key={f.territorio} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    {cols.map(c => (
                      <td key={c.key} style={{ padding: '9px 8px', textAlign: c.align ?? 'left', color: c.key === 'territorio' ? 'var(--cream)' : 'var(--muted)', fontWeight: c.key === 'territorio' ? 700 : 500, whiteSpace: 'nowrap' }}>
                        {c.key === 'territorio' ? (
                          <div>
                            <span>{f.territorio}</span>
                            {f.responsable && <span style={{ fontSize: 10.5, color: 'var(--muted)', marginLeft: 6 }}>· {f.responsable}</span>}
                          </div>
                        ) : c.key === 'crecimientoYoyPct' && f.crecimientoYoyPct !== null ? (
                          <span style={{ color: f.crecimientoYoyPct >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 700 }}>{c.fmt(f)}</span>
                        ) : c.key === 'clientes_perdidos' && f.clientes_perdidos > 0 ? (
                          <span style={{ color: 'var(--red)' }}>{c.fmt(f)}</span>
                        ) : c.key === 'barriles_criticos' && f.barriles_criticos > 0 ? (
                          <span style={{ color: 'var(--red)' }}>{c.fmt(f)}</span>
                        ) : c.fmt(f)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 14, lineHeight: 1.5 }}>
            {data.puedeVerMargen
              ? 'Margen calculado solo sobre los productos que tienen costo cargado en Rentabilidad — puede no cubrir el 100% de la venta de cada territorio.'
              : 'Margen por territorio oculto — requiere permiso de costos (Rentabilidad).'}
          </p>
        </div>
      )}
    </div>
  )
}
