'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { MapPin, CheckCircle, XCircle, Clock, ChevronRight, Plus, History } from 'lucide-react'
import type { AppUser } from '@/lib/auth'

const T = '#10B981'
const T_DIM = 'rgba(16,185,129,0.10)'
const T_BORDER = 'rgba(16,185,129,0.22)'

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
        background: '#0A0A0A',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        padding: '16px 20px 14px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Link href="/" style={{ color: T, fontSize: 13, fontWeight: 600, textDecoration: 'none', opacity: 0.8 }}>← Hub</Link>
          <div style={{ width: 1, height: 14, background: 'rgba(255,255,255,0.08)' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', fontWeight: 500 }}>
          {new Date().toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short' })}
        </span>
      </div>

      <div style={{ padding: '20px 16px', maxWidth: 440, margin: '0 auto' }}>

        {/* Banner visita en progreso */}
        {visitaEnProgreso && (
          <div
            onClick={() => router.push(`/terreno/nueva-visita?retomar=${visitaEnProgreso.id}`)}
            style={{
              background: 'rgba(212,175,55,0.07)',
              border: '1px solid rgba(212,175,55,0.25)',
              borderRadius: 14, padding: '13px 16px', marginBottom: 20,
              display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer',
            }}
          >
            <div style={{
              width: 34, height: 34, borderRadius: 9, background: 'rgba(212,175,55,0.12)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <Clock size={16} color="#D4AF37" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: '#D4AF37', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 2 }}>
                Visita en progreso
              </p>
              <p style={{ fontSize: 14, color: '#F4EEDF', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {visitaEnProgreso.cliente_nombre}
              </p>
            </div>
            <ChevronRight size={16} color="rgba(212,175,55,0.6)" />
          </div>
        )}

        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 20 }}>
          {[
            { label: 'Visitas hoy', value: kpis.totalHoy, color: '#F4EEDF' },
            { label: 'Con venta', value: kpis.conVenta, color: T },
            { label: 'Sin venta', value: kpis.sinVenta, color: '#FF5555' },
          ].map(k => (
            <div key={k.label} style={{
              background: '#111', border: '1px solid rgba(255,255,255,0.05)',
              borderRadius: 12, padding: '16px 12px', textAlign: 'center',
            }}>
              <p style={{ fontSize: 30, fontWeight: 900, color: k.color, lineHeight: 1, letterSpacing: '-1.5px' }}>
                {k.value}
              </p>
              <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', marginTop: 6, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                {k.label}
              </p>
            </div>
          ))}
        </div>

        {/* CTAs */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 32 }}>
          <Link href="/terreno/nueva-visita" style={{ textDecoration: 'none' }}>
            <div style={{
              background: T, borderRadius: 14, padding: '17px 22px',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            }}>
              <Plus size={20} color="#042c1e" strokeWidth={2.8} />
              <span style={{ fontSize: 16, fontWeight: 900, color: '#042c1e', letterSpacing: '-0.3px' }}>
                Nueva Visita
              </span>
            </div>
          </Link>
          <Link href="/terreno/historial" style={{ textDecoration: 'none' }}>
            <div style={{
              background: 'transparent', border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 14, padding: '13px 22px',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}>
              <History size={16} color="rgba(255,255,255,0.4)" />
              <span style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.4)' }}>
                Ver historial
              </span>
            </div>
          </Link>
        </div>

        {/* Visitas del día */}
        {visitas.length > 0 && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.3)', letterSpacing: '1.2px', textTransform: 'uppercase' }}>
                Visitas de hoy
              </p>
              <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.04)' }} />
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)' }}>{visitas.length}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {visitas.map(v => <VisitaCard key={v.id} v={v} />)}
            </div>
          </>
        )}

        {visitas.length === 0 && (
          <div style={{ textAlign: 'center', paddingTop: 32 }}>
            <div style={{
              width: 52, height: 52, borderRadius: 14, background: T_DIM,
              border: `1px solid ${T_BORDER}`, display: 'flex', alignItems: 'center',
              justifyContent: 'center', margin: '0 auto 12px',
            }}>
              <MapPin size={22} color={T} />
            </div>
            <p style={{ fontSize: 14, fontWeight: 700, color: 'rgba(255,255,255,0.6)', marginBottom: 4 }}>Sin visitas hoy</p>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.25)' }}>Toca "Nueva Visita" para comenzar</p>
          </div>
        )}
      </div>
    </div>
  )
}

function VisitaCard({ v }: { v: Visita }) {
  const enProgreso = v.estado === 'en_progreso'
  const conVenta = v.tiene_venta === true
  const sinVenta = v.tiene_venta === false

  const accentColor = enProgreso ? '#D4AF37' : conVenta ? T : sinVenta ? '#FF5555' : 'rgba(255,255,255,0.15)'
  const iconBg = enProgreso ? 'rgba(212,175,55,0.1)' : conVenta ? T_DIM : sinVenta ? 'rgba(255,85,85,0.1)' : 'rgba(255,255,255,0.04)'

  return (
    <Link href={`/terreno/nueva-visita?retomar=${v.id}`} style={{ textDecoration: 'none' }}>
      <div style={{
        background: '#111', borderRadius: 12,
        border: `1px solid ${accentColor}`,
        padding: '13px 14px',
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <div style={{
          width: 34, height: 34, borderRadius: 9, flexShrink: 0,
          background: iconBg,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {enProgreso
            ? <Clock size={16} color="#D4AF37" />
            : conVenta
              ? <CheckCircle size={16} color={T} />
              : <XCircle size={16} color="#FF5555" />
          }
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: '#F4EEDF', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {v.cliente_nombre}
          </p>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>
            {fmtHora(v.iniciada_at)}
            {conVenta && v.total_pedido ? ` · ${fmtPeso(v.total_pedido)}` : ''}
            {sinVenta && v.motivo_sin_venta ? ` · ${v.motivo_sin_venta}` : ''}
            {enProgreso ? ' · En progreso' : ''}
          </p>
        </div>

        <ChevronRight size={15} color="rgba(255,255,255,0.2)" style={{ flexShrink: 0 }} />
      </div>
    </Link>
  )
}
