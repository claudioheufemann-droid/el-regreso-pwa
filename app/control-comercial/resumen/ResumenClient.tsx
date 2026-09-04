'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle, BarChart3, CalendarDays, CircleDollarSign, Layers,
  Sparkles, Target, TrendingUp, Users, Wallet,
} from 'lucide-react'
import CCHeader from '@/components/control-comercial/CCHeader'
import { BarrasComparativas } from '@/components/control-comercial/charts'
import { HeroMetricCard, KpiSparklineCard } from '@/components/control-comercial/cards'
import {
  CCPage, Card, CardHeader, ErrorState, InsightList, NotaPie, PageSkeleton,
  SegmentedControl, SelectChip, formatCLP, formatCLPCompacto, formatLitros, formatNumero,
  formatPctPlano, type InsightItem,
} from '@/components/control-comercial/ui'
import type { FilaSeriePeriodo, KpiEjecutivo, ResumenEjecutivoResponse } from '@/lib/control-comercial/tipos'

type Comparar = 'anio_anterior' | 'anterior'
type Cat = 'total' | 'cerveza' | 'kombucha'
type Unidad = 'clp' | 'litros'

interface PeriodoRow { id: number; nombre: string; fecha_inicio: string; fecha_fin: string; activo: boolean }
interface InsightApi { texto: string; tipo: 'oportunidad' | 'alerta'; drillHref: string }

const MESES_CORTO = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

function valorSerie(f: FilaSeriePeriodo, unidad: Unidad, cat: Cat): number {
  const campo = cat === 'total' ? 'total' : cat
  return Number(unidad === 'clp' ? f[`monto_${campo}` as const] : f[`litros_${campo}` as const])
}

/** "24 Ago–23 Sep" a partir del rango real del período comercial. */
function rangoLegible(inicio: string, fin: string): string {
  const fmt = (s: string) => {
    const d = new Date(`${s}T12:00:00`)
    return `${d.getDate()} ${MESES_CORTO[d.getMonth()]}`
  }
  return `${fmt(inicio)}–${fmt(fin)}`
}

export default function ResumenClient() {
  const [data, setData] = useState<ResumenEjecutivoResponse | null>(null)
  const [periodos, setPeriodos] = useState<PeriodoRow[]>([])
  const [periodoSel, setPeriodoSel] = useState<string>('actual')
  const [comparar, setComparar] = useState<Comparar>('anio_anterior')
  const [cat, setCat] = useState<Cat>('total')
  const [unidad, setUnidad] = useState<Unidad>('clp')
  const [insights, setInsights] = useState<InsightApi[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/control-comercial/periodos')
      .then(r => r.json())
      .then(d => setPeriodos(d.periodos ?? []))
      .catch(() => setPeriodos([]))
  }, [])

  const qsPeriodo = useMemo(() => {
    if (periodoSel === 'actual') return ''
    const p = periodos.find(x => String(x.id) === periodoSel)
    if (!p) return ''
    return `anio=${p.fecha_fin.slice(0, 4)}&mes=${Number(p.fecha_fin.slice(5, 7))}&`
  }, [periodoSel, periodos])

  const cargar = useCallback(() => {
    let cancelado = false
    setLoading(true)
    setError(null)
    fetch(`/api/control-comercial/resumen?${qsPeriodo}comparar=${comparar}`)
      .then(async r => {
        if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? 'Error al cargar el resumen')
        return r.json()
      })
      .then(d => { if (!cancelado) setData(d) })
      .catch(e => { if (!cancelado) setError(e instanceof Error ? e.message : 'Error al cargar') })
      .finally(() => { if (!cancelado) setLoading(false) })

    fetch(`/api/control-comercial/insights?${qsPeriodo.replace(/&$/, '')}`)
      .then(r => r.json())
      .then(d => { if (!cancelado) setInsights(d.insights ?? []) })
      .catch(() => {})

    return () => { cancelado = true }
  }, [qsPeriodo, comparar])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => cargar(), [cargar])

  const kpi = (id: string): KpiEjecutivo | undefined => data?.kpis.find(k => k.id === id)
  const ventaKpi = kpi('venta_ytd')
  const clientesKpi = kpi('clientes_activos')
  const deudaKpi = kpi('deuda_vencida')
  const cobranzaKpi = kpi('cobranza_recuperada')
  const barrilesKpi = kpi('barriles_criticos')

  const cumplimientoPct = data?.metaVentasClp && ventaKpi ? (ventaKpi.valor / data.metaVentasClp) * 100 : null

  // Serie del gráfico: hasta el período en curso del año actual (los meses que
  // faltan vienen en 0 desde la RPC y dibujarlos sería una caída inventada);
  // del año comparado se muestran los 12 porque ya cerró.
  const grafico = useMemo(() => {
    if (!data) return null
    const mesActual = data.periodo.mes
    const labels = MESES_CORTO
    const actual = labels.map((_, i) => {
      const f = data.serie.actual.find(x => x.mes === i + 1)
      return f && i + 1 <= mesActual ? valorSerie(f, unidad, cat) : 0
    })
    const comparado = labels.map((_, i) => {
      const f = data.serie.comparado.find(x => x.mes === i + 1)
      return f ? valorSerie(f, unidad, cat) : 0
    })
    return { labels, actual, comparado }
  }, [data, unidad, cat])

  const serieClientes = useMemo(
    () => (data?.serieClientes.actual ?? []).filter(f => f.mes <= (data?.periodo.mes ?? 0)).map(f => Number(f.clientes_activos)),
    [data],
  )

  const listaInsights: InsightItem[] = insights.slice(0, 4).map(i => ({
    texto: i.texto,
    tono: i.tipo === 'oportunidad' ? 'ok' : 'critico',
    icon: i.tipo === 'oportunidad' ? TrendingUp : AlertTriangle,
    href: i.drillHref,
  }))

  const formatear = unidad === 'clp' ? formatCLP : formatLitros
  const etiquetaComparada = comparar === 'anio_anterior' ? String(data?.serie.anioActual ? data.serie.anioActual - 1 : '') : 'Período anterior'

  return (
    <CCPage>
      <CCHeader
        title="Resumen Ejecutivo"
        subtitle={data ? `${data.periodo.nombre} · ${rangoLegible(data.periodo.inicio, data.periodo.finPeriodo)}` : 'Cargando período…'}
        subtitleTag={data?.periodo.truncado ? 'En curso' : undefined}
      />

      <div style={{ display: 'flex', gap: 8, minWidth: 0 }}>
        <SelectChip
          icon={CalendarDays}
          value={periodoSel}
          onChange={setPeriodoSel}
          options={[{ value: 'actual', label: 'Este período' }, ...periodos.map(p => ({ value: String(p.id), label: p.nombre }))]}
          flex="1 1 0"
        />
        <SelectChip
          icon={TrendingUp}
          value={comparar}
          onChange={setComparar}
          options={[{ value: 'anio_anterior', label: `vs ${(data?.serie.anioActual ?? new Date().getFullYear()) - 1}` }, { value: 'anterior', label: 'vs anterior' }]}
          flex="1 1 0"
        />
      </div>

      {loading && <PageSkeleton />}
      {!loading && error && <ErrorState mensaje={error} onReintentar={cargar} />}

      {!loading && !error && data && (
        <div className="cc-enter" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <HeroMetricCard
            izquierda={{
              icon: CircleDollarSign,
              tono: 'marca',
              label: 'Venta del período',
              valor: formatCLP(ventaKpi?.valor ?? 0),
              deltaPct: ventaKpi?.variacionPct ?? null,
              pie: ventaKpi?.comparado !== null && ventaKpi?.comparado !== undefined
                ? `vs ${formatCLP(ventaKpi.comparado)} en el período comparado`
                : undefined,
            }}
            derecha={{
              icon: Target,
              tono: cumplimientoPct === null ? 'neutral' : cumplimientoPct >= 100 ? 'ok' : cumplimientoPct >= 80 ? 'alerta' : 'critico',
              label: 'Meta del período',
              valor: cumplimientoPct === null ? 'Sin meta' : formatPctPlano(cumplimientoPct),
              pie: data.metaVentasClp
                ? `${formatCLPCompacto(ventaKpi?.valor ?? 0)} de ${formatCLPCompacto(data.metaVentasClp)}`
                : 'Configúrala en Metas para ver el avance',
            }}
            progresoPct={data.metaVentasClp !== null ? cumplimientoPct : undefined}
            progresoNota={data.metaVentasClp !== null && data.periodo.truncado ? 'Período en curso: el avance se compara contra los mismos días del período anterior.' : undefined}
          />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <KpiSparklineCard
              icon={Users} tono="ok" label="Clientes activos"
              valor={formatNumero(clientesKpi?.valor ?? 0)}
              deltaPct={clientesKpi?.variacionPct ?? null}
              serie={serieClientes}
              href="/control-comercial/clientes"
            />
            <KpiSparklineCard
              icon={Wallet} tono={cobranzaKpi?.estado === 'no_disponible' ? 'neutral' : 'ok'}
              label="Cobranza recuperada"
              valor={cobranzaKpi?.estado === 'no_disponible' ? '—' : formatCLP(cobranzaKpi?.valor ?? 0)}
              nota={cobranzaKpi?.estado === 'no_disponible' ? 'Sin foto de deuda al inicio del período todavía' : 'Caída de deuda vencida en el período'}
              href="/control-comercial/cobranza"
            />
            <KpiSparklineCard
              icon={AlertTriangle} tono="critico" label="Deuda vencida"
              valor={deudaKpi?.estado === 'no_disponible' ? '—' : formatCLP(deudaKpi?.valor ?? 0)}
              nota={deudaKpi?.estado === 'no_disponible' ? 'Sin acceso a la cartera de deudores' : 'Foto de hoy del ERP'}
              href="/control-comercial/cobranza"
            />
            <KpiSparklineCard
              icon={Layers} tono="critico" label="Barriles críticos (+90D)"
              valor={barrilesKpi?.estado === 'no_disponible' ? '—' : formatNumero(barrilesKpi?.valor ?? 0)}
              nota={barrilesKpi?.estado === 'no_disponible' ? 'Sin acceso al detalle de barriles' : 'Más de 90 días fuera'}
              href="/control-comercial/barriles"
            />
          </div>

          <Card>
            <CardHeader
              icon={BarChart3}
              titulo="Evolución de ventas"
              accion={
                <SegmentedControl
                  size="sm"
                  value={unidad}
                  onChange={setUnidad}
                  options={[{ value: 'clp', label: '$' }, { value: 'litros', label: 'Litros' }]}
                />
              }
            />
            <div style={{ marginBottom: 12 }}>
              <SegmentedControl
                ancho="full"
                size="sm"
                value={cat}
                onChange={setCat}
                options={[{ value: 'total', label: 'Total' }, { value: 'cerveza', label: 'Cerveza' }, { value: 'kombucha', label: 'Kombucha' }]}
              />
            </div>
            {grafico && (
              <BarrasComparativas
                labels={grafico.labels}
                actual={grafico.actual}
                comparado={grafico.comparado}
                etiquetaActual={String(data.serie.anioActual)}
                etiquetaComparada={etiquetaComparada}
                formatear={formatear}
                destacado={data.periodo.mes - 1}
              />
            )}
          </Card>

          {listaInsights.length > 0 && (
            <Card>
              <CardHeader icon={Sparkles} titulo="Insights clave" />
              <InsightList items={listaInsights} />
            </Card>
          )}

          <NotaPie>
            Venta reconocida por fecha de entrega, período comercial 24→23. El total de compañía incluye
            cuentas del ERP todavía sin territorio asignado; el desglose por territorio de Ventas y Equipo no.
          </NotaPie>
        </div>
      )}
    </CCPage>
  )
}
