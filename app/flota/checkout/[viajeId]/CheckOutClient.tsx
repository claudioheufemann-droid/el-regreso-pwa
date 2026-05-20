'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, Camera, CheckCircle, Fuel, AlertTriangle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { AppUser } from '@/lib/auth'

const F = '#3B82F6'
const F_BORDER = 'rgba(59,130,246,0.28)'

interface Props {
  user: AppUser
  viaje: {
    id: string; vehiculo_id: string; tipo: string; motivo: string | null
    km_inicio: number | null; km_teoricos: number | null; iniciado_at: string
    vehiculos: { nombre: string; patente: string | null; km_actual: number } | null
  }
}

function fmtDuracion(iso: string) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 60) return `${mins} min`
  return `${Math.floor(mins / 60)}h ${mins % 60}min`
}

export default function CheckOutClient({ user, viaje }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [guardando, setGuardando] = useState(false)
  const [fotoKmFin, setFotoKmFin] = useState('')
  const [kmFin, setKmFin] = useState('')
  const [showCombustible, setShowCombustible] = useState(false)
  const [litros, setLitros] = useState('')
  const [montoComb, setMontoComb] = useState('')
  const [fotoBoleta, setFotoBoleta] = useState('')
  const fotoRef = useRef<HTMLInputElement>(null)
  const boletaRef = useRef<HTMLInputElement>(null)

  const kmRecorridos = kmFin ? parseInt(kmFin) - (viaje.km_inicio ?? 0) : null
  const desvio = kmRecorridos && viaje.km_teoricos ? kmRecorridos - viaje.km_teoricos : null
  const desvioPorc = desvio && viaje.km_teoricos ? (desvio / viaje.km_teoricos) * 100 : null
  const listo = !!fotoKmFin && !!kmFin && parseInt(kmFin) > (viaje.km_inicio ?? 0)

  async function cerrar() {
    if (!listo) return
    setGuardando(true)
    try {
      const km = parseInt(kmFin)
      await supabase.from('viajes_flota').update({
        km_fin: km,
        litros_carga: litros ? parseFloat(litros) : null,
        monto_combustible: montoComb ? parseInt(montoComb) : null,
        estado: 'completado',
        completado_at: new Date().toISOString(),
      }).eq('id', viaje.id)
      await supabase.from('vehiculos').update({ estado: 'disponible', km_actual: km }).eq('id', viaje.vehiculo_id)
      router.push('/flota')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#080808', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ background: '#0F0F0F', borderBottom: '1px solid rgba(59,130,246,0.15)', padding: '14px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => router.push('/flota')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: F, display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 600, padding: 0 }}>
            <ChevronLeft size={18} /> Flota
          </button>
          <div>
            <p style={{ fontSize: 15, fontWeight: 800, color: '#F4EEDF' }}>Cerrar viaje</p>
            <p style={{ fontSize: 11, color: 'var(--muted)' }}>{viaje.vehiculos?.nombre} · {fmtDuracion(viaje.iniciado_at)}</p>
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>

        {/* Resumen del viaje */}
        <div style={{ background: '#131313', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, padding: '14px 16px', marginBottom: 20 }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 10 }}>Resumen del viaje</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {[
              { label: 'Vehículo',   value: viaje.vehiculos?.nombre ?? '—' },
              { label: 'Tipo',       value: viaje.tipo === 'reparto' ? 'Reparto' : 'Trámite' },
              { label: 'Km inicio',  value: viaje.km_inicio ? `${viaje.km_inicio.toLocaleString('es-CL')} km` : '—' },
              { label: 'Km teórico', value: viaje.km_teoricos ? `${viaje.km_teoricos} km` : 'No aplica' },
            ].map(d => (
              <div key={d.label} style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 10, padding: '10px 12px' }}>
                <p style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 3 }}>{d.label}</p>
                <p style={{ fontSize: 13, fontWeight: 800, color: '#F4EEDF' }}>{d.value}</p>
              </div>
            ))}
          </div>
          {viaje.tipo === 'tramite' && viaje.motivo && (
            <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 10, padding: '8px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: 8 }}>
              Motivo: {viaje.motivo}
            </p>
          )}
        </div>

        {/* Foto km final */}
        <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 10 }}>
          Foto odómetro final *
        </p>
        <input ref={fotoRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) setFotoKmFin(URL.createObjectURL(f)) }}
        />
        <div onClick={() => fotoRef.current?.click()} style={{ height: 88, borderRadius: 12, cursor: 'pointer', marginBottom: 16, background: fotoKmFin ? 'rgba(74,222,128,0.07)' : '#1C1C1C', border: `2px solid ${fotoKmFin ? '#4ADE80' : 'rgba(255,255,255,0.08)'}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          {fotoKmFin ? <><CheckCircle size={24} color="#4ADE80" /><p style={{ fontSize: 11, color: '#4ADE80', fontWeight: 600 }}>Foto capturada</p></> : <><span style={{ fontSize: 28 }}>🔢</span><Camera size={14} color="var(--muted)" /></>}
        </div>

        {/* KM final */}
        <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.8px', display: 'block', marginBottom: 8 }}>
          Kilometraje final (odómetro) *
        </label>
        <input
          value={kmFin} onChange={e => setKmFin(e.target.value.replace(/\D/g, ''))}
          placeholder="Ej: 45250"
          type="text" inputMode="numeric"
          style={{ width: '100%', padding: '14px', borderRadius: 12, background: '#1C1C1C', border: `1px solid ${kmFin ? F_BORDER : 'rgba(255,255,255,0.08)'}`, color: '#F4EEDF', fontSize: 18, fontWeight: 800, outline: 'none', textAlign: 'center', marginBottom: 8 }}
        />

        {/* Km recorridos + alerta desvío */}
        {kmFin && parseInt(kmFin) > (viaje.km_inicio ?? 0) && (
          <div style={{ padding: '10px 14px', borderRadius: 10, marginBottom: 16, background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)' }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: F }}>
              Recorrido: {kmRecorridos?.toLocaleString('es-CL')} km
            </p>
            {desvioPorc !== null && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                {Math.abs(desvioPorc) > 25
                  ? <AlertTriangle size={14} color="#FF5555" />
                  : Math.abs(desvioPorc) > 10
                  ? <AlertTriangle size={14} color="#F59E0B" />
                  : <CheckCircle size={14} color="#4ADE80" />
                }
                <p style={{ fontSize: 12, color: Math.abs(desvioPorc) > 25 ? '#FF5555' : Math.abs(desvioPorc) > 10 ? '#F59E0B' : '#4ADE80', fontWeight: 600 }}>
                  Desvío: {desvio! > 0 ? '+' : ''}{desvio} km ({desvioPorc.toFixed(0)}%)
                  {Math.abs(desvioPorc) > 25 ? ' — Desvío alto' : Math.abs(desvioPorc) > 10 ? ' — Desvío moderado' : ' — Normal'}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Combustible (opcional) */}
        <button onClick={() => setShowCombustible(s => !s)} style={{ width: '100%', padding: '13px 16px', borderRadius: 12, border: `1px solid ${showCombustible ? F_BORDER : 'rgba(255,255,255,0.08)'}`, background: showCombustible ? 'rgba(59,130,246,0.07)' : 'transparent', color: showCombustible ? F : 'var(--muted)', fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, marginBottom: showCombustible ? 0 : 16 }}>
          <Fuel size={16} />
          Registrar carga de combustible (opcional)
        </button>

        {showCombustible && (
          <div style={{ background: '#131313', border: '1px solid rgba(59,130,246,0.15)', borderTop: 'none', borderRadius: '0 0 12px 12px', padding: '14px 16px', marginBottom: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
              <div>
                <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 6 }}>Litros</label>
                <input value={litros} onChange={e => setLitros(e.target.value)} placeholder="Ej: 40.5" type="text" inputMode="decimal"
                  style={{ width: '100%', padding: '12px', borderRadius: 10, background: '#1C1C1C', border: '1px solid rgba(255,255,255,0.08)', color: '#F4EEDF', fontSize: 15, fontWeight: 700, outline: 'none' }} />
              </div>
              <div>
                <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 6 }}>Monto ($)</label>
                <input value={montoComb} onChange={e => setMontoComb(e.target.value.replace(/\D/g, ''))} placeholder="Ej: 45000" type="text" inputMode="numeric"
                  style={{ width: '100%', padding: '12px', borderRadius: 10, background: '#1C1C1C', border: '1px solid rgba(255,255,255,0.08)', color: '#F4EEDF', fontSize: 15, fontWeight: 700, outline: 'none' }} />
              </div>
            </div>
            <input ref={boletaRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) setFotoBoleta(URL.createObjectURL(f)) }}
            />
            <div onClick={() => boletaRef.current?.click()} style={{ height: 60, borderRadius: 10, cursor: 'pointer', background: fotoBoleta ? 'rgba(74,222,128,0.07)' : 'rgba(0,0,0,0.3)', border: `1px solid ${fotoBoleta ? '#4ADE80' : 'rgba(255,255,255,0.06)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              {fotoBoleta ? <CheckCircle size={18} color="#4ADE80" /> : <Camera size={16} color="var(--muted)" />}
              <span style={{ fontSize: 12, color: fotoBoleta ? '#4ADE80' : 'var(--muted)', fontWeight: 600 }}>
                {fotoBoleta ? 'Boleta capturada' : 'Foto de boleta (opcional)'}
              </span>
            </div>
          </div>
        )}
      </div>

      <div style={{ padding: '16px', paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
        <button onClick={cerrar} disabled={!listo || guardando} style={{ width: '100%', padding: '17px', borderRadius: 14, border: 'none', cursor: listo ? 'pointer' : 'not-allowed', background: listo && !guardando ? F : 'rgba(255,255,255,0.06)', color: listo && !guardando ? '#fff' : 'var(--muted)', fontSize: 16, fontWeight: 900 }}>
          {guardando ? 'Cerrando viaje…' : 'Cerrar viaje ✓'}
        </button>
      </div>
    </div>
  )
}
