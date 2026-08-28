'use client'

/**
 * States — primitivas compartidas de estado para toda la app.
 *
 * Existe porque cada pantalla resolvía loading/empty/error a mano y con
 * criterios distintos: unas mostraban "Cargando…" sin fin (si el fetch
 * fallaba nunca salían de ahí), otras una pantalla en blanco, otras el
 * mensaje técnico de Supabase tal cual. Toda consulta debe pasar por los
 * cinco estados: loading · success · empty · error · retry.
 *
 * No reemplaza el diseño de cada pantalla: es el piso mínimo para que
 * ninguna quede colgada ni le muestre un stack trace a un vendedor.
 */

import type { LucideIcon } from 'lucide-react'
import { AlertTriangle, RotateCw } from 'lucide-react'

// ── Skeleton ────────────────────────────────────────────────────────────────

/** Bloque gris que respira mientras carga. Usar con las medidas del contenido real. */
export function Skeleton({
  height = 16,
  width = '100%',
  radius = 8,
  style,
}: {
  height?: number | string
  width?: number | string
  radius?: number
  style?: React.CSSProperties
}) {
  return (
    <div
      aria-hidden
      style={{
        height, width, borderRadius: radius,
        background: 'var(--surface2)',
        animation: 'rg-pulse 1.4s ease-in-out infinite',
        ...style,
      }}
    />
  )
}

/** Tarjeta-esqueleto: la forma de una card de KPI mientras llega el dato. */
export function SkeletonCard({ lines = 2, height = 88 }: { lines?: number; height?: number }) {
  return (
    <div
      aria-hidden
      style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 16, padding: 16, minHeight: height,
        display: 'flex', flexDirection: 'column', gap: 10, justifyContent: 'center',
      }}
    >
      <Skeleton height={9} width="45%" />
      <Skeleton height={24} width="65%" />
      {Array.from({ length: Math.max(0, lines - 2) }).map((_, i) => (
        <Skeleton key={i} height={9} width="80%" />
      ))}
    </div>
  )
}

/** Grilla de esqueletos — el caso más común: N tarjetas cargando a la vez. */
export function SkeletonGrid({ count = 4, columns = 2 }: { count?: number; columns?: number }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: 10 }}>
      {Array.from({ length: count }).map((_, i) => <SkeletonCard key={i} />)}
    </div>
  )
}

// ── Empty ───────────────────────────────────────────────────────────────────

/**
 * Estado vacío. Nunca "0" a secas: qué falta, por qué, y qué hacer.
 * `action` es opcional pero recomendado — un vacío sin salida es un callejón.
 */
export function EmptyState({
  icon: Icon,
  title,
  hint,
  action,
  compact,
}: {
  icon?: LucideIcon
  title: string
  hint?: string
  action?: React.ReactNode
  compact?: boolean
}) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
      padding: compact ? '28px 20px' : '48px 24px', gap: 6,
    }}>
      {Icon && (
        <div style={{
          width: 46, height: 46, borderRadius: 14, marginBottom: 6,
          background: 'var(--surface2)', border: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon size={20} strokeWidth={1.8} color="var(--muted)" />
        </div>
      )}
      <p style={{ fontSize: 14, fontWeight: 800, color: 'var(--cream)' }}>{title}</p>
      {hint && (
        <p style={{ fontSize: 12, color: 'var(--muted)', maxWidth: 300, lineHeight: 1.5 }}>{hint}</p>
      )}
      {action && <div style={{ marginTop: 10 }}>{action}</div>}
    </div>
  )
}

// ── Error ───────────────────────────────────────────────────────────────────

/**
 * Estado de error. El usuario ve una explicación en su idioma; el detalle
 * técnico solo se despliega para quien pueda hacer algo con él (`showDetail`).
 */
export function ErrorState({
  title = 'No pudimos cargar la información',
  hint = 'Puede ser un problema de conexión. Intenta de nuevo.',
  detail,
  showDetail = false,
  onRetry,
  compact,
}: {
  title?: string
  hint?: string
  detail?: string | null
  showDetail?: boolean
  onRetry?: () => void
  compact?: boolean
}) {
  return (
    <div
      role="alert"
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
        padding: compact ? '24px 20px' : '40px 24px', gap: 6,
      }}
    >
      <div style={{
        width: 46, height: 46, borderRadius: 14, marginBottom: 6,
        background: 'rgba(248,113,113,0.10)', border: '1px solid rgba(248,113,113,0.22)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <AlertTriangle size={20} strokeWidth={2} color="var(--red)" />
      </div>
      <p style={{ fontSize: 14, fontWeight: 800, color: 'var(--cream)' }}>{title}</p>
      <p style={{ fontSize: 12, color: 'var(--muted)', maxWidth: 320, lineHeight: 1.5 }}>{hint}</p>

      {onRetry && (
        <button
          onClick={onRetry}
          style={{
            marginTop: 12, display: 'inline-flex', alignItems: 'center', gap: 7,
            minHeight: 44, padding: '0 20px', borderRadius: 100, cursor: 'pointer',
            background: 'var(--gold-dim)', border: '1px solid rgba(212,175,55,0.35)',
            color: 'var(--gold)', fontSize: 13, fontWeight: 800,
          }}
        >
          <RotateCw size={15} strokeWidth={2.4} />
          Reintentar
        </button>
      )}

      {showDetail && detail && (
        <details style={{ marginTop: 14, maxWidth: 340, width: '100%' }}>
          <summary style={{ fontSize: 11, color: 'var(--muted)', cursor: 'pointer', listStyle: 'none' }}>
            Detalle técnico
          </summary>
          <p style={{
            fontSize: 11, color: 'var(--muted)', marginTop: 8, textAlign: 'left',
            background: 'var(--surface2)', border: '1px solid var(--border)',
            borderRadius: 10, padding: '8px 10px', wordBreak: 'break-word', fontFamily: 'ui-monospace, monospace',
          }}>
            {detail}
          </p>
        </details>
      )}
    </div>
  )
}
