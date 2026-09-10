'use client'

import { useState } from 'react'

export interface PuntoSerie { nombre: string; valor: number }

interface Props {
  actual: PuntoSerie[]
  comparado: PuntoSerie[]
  anioActual: number
  anioComparado: number
  formatear: (n: number) => string
}

const W = 760
const H = 260
const PAD_L = 8
const PAD_B = 26
const PAD_T = 10

export default function GraficoVentasAnual({ actual, comparado, anioActual, anioComparado, formatear }: Props) {
  const [hover, setHover] = useState<number | null>(null)

  const max = Math.max(1, ...actual.map(p => p.valor), ...comparado.map(p => p.valor))
  const n = actual.length
  const plotW = W - PAD_L * 2
  const plotH = H - PAD_T - PAD_B
  const groupW = plotW / n
  const barW = Math.min(20, groupW * 0.32)

  const y = (v: number) => PAD_T + plotH - (v / max) * plotH

  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
        {/* líneas guía */}
        {[0.25, 0.5, 0.75, 1].map(f => (
          <line key={f} x1={PAD_L} x2={W - PAD_L} y1={y(max * f)} y2={y(max * f)} stroke="var(--border-subtle)" strokeWidth={1} />
        ))}
        {actual.map((p, i) => {
          const cx = PAD_L + groupW * i + groupW / 2
          const compValor = comparado[i]?.valor ?? 0
          const isHover = hover === i
          return (
            <g
              key={p.nombre}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              style={{ cursor: 'pointer' }}
            >
              <rect x={cx - barW - 2} y={y(compValor)} width={barW} height={Math.max(0, PAD_T + plotH - y(compValor))} rx={3}
                fill="var(--muted)" opacity={isHover ? 0.55 : 0.35} />
              <rect x={cx + 2} y={y(p.valor)} width={barW} height={Math.max(0, PAD_T + plotH - y(p.valor))} rx={3}
                fill="var(--gold)" opacity={isHover ? 1 : 0.85} />
              <rect x={cx - groupW / 2} y={PAD_T} width={groupW} height={plotH} fill="transparent" />
              <text x={cx} y={H - 8} textAnchor="middle" fontSize={9.5} fill="var(--muted)" fontWeight={600}>
                {p.nombre.slice(0, 3)}
              </text>
            </g>
          )
        })}
      </svg>

      <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--gold)', display: 'inline-block' }} /> {anioActual}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--muted)', display: 'inline-block' }} /> {anioComparado}
        </div>
      </div>

      {hover !== null && actual[hover] && (
        <div style={{
          position: 'absolute', top: 4, right: 4,
          background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10,
          padding: '8px 12px', fontSize: 12, minWidth: 150, pointerEvents: 'none',
        }}>
          <p style={{ fontWeight: 800, color: 'var(--cream)', marginBottom: 4 }}>{actual[hover].nombre}</p>
          <p style={{ color: 'var(--gold)', fontWeight: 700 }}>{anioActual}: {formatear(actual[hover].valor)}</p>
          <p style={{ color: 'var(--muted)', fontWeight: 700 }}>{anioComparado}: {formatear(comparado[hover]?.valor ?? 0)}</p>
          {comparado[hover]?.valor ? (
            <p style={{
              marginTop: 3, fontWeight: 700,
              color: actual[hover].valor >= comparado[hover].valor ? 'var(--green)' : 'var(--red)',
            }}>
              {actual[hover].valor >= comparado[hover].valor ? '+' : ''}
              {(((actual[hover].valor - comparado[hover].valor) / Math.abs(comparado[hover].valor)) * 100).toFixed(1)}%
            </p>
          ) : null}
        </div>
      )}
    </div>
  )
}
