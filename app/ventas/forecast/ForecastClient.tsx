'use client'

import { useMemo, useState } from 'react'
import {
  ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { Search, X, TrendingUp, TrendingDown, Users, MapPin, ArrowUpRight, ArrowDownRight } from 'lucide-react'
import { useIsDesktop } from '@/lib/useIsDesktop'
import AppHeader from '@/components/ui/AppHeader'
import type { FilaVentaMensual } from './page'

interface Props {
  filas: FilaVentaMensual[]
  clientesDisponibles: string[]
  regionesDisponibles: string[]
  isAdmin: boolean
  miRegion: string | null
}

type Modo = 'cliente' | 'region'
type Metrica = 'litros' | 'monto'

const fL = (n: number) => Math.round(n).toLocaleString('es-CL') + ' L'
const fM = (n: number) => '$' + Math.round(n).toLocaleString('es-CL')
const MESES_ES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

function fMes(iso: string): string {
  const [y, m] = iso.split('-')
  return `${MESES_ES[Number(m) - 1]} ${y.slice(2)}`
}

function sumarMeses(iso: string, delta: number): string {
  const [y, m] = iso.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + delta, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`
}

interface PuntoSerie { mes: string; valor: number; tipo: 'historico' | 'proyeccion' }

/**
 * Regresión lineal simple (OLS) sobre hasta los últimos 12 meses de la
 * serie, para proyectar 3 meses hacia adelante. No es Prophet — no captura
 * estacionalidad — pero corre instantáneo para cualquier combinación
 * arbitraria del multi-select, que es lo que este filtro necesita (ver nota
 * en page.tsx sobre por qué no se usa Prophet acá).
 */
function calcularTendencia(serieMensual: { mes: string; valor: number }[]) {
  const ordenada = [...serieMensual].sort((a, b) => a.mes.localeCompare(b.mes))
  const ventanaRegresion = ordenada.slice(-12)
  const n = ventanaRegresion.length

  let pendiente = 0, intercepto = 0
  if (n >= 2) {
    const xs = ventanaRegresion.map((_, i) => i)
    const ys = ventanaRegresion.map(p => p.valor)
    const mediaX = xs.reduce((a, b) => a + b, 0) / n
    const mediaY = ys.reduce((a, b) => a + b, 0) / n
    let num = 0, den = 0
    for (let i = 0; i < n; i++) {
      num += (xs[i] - mediaX) * (ys[i] - mediaY)
      den += (xs[i] - mediaX) ** 2
    }
    pendiente = den !== 0 ? num / den : 0
    intercepto = mediaY - pendiente * mediaX
  }

  const proyeccion: PuntoSerie[] = []
  if (ordenada.length > 0) {
    const ultimoMes = ordenada[ordenada.length - 1].mes
    for (let i = 1; i <= 3; i++) {
      const x = n - 1 + i
      const valor = Math.max(intercepto + pendiente * x, 0)
      proyeccion.push({ mes: sumarMeses(ultimoMes, i), valor, tipo: 'proyeccion' })
    }
  }

  // Crecimiento: ventana reciente vs. la anterior del mismo largo (hasta 6
  // meses; menos si no hay historial suficiente).
  const ventanaCorta = Math.min(6, Math.floor(ordenada.length / 2))
  let crecimientoPct: number | null = null
  let sumaReciente = 0, sumaAnterior = 0
  if (ventanaCorta >= 1) {
    const recientes = ordenada.slice(-ventanaCorta)
    const anteriores = ordenada.slice(-2 * ventanaCorta, -ventanaCorta)
    sumaReciente = recientes.reduce((s, p) => s + p.valor, 0)
    sumaAnterior = anteriores.reduce((s, p) => s + p.valor, 0)
    crecimientoPct = sumaAnterior > 0 ? ((sumaReciente - sumaAnterior) / sumaAnterior) * 100 : null
  }

  return { proyeccion, pendiente, crecimientoPct, ventanaCorta, sumaReciente, sumaAnterior, mesesHistorial: ordenada.length }
}

function MultiSelect({ label, opciones, seleccionados, onChange, icon: Icon }: {
  label: string; opciones: string[]; seleccionados: string[]; onChange: (v: string[]) => void
  icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>
}) {
  const [abierto, setAbierto] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const filtradas = opciones.filter(o => o.toLowerCase().includes(busqueda.toLowerCase()))

  function toggle(o: string) {
    onChange(seleccionados.includes(o) ? seleccionados.filter(s => s !== o) : [...seleccionados, o])
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setAbierto(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 12,
          border: `1px solid ${seleccionados.length ? 'var(--gold)' : 'var(--border)'}`,
          background: 'var(--surface)', color: 'var(--cream)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
          minWidth: 220, justifyContent: 'space-between',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon size={14} style={{ color: 'var(--muted)' }} />
          {seleccionados.length === 0 ? label : `${label} (${seleccionados.length})`}
        </span>
      </button>

      {abierto && (
        <>
          <div onClick={() => setAbierto(false)} style={{ position: 'fixed', inset: 0, zIndex: 30 }} />
          <div style={{
            position: 'absolute', top: '110%', left: 0, zIndex: 31, width: 300, maxHeight: 360,
            background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 14,
            boxShadow: '0 12px 32px rgba(0,0,0,0.4)', display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}>
            <div style={{ padding: 10, borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'center' }}>
              <Search size={14} style={{ color: 'var(--muted)', flexShrink: 0 }} />
              <input
                autoFocus
                value={busqueda}
                onChange={e => setBusqueda(e.target.value)}
                placeholder={`Buscar ${label.toLowerCase()}...`}
                style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--cream)', fontSize: 13 }}
              />
              {seleccionados.length > 0 && (
                <button onClick={() => onChange([])} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', display: 'flex' }}>
                  <X size={14} />
                </button>
              )}
            </div>
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {filtradas.length === 0 && (
                <p style={{ padding: 14, fontSize: 12, color: 'var(--muted)' }}>Sin resultados</p>
              )}
              {filtradas.map(o => {
                const activo = seleccionados.includes(o)
                return (
                  <div
                    key={o}
                    onClick={() => toggle(o)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', cursor: 'pointer',
                      background: activo ? 'rgba(212,175,55,0.08)' : 'transparent',
                    }}
                  >
                    <div style={{
                      width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                      border: `1.5px solid ${activo ? 'var(--gold)' : 'var(--border)'}`,
                      background: activo ? 'var(--gold)' : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {activo && <span style={{ fontSize: 10, color: '#080808', fontWeight: 900 }}>✓</span>}
                    </div>
                    <span style={{ fontSize: 13, color: 'var(--cream)' }}>{o}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default function ForecastClient({ filas, clientesDisponibles, regionesDisponibles, isAdmin, miRegion }: Props) {
  const isDesktop = useIsDesktop()
  const [modo, setModo] = useState<Modo>('cliente')
  const [metrica, setMetrica] = useState<Metrica>('litros')
  const [clientesSel, setClientesSel] = useState<string[]>([])
  const [regionesSel, setRegionesSel] = useState<string[]>(isAdmin ? [] : (miRegion ? [miRegion] : []))

  const fFmt = metrica === 'litros' ? fL : fM

  const filasFiltradas = useMemo(() => {
    if (modo === 'cliente') {
      if (clientesSel.length === 0) return filas
      return filas.filter(f => clientesSel.includes(f.cliente))
    }
    if (regionesSel.length === 0) return filas
    return filas.filter(f => regionesSel.includes(f.region))
  }, [filas, modo, clientesSel, regionesSel])

  const serieMensual = useMemo(() => {
    const porMes = new Map<string, number>()
    for (const f of filasFiltradas) {
      porMes.set(f.mes, (porMes.get(f.mes) ?? 0) + (metrica === 'litros' ? f.litros : f.monto))
    }
    return [...porMes.entries()].map(([mes, valor]) => ({ mes, valor })).sort((a, b) => a.mes.localeCompare(b.mes))
  }, [filasFiltradas, metrica])

  const { proyeccion, pendiente, crecimientoPct, ventanaCorta, sumaReciente, sumaAnterior, mesesHistorial } = useMemo(
    () => calcularTendencia(serieMensual),
    [serieMensual]
  )

  const datosGrafico = useMemo(() => {
    const historico = serieMensual.map(p => ({ mes: p.mes, historico: p.valor, proyectado: null as number | null }))
    if (historico.length > 0 && proyeccion.length > 0) {
      // Empalma el último punto histórico con el primero proyectado para que
      // la línea de proyección salga continua desde ahí, no despegada.
      historico[historico.length - 1].proyectado = historico[historico.length - 1].historico
    }
    const futuro = proyeccion.map(p => ({ mes: p.mes, historico: null as number | null, proyectado: p.valor }))
    return [...historico, ...futuro]
  }, [serieMensual, proyeccion])

  // Ranking individual dentro de la selección — para ver QUÉ cliente/región
  // está tirando el crecimiento hacia arriba o abajo, no sólo el agregado.
  const desglose = useMemo(() => {
    const claves = modo === 'cliente'
      ? (clientesSel.length ? clientesSel : clientesDisponibles)
      : (regionesSel.length ? regionesSel : regionesDisponibles)
    const campo = modo === 'cliente' ? 'cliente' : 'region'

    return claves.map(clave => {
      const propias = filas.filter(f => f[campo] === clave)
      const porMes = new Map<string, number>()
      for (const f of propias) porMes.set(f.mes, (porMes.get(f.mes) ?? 0) + (metrica === 'litros' ? f.litros : f.monto))
      const serie = [...porMes.entries()].map(([mes, valor]) => ({ mes, valor })).sort((a, b) => a.mes.localeCompare(b.mes))
      const stats = calcularTendencia(serie)
      return { clave, ...stats }
    })
    .filter(d => d.mesesHistorial > 0)
    .sort((a, b) => (b.crecimientoPct ?? -999) - (a.crecimientoPct ?? -999))
  }, [modo, clientesSel, regionesSel, clientesDisponibles, regionesDisponibles, filas, metrica])

  const proyeccionTotal3m = proyeccion.reduce((s, p) => s + p.valor, 0)

  return (
    <div style={{ padding: isDesktop ? '32px 40px 60px' : '16px 14px 80px' }}>
      <AppHeader eyebrow="Ventas" title="Forecast de Crecimiento" backHref="/ventas" />

      <p style={{ fontSize: 13, color: 'var(--muted)', margin: '10px 0 24px', maxWidth: 640 }}>
        Tendencia y proyección a 3 meses por cliente o por región/vendedor — marcá uno o varios para ver cuánto
        va a crecer esa selección. Se calcula al vuelo sobre el historial real, no es el mismo forecast (Prophet)
        de Producción.
      </p>

      {/* Controles */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 24, alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 2, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 4 }}>
          {(['cliente', 'region'] as Modo[]).map(m => (
            <button
              key={m}
              onClick={() => setModo(m)}
              style={{
                padding: '8px 16px', borderRadius: 9, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13,
                background: modo === m ? 'var(--gold)' : 'transparent', color: modo === m ? '#1a1200' : 'var(--muted)',
              }}
            >
              {m === 'cliente' ? 'Por Cliente' : 'Por Región / Vendedor'}
            </button>
          ))}
        </div>

        {modo === 'cliente' ? (
          <MultiSelect label="Clientes" opciones={clientesDisponibles} seleccionados={clientesSel} onChange={setClientesSel} icon={Users} />
        ) : (
          <MultiSelect label="Regiones" opciones={regionesDisponibles} seleccionados={regionesSel} onChange={setRegionesSel} icon={MapPin} />
        )}

        <div style={{ display: 'flex', gap: 2, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 4, marginLeft: 'auto' }}>
          {(['litros', 'monto'] as Metrica[]).map(m => (
            <button
              key={m}
              onClick={() => setMetrica(m)}
              style={{
                padding: '8px 16px', borderRadius: 9, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13,
                background: metrica === m ? 'var(--gold)' : 'transparent', color: metrica === m ? '#1a1200' : 'var(--muted)',
              }}
            >
              {m === 'litros' ? 'Litros' : 'Venta ($)'}
            </button>
          ))}
        </div>
      </div>

      {mesesHistorial === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 13, background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border)' }}>
          Sin ventas registradas para esta selección.
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: isDesktop ? 'repeat(3, 1fr)' : '1fr', gap: 12, marginBottom: 20 }}>
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 18 }}>
              <p style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>
                Crecimiento (últimos {ventanaCorta} m. vs. {ventanaCorta} anteriores)
              </p>
              {crecimientoPct === null ? (
                <p style={{ fontSize: 15, color: 'var(--muted)' }}>Sin base de comparación (historial corto)</p>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {crecimientoPct >= 0
                    ? <ArrowUpRight size={22} style={{ color: '#4ADE80' }} />
                    : <ArrowDownRight size={22} style={{ color: '#F87171' }} />}
                  <p style={{ fontSize: 26, fontWeight: 800, color: crecimientoPct >= 0 ? '#4ADE80' : '#F87171' }}>
                    {crecimientoPct >= 0 ? '+' : ''}{crecimientoPct.toFixed(1)}%
                  </p>
                </div>
              )}
              {ventanaCorta > 0 && (
                <p style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 4 }}>{fFmt(sumaReciente)} vs {fFmt(sumaAnterior)}</p>
              )}
            </div>

            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 18 }}>
              <p style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>
                Tendencia mensual (regresión, últimos {Math.min(mesesHistorial, 12)} m.)
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {pendiente >= 0
                  ? <TrendingUp size={22} style={{ color: '#4ADE80' }} />
                  : <TrendingDown size={22} style={{ color: '#F87171' }} />}
                <p style={{ fontSize: 26, fontWeight: 800, color: 'var(--cream)' }}>
                  {pendiente >= 0 ? '+' : ''}{fFmt(pendiente)}<span style={{ fontSize: 13, color: 'var(--muted)' }}>/mes</span>
                </p>
              </div>
              <p style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 4 }}>pendiente de la línea de tendencia</p>
            </div>

            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 18 }}>
              <p style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>
                Proyección próximos 3 meses
              </p>
              <p style={{ fontSize: 26, fontWeight: 800, color: 'var(--gold)' }}>{fFmt(proyeccionTotal3m)}</p>
              <p style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 4 }}>
                {proyeccion.map(p => `${fMes(p.mes)}: ${fFmt(p.valor)}`).join(' · ')}
              </p>
            </div>
          </div>

          {/* Gráfico */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: isDesktop ? 24 : 14, marginBottom: 24 }}>
            <ResponsiveContainer width="100%" height={320}>
              <ComposedChart data={datosGrafico}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="mes" tickFormatter={fMes} tick={{ fontSize: 11, fill: 'var(--muted)' }} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--muted)' }} tickFormatter={(v) => metrica === 'litros' ? `${Math.round(v / 1000)}k` : `$${Math.round(v / 1000)}k`} />
                <Tooltip
                  formatter={(v) => fFmt(Number(v))}
                  labelFormatter={(l) => fMes(String(l))}
                  contentStyle={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 12 }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} formatter={v => v === 'historico' ? 'Histórico' : 'Proyección'} />
                <Bar dataKey="historico" fill="#D4AF37" radius={[4, 4, 0, 0]} />
                <Line dataKey="proyectado" stroke="#60A5FA" strokeWidth={2.5} strokeDasharray="6 4" dot={{ r: 3 }} connectNulls />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* Desglose individual */}
          {desglose.length > 1 && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--cream)', padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
                Desglose {modo === 'cliente' ? 'por cliente' : 'por región'} — ordenado por crecimiento
              </p>
              <div style={{ maxHeight: 420, overflowY: 'auto' }}>
                {desglose.map((d, i) => (
                  <div key={d.clave} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10,
                    padding: '11px 18px', borderTop: i === 0 ? 'none' : '1px solid var(--border)',
                  }}>
                    <p style={{ fontSize: 13, color: 'var(--cream)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>
                      {d.clave}
                    </p>
                    <p style={{ fontSize: 12, color: 'var(--muted)', flexShrink: 0 }}>{d.mesesHistorial} m. hist.</p>
                    <p style={{
                      fontSize: 13, fontWeight: 700, flexShrink: 0, minWidth: 70, textAlign: 'right',
                      color: d.crecimientoPct === null ? 'var(--muted)' : d.crecimientoPct >= 0 ? '#4ADE80' : '#F87171',
                    }}>
                      {d.crecimientoPct === null ? '—' : `${d.crecimientoPct >= 0 ? '+' : ''}${d.crecimientoPct.toFixed(1)}%`}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
