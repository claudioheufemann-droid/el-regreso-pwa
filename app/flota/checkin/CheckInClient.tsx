'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Truck, Camera, CheckCircle, ChevronLeft, MapPin, Package, AlertTriangle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { AppUser } from '@/lib/auth'

const F = '#F97316'
const F_DIM = 'rgba(249,115,22,0.12)'
const F_BORDER = 'rgba(249,115,22,0.28)'

const NIVELES_COMB = [
  { value: 'lleno',        label: 'Lleno',   fill: 6, color: '#4ADE80' },
  { value: 'tres_cuartos', label: '3/4',     fill: 5, color: '#86EFAC' },
  { value: 'medio',        label: '1/2',     fill: 4, color: '#FBBF24' },
  { value: 'cuarto',       label: '1/4',     fill: 2, color: '#F97316' },
  { value: 'reserva',      label: 'Reserva', fill: 1, color: '#EF4444' },
  { value: 'vacio',        label: 'Vacío',   fill: 0, color: '#6B0000' },
] as const

// Muestra el nivel detectado + botón para corregir manualmente
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

// Selector manual de combustible (solo visible al corregir o si la IA falla)
function SelectorManual({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6, marginBottom: 16 }}>
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
  )
}

interface Vehiculo { id: string; nombre: string; tipo: string; patente: string | null; km_actual: number; estado: string; combustible: string | null }
interface Ruta { id: string; nombre: string | null; vehiculo_id: string; km_teoricos: number | null; estado: string }
interface Props { user: AppUser; vehiculos: Vehiculo[]; rutasHoy: Ruta[] }

const TIPO_LABEL: Record<string, string> = { camioneta: 'Camioneta', furgon: 'Furgón', camion_34: 'Camión 3/4' }

function StepBar({ paso, total }: { paso: number; total: number }) {
  return (
    <div style={{ display: 'flex', gap: 4, padding: '0 20px' }}>
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i < paso ? F : 'rgba(255,255,255,0.1)', transition: 'background 0.3s' }} />
      ))}
    </div>
  )
}

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

const ANGULOS_360 = [
  { key: 'frente',    label: 'Frente', emoji: '⬆️' },
  { key: 'izquierdo', label: 'Izq.',   emoji: '◀️' },
  { key: 'derecho',   label: 'Der.',   emoji: '▶️' },
  { key: 'atras',     label: 'Atrás',  emoji: '⬇️' },
] as const

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export default function CheckInClient({ user, vehiculos, rutasHoy }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [paso, setPaso] = useState(1)
  const [guardando, setGuardando] = useState(false)

  const [vehiculo, setVehiculo] = useState<Vehiculo | null>(null)
  const [tipoSalida, setTipoSalida] = useState<'reparto' | 'tramite' | null>(null)
  const [rutaId, setRutaId] = useState<string | null>(null)
  const [motivo, setMotivo] = useState('')
  const [destino, setDestino] = useState('')

  // Fotos
  const [fotoOdo, setFotoOdo] = useState('')
  const [fotos360, setFotos360] = useState<Record<string, string>>({})
  const [fotoMarcador, setFotoMarcador] = useState('')

  // KM — auto-llenado por IA
  const [kmInicio, setKmInicio] = useState('')
  const [analizandoOdo, setAnalizandoOdo] = useState(false)
  const [kmLeido, setKmLeido] = useState<string | null>(null)

  // Combustible — determinado por IA, sin selector visible por defecto
  const [combustible, setCombustible] = useState('')
  const [analizandoComb, setAnalizandoComb] = useState(false)
  const [nivelDetectado, setNivelDetectado] = useState<string | null>(null)
  const [iaFalloComb, setIaFalloComb] = useState(false)
  const [mostrarSelectorComb, setMostrarSelectorComb] = useState(false)

  const disponibles = vehiculos.filter(v => v.estado === 'disponible')
  const rutasVehiculo = vehiculo ? rutasHoy.filter(r => r.vehiculo_id === vehiculo.id) : []
  const fotos360ok = ANGULOS_360.every(a => !!fotos360[a.key])
  const listo = !!fotoOdo && fotos360ok && !!fotoMarcador && !!kmInicio && !!combustible

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
      if (km) { setKmInicio(String(km)); setKmLeido(String(km)) }
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
        setCombustible(nivel)
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

  async function confirmar() {
    if (!vehiculo || !tipoSalida || !listo) return
    setGuardando(true)
    try {
      const km = parseInt(kmInicio)
      const rutaSeleccionada = rutasHoy.find(r => r.id === rutaId)
      await supabase.from('viajes_flota').insert({
        vehiculo_id: vehiculo.id,
        conductor_id: user.id,
        ruta_id: rutaId ?? null,
        tipo: tipoSalida,
        motivo: tipoSalida === 'tramite' ? motivo : null,
        km_inicio: km,
        km_teoricos: rutaSeleccionada?.km_teoricos ?? null,
        destino_declarado: tipoSalida === 'tramite' ? destino.trim() || null : null,
        estado: 'en_curso',
      })
      await supabase.from('vehiculos').update({ estado: 'en_uso', combustible }).eq('id', vehiculo.id)
      if (rutaId) await supabase.from('rutas_reparto').update({ estado: 'en_curso' }).eq('id', rutaId)
      router.push('/flota')
    } finally {
      setGuardando(false)
    }
  }

  const totalPasos = 3
  const pasoLabel = ['', 'Vehículo', 'Tipo de salida', 'Documentación'][paso]

  return (
    <div style={{ minHeight: '100vh', background: '#080808', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ background: '#0F0F0F', borderBottom: '1px solid rgba(249,115,22,0.15)', padding: '14px 16px 10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <button onClick={() => paso > 1 ? setPaso(paso - 1) : router.push('/flota')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: F, display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 600, padding: 0 }}>
            <ChevronLeft size={18} /> {paso === 1 ? 'Cancelar' : 'Atrás'}
          </button>
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: 14, fontWeight: 800, color: '#F4EEDF' }}>{vehiculo ? vehiculo.nombre : 'Nueva Salida'}</p>
            <p style={{ fontSize: 11, color: 'var(--muted)' }}>Paso {paso}/{totalPasos} · {pasoLabel}</p>
          </div>
          <div style={{ width: 60 }} />
        </div>
        <StepBar paso={paso} total={totalPasos} />
      </div>

      {/* ── Paso 1: Selección vehículo ─────────────────────────────────────── */}
      {paso === 1 && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
            {disponibles.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                <AlertTriangle size={32} color="#F59E0B" style={{ margin: '0 auto 12px', display: 'block' }} />
                <p style={{ fontSize: 15, fontWeight: 700, color: '#F4EEDF', marginBottom: 6 }}>Sin vehículos disponibles</p>
                <p style={{ fontSize: 13, color: 'var(--muted)' }}>Todos los vehículos están en uso o en mantención</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {disponibles.map(v => (
                  <div key={v.id} onClick={() => setVehiculo(v)} style={{ padding: '14px 16px', borderRadius: 14, cursor: 'pointer', background: vehiculo?.id === v.id ? F_DIM : '#1C1C1C', border: `1px solid ${vehiculo?.id === v.id ? F_BORDER : 'rgba(255,255,255,0.06)'}`, display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: F_DIM, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Truck size={18} color={F} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: 15, fontWeight: 700, color: '#F4EEDF', marginBottom: 2 }}>{v.nombre}</p>
                      <p style={{ fontSize: 11, color: 'var(--muted)' }}>{TIPO_LABEL[v.tipo] ?? v.tipo}{v.patente ? ` · ${v.patente}` : ''} · {v.km_actual.toLocaleString('es-CL')} km</p>
                    </div>
                    {vehiculo?.id === v.id && <CheckCircle size={18} color={F} />}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div style={{ padding: '16px', paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
            <button onClick={() => vehiculo && setPaso(2)} disabled={!vehiculo} style={{ width: '100%', padding: '17px', borderRadius: 14, border: 'none', cursor: vehiculo ? 'pointer' : 'not-allowed', background: vehiculo ? F : 'rgba(255,255,255,0.06)', color: vehiculo ? '#fff' : 'var(--muted)', fontSize: 16, fontWeight: 900 }}>
              Seleccionar vehículo →
            </button>
          </div>
        </div>
      )}

      {/* ── Paso 2: Tipo de salida ─────────────────────────────────────────── */}
      {paso === 2 && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 12 }}>Tipo de salida</p>
            <div onClick={() => setTipoSalida('reparto')} style={{ padding: '16px', borderRadius: 14, cursor: 'pointer', marginBottom: 10, background: tipoSalida === 'reparto' ? F_DIM : '#1C1C1C', border: `2px solid ${tipoSalida === 'reparto' ? F : 'rgba(255,255,255,0.06)'}`, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ width: 38, height: 38, borderRadius: 10, background: F_DIM, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <MapPin size={18} color={F} />
              </div>
              <div>
                <p style={{ fontSize: 15, fontWeight: 800, color: '#F4EEDF', marginBottom: 3 }}>A. Salida Planificada</p>
                <p style={{ fontSize: 12, color: 'var(--muted)' }}>Reparto con ruta asignada por el encargado</p>
                {rutasVehiculo.length > 0 && tipoSalida === 'reparto' && (
                  <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {rutasVehiculo.map(r => (
                      <div key={r.id} onClick={e => { e.stopPropagation(); setRutaId(r.id) }} style={{ padding: '10px 12px', borderRadius: 10, background: rutaId === r.id ? 'rgba(249,115,22,0.15)' : 'rgba(0,0,0,0.3)', border: `1px solid ${rutaId === r.id ? F : 'rgba(255,255,255,0.08)'}`, cursor: 'pointer' }}>
                        <p style={{ fontSize: 13, fontWeight: 700, color: '#F4EEDF' }}>{r.nombre ?? 'Ruta del día'}</p>
                        {r.km_teoricos && <p style={{ fontSize: 11, color: 'var(--muted)' }}>{r.km_teoricos} km estimados</p>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div onClick={() => { setTipoSalida('tramite'); setRutaId(null) }} style={{ padding: '16px', borderRadius: 14, cursor: 'pointer', background: tipoSalida === 'tramite' ? 'rgba(245,158,11,0.08)' : '#1C1C1C', border: `2px solid ${tipoSalida === 'tramite' ? '#F59E0B' : 'rgba(255,255,255,0.06)'}`, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(245,158,11,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Package size={18} color="#F59E0B" />
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 15, fontWeight: 800, color: '#F4EEDF', marginBottom: 3 }}>B. Salida No Planificada</p>
                <p style={{ fontSize: 12, color: 'var(--muted)' }}>Trámites o uso libre · Requiere motivo</p>
                {tipoSalida === 'tramite' && (
                  <div onClick={e => e.stopPropagation()} style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div>
                      <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 5 }}>
                        Dirección de destino *
                      </label>
                      <input
                        value={destino} onChange={e => setDestino(e.target.value)}
                        placeholder="Ej: Arauco 215, Valdivia"
                        style={{ width: '100%', padding: '10px 12px', borderRadius: 10, background: '#131313', border: `1px solid ${destino.trim() ? 'rgba(249,115,22,0.4)' : 'rgba(255,255,255,0.1)'}`, color: '#F4EEDF', fontSize: 14, outline: 'none' }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 5 }}>
                        Motivo del viaje *
                      </label>
                      <textarea value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Describe el motivo del viaje..." rows={2}
                        style={{ width: '100%', padding: '10px 12px', borderRadius: 10, background: '#131313', border: '1px solid rgba(255,255,255,0.1)', color: '#F4EEDF', fontSize: 14, resize: 'none', outline: 'none' }} />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div style={{ padding: '16px', paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
            <button
              onClick={() => (tipoSalida === 'reparto' || (tipoSalida === 'tramite' && motivo.trim() && destino.trim())) && setPaso(3)}
              disabled={!tipoSalida || (tipoSalida === 'tramite' && (!motivo.trim() || !destino.trim()))}
              style={{ width: '100%', padding: '17px', borderRadius: 14, border: 'none', cursor: 'pointer', background: (tipoSalida === 'reparto' || (tipoSalida === 'tramite' && motivo.trim() && destino.trim())) ? F : 'rgba(255,255,255,0.06)', color: (tipoSalida === 'reparto' || (tipoSalida === 'tramite' && motivo.trim() && destino.trim())) ? '#fff' : 'var(--muted)', fontSize: 16, fontWeight: 900 }}
            >
              Continuar →
            </button>
          </div>
        </div>
      )}

      {/* ── Paso 3: Fotos + KM ────────────────────────────────────────────── */}
      {paso === 3 && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 12 }}>
              Documentación obligatoria
            </p>

            {/* ── Odómetro ─────────────────────────────────────────────────── */}
            <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 8 }}>Foto odómetro *</p>
            <div style={{ marginBottom: 6 }}>
              <FotoSlot label="Odómetro" emoji="🔢"
                onCaptura={(url, file) => { setFotoOdo(url); analizarOdometro(file) }}
                capturada={!!fotoOdo} />
            </div>
            {analizandoOdo && (
              <p style={{ fontSize: 11, color: '#F59E0B', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', border: '2px solid #F59E0B', borderTopColor: 'transparent', animation: 'spin 0.7s linear infinite' }} />
                Leyendo kilometraje…
              </p>
            )}

            {/* KM inicio — auto-llenado */}
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.8px', display: 'block', marginBottom: 8 }}>
              Kilometraje actual (odómetro)
            </label>
            <input
              value={kmInicio} onChange={e => { setKmInicio(e.target.value.replace(/\D/g, '')); setKmLeido(null) }}
              placeholder={`Ej: ${vehiculo?.km_actual ?? 45000}`}
              type="text" inputMode="numeric"
              style={{ width: '100%', padding: '14px', borderRadius: 12, background: '#1C1C1C', border: `1px solid ${kmLeido ? '#4ADE80' : kmInicio ? F_BORDER : 'rgba(255,255,255,0.08)'}`, color: '#F4EEDF', fontSize: 18, fontWeight: 800, outline: 'none', textAlign: 'center', letterSpacing: '-0.5px', marginBottom: 4 }}
            />
            {kmLeido && !analizandoOdo && (
              <p style={{ fontSize: 11, color: '#4ADE80', marginBottom: 12, textAlign: 'center' }}>✨ Leído de la foto por IA · puedes corregir si es necesario</p>
            )}
            {!kmLeido && fotoOdo && !analizandoOdo && (
              <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 12, textAlign: 'center' }}>Ingresa el km manualmente</p>
            )}
            {vehiculo && kmInicio && parseInt(kmInicio) < vehiculo.km_actual && (
              <p style={{ fontSize: 11, color: '#F59E0B', marginBottom: 12, textAlign: 'center' }}>
                ⚠ El valor es menor al km registrado ({vehiculo.km_actual.toLocaleString('es-CL')} km)
              </p>
            )}

            {/* ── Inspección 360° ───────────────────────────────────────────── */}
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

            {/* ── Combustible ───────────────────────────────────────────────── */}
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

            {/* Nivel detectado por IA */}
            {!analizandoComb && nivelDetectado && !mostrarSelectorComb && (
              <NivelDetectado nivel={nivelDetectado} onCorregir={() => setMostrarSelectorComb(true)} />
            )}

            {/* Fallback si IA falló o el usuario quiere corregir */}
            {!analizandoComb && (iaFalloComb || mostrarSelectorComb) && (
              <div style={{ marginBottom: 4 }}>
                {iaFalloComb && (
                  <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 10 }}>
                    No se pudo leer el nivel automáticamente, selecciona manualmente:
                  </p>
                )}
                <SelectorManual value={combustible} onChange={v => { setCombustible(v); setNivelDetectado(v) }} />
                {nivelDetectado && mostrarSelectorComb && !iaFalloComb && (
                  <button onClick={() => setMostrarSelectorComb(false)} style={{ fontSize: 11, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', marginBottom: 8 }}>
                    ← Volver al nivel detectado
                  </button>
                )}
              </div>
            )}
          </div>

          <div style={{ padding: '16px', paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
            <button onClick={confirmar} disabled={!listo || guardando} style={{ width: '100%', padding: '17px', borderRadius: 14, border: 'none', cursor: listo ? 'pointer' : 'not-allowed', background: listo && !guardando ? F : 'rgba(255,255,255,0.06)', color: listo && !guardando ? '#fff' : 'var(--muted)', fontSize: 16, fontWeight: 900 }}>
              {guardando ? 'Registrando salida…' : listo ? 'Confirmar salida ✓' : `Faltan ${[!fotoOdo && 'odómetro', !fotos360ok && `360° (${Object.keys(fotos360).length}/4)`, !fotoMarcador && 'combustible', !combustible && 'nivel', !kmInicio && 'km'].filter(Boolean).join(', ')}`}
            </button>
          </div>
        </div>
      )}

      {guardando && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: '#1C1C1C', borderRadius: 16, padding: '24px 32px', textAlign: 'center' }}>
            <p style={{ fontSize: 15, fontWeight: 700, color: '#F4EEDF' }}>Registrando salida…</p>
          </div>
        </div>
      )}
    </div>
  )
}
