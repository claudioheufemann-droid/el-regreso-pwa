'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CalendarClock, Copy, Plus, Save, Target, TrendingUp, Users, X,
} from 'lucide-react'
import CCHeader from '@/components/control-comercial/CCHeader'
import { FilaMetaResponsable } from '@/components/control-comercial/cards'
import { Gauge } from '@/components/control-comercial/charts'
import {
  CCPage, Card, CardHeader, ErrorState, NotaPie, PageSkeleton, SelectChip,
  botonPrimario, botonSecundario, formatCLP, formatCLPCompacto, formatLitros, formatNumero,
  formatPctPlano, type Tono,
} from '@/components/control-comercial/ui'
import type { KpiMeta, ScopeMeta, Territorio } from '@/lib/control-comercial/tipos'

interface PeriodoRow { id: number; nombre: string; fecha_inicio: string; fecha_fin: string; activo: boolean }

interface ResponsableMeta {
  responsable: string
  territorios: string[]
  real: { venta: number; litros: number; nuevos: number; deuda: number; barrilesCriticos: number }
  realComparado: number | null
  metas: { ventas_clp: number | null; litros_total: number | null; nuevos_clientes: number | null; cobranza_recuperada: number | null; barriles_recuperados: number | null }
}

interface PanelResponse {
  periodo: { id: number | null; nombre: string; inicio: string; fin: string; mes: number; anio: number; enCurso: boolean; diasTotales: number; diasRestantes: number }
  metaCompania: { ventas_clp: number | null; litros_total: number | null; nuevos_clientes: number | null }
  real: { ventas: number; litros: number; nuevosClientes: number }
  responsables: ResponsableMeta[]
  planAnual: { anio: number; hastaPeriodo: string; ventas: { real: number; meta: number | null }; litros: { real: number; meta: number | null }; nuevosClientes: { real: number; meta: number | null } }
  territorios: Territorio[]
}

const KPI_LABELS: Record<KpiMeta, string> = {
  ventas_clp: 'Ventas ($)', litros_total: 'Litros totales', litros_cerveza: 'Litros cerveza', litros_kombucha: 'Litros kombucha',
  nuevos_clientes: 'Nuevos clientes', reactivaciones: 'Reactivaciones', cobranza_recuperada: 'Cobranza recuperada ($)',
  cuentas_regularizadas: 'Cuentas regularizadas', barriles_recuperados: 'Barriles recuperados',
}
const SCOPE_LABELS: Record<ScopeMeta, string> = { compania: 'Compañía', territorio: 'Territorio/Canal', vendedor: 'Vendedor' }

function iniciales(nombre: string): string {
  return nombre.trim().split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('') || '?'
}

function pctDe(real: number, meta: number | null): number | null {
  return meta ? (real / meta) * 100 : null
}

function formatFechaLarga(iso: string): string {
  const d = new Date(`${iso}T12:00:00`)
  return d.toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function MetasClient() {
  const [periodos, setPeriodos] = useState<PeriodoRow[]>([])
  const [periodoId, setPeriodoId] = useState<number | null>(null)
  const [data, setData] = useState<PanelResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [modalAbierto, setModalAbierto] = useState(false)
  const [copiando, setCopiando] = useState(false)

  useEffect(() => {
    fetch('/api/control-comercial/periodos').then(r => r.json()).then(d => {
      setPeriodos(d.periodos ?? [])
      const activo = (d.periodos ?? []).find((p: PeriodoRow) => p.activo)
      setPeriodoId(activo?.id ?? d.periodos?.[0]?.id ?? null)
    })
  }, [])

  const periodoActivo = periodos.find(p => p.id === periodoId)

  const cargar = useCallback(() => {
    if (!periodoActivo) return
    let cancelado = false
    setLoading(true)
    setError(null)
    const anio = Number(periodoActivo.fecha_fin.slice(0, 4))
    const mes = Number(periodoActivo.fecha_fin.slice(5, 7))
    fetch(`/api/control-comercial/metas/panel?anio=${anio}&mes=${mes}`)
      .then(async r => {
        if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? 'Error al cargar metas')
        return r.json()
      })
      .then(d => { if (!cancelado) setData(d) })
      .catch(e => { if (!cancelado) setError(e instanceof Error ? e.message : 'Error al cargar') })
      .finally(() => { if (!cancelado) setLoading(false) })
    return () => { cancelado = true }
  }, [periodoActivo])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => cargar(), [cargar])

  async function copiarMesAnterior() {
    if (!periodoId) return
    const idx = periodos.findIndex(p => p.id === periodoId)
    const anterior = periodos[idx + 1] // la lista viene ordenada desc por fecha_inicio
    if (!anterior) return
    setCopiando(true)
    try {
      const metasAnteriores: { scope_type: string; scope_value: string | null; kpi_type: string; valor_meta: number }[] =
        await fetch(`/api/control-comercial/metas?periodo_id=${anterior.id}`).then(r => r.json())
      for (const m of metasAnteriores) {
        await fetch('/api/control-comercial/metas', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ periodo_id: periodoId, scope_type: m.scope_type, scope_value: m.scope_value, kpi_type: m.kpi_type, valor_meta: m.valor_meta }),
        })
      }
      cargar()
    } finally {
      setCopiando(false)
    }
  }

  const cumplimientoVentas = data ? pctDe(data.real.ventas, data.metaCompania.ventas_clp) : null
  const cumplimientoLitros = data ? pctDe(data.real.litros, data.metaCompania.litros_total) : null

  const opcionesPeriodo = useMemo(() => periodos.map(p => ({ value: p.id, label: `${p.nombre}${p.activo ? ' · en curso' : ''}` })), [periodos])

  return (
    <CCPage>
      <CCHeader title="Metas comerciales" subtitle="Compañía, territorio y responsable" />

      <SelectChip icon={CalendarClock} value={periodoId ?? 0} onChange={v => setPeriodoId(Number(v))} options={opcionesPeriodo} flex="1 1 auto" />

      {loading && <PageSkeleton />}
      {!loading && error && <ErrorState mensaje={error} onReintentar={cargar} />}

      {!loading && !error && data && (
        <div className="cc-enter" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Card>
            <CardHeader icon={Target} titulo="Meta compañía" accion={<span style={{ fontSize: 11, fontWeight: 700, color: 'var(--cc-green)', background: 'var(--cc-green-soft)', padding: '4px 10px', borderRadius: 999 }}>{data.periodo.enCurso ? 'En curso' : 'Cerrado'}</span>} />

            <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
              <MetaColumna titulo="Ventas" real={formatCLP(data.real.ventas)} meta={data.metaCompania.ventas_clp} formatMeta={formatCLP} pct={cumplimientoVentas} />
              <MetaColumna titulo="Litros" real={formatLitros(data.real.litros)} meta={data.metaCompania.litros_total} formatMeta={formatLitros} pct={cumplimientoLitros} />
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, marginLeft: 'auto' }}>
                <span style={{ fontSize: 11, color: 'var(--cc-ink-3)', fontWeight: 700 }}>Días restantes</span>
                <span style={{ fontSize: 20, fontWeight: 900, color: 'var(--cc-ink)' }}>{data.periodo.diasRestantes}</span>
                <span style={{ fontSize: 10.5, color: 'var(--cc-ink-3)' }}>de {data.periodo.diasTotales}</span>
              </div>
            </div>

            {cumplimientoVentas !== null && (
              <div style={{ marginTop: 14 }}>
                <div style={{ height: 10, borderRadius: 10, background: 'var(--cc-neutral-soft)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${Math.min(100, cumplimientoVentas)}%`, background: 'var(--cc-gold)', borderRadius: 10 }} />
                </div>
                <p style={{ fontSize: 11.5, color: 'var(--cc-ink-3)', marginTop: 6, textAlign: 'right', fontWeight: 700 }}>{formatPctPlano(cumplimientoVentas)}</p>
              </div>
            )}
          </Card>

          <Card>
            <CardHeader icon={Users} titulo="Metas por responsable" />
            {data.responsables.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--cc-ink-3)', textAlign: 'center', padding: '20px 0' }}>Sin responsables con venta en este período.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {data.responsables.map(r => {
                  const pctVentas = pctDe(r.real.venta, r.metas.ventas_clp)
                  const estado: { texto: string; tono: Tono } = pctVentas === null
                    ? { texto: 'Sin meta', tono: 'neutral' }
                    : pctVentas >= 100 ? { texto: 'En curso', tono: 'ok' }
                    : pctVentas >= 70 ? { texto: 'En curso', tono: 'marca' }
                    : { texto: 'En riesgo', tono: 'critico' }
                  return (
                    <FilaMetaResponsable
                      key={r.responsable}
                      nombre={r.responsable}
                      iniciales={iniciales(r.responsable)}
                      estado={estado.texto}
                      estadoTono={estado.tono}
                      celdas={[
                        { label: 'Ventas', pct: pctVentas, valor: formatCLPCompacto(r.real.venta) },
                        { label: 'Litros', pct: pctDe(r.real.litros, r.metas.litros_total), valor: formatLitros(r.real.litros) },
                        { label: 'Nuevos cl.', pct: pctDe(r.real.nuevos, r.metas.nuevos_clientes), valor: formatNumero(r.real.nuevos) },
                        { label: 'Barriles', pct: null, valor: `${r.real.barrilesCriticos} críticos` },
                      ]}
                    />
                  )
                })}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
              <button onClick={() => setModalAbierto(true)} style={{ ...botonSecundario(), flex: '1 1 auto' }}>
                <Plus size={15} /> Agregar responsable
              </button>
              <button onClick={copiarMesAnterior} disabled={copiando} style={{ ...botonSecundario({ opacity: copiando ? 0.6 : 1 }), flex: '1 1 auto' }}>
                <Copy size={15} /> {copiando ? 'Copiando…' : 'Copiar mes anterior'}
              </button>
              <button onClick={() => setModalAbierto(true)} style={{ ...botonPrimario(), flex: '1 1 100%' }}>
                <Save size={15} /> Guardar metas
              </button>
            </div>
          </Card>

          <Card>
            <CardHeader icon={TrendingUp} titulo="Plan anual" sub={`Acumulado al ${formatFechaLarga(data.periodo.fin)}`} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              <PlanAnualGauge titulo="Ventas" real={data.planAnual.ventas.real} meta={data.planAnual.ventas.meta} formatear={formatCLPCompacto} />
              <PlanAnualGauge titulo="Litros" real={data.planAnual.litros.real} meta={data.planAnual.litros.meta} formatear={n => formatLitros(n)} />
              <PlanAnualGauge titulo="Nuevos clientes" real={data.planAnual.nuevosClientes.real} meta={data.planAnual.nuevosClientes.meta} formatear={formatNumero} />
            </div>
          </Card>

          <NotaPie>
            La meta de un responsable usa la suya propia si existe; si no, la suma de las metas de sus
            territorios. El plan anual solo suma los períodos ya transcurridos del año, para no comparar un
            acumulado parcial contra la meta de meses que todavía no empiezan.
          </NotaPie>
        </div>
      )}

      {modalAbierto && periodoId && (
        <ModalNuevaMeta
          periodoId={periodoId}
          territorios={data?.territorios ?? []}
          onClose={() => setModalAbierto(false)}
          onGuardado={() => { setModalAbierto(false); cargar() }}
        />
      )}
    </CCPage>
  )
}

function MetaColumna({ titulo, real, meta, formatMeta, pct }: {
  titulo: string; real: string; meta: number | null; formatMeta: (n: number) => string; pct: number | null
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 11.5, color: 'var(--cc-ink-3)', fontWeight: 700 }}>{titulo}</span>
      <span style={{ fontSize: 19, fontWeight: 900, color: 'var(--cc-ink)', letterSpacing: '-0.5px' }}>{real}</span>
      <span style={{ fontSize: 11, color: 'var(--cc-ink-3)' }}>
        {meta ? `de ${formatMeta(meta)}` : 'Sin meta'} {pct !== null && <span style={{ color: 'var(--cc-gold-deep)', fontWeight: 700 }}>· {formatPctPlano(pct)}</span>}
      </span>
    </div>
  )
}

function PlanAnualGauge({ titulo, real, meta, formatear }: { titulo: string; real: number; meta: number | null; formatear: (n: number) => string }) {
  const pct = meta ? (real / meta) * 100 : null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, minWidth: 0 }}>
      <Gauge pct={pct} size={78} grosor={8}>
        <span style={{ fontSize: 15, fontWeight: 900, color: 'var(--cc-ink)' }}>{pct !== null ? formatPctPlano(pct) : '—'}</span>
      </Gauge>
      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--cc-ink-2)', textAlign: 'center' }}>{titulo}</span>
      <span style={{ fontSize: 10, color: 'var(--cc-ink-3)', textAlign: 'center', overflowWrap: 'anywhere' }}>{formatear(real)}</span>
    </div>
  )
}

function ModalNuevaMeta({ periodoId, territorios, onClose, onGuardado }: {
  periodoId: number; territorios: Territorio[]; onClose: () => void; onGuardado: () => void
}) {
  const [scopeType, setScopeType] = useState<ScopeMeta>('compania')
  const [scopeValue, setScopeValue] = useState('')
  const [kpiType, setKpiType] = useState<KpiMeta>('ventas_clp')
  const [valor, setValor] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const opciones = scopeType === 'territorio'
    ? territorios.map(t => t.territorio)
    : scopeType === 'vendedor'
      ? [...new Set(territorios.map(t => t.responsable))]
      : []

  async function guardar() {
    if (!valor || (scopeType !== 'compania' && !scopeValue)) return
    setGuardando(true)
    setError(null)
    try {
      const res = await fetch('/api/control-comercial/metas', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ periodo_id: periodoId, scope_type: scopeType, scope_value: scopeType === 'compania' ? null : scopeValue, kpi_type: kpiType, valor_meta: Number(valor) }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? 'No se pudo guardar')
      onGuardado()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 70, background: 'rgba(20,16,12,0.45)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 480, background: 'var(--cc-page)', borderRadius: '22px 22px 0 0',
          padding: '18px 18px calc(18px + env(safe-area-inset-bottom, 0px))', boxShadow: '0 -12px 40px rgba(0,0,0,0.25)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--cc-ink)' }}>Nueva meta</h3>
          <button onClick={onClose} style={{ background: 'var(--cc-card-2)', border: 'none', borderRadius: '50%', width: 32, height: 32, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={16} color="var(--cc-ink-2)" />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <CampoSelect label="Alcance" value={scopeType} onChange={v => { setScopeType(v as ScopeMeta); setScopeValue('') }} opciones={Object.entries(SCOPE_LABELS)} />
          {scopeType !== 'compania' && (
            <CampoSelect label={scopeType === 'territorio' ? 'Territorio/Canal' : 'Vendedor'} value={scopeValue} onChange={setScopeValue} opciones={opciones.map(v => [v, v] as [string, string])} placeholder="Elegir…" />
          )}
          <CampoSelect label="KPI" value={kpiType} onChange={v => setKpiType(v as KpiMeta)} opciones={Object.entries(KPI_LABELS)} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11.5, color: 'var(--cc-ink-3)', fontWeight: 700 }}>Valor meta</label>
            <input
              type="number" inputMode="numeric" value={valor} onChange={e => setValor(e.target.value)} placeholder="0"
              style={{ minHeight: 46, background: 'var(--cc-card)', border: '1px solid var(--cc-line)', borderRadius: 12, padding: '0 12px', color: 'var(--cc-ink)', fontSize: 15, fontWeight: 700 }}
            />
          </div>
        </div>

        {error && <p style={{ color: 'var(--cc-red)', fontSize: 12, marginTop: 10 }}>{error}</p>}

        <button
          onClick={guardar}
          disabled={guardando || !valor || (scopeType !== 'compania' && !scopeValue)}
          style={{ ...botonPrimario({ width: '100%', marginTop: 16, opacity: guardando ? 0.6 : 1 }) }}
        >
          <Save size={15} /> {guardando ? 'Guardando…' : 'Guardar meta'}
        </button>
      </div>
    </div>
  )
}

function CampoSelect({ label, value, onChange, opciones, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; opciones: [string, string][]; placeholder?: string
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 11.5, color: 'var(--cc-ink-3)', fontWeight: 700 }}>{label}</label>
      <select
        value={value} onChange={e => onChange(e.target.value)}
        style={{ minHeight: 46, background: 'var(--cc-card)', border: '1px solid var(--cc-line)', borderRadius: 12, padding: '0 12px', color: 'var(--cc-ink)', fontSize: 14, fontWeight: 600 }}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {opciones.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  )
}
