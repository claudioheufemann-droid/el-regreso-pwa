'use client'

import Link from 'next/link'
import { Truck, Plus, AlertTriangle, CheckCircle, Clock, ChevronRight, Wrench } from 'lucide-react'
import type { AppUser } from '@/lib/auth'

const F = '#3B82F6'
const F_DIM = 'rgba(59,130,246,0.12)'
const F_BORDER = 'rgba(59,130,246,0.28)'

interface Vehiculo {
  id: string; nombre: string; tipo: string; patente: string | null
  anio: number | null; km_actual: number; estado: string
}
interface ViajeActivo {
  id: string; vehiculo_id: string; tipo: string; motivo: string | null
  km_inicio: number | null; iniciado_at: string; conductor_id: string | null
}

interface Props {
  user: AppUser
  vehiculos: Vehiculo[]
  viajesActivos: ViajeActivo[]
  conductores: { id: string; nombre: string }[]
}

const TIPO_LABEL: Record<string, string> = { camioneta: 'Camioneta', furgon: 'Furgón', camion_34: 'Camión 3/4' }

function tiempoTranscurrido(iso: string) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 60) return `${mins}m`
  return `${Math.floor(mins / 60)}h ${mins % 60}m`
}

function EstadoChip({ estado }: { estado: string }) {
  const cfg = {
    disponible:    { color: '#4ADE80', bg: 'rgba(74,222,128,0.1)',  label: 'Disponible',    icon: CheckCircle },
    en_uso:        { color: '#F59E0B', bg: 'rgba(245,158,11,0.1)',  label: 'En uso',        icon: Clock },
    mantenimiento: { color: '#FF5555', bg: 'rgba(255,85,85,0.1)',   label: 'Mantención',    icon: Wrench },
  }[estado] ?? { color: 'var(--muted)', bg: 'rgba(255,255,255,0.05)', label: estado, icon: AlertTriangle }

  const Icon = cfg.icon
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 20, background: cfg.bg }}>
      <Icon size={12} color={cfg.color} />
      <span style={{ fontSize: 11, fontWeight: 700, color: cfg.color }}>{cfg.label}</span>
    </div>
  )
}

export default function FlotaHubClient({ user, vehiculos, viajesActivos, conductores }: Props) {
  const disponibles = vehiculos.filter(v => v.estado === 'disponible').length
  const enUso = vehiculos.filter(v => v.estado === 'en_uso').length

  return (
    <div style={{ padding: '28px 24px', maxWidth: 800 }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', letterSpacing: '1.2px', textTransform: 'uppercase', marginBottom: 4 }}>
          {new Date().toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
        <h1 style={{ fontSize: 26, fontWeight: 900, color: 'var(--cream)', letterSpacing: '-0.5px', marginBottom: 0 }}>
          Bitácora de Flota
        </h1>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 28 }}>
        {[
          { label: 'Vehículos',   value: vehiculos.length, color: 'var(--cream)' },
          { label: 'Disponibles', value: disponibles,      color: '#4ADE80' },
          { label: 'En uso',      value: enUso,            color: '#F59E0B' },
        ].map(k => (
          <div key={k.label} style={{ background: 'var(--surface2)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 12, padding: '16px 14px', textAlign: 'center' }}>
            <p style={{ fontSize: 30, fontWeight: 900, color: k.color, lineHeight: 1, letterSpacing: '-1.5px' }}>{k.value}</p>
            <p style={{ fontSize: 9, color: 'var(--muted)', marginTop: 6, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px' }}>{k.label}</p>
          </div>
        ))}
      </div>

      {/* CTA nueva salida */}
      <Link href="/flota/checkin" style={{ textDecoration: 'none' }}>
        <div style={{ background: F_DIM, border: `1px solid ${F_BORDER}`, borderRadius: 14, padding: '14px 18px', marginBottom: 28, display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(59,130,246,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Plus size={18} color={F} />
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 14, fontWeight: 800, color: '#F4EEDF' }}>Registrar salida</p>
            <p style={{ fontSize: 11, color: 'var(--muted)' }}>Tomar llaves · Check-in obligatorio</p>
          </div>
          <ChevronRight size={16} color={F} />
        </div>
      </Link>

      {/* Grid vehículos */}
      <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 12 }}>
        Estado de la flota
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {vehiculos.map(v => {
          const viaje = viajesActivos.find(va => va.vehiculo_id === v.id)
          const conductor = conductores.find(c => c.id === viaje?.conductor_id)
          return (
            <div key={v.id} style={{ background: 'var(--surface2)', border: `1px solid ${v.estado === 'en_uso' ? 'rgba(245,158,11,0.3)' : v.estado === 'mantenimiento' ? 'rgba(255,85,85,0.2)' : 'rgba(255,255,255,0.06)'}`, borderRadius: 14, padding: '14px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 42, height: 42, borderRadius: 11, flexShrink: 0, background: F_DIM, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Truck size={20} color={F} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                    <p style={{ fontSize: 15, fontWeight: 800, color: '#F4EEDF' }}>{v.nombre}</p>
                    {v.patente && <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', background: 'rgba(255,255,255,0.06)', padding: '2px 7px', borderRadius: 5 }}>{v.patente}</span>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>{TIPO_LABEL[v.tipo] ?? v.tipo}</span>
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>· {v.km_actual.toLocaleString('es-CL')} km</span>
                  </div>
                  {viaje && (
                    <p style={{ fontSize: 11, color: '#F59E0B', marginTop: 4 }}>
                      {conductor?.nombre?.split(' ')[0] ?? 'En uso'} · {viaje.tipo === 'reparto' ? 'Reparto' : 'Trámite'} · {tiempoTranscurrido(viaje.iniciado_at)}
                    </p>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
                  <EstadoChip estado={v.estado} />
                  {viaje && (
                    <Link href={`/flota/checkout/${viaje.id}`} style={{ fontSize: 11, fontWeight: 700, color: F, textDecoration: 'none', background: F_DIM, padding: '4px 10px', borderRadius: 8 }}>
                      Cerrar viaje
                    </Link>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
