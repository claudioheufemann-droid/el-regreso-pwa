'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { MapPin, CheckCircle, XCircle, Clock, ChevronRight, Filter } from 'lucide-react'
import type { AppUser } from '@/lib/auth'
import { useIsDesktop } from '@/lib/useIsDesktop'

const T = '#D4AF37'
const T_DIM = 'rgba(212,175,55,0.12)'
const T_BORDER = 'rgba(212,175,55,0.25)'

interface Visita {
  id: string
  cliente_nombre: string
  tiene_venta: boolean | null
  motivo_sin_venta: string | null
  total_pedido: number | null
  estado: string
  iniciada_at: string
  completada_at: string | null
  vendedor_id: string
  es_cliente_nuevo: boolean
}

interface Props {
  user: AppUser
  visitas: Visita[]
  vendedores: { id: string; nombre: string }[]
}

function fmtFecha(iso: string) {
  return new Date(iso).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })
}

function fmtHora(iso: string) {
  return new Date(iso).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
}

function fmtPeso(n: number) {
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)
}

function agruparPorFecha(visitas: Visita[]) {
  const grupos: Record<string, Visita[]> = {}
  for (const v of visitas) {
    const fecha = v.iniciada_at.split('T')[0]
    if (!grupos[fecha]) grupos[fecha] = []
    grupos[fecha].push(v)
  }
  return Object.entries(grupos).sort((a, b) => b[0].localeCompare(a[0]))
}

function labelFecha(iso: string) {
  const hoy = new Date().toISOString().split('T')[0]
  const ayer = new Date(Date.now() - 86400000).toISOString().split('T')[0]
  if (iso === hoy) return 'Hoy'
  if (iso === ayer) return 'Ayer'
  return fmtFecha(iso + 'T12:00:00')
}

export default function HistorialClient({ user, visitas, vendedores }: Props) {
  const isDesktop = useIsDesktop()
  const [filtroVendedor, setFiltroVendedor] = useState<string>('todos')
  const [filtroResultado, setFiltroResultado] = useState<'todos' | 'con_venta' | 'sin_venta'>('todos')
  const [showFiltros, setShowFiltros] = useState(false)

  const filtradas = useMemo(() => {
    return visitas.filter(v => {
      if (filtroVendedor !== 'todos' && v.vendedor_id !== filtroVendedor) return false
      if (filtroResultado === 'con_venta' && v.tiene_venta !== true) return false
      if (filtroResultado === 'sin_venta' && v.tiene_venta !== false) return false
      return true
    })
  }, [visitas, filtroVendedor, filtroResultado])

  const grupos = agruparPorFecha(filtradas)

  const kpis = useMemo(() => {
    const total = filtradas.length
    const conVenta = filtradas.filter(v => v.tiene_venta === true).length
    const sinVenta = filtradas.filter(v => v.tiene_venta === false).length
    const totalFacturado = filtradas.reduce((s, v) => s + (v.total_pedido ?? 0), 0)
    return { total, conVenta, sinVenta, totalFacturado }
  }, [filtradas])

  const hayFiltros = filtroVendedor !== 'todos' || filtroResultado !== 'todos'

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', paddingBottom: 80 }}>

      {/* Título de página */}
      <div style={{
        padding: isDesktop ? '32px 28px 20px' : '16px 14px 14px',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <h1 style={{ fontSize: isDesktop ? 22 : 18, fontWeight: 900, color: 'var(--cream)', letterSpacing: '-0.5px' }}>
          Historial
        </h1>
        <button
          onClick={() => setShowFiltros(f => !f)}
          style={{
            background: hayFiltros ? T_DIM : 'transparent',
            border: `1px solid ${hayFiltros ? T_BORDER : 'rgba(255,255,255,0.1)'}`,
            borderRadius: 8, padding: '6px 10px', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 6, color: hayFiltros ? T : 'var(--muted)',
          }}
        >
          <Filter size={14} />
          <span style={{ fontSize: 12, fontWeight: 600 }}>Filtros{hayFiltros ? ' •' : ''}</span>
        </button>
      </div>

      {/* Panel de filtros */}
      {showFiltros && (
        <div style={{
          background: 'var(--surface2)', borderBottom: '1px solid rgba(255,255,255,0.06)',
          padding: isDesktop ? '14px 28px' : '12px 14px', display: 'flex', flexDirection: 'column', gap: 12,
        }}>
          {user.isAdmin && (
            <div>
              <p style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 6 }}>Vendedor</p>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <FiltroChip label="Todos" active={filtroVendedor === 'todos'} onClick={() => setFiltroVendedor('todos')} />
                {vendedores.map(v => (
                  <FiltroChip key={v.id} label={v.nombre.split(' ')[0]} active={filtroVendedor === v.id} onClick={() => setFiltroVendedor(v.id)} />
                ))}
              </div>
            </div>
          )}
          <div>
            <p style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 6 }}>Resultado</p>
            <div style={{ display: 'flex', gap: 6 }}>
              <FiltroChip label="Todos" active={filtroResultado === 'todos'} onClick={() => setFiltroResultado('todos')} />
              <FiltroChip label="Con venta" active={filtroResultado === 'con_venta'} onClick={() => setFiltroResultado('con_venta')} color={T} />
              <FiltroChip label="Sin venta" active={filtroResultado === 'sin_venta'} onClick={() => setFiltroResultado('sin_venta')} color="#FF4D4D" />
            </div>
          </div>
        </div>
      )}

      <div style={{ padding: isDesktop ? '20px 28px' : '14px 14px', maxWidth: 700 }}>

        {/* KPIs resumen */}
        <div style={{ display: 'grid', gridTemplateColumns: isDesktop ? 'repeat(4,1fr)' : 'repeat(2,1fr)', gap: 8, marginBottom: isDesktop ? 20 : 14 }}>
          {[
            { label: 'Visitas', value: kpis.total, color: '#F4EEDF' },
            { label: 'Con venta', value: kpis.conVenta, color: T },
            { label: 'Sin venta', value: kpis.sinVenta, color: '#FF4D4D' },
          ].map(k => (
            <div key={k.label} style={{
              background: '#131313', border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 12, padding: '12px 8px', textAlign: 'center',
            }}>
              <p style={{ fontSize: 24, fontWeight: 900, color: k.color, lineHeight: 1, letterSpacing: '-1px' }}>{k.value}</p>
              <p style={{ fontSize: 9, color: 'var(--muted)', marginTop: 3, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.6px' }}>{k.label}</p>
            </div>
          ))}
          <div style={{
            background: '#131313', border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: 12, padding: '12px 8px', textAlign: 'center',
          }}>
            <p style={{ fontSize: 14, fontWeight: 900, color: '#D4AF37', lineHeight: 1.2, letterSpacing: '-0.5px' }}>
              {kpis.totalFacturado > 0 ? new Intl.NumberFormat('es-CL', { notation: 'compact', currency: 'CLP', style: 'currency', maximumFractionDigits: 0 }).format(kpis.totalFacturado) : '—'}
            </p>
            <p style={{ fontSize: 9, color: 'var(--muted)', marginTop: 3, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.6px' }}>Facturado</p>
          </div>
        </div>

        {/* Lista agrupada por fecha */}
        {grupos.length === 0 ? (
          <div style={{ textAlign: 'center', paddingTop: 40 }}>
            <div style={{
              width: 56, height: 56, borderRadius: 16, background: T_DIM,
              border: `1px solid ${T_BORDER}`, display: 'flex', alignItems: 'center',
              justifyContent: 'center', margin: '0 auto 14px',
            }}>
              <MapPin size={24} color={T} />
            </div>
            <p style={{ fontSize: 15, fontWeight: 700, color: '#F4EEDF', marginBottom: 6 }}>Sin visitas</p>
            <p style={{ fontSize: 13, color: 'var(--muted)' }}>No hay visitas con los filtros actuales</p>
          </div>
        ) : (
          grupos.map(([fecha, lista]) => (
            <div key={fecha} style={{ marginBottom: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', letterSpacing: '1px', textTransform: 'uppercase' }}>
                  {labelFecha(fecha)}
                </p>
                <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.05)' }} />
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>{lista.length} visita{lista.length !== 1 ? 's' : ''}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {lista.map(v => (
                  <VisitaRow key={v.id} v={v} showVendedor={user.isAdmin} vendedores={vendedores} />
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function FiltroChip({ label, active, onClick, color }: { label: string; active: boolean; onClick: () => void; color?: string }) {
  const c = color ?? T
  return (
    <button
      onClick={onClick}
      style={{
        padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer',
        background: active ? (color ? `${color}20` : T_DIM) : 'transparent',
        border: `1px solid ${active ? (color ?? T_BORDER) : 'rgba(255,255,255,0.1)'}`,
        color: active ? (color ?? T) : 'var(--muted)',
      }}
    >
      {label}
    </button>
  )
}

function VisitaRow({ v, showVendedor, vendedores }: { v: Visita; showVendedor: boolean; vendedores: { id: string; nombre: string }[] }) {
  const enProgreso = v.estado === 'en_progreso'
  const borderColor = enProgreso ? '#D4AF37'
    : v.tiene_venta === true ? T
    : v.tiene_venta === false ? '#FF4D4D'
    : 'rgba(255,255,255,0.08)'

  const vendedorNombre = showVendedor
    ? vendedores.find(u => u.id === v.vendedor_id)?.nombre ?? '—'
    : null

  return (
    <Link href={`/terreno/nueva-visita?retomar=${v.id}`} style={{ textDecoration: 'none' }}>
      <div style={{
        background: '#131313', borderRadius: 14,
        border: `1px solid ${borderColor}`,
        padding: '14px 16px',
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
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

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: '#F4EEDF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {v.cliente_nombre}
            </p>
            {v.es_cliente_nuevo && (
              <span style={{ fontSize: 9, fontWeight: 700, color: T, background: T_DIM, padding: '2px 6px', borderRadius: 4, flexShrink: 0 }}>
                NUEVO
              </span>
            )}
          </div>
          <p style={{ fontSize: 12, color: 'var(--muted)' }}>
            {fmtHora(v.iniciada_at)}
            {v.tiene_venta && v.total_pedido ? ` · ${fmtPeso(v.total_pedido)}` : ''}
            {v.tiene_venta === false && v.motivo_sin_venta ? ` · ${v.motivo_sin_venta}` : ''}
            {enProgreso ? ' · En progreso' : ''}
            {showVendedor && vendedorNombre ? ` · ${vendedorNombre.split(' ')[0]}` : ''}
          </p>
        </div>

        <ChevronRight size={16} color="var(--muted)" style={{ flexShrink: 0 }} />
      </div>
    </Link>
  )
}
