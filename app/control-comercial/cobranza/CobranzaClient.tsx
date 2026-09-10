'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  AlertTriangle, BarChart3, Clock3, PieChart, ShieldCheck, Sparkles, TrendingUp, Users, Wallet,
} from 'lucide-react'
import CCHeader from '@/components/control-comercial/CCHeader'
import { KpiCompacto } from '@/components/control-comercial/cards'
import { LineaSerie } from '@/components/control-comercial/charts'
import {
  CCPage, Card, CardHeader, ErrorState, InsightList, NotaPie, PageSkeleton,
  formatCLP, formatCLPCompacto, formatNumero, formatPctPlano, type InsightItem, type Tono,
} from '@/components/control-comercial/ui'

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
interface SerieRow { fecha: string; deuda_vencida: number; deuda_mas_90: number; clientes_deudores: number }
interface CobranzaResponse {
  periodo: { nombre: string; inicio: string; fin: string }
  aging: AgingRow[]
  kpis: CobranzaKpis | null
  dso: number | null
  serie: SerieRow[]
}

function tonoAging(orden: number): Tono {
  if (orden === 6) return 'critico'
  if (orden >= 4) return 'alerta'
  if (orden === 0) return 'ok'
  return 'marca'
}

export default function CobranzaClient() {
  const [data, setData] = useState<CobranzaResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(() => {
    let cancelado = false
    setLoading(true)
    setError(null)
    fetch('/api/control-comercial/cobranza')
      .then(async r => {
        if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? 'Error al cargar Cobranza')
        return r.json()
      })
      .then(d => { if (!cancelado) setData(d) })
      .catch(e => { if (!cancelado) setError(e instanceof Error ? e.message : 'Error al cargar') })
      .finally(() => { if (!cancelado) setLoading(false) })
    return () => { cancelado = true }
  }, [])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => cargar(), [cargar])

  const kpis = data?.kpis
  const aging = data?.aging ?? []
  const montoMax = Math.max(1, ...aging.map(a => a.monto))
  const totalAging = aging.reduce((a, r) => a + r.monto, 0)

  const serieFechas = (data?.serie ?? []).map(s => {
    const d = new Date(`${s.fecha}T12:00:00`)
    return `${d.getDate()}/${d.getMonth() + 1}`
  })
  const serieValores = (data?.serie ?? []).map(s => Number(s.deuda_vencida))

  const insights: InsightItem[] = []
  if (kpis) {
    if (kpis.hay_snapshot_inicio && kpis.monto_recuperado > 0) {
      insights.push({
        icon: TrendingUp, tono: 'ok',
        texto: `La cobranza recuperada creció ${formatCLPCompacto(kpis.monto_recuperado)} en el período.`,
        detalle: 'Mantén el impulso y prioriza la gestión temprana.',
      })
    }
    if (kpis.deuda_vencida_actual > 0) {
      const pct90 = (kpis.deuda_mas_90_actual / kpis.deuda_vencida_actual) * 100
      insights.push({
        icon: AlertTriangle, tono: 'critico',
        texto: `El ${formatPctPlano(pct90)} de la deuda vencida tiene más de 90 días.`,
        detalle: 'Enfoca tu estrategia en contactos de alto riesgo.',
      })
    }
    if (kpis.concentracion_top5_pct > 30) {
      insights.push({
        icon: PieChart, tono: 'alerta',
        texto: `La concentración top 5 es ${formatPctPlano(kpis.concentracion_top5_pct)} de la deuda vencida.`,
        detalle: 'Diversifica tu cartera y reduce dependencia.',
      })
    }
  }

  return (
    <CCPage>
      <CCHeader
        title="Cobranza"
        subtitle={data ? data.periodo.nombre : 'Cargando…'}
        subtitleTag={data ? 'En curso' : undefined}
      />

      {loading && <PageSkeleton />}
      {!loading && error && <ErrorState mensaje={error} onReintentar={cargar} />}

      {!loading && !error && kpis && (
        <div className="cc-enter" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Card style={{ overflow: 'hidden' }} padding={0}>
            <div style={{ display: 'flex', minWidth: 0 }}>
              <div style={{ flex: 1, minWidth: 0, padding: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 700, color: 'var(--cc-ink-2)' }}>
                  <AlertTriangle size={15} color="var(--cc-red)" /> Deuda vencida
                </span>
                <span style={{ fontSize: 22, fontWeight: 900, color: 'var(--cc-ink)', letterSpacing: '-0.8px', overflowWrap: 'anywhere' }}>
                  {formatCLP(kpis.deuda_vencida_actual)}
                </span>
              </div>

              <div
                style={{
                  flex: 1, minWidth: 0, padding: 16, display: 'flex', flexDirection: 'column', gap: 4,
                  background: 'var(--cc-red-soft)', borderLeft: '1px solid var(--cc-line)', position: 'relative',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--cc-red)' }}>+90 días</span>
                  <Clock3 size={15} color="var(--cc-red)" />
                </div>
                <span style={{ fontSize: 21, fontWeight: 900, color: 'var(--cc-red)', letterSpacing: '-0.7px', overflowWrap: 'anywhere' }}>
                  {formatCLP(kpis.deuda_mas_90_actual)}
                </span>
                <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--cc-red)', opacity: 0.85 }}>
                  {kpis.deuda_vencida_actual > 0 ? formatPctPlano((kpis.deuda_mas_90_actual / kpis.deuda_vencida_actual) * 100) : '0%'} del total vencido
                </span>
              </div>
            </div>
          </Card>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            <KpiCompacto icon={Wallet} tono="ok" label="Cobranza recuperada" valor={kpis.hay_snapshot_inicio ? formatCLPCompacto(kpis.monto_recuperado) : '—'} notaDelta={kpis.hay_snapshot_inicio ? undefined : 'Acumulando'} />
            <KpiCompacto icon={ShieldCheck} tono="marca" label="Ctas. regularizadas" valor={kpis.hay_snapshot_inicio ? formatNumero(kpis.cuentas_regularizadas) : '—'} notaDelta={kpis.hay_snapshot_inicio ? undefined : 'Acumulando'} />
            <KpiCompacto icon={Users} tono="neutral" label="Clientes deudores" valor={formatNumero(kpis.clientes_deudores)} />
            <KpiCompacto icon={PieChart} tono="alerta" label="Concentración top 5" valor={formatPctPlano(kpis.concentracion_top5_pct)} />
          </div>

          <Card>
            <CardHeader icon={BarChart3} titulo="Aging de deuda" />
            <div style={{ display: 'flex', height: 12, borderRadius: 12, overflow: 'hidden', marginBottom: 14, gap: 2 }}>
              {aging.map(a => a.monto > 0 ? (
                <div key={a.tramo} title={a.tramo} style={{ width: `${(a.monto / (totalAging || 1)) * 100}%`, background: `var(--cc-${tonoAging(a.orden) === 'marca' ? 'gold' : tonoAging(a.orden) === 'ok' ? 'green' : tonoAging(a.orden) === 'critico' ? 'red' : 'amber'})`, minWidth: 3 }} />
              ) : null)}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {aging.map(a => {
                const t = tonoAging(a.orden)
                const color = t === 'marca' ? 'var(--cc-gold)' : t === 'ok' ? 'var(--cc-green)' : t === 'critico' ? 'var(--cc-red)' : 'var(--cc-amber)'
                return (
                  <div key={a.tramo} style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                    <span style={{ width: 9, height: 9, borderRadius: '50%', background: color, flexShrink: 0 }} />
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--cc-ink)', width: 84, flexShrink: 0 }}>{a.tramo}</span>
                    <div style={{ flex: 1, height: 6, borderRadius: 6, background: 'var(--cc-neutral-soft)', overflow: 'hidden', minWidth: 0 }}>
                      <div style={{ height: '100%', width: `${(a.monto / montoMax) * 100}%`, background: color, borderRadius: 6 }} />
                    </div>
                    <span style={{ fontSize: 11.5, color: 'var(--cc-ink-3)', fontWeight: 700, flexShrink: 0, minWidth: 88, textAlign: 'right' }}>
                      {formatCLPCompacto(a.monto)} · {a.clientes} cl.
                    </span>
                  </div>
                )
              })}
            </div>
          </Card>

          {serieValores.length >= 2 && (
            <Card>
              <CardHeader icon={TrendingUp} titulo="Evolución de deuda vencida" sub="Últimos días con foto de cartera" />
              <LineaSerie labels={serieFechas} valores={serieValores} formatear={formatCLPCompacto} color="var(--cc-red)" alto={110} />
            </Card>
          )}

          {insights.length > 0 && (
            <Card>
              <CardHeader icon={Sparkles} titulo="Insights clave" />
              <InsightList items={insights} />
            </Card>
          )}

          <Link
            href="/ventas/deudores"
            className="cc-tap"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, minHeight: 46,
              borderRadius: 14, background: 'var(--cc-card)', border: '1px solid var(--cc-gold-line)',
              color: 'var(--cc-gold-deep)', fontWeight: 700, fontSize: 13.5, textDecoration: 'none',
            }}
          >
            Ver detalle de deudores
          </Link>

          <NotaPie>
            El ERP entrega los tramos vencidos hasta &quot;+90 días&quot; como un solo bloque — no es posible
            partirlo en 91-180/181-365/+365 con la información actual sin inventarla. La cobranza recuperada
            y las cuentas regularizadas se acumulan desde la primera foto diaria de deudores capturada.
          </NotaPie>
        </div>
      )}
    </CCPage>
  )
}
