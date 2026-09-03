'use client'

import { useEffect, useMemo, useState } from 'react'
import { Trash2, Plus } from 'lucide-react'
import AppHeader from '@/components/ui/AppHeader'
import { formatCLP, formatLitros, formatNumero } from '@/components/control-comercial/KpiCard'
import type { MetaComercial, ScopeMeta, KpiMeta, Territorio } from '@/lib/control-comercial/tipos'

interface PeriodoRow { id: number; nombre: string; fecha_inicio: string; fecha_fin: string; activo: boolean }

const KPI_LABELS: Record<KpiMeta, string> = {
  ventas_clp: 'Ventas ($)',
  litros_total: 'Litros totales',
  litros_cerveza: 'Litros cerveza',
  litros_kombucha: 'Litros kombucha',
  nuevos_clientes: 'Nuevos clientes',
  reactivaciones: 'Reactivaciones',
  cobranza_recuperada: 'Cobranza recuperada ($)',
  cuentas_regularizadas: 'Cuentas regularizadas',
  barriles_recuperados: 'Barriles recuperados',
}
const SCOPE_LABELS: Record<ScopeMeta, string> = { compania: 'Compañía', territorio: 'Territorio/Canal', vendedor: 'Vendedor' }

function formatValorMeta(kpi: KpiMeta, v: number): string {
  if (kpi === 'ventas_clp' || kpi === 'cobranza_recuperada') return formatCLP(v)
  if (kpi.startsWith('litros')) return formatLitros(v)
  return formatNumero(v)
}

export default function MetasClient() {
  const [periodos, setPeriodos] = useState<PeriodoRow[]>([])
  const [periodoId, setPeriodoId] = useState<number | null>(null)
  const [territorios, setTerritorios] = useState<Territorio[]>([])
  const [metas, setMetas] = useState<MetaComercial[]>([])
  const [ventaReal, setVentaReal] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [scopeType, setScopeType] = useState<ScopeMeta>('compania')
  const [scopeValue, setScopeValue] = useState('')
  const [kpiType, setKpiType] = useState<KpiMeta>('ventas_clp')
  const [valor, setValor] = useState('')

  useEffect(() => {
    fetch('/api/control-comercial/periodos').then(r => r.json()).then(d => {
      setPeriodos(d.periodos ?? [])
      const activo = (d.periodos ?? []).find((p: PeriodoRow) => p.activo)
      setPeriodoId(activo?.id ?? d.periodos?.[0]?.id ?? null)
    })
    fetch('/api/control-comercial/territorios').then(r => r.json()).then(setTerritorios)
  }, [])

  useEffect(() => {
    if (!periodoId) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    setError(null)
    fetch(`/api/control-comercial/metas?periodo_id=${periodoId}`)
      .then(async r => {
        if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? 'Error al cargar metas')
        return r.json()
      })
      .then(setMetas)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))

    const periodo = periodos.find(p => p.id === periodoId)
    if (periodo) {
      const anio = Number(periodo.fecha_fin.slice(0, 4))
      const mes = Number(periodo.fecha_fin.slice(5, 7))
      fetch(`/api/control-comercial/resumen?anio=${anio}&mes=${mes}`)
        .then(r => r.json())
        .then(d => setVentaReal(d?.kpis?.find((k: { id: string; valor: number }) => k.id === 'venta_ytd')?.valor ?? null))
        .catch(() => setVentaReal(null))
    }
  }, [periodoId, periodos])

  const metaVentaCompania = metas.find(m => m.scope_type === 'compania' && m.kpi_type === 'ventas_clp')
  const cumplimiento = metaVentaCompania && ventaReal !== null ? (ventaReal / metaVentaCompania.valor_meta) * 100 : null

  const opcionesScopeValue = useMemo(() => {
    if (scopeType === 'territorio') return territorios.map(t => t.territorio)
    if (scopeType === 'vendedor') return [...new Set(territorios.map(t => t.responsable))]
    return []
  }, [scopeType, territorios])

  async function guardarMeta() {
    if (!periodoId || !valor) return
    setGuardando(true)
    setError(null)
    try {
      const res = await fetch('/api/control-comercial/metas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          periodo_id: periodoId, scope_type: scopeType,
          scope_value: scopeType === 'compania' ? null : scopeValue,
          kpi_type: kpiType, valor_meta: Number(valor),
        }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? 'No se pudo guardar la meta')
      const nueva = await res.json()
      setMetas(prev => [...prev.filter(m => !(m.scope_type === nueva.scope_type && m.scope_value === nueva.scope_value && m.kpi_type === nueva.kpi_type)), nueva])
      setValor('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar')
    } finally {
      setGuardando(false)
    }
  }

  async function eliminarMeta(id: number) {
    const prev = metas
    setMetas(m => m.filter(x => x.id !== id))
    const res = await fetch(`/api/control-comercial/metas?id=${id}`, { method: 'DELETE' })
    if (!res.ok) setMetas(prev)
  }

  return (
    <div style={{ padding: '0 16px 24px', maxWidth: 900, width: '100%', margin: '0 auto' }}>
      <AppHeader eyebrow="Control Comercial" title="Metas comerciales" />

      <div style={{ marginBottom: 18 }}>
        <select
          value={periodoId ?? ''}
          onChange={e => setPeriodoId(Number(e.target.value))}
          style={{
            background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
            padding: '9px 12px', color: 'var(--cream)', fontSize: 13, fontWeight: 700,
          }}
        >
          {periodos.map(p => (
            <option key={p.id} value={p.id}>{p.nombre}{p.activo ? ' · en curso' : ''}</option>
          ))}
        </select>
      </div>

      {metaVentaCompania && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 18, marginBottom: 20 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 8 }}>
            Real vs Meta — Ventas compañía
          </p>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8 }}>
            <span style={{ fontSize: 22, fontWeight: 900, color: 'var(--cream)' }}>{formatCLP(ventaReal ?? 0)}</span>
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>de {formatCLP(metaVentaCompania.valor_meta)}</span>
            {cumplimiento !== null && (
              <span style={{ fontSize: 13, fontWeight: 800, color: cumplimiento >= 100 ? 'var(--green)' : cumplimiento >= 80 ? 'var(--gold)' : 'var(--red)' }}>
                {cumplimiento.toFixed(1)}%
              </span>
            )}
          </div>
          <div style={{ height: 8, borderRadius: 5, background: 'var(--surface2)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${Math.min(100, cumplimiento ?? 0)}%`, background: 'var(--gold)', borderRadius: 5 }} />
          </div>
        </div>
      )}

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 18, marginBottom: 20 }}>
        <h2 style={{ fontSize: 14, fontWeight: 800, color: 'var(--cream)', marginBottom: 12 }}>Nueva meta</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 12 }}>
          <Select label="Alcance" value={scopeType} onChange={v => { setScopeType(v as ScopeMeta); setScopeValue('') }} options={Object.entries(SCOPE_LABELS)} />
          {scopeType !== 'compania' && (
            <Select label={scopeType === 'territorio' ? 'Territorio/Canal' : 'Vendedor'} value={scopeValue} onChange={setScopeValue}
              options={opcionesScopeValue.map(v => [v, v] as [string, string])} placeholder="Elegir…" />
          )}
          <Select label="KPI" value={kpiType} onChange={v => setKpiType(v as KpiMeta)} options={Object.entries(KPI_LABELS)} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700 }}>Valor meta</label>
            <input
              type="number" value={valor} onChange={e => setValor(e.target.value)} placeholder="0"
              style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 9, padding: '9px 10px', color: 'var(--cream)', fontSize: 13 }}
            />
          </div>
        </div>
        <button
          onClick={guardarMeta}
          disabled={guardando || !valor || (scopeType !== 'compania' && !scopeValue) || !periodoId}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 10,
            background: 'var(--gold)', color: '#0A0A0A', border: 'none', fontWeight: 800, fontSize: 13,
            cursor: 'pointer', opacity: guardando ? 0.6 : 1,
          }}
        >
          <Plus size={15} /> Guardar meta
        </button>
        {error && <p style={{ color: 'var(--red)', fontSize: 12, marginTop: 8 }}>{error}</p>}
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 18 }}>
        <h2 style={{ fontSize: 14, fontWeight: 800, color: 'var(--cream)', marginBottom: 12 }}>
          Metas configuradas {periodos.find(p => p.id === periodoId)?.nombre ? `— ${periodos.find(p => p.id === periodoId)?.nombre}` : ''}
        </h2>
        {loading ? (
          <p style={{ fontSize: 13, color: 'var(--muted)' }}>Cargando…</p>
        ) : metas.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'center', padding: '20px 0' }}>Sin metas configuradas para este período.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {metas.map(m => (
              <div key={m.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 4px', borderBottom: '1px solid var(--border-subtle)' }}>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--cream)' }}>
                    {SCOPE_LABELS[m.scope_type]}{m.scope_value ? ` · ${m.scope_value}` : ''}
                  </p>
                  <p style={{ fontSize: 11.5, color: 'var(--muted)' }}>{KPI_LABELS[m.kpi_type]}</p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--gold)' }}>{formatValorMeta(m.kpi_type, m.valor_meta)}</span>
                  <button onClick={() => eliminarMeta(m.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 4 }}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function Select({ label, value, onChange, options, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; options: [string, string][]; placeholder?: string
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700 }}>{label}</label>
      <select
        value={value} onChange={e => onChange(e.target.value)}
        style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 9, padding: '9px 10px', color: 'var(--cream)', fontSize: 13 }}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  )
}
