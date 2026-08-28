'use client'

import { useState, useEffect, useCallback } from 'react'
import AppHeader from '@/components/ui/AppHeader'
import { ErrorState, SkeletonCard } from '@/components/ui/States'
import { REGIONES_OPERATIVAS } from '@/lib/regiones'

interface Resumen {
  total_pedidos: number
  pedidos_otif: number
  otif_pct: number | null
  completados: number
  rechazados: number
  devueltos: number
  efectividad_pct: number | null
}
interface PuntoSerie { fecha: string; otif_pct: number; efectividad_pct: number }

const ORANGE = '#F97316'
const BLUE = '#5B8AA8'

function hoyISO() { return new Date().toISOString().slice(0, 10) }
function hace30diasISO() { return new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10) }

export default function KpisClient() {
  const [desde, setDesde] = useState(hace30diasISO())
  const [hasta, setHasta] = useState(hoyISO())
  const [region, setRegion] = useState('')
  const [resumen, setResumen] = useState<Resumen | null>(null)
  const [serie, setSerie] = useState<PuntoSerie[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Antes esta carga no manejaba el fallo: si la red se caía o la API
  // devolvía error, `resumen` quedaba en null y la condición de abajo
  // (`loading || !resumen`) dejaba la pantalla en "Cargando…" para siempre,
  // sin forma de reintentar. Ahora el fallo es un estado más, con salida.
  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    const params = new URLSearchParams({ desde, hasta })
    if (region) params.set('region', region)
    fetch(`/api/logistica/kpis?${params}`)
      .then(async r => {
        if (!r.ok) throw new Error(`La API respondió ${r.status}`)
        return r.json()
      })
      .then(data => { setResumen(data.resumen); setSerie(data.serie ?? []) })
      .catch(err => setError(err instanceof Error ? err.message : 'Error desconocido'))
      .finally(() => setLoading(false))
  }, [desde, hasta, region])

  useEffect(() => { load() }, [load])

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh' }}>
      <AppHeader eyebrow="Logística" title="KPIs" backHref="/" />

      <div style={{ maxWidth: 640, margin: '0 auto', padding: '0 16px 100px' }}>

        {/* ── Filtros ── */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          <input type="date" value={desde} onChange={e => setDesde(e.target.value)} style={{ ...inputStyle, flex: 1, minWidth: 130 }} />
          <input type="date" value={hasta} onChange={e => setHasta(e.target.value)} style={{ ...inputStyle, flex: 1, minWidth: 130 }} />
          <select value={region} onChange={e => setRegion(e.target.value)} style={{ ...inputStyle, flex: 1, minWidth: 130 }}>
            <option value="">Todas las regiones</option>
            {REGIONES_OPERATIVAS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>

        {loading ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <SkeletonCard /><SkeletonCard />
          </div>
        ) : error || !resumen ? (
          <ErrorState
            title="No pudimos cargar los indicadores"
            hint="Revisa tu conexión y vuelve a intentar. Los datos siguen guardados."
            detail={error}
            showDetail
            onRetry={load}
          />
        ) : (
          <>
            {/* ── Tarjetas principales ── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
              <KpiCard label="OTIF" pct={resumen.otif_pct} color={ORANGE} sub={`${resumen.pedidos_otif} de ${resumen.total_pedidos} pedidos`} />
              <KpiCard label="Tasa de Efectividad" pct={resumen.efectividad_pct} color={BLUE} sub={`${resumen.completados} completados`} />
            </div>

            {/* ── Desglose ── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 24 }}>
              <MiniStat label="Completados" value={resumen.completados} color="#4ADE80" />
              <MiniStat label="Rechazados" value={resumen.rechazados} color="#FF6666" />
              <MiniStat label="Devueltos" value={resumen.devueltos} color="#FBBF24" />
            </div>

            {/* ── Tendencia diaria ── */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <p style={{ fontSize: 12, fontWeight: 800, color: 'var(--cream)' }}>Tendencia diaria</p>
                <div style={{ display: 'flex', gap: 12 }}>
                  <Legend color={ORANGE} label="OTIF" />
                  <Legend color={BLUE} label="Efectividad" />
                </div>
              </div>
              {serie.length < 2 ? (
                <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>No hay suficientes datos en el período para mostrar tendencia.</p>
              ) : (
                <TrendChart serie={serie} />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function KpiCard({ label, pct, color, sub }: { label: string; pct: number | null; color: string; sub: string }) {
  return (
    <div style={{ background: 'var(--surface)', border: `1px solid ${color}30`, borderRadius: 16, padding: 16 }}>
      <p style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 }}>{label}</p>
      <p style={{ fontSize: 30, fontWeight: 900, color, lineHeight: 1, marginBottom: 6 }}>{pct === null ? '—' : `${pct}%`}</p>
      <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>{sub}</p>
    </div>
  )
}

function MiniStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '10px 12px', textAlign: 'center' }}>
      <p style={{ fontSize: 18, fontWeight: 900, color }}>{value}</p>
      <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</p>
    </div>
  )
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <span style={{ width: 8, height: 8, borderRadius: 2, background: color, display: 'inline-block' }} />
      <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)' }}>{label}</span>
    </div>
  )
}

function TrendChart({ serie }: { serie: PuntoSerie[] }) {
  const W = 560, H = 120, PAD = 8
  const n = serie.length
  const x = (i: number) => PAD + (i / (n - 1)) * (W - PAD * 2)
  const y = (pct: number) => PAD + (1 - pct / 100) * (H - PAD * 2)

  const otifPath = serie.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(p.otif_pct)}`).join(' ')
  const efectPath = serie.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(p.efectividad_pct)}`).join(' ')

  const last = serie[n - 1]

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="Tendencia diaria de OTIF y Tasa de Efectividad">
      {/* Línea base recessive */}
      <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
      <path d={efectPath} fill="none" stroke={BLUE} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <path d={otifPath} fill="none" stroke={ORANGE} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      {/* Punto final destacado con halo, valor directo etiquetado */}
      <circle cx={x(n - 1)} cy={y(last.otif_pct)} r={4} fill={ORANGE} />
      <circle cx={x(n - 1)} cy={y(last.otif_pct)} r={7} fill={ORANGE} fillOpacity={0.15} />
      <circle cx={x(n - 1)} cy={y(last.efectividad_pct)} r={4} fill={BLUE} />
      <circle cx={x(n - 1)} cy={y(last.efectividad_pct)} r={7} fill={BLUE} fillOpacity={0.15} />
    </svg>
  )
}

const inputStyle: React.CSSProperties = {
  padding: '9px 10px', borderRadius: 10, border: '1px solid var(--border)',
  background: 'var(--surface2)', color: 'var(--cream)', fontSize: 12, outline: 'none', colorScheme: 'dark',
}
