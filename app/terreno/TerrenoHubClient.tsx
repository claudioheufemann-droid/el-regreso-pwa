'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { MapPin, CheckCircle, XCircle, Clock, ChevronRight, Plus } from 'lucide-react'
import type { AppUser } from '@/lib/auth'

const T = '#10B981' // accent terreno
const T_DIM = 'rgba(16,185,129,0.12)'
const T_BORDER = 'rgba(16,185,129,0.25)'

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
    <div style={{ minHeight: '100vh', background: '#080808', paddingBottom: 80 }}>

      {/* Header */}
      <div style={{
        background: '#0F0F0F', borderBottom: '1px solid rgba(16,185,129,0.15)',
        padding: '16px 20px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Link href="/" style={{ color: T, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>← Hub</Link>
          <div style={{ width: 1, height: 14, background: 'rgba(255,255,255,0.1)' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <div style={{
              width: 28, height: 28, borderRadius: 8, background: T_DIM,
              border: `1px solid ${T_BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <MapPin size={14} color={T} />
            </div>
            <span style={{ fontSize: 16, fontWeight: 800, color: '#F4EEDF', letterSpacing: '-0.3px' }}>
              Terreno
            </span>
          </div>
        </div>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>
          {new Date().toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short' })}
        </span>
      </div>

      <div style={{ padding: '20px 16px', maxWidth: 480, margin: '0 auto' }}>

        {/* Visita en progreso — banner de alerta */}
        {visitaEnProgreso && (
          <div
            onClick={() => router.push(`/terreno/nueva-visita?retomar=${visitaEnProgreso.id}`)}
            style={{
              background: 'rgba(212,175,55,0.08)', border: '1px solid rgba(212,175,55,0.3)',
              borderRadius: 16, padding: '14px 16px', marginBottom: 16,
              display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer',
            }}
          >
            <div style={{
              width: 36, height: 36, borderRadius: 10, background: 'rgba(212,175,55,0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <Clock size={18} color="#D4AF37" />
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: '#D4AF37', marginBottom: 2 }}>
                VISITA EN PROGRESO
              </p>
              <p style={{ fontSize: 14, color: '#F4EEDF', fontWeight: 600 }}>
                {visitaEnProgreso.cliente_nombre}
              </p>
            </div>
            <ChevronRight size={18} color="#D4AF37" />
          </div>
        )}

        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 20 }}>
          {[
            { label: 'Visitas', value: kpis.totalHoy, color: '#F4EEDF' },
            { label: 'Con venta', value: kpis.conVenta, color: T },
            { label: 'Sin venta', value: kpis.sinVenta, color: '#FF4D4D' },
          ].map(k => (
            <div key={k.label} style={{
              background: '#131313', border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 14, padding: '14px 12px', textAlign: 'center',
            }}>
              <p style={{ fontSize: 28, fontWeight: 900, color: k.color, lineHeight: 1, letterSpacing: '-1px' }}>
                {k.value}
              </p>
              <p style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                {k.label}
              </p>
            </div>
          ))}
        </div>

        {/* CTA Nueva Visita */}
        <Link href="/terreno/nueva-visita" style={{ textDecoration: 'none', display: 'block', marginBottom: 28 }}>
          <div style={{
            background: T, borderRadius: 16, padding: '18px 20px',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          }}>
            <Plus size={20} color="#080808" strokeWidth={2.5} />
            <span style={{ fontSize: 16, fontWeight: 900, color: '#080808', letterSpacing: '-0.3px' }}>
              Nueva Visita
            </span>
          </div>
        </Link>

        {/* Lista de visitas del día */}
        {visitas.length > 0 && (
          <>
            <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', letterSpacing: '1.2px', textTransform: 'uppercase', marginBottom: 10 }}>
              Visitas de hoy
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {visitas.map(v => (
                <VisitaCard key={v.id} v={v} />
              ))}
            </div>
          </>
        )}

        {visitas.length === 0 && (
          <div style={{ textAlign: 'center', paddingTop: 40 }}>
            <div style={{
              width: 56, height: 56, borderRadius: 16, background: T_DIM,
              border: `1px solid ${T_BORDER}`, display: 'flex', alignItems: 'center',
              justifyContent: 'center', margin: '0 auto 14px',
            }}>
              <MapPin size={24} color={T} />
            </div>
            <p style={{ fontSize: 15, fontWeight: 700, color: '#F4EEDF', marginBottom: 6 }}>Sin visitas hoy</p>
            <p style={{ fontSize: 13, color: 'var(--muted)' }}>Toca "Nueva Visita" para comenzar</p>
          </div>
        )}
      </div>
    </div>
  )
}

function VisitaCard({ v }: { v: Visita }) {
  const completada = v.estado === 'completada'
  const enProgreso = v.estado === 'en_progreso'

  const borderColor = enProgreso ? '#D4AF37'
    : v.tiene_venta === true ? T
    : v.tiene_venta === false ? '#FF4D4D'
    : 'rgba(255,255,255,0.08)'

  return (
    <Link href={`/terreno/nueva-visita?retomar=${v.id}`} style={{ textDecoration: 'none' }}>
      <div style={{
        background: '#131313', borderRadius: 14,
        border: `1px solid ${borderColor}`,
        padding: '14px 16px',
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        {/* Ícono estado */}
        <div style={{
          width: 36, height: 36, borderRadius: 10, flexShrink: 0,
          background: enProgreso ? 'rgba(212,175,55,0.1)' : v.tiene_venta ? T_DIM : 'rgba(255,77,77,0.1)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {enProgreso
            ? <Clock size={18} color="#D4AF37" />
            : v.tiene_venta
              ? <CheckCircle size={18} color={T} />
              : <XCircle size={18} color="#FF4D4D" />
          }
        </div>

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: '#F4EEDF', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {v.cliente_nombre}
          </p>
          <p style={{ fontSize: 12, color: 'var(--muted)' }}>
            {fmtHora(v.iniciada_at)}
            {v.tiene_venta && v.total_pedido ? ` · ${fmtPeso(v.total_pedido)}` : ''}
            {v.tiene_venta === false && v.motivo_sin_venta ? ` · ${v.motivo_sin_venta}` : ''}
            {enProgreso ? ' · En progreso' : ''}
          </p>
        </div>

        <ChevronRight size={16} color="var(--muted)" style={{ flexShrink: 0 }} />
      </div>
    </Link>
  )
}
