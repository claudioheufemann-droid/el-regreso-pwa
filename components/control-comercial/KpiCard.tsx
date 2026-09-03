'use client'

import Link from 'next/link'
import { ArrowUpRight, ArrowDownRight, Minus, Info } from 'lucide-react'
import type { KpiEjecutivo } from '@/lib/control-comercial/tipos'

// n puede llegar null/undefined si la fila viene de una tabla con RLS que devolvió vacío
// (ver notas de deudores/barriles_clientes) — nunca reventar el render por eso, mostrar "—".
export function formatCLP(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  return n.toLocaleString('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 })
}
export function formatLitros(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  return `${n.toLocaleString('es-CL', { maximumFractionDigits: 1 })} L`
}
export function formatNumero(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  return n.toLocaleString('es-CL')
}
export function formatPct(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  return `${n > 0 ? '+' : ''}${n.toLocaleString('es-CL', { maximumFractionDigits: 1 })}%`
}

function formatValor(kpi: KpiEjecutivo): string {
  switch (kpi.formato) {
    case 'clp': return formatCLP(kpi.valor)
    case 'litros': return formatLitros(kpi.valor)
    case 'porcentaje': return formatPct(kpi.valor)
    default: return formatNumero(kpi.valor)
  }
}

export default function KpiCard({ kpi }: { kpi: KpiEjecutivo }) {
  const sinValor = kpi.estado === 'sin_meta' || kpi.estado === 'no_disponible'
  const sinComparacion = kpi.estado === 'sin_comparacion'
  const positivo = (kpi.variacionPct ?? 0) > 0
  const negativo = (kpi.variacionPct ?? 0) < 0

  const contenido = (
    <div
      style={{
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16,
        padding: '16px 16px 14px', display: 'flex', flexDirection: 'column', gap: 8,
        minHeight: 108, height: '100%', transition: 'border-color 0.15s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', letterSpacing: 0.3, textTransform: 'uppercase' }}>
          {kpi.titulo}
        </span>
        <span title={kpi.tooltip} style={{ flexShrink: 0, cursor: 'help', color: 'var(--muted)', opacity: 0.6 }}>
          <Info size={13} />
        </span>
      </div>

      {sinValor ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--muted)' }}>
            {kpi.estado === 'sin_meta' ? 'Sin meta configurada' : 'No disponible aún'}
          </span>
          <span style={{ fontSize: 11, color: 'var(--muted)', opacity: 0.75, lineHeight: 1.4 }}>
            {kpi.tooltip}
          </span>
        </div>
      ) : (
        <>
          <span style={{ fontSize: 24, fontWeight: 900, color: 'var(--cream)', letterSpacing: '-0.5px', lineHeight: 1.05 }}>
            {formatValor(kpi)}
          </span>
          {sinComparacion ? (
            <span style={{ fontSize: 11, color: 'var(--muted)', opacity: 0.75 }}>Sin histórico previo para comparar</span>
          ) : kpi.variacionPct !== null && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {positivo && <ArrowUpRight size={14} color="var(--green)" />}
              {negativo && <ArrowDownRight size={14} color="var(--red)" />}
              {!positivo && !negativo && <Minus size={14} color="var(--muted)" />}
              <span style={{
                fontSize: 12, fontWeight: 700,
                color: positivo ? 'var(--green)' : negativo ? 'var(--red)' : 'var(--muted)',
              }}>
                {formatPct(kpi.variacionPct)}
              </span>
            </div>
          )}
        </>
      )}
    </div>
  )

  if (!kpi.drillHref) return contenido
  return (
    <Link href={kpi.drillHref} style={{ textDecoration: 'none', display: 'block', height: '100%' }}>
      {contenido}
    </Link>
  )
}

/** Tarjeta simple para KPIs sin comparación/tendencia — Cobranza, Barriles, Equipo. */
export function StatTile({ titulo, valor, subtitulo, tooltip, tono }: {
  titulo: string; valor: string; subtitulo?: string; tooltip?: string
  tono?: 'ok' | 'alerta' | 'critico'
}) {
  const color = tono === 'critico' ? 'var(--red)' : tono === 'alerta' ? 'var(--gold)' : 'var(--cream)'
  return (
    <div
      title={tooltip}
      style={{
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16,
        padding: '16px 16px 14px', display: 'flex', flexDirection: 'column', gap: 6, minHeight: 92,
      }}
    >
      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', letterSpacing: 0.3, textTransform: 'uppercase' }}>{titulo}</span>
      <span style={{ fontSize: 22, fontWeight: 900, color, letterSpacing: '-0.4px' }}>{valor}</span>
      {subtitulo && <span style={{ fontSize: 11, color: 'var(--muted)' }}>{subtitulo}</span>}
    </div>
  )
}
