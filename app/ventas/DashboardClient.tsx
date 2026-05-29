'use client'

import { useState, useRef, useEffect } from 'react'
import { ChevronDown, ChevronUp, Users, Calendar, X, MapPin, Target } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useIsDesktop } from '@/lib/useIsDesktop'
import { Periodo } from '@/lib/types'
import type { EvolutionDay, ProductRank, ProductBuyer } from './page'

interface ProductoDetalle {
  producto: string
  envase: string | null
  litros: number
}

interface ClienteDetalle {
  nombre: string
  productos: ProductoDetalle[]
}

interface VendedorResumen {
  vendedor: string
  litrosHoy: number
  ventaHoy: number
  litrosPeriodo: number
  ventaPeriodo: number
  clientesHoy: ClienteDetalle[]
  clientesHoyCount: number
  clientesPeriodoCount: number
  latasCervezaHoy: number
  latasKombuchaHoy: number
  litrosCerveza: number
  litrosKombucha: number
  dropSize: number
  metaLitros: number
}

interface RiesgoCliente {
  nombre_fantasia: string
  vendedor_actual: string
  dias_sin_compra: number
  ciclo_promedio_dias: number
  alert_level: string
}

interface PlanCliente extends RiesgoCliente {
  score: number
  segmento: string
  siguiente_compra_estimada: string | null
}

interface MisionResumen {
  vendedor: string
  alert_level: string
  estado: string
  score: number
  segmento: string
  nombre_fantasia: string
  dias_sin_compra: number
}

interface Props {
  resumen: VendedorResumen[]
  fechaHoy: string
  fechasDisponibles: string[]
  periodo: Periodo | null
  evolution: EvolutionDay[]
  productRanking: ProductRank[]
  productDetail: Record<string, ProductBuyer[]>
  vendedoresScope: string[]
  riesgoClientes: PlanCliente[]
  planSemana: PlanCliente[]
  misionesResumen: MisionResumen[]
}

// ── Formatting helpers ──────────────────────────────────────────────────────
function fL(n: number) { return n.toFixed(1) + ' L' }
function fP(n: number) { return '$' + Math.round(n).toLocaleString('es-CL') }
function getInitials(name: string) { return name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase() }
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
function formatFecha(s: string) {
  const [y, m, d] = s.split('-')
  return `${parseInt(d)} ${MESES[parseInt(m) - 1]} ${y}`
}

// ── DonutChart ───────────────────────────────────────────────────────────────
function DonutChart({ cerveza, kombucha, outros, size = 90 }: { cerveza: number; kombucha: number; outros: number; size?: number }) {
  const total = cerveza + kombucha + outros
  if (total === 0) return <div style={{ width: size, height: size, borderRadius: '50%', background: '#1C1C1C' }} />
  const pC = (cerveza / total) * 100
  const pK = (kombucha / total) * 100
  const bg = `conic-gradient(#D4AF37 0% ${pC}%, #60A5FA ${pC}% ${pC + pK}%, #A78BFA ${pC + pK}% 100%)`
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <div style={{ width: size, height: size, borderRadius: '50%', background: bg }} />
      <div style={{
        position: 'absolute', top: '22%', left: '22%', right: '22%', bottom: '22%',
        borderRadius: '50%', background: 'var(--surface)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column',
      }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--cream)' }}>{Math.round(pC)}%</span>
        <span style={{ fontSize: 8, color: 'var(--muted)' }}>Cerv</span>
      </div>
    </div>
  )
}

// ── DayDetailModal ───────────────────────────────────────────────────────────
function DayDetailModal({
  day,
  vendedores,
  colors,
  onClose,
}: {
  day: EvolutionDay
  vendedores: string[]
  colors: Record<string, string>
  onClose: () => void
}) {
  const fecha = day.fecha as string
  const total = vendedores.reduce((s, v) => s + (typeof day[v] === 'number' ? (day[v] as number) : 0), 0)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 20, width: '100%', maxWidth: 380, overflow: 'hidden',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          padding: '18px 20px 14px', borderBottom: '1px solid var(--border-subtle)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <p style={{ fontSize: 10, color: 'var(--gold)', fontWeight: 700, letterSpacing: '1px', marginBottom: 3 }}>
              EVOLUCIÓN DAILY SALES
            </p>
            <h3 style={{ fontSize: 18, fontWeight: 900, color: 'var(--cream)', letterSpacing: '-0.5px' }}>
              {formatFecha(fecha)}
            </h3>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        {/* Vendedor rows */}
        <div style={{ padding: '14px 20px' }}>
          {vendedores.map(v => {
            const litros = typeof day[v] === 'number' ? (day[v] as number) : 0
            const pct = total > 0 ? (litros / total) * 100 : 0
            const color = colors[v] ?? '#D4AF37'
            return (
              <div key={v} style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      width: 34, height: 34, borderRadius: '50%', background: color,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 12, fontWeight: 800, color: '#080808', flexShrink: 0,
                    }}>
                      {getInitials(v)}
                    </div>
                    <div>
                      <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--cream)' }}>{v.split(' ')[0]}</p>
                      <p style={{ fontSize: 10, color: 'var(--muted)' }}>Vendedor Canal</p>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontSize: 20, fontWeight: 900, color, letterSpacing: '-0.5px' }}>{litros.toFixed(1)}<span style={{ fontSize: 13, fontWeight: 600, marginLeft: 3 }}>L</span></p>
                    <p style={{ fontSize: 10, color: 'var(--muted)' }}>{pct.toFixed(0)}% del total</p>
                  </div>
                </div>
                {/* Barra */}
                <div style={{ height: 6, borderRadius: 100, background: 'var(--surface2)', overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', borderRadius: 100, background: color }} />
                </div>
              </div>
            )
          })}
        </div>

        {/* Total */}
        <div style={{
          margin: '0 20px 20px', padding: '12px 16px', borderRadius: 12,
          background: 'linear-gradient(135deg, #110D00, #1C1500)',
          border: '1px solid rgba(212,175,55,0.2)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'rgba(212,175,55,0.7)', letterSpacing: '0.8px' }}>TOTAL EQUIPO</span>
          <span style={{ fontSize: 22, fontWeight: 900, color: 'var(--gold)', letterSpacing: '-1px' }}>
            {total.toFixed(1)} <span style={{ fontSize: 14, fontWeight: 600 }}>L</span>
          </span>
        </div>
      </div>
    </div>
  )
}

// ── LineChart ────────────────────────────────────────────────────────────────
function LineChart({ data, vendedores, colors }: { data: EvolutionDay[]; vendedores: string[]; colors: Record<string, string> }) {
  const [selectedDay, setSelectedDay] = useState<EvolutionDay | null>(null)

  const W = 500
  const H = 130
  const padL = 40, padR = 16, padT = 10, padB = 28
  const chartW = W - padL - padR
  const chartH = H - padT - padB

  const pts = data.slice(-30)

  if (pts.length === 0) {
    return (
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" style={{ width: '100%' }}>
        <text x={W / 2} y={H / 2} textAnchor="middle" fill="#7A7268" fontSize={12}>Sin datos</text>
      </svg>
    )
  }

  let maxVal = 0
  for (const day of pts) {
    for (const v of vendedores) {
      const val = typeof day[v] === 'number' ? (day[v] as number) : 0
      if (val > maxVal) maxVal = val
    }
  }
  if (maxVal === 0) maxVal = 1

  function xPos(i: number) { return padL + (i / Math.max(pts.length - 1, 1)) * chartW }
  function yPos(val: number) { return padT + chartH - (val / maxVal) * chartH }

  const labelCount = Math.min(6, pts.length)
  const labelIndices: number[] = []
  if (pts.length === 1) {
    labelIndices.push(0)
  } else {
    for (let i = 0; i < labelCount; i++) {
      labelIndices.push(Math.round(i * (pts.length - 1) / (labelCount - 1)))
    }
  }

  const gridVals = [maxVal * 0.25, maxVal * 0.5, maxVal * 0.75]

  const selectedIdx = selectedDay ? pts.findIndex(p => p.fecha === selectedDay.fecha) : -1

  return (
    <>
      <p style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 8, marginTop: -4 }}>
        Toca un punto para ver el detalle del día
      </p>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ width: '100%', cursor: 'pointer' }}
        onClick={() => setSelectedDay(null)}
      >
        {/* Gridlines */}
        {gridVals.map((gv, gi) => (
          <g key={gi}>
            <line x1={padL} y1={yPos(gv)} x2={W - padR} y2={yPos(gv)} stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
            <text x={padL - 4} y={yPos(gv) + 4} textAnchor="end" fill="#7A7268" fontSize={9}>{Math.round(gv)}</text>
          </g>
        ))}

        {/* Selected day highlight bar */}
        {selectedIdx >= 0 && (
          <rect
            x={xPos(selectedIdx) - 12} y={padT}
            width={24} height={chartH}
            fill="rgba(212,175,55,0.08)" rx={4}
          />
        )}
        {selectedIdx >= 0 && (
          <line
            x1={xPos(selectedIdx)} y1={padT}
            x2={xPos(selectedIdx)} y2={padT + chartH}
            stroke="rgba(212,175,55,0.5)" strokeWidth={1.5} strokeDasharray="3,3"
          />
        )}

        {/* X axis labels */}
        {labelIndices.map(i => {
          const fecha = pts[i].fecha as string
          const [, m, d] = fecha.split('-')
          return (
            <text key={i} x={xPos(i)} y={H - 4} textAnchor="middle" fill={selectedIdx === i ? 'var(--gold)' : '#7A7268'} fontSize={9} fontWeight={selectedIdx === i ? 700 : 400}>
              {parseInt(d)}/{parseInt(m)}
            </text>
          )
        })}

        {/* Lines per vendedor */}
        {vendedores.map(v => {
          const color = colors[v] ?? '#D4AF37'
          const points = pts.map((day, i) => {
            const val = typeof day[v] === 'number' ? (day[v] as number) : 0
            return `${xPos(i)},${yPos(val)}`
          }).join(' ')
          return (
            <polyline key={v} points={points} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          )
        })}

        {/* Invisible wide click strips per day (easy to tap) */}
        {pts.map((day, i) => {
          const x0 = i === 0 ? padL : (xPos(i) + xPos(i - 1)) / 2
          const x1 = i === pts.length - 1 ? W - padR : (xPos(i) + xPos(i + 1)) / 2
          return (
            <rect
              key={`strip-${i}`}
              x={x0} y={padT} width={x1 - x0} height={chartH}
              fill="transparent"
              style={{ cursor: 'pointer' }}
              onClick={e => { e.stopPropagation(); setSelectedDay(day) }}
            />
          )
        })}

        {/* Visible dots */}
        {vendedores.map(v => {
          const color = colors[v] ?? '#D4AF37'
          return pts.map((day, i) => {
            const val = typeof day[v] === 'number' ? (day[v] as number) : 0
            const isSelected = selectedIdx === i
            return (
              <circle
                key={`${v}-${i}`}
                cx={xPos(i)} cy={yPos(val)}
                r={isSelected ? 6 : 3}
                fill={color}
                stroke={isSelected ? 'rgba(212,175,55,0.6)' : 'none'}
                strokeWidth={isSelected ? 3 : 0}
                style={{ cursor: 'pointer', transition: 'r 0.1s' }}
                onClick={e => { e.stopPropagation(); setSelectedDay(day) }}
              />
            )
          })
        })}
      </svg>

      {/* Day detail modal */}
      {selectedDay && (
        <DayDetailModal
          day={selectedDay}
          vendedores={vendedores}
          colors={colors}
          onClose={() => setSelectedDay(null)}
        />
      )}
    </>
  )
}

// ── MetaBar ──────────────────────────────────────────────────────────────────
function MetaBar({ vendedor, actual, meta }: { vendedor: string; actual: number; meta: number }) {
  const pct = meta > 0 ? Math.min((actual / meta) * 100, 100) : 0
  const color = vendedor.toLowerCase().includes('javier') ? '#D4AF37' : '#60A5FA'
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <div style={{
          width: 36, height: 36, borderRadius: '50%',
          background: color, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 12, fontWeight: 800, color: '#080808', flexShrink: 0,
        }}>
          {getInitials(vendedor)}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--cream)' }}>{vendedor.split(' ')[0]}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color }}>
              {pct.toFixed(0)}%
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>{fL(actual)} / {fL(meta)}</span>
            <span style={{ fontSize: 10, color: 'var(--muted)' }}>META: {fL(meta)}</span>
          </div>
          <div style={{ height: 8, borderRadius: 100, background: 'var(--surface2)', overflow: 'hidden' }}>
            <div style={{
              height: '100%', width: `${pct}%`, borderRadius: 100,
              background: color, transition: 'width 0.5s ease',
            }} />
          </div>
        </div>
      </div>
    </div>
  )
}

// ── DateSelector ────────────────────────────────────────────────────────────
function DateSelector({ fechaActual, fechasDisponibles }: { fechaActual: string; fechasDisponibles: string[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Cerrar al hacer clic afuera
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function selectFecha(fecha: string) {
    setOpen(false)
    router.replace(`/ventas?fecha=${fecha}`)
  }

  const esHoy = fechaActual === fechasDisponibles[0]

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 14px', borderRadius: 10,
          background: 'rgba(212,175,55,0.12)', border: '1px solid rgba(212,175,55,0.3)',
          color: 'var(--gold)', cursor: 'pointer', fontSize: 13, fontWeight: 700,
        }}
      >
        <Calendar size={14} />
        {esHoy ? 'Hoy' : formatFecha(fechaActual)}
        <ChevronDown size={13} style={{ transition: 'transform 0.15s', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }} />
      </button>

      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setOpen(false)} />
          <div style={{
            position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 100,
            background: '#1A1500', border: '1px solid rgba(212,175,55,0.25)',
            borderRadius: 12, minWidth: 180, maxHeight: 320, overflowY: 'auto',
            boxShadow: '0 12px 40px rgba(0,0,0,0.7)',
          }}>
            <p style={{ fontSize: 10, color: 'var(--muted)', padding: '10px 14px 6px', fontWeight: 700, letterSpacing: '1px' }}>
              SELECCIONAR FECHA
            </p>
            {fechasDisponibles.map((f, i) => (
              <button
                key={f}
                onClick={() => selectFecha(f)}
                style={{
                  width: '100%', textAlign: 'left', padding: '9px 14px',
                  background: f === fechaActual ? 'rgba(212,175,55,0.12)' : 'none',
                  border: 'none', cursor: 'pointer', fontSize: 13,
                  color: f === fechaActual ? 'var(--gold)' : 'var(--cream)',
                  fontWeight: f === fechaActual ? 700 : 400,
                  borderBottom: '1px solid rgba(255,255,255,0.04)',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(212,175,55,0.07)')}
                onMouseLeave={e => (e.currentTarget.style.background = f === fechaActual ? 'rgba(212,175,55,0.12)' : 'none')}
              >
                <span>{i === 0 ? 'Hoy — ' : ''}{formatFecha(f)}</span>
                {f === fechaActual && <span style={{ fontSize: 9, color: 'var(--gold)' }}>●</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ── ProductDetailModal ────────────────────────────────────────────────────────
function ProductDetailModal({
  producto,
  buyers,
  fechaHoy,
  onClose,
}: {
  producto: string
  buyers: ProductBuyer[]
  fechaHoy: string
  onClose: () => void
}) {
  const totalLitros = buyers.reduce((s, b) => s + b.litros, 0)

  // Cerrar con Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '20px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 20, width: '100%', maxWidth: 480, maxHeight: '80vh',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          padding: '18px 20px 14px',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex', alignItems: 'flex-start', gap: 12,
        }}>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 10, color: 'var(--gold)', fontWeight: 700, letterSpacing: '1px', marginBottom: 4 }}>
              PRODUCT RANKING · {formatFecha(fechaHoy)}
            </p>
            <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--cream)', lineHeight: 1.2 }}>{producto}</h3>
            <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
              {buyers.length} cliente{buyers.length !== 1 ? 's' : ''} · {totalLitros.toFixed(1)} L total
            </p>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 4, flexShrink: 0 }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Lista de compradores */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {buyers.length === 0 ? (
            <p style={{ textAlign: 'center', padding: '32px 20px', color: 'var(--muted)', fontSize: 13 }}>
              Sin detalle disponible
            </p>
          ) : (
            buyers.map((b, i) => {
              const pct = totalLitros > 0 ? (b.litros / totalLitros) * 100 : 0
              return (
                <div
                  key={b.nombre}
                  style={{
                    padding: '12px 20px',
                    borderBottom: i < buyers.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                    display: 'flex', alignItems: 'center', gap: 14,
                  }}
                >
                  {/* Rank badge */}
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                    background: i === 0 ? 'rgba(212,175,55,0.15)' : 'var(--surface2)',
                    border: i === 0 ? '1px solid rgba(212,175,55,0.3)' : 'none',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 800, color: i === 0 ? 'var(--gold)' : 'var(--muted)',
                  }}>
                    {i + 1}
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{
                      fontSize: 13, fontWeight: 600, color: 'var(--cream)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {b.nombre}
                    </p>
                    {b.localidad && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                        <MapPin size={10} color="var(--muted)" />
                        <span style={{ fontSize: 11, color: 'var(--muted)' }}>{b.localidad}</span>
                      </div>
                    )}
                    {/* Barra de proporción */}
                    <div style={{ marginTop: 6, height: 4, borderRadius: 100, background: 'var(--surface2)', overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', borderRadius: 100, background: 'var(--gold)' }} />
                    </div>
                  </div>

                  {/* Litros */}
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <p style={{ fontSize: 14, fontWeight: 800, color: 'var(--gold)' }}>{b.litros.toFixed(1)} L</p>
                    <p style={{ fontSize: 10, color: 'var(--muted)' }}>{pct.toFixed(0)}%</p>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}

// ── ClientesHoyModal ─────────────────────────────────────────────────────────
function ClientesHoyModal({
  vendedor,
  color,
  clientes,
  fechaHoy,
  onClose,
}: {
  vendedor: string
  color: string
  clientes: ClienteDetalle[]
  fechaHoy: string
  onClose: () => void
}) {
  const [clienteAbierto, setClienteAbierto] = useState<string | null>(null)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const totalLitros = clientes.reduce(
    (s, c) => s + c.productos.reduce((ps, p) => ps + p.litros, 0), 0
  )

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '20px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 20, width: '100%', maxWidth: 460, maxHeight: '82vh',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          padding: '18px 20px 14px',
          borderBottom: '1px solid var(--border-subtle)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
            <div style={{
              width: 38, height: 38, borderRadius: '50%', background: color,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, fontWeight: 800, color: '#080808', flexShrink: 0,
            }}>
              {getInitials(vendedor)}
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 700, letterSpacing: '1px' }}>
                CLIENTES DEL DÍA · {formatFecha(fechaHoy)}
              </p>
              <h3 style={{ fontSize: 15, fontWeight: 800, color: 'var(--cream)' }}>{vendedor}</h3>
            </div>
            <button
              onClick={onClose}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 4, flexShrink: 0 }}
            >
              <X size={18} />
            </button>
          </div>
          <div style={{ display: 'flex', gap: 14 }}>
            <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: '8px 14px' }}>
              <p style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 700, letterSpacing: '0.8px', marginBottom: 2 }}>CLIENTES</p>
              <p style={{ fontSize: 18, fontWeight: 800, color }}>{clientes.length}</p>
            </div>
            <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: '8px 14px' }}>
              <p style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 700, letterSpacing: '0.8px', marginBottom: 2 }}>LITROS TOTALES</p>
              <p style={{ fontSize: 18, fontWeight: 800, color: '#60A5FA' }}>{totalLitros.toFixed(1)} L</p>
            </div>
          </div>
        </div>

        {/* Lista clientes */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {clientes.length === 0 ? (
            <p style={{ textAlign: 'center', padding: '32px 20px', color: 'var(--muted)', fontSize: 13 }}>
              Sin ventas registradas
            </p>
          ) : clientes.map((cliente, ci) => {
            const litrosCliente = cliente.productos.reduce((s, p) => s + p.litros, 0)
            const isOpen = clienteAbierto === cliente.nombre
            return (
              <div key={cliente.nombre} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <button
                  onClick={() => setClienteAbierto(isOpen ? null : cliente.nombre)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                    padding: '12px 20px', background: 'none', border: 'none', cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  {/* Número */}
                  <div style={{
                    width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                    background: ci === 0 ? `${color}22` : 'var(--surface2)',
                    border: ci === 0 ? `1px solid ${color}55` : 'none',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 800, color: ci === 0 ? color : 'var(--muted)',
                  }}>
                    {ci + 1}
                  </div>
                  {/* Nombre */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--cream)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {cliente.nombre}
                    </p>
                    <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>
                      {cliente.productos.length} producto{cliente.productos.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                  {/* Litros + chevron */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    <span style={{ fontSize: 14, fontWeight: 800, color }}>{litrosCliente.toFixed(1)} L</span>
                    {isOpen
                      ? <ChevronUp size={14} color="var(--muted)" />
                      : <ChevronDown size={14} color="var(--muted)" />}
                  </div>
                </button>

                {/* Detalle productos */}
                {isOpen && (
                  <div style={{ margin: '0 20px 10px', borderRadius: 12, overflow: 'hidden', background: 'var(--bg)', border: '1px solid var(--border-subtle)' }}>
                    {cliente.productos.map((p, pi) => (
                      <div key={pi} style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '9px 14px',
                        borderBottom: pi < cliente.productos.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                      }}>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <p style={{ fontSize: 12, color: 'var(--cream)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.producto}</p>
                          {p.envase && <p style={{ fontSize: 10, color: 'var(--muted)' }}>{p.envase}</p>}
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 700, color: '#60A5FA', marginLeft: 12, flexShrink: 0 }}>
                          {p.litros.toFixed(2)} L
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── ProductMixCard ───────────────────────────────────────────────────────────
function ProductMixCard({ resumen }: { resumen: VendedorResumen[] }) {
  const totalCerveza = resumen.reduce((s, v) => s + v.litrosCerveza, 0)
  const totalKombucha = resumen.reduce((s, v) => s + v.litrosKombucha, 0)
  const totalLitros = resumen.reduce((s, v) => s + v.litrosHoy, 0)
  const totalOtros = Math.max(0, totalLitros - totalCerveza - totalKombucha)
  const totalClientes = resumen.reduce((s, v) => s + v.clientesHoyCount, 0)
  const total = totalCerveza + totalKombucha + totalOtros

  function pct(n: number) { return total > 0 ? (n / total) * 100 : 0 }
  const pC = pct(totalCerveza)
  const pK = pct(totalKombucha)
  const pO = pct(totalOtros)

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 20, overflow: 'hidden',
    }}>
      <div style={{ height: 3, background: 'var(--gold)', borderRadius: '20px 20px 0 0' }} />
      <div style={{ padding: '16px 18px 20px' }}>
        <h3 style={{ fontWeight: 800, color: 'var(--cream)', fontSize: 14, marginBottom: 16 }}>Product Mix</h3>

        {/* Donut centered */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
          <DonutChart cerveza={totalCerveza} kombucha={totalKombucha} outros={totalOtros} size={100} />
        </div>

        {/* Segmented bars */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', height: 18, borderRadius: 9, overflow: 'hidden', gap: 1 }}>
            {pC > 0 && (
              <div style={{ width: `${pC}%`, background: '#D4AF37', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 9, fontWeight: 700, color: '#080808' }}>{Math.round(pC)}%</span>
              </div>
            )}
            {pK > 0 && (
              <div style={{ width: `${pK}%`, background: '#60A5FA', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 9, fontWeight: 700, color: '#080808' }}>{Math.round(pK)}%</span>
              </div>
            )}
            {pO > 0 && (
              <div style={{ width: `${pO}%`, background: '#A78BFA', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 9, fontWeight: 700, color: '#080808' }}>{Math.round(pO)}%</span>
              </div>
            )}
          </div>
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
          {[
            { color: '#D4AF37', label: 'Cerveza', val: totalCerveza },
            { color: '#60A5FA', label: 'Kombucha', val: totalKombucha },
            { color: '#A78BFA', label: 'Otros', val: totalOtros },
          ].map(({ color, label, val }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 10, height: 10, borderRadius: 2, background: color }} />
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>{label}</span>
              </div>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--cream)' }}>{fL(val)}</span>
            </div>
          ))}
        </div>

        {/* Clientes hoy */}
        <div style={{
          background: 'var(--surface2)', borderRadius: 10, padding: '8px 12px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>Clientes hoy</span>
          <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--gold)' }}>{totalClientes}</span>
        </div>
      </div>
    </div>
  )
}

// ── VendedorCard ─────────────────────────────────────────────────────────────
function VendedorCard({ data, color, fechaHoy }: { data: VendedorResumen; color: string; fechaHoy: string }) {
  const [showModal, setShowModal] = useState(false)

  return (
    <>
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 20, overflow: 'hidden',
    }}>
      <div style={{ height: 3, background: color, borderRadius: '20px 20px 0 0' }} />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 18px 12px' }}>
        <div style={{
          width: 42, height: 42, borderRadius: '50%',
          background: color, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14, fontWeight: 800, color: '#080808', flexShrink: 0,
        }}>
          {getInitials(data.vendedor)}
        </div>
        <div>
          <h2 style={{ fontWeight: 800, color: 'var(--cream)', fontSize: 16, letterSpacing: '-0.3px' }}>{data.vendedor}</h2>
          <p style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>Vendedor Canal</p>
        </div>
      </div>

      {/* HOY */}
      <div style={{ padding: '0 18px 14px' }}>
        <p style={{ fontSize: 9, fontWeight: 700, color: 'var(--gold)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 10 }}>
          Hoy
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {[
            { label: 'Litros', value: fL(data.litrosHoy), color: '#60A5FA' },
            { label: 'Venta s/imp', value: fP(data.ventaHoy), color: '#4ADE80' },
            { label: 'Latas Cerveza', value: String(data.latasCervezaHoy), color: 'var(--gold)' },
            { label: 'Latas Kombucha', value: String(data.latasKombuchaHoy), color: '#4ADE80' },
          ].map(({ label, value, color: c }) => (
            <div key={label} style={{ background: 'var(--surface2)', borderRadius: 12, padding: '12px 14px' }}>
              <p style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, marginBottom: 4 }}>{label}</p>
              <p style={{ fontSize: 18, fontWeight: 800, color: c, letterSpacing: '-0.5px' }}>{value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: 'var(--border-subtle)', margin: '0 18px' }} />

      {/* PERÍODO */}
      <div style={{ padding: '14px 18px 14px' }}>
        <p style={{ fontSize: 9, fontWeight: 700, color: '#A78BFA', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 10 }}>
          Período acumulado
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
          <div style={{ background: 'var(--surface2)', borderRadius: 12, padding: '12px 14px' }}>
            <p style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, marginBottom: 4 }}>Litros</p>
            <p style={{ fontSize: 18, fontWeight: 800, color: '#60A5FA', letterSpacing: '-0.5px' }}>{fL(data.litrosPeriodo)}</p>
          </div>
          <div style={{ background: 'var(--surface2)', borderRadius: 12, padding: '12px 14px' }}>
            <p style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, marginBottom: 4 }}>Venta s/imp</p>
            <p style={{ fontSize: 18, fontWeight: 800, color: '#4ADE80', letterSpacing: '-0.5px' }}>{fP(data.ventaPeriodo)}</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{
            flex: 1, background: 'var(--surface2)', borderRadius: 10, padding: '8px 12px',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>Clientes</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--cream)' }}>{data.clientesPeriodoCount}</span>
          </div>
          <div style={{
            flex: 1, background: 'var(--surface2)', borderRadius: 10, padding: '8px 12px',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>Drop size</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--cream)' }}>{fP(data.dropSize)}</span>
          </div>
        </div>
      </div>

      {/* Botón clientes hoy → abre modal */}
      <div style={{ padding: '0 18px 18px' }}>
        <button
          onClick={() => setShowModal(true)}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '11px 14px', borderRadius: 12,
            background: data.clientesHoyCount > 0 ? 'rgba(212,175,55,0.07)' : 'var(--surface2)',
            border: data.clientesHoyCount > 0 ? '1px solid rgba(212,175,55,0.2)' : '1px solid transparent',
            cursor: data.clientesHoyCount > 0 ? 'pointer' : 'default',
            transition: 'all 0.12s',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Users size={14} color="var(--gold)" />
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--cream)' }}>Clientes hoy</span>
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 100,
              background: 'rgba(212,175,55,0.15)', color: 'var(--gold)',
            }}>
              {data.clientesHoyCount}
            </span>
          </div>
          {data.clientesHoyCount > 0 && (
            <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>Ver detalle →</span>
          )}
        </button>
      </div>
    </div>

    {/* Modal clientes */}
    {showModal && (
      <ClientesHoyModal
        vendedor={data.vendedor}
        color={color}
        clientes={data.clientesHoy}
        fechaHoy={fechaHoy}
        onClose={() => setShowModal(false)}
      />
    )}
    </>
  )
}

// ── MetasCard ────────────────────────────────────────────────────────────────
function MetasCard({ resumen, periodo }: { resumen: VendedorResumen[]; periodo: Periodo | null }) {
  const allZero = resumen.every(v => v.metaLitros === 0)
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 20, overflow: 'hidden',
    }}>
      <div style={{ height: 3, background: 'var(--gold)', borderRadius: '20px 20px 0 0' }} />
      <div style={{ padding: '16px 18px 20px' }}>
        <h3 style={{ fontWeight: 800, color: 'var(--cream)', fontSize: 14, marginBottom: 4 }}>Metas Individuales</h3>
        <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 20 }}>{periodo?.nombre ?? 'Período activo'}</p>
        {allZero ? (
          <p style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'center', padding: '20px 0' }}>
            Sin metas configuradas para este período
          </p>
        ) : (
          resumen.map(v => (
            <MetaBar key={v.vendedor} vendedor={v.vendedor} actual={v.litrosPeriodo} meta={v.metaLitros} />
          ))
        )}
      </div>
    </div>
  )
}

// ── EvolutionCard ────────────────────────────────────────────────────────────
function EvolutionCard({ evolution, vendedores, colors }: { evolution: EvolutionDay[]; vendedores: string[]; colors: Record<string, string> }) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 20, overflow: 'hidden',
    }}>
      <div style={{ padding: '16px 18px 20px' }}>
        <h3 style={{ fontWeight: 800, color: 'var(--cream)', fontSize: 14, marginBottom: 12 }}>Evolución Daily Sales</h3>
        <div style={{ display: 'flex', gap: 16, marginBottom: 14, flexWrap: 'wrap' }}>
          {vendedores.map(v => (
            <div key={v} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: colors[v] ?? '#D4AF37' }} />
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>{v.split(' ')[0]}</span>
            </div>
          ))}
        </div>
        <LineChart data={evolution} vendedores={vendedores} colors={colors} />
      </div>
    </div>
  )
}

// ── RankingCard ──────────────────────────────────────────────────────────────
function RankingCard({
  productRanking,
  productDetail,
  fechaHoy,
}: {
  productRanking: ProductRank[]
  productDetail: Record<string, ProductBuyer[]>
  fechaHoy: string
}) {
  const [selectedProducto, setSelectedProducto] = useState<string | null>(null)

  return (
    <>
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 20, overflow: 'hidden',
      }}>
        <div style={{ padding: '16px 18px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <h3 style={{ fontWeight: 800, color: 'var(--cream)', fontSize: 14 }}>Product Ranking</h3>
            <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>Litros</span>
          </div>
          <p style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 14 }}>Toca un producto para ver quién compró</p>

          {productRanking.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'center', padding: '20px 0' }}>Sin ventas hoy</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {productRanking.map((p, i) => (
                <button
                  key={p.producto}
                  onClick={() => setSelectedProducto(p.producto)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                    borderRadius: 12, width: '100%', textAlign: 'left', cursor: 'pointer',
                    background: i === 0 ? 'rgba(212,175,55,0.08)' : 'var(--surface2)',
                    border: i === 0 ? '1px solid rgba(212,175,55,0.2)' : '1px solid transparent',
                    transition: 'all 0.12s',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.border = '1px solid rgba(212,175,55,0.3)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.border = i === 0 ? '1px solid rgba(212,175,55,0.2)' : '1px solid transparent' }}
                >
                  <div style={{
                    width: 24, height: 24, borderRadius: '50%',
                    background: i === 0 ? 'var(--gold)' : 'var(--surface)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 800, color: i === 0 ? '#080808' : 'var(--muted)',
                    flexShrink: 0,
                  }}>
                    {i + 1}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{
                      fontSize: 13, fontWeight: 600, color: 'var(--cream)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {p.producto}
                    </p>
                    {p.categoria && (
                      <span style={{
                        fontSize: 10, color: 'var(--muted)', background: 'var(--surface)',
                        padding: '1px 6px', borderRadius: 6, display: 'inline-block', marginTop: 2,
                      }}>
                        {p.categoria}
                      </span>
                    )}
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <span style={{ fontSize: 13, fontWeight: 800, color: i === 0 ? 'var(--gold)' : 'var(--cream)' }}>
                      {fL(p.litros)}
                    </span>
                    {(productDetail[p.producto]?.length ?? 0) > 0 && (
                      <p style={{ fontSize: 10, color: 'var(--muted)', marginTop: 1 }}>
                        {productDetail[p.producto].length} clientes
                      </p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Modal detalle */}
      {selectedProducto && (
        <ProductDetailModal
          producto={selectedProducto}
          buyers={productDetail[selectedProducto] ?? []}
          fechaHoy={fechaHoy}
          onClose={() => setSelectedProducto(null)}
        />
      )}
    </>
  )
}

// ── WeeklyBriefingModal ───────────────────────────────────────────────────────
const SEG_COLORS_PLAN: Record<string, string> = {
  A: '#D4AF37', B: '#34D399', C: '#60A5FA', D: '#F59E0B', E: '#F87171',
}

function WeeklyBriefingModal({ clientes, onClose }: { clientes: PlanCliente[]; onClose: () => void }) {
  const router = useRouter()
  const [tab, setTab] = useState<'critico' | 'vencido' | 'proximo'>('critico')

  const criticos = clientes.filter(c => c.alert_level === 'critico')
  const vencidos  = clientes.filter(c => c.alert_level === 'vencido')
  const proximos  = clientes.filter(c => c.alert_level === 'proximo')

  const tabData = tab === 'critico' ? criticos : tab === 'vencido' ? vencidos : proximos
  const tabColor = tab === 'critico' ? '#EF4444' : tab === 'vencido' ? '#F87171' : '#F59E0B'

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 2000,
        background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 560,
          background: '#111', border: '1px solid rgba(212,175,55,0.2)',
          borderRadius: '24px 24px 0 0',
          maxHeight: '85vh', display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '20px 20px 14px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 18 }}>📋</span>
                <p style={{ fontSize: 15, fontWeight: 900, color: '#D4AF37', letterSpacing: '-0.3px' }}>
                  Plan de la semana
                </p>
              </div>
              <p style={{ fontSize: 12, color: '#666' }}>
                {clientes.length} clientes para contactar — ordenados por score
              </p>
            </div>
            <button
              onClick={onClose}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#555', padding: 4, flexShrink: 0 }}
            >
              <X size={20} />
            </button>
          </div>

          {/* Summary chips */}
          <div style={{ display: 'flex', gap: 6 }}>
            {([
              { key: 'critico', label: '🔴 Urgentes', count: criticos.length, color: '#EF4444' },
              { key: 'vencido', label: '⚠ Vencidos',  count: vencidos.length,  color: '#F87171' },
              { key: 'proximo', label: '⏰ Próximos',  count: proximos.length,  color: '#F59E0B' },
            ] as const).map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                style={{
                  flex: 1, padding: '8px 6px', borderRadius: 12, border: 'none', cursor: 'pointer',
                  background: tab === t.key ? `${t.color}18` : '#1A1A1A',
                  outline: tab === t.key ? `1px solid ${t.color}40` : 'none',
                  transition: 'all 0.15s',
                }}
              >
                <p style={{ fontSize: 8, color: tab === t.key ? t.color : '#555', fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: 3 }}>
                  {t.label}
                </p>
                <p style={{ fontSize: 22, fontWeight: 900, color: tab === t.key ? t.color : '#666', lineHeight: 1 }}>
                  {t.count}
                </p>
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '8px 0' }}>
          {tabData.length === 0 ? (
            <p style={{ textAlign: 'center', padding: '32px 20px', color: '#555', fontSize: 13 }}>
              No hay clientes en esta categoría
            </p>
          ) : (
            tabData.map(c => {
              const segColor = SEG_COLORS_PLAN[c.segmento] ?? '#888'
              return (
                <div
                  key={c.nombre_fantasia}
                  onClick={() => { onClose(); router.push('/ventas/clientes') }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '10px 20px', cursor: 'pointer',
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                    transition: 'background 0.1s',
                  }}
                >
                  {/* Seg badge */}
                  <div style={{
                    width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                    background: `${segColor}15`, border: `1px solid ${segColor}30`,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <span style={{ fontSize: 14, fontWeight: 900, color: segColor, lineHeight: 1 }}>{c.segmento}</span>
                    <span style={{ fontSize: 7, fontWeight: 700, color: segColor, opacity: 0.7 }}>{c.score}pts</span>
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.nombre_fantasia}
                    </p>
                    <p style={{ fontSize: 10, color: '#555', marginTop: 1 }}>
                      {c.vendedor_actual.split(' ')[0]}
                      {c.siguiente_compra_estimada && ` · próximo: ${c.siguiente_compra_estimada}`}
                    </p>
                  </div>

                  {/* Days */}
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <p style={{ fontSize: 14, fontWeight: 800, color: tabColor }}>{c.dias_sin_compra}d</p>
                    <p style={{ fontSize: 9, color: '#555' }}>/{c.ciclo_promedio_dias}d</p>
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* CTA */}
        <div style={{ padding: '12px 20px 28px', borderTop: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
          <button
            onClick={() => { onClose(); router.push('/ventas/clientes') }}
            style={{
              width: '100%', padding: '13px 0', borderRadius: 14,
              background: 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.3)',
              color: '#D4AF37', fontWeight: 800, fontSize: 14, cursor: 'pointer',
            }}
          >
            Ver cartera completa →
          </button>
        </div>
      </div>
    </div>
  )
}

// ── RiesgoClientesCard ────────────────────────────────────────────────────────
const SEG_COLORS_RISK: Record<string, string> = { A: '#D4AF37', B: '#34D399', C: '#60A5FA', D: '#F59E0B', E: '#F87171' }
function RiesgoClientesCard({ clientes, colors }: { clientes: PlanCliente[]; colors: Record<string, string> }) {
  const router = useRouter()
  const criticos = clientes.filter(c => c.alert_level === 'critico')
  const vencidos  = clientes.filter(c => c.alert_level === 'vencido')
  const total = criticos.length + vencidos.length

  return (
    <div style={{
      background: 'var(--surface)', border: total > 0 ? '1px solid rgba(239,68,68,0.3)' : '1px solid var(--border)',
      borderRadius: 20, overflow: 'hidden',
    }}>
      <div style={{ padding: '16px 18px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ fontWeight: 800, color: 'var(--cream)', fontSize: 14 }}>Clientes en riesgo</h3>
          <button
            onClick={() => router.push('/ventas/clientes')}
            style={{
              fontSize: 11, fontWeight: 700, color: '#EF4444',
              background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)',
              borderRadius: 8, padding: '4px 10px', cursor: 'pointer',
            }}
          >
            Ver todos
          </button>
        </div>

        {/* Contadores */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
          <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 12, padding: '12px 14px' }}>
            <p style={{ fontSize: 10, color: '#EF4444', fontWeight: 700, marginBottom: 4 }}>🔴 CRÍTICOS</p>
            <p style={{ fontSize: 28, fontWeight: 900, color: '#EF4444', lineHeight: 1 }}>{criticos.length}</p>
            <p style={{ fontSize: 10, color: 'var(--muted)', marginTop: 3 }}>+1.5× su ciclo</p>
          </div>
          <div style={{ background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.15)', borderRadius: 12, padding: '12px 14px' }}>
            <p style={{ fontSize: 10, color: '#F87171', fontWeight: 700, marginBottom: 4 }}>⚠ VENCIDOS</p>
            <p style={{ fontSize: 28, fontWeight: 900, color: '#F87171', lineHeight: 1 }}>{vencidos.length}</p>
            <p style={{ fontSize: 10, color: 'var(--muted)', marginTop: 3 }}>Superaron su ciclo</p>
          </div>
        </div>

        {/* Lista top clientes */}
        {total === 0 ? (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <p style={{ fontSize: 28, marginBottom: 4 }}>✅</p>
            <p style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 600 }}>Todos al día</p>
          </div>
        ) : (
          <div>
            <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.07em', marginBottom: 8 }}>
              TOP URGENTES
            </p>
            {[...criticos, ...vencidos]
              .sort((a, b) => b.dias_sin_compra - a.dias_sin_compra)
              .slice(0, 5)
              .map(c => {
                const color = colors[c.vendedor_actual] ?? '#D4AF37'
                const isCritico = c.alert_level === 'critico'
                return (
                  <div
                    key={c.nombre_fantasia}
                    onClick={() => router.push('/ventas/clientes')}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.04)',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                        {c.segmento && (
                          <span style={{
                            fontSize: 9, fontWeight: 900, padding: '1px 5px', borderRadius: 5,
                            background: `${SEG_COLORS_RISK[c.segmento] ?? '#888'}22`,
                            color: SEG_COLORS_RISK[c.segmento] ?? '#888',
                            border: `1px solid ${SEG_COLORS_RISK[c.segmento] ?? '#888'}44`,
                            flexShrink: 0, lineHeight: 1.4,
                          }}>{c.segmento}{c.score != null ? ` ${c.score}` : ''}</span>
                        )}
                        <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--cream)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {c.nombre_fantasia}
                        </p>
                      </div>
                      <p style={{ fontSize: 10, color }}>
                        {c.vendedor_actual.split(' ')[0]}
                      </p>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 800, color: isCritico ? '#EF4444' : '#F87171' }}>
                        {c.dias_sin_compra}d
                      </p>
                      <p style={{ fontSize: 10, color: 'var(--muted)' }}>/{c.ciclo_promedio_dias}d</p>
                    </div>
                  </div>
                )
              })}
          </div>
        )}
      </div>
    </div>
  )
}

// ── MisionesWidgetCard ────────────────────────────────────────────────────────
function MisionesWidgetCard({ misiones }: { misiones: MisionResumen[] }) {
  const router = useRouter()
  const SEG_C: Record<string, string> = { A: '#D4AF37', B: '#34D399', C: '#60A5FA', D: '#F59E0B', E: '#F87171' }

  const pendientes = misiones.filter(m => m.estado === 'pendiente')
  const criticos   = pendientes.filter(m => m.alert_level === 'critico')
  const vencidos   = pendientes.filter(m => m.alert_level === 'vencido')
  const proximos   = pendientes.filter(m => m.alert_level === 'proximo')
  const completadas = misiones.filter(m => m.estado === 'completada')
  const total = misiones.length
  const pct = total > 0 ? Math.round((completadas.length / total) * 100) : 0

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 20, overflow: 'hidden',
    }}>
      <div style={{ padding: '16px 18px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Target size={15} color="var(--gold)" />
            <h3 style={{ fontWeight: 800, color: 'var(--cream)', fontSize: 14 }}>Misiones esta semana</h3>
          </div>
          <button
            onClick={() => router.push('/ventas/misiones')}
            style={{
              fontSize: 11, fontWeight: 700, color: 'var(--gold)',
              background: 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.2)',
              borderRadius: 8, padding: '4px 10px', cursor: 'pointer',
            }}
          >
            Ver plan →
          </button>
        </div>

        {total === 0 ? (
          <div style={{ textAlign: 'center', padding: '12px 0' }}>
            <p style={{ fontSize: 22, marginBottom: 4 }}>🎯</p>
            <p style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>Sin misiones generadas</p>
            <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>El admin genera el plan cada lunes</p>
          </div>
        ) : (
          <>
            {/* Progreso */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 6, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 6, transition: 'width 0.4s',
                  width: `${pct}%`,
                  background: pct === 100 ? '#34D399' : pct > 60 ? '#F59E0B' : '#60A5FA',
                }} />
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', flexShrink: 0 }}>
                {completadas.length}/{total}
              </span>
            </div>

            {/* Contadores */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 14 }}>
              {[
                { label: '🔴 Urgentes', count: criticos.length,  color: '#EF4444', bg: 'rgba(239,68,68,0.08)',    border: 'rgba(239,68,68,0.2)'    },
                { label: '⚠ Vencidos',  count: vencidos.length,  color: '#F87171', bg: 'rgba(248,113,113,0.06)', border: 'rgba(248,113,113,0.15)' },
                { label: '⏰ Próximos', count: proximos.length,  color: '#F59E0B', bg: 'rgba(245,158,11,0.06)',  border: 'rgba(245,158,11,0.15)'  },
              ].map(s => (
                <div key={s.label} style={{ background: s.bg, border: `1px solid ${s.border}`, borderRadius: 12, padding: '8px 6px', textAlign: 'center' }}>
                  <p style={{ fontSize: 9, color: s.color, fontWeight: 700, marginBottom: 2 }}>{s.label}</p>
                  <p style={{ fontSize: 20, fontWeight: 900, color: s.color, lineHeight: 1 }}>{s.count}</p>
                </div>
              ))}
            </div>

            {/* Top pendientes */}
            <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.07em', marginBottom: 8 }}>
              PENDIENTES DE CONTACTO
            </p>
            {[...criticos, ...vencidos, ...proximos].slice(0, 4).map(c => {
              const alertColor = c.alert_level === 'critico' ? '#EF4444' : c.alert_level === 'vencido' ? '#F87171' : '#F59E0B'
              const segColor = SEG_C[c.segmento] ?? '#888'
              return (
                <div key={`${c.vendedor}|||${c.nombre_fantasia}`} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.04)',
                }}>
                  <span style={{
                    fontSize: 9, fontWeight: 900, padding: '1px 5px', borderRadius: 5,
                    background: `${segColor}22`, color: segColor, border: `1px solid ${segColor}44`, flexShrink: 0,
                  }}>{c.segmento} {c.score}</span>
                  <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--cream)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.nombre_fantasia}
                  </p>
                  <p style={{ fontSize: 11, fontWeight: 800, color: alertColor, flexShrink: 0 }}>
                    {c.dias_sin_compra}d
                  </p>
                </div>
              )
            })}
            {pendientes.length > 4 && (
              <p style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'center', paddingTop: 8, fontStyle: 'italic' }}>
                +{pendientes.length - 4} más en Misiones
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ── DropSizeCard ─────────────────────────────────────────────────────────────
function DropSizeCard({ resumen, colors }: { resumen: VendedorResumen[]; colors: Record<string, string> }) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 20, overflow: 'hidden',
    }}>
      <div style={{ padding: '16px 18px 20px' }}>
        <h3 style={{ fontWeight: 800, color: 'var(--cream)', fontSize: 14, marginBottom: 20 }}>
          Ticket Promedio / Drop Size
        </h3>
        {resumen.map((v, i) => {
          const color = colors[v.vendedor] ?? '#D4AF37'
          return (
            <div key={v.vendedor} style={{ marginBottom: i < resumen.length - 1 ? 20 : 0 }}>
              {/* Header row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: '50%',
                  background: color, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 800, color: '#080808', flexShrink: 0,
                }}>
                  {getInitials(v.vendedor)}
                </div>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--cream)' }}>{v.vendedor}</p>
                  <p style={{ fontSize: 10, color: 'var(--muted)' }}>Vendedor Canal</p>
                </div>
              </div>
              {/* 3 metric boxes */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                {[
                  { label: 'Litros período', value: fL(v.litrosPeriodo), color: '#60A5FA' },
                  { label: 'Venta s/imp período', value: fP(v.ventaPeriodo), color: '#4ADE80' },
                  { label: 'Drop Size Hoy', value: fP(v.dropSize), color },
                ].map(({ label, value, color: c }) => (
                  <div key={label} style={{ background: 'var(--surface2)', borderRadius: 10, padding: '10px 10px' }}>
                    <p style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 600, marginBottom: 4 }}>{label}</p>
                    <p style={{ fontSize: 13, fontWeight: 800, color: c }}>{value}</p>
                  </div>
                ))}
              </div>
              {i < resumen.length - 1 && (
                <div style={{ height: 1, background: 'var(--border-subtle)', margin: '16px 0 0' }} />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Main Component ───────────────────────────────────────────────────────────
export default function DashboardClient({ resumen, fechaHoy, fechasDisponibles, periodo, evolution, productRanking, productDetail, vendedoresScope, riesgoClientes, planSemana, misionesResumen }: Props) {
  const isDesktop = useIsDesktop()
  const [showPlanModal, setShowPlanModal] = useState(false)

  // Mostrar popup plan semanal solo los lunes, una vez por día
  useEffect(() => {
    if (typeof window === 'undefined') return
    const today = new Date()
    if (today.getDay() !== 1) return // solo lunes
    const key = `weekly-plan-${today.toISOString().split('T')[0]}`
    if (!localStorage.getItem(key) && planSemana.length > 0) {
      // Pequeño delay para que no bloquee el render inicial
      const t = setTimeout(() => setShowPlanModal(true), 1200)
      return () => clearTimeout(t)
    }
  }, [planSemana.length])

  function closePlanModal() {
    const key = `weekly-plan-${new Date().toISOString().split('T')[0]}`
    localStorage.setItem(key, '1')
    setShowPlanModal(false)
  }

  const totalLitrosHoy = resumen.reduce((s, v) => s + v.litrosHoy, 0)
  const totalVentaHoy = resumen.reduce((s, v) => s + v.ventaHoy, 0)
  const totalLitrosPeriodo = resumen.reduce((s, v) => s + v.litrosPeriodo, 0)
  const precioProm = totalLitrosHoy > 0 ? totalVentaHoy / totalLitrosHoy : 0

  // Vendedor colors
  const VEND_COLOR: Record<string, string> = {}
  resumen.forEach((v, i) => { VEND_COLOR[v.vendedor] = i === 0 ? '#D4AF37' : '#60A5FA' })

  const gridStyle4 = isDesktop
    ? { display: 'grid', gridTemplateColumns: '220px 1fr 1fr 220px', gap: 16, marginBottom: 16 }
    : { display: 'flex', flexDirection: 'column' as const, gap: 14, marginBottom: 14 }

  const gridStyle3 = isDesktop
    ? { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }
    : { display: 'flex', flexDirection: 'column' as const, gap: 14 }

  return (
    <div style={{ padding: isDesktop ? '20px 24px 60px' : '12px 12px 80px', maxWidth: 1400, margin: '0 auto' }}>

      {/* === POPUP PLAN SEMANAL (solo lunes) === */}
      {showPlanModal && (
        <WeeklyBriefingModal clientes={planSemana} onClose={closePlanModal} />
      )}

      {/* === BANNER PLAN SEMANAL (acceso manual) === */}
      {planSemana.length > 0 && new Date().getDay() === 1 && (
        <button
          onClick={() => setShowPlanModal(true)}
          style={{
            width: '100%', marginBottom: 12, padding: '12px 16px',
            background: 'linear-gradient(135deg, rgba(212,175,55,0.08), rgba(212,175,55,0.04))',
            border: '1px solid rgba(212,175,55,0.25)', borderRadius: 14,
            display: 'flex', alignItems: 'center', gap: 12,
            cursor: 'pointer', textAlign: 'left',
          }}
        >
          <span style={{ fontSize: 22 }}>📋</span>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 13, fontWeight: 800, color: '#D4AF37' }}>Plan de la semana listo</p>
            <p style={{ fontSize: 11, color: '#665E40' }}>
              {planSemana.filter(c => c.alert_level === 'critico').length} urgentes ·{' '}
              {planSemana.filter(c => c.alert_level === 'vencido').length} vencidos ·{' '}
              {planSemana.filter(c => c.alert_level === 'proximo').length} próximos
            </p>
          </div>
          <span style={{ fontSize: 12, color: '#D4AF37', fontWeight: 700 }}>Ver →</span>
        </button>
      )}

      {/* === KPI BANNER === */}
      <div style={{
        background: 'linear-gradient(135deg, #110D00 0%, #1C1500 100%)',
        border: '1px solid rgba(212,175,55,0.25)',
        borderRadius: 20,
        padding: isDesktop ? '20px 28px' : '16px 18px',
        marginBottom: isDesktop ? 20 : 14,
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: isDesktop ? 32 : 16,
      }}>
        {/* Date label + selector */}
        <div style={{ flexBasis: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: -4 }}>
          <p style={{ fontSize: 10, color: 'rgba(212,175,55,0.5)', fontWeight: 600, letterSpacing: '1.2px', textTransform: 'uppercase' }}>
            {formatFecha(fechaHoy)}{periodo ? ` · ${periodo.nombre}` : ''}
          </p>
          <DateSelector fechaActual={fechaHoy} fechasDisponibles={fechasDisponibles} />
        </div>

        {/* KPI 1 */}
        <div style={{ minWidth: 120 }}>
          <p style={{ fontSize: 9, fontWeight: 700, color: 'rgba(212,175,55,0.6)', letterSpacing: '1.8px', textTransform: 'uppercase', marginBottom: 6 }}>
            Total Equipo Hoy
          </p>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
            <span style={{ fontSize: isDesktop ? 46 : 38, fontWeight: 900, color: 'var(--gold)', letterSpacing: '-2px', lineHeight: 1 }}>
              {totalLitrosHoy.toFixed(1)}
            </span>
            <span style={{ fontSize: isDesktop ? 18 : 14, fontWeight: 700, color: '#A8870F' }}>L</span>
          </div>
        </div>

        {isDesktop && <div style={{ width: 1, height: 52, background: 'rgba(212,175,55,0.2)', flexShrink: 0 }} />}

        {/* KPI 2 */}
        <div style={{ minWidth: 100 }}>
          <p style={{ fontSize: 9, fontWeight: 700, color: 'var(--muted)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 6 }}>
            Acum. Período
          </p>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
            <span style={{ fontSize: isDesktop ? 30 : 24, fontWeight: 800, color: 'var(--cream)', letterSpacing: '-1px' }}>
              {totalLitrosPeriodo.toFixed(1)}
            </span>
            <span style={{ fontSize: isDesktop ? 14 : 12, fontWeight: 600, color: 'var(--muted)' }}>L</span>
          </div>
        </div>

      </div>

      {/* === MAIN GRID (4 cols desktop) === */}
      <div style={gridStyle4}>
        {/* Col 1: Product Mix */}
        <ProductMixCard resumen={resumen} />

        {/* Col 2-3: Vendedor cards */}
        {resumen.map(v => (
          <VendedorCard key={v.vendedor} data={v} color={VEND_COLOR[v.vendedor] ?? '#D4AF37'} fechaHoy={fechaHoy} />
        ))}

        {/* Col 4: Metas */}
        <MetasCard resumen={resumen} periodo={periodo} />
      </div>

      {/* === BOTTOM GRID (2-col evolution + sidebar cards) === */}
      <div style={{ display: 'grid', gridTemplateColumns: isDesktop ? '2fr 1fr 1fr' : '1fr', gap: 12, marginBottom: 12 }}>
        {/* Col 1 (wide): Evolution */}
        <EvolutionCard
          evolution={evolution}
          vendedores={vendedoresScope}
          colors={VEND_COLOR}
        />

        {/* Col 2: Ranking */}
        <RankingCard productRanking={productRanking} productDetail={productDetail} fechaHoy={fechaHoy} />

        {/* Col 3: Drop Size */}
        <DropSizeCard resumen={resumen} colors={VEND_COLOR} />
      </div>

      {/* === RISK ROW === */}
      <div style={{ display: 'grid', gridTemplateColumns: isDesktop ? '1fr 1fr' : '1fr', gap: 12, marginBottom: 12 }}>
        {/* Clientes en riesgo */}
        <RiesgoClientesCard clientes={riesgoClientes} colors={VEND_COLOR} />

        {/* Misiones de la semana */}
        <MisionesWidgetCard misiones={misionesResumen} />
      </div>
    </div>
  )
}
