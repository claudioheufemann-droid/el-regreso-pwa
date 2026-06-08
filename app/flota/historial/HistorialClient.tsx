'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp, MapPin, Truck, Clock, Navigation2, User } from 'lucide-react'
import type { AppUser } from '@/lib/auth'
import AppHeader from '@/components/ui/AppHeader'

const F = '#D4AF37'

interface Parada { n: string; d: string }

interface Viaje {
  id: string
  tipo: string
  estado: string
  motivo: string | null
  km_inicio: number | null
  km_fin: number | null
  km_teoricos: number | null
  iniciado_at: string
  completado_at: string | null
  destino_declarado: string | null
  foto_checkin: string | null
  foto_checkout: string | null
  vehiculo: { id?: string; nombre: string; patente: string | null } | null
  conductor: { id?: string; nombre: string } | null
}

interface Props {
  user: AppUser
  viajes: Viaje[]
}

function parseParadas(dest: string | null): Parada[] {
  if (!dest) return []
  try {
    const d = JSON.parse(dest)
    if (Array.isArray(d)) return d.map(p => ({ n: p.n || p.nombre || '', d: p.d || p.direccion || '' }))
  } catch { /* plain text */ }
  return dest.trim() ? [{ n: dest, d: dest }] : []
}

function fmtFecha(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
}

function fmtHora(iso: string) {
  return new Date(iso).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
}

function fmtDuracion(inicio: string, fin: string | null) {
  if (!fin) return null
  const mins = Math.round((new Date(fin).getTime() - new Date(inicio).getTime()) / 60000)
  if (mins < 60) return `${mins} min`
  return `${Math.floor(mins / 60)}h ${mins % 60 > 0 ? (mins % 60) + 'm' : ''}`
}

function EstadoBadge({ estado }: { estado: string }) {
  const cfg: Record<string, { color: string; bg: string; label: string }> = {
    completado: { color: '#5A8A4A', bg: 'rgba(90,138,74,0.12)', label: 'Completado' },
    cerrado:    { color: '#5A8A4A', bg: 'rgba(90,138,74,0.12)', label: 'Completado' },
    en_curso:   { color: '#D4AF37', bg: 'rgba(245,158,11,0.12)', label: 'En curso' },
    cancelado:  { color: '#B5543E', bg: 'rgba(239,68,68,0.12)',  label: 'Cancelado' },
  }
  const c = cfg[estado] ?? { color: 'var(--muted)', bg: 'rgba(255,255,255,0.06)', label: estado }
  return (
    <span style={{ fontSize: 10, fontWeight: 700, color: c.color, background: c.bg, padding: '3px 8px', borderRadius: 20 }}>
      {c.label}
    </span>
  )
}

function ViajeCard({ viaje }: { viaje: Viaje }) {
  const [open, setOpen] = useState(false)
  const paradas = parseParadas(viaje.destino_declarado)
  const kmRecorridos = viaje.km_fin && viaje.km_inicio ? viaje.km_fin - viaje.km_inicio : viaje.km_teoricos
  const duracion = fmtDuracion(viaje.iniciado_at, viaje.completado_at)

  return (
    <div style={{ background: '#111', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, overflow: 'hidden' }}>
      {/* Header card — siempre visible */}
      <div onClick={() => setOpen(!open)} style={{ padding: '14px 16px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {/* Fila 1: fecha + estado */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <p style={{ fontSize: 13, fontWeight: 800, color: '#F4EEDF' }}>{fmtFecha(viaje.iniciado_at)}</p>
            <p style={{ fontSize: 11, color: 'var(--muted)' }}>{fmtHora(viaje.iniciado_at)}{viaje.completado_at ? ` → ${fmtHora(viaje.completado_at)}` : ''}</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <EstadoBadge estado={viaje.estado} />
            {open ? <ChevronUp size={14} color="var(--muted)" /> : <ChevronDown size={14} color="var(--muted)" />}
          </div>
        </div>

        {/* Fila 2: vehículo + conductor + tipo */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <Truck size={13} color={F} />
            <span style={{ fontSize: 12, fontWeight: 700, color: '#F4EEDF' }}>{viaje.vehiculo?.nombre ?? '—'}</span>
            {viaje.vehiculo?.patente && (
              <span style={{ fontSize: 10, color: 'var(--muted)', background: 'rgba(255,255,255,0.06)', padding: '1px 6px', borderRadius: 4 }}>{viaje.vehiculo.patente}</span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <User size={13} color="var(--muted)" />
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>{viaje.conductor?.nombre?.split(' ')[0] ?? '—'}</span>
          </div>
          <span style={{ fontSize: 11, color: viaje.tipo === 'reparto' ? F : '#D4AF37', fontWeight: 700, background: viaje.tipo === 'reparto' ? 'rgba(212,175,55,0.1)' : 'rgba(245,158,11,0.1)', padding: '2px 8px', borderRadius: 10 }}>
            {viaje.tipo === 'reparto' ? '🚚 Reparto' : '🔧 Trámite'}
          </span>
        </div>

        {/* Fila 3: métricas rápidas */}
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {kmRecorridos != null && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <Navigation2 size={12} color={F} />
              <span style={{ fontSize: 12, fontWeight: 800, color: F }}>{kmRecorridos} km</span>
            </div>
          )}
          {duracion && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <Clock size={12} color="var(--muted)" />
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>{duracion}</span>
            </div>
          )}
          {paradas.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <MapPin size={12} color="var(--muted)" />
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>{paradas.length} parada{paradas.length !== 1 ? 's' : ''}</span>
            </div>
          )}
        </div>
      </div>

      {/* Detalle expandible */}
      {open && (
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Métricas detalladas */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {[
              { label: 'KM inicio', value: viaje.km_inicio?.toLocaleString('es-CL') ?? '—' },
              { label: 'KM llegada', value: viaje.km_fin?.toLocaleString('es-CL') ?? '—' },
              { label: 'KM recorridos', value: kmRecorridos != null ? `${kmRecorridos} km` : '—' },
            ].map(m => (
              <div key={m.label} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: '10px 12px' }}>
                <p style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 4 }}>{m.label}</p>
                <p style={{ fontSize: 15, fontWeight: 900, color: '#F4EEDF' }}>{m.value}</p>
              </div>
            ))}
          </div>

          {/* Paradas / Clientes */}
          {paradas.length > 0 && (
            <div>
              <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 8 }}>
                Paradas visitadas ({paradas.length})
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {paradas.map((p, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: 8 }}>
                    <span style={{ fontSize: 10, fontWeight: 800, color: 'rgba(212,175,55,0.5)', minWidth: 16, marginTop: 1 }}>{i + 1}</span>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 700, color: '#F4EEDF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.n}</p>
                      {p.d && p.d !== p.n && (
                        <p style={{ fontSize: 11, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.d}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Motivo */}
          {viaje.motivo && (
            <div>
              <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 4 }}>Notas</p>
              <p style={{ fontSize: 13, color: '#F4EEDF' }}>{viaje.motivo}</p>
            </div>
          )}

          {/* Fotos */}
          {(viaje.foto_checkin || viaje.foto_checkout) && (
            <div>
              <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 8 }}>
                📸 Fotos del viaje
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                {viaje.foto_checkin && (
                  <div style={{ borderRadius: 10, overflow: 'hidden', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <a href={viaje.foto_checkin} target="_blank" rel="noopener noreferrer">
                      <img
                        src={viaje.foto_checkin}
                        alt="Check-in"
                        style={{ width: '100%', height: '120px', objectFit: 'cover', display: 'block' }}
                      />
                      <div style={{ padding: '6px 10px', fontSize: 10, fontWeight: 700, color: 'var(--muted)' }}>Check-in</div>
                    </a>
                  </div>
                )}
                {viaje.foto_checkout && (
                  <div style={{ borderRadius: 10, overflow: 'hidden', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <a href={viaje.foto_checkout} target="_blank" rel="noopener noreferrer">
                      <img
                        src={viaje.foto_checkout}
                        alt="Check-out"
                        style={{ width: '100%', height: '120px', objectFit: 'cover', display: 'block' }}
                      />
                      <div style={{ padding: '6px 10px', fontSize: 10, fontWeight: 700, color: 'var(--muted)' }}>Check-out</div>
                    </a>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Abrir en Maps */}
          {paradas.length > 0 && (
            <a
              href={(() => {
                const base = encodeURIComponent('El Regreso Beer, Valdivia, Chile')
                const stops = paradas.map(p => encodeURIComponent(p.d || p.n)).join('/')
                return `https://www.google.com/maps/dir/${base}/${stops}/${base}`
              })()}
              target="_blank" rel="noopener noreferrer"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px', borderRadius: 10, background: 'rgba(66,133,244,0.1)', border: '1px solid rgba(66,133,244,0.25)', color: '#F4EEDF', fontSize: 12, fontWeight: 700, textDecoration: 'none' }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" fill="#F4EEDF"/>
              </svg>
              Ver ruta en Google Maps
            </a>
          )}
        </div>
      )}
    </div>
  )
}

export default function HistorialClient({ user, viajes }: Props) {
  const [filtroVehiculo, setFiltroVehiculo] = useState('todos')
  const [filtroConductor, setFiltroConductor] = useState('todos')

  const vehiculos = [...new Map(
    viajes.filter(v => v.vehiculo).map(v => [v.vehiculo!.nombre, v.vehiculo!] as [string, typeof v.vehiculo & {}])
  ).values()]
  const conductores = [...new Map(
    viajes.filter(v => v.conductor).map(v => [v.conductor!.nombre, v.conductor!] as [string, typeof v.conductor & {}])
  ).values()]

  const filtrados = viajes.filter(v =>
    (filtroVehiculo === 'todos' || v.vehiculo?.nombre === filtroVehiculo) &&
    (filtroConductor === 'todos' || v.conductor?.nombre === filtroConductor)
  )

  const totalKm = filtrados.reduce((sum, v) => {
    const km = v.km_fin && v.km_inicio ? v.km_fin - v.km_inicio : (v.km_teoricos ?? 0)
    return sum + km
  }, 0)

  const completados = filtrados.filter(v => v.estado === 'completado' || v.estado === 'cerrado').length

  const selectStyle: React.CSSProperties = {
    padding: '8px 12px', borderRadius: 10, background: '#161616',
    border: '1px solid rgba(255,255,255,0.08)', color: '#F4EEDF',
    fontSize: 13, outline: 'none', cursor: 'pointer',
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', width: '100%', padding: '20px 16px', paddingBottom: 100 }}>

      {/* Header estándar */}
      <AppHeader eyebrow="Módulo logística" title="Historial de viajes" />

      {/* Stats globales */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 20 }}>
        {[
          { label: 'Total viajes', value: filtrados.length, color: F, rgb: '212,175,55' },
          { label: 'Completados', value: completados, color: '#5A8A4A', rgb: '90,138,74' },
          { label: 'Km totales', value: `${totalKm} km`, color: '#D4AF37', rgb: '245,158,11' },
        ].map(s => (
          <div key={s.label} style={{ background: `linear-gradient(135deg, rgba(${s.rgb},0.09), rgba(${s.rgb},0.03))`, border: `1px solid rgba(${s.rgb},0.2)`, borderRadius: 12, padding: '12px 14px' }}>
            <p style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 4 }}>{s.label}</p>
            <p style={{ fontSize: 22, fontWeight: 900, color: s.color, letterSpacing: '-0.5px' }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <select value={filtroVehiculo} onChange={e => setFiltroVehiculo(e.target.value)} style={selectStyle}>
          <option value="todos">Todos los vehículos</option>
          {vehiculos.map(v => v && <option key={v.nombre} value={v.nombre}>{v.nombre}</option>)}
        </select>
        <select value={filtroConductor} onChange={e => setFiltroConductor(e.target.value)} style={selectStyle}>
          <option value="todos">Todos los conductores</option>
          {conductores.map(c => c && <option key={c.nombre} value={c.nombre}>{c.nombre}</option>)}
        </select>
      </div>

      {/* Lista */}
      {filtrados.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--muted)' }}>
          <p style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>Sin viajes registrados</p>
          <p style={{ fontSize: 13 }}>Los viajes completados aparecerán aquí</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtrados.map(v => <ViajeCard key={v.id} viaje={v} />)}
        </div>
      )}
    </div>
  )
}
