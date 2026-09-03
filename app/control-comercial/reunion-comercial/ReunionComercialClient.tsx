'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Maximize, Minimize, Plus } from 'lucide-react'
import { formatCLP, formatLitros, formatNumero } from '@/components/control-comercial/KpiCard'

// ── Tipos mínimos de las respuestas ya construidas en las otras páginas ──
interface Kpi { id: string; titulo: string; valor: number; formato: string; variacionPct: number | null; estado?: string }
interface Resumen { periodo: { nombre: string }; kpis: Kpi[]; ventasPorTerritorio: { territorio: string; categoria_producto: string; litros: number; monto: number }[] }
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

function Slide({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      minHeight: '70vh', display: 'flex', flexDirection: 'column', justifyContent: 'center',
      padding: '40px 24px', maxWidth: 980, margin: '0 auto', width: '100%',
    }}>
      {children}
    </div>
  )
}
function SlideTitle({ children }: { children: React.ReactNode }) {
  return <h2 style={{ fontSize: 'clamp(22px, 4vw, 34px)', fontWeight: 900, color: 'var(--cream)', marginBottom: 28, letterSpacing: -0.5 }}>{children}</h2>
}
function BigStat({ label, value, tone }: { label: string; value: string; tone?: 'ok' | 'bad' }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <p style={{ fontSize: 'clamp(30px, 6vw, 56px)', fontWeight: 900, color: tone === 'bad' ? 'var(--red)' : tone === 'ok' ? 'var(--green)' : 'var(--cream)', letterSpacing: -1 }}>{value}</p>
      <p style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 6 }}>{label}</p>
    </div>
  )
}

export default function ReunionComercialClient() {
  const [resumen, setResumen] = useState<Resumen | null>(null)
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
    // Secuencial a propósito: esta pantalla ya dispara ~6 endpoints que a su vez cada uno
    // llama varias RPC — todo en paralelo satura el pool de conexiones y puede superar el
    // statement_timeout. Es una pantalla de uso puntual (reunión mensual), no de alta frecuencia,
    // así que priorizamos que cargue completa por sobre que cargue rápido.
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

  const catTotales = useMemo(() => {
    const acc = { Cerveza: 0, Kombucha: 0 }
    for (const f of resumen?.ventasPorTerritorio ?? []) {
      if (f.categoria_producto === 'Cerveza') acc.Cerveza += Number(f.monto)
      if (f.categoria_producto === 'Kombucha') acc.Kombucha += Number(f.monto)
    }
    return acc
  }, [resumen])

  const cumplidos = compromisos.filter(c => c.estado === 'cumplido').length
  const atrasados = compromisos.filter(c => c.estado === 'atrasado').length
  const pendientes = compromisos.filter(c => c.estado === 'pendiente').length
  const tasaCumplimiento = compromisos.length > 0 ? (cumplidos / compromisos.length) * 100 : 0

  const territoriosOrdenados = useMemo(() => [...(equipo?.filas ?? [])].sort((a, b) => b.venta_clp - a.venta_clp), [equipo])
  const riesgos = territoriosOrdenados.filter(f => (f.cumplimientoMetaPct !== null && f.cumplimientoMetaPct < 90) || f.clientes_perdidos > f.clientes_nuevos)
  const oportunidades = territoriosOrdenados.filter(f => f.crecimientoYoyPct !== null && f.crecimientoYoyPct > 15)

  const slides = [
    <Slide key="resultado">
      <SlideTitle>Resultado general del período{resumen ? ` — ${resumen.periodo.nombre}` : ''}</SlideTitle>
      <div style={{ display: 'flex', gap: 40, justifyContent: 'center', flexWrap: 'wrap' }}>
        <BigStat label="Venta del período" value={ventaKpi ? formatCLP(ventaKpi.valor) : '—'} />
        <BigStat label="Crecimiento YoY" value={crecKpi ? `${crecKpi.valor >= 0 ? '+' : ''}${crecKpi.valor.toFixed(1)}%` : '—'} tone={crecKpi && crecKpi.valor >= 0 ? 'ok' : 'bad'} />
      </div>
    </Slide>,
    <Slide key="meta">
      <SlideTitle>Meta vs Real</SlideTitle>
      {metaKpi && metaKpi.estado !== 'sin_meta' ? (
        <BigStat label="Cumplimiento de meta" value={`${metaKpi.valor.toFixed(1)}%`} tone={metaKpi.valor >= 100 ? 'ok' : metaKpi.valor >= 80 ? undefined : 'bad'} />
      ) : (
        <p style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 16 }}>Todavía no hay meta compañía configurada para este período.</p>
      )}
    </Slide>,
    <Slide key="yoy">
      <SlideTitle>Comparación año anterior</SlideTitle>
      <div style={{ display: 'flex', gap: 40, justifyContent: 'center', flexWrap: 'wrap' }}>
        <BigStat label="Venta actual" value={ventaKpi ? formatCLP(ventaKpi.valor) : '—'} />
        <BigStat label="Vs. año anterior" value={ventaKpi?.variacionPct !== null && ventaKpi?.variacionPct !== undefined ? `${ventaKpi.variacionPct >= 0 ? '+' : ''}${ventaKpi.variacionPct.toFixed(1)}%` : '—'} tone={ventaKpi && (ventaKpi.variacionPct ?? 0) >= 0 ? 'ok' : 'bad'} />
      </div>
    </Slide>,
    <Slide key="categoria">
      <SlideTitle>Cerveza vs Kombucha</SlideTitle>
      <div style={{ display: 'flex', gap: 40, justifyContent: 'center', flexWrap: 'wrap' }}>
        <BigStat label="Cerveza" value={formatCLP(catTotales.Cerveza)} />
        <BigStat label="Kombucha" value={formatCLP(catTotales.Kombucha)} />
      </div>
    </Slide>,
    <Slide key="territorios">
      <SlideTitle>Performance por territorio</SlideTitle>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {territoriosOrdenados.slice(0, 6).map(f => (
          <div key={f.territorio} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, padding: '8px 0', borderBottom: '1px solid var(--border-subtle)' }}>
            <span style={{ fontWeight: 800, color: 'var(--cream)' }}>{f.territorio}{f.responsable ? ` · ${f.responsable}` : ''}</span>
            <span style={{ color: 'var(--muted)', fontWeight: 700 }}>
              {formatCLP(f.venta_clp)}
              {f.crecimientoYoyPct !== null && <span style={{ color: f.crecimientoYoyPct >= 0 ? 'var(--green)' : 'var(--red)', marginLeft: 10 }}>{f.crecimientoYoyPct >= 0 ? '+' : ''}{f.crecimientoYoyPct.toFixed(0)}%</span>}
            </span>
          </div>
        ))}
      </div>
    </Slide>,
    <Slide key="responsables">
      <SlideTitle>Performance por responsable</SlideTitle>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {territoriosOrdenados.slice(0, 6).map(f => (
          <div key={f.territorio} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, padding: '8px 0', borderBottom: '1px solid var(--border-subtle)' }}>
            <span style={{ fontWeight: 800, color: 'var(--cream)' }}>{f.responsable ?? f.territorio}</span>
            <span style={{ color: 'var(--muted)', fontWeight: 700 }}>{f.clientes_activos} clientes activos · {formatLitros(f.litros)}</span>
          </div>
        ))}
      </div>
    </Slide>,
    <Slide key="nuevos">
      <SlideTitle>Nuevos clientes</SlideTitle>
      <BigStat label="Clientes nuevos del período" value={formatNumero(clientes?.nuevos.length ?? 0)} tone="ok" />
    </Slide>,
    <Slide key="reactivados">
      <SlideTitle>Reactivados</SlideTitle>
      <BigStat label="Clientes reactivados del período" value={formatNumero(clientes?.reactivados.length ?? 0)} tone="ok" />
    </Slide>,
    <Slide key="perdidos">
      <SlideTitle>Clientes perdidos</SlideTitle>
      <BigStat label="90+ días sin comprar, cruzados este período" value={formatNumero(clientes?.estadoResumen.perdido ?? 0)} tone="bad" />
    </Slide>,
    <Slide key="retencion">
      <SlideTitle>Retención de cartera</SlideTitle>
      <div style={{ display: 'flex', gap: 40, justifyContent: 'center', flexWrap: 'wrap' }}>
        <BigStat label="Activos" value={formatNumero(clientes?.estadoResumen.activo ?? 0)} tone="ok" />
        <BigStat label="En riesgo" value={formatNumero(clientes?.estadoResumen.riesgo ?? 0)} />
        <BigStat label="Inactivos" value={formatNumero(clientes?.estadoResumen.inactivo ?? 0)} tone="bad" />
      </div>
    </Slide>,
    <Slide key="cobranza">
      <SlideTitle>Cobranza</SlideTitle>
      <div style={{ display: 'flex', gap: 40, justifyContent: 'center', flexWrap: 'wrap' }}>
        <BigStat label="Recuperado" value={cobranza?.kpis?.hay_snapshot_inicio ? formatCLP(cobranza.kpis.monto_recuperado) : '—'} tone="ok" />
        <BigStat label="Cuentas regularizadas" value={cobranza?.kpis?.hay_snapshot_inicio ? formatNumero(cobranza.kpis.cuentas_regularizadas) : '—'} />
      </div>
    </Slide>,
    <Slide key="deuda">
      <SlideTitle>Deuda crítica</SlideTitle>
      <div style={{ display: 'flex', gap: 40, justifyContent: 'center', flexWrap: 'wrap' }}>
        <BigStat label="Deuda vencida total" value={cobranza?.kpis ? formatCLP(cobranza.kpis.deuda_vencida_actual) : '—'} tone="bad" />
        <BigStat label="Deuda +90 días" value={cobranza?.kpis ? formatCLP(cobranza.kpis.deuda_mas_90_actual) : '—'} tone="bad" />
      </div>
    </Slide>,
    <Slide key="barriles">
      <SlideTitle>Barriles</SlideTitle>
      <div style={{ display: 'flex', gap: 40, justifyContent: 'center', flexWrap: 'wrap' }}>
        <BigStat label="Recuperados" value={barriles?.recuperados?.hay_historial ? formatNumero(barriles.recuperados.recuperados) : '—'} tone="ok" />
        <BigStat label="Críticos (+90d)" value={formatNumero(barriles?.estado?.criticos ?? 0)} tone="bad" />
      </div>
    </Slide>,
    <Slide key="oportunidades">
      <SlideTitle>Oportunidades</SlideTitle>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {oportunidades.length === 0 && <p style={{ color: 'var(--muted)', fontSize: 15, textAlign: 'center' }}>Sin territorios con crecimiento destacado (+15% YoY) este período.</p>}
        {oportunidades.map(f => (
          <p key={f.territorio} style={{ fontSize: 16, color: 'var(--cream)', fontWeight: 700 }}>
            {f.territorio} crece {f.crecimientoYoyPct!.toFixed(0)}% vs mismo período año anterior
          </p>
        ))}
        {(clientes?.oportunidadKombucha.length ?? 0) > 0 && (
          <p style={{ fontSize: 16, color: 'var(--cream)', fontWeight: 700 }}>
            {clientes!.oportunidadKombucha.length} clientes activos de cerveza todavía no compran Kombucha
          </p>
        )}
      </div>
    </Slide>,
    <Slide key="riesgos">
      <SlideTitle>Riesgos</SlideTitle>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {riesgos.length === 0 && <p style={{ color: 'var(--muted)', fontSize: 15, textAlign: 'center' }}>Sin riesgos destacados detectados este período.</p>}
        {riesgos.map(f => (
          <p key={f.territorio} style={{ fontSize: 16, color: 'var(--red)', fontWeight: 700 }}>
            {f.territorio}: {f.cumplimientoMetaPct !== null && f.cumplimientoMetaPct < 90 ? `cumplimiento de meta ${f.cumplimientoMetaPct.toFixed(0)}%` : `${f.clientes_perdidos} clientes perdidos vs ${f.clientes_nuevos} nuevos`}
          </p>
        ))}
      </div>
    </Slide>,
    <Slide key="compromisos">
      <SlideTitle>Compromisos próximo período</SlideTitle>
      <div style={{ display: 'flex', gap: 30, justifyContent: 'center', marginBottom: 24, flexWrap: 'wrap' }}>
        <BigStat label="Cumplidos" value={formatNumero(cumplidos)} tone="ok" />
        <BigStat label="Atrasados" value={formatNumero(atrasados)} tone="bad" />
        <BigStat label="Pendientes" value={formatNumero(pendientes)} />
        <BigStat label="Tasa de cumplimiento" value={`${tasaCumplimiento.toFixed(0)}%`} />
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 16, marginBottom: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input placeholder="Responsable" value={nuevoResponsable} onChange={e => setNuevoResponsable(e.target.value)}
          style={{ flex: '1 1 140px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 9, padding: '9px 10px', color: 'var(--cream)', fontSize: 13 }} />
        <input placeholder="Acción" value={nuevaAccion} onChange={e => setNuevaAccion(e.target.value)}
          style={{ flex: '2 1 200px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 9, padding: '9px 10px', color: 'var(--cream)', fontSize: 13 }} />
        <input type="date" value={nuevaFecha} onChange={e => setNuevaFecha(e.target.value)}
          style={{ flex: '1 1 140px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 9, padding: '9px 10px', color: 'var(--cream)', fontSize: 13 }} />
        <button onClick={agregarCompromiso} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 14px', borderRadius: 9, background: 'var(--gold)', color: '#0A0A0A', border: 'none', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>
          <Plus size={14} /> Agregar
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 260, overflowY: 'auto' }}>
        {compromisos.map(c => (
          <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: 'var(--surface)', borderRadius: 10, fontSize: 13 }}>
            <div>
              <span style={{ fontWeight: 700, color: 'var(--cream)' }}>{c.responsable}</span>
              <span style={{ color: 'var(--muted)' }}> — {c.accion} · {c.fecha_compromiso}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
                color: c.estado === 'cumplido' ? 'var(--green)' : c.estado === 'atrasado' ? 'var(--red)' : 'var(--muted)',
                background: c.estado === 'cumplido' ? 'rgba(74,222,128,0.12)' : c.estado === 'atrasado' ? 'rgba(248,113,113,0.12)' : 'var(--surface2)',
              }}>{c.estado}</span>
              {c.estado !== 'cumplido' && (
                <button onClick={() => marcarCumplido(c.id)} style={{ fontSize: 11, color: 'var(--gold)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}>
                  Marcar cumplido
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </Slide>,
  ]

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Cargando reunión comercial…</div>
  if (error) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>No se pudo cargar la reunión comercial: {error}</div>

  return (
    <div ref={containerRef} style={{ background: 'var(--bg)', minHeight: fullscreen ? '100vh' : undefined, position: 'relative' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Reunión Comercial · {slide + 1} / {slides.length}
        </span>
        <button onClick={toggleFullscreen} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 9, padding: 8, cursor: 'pointer', color: 'var(--cream)' }}>
          {fullscreen ? <Minimize size={15} /> : <Maximize size={15} />}
        </button>
      </div>

      {slides[slide]}

      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 16, padding: '16px 20px 32px' }}>
        <button onClick={() => setSlide(s => Math.max(0, s - 1))} disabled={slide === 0}
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '9px 12px', cursor: 'pointer', color: 'var(--cream)', opacity: slide === 0 ? 0.4 : 1 }}>
          <ChevronLeft size={16} />
        </button>
        <div style={{ display: 'flex', gap: 5 }}>
          {slides.map((_, i) => (
            <button key={i} onClick={() => setSlide(i)} style={{
              width: 6, height: 6, borderRadius: '50%', border: 'none', cursor: 'pointer', padding: 0,
              background: i === slide ? 'var(--gold)' : 'var(--border)',
            }} />
          ))}
        </div>
        <button onClick={() => setSlide(s => Math.min(slides.length - 1, s + 1))} disabled={slide === slides.length - 1}
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '9px 12px', cursor: 'pointer', color: 'var(--cream)', opacity: slide === slides.length - 1 ? 0.4 : 1 }}>
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  )
}
