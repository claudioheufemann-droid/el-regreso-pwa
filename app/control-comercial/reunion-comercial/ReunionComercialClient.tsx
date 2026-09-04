'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle, ArrowLeft, ArrowRight, Beer, CalendarDays, CircleDollarSign, GlassWater, Maximize,
  Minimize, Plus, Sparkles, Target, TrendingDown, TrendingUp, Users, Wallet, Layers,
} from 'lucide-react'
import { useUser } from '@/lib/userContext'
import { BarrasComparativas, Donut } from '@/components/control-comercial/charts'
import {
  Card, Delta, IconoCircular, ProgressBar, TONO, formatCLP, formatCLPCompacto,
  formatNumero, formatPctPlano, type Tono,
} from '@/components/control-comercial/ui'
import type { FilaSeriePeriodo, ResumenEjecutivoResponse } from '@/lib/control-comercial/tipos'

interface FilaEquipo {
  territorio: string; responsable: string | null; venta_clp: number; litros: number
  clientes_activos: number; clientes_nuevos: number; clientes_perdidos: number
  crecimientoYoyPct: number | null; cumplimientoMetaPct: number | null; deuda_vencida: number; barriles_criticos: number
}
interface Equipo { filas: FilaEquipo[] }
interface Clientes {
  estadoResumen: Record<string, number>
  nuevos: { nombre_fantasia: string }[]
  reactivados: { nombre_fantasia: string; litros: number }[]
  oportunidadKombucha: { nombre_fantasia: string; litros_cerveza: number }[]
}
interface Cobranza { kpis: { deuda_vencida_actual: number; deuda_mas_90_actual: number; monto_recuperado: number; cuentas_regularizadas: number; hay_snapshot_inicio: boolean } | null }
interface Barriles { estado: { total: number; criticos: number } | null; recuperados: { recuperados: number; hay_historial: boolean } | null }
interface Compromiso { id: number; responsable: string; accion: string; fecha_compromiso: string; estado: string; comentario: string | null }

const MESES_CORTO = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

function valorSerie(f: FilaSeriePeriodo, cat: 'total' | 'cerveza' | 'kombucha' = 'total'): number {
  const campo = cat === 'total' ? 'total' : cat
  return Number(f[`monto_${campo}` as const])
}

// ── Bloques visuales reutilizados en varios slides ──────────────────────────

function SlideShell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '4px 4px 8px', maxWidth: 720, margin: '0 auto', width: '100%', minHeight: 0 }}>
      {children}
    </div>
  )
}
function SlideTitle({ children }: { children: React.ReactNode }) {
  return <h2 style={{ fontSize: 19, fontWeight: 800, color: 'var(--cc-ink)', letterSpacing: '-0.4px', marginBottom: 16 }}>{children}</h2>
}
function Metric({ icon: Icon, tono, label }: { icon: typeof Users; tono: Tono; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
      <IconoCircular icon={Icon} tono={tono} size={30} />
      <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--cc-ink-2)', wordBreak: 'keep-all', overflowWrap: 'normal', hyphens: 'none' }}>{label}</span>
    </div>
  )
}

export default function ReunionComercialClient() {
  const { user } = useUser()
  const [resumen, setResumen] = useState<ResumenEjecutivoResponse | null>(null)
  const [equipo, setEquipo] = useState<Equipo | null>(null)
  const [clientes, setClientes] = useState<Clientes | null>(null)
  const [cobranza, setCobranza] = useState<Cobranza | null>(null)
  const [barriles, setBarriles] = useState<Barriles | null>(null)
  const [compromisos, setCompromisos] = useState<Compromiso[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [slide, setSlide] = useState(0)
  const [fullscreen, setFullscreen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const [nuevoResponsable, setNuevoResponsable] = useState('')
  const [nuevaAccion, setNuevaAccion] = useState('')
  const [nuevaFecha, setNuevaFecha] = useState('')

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    setError(null)
    async function cargarUno(url: string) {
      const res = await fetch(url)
      const body = await res.json().catch(() => null)
      if (!res.ok) throw new Error(body?.error ?? `Error al cargar ${url}`)
      return body
    }
    // Secuencial a propósito: esta pantalla ya dispara ~6 endpoints que a su vez llaman
    // varias RPC — todo en paralelo satura el pool de conexiones. Uso puntual (reunión
    // mensual), no de alta frecuencia: priorizamos que cargue completa por sobre rápida.
    async function cargarTodo() {
      const r = await cargarUno('/api/control-comercial/resumen')
      const e = await cargarUno('/api/control-comercial/equipo')
      const c = await cargarUno('/api/control-comercial/clientes')
      const co = await cargarUno('/api/control-comercial/cobranza')
      const b = await cargarUno('/api/control-comercial/barriles')
      const cm = await cargarUno('/api/control-comercial/compromisos')
      setResumen(r); setEquipo(e); setClientes(c); setCobranza(co); setBarriles(b)
      setCompromisos(Array.isArray(cm) ? cm : [])
    }
    cargarTodo()
      .catch(e => setError(e instanceof Error ? e.message : 'Error al cargar la reunión comercial'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowRight') setSlide(s => Math.min(slides.length - 1, s + 1))
      if (e.key === 'ArrowLeft') setSlide(s => Math.max(0, s - 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function agregarCompromiso() {
    if (!nuevoResponsable || !nuevaAccion || !nuevaFecha) return
    const res = await fetch('/api/control-comercial/compromisos', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ responsable: nuevoResponsable, accion: nuevaAccion, fecha_compromiso: nuevaFecha }),
    })
    if (res.ok) {
      const nuevo = await res.json()
      setCompromisos(prev => [nuevo, ...prev])
      setNuevoResponsable(''); setNuevaAccion(''); setNuevaFecha('')
    }
  }

  async function marcarCumplido(id: number) {
    setCompromisos(prev => prev.map(c => c.id === id ? { ...c, estado: 'cumplido' } : c))
    await fetch('/api/control-comercial/compromisos', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, estado: 'cumplido' }),
    })
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen?.()
      setFullscreen(true)
    } else {
      document.exitFullscreen?.()
      setFullscreen(false)
    }
  }

  const kpi = (id: string) => resumen?.kpis?.find(k => k.id === id)
  const ventaKpi = kpi('venta_ytd')
  const crecKpi = kpi('crecimiento_yoy')
  const metaKpi = kpi('cumplimiento_meta')
  const clientesKpi = kpi('clientes_activos')
  const deudaKpi = kpi('deuda_vencida')
  const barrilesKpi = kpi('barriles_criticos')

  const cumplimientoPct = metaKpi && metaKpi.estado !== 'sin_meta' ? metaKpi.valor : null

  const catTotales = useMemo(() => {
    const acc = { Cerveza: 0, Kombucha: 0 }
    for (const f of resumen?.ventasPorTerritorio ?? []) {
      if (f.categoria_producto === 'Cerveza') acc.Cerveza += Number(f.monto)
      if (f.categoria_producto === 'Kombucha') acc.Kombucha += Number(f.monto)
    }
    return acc
  }, [resumen])

  // Mismos períodos transcurridos del año comparado — litros y categoría no vienen en
  // los KPIs planos, se arman desde la serie mensual (única fuente que los tiene).
  const comparativaAnual = useMemo(() => {
    if (!resumen) return null
    const mesActual = resumen.periodo.mes
    const sumar = (filas: typeof resumen.serie.actual, hastaMes: number) =>
      filas.filter(f => f.mes <= hastaMes).reduce((acc, f) => ({
        litros: acc.litros + Number(f.litros_total),
        cerveza: acc.cerveza + Number(f.monto_cerveza),
        kombucha: acc.kombucha + Number(f.monto_kombucha),
      }), { litros: 0, cerveza: 0, kombucha: 0 })
    const actual = sumar(resumen.serie.actual, mesActual)
    const comparado = sumar(resumen.serie.comparado, mesActual)
    const pct = (a: number, c: number) => c > 0 ? ((a - c) / c) * 100 : null
    return {
      litros: { actual: actual.litros, pct: pct(actual.litros, comparado.litros) },
      cerveza: { actual: actual.cerveza, pct: pct(actual.cerveza, comparado.cerveza) },
      kombucha: { actual: actual.kombucha, pct: pct(actual.kombucha, comparado.kombucha) },
    }
  }, [resumen])

  const grafico = useMemo(() => {
    if (!resumen) return null
    const mesActual = resumen.periodo.mes
    const actual = MESES_CORTO.map((_, i) => {
      const f = resumen.serie.actual.find(x => x.mes === i + 1)
      return f && i + 1 <= mesActual ? valorSerie(f) : 0
    })
    const comparado = MESES_CORTO.map((_, i) => {
      const f = resumen.serie.comparado.find(x => x.mes === i + 1)
      return f ? valorSerie(f) : 0
    })
    return { labels: MESES_CORTO, actual, comparado }
  }, [resumen])

  const cumplidos = compromisos.filter(c => c.estado === 'cumplido').length
  const atrasados = compromisos.filter(c => c.estado === 'atrasado').length
  const pendientes = compromisos.filter(c => c.estado === 'pendiente').length
  const tasaCumplimiento = compromisos.length > 0 ? (cumplidos / compromisos.length) * 100 : 0

  const territoriosOrdenados = useMemo(() => [...(equipo?.filas ?? [])].sort((a, b) => b.venta_clp - a.venta_clp), [equipo])
  const riesgos = territoriosOrdenados.filter(f => (f.cumplimientoMetaPct !== null && f.cumplimientoMetaPct < 90) || f.clientes_perdidos > f.clientes_nuevos)
  const oportunidades = territoriosOrdenados.filter(f => f.crecimientoYoyPct !== null && f.crecimientoYoyPct > 15)

  const slides: { titulo: string; contenido: React.ReactNode }[] = [
    {
      titulo: 'Resultado general del período',
      contenido: (
        <SlideShell>
          <p style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--cc-gold-deep)', textAlign: 'center', marginBottom: 8 }}>
            RESULTADO GENERAL DEL PERÍODO — {resumen?.periodo.nombre.toUpperCase()}
          </p>

          <div style={{ textAlign: 'center', marginBottom: 4 }}>
            <p style={{ fontSize: 12, color: 'var(--cc-ink-3)', fontWeight: 700, letterSpacing: 0.5 }}>VENTA DEL PERÍODO</p>
            <p style={{ fontSize: 44, fontWeight: 900, color: 'var(--cc-ink)', letterSpacing: '-1.6px', lineHeight: 1.05, overflowWrap: 'anywhere' }}>
              {formatCLP(ventaKpi?.valor ?? 0)}
            </p>
            <Delta pct={ventaKpi?.variacionPct ?? null} sufijo="YoY" size={16} />
            {crecKpi && ventaKpi?.comparado !== null && ventaKpi?.comparado !== undefined && (
              <p style={{ fontSize: 12, color: 'var(--cc-ink-3)', marginTop: 3 }}>vs {formatCLP(ventaKpi.comparado)} en el período comparado</p>
            )}
          </div>

          <Card style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <Metric icon={Target} tono={cumplimientoPct === null ? 'neutral' : cumplimientoPct >= 100 ? 'ok' : 'alerta'} label="Meta del período" />
              <span style={{ fontSize: 18, fontWeight: 900, color: 'var(--cc-ink)' }}>{cumplimientoPct !== null ? formatPctPlano(cumplimientoPct) : 'Sin meta'}</span>
            </div>
            {cumplimientoPct !== null && (
              <div style={{ marginTop: 8 }}>
                <ProgressBar pct={cumplimientoPct} />
              </div>
            )}
          </Card>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 12 }}>
            <Card padding={11}>
              <Metric icon={Users} tono="ok" label="Clientes activos" />
              <p style={{ fontSize: 17, fontWeight: 900, color: 'var(--cc-ink)', marginTop: 6 }}>{formatNumero(clientesKpi?.valor ?? 0)}</p>
            </Card>
            <Card padding={11}>
              <Metric icon={AlertTriangle} tono="critico" label="Deuda vencida" />
              <p style={{ fontSize: 17, fontWeight: 900, color: 'var(--cc-ink)', marginTop: 6, overflowWrap: 'anywhere' }}>{deudaKpi?.estado === 'no_disponible' ? '—' : formatCLPCompacto(deudaKpi?.valor ?? 0)}</p>
            </Card>
            <Card padding={11}>
              <Metric icon={Layers} tono="critico" label="Barriles críticos" />
              <p style={{ fontSize: 17, fontWeight: 900, color: 'var(--cc-ink)', marginTop: 6 }}>{barrilesKpi?.estado === 'no_disponible' ? '—' : formatNumero(barrilesKpi?.valor ?? 0)}</p>
            </Card>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.3fr', gap: 12, marginTop: 12 }}>
            <Card>
              <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--cc-ink-3)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.3 }}>Venta por categoría</p>
              <Donut
                size={92} grosor={16} centroValor={formatCLPCompacto(catTotales.Cerveza + catTotales.Kombucha)}
                segmentos={[{ label: 'Cerveza', valor: catTotales.Cerveza, color: 'var(--cc-gold)' }, { label: 'Kombucha', valor: catTotales.Kombucha, color: 'var(--cc-blue)' }]}
              />
            </Card>
            <Card>
              <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--cc-ink-3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.3 }}>Evolución de ventas</p>
              {grafico && <BarrasComparativas labels={grafico.labels} actual={grafico.actual} comparado={grafico.comparado} etiquetaActual={String(resumen?.serie.anioActual ?? '')} etiquetaComparada={String(resumen?.serie.anioComparado ?? '')} formatear={formatCLPCompacto} alto={130} />}
            </Card>
          </div>

          {resumen && ventaKpi && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginTop: 12, padding: '11px 13px', borderRadius: 14, background: 'var(--cc-gold-soft)' }}>
              <Sparkles size={16} color="var(--cc-gold-deep)" style={{ flexShrink: 0, marginTop: 1 }} />
              <p style={{ fontSize: 12, color: 'var(--cc-gold-deep)', lineHeight: 1.5 }}>
                <strong>Insight clave —</strong> Las ventas {ventaKpi.variacionPct !== null && ventaKpi.variacionPct >= 0 ? 'crecen' : 'caen'} {formatPctPlano(Math.abs(ventaKpi.variacionPct ?? 0))} vs el período comparado,
                {oportunidades[0] ? ` impulsadas por ${oportunidades[0].territorio}.` : ' con desempeño mixto por territorio.'}
              </p>
            </div>
          )}
        </SlideShell>
      ),
    },
    {
      titulo: 'Comparación año anterior',
      contenido: (
        <SlideShell>
          <SlideTitle>Comparación año anterior</SlideTitle>
          <div style={{ textAlign: 'center', marginBottom: 18 }}>
            <p style={{ fontSize: 34, fontWeight: 900, color: 'var(--cc-ink)', letterSpacing: '-1px' }}>{formatCLP(ventaKpi?.valor ?? 0)}</p>
            <Delta pct={ventaKpi?.variacionPct ?? null} sufijo="vs mismos períodos año anterior" size={13} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            <Card padding={13}>
              <p style={{ fontSize: 10.5, color: 'var(--cc-ink-3)', fontWeight: 700, marginBottom: 6 }}>LITROS</p>
              <p style={{ fontSize: 16, fontWeight: 900, color: 'var(--cc-ink)' }}>{comparativaAnual ? `${comparativaAnual.litros.actual.toLocaleString('es-CL', { maximumFractionDigits: 0 })} L` : '—'}</p>
              <Delta pct={comparativaAnual?.litros.pct ?? null} sufijo="" size={11} />
            </Card>
            <Card padding={13}>
              <p style={{ fontSize: 10.5, color: 'var(--cc-ink-3)', fontWeight: 700, marginBottom: 6 }}>CERVEZA</p>
              <p style={{ fontSize: 16, fontWeight: 900, color: 'var(--cc-ink)', overflowWrap: 'anywhere' }}>{formatCLPCompacto(comparativaAnual?.cerveza.actual ?? 0)}</p>
              <Delta pct={comparativaAnual?.cerveza.pct ?? null} sufijo="" size={11} />
            </Card>
            <Card padding={13}>
              <p style={{ fontSize: 10.5, color: 'var(--cc-ink-3)', fontWeight: 700, marginBottom: 6 }}>KOMBUCHA</p>
              <p style={{ fontSize: 16, fontWeight: 900, color: 'var(--cc-ink)', overflowWrap: 'anywhere' }}>{formatCLPCompacto(comparativaAnual?.kombucha.actual ?? 0)}</p>
              <Delta pct={comparativaAnual?.kombucha.pct ?? null} sufijo="" size={11} />
            </Card>
          </div>
          {grafico && (
            <Card style={{ marginTop: 12 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--cc-ink-3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.3 }}>Evolución mensual</p>
              <BarrasComparativas labels={grafico.labels} actual={grafico.actual} comparado={grafico.comparado} etiquetaActual={String(resumen?.serie.anioActual ?? '')} etiquetaComparada={String(resumen?.serie.anioComparado ?? '')} formatear={formatCLPCompacto} alto={120} />
            </Card>
          )}
        </SlideShell>
      ),
    },
    {
      titulo: 'Cerveza vs Kombucha',
      contenido: (
        <SlideShell>
          <SlideTitle>Cerveza vs Kombucha</SlideTitle>
          <div style={{ display: 'flex', alignItems: 'center', gap: 24, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 20 }}>
            <Donut
              size={140} grosor={22} centroTitulo="Total" centroValor={formatCLPCompacto(catTotales.Cerveza + catTotales.Kombucha)}
              segmentos={[{ label: 'Cerveza', valor: catTotales.Cerveza, color: 'var(--cc-gold)' }, { label: 'Kombucha', valor: catTotales.Kombucha, color: 'var(--cc-blue)' }]}
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <LeyendaGrande icon={Beer} color="var(--cc-gold)" label="Cerveza" valor={formatCLP(catTotales.Cerveza)} />
              <LeyendaGrande icon={GlassWater} color="var(--cc-blue)" label="Kombucha" valor={formatCLP(catTotales.Kombucha)} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Card padding={13}>
              <p style={{ fontSize: 10.5, color: 'var(--cc-ink-3)', fontWeight: 700, marginBottom: 6 }}>CERVEZA VS AÑO ANT.</p>
              <Delta pct={comparativaAnual?.cerveza.pct ?? null} sufijo="" size={16} />
              <p style={{ fontSize: 11, color: 'var(--cc-ink-3)', marginTop: 4 }}>
                {(catTotales.Cerveza + catTotales.Kombucha) > 0 ? formatPctPlano((catTotales.Cerveza / (catTotales.Cerveza + catTotales.Kombucha)) * 100) : '—'} de la venta del período
              </p>
            </Card>
            <Card padding={13}>
              <p style={{ fontSize: 10.5, color: 'var(--cc-ink-3)', fontWeight: 700, marginBottom: 6 }}>KOMBUCHA VS AÑO ANT.</p>
              <Delta pct={comparativaAnual?.kombucha.pct ?? null} sufijo="" size={16} />
              <p style={{ fontSize: 11, color: 'var(--cc-ink-3)', marginTop: 4 }}>
                {(catTotales.Cerveza + catTotales.Kombucha) > 0 ? formatPctPlano((catTotales.Kombucha / (catTotales.Cerveza + catTotales.Kombucha)) * 100) : '—'} de la venta del período
              </p>
            </Card>
          </div>
        </SlideShell>
      ),
    },
    {
      titulo: 'Performance por territorio',
      contenido: (
        <SlideShell>
          <SlideTitle>Performance por territorio</SlideTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {territoriosOrdenados.slice(0, 6).map(f => (
              <div key={f.territorio} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 13px', borderRadius: 13, background: 'var(--cc-card-2)' }}>
                <span style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--cc-ink)' }}>{f.territorio}{f.responsable ? ` · ${f.responsable}` : ''}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--cc-ink-2)' }}>{formatCLPCompacto(f.venta_clp)}</span>
                  {f.crecimientoYoyPct !== null && <Delta pct={f.crecimientoYoyPct} sufijo="" size={12} />}
                </span>
              </div>
            ))}
          </div>
        </SlideShell>
      ),
    },
    {
      titulo: 'Clientes',
      contenido: (
        <SlideShell>
          <SlideTitle>Retención de cartera</SlideTitle>
          <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 20 }}>
            <BigStat label="Activos" value={formatNumero(clientes?.estadoResumen.activo ?? 0)} tono="ok" small />
            <BigStat label="En riesgo" value={formatNumero(clientes?.estadoResumen.riesgo ?? 0)} small />
            <BigStat label="Inactivos" value={formatNumero(clientes?.estadoResumen.inactivo ?? 0)} tono="critico" small />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Card padding={13}><Metric icon={Users} tono="ok" label="Nuevos" /><p style={{ fontSize: 20, fontWeight: 900, color: 'var(--cc-ink)', marginTop: 6 }}>{formatNumero(clientes?.nuevos.length ?? 0)}</p></Card>
            <Card padding={13}><Metric icon={Users} tono="critico" label="Perdidos" /><p style={{ fontSize: 20, fontWeight: 900, color: 'var(--cc-ink)', marginTop: 6 }}>{formatNumero(clientes?.estadoResumen.perdido ?? 0)}</p></Card>
          </div>
        </SlideShell>
      ),
    },
    {
      titulo: 'Cobranza y barriles',
      contenido: (
        <SlideShell>
          <SlideTitle>Cobranza y barriles</SlideTitle>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            <Card padding={13}>
              <Metric icon={Wallet} tono="ok" label="Cobranza recuperada" />
              <p style={{ fontSize: 19, fontWeight: 900, color: 'var(--cc-ink)', marginTop: 6, overflowWrap: 'anywhere' }}>{cobranza?.kpis?.hay_snapshot_inicio ? formatCLPCompacto(cobranza.kpis.monto_recuperado) : '—'}</p>
            </Card>
            <Card padding={13}>
              <Metric icon={CircleDollarSign} tono="critico" label="Deuda +90 días" />
              <p style={{ fontSize: 19, fontWeight: 900, color: 'var(--cc-ink)', marginTop: 6, overflowWrap: 'anywhere' }}>{cobranza?.kpis ? formatCLPCompacto(cobranza.kpis.deuda_mas_90_actual) : '—'}</p>
            </Card>
            <Card padding={13}>
              <Metric icon={Layers} tono="critico" label="Barriles críticos" />
              <p style={{ fontSize: 19, fontWeight: 900, color: 'var(--cc-ink)', marginTop: 6 }}>{formatNumero(barriles?.estado?.criticos ?? 0)}</p>
            </Card>
            <Card padding={13}>
              <Metric icon={CalendarDays} tono="ok" label="Barriles recuperados" />
              <p style={{ fontSize: 19, fontWeight: 900, color: 'var(--cc-ink)', marginTop: 6 }}>{barriles?.recuperados?.hay_historial ? formatNumero(barriles.recuperados.recuperados) : '—'}</p>
            </Card>
          </div>
        </SlideShell>
      ),
    },
    {
      titulo: 'Oportunidades y riesgos',
      contenido: (
        <SlideShell>
          <SlideTitle>Oportunidades y riesgos</SlideTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--cc-green)', textTransform: 'uppercase', letterSpacing: 0.4 }}>Oportunidades</p>
            {oportunidades.length === 0 && <p style={{ fontSize: 13, color: 'var(--cc-ink-3)' }}>Sin territorios con crecimiento destacado (+15% YoY).</p>}
            {oportunidades.map(f => (
              <div key={f.territorio} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 12px', borderRadius: 12, background: 'var(--cc-green-soft)' }}>
                <TrendingUp size={15} color="var(--cc-green)" />
                <p style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--cc-ink)' }}>{f.territorio} crece {formatPctPlano(f.crecimientoYoyPct ?? 0)} vs año anterior</p>
              </div>
            ))}
            {(clientes?.oportunidadKombucha.length ?? 0) > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 12px', borderRadius: 12, background: 'var(--cc-green-soft)' }}>
                <Sparkles size={15} color="var(--cc-green)" />
                <p style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--cc-ink)' }}>{clientes!.oportunidadKombucha.length} clientes de cerveza sin Kombucha</p>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--cc-red)', textTransform: 'uppercase', letterSpacing: 0.4 }}>Riesgos</p>
            {riesgos.length === 0 && <p style={{ fontSize: 13, color: 'var(--cc-ink-3)' }}>Sin riesgos destacados este período.</p>}
            {riesgos.map(f => (
              <div key={f.territorio} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 12px', borderRadius: 12, background: 'var(--cc-red-soft)' }}>
                <TrendingDown size={15} color="var(--cc-red)" />
                <p style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--cc-ink)' }}>
                  {f.territorio}: {f.cumplimientoMetaPct !== null && f.cumplimientoMetaPct < 90 ? `meta al ${formatPctPlano(f.cumplimientoMetaPct)}` : `${f.clientes_perdidos} perdidos vs ${f.clientes_nuevos} nuevos`}
                </p>
              </div>
            ))}
          </div>
        </SlideShell>
      ),
    },
    {
      titulo: 'Compromisos próximo período',
      contenido: (
        <SlideShell>
          <SlideTitle>Compromisos próximo período</SlideTitle>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 14 }}>
            <Card padding={10}><p style={{ fontSize: 10, color: 'var(--cc-ink-3)', fontWeight: 700 }}>Cumplidos</p><p style={{ fontSize: 18, fontWeight: 900, color: 'var(--cc-green)' }}>{cumplidos}</p></Card>
            <Card padding={10}><p style={{ fontSize: 10, color: 'var(--cc-ink-3)', fontWeight: 700 }}>Atrasados</p><p style={{ fontSize: 18, fontWeight: 900, color: 'var(--cc-red)' }}>{atrasados}</p></Card>
            <Card padding={10}><p style={{ fontSize: 10, color: 'var(--cc-ink-3)', fontWeight: 700 }}>Pendientes</p><p style={{ fontSize: 18, fontWeight: 900, color: 'var(--cc-ink)' }}>{pendientes}</p></Card>
            <Card padding={10}><p style={{ fontSize: 10, color: 'var(--cc-ink-3)', fontWeight: 700 }}>Cumplimiento</p><p style={{ fontSize: 18, fontWeight: 900, color: 'var(--cc-gold-deep)' }}>{formatPctPlano(tasaCumplimiento)}</p></Card>
          </div>

          <Card style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input placeholder="Responsable" value={nuevoResponsable} onChange={e => setNuevoResponsable(e.target.value)}
                style={{ flex: '1 1 120px', minHeight: 42, background: 'var(--cc-card-2)', border: '1px solid var(--cc-line)', borderRadius: 10, padding: '0 10px', color: 'var(--cc-ink)', fontSize: 12.5 }} />
              <input placeholder="Acción" value={nuevaAccion} onChange={e => setNuevaAccion(e.target.value)}
                style={{ flex: '2 1 160px', minHeight: 42, background: 'var(--cc-card-2)', border: '1px solid var(--cc-line)', borderRadius: 10, padding: '0 10px', color: 'var(--cc-ink)', fontSize: 12.5 }} />
              <input type="date" value={nuevaFecha} onChange={e => setNuevaFecha(e.target.value)}
                style={{ flex: '1 1 130px', minHeight: 42, background: 'var(--cc-card-2)', border: '1px solid var(--cc-line)', borderRadius: 10, padding: '0 10px', color: 'var(--cc-ink)', fontSize: 12.5 }} />
              <button onClick={agregarCompromiso} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 14px', minHeight: 42, borderRadius: 10, background: 'var(--cc-gold)', color: 'var(--cc-on-gold)', border: 'none', fontWeight: 800, fontSize: 12.5, cursor: 'pointer' }}>
                <Plus size={14} /> Agregar
              </button>
            </div>
          </Card>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
            {compromisos.map(c => (
              <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 12px', background: 'var(--cc-card-2)', borderRadius: 12, fontSize: 12.5, gap: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <span style={{ fontWeight: 700, color: 'var(--cc-ink)' }}>{c.responsable}</span>
                  <span style={{ color: 'var(--cc-ink-3)' }}> — {c.accion} · {c.fecha_compromiso}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  <span style={{
                    fontSize: 10.5, fontWeight: 700, padding: '3px 9px', borderRadius: 99,
                    color: TONO[c.estado === 'cumplido' ? 'ok' : c.estado === 'atrasado' ? 'critico' : 'neutral'].fg,
                    background: TONO[c.estado === 'cumplido' ? 'ok' : c.estado === 'atrasado' ? 'critico' : 'neutral'].bg,
                  }}>{c.estado}</span>
                  {c.estado !== 'cumplido' && (
                    <button onClick={() => marcarCumplido(c.id)} style={{ fontSize: 11, color: 'var(--cc-gold-deep)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}>
                      Cumplido
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </SlideShell>
      ),
    },
  ]

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--cc-ink-3)', background: 'var(--cc-page)' }}>
        Cargando reunión comercial…
      </div>
    )
  }
  if (error) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--cc-ink-3)', background: 'var(--cc-page)', padding: 24, textAlign: 'center' }}>
        No se pudo cargar la reunión comercial: {error}
      </div>
    )
  }

  const initials = user?.iniciales ?? user?.nombre?.slice(0, 2).toUpperCase() ?? '··'

  return (
    <div
      ref={containerRef}
      style={{
        position: 'fixed', inset: 0, zIndex: 40, background: 'var(--cc-page)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}
    >
      <div style={{ padding: 'calc(env(safe-area-inset-top, 0px) + 12px) 18px 10px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={toggleFullscreen} className="cc-tap" style={{ width: 34, height: 34, borderRadius: 10, border: '1px solid var(--cc-line)', background: 'var(--cc-card)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              {fullscreen ? <Minimize size={14} color="var(--cc-ink-2)" /> : <Maximize size={14} color="var(--cc-ink-2)" />}
            </button>
            <div>
              <p style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--cc-gold-deep)', textTransform: 'uppercase', letterSpacing: 0.6 }}>Reunión Comercial</p>
              <p style={{ fontSize: 11, color: 'var(--cc-ink-3)', fontWeight: 600 }}>{slide + 1} / {slides.length}</p>
            </div>
          </div>
          <span
            style={{
              width: 34, height: 34, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
              border: '1.5px solid var(--cc-gold-line)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: user?.avatarUrl ? 'transparent' : 'linear-gradient(135deg, #D4AF37, #B8962E)',
            }}
          >
            {user?.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <span style={{ fontSize: 11, fontWeight: 900, color: 'var(--cc-ink)' }}>{initials}</span>
            )}
          </span>
        </div>
        <div style={{ height: 3, borderRadius: 3, background: 'var(--cc-neutral-soft)', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${((slide + 1) / slides.length) * 100}%`, background: 'var(--cc-gold)', borderRadius: 3, transition: 'width 0.3s' }} />
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 18px 0', display: 'flex' }}>
        {slides[slide].contenido}
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 14, padding: '12px 18px calc(16px + env(safe-area-inset-bottom, 0px))', flexShrink: 0 }}>
        <button
          onClick={() => setSlide(s => Math.max(0, s - 1))} disabled={slide === 0}
          style={{ width: 42, height: 42, borderRadius: 13, background: 'var(--cc-card)', border: '1px solid var(--cc-line)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: slide === 0 ? 0.35 : 1 }}
        >
          <ArrowLeft size={17} color="var(--cc-ink)" />
        </button>
        <div style={{ display: 'flex', gap: 5 }}>
          {slides.map((_, i) => (
            <button key={i} onClick={() => setSlide(i)} style={{ width: i === slide ? 16 : 6, height: 6, borderRadius: 4, border: 'none', cursor: 'pointer', padding: 0, background: i === slide ? 'var(--cc-gold)' : 'var(--cc-neutral)', transition: 'width 0.2s' }} />
          ))}
        </div>
        <button
          onClick={() => setSlide(s => Math.min(slides.length - 1, s + 1))} disabled={slide === slides.length - 1}
          style={{ width: 42, height: 42, borderRadius: 13, background: 'var(--cc-gold)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: slide === slides.length - 1 ? 0.35 : 1 }}
        >
          <ArrowRight size={17} color="var(--cc-on-gold)" />
        </button>
      </div>
    </div>
  )
}

function BigStat({ label, value, tono, small }: { label: string; value: string; tono?: Tono; small?: boolean }) {
  const color = tono ? TONO[tono].fg : 'var(--cc-ink)'
  return (
    <div style={{ textAlign: 'center' }}>
      <p style={{ fontSize: small ? 26 : 38, fontWeight: 900, color, letterSpacing: '-1px' }}>{value}</p>
      <p style={{ fontSize: 11, color: 'var(--cc-ink-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 4 }}>{label}</p>
    </div>
  )
}

function LeyendaGrande({ icon: Icon, color, label, valor }: { icon: typeof Beer; color: string; label: string; valor: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
      <span style={{ width: 30, height: 30, borderRadius: 9, background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={15} color="#fff" strokeWidth={2} />
      </span>
      <div>
        <p style={{ fontSize: 11.5, color: 'var(--cc-ink-3)', fontWeight: 700 }}>{label}</p>
        <p style={{ fontSize: 16, fontWeight: 900, color: 'var(--cc-ink)' }}>{valor}</p>
      </div>
    </div>
  )
}
