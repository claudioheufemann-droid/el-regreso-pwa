'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import AppHeader from '@/components/ui/AppHeader'
import { StatTile, formatCLP, formatNumero } from '@/components/control-comercial/KpiCard'

interface AgingRow { tramo: string; orden: number; monto: number; clientes: number }
interface CobranzaKpis {
  deuda_vencida_actual: number
  deuda_mas_90_actual: number
  clientes_deudores: number
  concentracion_top5_pct: number
  monto_recuperado: number
  cuentas_regularizadas: number
  hay_snapshot_inicio: boolean
}
interface CobranzaResponse {
  periodo: { nombre: string; inicio: string; fin: string }
  aging: AgingRow[]
  kpis: CobranzaKpis | null
  dso: number | null
}

export default function CobranzaClient() {
  const [data, setData] = useState<CobranzaResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    fetch('/api/control-comercial/cobranza')
      .then(async r => {
        if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? 'Error al cargar Cobranza')
        return r.json()
      })
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const aging = data?.aging ?? []
  const montoMax = Math.max(1, ...aging.map(a => a.monto))
  const kpis = data?.kpis

  return (
    <div style={{ padding: '0 16px 24px', maxWidth: 1080, width: '100%', margin: '0 auto' }}>
      <AppHeader eyebrow={data?.periodo.nombre ?? 'Control Comercial'} title="Cobranza" />

      {loading && <div style={{ height: 300, borderRadius: 16, background: 'var(--surface)', border: '1px solid var(--border)', opacity: 0.5 }} />}
      {!loading && error && <p style={{ color: 'var(--muted)', textAlign: 'center', padding: 24 }}>{error}</p>}

      {!loading && !error && kpis && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 12, marginBottom: 20 }}>
            <StatTile titulo="Deuda vencida" valor={formatCLP(kpis.deuda_vencida_actual)} tono={kpis.deuda_vencida_actual > 0 ? 'alerta' : 'ok'} />
            <StatTile titulo="Deuda +90 días" valor={formatCLP(kpis.deuda_mas_90_actual)} tono="critico" />
            <StatTile
              titulo="Cobranza recuperada"
              valor={kpis.hay_snapshot_inicio ? formatCLP(kpis.monto_recuperado) : '—'}
              subtitulo={kpis.hay_snapshot_inicio ? data?.periodo.nombre : 'Acumulando histórico'}
              tono="ok"
            />
            <StatTile
              titulo="Cuentas regularizadas"
              valor={kpis.hay_snapshot_inicio ? formatNumero(kpis.cuentas_regularizadas) : '—'}
              subtitulo="Pasaron a $0 vencido"
            />
            <StatTile titulo="Clientes deudores" valor={formatNumero(kpis.clientes_deudores)} />
            <StatTile titulo="Concentración top 5" valor={`${kpis.concentracion_top5_pct.toFixed(1)}%`} tooltip="% de la deuda vencida total que está en los 5 clientes con más deuda" />
            <StatTile
              titulo="DSO"
              valor={data?.dso !== null && data?.dso !== undefined ? `${data.dso.toFixed(0)} días` : '—'}
              tooltip="Days Sales Outstanding = (deuda vencida actual / venta neta del período) × días del período"
            />
          </div>

          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 18, marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
              <h2 style={{ fontSize: 15, fontWeight: 800, color: 'var(--cream)' }}>Aging de deuda</h2>
              <Link href="/ventas/deudores" style={{ fontSize: 12, color: 'var(--gold)', fontWeight: 700, textDecoration: 'none' }}>Ver deudores →</Link>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {aging.map(a => (
                <div key={a.tramo} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
                    <span style={{ fontWeight: 700, color: a.orden === 6 ? 'var(--red)' : a.orden === 0 ? 'var(--green)' : 'var(--cream)' }}>{a.tramo}</span>
                    <span style={{ color: 'var(--muted)', fontWeight: 600 }}>{formatCLP(a.monto)} · {a.clientes} clientes</span>
                  </div>
                  <div style={{ height: 7, borderRadius: 4, background: 'var(--surface2)', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', width: `${(a.monto / montoMax) * 100}%`, borderRadius: 4,
                      background: a.orden === 6 ? 'var(--red)' : a.orden === 0 ? 'var(--green)' : 'var(--gold)',
                    }} />
                  </div>
                </div>
              ))}
            </div>
            <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 14, lineHeight: 1.5 }}>
              El ERP entrega tramos hasta &quot;+90 días&quot; como un solo bloque — no es posible partirlo en 91-180/181-365/+365 con la información actual sin inventarla.
            </p>
          </div>
        </>
      )}
    </div>
  )
}
