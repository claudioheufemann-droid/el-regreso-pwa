'use client'

/**
 * Actividad — línea de tiempo unificada de todo lo que pasa en la app:
 * visitas en terreno, ventas cargadas, misiones cerradas y (solo admin)
 * viajes de flota. Vendedor ve su región automáticamente (RLS); admin ve todo.
 */
import { useState, useMemo } from 'react'
import { MapPin, Target, Truck, XCircle, CheckCircle2, Upload } from 'lucide-react'
import AppHeader from '@/components/ui/AppHeader'
import type { EventoActividad } from './page'

type Tipo = EventoActividad['tipo']

const TIPO_CFG: Record<Tipo, { color: string; icon: typeof MapPin; label: string }> = {
  visita: { color: '#D4AF37', icon: MapPin,      label: 'Visitas'  },
  venta:  { color: '#4ADE80', icon: Upload,       label: 'Ventas'   },
  mision: { color: '#60A5FA', icon: Target,       label: 'Misiones' },
  viaje:  { color: '#F97316', icon: Truck,        label: 'Viajes'   },
}

function fmtPeso(n: number) {
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)
}

function fmtHora(iso: string) {
  return new Date(iso).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
}

function labelFecha(iso: string) {
  const hoy  = new Date().toISOString().split('T')[0]
  const ayer = new Date(Date.now() - 86400000).toISOString().split('T')[0]
  const d = iso.split('T')[0]
  if (d === hoy)  return 'Hoy'
  if (d === ayer) return 'Ayer'
  return new Date(iso).toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })
}

function agruparPorDia(eventos: EventoActividad[]) {
  const g = new Map<string, EventoActividad[]>()
  for (const e of eventos) {
    const dia = e.ts.split('T')[0]
    if (!g.has(dia)) g.set(dia, [])
    g.get(dia)!.push(e)
  }
  return [...g.entries()].sort((a, b) => b[0].localeCompare(a[0]))
}

function IconoEvento({ tipo, estado }: { tipo: Tipo; estado: string }) {
  const cfg = TIPO_CFG[tipo]
  const Icon = estado === 'cancelada' ? XCircle : tipo === 'visita' && estado === 'completada' ? CheckCircle2 : cfg.icon
  return (
    <div style={{
      width: 34, height: 34, borderRadius: 10, flexShrink: 0,
      background: `${cfg.color}15`, border: `1px solid ${cfg.color}30`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <Icon size={15} color={estado === 'cancelada' ? '#F87171' : cfg.color} />
    </div>
  )
}

export default function ActividadClient({ eventos, isAdmin }: { eventos: EventoActividad[]; isAdmin: boolean }) {
  const [filtro, setFiltro] = useState<Tipo | 'todos'>('todos')

  const tiposPresentes = useMemo(() => {
    const set = new Set(eventos.map(e => e.tipo))
    return (Object.keys(TIPO_CFG) as Tipo[]).filter(t => set.has(t))
  }, [eventos])

  const filtrados = filtro === 'todos' ? eventos : eventos.filter(e => e.tipo === filtro)
  const grupos = agruparPorDia(filtrados)

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', paddingBottom: 100 }}>
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '0 16px' }}>
        <div style={{ paddingTop: 'max(16px, env(safe-area-inset-top, 16px))' }}>
          <AppHeader eyebrow={isAdmin ? 'Todas las regiones' : 'Tu región'} title="Actividad" />
        </div>

        {/* Filtros por tipo */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 16, overflowX: 'auto', scrollbarWidth: 'none' }}>
          <button onClick={() => setFiltro('todos')} style={{
            flexShrink: 0, minHeight: 36, padding: '0 14px', borderRadius: 20, cursor: 'pointer',
            background: filtro === 'todos' ? 'var(--gold)' : 'var(--surface)',
            border: `1px solid ${filtro === 'todos' ? 'var(--gold)' : 'var(--border)'}`,
            color: filtro === 'todos' ? '#080808' : 'var(--muted)', fontSize: 12, fontWeight: 700,
          }}>Todos</button>
          {tiposPresentes.map(t => {
            const cfg = TIPO_CFG[t]
            const Icon = cfg.icon
            const activo = filtro === t
            return (
              <button key={t} onClick={() => setFiltro(t)} style={{
                flexShrink: 0, minHeight: 36, padding: '0 14px', borderRadius: 20, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6,
                background: activo ? cfg.color : 'var(--surface)',
                border: `1px solid ${activo ? cfg.color : 'var(--border)'}`,
                color: activo ? '#080808' : 'var(--muted)', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap',
              }}>
                <Icon size={12} /> {cfg.label}
              </button>
            )
          })}
        </div>

        {grupos.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 0' }}>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)' }}>Sin actividad en los últimos 14 días</p>
          </div>
        ) : (
          grupos.map(([dia, items]) => (
            <div key={dia} style={{ marginBottom: 18 }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.6px', textTransform: 'uppercase', marginBottom: 8 }}>
                {labelFecha(dia)} · {items.length}
              </p>
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
                {items.map((e, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px',
                    borderTop: i > 0 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                  }}>
                    <IconoEvento tipo={e.tipo} estado={e.estado} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--cream)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {e.titulo}
                      </p>
                      <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {e.subtitulo}
                      </p>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      {e.monto != null && e.monto > 0 && (
                        <p style={{ fontSize: 12, fontWeight: 800, color: TIPO_CFG[e.tipo].color, marginBottom: 1 }}>{fmtPeso(e.monto)}</p>
                      )}
                      <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>{fmtHora(e.ts)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
