'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import AppHeader from '@/components/ui/AppHeader'
import { StatTile, formatNumero } from '@/components/control-comercial/KpiCard'

interface EstadoBarriles { total: number; normales: number; atencion: number; atrasados: number; criticos: number; promedio_dias_fuera: number }
interface TopCliente { nombre_fantasia: string; cantidad: number; dias_max: number; criticos: number }
interface Recuperados { recuperados: number; hay_historial: boolean }
interface BarrilesResponse {
  periodo: { nombre: string; inicio: string; fin: string }
  estado: EstadoBarriles | null
  topClientes: TopCliente[]
  recuperados: Recuperados | null
}

const BUCKETS = [
  { key: 'normales', label: 'Normal (0-30d)', color: 'var(--green)' },
  { key: 'atencion', label: 'Atención (31-60d)', color: 'var(--gold)' },
  { key: 'atrasados', label: 'Atrasado (61-90d)', color: '#F97316' },
  { key: 'criticos', label: 'Crítico (+90d)', color: 'var(--red)' },
] as const

export default function BarrilesClient() {
  const [data, setData] = useState<BarrilesResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    fetch('/api/control-comercial/barriles')
      .then(async r => {
        if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? 'Error al cargar Barriles')
        return r.json()
      })
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const estado = data?.estado
  const recuperados = data?.recuperados
  const total = Math.max(1, estado?.total ?? 0)

  return (
    <div style={{ padding: '0 16px 24px', maxWidth: 1080, width: '100%', margin: '0 auto' }}>
      <AppHeader eyebrow={data?.periodo.nombre ?? 'Control Comercial'} title="Barriles" />

      {loading && <div style={{ height: 300, borderRadius: 16, background: 'var(--surface)', border: '1px solid var(--border)', opacity: 0.5 }} />}
      {!loading && error && <p style={{ color: 'var(--muted)', textAlign: 'center', padding: 24 }}>{error}</p>}

      {!loading && !error && estado && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 12, marginBottom: 20 }}>
            <StatTile titulo="Barriles pendientes" valor={formatNumero(estado.total)} />
            <StatTile titulo="Críticos (+90d)" valor={formatNumero(estado.criticos)} tono="critico" />
            <StatTile titulo="Promedio días fuera" valor={`${estado.promedio_dias_fuera.toFixed(0)} d`} />
            <StatTile
              titulo="Recuperados"
              valor={recuperados?.hay_historial ? formatNumero(recuperados.recuperados) : '—'}
              subtitulo={recuperados?.hay_historial ? data?.periodo.nombre : 'Acumulando histórico'}
              tono="ok"
            />
          </div>

          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 18, marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
              <h2 style={{ fontSize: 15, fontWeight: 800, color: 'var(--cream)' }}>Estado de la flota de barriles</h2>
              <Link href="/ventas/barriles" style={{ fontSize: 12, color: 'var(--gold)', fontWeight: 700, textDecoration: 'none' }}>Ver detalle →</Link>
            </div>
            <div style={{ height: 22, borderRadius: 8, overflow: 'hidden', display: 'flex', marginBottom: 12 }}>
              {BUCKETS.map(b => {
                const val = estado[b.key as keyof EstadoBarriles] as number
                const pct = (val / total) * 100
                return pct > 0 ? <div key={b.key} title={`${b.label}: ${val}`} style={{ width: `${pct}%`, background: b.color }} /> : null
              })}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
              {BUCKETS.map(b => (
                <div key={b.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 3, background: b.color, display: 'inline-block' }} />
                  {b.label}: <span style={{ color: 'var(--cream)', fontWeight: 800 }}>{estado[b.key as keyof EstadoBarriles] as number}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 18 }}>
            <h2 style={{ fontSize: 15, fontWeight: 800, color: 'var(--cream)', marginBottom: 14 }}>Clientes con más barriles</h2>
            {(data?.topClientes ?? []).length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'center', padding: '20px 0' }}>Sin datos.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {data!.topClientes.map(c => (
                  <div key={c.nombre_fantasia} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 4px', borderBottom: '1px solid var(--border-subtle)' }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--cream)' }}>{c.nombre_fantasia}</span>
                    <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>
                      {c.cantidad} barriles · máx {c.dias_max}d
                      {c.criticos > 0 && <span style={{ color: 'var(--red)', fontWeight: 700 }}> · {c.criticos} críticos</span>}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
