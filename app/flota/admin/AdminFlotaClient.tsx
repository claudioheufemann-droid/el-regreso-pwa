'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, AlertTriangle, CheckCircle, TrendingUp, Truck, Clock, Fuel } from 'lucide-react'

const F = '#F97316'
const F_BORDER = 'rgba(249,115,22,0.28)'

interface Viaje {
  id: string
  tipo: 'reparto' | 'tramite'
  motivo: string | null
  estado: string
  km_inicio: number | null
  km_fin: number | null
  km_teoricos: number | null
  litros_carga: number | null
  monto_combustible: number | null
  iniciado_at: string
  completado_at: string | null
  vehiculos: { id: string; nombre: string; patente: string | null } | null
  conductor: { id: string; nombre: string } | null
  rutas_reparto: { id: string; nombre: string } | null
}

interface Vehiculo {
  id: string
  nombre: string
  tipo: string
  patente: string | null
  km_actual: number
  estado: string
  marca: string | null
  modelo: string | null
  color: string | null
  anio: number | null
}

interface Props {
  viajes: Viaje[]
  vehiculos: Vehiculo[]
}

function fmtDuracion(inicio: string, fin: string | null) {
  if (!fin) return '—'
  const mins = Math.floor((new Date(fin).getTime() - new Date(inicio).getTime()) / 60000)
  if (mins < 60) return `${mins} min`
  return `${Math.floor(mins / 60)}h ${mins % 60}min`
}

function fmtFecha(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function DesvioChip({ km_teoricos, km_inicio, km_fin }: { km_teoricos: number | null; km_inicio: number | null; km_fin: number | null }) {
  if (!km_teoricos || !km_inicio || !km_fin) return <span style={{ fontSize: 11, color: 'var(--muted)' }}>Sin datos</span>
  const recorridos = km_fin - km_inicio
  const desvio = recorridos - km_teoricos
  const porc = (desvio / km_teoricos) * 100
  const abs = Math.abs(porc)
  const color = abs > 25 ? '#FF5555' : abs > 10 ? '#F59E0B' : '#4ADE80'
  const bg = abs > 25 ? 'rgba(255,85,85,0.12)' : abs > 10 ? 'rgba(245,158,11,0.12)' : 'rgba(74,222,128,0.1)'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: bg, borderRadius: 8, padding: '3px 8px', width: 'fit-content' }}>
      {abs > 10 ? <AlertTriangle size={11} color={color} /> : <CheckCircle size={11} color={color} />}
      <span style={{ fontSize: 11, color, fontWeight: 700 }}>
        {desvio > 0 ? '+' : ''}{desvio} km ({porc.toFixed(0)}%)
      </span>
    </div>
  )
}

function ViajeCard({ v }: { v: Viaje }) {
  const [expanded, setExpanded] = useState(false)
  const recorridos = v.km_fin && v.km_inicio ? v.km_fin - v.km_inicio : null

  return (
    <div style={{ background: '#131313', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, padding: '14px 16px', marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div>
          <p style={{ fontSize: 13, fontWeight: 800, color: '#F4EEDF', marginBottom: 2 }}>
            {v.vehiculos?.nombre ?? '—'}
            {v.vehiculos?.patente && <span style={{ fontSize: 10, color: 'var(--muted)', marginLeft: 6 }}>{v.vehiculos.patente}</span>}
          </p>
          <p style={{ fontSize: 11, color: 'var(--muted)' }}>
            {v.conductor?.nombre ?? '—'} · {fmtFecha(v.completado_at)}
          </p>
        </div>
        <div style={{ textAlign: 'right' }}>
          {recorridos !== null && (
            <p style={{ fontSize: 14, fontWeight: 900, color: F }}>{recorridos.toLocaleString('es-CL')} km</p>
          )}
          <p style={{ fontSize: 10, color: 'var(--muted)', marginTop: 1 }}>
            {fmtDuracion(v.iniciado_at, v.completado_at)}
          </p>
        </div>
      </div>

      {v.km_teoricos && (
        <div style={{ marginBottom: 8 }}>
          <DesvioChip km_teoricos={v.km_teoricos} km_inicio={v.km_inicio} km_fin={v.km_fin} />
        </div>
      )}

      {v.tipo === 'reparto' && v.rutas_reparto && (
        <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>
          Ruta: <span style={{ color: '#F4EEDF' }}>{v.rutas_reparto.nombre}</span>
        </p>
      )}
      {v.tipo === 'tramite' && v.motivo && (
        <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>
          Motivo: <span style={{ color: '#F4EEDF' }}>{v.motivo}</span>
        </p>
      )}

      {(v.litros_carga || v.monto_combustible) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(249,115,22,0.07)', borderRadius: 8, padding: '5px 10px', marginBottom: 6 }}>
          <Fuel size={11} color={F} />
          <span style={{ fontSize: 11, color: F, fontWeight: 600 }}>
            {v.litros_carga ? `${v.litros_carga}L` : ''}
            {v.litros_carga && v.monto_combustible ? ' · ' : ''}
            {v.monto_combustible ? `$${v.monto_combustible.toLocaleString('es-CL')}` : ''}
          </span>
        </div>
      )}

      <button onClick={() => setExpanded(s => !s)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 11, padding: 0, marginTop: 2 }}>
        {expanded ? 'Ocultar detalle ▲' : 'Ver detalle ▼'}
      </button>

      {expanded && (
        <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {[
            { label: 'Km inicio', value: v.km_inicio ? `${v.km_inicio.toLocaleString('es-CL')} km` : '—' },
            { label: 'Km final', value: v.km_fin ? `${v.km_fin.toLocaleString('es-CL')} km` : '—' },
            { label: 'Km teórico', value: v.km_teoricos ? `${v.km_teoricos} km` : 'No aplica' },
            { label: 'Km real', value: recorridos ? `${recorridos.toLocaleString('es-CL')} km` : '—' },
          ].map(d => (
            <div key={d.label} style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: '8px 10px' }}>
              <p style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 2 }}>{d.label}</p>
              <p style={{ fontSize: 12, fontWeight: 800, color: '#F4EEDF' }}>{d.value}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function AdminFlotaClient({ viajes, vehiculos }: Props) {
  const router = useRouter()
  const [tab, setTab] = useState<'reparto' | 'tramite'>('reparto')

  const viajesReparto = viajes.filter(v => v.tipo === 'reparto')
  const viajesTramite = viajes.filter(v => v.tipo === 'tramite')
  const current = tab === 'reparto' ? viajesReparto : viajesTramite

  const totalKm = current.reduce((s, v) => s + (v.km_fin && v.km_inicio ? v.km_fin - v.km_inicio : 0), 0)
  const totalComb = current.reduce((s, v) => s + (v.monto_combustible ?? 0), 0)
  const conDesvio = viajesReparto.filter(v => {
    if (!v.km_teoricos || !v.km_inicio || !v.km_fin) return false
    return Math.abs(((v.km_fin - v.km_inicio - v.km_teoricos) / v.km_teoricos) * 100) > 25
  }).length

  return (
    <div style={{ minHeight: '100vh', background: '#080808', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ background: '#0F0F0F', borderBottom: '1px solid rgba(249,115,22,0.15)', padding: '14px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => router.push('/flota')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: F, display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 600, padding: 0 }}>
            <ChevronLeft size={18} /> Flota
          </button>
          <div>
            <p style={{ fontSize: 15, fontWeight: 800, color: '#F4EEDF' }}>Panel Admin</p>
            <p style={{ fontSize: 11, color: 'var(--muted)' }}>Controles y alertas de flota</p>
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>

        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 20 }}>
          {[
            { icon: <Truck size={14} color={F} />, label: 'Vehículos', value: vehiculos.length },
            { icon: <TrendingUp size={14} color='#4ADE80' />, label: 'Km (filtro)', value: totalKm.toLocaleString('es-CL') },
            { icon: <AlertTriangle size={14} color='#FF5555' />, label: 'Alertas', value: conDesvio },
          ].map(k => (
            <div key={k.label} style={{ background: '#131313', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '12px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>{k.icon}<p style={{ fontSize: 9, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>{k.label}</p></div>
              <p style={{ fontSize: 18, fontWeight: 900, color: '#F4EEDF' }}>{k.value}</p>
            </div>
          ))}
        </div>

        {/* Alertas de desvío alto */}
        {conDesvio > 0 && (
          <div style={{ background: 'rgba(255,85,85,0.07)', border: '1px solid rgba(255,85,85,0.25)', borderRadius: 12, padding: '12px 14px', marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <AlertTriangle size={14} color="#FF5555" />
              <p style={{ fontSize: 12, fontWeight: 800, color: '#FF5555' }}>{conDesvio} viaje{conDesvio > 1 ? 's' : ''} con desvío alto (&gt;25%)</p>
            </div>
            {viajesReparto.filter(v => {
              if (!v.km_teoricos || !v.km_inicio || !v.km_fin) return false
              return Math.abs(((v.km_fin - v.km_inicio - v.km_teoricos) / v.km_teoricos) * 100) > 25
            }).map(v => (
              <div key={v.id} style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: '8px 10px', marginBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <p style={{ fontSize: 12, fontWeight: 700, color: '#F4EEDF' }}>{v.vehiculos?.nombre}</p>
                  <p style={{ fontSize: 10, color: 'var(--muted)' }}>{v.conductor?.nombre} · {fmtFecha(v.completado_at)}</p>
                </div>
                <DesvioChip km_teoricos={v.km_teoricos} km_inicio={v.km_inicio} km_fin={v.km_fin} />
              </div>
            ))}
          </div>
        )}

        {/* Estado de vehículos */}
        <div style={{ marginBottom: 20 }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 10 }}>Estado de flota</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {vehiculos.map(v => {
              const estadoColor = v.estado === 'disponible' ? '#4ADE80' : v.estado === 'en_uso' ? F : '#F59E0B'
              const estadoLabel = v.estado === 'disponible' ? 'Disponible' : v.estado === 'en_uso' ? 'En uso' : 'Mantención'
              return (
                <div key={v.id} style={{ background: '#131313', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '10px 12px' }}>
                  <p style={{ fontSize: 12, fontWeight: 800, color: '#F4EEDF', marginBottom: 1 }}>{v.nombre}</p>
                  {v.modelo && <p style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 1 }}>{v.modelo}{v.color ? ` · ${v.color}` : ''}</p>}
                  <p style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 6 }}>{v.patente} · {v.km_actual.toLocaleString('es-CL')} km</p>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: `${estadoColor}18`, borderRadius: 6, padding: '3px 7px' }}>
                    <div style={{ width: 5, height: 5, borderRadius: '50%', background: estadoColor }} />
                    <span style={{ fontSize: 10, color: estadoColor, fontWeight: 700 }}>{estadoLabel}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', background: '#131313', borderRadius: 12, padding: 4, marginBottom: 16, border: '1px solid rgba(255,255,255,0.06)' }}>
          {(['reparto', 'tramite'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{ flex: 1, padding: '10px', borderRadius: 9, border: 'none', cursor: 'pointer', background: tab === t ? F : 'transparent', color: tab === t ? '#fff' : 'var(--muted)', fontSize: 13, fontWeight: 700, transition: 'all 0.15s' }}>
              {t === 'reparto' ? 'Rutas de Reparto' : 'Salidas Internas'}
              <span style={{ marginLeft: 6, fontSize: 11, opacity: 0.8 }}>
                ({t === 'reparto' ? viajesReparto.length : viajesTramite.length})
              </span>
            </button>
          ))}
        </div>

        {/* Resumen del tab actual */}
        {totalComb > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(249,115,22,0.07)', border: F_BORDER, borderRadius: 10, padding: '8px 12px', marginBottom: 14 }}>
            <Fuel size={13} color={F} />
            <p style={{ fontSize: 12, color: F, fontWeight: 600 }}>
              Combustible total: <strong>${totalComb.toLocaleString('es-CL')}</strong>
            </p>
          </div>
        )}

        {/* Lista */}
        {current.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px' }}>
            <p style={{ fontSize: 13, color: 'var(--muted)' }}>
              No hay {tab === 'reparto' ? 'rutas de reparto' : 'salidas internas'} registradas
            </p>
          </div>
        ) : (
          current.map(v => <ViajeCard key={v.id} v={v} />)
        )}
      </div>
    </div>
  )
}
