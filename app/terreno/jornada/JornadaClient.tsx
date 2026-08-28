'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { upsertOrQueue } from '@/lib/offlineQueue'
import { uploadConTimeout, queuePhoto } from '@/lib/offlinePhotoQueue'
import { compressImage } from '@/lib/compress-image'
import { fetchConTimeout } from '@/lib/utils'
import { Fuel, CheckCircle2, AlertTriangle, Flag, ChevronLeft, Camera } from 'lucide-react'
import { ErrorState, Skeleton } from '@/components/ui/States'
import { C, TAP, fPeso, fHora, cardStyle, btnPrimario } from '../theme'

/**
 * Jornada y kilometraje — tema claro, misma lógica de siempre.
 *
 * Sólo cambia el aspecto: la mecánica (id generado en el cliente, foto en
 * segundo plano con cola offline, lectura del odómetro con IA y cálculo de
 * reembolso en el servidor) queda igual.
 */

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
        width: '100%', display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer',
        minHeight: 50, padding: '0 14px', borderRadius: 12, marginBottom: 12, textAlign: 'left',
        border: `1px solid ${capturada ? C.green : C.line}`,
        background: capturada ? C.greenSoft : C.card,
        color: capturada ? C.green : C.muted, fontSize: 13.5, fontWeight: 700,
      }}
    >
      <input ref={ref} type="file" accept="image/*" capture="environment" hidden
        onChange={e => { const f = e.target.files?.[0]; if (f) onCaptura(f); e.target.value = '' }} />
      {capturada ? <CheckCircle2 size={17} /> : <Camera size={17} />}
      {capturada ? `${label} lista` : `Tomar foto: ${label}`}
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

const inputStyle: React.CSSProperties = {
  width: '100%', minHeight: 48, padding: '0 12px', borderRadius: 11,
  border: `1px solid ${C.line}`, background: C.bg, color: C.text, fontSize: 16, outline: 'none',
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 11.5, fontWeight: 700, color: C.muted, marginBottom: 6,
}

export default function JornadaClient({ vendedorId }: { vendedorId: string }) {
  const router = useRouter()
  const supabase = createClient()

  const [jornada, setJornada] = useState<Jornada | null>(null)
  const [cargas, setCargas] = useState<Carga[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [kmInicio, setKmInicio] = useState('')
  const [fotoInicioFile, setFotoInicioFile] = useState<File | null>(null)
  const [analizandoInicio, setAnalizandoInicio] = useState(false)
  const [creando, setCreando] = useState(false)

  const [mostrarCierre, setMostrarCierre] = useState(false)
  const [kmFin, setKmFin] = useState('')
  const [fotoFinFile, setFotoFinFile] = useState<File | null>(null)
  const [analizandoFin, setAnalizandoFin] = useState(false)
  const [cerrando, setCerrando] = useState(false)
  const [resultado, setResultado] = useState<Jornada | null>(null)
  const [cierrePendiente, setCierrePendiente] = useState(false)

  const [mostrarCombustible, setMostrarCombustible] = useState(false)
  const [monto, setMonto] = useState('')
  const [litros, setLitros] = useState('')
  const [fotoBoletaFile, setFotoBoletaFile] = useState<File | null>(null)
  const [guardandoCarga, setGuardandoCarga] = useState(false)

  // Este fallo no era cosmético: sin `.catch`, un error de red dejaba
  // `jornada` en null y la pantalla ofrecía "Inicio de jornada" aunque el
  // vendedor YA tuviera una abierta — abriendo una segunda y ensuciando el
  // cálculo de kilometraje del día. Ahora un fallo se declara como fallo.
  const cargar = useCallback(() => {
    setLoading(true)
    setError(null)
    fetch('/api/terreno/jornada')
      .then(async r => {
        if (!r.ok) throw new Error(`La API respondió ${r.status}`)
        return r.json()
      })
      .then(j => setJornada(j))
      .catch(err => setError(err instanceof Error ? err.message : 'Error desconocido'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { cargar() }, [cargar])

  async function analizar(file: File, tipo: 'inicio' | 'fin') {
    const setAnalizando = tipo === 'inicio' ? setAnalizandoInicio : setAnalizandoFin
    const setKm = tipo === 'inicio' ? setKmInicio : setKmFin
    setAnalizando(true)
    try {
      const comprimido = await compressImage(file)
      const base64 = await fileToBase64(comprimido)
      const res = await fetchConTimeout('/api/analizar-odometro', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imagen: base64, tipo: comprimido.type }),
      })
      const { km } = await res.json()
      if (km) setKm(String(km))
    } catch { /* el vendedor puede corregir el km a mano */ }
    setAnalizando(false)
  }

  // Arranca de inmediato con un id generado en el cliente — no depende de la
  // red para existir. La foto sube en segundo plano y, sin señal, queda en
  // cola y se sube sola después.
  function iniciarJornada() {
    if (!kmInicio || !fotoInicioFile) return
    setCreando(true)
    const id = crypto.randomUUID()
    const nueva: Jornada = {
      id, km_inicio: parseInt(kmInicio, 10), foto_odometro_inicio: null,
      km_fin: null, km_declarados: null, km_gps: null, diferencia_pct: null,
      requiere_revision: null, monto_reembolso: null, estado: 'abierta',
      iniciada_at: new Date().toISOString(),
    }
    upsertOrQueue(supabase, 'jornadas_terreno', {
      id, vendedor_id: vendedorId, km_inicio: nueva.km_inicio, estado: 'abierta', iniciada_at: nueva.iniciada_at,
    })
    setJornada(nueva)
    setCreando(false)

    const path = `jornadas/${vendedorId}/${Date.now()}-odometro-inicio.jpg`
    uploadConTimeout(supabase, { bucket: 'terreno-fotos', path, table: 'jornadas_terreno', rowId: id, campo: 'foto_odometro_inicio' }, fotoInicioFile)
      .then(url => { if (url) setJornada(j => j && j.id === id ? { ...j, foto_odometro_inicio: url } : j) })
  }

  // El cierre calcula reembolso y km reales por GPS en el servidor — sí
  // necesita señal. Si la foto no sube al toque se encola (no se pierde) y se
  // avisa para reintentar cuando haya conexión.
  async function cerrarJornada() {
    if (!jornada || !kmFin || !fotoFinFile) return
    setCerrando(true)
    setCierrePendiente(false)
    try {
      const path = `jornadas/${vendedorId}/${Date.now()}-odometro-fin.jpg`
      const spec = { bucket: 'terreno-fotos', path, table: 'jornadas_terreno', rowId: jornada.id, campo: 'foto_odometro_fin' }
      let fotoUrl: string | null = null
      if (!navigator.onLine) {
        await queuePhoto(spec, fotoFinFile)
      } else {
        fotoUrl = await uploadConTimeout(supabase, spec, fotoFinFile)
      }
      if (!fotoUrl) { setCierrePendiente(true); return }

      const res = await fetch(`/api/terreno/jornada/${jornada.id}/cerrar`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ km_fin: parseInt(kmFin, 10), foto_odometro_fin: fotoUrl }),
      })
      const data = await res.json()
      if (!res.ok) { alert(data.error ?? 'Error al cerrar la jornada'); return }
      setResultado(data)
      setJornada(null)
    } catch {
      setCierrePendiente(true)
    } finally {
      setCerrando(false)
    }
  }

  function registrarCarga() {
    if (!jornada || !monto) return
    setGuardandoCarga(true)
    const id = crypto.randomUUID()
    const montoNum = parseInt(monto, 10)
    const litrosNum = litros ? parseFloat(litros) : null
    upsertOrQueue(supabase, 'cargas_combustible_terreno', {
      id, jornada_id: jornada.id, vendedor_id: vendedorId, monto: montoNum, litros: litrosNum,
      registrado_at: new Date().toISOString(),
    })
    setCargas(prev => [...prev, { id, monto: montoNum, litros: litrosNum, registrado_at: new Date().toISOString() }])
    setMonto(''); setLitros(''); setMostrarCombustible(false)
    setGuardandoCarga(false)

    if (fotoBoletaFile) {
      const path = `jornadas/${vendedorId}/${Date.now()}-boleta.jpg`
      uploadConTimeout(supabase, { bucket: 'terreno-fotos', path, table: 'cargas_combustible_terreno', rowId: id, campo: 'foto_boleta_url' }, fotoBoletaFile)
    }
    setFotoBoletaFile(null)
  }

  if (loading) {
    return (
      <div style={{ background: C.bg, minHeight: '100vh', padding: '20px 16px' }}>
        <div style={{ maxWidth: 720, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Skeleton height={36} width={110} radius={100} />
          <Skeleton height={30} width="60%" />
          <Skeleton height={220} radius={16} />
        </div>
      </div>
    )
  }

  // Un error acá NO puede caer al formulario de "iniciar jornada": no
  // sabemos si ya hay una abierta, y ofrecerlo invitaría a duplicarla.
  if (error) {
    return (
      <div style={{ background: C.bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <ErrorState
          title="No pudimos consultar tu jornada"
          hint="Sin esta respuesta no sabemos si ya tienes una jornada abierta, así que no te dejamos iniciar otra. Reintenta cuando tengas señal."
          detail={error}
          onRetry={cargar}
        />
      </div>
    )
  }

  const listoInicio = !!kmInicio && !!fotoInicioFile
  const listoFin = !!kmFin && !!fotoFinFile

  return (
    <div style={{ minHeight: '100vh', background: C.bg, paddingBottom: 'max(140px, calc(env(safe-area-inset-bottom, 0px) + 120px))' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '20px 16px 0' }}>
        <button
          onClick={() => router.push('/terreno')}
          aria-label="Volver"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4, minHeight: 36, cursor: 'pointer',
            background: C.card, border: `1px solid ${C.line}`, borderRadius: 100,
            padding: '7px 14px 7px 10px', color: C.blue, fontSize: 13, fontWeight: 700, marginBottom: 14,
          }}
        >
          <ChevronLeft size={17} strokeWidth={2.5} color={C.blue} />
          Volver
        </button>

        <div style={{ marginBottom: 16 }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: C.muted, letterSpacing: '0.04em' }}>TERRENO</p>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: C.text, letterSpacing: '-0.5px' }}>Jornada y kilometraje</h1>
        </div>

        {/* Resultado tras cerrar */}
        {resultado && (
          <div style={{
            background: resultado.requiere_revision ? C.redSoft : C.greenSoft,
            border: `1px solid ${resultado.requiere_revision ? '#FECACA' : '#A7F3D0'}`,
            borderRadius: 16, padding: 16, marginBottom: 16,
          }}>
            <p style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 14, fontWeight: 800, marginBottom: 12, color: resultado.requiere_revision ? C.red : C.green }}>
              {resultado.requiere_revision ? <AlertTriangle size={17} /> : <CheckCircle2 size={17} />}
              Jornada cerrada{resultado.requiere_revision ? ' — requiere revisión' : ''}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, fontSize: 13, color: C.muted }}>
              <Dato label="Km declarados (tablero)" valor={String(resultado.km_declarados ?? '—')} />
              <Dato label="Km calculados por GPS" valor={resultado.km_gps?.toFixed(1) ?? '—'} />
              <Dato label="Diferencia" valor={`${resultado.diferencia_pct?.toFixed(1) ?? '—'}%`} destacado={!!resultado.requiere_revision} />
              <Dato label="Reembolso calculado" valor={resultado.monto_reembolso != null ? fPeso(resultado.monto_reembolso) : '—'} />
            </div>
            <button onClick={() => router.push('/terreno')} style={{ ...btnPrimario, marginTop: 14 }}>
              Volver al panel
            </button>
          </div>
        )}

        {/* Sin jornada abierta */}
        {!jornada && !resultado && (
          <div style={{ ...cardStyle, padding: 16 }}>
            <p style={{ fontSize: 15.5, fontWeight: 800, color: C.text, marginBottom: 4 }}>Inicio de jornada</p>
            <p style={{ fontSize: 13, color: C.muted, marginBottom: 16, lineHeight: 1.45 }}>
              Ingresa el kilometraje actual y toma una foto del odómetro antes de salir.
            </p>

            <label style={labelStyle}>Kilometraje inicial</label>
            <input
              type="number" inputMode="numeric" min={0} value={kmInicio}
              onChange={e => setKmInicio(e.target.value)} placeholder="Ej: 45230"
              style={{ ...inputStyle, marginBottom: 12 }}
            />

            <FotoSlot label="odómetro" capturada={!!fotoInicioFile} onCaptura={f => { setFotoInicioFile(f); analizar(f, 'inicio') }} />
            {analizandoInicio && <p style={{ fontSize: 12, color: C.blue, marginTop: -6, marginBottom: 12, fontWeight: 600 }}>Leyendo el odómetro…</p>}

            <button
              onClick={iniciarJornada}
              disabled={!listoInicio || creando}
              style={{
                ...btnPrimario,
                background: listoInicio ? C.hero : C.line,
                color: listoInicio ? '#fff' : C.faint,
                cursor: listoInicio ? 'pointer' : 'not-allowed',
                opacity: creando ? 0.7 : 1,
              }}
            >
              {creando ? 'Iniciando…' : 'Iniciar jornada'}
            </button>
          </div>
        )}

        {/* Jornada abierta */}
        {jornada && (
          <>
            <div style={{ ...cardStyle, padding: 15, marginBottom: 12, background: C.greenSoft, border: '1px solid #A7F3D0' }}>
              <p style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 800, color: C.green, marginBottom: 5 }}>
                <CheckCircle2 size={16} /> Jornada en curso
              </p>
              <p style={{ fontSize: 13, color: C.text }}>
                Km inicial: <strong>{jornada.km_inicio}</strong> · desde las {fHora(jornada.iniciada_at)}
              </p>
            </div>

            {/* Combustible */}
            <div style={{ ...cardStyle, padding: 15, marginBottom: 12 }}>
              <p style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13.5, fontWeight: 800, color: C.text, marginBottom: cargas.length || mostrarCombustible ? 11 : 0 }}>
                <Fuel size={16} color={C.amber} /> Combustible
              </p>

              {cargas.map(c => (
                <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, color: C.muted, marginBottom: 6 }}>
                  <span>{fHora(c.registrado_at)}{c.litros ? ` · ${c.litros} L` : ''}</span>
                  <strong style={{ color: C.amber }}>{fPeso(c.monto)}</strong>
                </div>
              ))}

              {!mostrarCombustible ? (
                <button
                  onClick={() => setMostrarCombustible(true)}
                  style={{
                    width: '100%', minHeight: TAP, marginTop: cargas.length ? 8 : 0, borderRadius: 11, cursor: 'pointer',
                    border: `1px solid ${C.line}`, background: C.amberSoft, color: C.amber, fontSize: 13.5, fontWeight: 700,
                  }}
                >
                  + Registrar carga
                </button>
              ) : (
                <div style={{ marginTop: 12 }}>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                    <input type="number" inputMode="numeric" min={0} value={monto} onChange={e => setMonto(e.target.value)} placeholder="Monto $" style={inputStyle} />
                    <input type="number" inputMode="decimal" min={0} step={0.1} value={litros} onChange={e => setLitros(e.target.value)} placeholder="Litros" style={inputStyle} />
                  </div>
                  <FotoSlot label="boleta (opcional)" capturada={!!fotoBoletaFile} onCaptura={setFotoBoletaFile} />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={registrarCarga}
                      disabled={!monto || guardandoCarga}
                      style={{
                        flex: 1, minHeight: TAP, borderRadius: 11, border: 'none',
                        cursor: monto ? 'pointer' : 'not-allowed',
                        background: monto ? C.hero : C.line, color: monto ? '#fff' : C.faint,
                        fontSize: 13.5, fontWeight: 800, opacity: guardandoCarga ? 0.7 : 1,
                      }}
                    >
                      {guardandoCarga ? 'Guardando…' : 'Guardar'}
                    </button>
                    <button
                      onClick={() => setMostrarCombustible(false)}
                      style={{ minHeight: TAP, padding: '0 16px', borderRadius: 11, border: `1px solid ${C.line}`, background: C.card, color: C.muted, fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Cierre */}
            {!mostrarCierre ? (
              <button onClick={() => setMostrarCierre(true)} style={btnPrimario}>
                <Flag size={17} /> Cerrar jornada
              </button>
            ) : (
              <div style={{ ...cardStyle, padding: 16 }}>
                <p style={{ fontSize: 15.5, fontWeight: 800, color: C.text, marginBottom: 4 }}>Fin de jornada</p>
                <p style={{ fontSize: 13, color: C.muted, marginBottom: 16, lineHeight: 1.45 }}>
                  Ingresa el kilometraje final y toma la foto del odómetro para cerrar el día.
                </p>

                <label style={labelStyle}>Kilometraje final</label>
                <input
                  type="number" inputMode="numeric" min={jornada.km_inicio ?? 0} value={kmFin}
                  onChange={e => setKmFin(e.target.value)} placeholder="Ej: 45310"
                  style={{ ...inputStyle, marginBottom: 12 }}
                />

                <FotoSlot label="odómetro final" capturada={!!fotoFinFile} onCaptura={f => { setFotoFinFile(f); analizar(f, 'fin') }} />
                {analizandoFin && <p style={{ fontSize: 12, color: C.blue, marginTop: -6, marginBottom: 12, fontWeight: 600 }}>Leyendo el odómetro…</p>}

                {cierrePendiente && (
                  <p style={{ fontSize: 12.5, color: C.amber, marginBottom: 12, lineHeight: 1.5, background: C.amberSoft, border: '1px solid #FDE68A', borderRadius: 10, padding: '10px 12px' }}>
                    Sin señal ahora mismo. La foto quedó guardada en el teléfono y se sube sola apenas
                    tengas conexión — vuelve a esta pantalla y toca &quot;Confirmar cierre&quot; de nuevo.
                  </p>
                )}

                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={cerrarJornada}
                    disabled={!listoFin || cerrando}
                    style={{
                      ...btnPrimario, flex: 1, width: 'auto',
                      background: listoFin ? C.hero : C.line,
                      color: listoFin ? '#fff' : C.faint,
                      cursor: listoFin ? 'pointer' : 'not-allowed',
                      opacity: cerrando ? 0.7 : 1,
                    }}
                  >
                    {cerrando ? 'Cerrando…' : 'Confirmar cierre'}
                  </button>
                  <button
                    onClick={() => setMostrarCierre(false)}
                    style={{ minHeight: 52, padding: '0 16px', borderRadius: 14, border: `1px solid ${C.line}`, background: C.card, color: C.muted, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
                  >
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

function Dato({ label, valor, destacado = false }: { label: string; valor: string; destacado?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
      <span>{label}</span>
      <strong style={{ color: destacado ? C.red : C.text, whiteSpace: 'nowrap' }}>{valor}</strong>
    </div>
  )
}
