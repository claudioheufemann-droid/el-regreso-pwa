'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, Camera, CheckCircle, Fuel, AlertTriangle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { AppUser } from '@/lib/auth'

const F = 'var(--gold)'
const F_BORDER = 'var(--border)'

const NIVELES_COMB = [
  { value: 'lleno',        label: 'Lleno',   fill: 6, color: '#4ADE80' },
  { value: 'tres_cuartos', label: '3/4',     fill: 5, color: '#86EFAC' },
  { value: 'medio',        label: '1/2',     fill: 4, color: '#FBBF24' },
  { value: 'cuarto',       label: '1/4',     fill: 2, color: '#F97316' },
  { value: 'reserva',      label: 'Reserva', fill: 1, color: '#EF4444' },
  { value: 'vacio',        label: 'Vacío',   fill: 0, color: '#6B0000' },
] as const

function NivelDetectado({ nivel, onCorregir }: { nivel: string; onCorregir: () => void }) {
  const n = NIVELES_COMB.find(x => x.value === nivel) ?? NIVELES_COMB[2]
  return (
    <div style={{ background: `${n.color}12`, border: `1px solid ${n.color}40`, borderRadius: 12, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
      <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end', height: 28, flexShrink: 0 }}>
        {[1, 2, 3, 4, 5, 6].map(bar => (
          <div key={bar} style={{ width: 7, height: 5 + bar * 3.2, borderRadius: 2, background: bar <= n.fill ? n.color : 'rgba(255,255,255,0.1)' }} />
        ))}
      </div>
      <div style={{ flex: 1 }}>
        <p style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, marginBottom: 2 }}>Nivel detectado por IA</p>
        <p style={{ fontSize: 22, fontWeight: 900, color: n.color, letterSpacing: '-0.5px' }}>{n.label}</p>
      </div>
      <button onClick={onCorregir} style={{ fontSize: 11, color: 'var(--muted)', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 7, padding: '6px 10px', cursor: 'pointer', flexShrink: 0 }}>
        Corregir
      </button>
    </div>
  )
}

function SelectorManual({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ marginBottom: 16 }}>
      {label && <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.8px', display: 'block', marginBottom: 10 }}>{label}</label>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6 }}>
        {NIVELES_COMB.map(n => (
          <div key={n.value} onClick={() => onChange(n.value)} style={{ cursor: 'pointer', borderRadius: 10, padding: '10px 4px 8px', background: value === n.value ? `${n.color}20` : '#1C1C1C', border: `2px solid ${value === n.value ? n.color : 'rgba(255,255,255,0.06)'}`, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', height: 22 }}>
              {[1, 2, 3, 4, 5, 6].map(bar => (
                <div key={bar} style={{ width: 5, height: 4 + bar * 2.8, borderRadius: 1.5, background: bar <= n.fill ? n.color : 'rgba(255,255,255,0.1)' }} />
              ))}
            </div>
            <span style={{ fontSize: 9, fontWeight: 700, color: value === n.value ? n.color : 'var(--muted)', textAlign: 'center' }}>{n.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

const ANGULOS_360 = [
  { key: 'frente',    label: 'Frente', emoji: '⬆️' },
  { key: 'izquierdo', label: 'Izq.',   emoji: '◀️' },
  { key: 'derecho',   label: 'Der.',   emoji: '▶️' },
  { key: 'atras',     label: 'Atrás',  emoji: '⬇️' },
] as const

function FotoSlot({ label, emoji, onCaptura, capturada }: { label: string; emoji: string; onCaptura: (url: string, file: File) => void; capturada: boolean }) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <div onClick={() => ref.current?.click()} style={{ display: 'flex', alignItems: 'center', gap: 10, height: 44, padding: '0 12px', borderRadius: 10, cursor: 'pointer', flexShrink: 0, background: capturada ? 'rgba(74,222,128,0.07)' : '#1C1C1C', border: `1px solid ${capturada ? '#4ADE80' : 'rgba(255,255,255,0.08)'}` }}>
      <input ref={ref} type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) onCaptura(URL.createObjectURL(f), f) }}
      />
      <span style={{ fontSize: 15 }}>{capturada ? '✅' : emoji}</span>
      <span style={{ fontSize: 12, fontWeight: 700, color: capturada ? '#4ADE80' : 'var(--muted)', flex: 1 }}>{label}</span>
      {!capturada && <Camera size={13} color="var(--muted)" />}
    </div>
  )
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

interface Props {
  user: AppUser
  viaje: {
    id: string; vehiculo_id: string; tipo: string; motivo: string | null
    km_inicio: number | null; km_teoricos: number | null; iniciado_at: string
    vehiculos: { nombre: string; patente: string | null; km_actual: number; combustible: string | null } | null
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

  // Fotos
  const [fotoKmFin, setFotoKmFin] = useState('')
  const [fotos360, setFotos360] = useState<Record<string, string>>({})
  const [fotoMarcador, setFotoMarcador] = useState('')

  // KM final — auto-llenado por IA
  const [kmFin, setKmFin] = useState('')
  const [analizandoOdo, setAnalizandoOdo] = useState(false)
  const [kmLeido, setKmLeido] = useState<string | null>(null)

  // Combustible — determinado por IA
  const [combustibleFin, setCombustibleFin] = useState('')
  const [analizandoComb, setAnalizandoComb] = useState(false)
  const [nivelDetectado, setNivelDetectado] = useState<string | null>(null)
  const [iaFalloComb, setIaFalloComb] = useState(false)
  const [mostrarSelectorComb, setMostrarSelectorComb] = useState(false)

  // Carga combustible
  const [showCargaComb, setShowCargaComb] = useState(false)
  const [litros, setLitros] = useState('')
  const [montoComb, setMontoComb] = useState('')
  const [fotoBoleta, setFotoBoleta] = useState('')
  const boletaRef = useRef<HTMLInputElement>(null)

  const kmRecorridos = kmFin ? parseInt(kmFin) - (viaje.km_inicio ?? 0) : null
  const desvio = kmRecorridos && viaje.km_teoricos ? kmRecorridos - viaje.km_teoricos : null
  const desvioPorc = desvio && viaje.km_teoricos ? (desvio / viaje.km_teoricos) * 100 : null
  const fotos360ok = ANGULOS_360.every(a => !!fotos360[a.key])
  const listo = !!fotoKmFin && !!kmFin && parseInt(kmFin) > (viaje.km_inicio ?? 0) && fotos360ok && !!fotoMarcador && !!combustibleFin

  // ── Análisis IA: Odómetro ────────────────────────────────────────────────────
  async function analizarOdometro(file: File) {
    setAnalizandoOdo(true)
    setKmLeido(null)
    try {
      const base64 = await fileToBase64(file)
      const res = await fetch('/api/analizar-odometro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imagen: base64, tipo: file.type }),
      })
      const { km } = await res.json()
      if (km && km > (viaje.km_inicio ?? 0)) { setKmFin(String(km)); setKmLeido(String(km)) }
    } catch { /* silently fail */ } finally {
      setAnalizandoOdo(false)
    }
  }

  // ── Análisis IA: Combustible ─────────────────────────────────────────────────
  async function analizarCombustible(file: File) {
    setAnalizandoComb(true)
    setNivelDetectado(null)
    setIaFalloComb(false)
    setMostrarSelectorComb(false)
    try {
      const base64 = await fileToBase64(file)
      const res = await fetch('/api/analizar-combustible', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imagen: base64, tipo: file.type }),
      })
      const { nivel } = await res.json()
      if (nivel) {
        setCombustibleFin(nivel)
        setNivelDetectado(nivel)
      } else {
        setIaFalloComb(true)
        setMostrarSelectorComb(true)
      }
    } catch {
      setIaFalloComb(true)
      setMostrarSelectorComb(true)
    } finally {
      setAnalizandoComb(false)
    }
  }

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
      await supabase.from('vehiculos').update({ estado: 'disponible', km_actual: km, combustible: combustibleFin }).eq('id', viaje.vehiculo_id)
      router.push('/flota')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#080808', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ background: '#0F0F0F', borderBottom: '1px solid var(--border)', padding: '14px 16px' }}>
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

        {/* Resumen */}
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

        {/* ── Odómetro final ────────────────────────────────────────────────── */}
        <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 8 }}>
          Foto odómetro final *
        </p>
        <div style={{ marginBottom: 6 }}>
          <FotoSlot label="Odómetro" emoji="🔢"
            onCaptura={(url, file) => { setFotoKmFin(url); analizarOdometro(file) }}
            capturada={!!fotoKmFin} />
        </div>
        {analizandoOdo && (
          <p style={{ fontSize: 11, color: '#F59E0B', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', border: '2px solid #F59E0B', borderTopColor: 'transparent', animation: 'spin 0.7s linear infinite' }} />
            Leyendo kilometraje…
          </p>
        )}

        {/* KM final */}
        <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.8px', display: 'block', marginBottom: 8 }}>
          Kilometraje final (odómetro) *
        </label>
        <input
          value={kmFin} onChange={e => { setKmFin(e.target.value.replace(/\D/g, '')); setKmLeido(null) }}
          placeholder="Ej: 45250"
          type="text" inputMode="numeric"
          style={{ width: '100%', padding: '14px', borderRadius: 12, background: '#1C1C1C', border: `1px solid ${kmLeido ? '#4ADE80' : kmFin ? F_BORDER : 'rgba(255,255,255,0.08)'}`, color: '#F4EEDF', fontSize: 18, fontWeight: 800, outline: 'none', textAlign: 'center', marginBottom: 4 }}
        />
        {kmLeido && !analizandoOdo && (
          <p style={{ fontSize: 11, color: '#4ADE80', marginBottom: 12, textAlign: 'center' }}>✨ Leído de la foto por IA · puedes corregir si es necesario</p>
        )}
        {!kmLeido && fotoKmFin && !analizandoOdo && (
          <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 12, textAlign: 'center' }}>Ingresa el km manualmente</p>
        )}

        {/* Km recorridos + desvío */}
        {kmFin && parseInt(kmFin) > (viaje.km_inicio ?? 0) && (
          <div style={{ padding: '10px 14px', borderRadius: 10, marginBottom: 16, background: 'var(--gold-dim)', border: '1px solid var(--border)' }}>
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

        {/* ── Inspección 360° ───────────────────────────────────────────────── */}
        <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 8 }}>
          Inspección 360° *
          <span style={{ fontSize: 10, fontWeight: 500, color: fotos360ok ? '#4ADE80' : 'var(--muted)', marginLeft: 8 }}>
            {Object.keys(fotos360).length}/4
          </span>
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
          {ANGULOS_360.map(a => (
            <FotoSlot key={a.key} label={a.label} emoji={a.emoji}
              onCaptura={(url) => setFotos360(prev => ({ ...prev, [a.key]: url }))}
              capturada={!!fotos360[a.key]} />
          ))}
        </div>

        {/* ── Combustible ───────────────────────────────────────────────────── */}
        <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 8 }}>Marcador de combustible *</p>
        <div style={{ marginBottom: 8 }}>
          <FotoSlot label="Foto del tablero" emoji="⛽"
            onCaptura={(url, file) => { setFotoMarcador(url); analizarCombustible(file) }}
            capturada={!!fotoMarcador} />
        </div>

        {analizandoComb && (
          <p style={{ fontSize: 11, color: '#F59E0B', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', border: '2px solid #F59E0B', borderTopColor: 'transparent', animation: 'spin 0.7s linear infinite' }} />
            Leyendo nivel de estanque…
          </p>
        )}

        {!analizandoComb && nivelDetectado && !mostrarSelectorComb && (
          <NivelDetectado nivel={nivelDetectado} onCorregir={() => setMostrarSelectorComb(true)} />
        )}

        {!analizandoComb && (iaFalloComb || mostrarSelectorComb) && (
          <div>
            {iaFalloComb && (
              <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 10 }}>
                No se pudo leer el nivel automáticamente, selecciona manualmente:
              </p>
            )}
            <SelectorManual label="" value={combustibleFin} onChange={v => { setCombustibleFin(v); setNivelDetectado(v) }} />
            {nivelDetectado && mostrarSelectorComb && !iaFalloComb && (
              <button onClick={() => setMostrarSelectorComb(false)} style={{ fontSize: 11, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', marginBottom: 8 }}>
                ← Volver al nivel detectado
              </button>
            )}
          </div>
        )}

        {/* ── Carga combustible (opcional) ─────────────────────────────────── */}
        <button onClick={() => setShowCargaComb(s => !s)} style={{ width: '100%', padding: '13px 16px', borderRadius: 12, border: `1px solid ${showCargaComb ? F_BORDER : 'rgba(255,255,255,0.08)'}`, background: showCargaComb ? 'var(--gold-hover)' : 'transparent', color: showCargaComb ? F : 'var(--muted)', fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, marginBottom: showCargaComb ? 0 : 16 }}>
          <Fuel size={16} />
          Registrar carga de combustible (opcional)
        </button>

        {showCargaComb && (
          <div style={{ background: '#131313', border: '1px solid var(--border)', borderTop: 'none', borderRadius: '0 0 12px 12px', padding: '14px 16px', marginBottom: 16 }}>
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
