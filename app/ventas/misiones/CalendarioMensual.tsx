'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, Loader2, MessageCircle, Phone, Droplets, CalendarDays } from 'lucide-react'
import { SEG_COLOR } from '@/lib/theme'

interface PedidoEsperado {
  nombre_fantasia: string
  vendedor_actual: string
  segmento: string
  tipo_cliente: string
  ciclo_promedio_dias: number
  litros_por_pedido: number | null
  fecha_esperada: string
  es_primera: boolean
  cliente_id: number | null
}

interface Props {
  isAdmin: boolean
  vendedorActual: string | null
  isDesktop: boolean
}

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const DIAS_SEM = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

const VENDEDORES = [
  { value: 'all',        label: 'Todos'      },
  { value: 'Vendedor 1', label: 'Vendedor 1' },
]

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function CalendarioMensual({ isAdmin, vendedorActual, isDesktop }: Props) {
  const router = useRouter()
  const hoy = new Date()
  const [year, setYear] = useState(hoy.getFullYear())
  const [month, setMonth] = useState(hoy.getMonth()) // 0-11
  const [vendedor, setVendedor] = useState('all')
  const [pedidos, setPedidos] = useState<PedidoEsperado[]>([])
  const [loading, setLoading] = useState(true)
  const [diaSel, setDiaSel] = useState<string | null>(null)

  const primerDia = useMemo(() => new Date(year, month, 1), [year, month])
  const ultimoDia = useMemo(() => new Date(year, month + 1, 0), [year, month])
  const numDias = ultimoDia.getDate()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ desde: ymd(primerDia), hasta: ymd(ultimoDia) })
      if (isAdmin && vendedor !== 'all') params.set('vendedor', vendedor)
      const res = await fetch(`/api/misiones/calendario?${params}`)
      const data = await res.json()
      setPedidos(Array.isArray(data?.pedidos) ? data.pedidos : [])
    } catch { setPedidos([]) }
    finally { setLoading(false) }
  }, [primerDia, ultimoDia, vendedor, isAdmin])

  useEffect(() => { load() }, [load])

  // Agrupar pedidos por día (YYYY-MM-DD → lista)
  const porDia = useMemo(() => {
    const m = new Map<string, PedidoEsperado[]>()
    for (const p of pedidos) {
      if (!m.has(p.fecha_esperada)) m.set(p.fecha_esperada, [])
      m.get(p.fecha_esperada)!.push(p)
    }
    return m
  }, [pedidos])

  const maxPorDia = useMemo(() => Math.max(1, ...[...porDia.values()].map(a => a.length)), [porDia])
  const totalMes = pedidos.length
  const litrosMes = pedidos.reduce((s, p) => s + (p.litros_por_pedido ?? 0), 0)

  function cambiarMes(delta: number) {
    setDiaSel(null)
    const d = new Date(year, month + delta, 1)
    setYear(d.getFullYear()); setMonth(d.getMonth())
  }

  const hoyStr = ymd(hoy)
  const seleccionados = diaSel ? (porDia.get(diaSel) ?? []) : []

  return (
    <div style={{ padding: isDesktop ? '4px 0' : '0' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <CalendarDays size={20} style={{ color: '#D4AF37' }} />
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 900, color: 'var(--cream)' }}>{MESES[month]} {year}</h2>
            <p style={{ fontSize: 12, color: 'var(--muted)' }}>
              {totalMes} pedidos esperados · {litrosMes.toLocaleString('es-CL', { maximumFractionDigits: 0 })} L proyectados
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {isAdmin && (
            <div style={{ display: 'flex', gap: 3 }}>
              {VENDEDORES.map(v => (
                <button key={v.value} onClick={() => setVendedor(v.value)} style={{
                  padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 700, border: 'none', cursor: 'pointer',
                  background: vendedor === v.value ? (SEG_COLOR[v.value] ?? '#D4AF37') : 'var(--surface2)',
                  color: vendedor === v.value ? '#1a1200' : 'var(--muted)',
                }}>{v.label}</button>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 3 }}>
            <button onClick={() => cambiarMes(-1)} style={navBtn}><ChevronLeft size={16} /></button>
            <button onClick={() => { setDiaSel(null); setYear(hoy.getFullYear()); setMonth(hoy.getMonth()) }}
              style={{ background: 'none', border: 'none', color: '#D4AF37', fontSize: 11, fontWeight: 700, cursor: 'pointer', padding: '0 8px' }}>Hoy</button>
            <button onClick={() => cambiarMes(1)} style={navBtn}><ChevronRight size={16} /></button>
          </div>
        </div>
      </div>

      {/* Leyenda tipos */}
      <div style={{ display: 'flex', gap: 14, marginBottom: 14, flexWrap: 'wrap' }}>
        {[
          { c: '#5A8A4A', l: 'Activo' }, { c: '#D4AF37', l: 'Nuevo' },
          { c: '#D4AF37', l: 'Temporal' },
        ].map(x => (
          <div key={x.l} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: x.c }} />
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>{x.l}</span>
          </div>
        ))}
        <span style={{ fontSize: 11, color: '#555', marginLeft: 'auto' }}>Altura = nº de clientes que pedirían ese día</span>
      </div>

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: 'var(--muted)' }}>
          <Loader2 size={22} style={{ animation: 'spin 1s linear infinite' }} />
        </div>
      ) : (
        <>
          {/* ── Barra del mes: timeline de días ── */}
          <div style={{
            display: 'flex', gap: isDesktop ? 3 : 2, alignItems: 'flex-end',
            background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14,
            padding: isDesktop ? '16px 14px 10px' : '12px 8px 8px', overflowX: 'auto', minHeight: 130,
          }}>
            {Array.from({ length: numDias }).map((_, i) => {
              const dia = i + 1
              const fecha = ymd(new Date(year, month, dia))
              const lista = porDia.get(fecha) ?? []
              const count = lista.length
              const fechaObj = new Date(year, month, dia)
              const dow = (fechaObj.getDay() + 6) % 7 // 0=Lunes
              const esFinde = dow >= 5
              const esHoy = fecha === hoyStr
              const sel = diaSel === fecha
              const barH = count > 0 ? Math.max(14, (count / maxPorDia) * 80) : 0

              // Color dominante del día (tipo más frecuente)
              const tipoColor = (() => {
                if (!count) return '#333'
                const counts: Record<string, number> = {}
                for (const p of lista) counts[p.tipo_cliente] = (counts[p.tipo_cliente] ?? 0) + 1
                const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0]
                return top === 'nuevo' ? '#D4AF37' : top === 'temporal' ? '#D4AF37' : '#5A8A4A'
              })()

              return (
                <div key={dia}
                  onClick={() => count > 0 && setDiaSel(sel ? null : fecha)}
                  style={{
                    flex: isDesktop ? '1 0 auto' : '0 0 auto',
                    minWidth: isDesktop ? 0 : 22,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                    cursor: count > 0 ? 'pointer' : 'default',
                  }}>
                  {/* Barra */}
                  <div style={{ height: 84, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', width: '100%', alignItems: 'center' }}>
                    {count > 0 && (
                      <div style={{
                        width: isDesktop ? '70%' : 14, minWidth: 8, height: barH,
                        background: tipoColor, borderRadius: 4,
                        opacity: sel ? 1 : 0.85,
                        outline: sel ? `2px solid ${tipoColor}` : 'none',
                        outlineOffset: 2,
                        display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 2,
                        transition: 'all 0.15s',
                      }}>
                        <span style={{ fontSize: 9, fontWeight: 900, color: '#0a0a0a' }}>{count}</span>
                      </div>
                    )}
                  </div>
                  {/* Día */}
                  <div style={{
                    width: isDesktop ? 24 : 20, height: isDesktop ? 24 : 20, borderRadius: 6,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: esHoy ? '#D4AF37' : sel ? 'rgba(212,175,55,0.15)' : 'transparent',
                    color: esHoy ? '#1a1200' : esFinde ? '#555' : 'var(--muted)',
                    fontSize: 10, fontWeight: esHoy ? 900 : 600,
                  }}>{dia}</div>
                </div>
              )
            })}
          </div>

          {/* ── Detalle del día seleccionado ── */}
          {diaSel && seleccionados.length > 0 && (
            <div style={{ marginTop: 14, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '16px 18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <p style={{ fontSize: 14, fontWeight: 800, color: 'var(--cream)' }}>
                  📅 {new Date(diaSel + 'T12:00:00').getDate()} de {MESES[month]} — {seleccionados.length} cliente{seleccionados.length > 1 ? 's' : ''}
                </p>
                <span style={{ fontSize: 12, color: '#D4AF37', fontWeight: 700 }}>
                  {seleccionados.reduce((s, p) => s + (p.litros_por_pedido ?? 0), 0).toLocaleString('es-CL', { maximumFractionDigits: 0 })} L est.
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {seleccionados.map((p, i) => {
                  const segColor = SEG_COLOR[p.segmento] ?? '#6B7280'
                  const tColor = p.tipo_cliente === 'nuevo' ? '#D4AF37' : p.tipo_cliente === 'temporal' ? '#D4AF37' : '#5A8A4A'
                  const clickable = p.cliente_id != null
                  return (
                    <div key={`${p.nombre_fantasia}-${i}`}
                      onClick={clickable ? () => router.push(`/ventas/clientes/${p.cliente_id}`) : undefined}
                      role={clickable ? 'button' : undefined}
                      title={clickable ? 'Ver perfil del cliente' : undefined}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 10, background: 'var(--surface2)', cursor: clickable ? 'pointer' : 'default', transition: 'background 0.15s' }}
                      onMouseEnter={clickable ? e => { e.currentTarget.style.background = 'rgba(212,175,55,0.10)' } : undefined}
                      onMouseLeave={clickable ? e => { e.currentTarget.style.background = 'var(--surface2)' } : undefined}>
                      <div style={{ width: 26, height: 26, borderRadius: '50%', background: `${segColor}20`, border: `1.5px solid ${segColor}50`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: segColor, flexShrink: 0 }}>
                        {p.segmento}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--cream)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nombre_fantasia}</p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: tColor }}>● cada {p.ciclo_promedio_dias}d</span>
                          {isAdmin && <span style={{ fontSize: 10, color: '#555' }}>{p.vendedor_actual?.split(' ')[0]}</span>}
                        </div>
                      </div>
                      {p.litros_por_pedido != null && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 12, fontWeight: 700, color: '#D4AF37' }}>
                          <Droplets size={12} /> {Math.round(p.litros_por_pedido)}L
                        </span>
                      )}
                      {clickable && <ChevronRight size={15} style={{ color: 'var(--muted)', flexShrink: 0 }} />}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {totalMes === 0 && (
            <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--muted)' }}>
              <CalendarDays size={28} style={{ opacity: 0.3, marginBottom: 8 }} />
              <p style={{ fontSize: 13 }}>No hay pedidos esperados este mes.</p>
            </div>
          )}
        </>
      )}

      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}

const navBtn: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--muted)', display: 'flex',
}
