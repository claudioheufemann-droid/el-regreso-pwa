'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CheckCircle, XCircle, Clock, ChevronRight } from 'lucide-react'
import type { AppUser } from '@/lib/auth'

const G = '#D4AF37'
const G_DIM = 'rgba(212,175,55,0.10)'
const G_BORDER = 'rgba(212,175,55,0.22)'

interface Visita {
  id: string
  cliente_nombre: string
  tiene_venta: boolean | null
  motivo_sin_venta: string | null
  total_pedido: number | null
  estado: string
  iniciada_at: string
  completada_at: string | null
}

interface Props {
  vendedor: AppUser
  visitas: Visita[]
  kpis: { totalHoy: number; conVenta: number; sinVenta: number }
  visitaEnProgreso: Visita | null
}

function fmtHora(iso: string) {
  return new Date(iso).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
}

function fmtPeso(n: number) {
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)
}

export default function TerrenoHubClient({ vendedor, visitas, kpis, visitaEnProgreso }: Props) {
  const router = useRouter()

  return (
    <div style={{ padding: '32px 28px', maxWidth: 600 }}>

      {/* Título de página */}
      <div style={{ marginBottom: 28 }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', letterSpacing: '1.2px', textTransform: 'uppercase', marginBottom: 4 }}>
          {new Date().toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
        <h1 style={{ fontSize: 26, fontWeight: 900, color: 'var(--cream)', letterSpacing: '-0.5px', lineHeight: 1 }}>
          Hola, {vendedor.nombre?.split(' ')[0]}.
        </h1>
      </div>

      {/* Banner visita en progreso */}
      {visitaEnProgreso && (
        <div
          onClick={() => router.push(`/terreno/nueva-visita?retomar=${visitaEnProgreso.id}`)}
          style={{
            background: 'rgba(212,175,55,0.07)', border: `1px solid ${G_BORDER}`,
            borderRadius: 14, padding: '13px 16px', marginBottom: 24,
            display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer',
          }}
        >
          <div style={{
            width: 34, height: 34, borderRadius: 9, background: G_DIM,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <Clock size={16} color={G} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: G, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 2 }}>
              Visita en progreso
            </p>
            <p style={{ fontSize: 14, color: 'var(--cream)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {visitaEnProgreso.cliente_nombre}
            </p>
          </div>
          <ChevronRight size={16} color={G_BORDER} />
        </div>
      )}

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 28 }}>
        {[
          { label: 'Visitas hoy',  value: kpis.totalHoy,  color: 'var(--cream)' },
          { label: 'Con venta',    value: kpis.conVenta,  color: G },
          { label: 'Sin venta',    value: kpis.sinVenta,  color: '#FF5555' },
        ].map(k => (
          <div key={k.label} style={{
            background: 'var(--surface2)', border: '1px solid rgba(255,255,255,0.05)',
            borderRadius: 12, padding: '18px 14px', textAlign: 'center',
          }}>
            <p style={{ fontSize: 32, fontWeight: 900, color: k.color, lineHeight: 1, letterSpacing: '-1.5px' }}>
              {k.value}
            </p>
            <p style={{ fontSize: 9, color: 'var(--muted)', marginTop: 6, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px' }}>
              {k.label}
            </p>
          </div>
        ))}
      </div>

      {/* Visitas del día */}
      {visitas.length > 0 && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', letterSpacing: '1.2px', textTransform: 'uppercase' }}>
              Visitas de hoy
            </p>
            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.04)' }} />
            <span style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600 }}>{visitas.length}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {visitas.map(v => <VisitaCard key={v.id} v={v} />)}
          </div>
        </>
      )}

      {visitas.length === 0 && (
        <div style={{
          background: 'var(--surface2)', border: '1px solid rgba(255,255,255,0.04)',
          borderRadius: 14, padding: '40px 24px', textAlign: 'center',
        }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>
            Sin visitas hoy
          </p>
          <p style={{ fontSize: 12, color: 'var(--muted)' }}>
            Usa el botón <strong style={{ color: G }}>Nueva Visita</strong> del menú lateral para comenzar
          </p>
        </div>
      )}
    </div>
  )
}

function VisitaCard({ v }: { v: Visita }) {
  const enProgreso = v.estado === 'en_progreso'
  const conVenta = v.tiene_venta === true
  const sinVenta = v.tiene_venta === false

  const accentColor = enProgreso ? G : conVenta ? '#4ADE80' : sinVenta ? '#FF5555' : 'rgba(255,255,255,0.08)'
  const iconBg = enProgreso ? G_DIM : conVenta ? 'rgba(74,222,128,0.1)' : sinVenta ? 'rgba(255,85,85,0.1)' : 'rgba(255,255,255,0.04)'
  const iconColor = enProgreso ? G : conVenta ? '#4ADE80' : '#FF5555'

  return (
    <Link href={`/terreno/nueva-visita?retomar=${v.id}`} style={{ textDecoration: 'none' }}>
      <div style={{
        background: 'var(--surface2)', borderRadius: 12,
        border: `1px solid ${accentColor}`,
        padding: '12px 14px',
        display: 'flex', alignItems: 'center', gap: 12,
        transition: 'background 0.1s',
      }}>
        <div style={{
          width: 34, height: 34, borderRadius: 9, flexShrink: 0, background: iconBg,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {enProgreso
            ? <Clock size={16} color={G} />
            : conVenta
              ? <CheckCircle size={16} color="#4ADE80" />
              : <XCircle size={16} color="#FF5555" />
          }
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--cream)', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {v.cliente_nombre}
          </p>
          <p style={{ fontSize: 11, color: 'var(--muted)' }}>
            {fmtHora(v.iniciada_at)}
            {conVenta && v.total_pedido ? ` · ${fmtPeso(v.total_pedido)}` : ''}
            {sinVenta && v.motivo_sin_venta ? ` · ${v.motivo_sin_venta}` : ''}
            {enProgreso ? ' · En progreso' : ''}
          </p>
        </div>

        <ChevronRight size={15} color="var(--muted)" style={{ flexShrink: 0 }} />
      </div>
    </Link>
  )
}
