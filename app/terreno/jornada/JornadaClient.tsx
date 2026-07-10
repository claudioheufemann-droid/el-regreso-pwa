'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import AppHeader from '@/components/ui/AppHeader'
import { createClient } from '@/lib/supabase/client'
import { Gauge, Fuel, CheckCircle2, AlertTriangle, Flag } from 'lucide-react'

const ORANGE = '#F97316'

interface Jornada {
  id: string
  km_inicio: number | null
  foto_odometro_inicio: string | null
  km_fin: number | null
  km_declarados: number | null
  km_gps: number | null
  diferencia_pct: number | null
  requiere_revision: boolean | null
  monto_reembolso: number | null
  estado: string
  iniciada_at: string
}

interface Carga {
  id: string
  monto: number
  litros: number | null
  registrado_at: string
}

function FotoSlot({ label, onCaptura, capturada }: { label: string; onCaptura: (file: File) => void; capturada: boolean }) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <button
      onClick={() => ref.current?.click()}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '13px 14px', borderRadius: 12, cursor: 'pointer',
        border: `1px solid ${capturada ? '#4ADE8055' : 'var(--border)'}`,
        background: capturada ? 'rgba(74,222,128,0.08)' : 'rgba(255,255,255,0.03)',
        color: capturada ? '#4ADE80' : 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: 700, textAlign: 'left', marginBottom: 12,
      }}
    >
      <input ref={ref} type="file" accept="image/*" capture="environment" hidden
        onChange={e => { const f = e.target.files?.[0]; if (f) onCaptura(f) }} />
      <Gauge size={16} />
      {capturada ? `✓ ${label} cargada` : `Tomar foto: ${label}`}
    </button>
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

export default function JornadaClient({ vendedorId }: { vendedorId: string }) {
  const router = useRouter()
  const supabase = createClient()

  const [jornada, setJornada] = useState<Jornada | null>(null)
  const [cargas, setCargas] = useState<Carga[]>([])
  const [loading, setLoading] = useState(true)

  // Inicio de jornada
  const [kmInicio, setKmInicio] = useState('')
  const [fotoInicioFile, setFotoInicioFile] = useState<File | null>(null)
  const [analizandoInicio, setAnalizandoInicio] = useState(false)
  const [creando, setCreando] = useState(false)

  // Cierre de jornada
  const [mostrarCierre, setMostrarCierre] = useState(false)
  const [kmFin, setKmFin] = useState('')
  const [fotoFinFile, setFotoFinFile] = useState<File | null>(null)
  const [analizandoFin, setAnalizandoFin] = useState(false)
  const [cerrando, setCerrando] = useState(false)
  const [resultado, setResultado] = useState<Jornada | null>(null)

  // Combustible
  const [mostrarCombustible, setMostrarCombustible] = useState(false)
  const [monto, setMonto] = useState('')
  const [litros, setLitros] = useState('')
  const [fotoBoletaFile, setFotoBoletaFile] = useState<File | null>(null)
  const [guardandoCarga, setGuardandoCarga] = useState(false)

  useEffect(() => {
    fetch('/api/terreno/jornada')
      .then(r => r.json())
      .then(j => setJornada(j))
      .finally(() => setLoading(false))
  }, [])

  async function analizar(file: File, tipo: 'inicio' | 'fin') {
    const setAnalizando = tipo === 'inicio' ? setAnalizandoInicio : setAnalizandoFin
    const setKm = tipo === 'inicio' ? setKmInicio : setKmFin
    setAnalizando(true)
    try {
      const base64 = await fileToBase64(file)
      const res = await fetch('/api/analizar-odometro', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imagen: base64, tipo: file.type }),
      })
      const { km } = await res.json()
      if (km) setKm(String(km))
    } catch { /* el vendedor puede corregir el km manualmente */ }
    setAnalizando(false)
  }

  async function subirFoto(file: File, nombre: string): Promise<string | null> {
    try {
      const path = `jornadas/${vendedorId}/${Date.now()}-${nombre}.jpg`
      const { error } = await supabase.storage.from('terreno-fotos').upload(path, file, { upsert: true, contentType: file.type || 'image/jpeg' })
      if (error) return null
      const { data: { publicUrl } } = supabase.storage.from('terreno-fotos').getPublicUrl(path)
      return publicUrl
    } catch { return null }
  }

  async function iniciarJornada() {
    if (!kmInicio || !fotoInicioFile) return
    setCreando(true)
    try {
      const fotoUrl = await subirFoto(fotoInicioFile, 'odometro-inicio')
      if (!fotoUrl) { alert('No se pudo subir la foto. Revisa tu conexión.'); return }
      const res = await fetch('/api/terreno/jornada', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ km_inicio: parseInt(kmInicio, 10), foto_odometro_inicio: fotoUrl }),
      })
      const data = await res.json()
      if (!res.ok) { alert(data.error ?? 'Error al iniciar la jornada'); return }
      setJornada(data)
    } finally {
      setCreando(false)
    }
  }

  async function cerrarJornada() {
    if (!jornada || !kmFin || !fotoFinFile) return
    setCerrando(true)
    try {
      const fotoUrl = await subirFoto(fotoFinFile, 'odometro-fin')
      if (!fotoUrl) { alert('No se pudo subir la foto. Revisa tu conexión.'); return }
      const res = await fetch(`/api/terreno/jornada/${jornada.id}/cerrar`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ km_fin: parseInt(kmFin, 10), foto_odometro_fin: fotoUrl }),
      })
      const data = await res.json()
      if (!res.ok) { alert(data.error ?? 'Error al cerrar la jornada'); return }
      setResultado(data)
      setJornada(null)
    } finally {
      setCerrando(false)
    }
  }

  async function registrarCarga() {
    if (!jornada || !monto) return
    setGuardandoCarga(true)
    try {
      const fotoUrl = fotoBoletaFile ? await subirFoto(fotoBoletaFile, 'boleta') : null
      const res = await fetch(`/api/terreno/jornada/${jornada.id}/combustible`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ monto: parseInt(monto, 10), litros: litros ? parseFloat(litros) : undefined, foto_boleta_url: fotoUrl ?? undefined }),
      })
      const data = await res.json()
      if (!res.ok) { alert(data.error ?? 'Error al registrar la carga'); return }
      setCargas(prev => [...prev, data])
      setMonto(''); setLitros(''); setFotoBoletaFile(null); setMostrarCombustible(false)
    } finally {
      setGuardandoCarga(false)
    }
  }

  if (loading) return <div style={{ background: 'var(--bg)', minHeight: '100vh' }} />

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh' }}>
      <AppHeader eyebrow="Terreno" title="Jornada y kilometraje" backHref="/terreno" />

      <div style={{ maxWidth: 520, margin: '0 auto', padding: '0 16px 100px' }}>

        {/* ── Resultado tras cerrar ── */}
        {resultado && (
          <div style={{
            background: resultado.requiere_revision ? 'rgba(255,102,102,0.06)' : 'rgba(74,222,128,0.06)',
            border: `1px solid ${resultado.requiere_revision ? 'rgba(255,102,102,0.3)' : 'rgba(74,222,128,0.3)'}`,
            borderRadius: 16, padding: 16, marginBottom: 18,
          }}>
            <p style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 900, color: resultado.requiere_revision ? '#FF6666' : '#4ADE80', marginBottom: 10 }}>
              {resultado.requiere_revision ? <AlertTriangle size={15} /> : <CheckCircle2 size={15} />}
              Jornada cerrada {resultado.requiere_revision ? '— requiere revisión' : ''}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: 'rgba(255,255,255,0.65)' }}>
              <span>Km declarados (tablero): <strong style={{ color: 'var(--cream)' }}>{resultado.km_declarados}</strong></span>
              <span>Km calculados por GPS: <strong style={{ color: 'var(--cream)' }}>{resultado.km_gps?.toFixed(1)}</strong></span>
              <span>Diferencia: <strong style={{ color: resultado.requiere_revision ? '#FF6666' : 'var(--cream)' }}>{resultado.diferencia_pct?.toFixed(1)}%</strong></span>
              <span>Reembolso calculado: <strong style={{ color: ORANGE }}>${resultado.monto_reembolso?.toLocaleString('es-CL')}</strong></span>
            </div>
            <button onClick={() => router.push('/terreno')} style={{ marginTop: 14, width: '100%', padding: '11px 0', borderRadius: 10, border: 'none', cursor: 'pointer', background: ORANGE, color: '#080808', fontSize: 13, fontWeight: 900 }}>
              Volver al panel
            </button>
          </div>
        )}

        {/* ── Sin jornada abierta: iniciar ── */}
        {!jornada && !resultado && (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 18, padding: 18 }}>
            <p style={{ fontSize: 14, fontWeight: 800, color: 'var(--cream)', marginBottom: 4 }}>Inicio de jornada</p>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 16 }}>
              Ingresa el kilometraje actual y toma una foto del odómetro antes de salir a terreno.
            </p>

            <label style={{ display: 'block', fontSize: 10, color: 'rgba(255,255,255,0.35)', marginBottom: 5, fontWeight: 600, textTransform: 'uppercase' }}>Kilometraje inicial</label>
            <input
              type="number" min={0} value={kmInicio} onChange={e => setKmInicio(e.target.value)} placeholder="Ej: 45230"
              style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--cream)', fontSize: 14, outline: 'none', marginBottom: 12 }}
            />

            <FotoSlot label="odómetro" capturada={!!fotoInicioFile} onCaptura={f => { setFotoInicioFile(f); analizar(f, 'inicio') }} />
            {analizandoInicio && <p style={{ fontSize: 11, color: ORANGE, marginTop: -6, marginBottom: 12 }}>Leyendo odómetro con IA…</p>}

            <button
              onClick={iniciarJornada}
              disabled={!kmInicio || !fotoInicioFile || creando}
              style={{
                width: '100%', padding: '13px 0', borderRadius: 12, border: 'none', cursor: 'pointer',
                background: kmInicio && fotoInicioFile ? `linear-gradient(135deg, ${ORANGE}, #C2410C)` : 'rgba(255,255,255,0.06)',
                color: kmInicio && fotoInicioFile ? '#080808' : 'rgba(255,255,255,0.35)', fontSize: 14, fontWeight: 900,
                opacity: creando ? 0.7 : 1,
              }}
            >
              {creando ? 'Iniciando…' : 'Iniciar jornada'}
            </button>
          </div>
        )}

        {/* ── Jornada abierta ── */}
        {jornada && (
          <>
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 18, padding: 18, marginBottom: 14 }}>
              <p style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 800, color: '#4ADE80', marginBottom: 10 }}>
                <CheckCircle2 size={14} /> Jornada en curso
              </p>
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
                Km inicial: <strong style={{ color: 'var(--cream)' }}>{jornada.km_inicio}</strong> · Desde las {new Date(jornada.iniciada_at).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>

            {/* ── Combustible ── */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 18, padding: 18, marginBottom: 14 }}>
              <p style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 800, color: 'var(--cream)', marginBottom: cargas.length || mostrarCombustible ? 12 : 0 }}>
                <Fuel size={15} color={ORANGE} /> Combustible
              </p>

              {cargas.map(c => (
                <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'rgba(255,255,255,0.55)', marginBottom: 6 }}>
                  <span>{new Date(c.registrado_at).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}{c.litros ? ` · ${c.litros}L` : ''}</span>
                  <strong style={{ color: ORANGE }}>${c.monto.toLocaleString('es-CL')}</strong>
                </div>
              ))}

              {!mostrarCombustible ? (
                <button onClick={() => setMostrarCombustible(true)}
                  style={{ width: '100%', marginTop: cargas.length ? 8 : 0, padding: '10px 0', borderRadius: 10, border: `1px solid ${ORANGE}55`, background: `${ORANGE}15`, color: ORANGE, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                  + Registrar carga de combustible
                </button>
              ) : (
                <div style={{ marginTop: 12 }}>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                    <input type="number" min={0} value={monto} onChange={e => setMonto(e.target.value)} placeholder="Monto $"
                      style={{ flex: 1, padding: '9px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--cream)', fontSize: 13, outline: 'none' }} />
                    <input type="number" min={0} step={0.1} value={litros} onChange={e => setLitros(e.target.value)} placeholder="Litros (opcional)"
                      style={{ flex: 1, padding: '9px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--cream)', fontSize: 13, outline: 'none' }} />
                  </div>
                  <FotoSlot label="boleta (opcional)" capturada={!!fotoBoletaFile} onCaptura={setFotoBoletaFile} />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={registrarCarga} disabled={!monto || guardandoCarga}
                      style={{ flex: 1, padding: '10px 0', borderRadius: 9, border: 'none', cursor: 'pointer', background: monto ? ORANGE : 'rgba(255,255,255,0.06)', color: monto ? '#080808' : 'rgba(255,255,255,0.35)', fontSize: 12, fontWeight: 900, opacity: guardandoCarga ? 0.7 : 1 }}>
                      {guardandoCarga ? 'Guardando…' : 'Guardar'}
                    </button>
                    <button onClick={() => setMostrarCombustible(false)}
                      style={{ padding: '10px 14px', borderRadius: 9, border: '1px solid var(--border)', background: 'transparent', color: 'rgba(255,255,255,0.4)', fontSize: 12, cursor: 'pointer' }}>
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* ── Cierre de jornada ── */}
            {!mostrarCierre ? (
              <button onClick={() => setMostrarCierre(true)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '13px 0', borderRadius: 12, border: 'none', cursor: 'pointer', background: `linear-gradient(135deg, ${ORANGE}, #C2410C)`, color: '#080808', fontSize: 14, fontWeight: 900 }}>
                <Flag size={16} /> Cerrar jornada
              </button>
            ) : (
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 18, padding: 18 }}>
                <p style={{ fontSize: 14, fontWeight: 800, color: 'var(--cream)', marginBottom: 4 }}>Fin de jornada</p>
                <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 16 }}>
                  Ingresa el kilometraje final y toma la foto del odómetro para cerrar el día.
                </p>

                <label style={{ display: 'block', fontSize: 10, color: 'rgba(255,255,255,0.35)', marginBottom: 5, fontWeight: 600, textTransform: 'uppercase' }}>Kilometraje final</label>
                <input
                  type="number" min={jornada.km_inicio ?? 0} value={kmFin} onChange={e => setKmFin(e.target.value)} placeholder="Ej: 45310"
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--cream)', fontSize: 14, outline: 'none', marginBottom: 12 }}
                />

                <FotoSlot label="odómetro final" capturada={!!fotoFinFile} onCaptura={f => { setFotoFinFile(f); analizar(f, 'fin') }} />
                {analizandoFin && <p style={{ fontSize: 11, color: ORANGE, marginTop: -6, marginBottom: 12 }}>Leyendo odómetro con IA…</p>}

                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={cerrarJornada}
                    disabled={!kmFin || !fotoFinFile || cerrando}
                    style={{
                      flex: 1, padding: '13px 0', borderRadius: 12, border: 'none', cursor: 'pointer',
                      background: kmFin && fotoFinFile ? `linear-gradient(135deg, ${ORANGE}, #C2410C)` : 'rgba(255,255,255,0.06)',
                      color: kmFin && fotoFinFile ? '#080808' : 'rgba(255,255,255,0.35)', fontSize: 14, fontWeight: 900,
                      opacity: cerrando ? 0.7 : 1,
                    }}
                  >
                    {cerrando ? 'Cerrando…' : 'Confirmar cierre'}
                  </button>
                  <button onClick={() => setMostrarCierre(false)}
                    style={{ padding: '13px 16px', borderRadius: 12, border: '1px solid var(--border)', background: 'transparent', color: 'rgba(255,255,255,0.4)', fontSize: 12, cursor: 'pointer' }}>
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
