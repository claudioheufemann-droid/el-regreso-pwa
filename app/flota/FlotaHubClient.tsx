'use client'

import Link from 'next/link'
import { Truck, Plus, AlertTriangle, CheckCircle, Clock, ChevronRight, Wrench } from 'lucide-react'
import { useIsDesktop } from '@/lib/useIsDesktop'
import type { AppUser } from '@/lib/auth'

const F = '#F97316'
const F_DIM = 'rgba(249,115,22,0.12)'
const F_BORDER = 'rgba(249,115,22,0.28)'

const NIVELES_COMB = [
  { value: 'lleno',        fill: 6, color: '#4ADE80' },
  { value: 'tres_cuartos', fill: 5, color: '#86EFAC' },
  { value: 'medio',        fill: 4, color: '#FBBF24' },
  { value: 'cuarto',       fill: 2, color: '#F97316' },
  { value: 'reserva',      fill: 1, color: '#EF4444' },
  { value: 'vacio',        fill: 0, color: '#6B0000' },
]

function CombustibleMini({ nivel }: { nivel: string | null }) {
  const n = NIVELES_COMB.find(x => x.value === nivel) ?? NIVELES_COMB[2]
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <div style={{ display: 'flex', gap: 1.5, alignItems: 'flex-end', height: 14 }}>
        {[1,2,3,4,5,6].map(bar => (
          <div key={bar} style={{ width: 4, height: 2 + bar * 1.8, borderRadius: 1, background: bar <= n.fill ? n.color : 'rgba(255,255,255,0.12)' }} />
        ))}
      </div>
      <span style={{ fontSize: 10, color: n.color, fontWeight: 700 }}>{nivel === 'lleno' ? 'Lleno' : nivel === 'tres_cuartos' ? '3/4' : nivel === 'medio' ? '1/2' : nivel === 'cuarto' ? '1/4' : nivel === 'reserva' ? 'Reserva' : nivel === 'vacio' ? 'Vacío' : '—'}</span>
    </div>
  )
}

interface Vehiculo {
  id: string; nombre: string; tipo: string; patente: string | null
  anio: number | null; km_actual: number; estado: string
  marca: string | null; modelo: string | null; color: string | null
  combustible: string | null
}
interface ViajeActivo {
  id: string; vehiculo_id: string; tipo: string; motivo: string | null
  km_inicio: number | null; iniciado_at: string; conductor_id: string | null
  destino_declarado: string | null; llegada_confirmada_at: string | null
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
  const isDesktop = useIsDesktop()
  const disponibles = vehiculos.filter(v => v.estado === 'disponible').length
  const enUso = vehiculos.filter(v => v.estado === 'en_uso').length

  return (
    <div style={{ padding: isDesktop ? 'var(--sp-3)' : '16px 14px', maxWidth: 800, margin: '0 auto', width: '100%' }}>
      {/* Header */}
      <div style={{ marginBottom: isDesktop ? 28 : 16 }}>
        <p style={{ fontSize: isDesktop ? 11 : 9, fontWeight: 700, color: 'var(--muted)', letterSpacing: '1.2px', textTransform: 'uppercase', marginBottom: isDesktop ? 4 : 3 }}>
          {new Date().toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
        <h1 style={{ fontSize: isDesktop ? 'var(--fs-title)' : 20, fontWeight: 900, color: 'var(--cream)', letterSpacing: '-0.5px', marginBottom: 0 }}>
          Bitácora de Flota
        </h1>
      </div>

      {/* KPIs */}
      <div className="kpi-grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: isDesktop ? 10 : 8, marginBottom: isDesktop ? 28 : 16 }}>
        {[
          { label: 'Vehículos',   value: vehiculos.length, color: 'var(--cream)' },
          { label: 'Disponibles', value: disponibles,      color: '#4ADE80' },
          { label: 'En uso',      value: enUso,            color: '#F59E0B' },
        ].map(k => (
          <div key={k.label} style={{ background: 'var(--surface2)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 12, padding: isDesktop ? '16px 14px' : '18px 10px', textAlign: 'center' }}>
            <p style={{ fontSize: isDesktop ? 30 : 38, fontWeight: 900, color: k.color, lineHeight: 1, letterSpacing: '-1.5px' }}>{k.value}</p>
            <p style={{ fontSize: 9, color: 'var(--muted)', marginTop: 6, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px' }}>{k.label}</p>
          </div>
        ))}
      </div>

      {/* CTA nueva salida */}
      <Link href="/flota/checkin" style={{ textDecoration: 'none' }}>
        <div style={{ background: F_DIM, border: `1px solid ${F_BORDER}`, borderRadius: 14, padding: isDesktop ? '14px 18px' : '12px 14px', marginBottom: isDesktop ? 28 : 16, display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(249,115,22,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
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
                  <p style={{ fontSize: 15, fontWeight: 800, color: '#F4EEDF', marginBottom: 2 }}>{v.nombre}</p>
                  {v.modelo && (
                    <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>{v.modelo}{v.color ? ` · ${v.color}` : ''}</p>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                    {v.patente && (
                      <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 7, padding: '4px 10px', display: 'inline-flex', flexDirection: 'column', alignItems: 'center' }}>
                        <span style={{ fontSize: 8, fontWeight: 700, color: 'var(--muted)', letterSpacing: '1px', textTransform: 'uppercase' }}>Patente</span>
                        <span style={{ fontSize: 14, fontWeight: 900, color: '#F4EEDF', letterSpacing: '1.5px' }}>{v.patente}</span>
                      </div>
                    )}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ fontSize: 10, color: 'var(--muted)' }}>{v.anio ?? ''} · {TIPO_LABEL[v.tipo] ?? v.tipo}</span>
                      <span style={{ fontSize: 10, color: 'var(--muted)' }}>{v.km_actual.toLocaleString('es-CL')} km</span>
                    </div>
                  </div>
                  <CombustibleMini nivel={v.combustible} />
                  {viaje && (
                    <div style={{ marginTop: 4 }}>
                      <p style={{ fontSize: 11, color: '#F59E0B' }}>
                        {conductor?.nombre?.split(' ')[0] ?? 'En uso'} · {viaje.tipo === 'reparto' ? 'Reparto' : 'Trámite'} · {tiempoTranscurrido(viaje.iniciado_at)}
                      </p>
                      {viaje.tipo === 'tramite' && viaje.destino_declarado && (
                        <p style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>
                          📍 {viaje.destino_declarado}
                          {viaje.llegada_confirmada_at && <span style={{ color: '#4ADE80', marginLeft: 6 }}>✓ Llegada confirmada</span>}
                        </p>
                      )}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
                  <EstadoChip estado={v.estado} />
                  {viaje && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                      {viaje.tipo === 'tramite' && !viaje.llegada_confirmada_at && (
                        <Link href={`/flota/llegada/${viaje.id}`} style={{ fontSize: 11, fontWeight: 700, color: '#4ADE80', textDecoration: 'none', background: 'rgba(74,222,128,0.1)', padding: '4px 10px', borderRadius: 8, border: '1px solid rgba(74,222,128,0.25)' }}>
                          📍 Confirmar llegada
                        </Link>
                      )}
                      <Link href={`/flota/checkout/${viaje.id}`} style={{ fontSize: 11, fontWeight: 700, color: F, textDecoration: 'none', background: F_DIM, padding: '4px 10px', borderRadius: 8 }}>
                        Cerrar viaje
                      </Link>
                    </div>
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
