'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  AlertTriangle, Boxes, CalendarClock, ChevronRight, PackageCheck, RotateCcw, Sparkles, Users,
} from 'lucide-react'
import CCHeader from '@/components/control-comercial/CCHeader'
import { Gauge } from '@/components/control-comercial/charts'
import {
  CCPage, Card, CardHeader, EmptyState, ErrorState, FilaLeyenda, InsightList, NotaPie,
  PageSkeleton, formatNumero, formatPctPlano, type InsightItem, type Tono,
} from '@/components/control-comercial/ui'

interface EstadoBarriles { total: number; normales: number; atencion: number; atrasados: number; criticos: number; promedio_dias_fuera: number }
interface TopCliente { nombre_fantasia: string; cantidad: number; dias_max: number; criticos: number }
interface Recuperados { recuperados: number; hay_historial: boolean }
interface PorResponsable { responsable: string; criticos: number; total: number }
interface BarrilesResponse {
  periodo: { nombre: string; inicio: string; fin: string }
  estado: EstadoBarriles | null
  topClientes: TopCliente[]
  recuperados: Recuperados | null
  porResponsable: PorResponsable[]
}

const BUCKETS = [
  { key: 'normales', label: 'Normal (0-30d)', tono: 'ok' as Tono, color: 'var(--cc-green)' },
  { key: 'atencion', label: 'Atención (31-60d)', tono: 'marca' as Tono, color: 'var(--cc-gold)' },
  { key: 'atrasados', label: 'Atrasado (61-90d)', tono: 'alerta' as Tono, color: 'var(--cc-amber)' },
  { key: 'criticos', label: 'Crítico (+90d)', tono: 'critico' as Tono, color: 'var(--cc-red)' },
] as const

export default function BarrilesClient() {
  const [data, setData] = useState<BarrilesResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(() => {
    let cancelado = false
    setLoading(true)
    setError(null)
    fetch('/api/control-comercial/barriles')
      .then(async r => {
        if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? 'Error al cargar Barriles')
        return r.json()
      })
      .then(d => { if (!cancelado) setData(d) })
      .catch(e => { if (!cancelado) setError(e instanceof Error ? e.message : 'Error al cargar') })
      .finally(() => { if (!cancelado) setLoading(false) })
    return () => { cancelado = true }
  }, [])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => cargar(), [cargar])

  const estado = data?.estado
  const recuperados = data?.recuperados
  const total = Math.max(1, estado?.total ?? 0)
  const tasaRecuperacion = recuperados?.hay_historial && estado
    ? (recuperados.recuperados / (recuperados.recuperados + estado.criticos || 1)) * 100
    : null

  const insights: InsightItem[] = []
  if (estado) {
    if (estado.criticos > 0) {
      insights.push({
        icon: AlertTriangle, tono: 'critico',
        texto: `${formatNumero(estado.criticos)} barriles llevan más de 90 días fuera.`,
        detalle: `Representan ${formatPctPlano((estado.criticos / total) * 100)} de la flota pendiente.`,
      })
    }
    if (estado.promedio_dias_fuera > 45) {
      insights.push({
        icon: CalendarClock, tono: 'alerta',
        texto: `El promedio de días fuera es ${Math.round(estado.promedio_dias_fuera)} días.`,
        detalle: 'Por sobre el objetivo de rotación de la flota.',
      })
    }
    if (recuperados?.hay_historial && recuperados.recuperados > 0) {
      insights.push({
        icon: RotateCcw, tono: 'ok',
        texto: `Se recuperaron ${formatNumero(recuperados.recuperados)} barriles en ${data?.periodo.nombre}.`,
      })
    }
  }

  return (
    <CCPage>
      <CCHeader title="Barriles" subtitle={data ? data.periodo.nombre : 'Cargando…'} subtitleTag={data ? 'En curso' : undefined} />

      {loading && <PageSkeleton />}
      {!loading && error && <ErrorState mensaje={error} onReintentar={cargar} />}

      {!loading && !error && estado && (
        <div className="cc-enter" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
            <Card padding={13}>
              <KpiFila icon={Boxes} tono="marca" label="Pendientes" valor={formatNumero(estado.total)} />
            </Card>
            <Card padding={13}>
              <KpiFila icon={CalendarClock} tono="critico" label="Críticos (+90D)" valor={formatNumero(estado.criticos)} />
            </Card>
            <Card padding={13}>
              <KpiFila icon={CalendarClock} tono="alerta" label="Prom. días fuera" valor={`${Math.round(estado.promedio_dias_fuera)} d`} />
            </Card>
            <Card padding={13}>
              <KpiFila
                icon={PackageCheck} tono="ok" label="Recuperados"
                valor={recuperados?.hay_historial ? formatNumero(recuperados.recuperados) : '—'}
                nota={recuperados?.hay_historial ? undefined : 'Acumulando histórico'}
              />
            </Card>
          </div>

          <Card>
            <CardHeader icon={Boxes} titulo="Estado de la flota de barriles" />
            <div style={{ display: 'flex', height: 14, borderRadius: 10, overflow: 'hidden', marginBottom: 14, gap: 2 }}>
              {BUCKETS.map(b => {
                const val = estado[b.key as keyof EstadoBarriles] as number
                const pct = (val / total) * 100
                return pct > 0 ? <div key={b.key} title={`${b.label}: ${val}`} style={{ width: `${pct}%`, background: b.color, minWidth: 3 }} /> : null
              })}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {BUCKETS.map(b => {
                const val = estado[b.key as keyof EstadoBarriles] as number
                return (
                  <FilaLeyenda
                    key={b.key}
                    color={b.color}
                    label={b.label}
                    valor={formatNumero(val)}
                    secundario={`${Math.round((val / total) * 100)}%`}
                  />
                )
              })}
            </div>
          </Card>

          {tasaRecuperacion !== null && (
            <Card>
              <CardHeader icon={RotateCcw} titulo="Tasa de recuperación" sub={data?.periodo.nombre} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <Gauge pct={tasaRecuperacion} color="var(--cc-gold)">
                  <span style={{ fontSize: 20, fontWeight: 900, color: 'var(--cc-ink)', letterSpacing: '-0.5px' }}>{formatPctPlano(tasaRecuperacion)}</span>
                </Gauge>
                <p style={{ fontSize: 12.5, color: 'var(--cc-ink-2)', lineHeight: 1.5, flex: 1, minWidth: 0 }}>
                  {formatNumero(recuperados?.recuperados ?? 0)} barriles recuperados frente a {formatNumero(estado.criticos)} críticos actuales, en {data?.periodo.nombre}.
                </p>
              </div>
            </Card>
          )}

          <Card>
            <CardHeader
              icon={Users}
              titulo="Clientes prioritarios"
              accion={<Link href="/ventas/barriles" style={{ fontSize: 12, color: 'var(--cc-gold-deep)', fontWeight: 700, textDecoration: 'none' }}>Ver todos</Link>}
            />
            {data!.topClientes.length === 0 ? (
              <EmptyState icon={Users} titulo="Sin barriles pendientes por cliente" />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {data!.topClientes.slice(0, 6).map((c, i) => (
                  <div key={c.nombre_fantasia} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderTop: i > 0 ? '1px solid var(--cc-line-soft)' : undefined, minWidth: 0 }}>
                    <span style={{ width: 22, fontSize: 12.5, fontWeight: 800, color: 'var(--cc-ink-3)', flexShrink: 0 }}>{i + 1}</span>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700, color: 'var(--cc-ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nombre_fantasia}</span>
                    <span style={{ fontSize: 14, fontWeight: 800, color: c.criticos > 0 ? 'var(--cc-red)' : 'var(--cc-ink)', flexShrink: 0 }}>{c.cantidad}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card>
            <CardHeader icon={Users} titulo="Responsables con más barriles críticos" />
            {(data?.porResponsable.length ?? 0) === 0 ? (
              <EmptyState icon={Users} titulo="Sin barriles críticos asignados a un responsable" />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {data!.porResponsable.slice(0, 6).map((r, i) => (
                  <div key={r.responsable} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderTop: i > 0 ? '1px solid var(--cc-line-soft)' : undefined, minWidth: 0 }}>
                    <span style={{ width: 22, fontSize: 12.5, fontWeight: 800, color: 'var(--cc-ink-3)', flexShrink: 0 }}>{i + 1}</span>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700, color: 'var(--cc-ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.responsable}</span>
                    <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--cc-red)', flexShrink: 0 }}>{r.criticos}</span>
                    <ChevronRight size={16} color="var(--cc-ink-3)" style={{ flexShrink: 0 }} />
                  </div>
                ))}
              </div>
            )}
          </Card>

          {insights.length > 0 && (
            <Card>
              <CardHeader icon={Sparkles} titulo="Insights clave" />
              <InsightList items={insights} />
            </Card>
          )}

          <NotaPie>
            No existe un histórico diario suficiente de la flota total para trazar la tasa de recuperación
            mes a mes — se muestra el valor del período actual en vez de inventar una tendencia de 12 meses.
          </NotaPie>
        </div>
      )}
    </CCPage>
  )
}

function KpiFila({ icon: Icon, tono, label, valor, nota }: { icon: typeof Boxes; tono: Tono; label: string; valor: string; nota?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 11.5, fontWeight: 700, color: 'var(--cc-ink-2)' }}>
        <Icon size={14} strokeWidth={2} color={tono === 'critico' ? 'var(--cc-red)' : tono === 'ok' ? 'var(--cc-green)' : tono === 'alerta' ? 'var(--cc-amber)' : 'var(--cc-gold)'} />
        {label}
      </span>
      <span style={{ fontSize: 20, fontWeight: 900, color: 'var(--cc-ink)', letterSpacing: '-0.6px' }}>{valor}</span>
      {nota && <span style={{ fontSize: 10.5, color: 'var(--cc-ink-3)' }}>{nota}</span>}
    </div>
  )
}
