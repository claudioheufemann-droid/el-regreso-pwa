'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  BarChart3, ChevronRight, Globe, MapPin, ShoppingCart, TrendingDown, TrendingUp,
} from 'lucide-react'
import CCHeader from '@/components/control-comercial/CCHeader'
import { BarrasComparativas } from '@/components/control-comercial/charts'
import {
  CCPage, Card, CardHeader, EmptyState, ErrorState, NotaPie, PageSkeleton, SegmentedControl,
  formatCLP, formatCLPCompacto, formatLitros, formatPct, TONO,
} from '@/components/control-comercial/ui'
import type { FilaSeriePeriodo, FilaVentaAgregada } from '@/lib/control-comercial/tipos'

type Unidad = 'clp' | 'litros'
type Cat = 'total' | 'cerveza' | 'kombucha'

interface VentasResponse {
  anio: number
  anioComparado: number
  mesActual: number
  serieActual: (FilaSeriePeriodo & { nombre: string })[]
  serieComparada: (FilaSeriePeriodo & { nombre: string })[]
  ventasPorTerritorio: FilaVentaAgregada[]
  ventasPorTerritorioComparado: FilaVentaAgregada[]
}

const MESES_CORTO = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

function valorSerie(f: FilaSeriePeriodo, unidad: Unidad, cat: Cat): number {
  const campo = cat === 'total' ? 'total' : cat
  return Number(unidad === 'clp' ? f[`monto_${campo}` as const] : f[`litros_${campo}` as const])
}

interface TerritorioAgg {
  territorio: string
  tipo: string
  monto: number
  litros: number
  cerveza: number
  kombucha: number
}

function agrupar(filas: FilaVentaAgregada[]): Map<string, TerritorioAgg> {
  const map = new Map<string, TerritorioAgg>()
  for (const f of filas) {
    // Cuentas ERP sin territorio mapeado: quedan fuera del desglose a pedido de
    // Claudio. El acumulado de arriba sí las incluye — la suma no cuadra a propósito.
    if (f.territorio === 'Sin territorio asignado') continue
    const cur = map.get(f.territorio) ?? { territorio: f.territorio, tipo: f.tipo, monto: 0, litros: 0, cerveza: 0, kombucha: 0 }
    cur.monto += Number(f.monto)
    cur.litros += Number(f.litros)
    if (f.categoria_producto === 'Cerveza') cur.cerveza += Number(f.monto)
    if (f.categoria_producto === 'Kombucha') cur.kombucha += Number(f.monto)
    map.set(f.territorio, cur)
  }
  return map
}

export default function VentasClient() {
  const anioHoy = new Date().getFullYear()
  const [anio, setAnio] = useState(anioHoy)
  const [unidad, setUnidad] = useState<Unidad>('clp')
  const [cat, setCat] = useState<Cat>('total')
  const [data, setData] = useState<VentasResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(() => {
    let cancelado = false
    setLoading(true)
    setError(null)
    fetch(`/api/control-comercial/ventas?anio=${anio}&anioComparado=${anio - 1}`)
      .then(async r => {
        if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? 'Error al cargar Ventas')
        return r.json()
      })
      .then(d => { if (!cancelado) setData(d) })
      .catch(e => { if (!cancelado) setError(e instanceof Error ? e.message : 'Error al cargar') })
      .finally(() => { if (!cancelado) setLoading(false) })
    return () => { cancelado = true }
  }, [anio])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => cargar(), [cargar])

  const grafico = useMemo(() => {
    if (!data) return null
    const hasta = data.anio === anioHoy ? data.mesActual : 12
    const actual = MESES_CORTO.map((_, i) => {
      const f = data.serieActual.find(x => x.mes === i + 1)
      return f && i + 1 <= hasta ? valorSerie(f, unidad, cat) : 0
    })
    const comparado = MESES_CORTO.map((_, i) => {
      const f = data.serieComparada.find(x => x.mes === i + 1)
      return f ? valorSerie(f, unidad, cat) : 0
    })
    return { labels: MESES_CORTO, actual, comparado, hasta }
  }, [data, unidad, cat, anioHoy])

  const totalActual = grafico?.actual.reduce((a, v) => a + v, 0) ?? 0
  // Se compara contra los MISMOS meses del año anterior: acumulado parcial contra
  // año completo daría una caída falsa gigante en el año en curso.
  const totalComparado = useMemo(() => {
    if (!grafico) return 0
    return grafico.comparado.slice(0, grafico.hasta).reduce((a, v) => a + v, 0)
  }, [grafico])
  const crecimiento = totalComparado ? ((totalActual - totalComparado) / Math.abs(totalComparado)) * 100 : null

  const territorios = useMemo(() => {
    if (!data) return []
    const actual = agrupar(data.ventasPorTerritorio)
    const comp = agrupar(data.ventasPorTerritorioComparado)
    return [...actual.values()]
      .map(t => {
        const c = comp.get(t.territorio)
        const base = cat === 'total' ? t.monto : cat === 'cerveza' ? t.cerveza : t.kombucha
        const baseComp = c ? (cat === 'total' ? c.monto : cat === 'cerveza' ? c.cerveza : c.kombucha) : 0
        return { ...t, base, yoyPct: baseComp > 0 ? ((base - baseComp) / baseComp) * 100 : null }
      })
      .filter(t => t.base > 0)
      .sort((a, b) => b.base - a.base)
  }, [data, cat])

  const maxTerritorio = Math.max(1, ...territorios.map(t => t.base))
  const formatear = unidad === 'clp' ? formatCLP : formatLitros
  const anios = [anioHoy - 2, anioHoy - 1, anioHoy]

  return (
    <CCPage>
      <CCHeader title="Ventas" subtitle={`Año comercial ${anio} · períodos 24→23`} />

      <div style={{ display: 'flex', gap: 8, minWidth: 0 }}>
        <div style={{ flex: '1.6 1 0', minWidth: 0 }}>
          <SegmentedControl
            ancho="full"
            value={anio}
            onChange={setAnio}
            options={anios.map(a => ({ value: a, label: String(a) }))}
          />
        </div>
        <div style={{ flex: '1 1 0', minWidth: 0 }}>
          <SegmentedControl
            ancho="full"
            value={unidad}
            onChange={setUnidad}
            options={[{ value: 'clp', label: '$' }, { value: 'litros', label: 'Litros' }]}
          />
        </div>
      </div>

      <SegmentedControl
        variant="underline"
        value={cat}
        onChange={setCat}
        options={[{ value: 'total', label: 'Total' }, { value: 'cerveza', label: 'Cerveza' }, { value: 'kombucha', label: 'Kombucha' }]}
      />

      {loading && <PageSkeleton />}
      {!loading && error && <ErrorState mensaje={error} onReintentar={cargar} />}

      {!loading && !error && data && grafico && (
        <div className="cc-enter" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Card>
            <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--cc-ink-2)', marginBottom: 4 }}>
              Ventas acumuladas {data.anio}
            </p>
            <p style={{ fontSize: 30, fontWeight: 900, color: 'var(--cc-ink)', letterSpacing: '-1.4px', lineHeight: 1.05, overflowWrap: 'anywhere' }}>
              {formatear(totalActual)}
            </p>
            {crecimiento !== null && (
              <p style={{ fontSize: 14, fontWeight: 800, color: TONO[crecimiento >= 0 ? 'ok' : 'critico'].fg, marginTop: 4 }}>
                {formatPct(crecimiento)} vs {data.anioComparado}
                {grafico.hasta < 12 && (
                  <span style={{ color: 'var(--cc-ink-3)', fontWeight: 600 }}> · mismos {grafico.hasta} períodos</span>
                )}
              </p>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 16 }}>
              <BarraAnio anio={data.anio} valor={totalActual} max={Math.max(totalActual, totalComparado)} color="var(--cc-gold)" formatear={formatear} />
              <BarraAnio anio={data.anioComparado} valor={totalComparado} max={Math.max(totalActual, totalComparado)} color="var(--cc-neutral)" formatear={formatear} />
            </div>
          </Card>

          <Card>
            <CardHeader icon={BarChart3} titulo="Evolución mensual de ventas" sub={`Período comercial · ${cat === 'total' ? 'Cerveza + Kombucha' : cat === 'cerveza' ? 'Cerveza' : 'Kombucha'}`} />
            <BarrasComparativas
              labels={grafico.labels}
              actual={grafico.actual}
              comparado={grafico.comparado}
              etiquetaActual={String(data.anio)}
              etiquetaComparada={String(data.anioComparado)}
              formatear={formatear}
              alto={230}
            />
          </Card>

          <Card>
            <CardHeader icon={MapPin} titulo={`Por territorio y canal — ${data.anio}`} />
            {territorios.length === 0 ? (
              <EmptyState icon={MapPin} titulo="Sin ventas en este año" detalle="Todavía no hay ventas reconocidas con territorio asignado en el año seleccionado." />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {territorios.map((t, i) => (
                  <div
                    key={t.territorio}
                    style={{
                      padding: '11px 0', display: 'flex', flexDirection: 'column', gap: 7, minWidth: 0,
                      borderTop: i > 0 ? '1px solid var(--cc-line-soft)' : undefined,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                      <span
                        style={{
                          width: 30, height: 30, borderRadius: 10, flexShrink: 0,
                          background: t.tipo === 'canal' ? 'var(--cc-blue-soft)' : 'var(--cc-gold-soft)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                      >
                        {t.tipo === 'canal'
                          ? (t.territorio.toLowerCase().includes('online')
                            ? <Globe size={15} color="var(--cc-blue)" strokeWidth={2} />
                            : <ShoppingCart size={15} color="var(--cc-blue)" strokeWidth={2} />)
                          : <MapPin size={15} color="var(--cc-gold)" strokeWidth={2} />}
                      </span>
                      <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--cc-ink)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {t.territorio}
                      </span>
                      <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--cc-ink)', flexShrink: 0 }}>
                        {unidad === 'clp' ? formatCLP(t.base) : formatLitros(t.litros)}
                      </span>
                    </div>

                    <div style={{ height: 5, borderRadius: 5, background: 'var(--cc-neutral-soft)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${(t.base / maxTerritorio) * 100}%`, background: t.tipo === 'canal' ? 'var(--cc-blue)' : 'var(--cc-gold)', borderRadius: 5 }} />
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                      <span style={{ fontSize: 11.5, color: 'var(--cc-ink-3)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        Cerveza {formatCLPCompacto(t.cerveza)} · Kombucha {formatCLPCompacto(t.kombucha)}
                      </span>
                      {t.yoyPct !== null ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 12, fontWeight: 800, color: TONO[t.yoyPct >= 0 ? 'ok' : 'critico'].fg, flexShrink: 0 }}>
                          {t.yoyPct >= 0 ? <TrendingUp size={13} strokeWidth={2.4} /> : <TrendingDown size={13} strokeWidth={2.4} />}
                          {formatPct(t.yoyPct)}
                        </span>
                      ) : (
                        <span style={{ fontSize: 11.5, color: 'var(--cc-ink-3)', flexShrink: 0 }}>sin {data.anioComparado}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <Link
              href="/control-comercial/equipo"
              className="cc-tap"
              style={{
                marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                minHeight: 46, padding: '0 14px', borderRadius: 13, textDecoration: 'none',
                background: 'var(--cc-card-2)', border: '1px solid var(--cc-line-soft)',
                fontSize: 13, fontWeight: 700, color: 'var(--cc-ink)',
              }}
            >
              Ver todos los territorios y canales
              <ChevronRight size={17} color="var(--cc-ink-3)" />
            </Link>
          </Card>

          <NotaPie>
            El acumulado del año incluye toda la venta reconocida de la compañía. El desglose por
            territorio excluye las cuentas del ERP que todavía no tienen responsable asignado, así que
            su suma queda por debajo del acumulado a propósito.
          </NotaPie>
        </div>
      )}
    </CCPage>
  )
}

function BarraAnio({ anio, valor, max, color, formatear }: {
  anio: number; valor: number; max: number; color: string; formatear: (n: number) => string
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--cc-ink-3)', width: 34, flexShrink: 0 }}>{anio}</span>
      <div style={{ flex: 1, height: 9, borderRadius: 9, background: 'var(--cc-neutral-soft)', overflow: 'hidden', minWidth: 0 }}>
        <div style={{ height: '100%', width: `${max > 0 ? (valor / max) * 100 : 0}%`, background: color, borderRadius: 9 }} />
      </div>
      <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--cc-ink-2)', flexShrink: 0, minWidth: 76, textAlign: 'right' }}>
        {formatear(valor)}
      </span>
    </div>
  )
}
