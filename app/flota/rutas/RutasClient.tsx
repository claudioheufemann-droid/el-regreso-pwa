'use client'

import { useState, useRef } from 'react'
import * as XLSX from 'xlsx'
import { Plus, Trash2, Zap, MapPin, ExternalLink, Save, ChevronDown, CheckCircle, FileUp, PenLine } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

const F = '#F97316'
const F_DIM = 'rgba(249,115,22,0.12)'
const F_BORDER = 'rgba(249,115,22,0.28)'
const T = '#D4AF37'

interface Vehiculo { id: string; nombre: string; tipo: string; patente: string | null }
interface Parada { id?: string; orden: number; cliente_nombre: string; direccion: string; lat: number | null; lng: number | null; completada: boolean }
interface Ruta { id: string; nombre: string | null; vehiculo_id: string; fecha: string; estado: string; km_teoricos: number | null; ruta_paradas: Parada[] }

interface Props { vehiculos: Vehiculo[]; rutas: Ruta[] }

// ── Helpers geoespaciales ──────────────────────────────────────────────────────
function haversine(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371, dLat = (lat2 - lat1) * Math.PI / 180, dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function optimizarRuta(paradas: Parada[]): Parada[] {
  const withCoords = paradas.filter(p => p.lat && p.lng)
  const withoutCoords = paradas.filter(p => !p.lat || !p.lng)
  if (withCoords.length === 0) return paradas
  let curLat = -39.8196, curLng = -73.2452
  const remaining = [...withCoords]
  const ordered: Parada[] = []
  while (remaining.length > 0) {
    let minDist = Infinity, minIdx = 0
    for (let i = 0; i < remaining.length; i++) {
      const d = haversine(curLat, curLng, remaining[i].lat!, remaining[i].lng!)
      if (d < minDist) { minDist = d; minIdx = i }
    }
    ordered.push(remaining.splice(minIdx, 1)[0])
    curLat = ordered.at(-1)!.lat!; curLng = ordered.at(-1)!.lng!
  }
  return [...ordered, ...withoutCoords].map((p, i) => ({ ...p, orden: i + 1 }))
}

function estimarKm(paradas: Parada[]): number {
  const withCoords = paradas.filter(p => p.lat && p.lng)
  let total = 0, prevLat = -39.8196, prevLng = -73.2452
  for (const p of withCoords) {
    total += haversine(prevLat, prevLng, p.lat!, p.lng!)
    prevLat = p.lat!; prevLng = p.lng!
  }
  total += haversine(prevLat, prevLng, -39.8196, -73.2452)
  return Math.round(total * 1.35)
}

async function geocodificar(direccion: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const q = encodeURIComponent(direccion + ', Valdivia, Chile')
    const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`, {
      headers: { 'Accept-Language': 'es', 'User-Agent': 'ElRegresoFlota/1.0' }
    })
    const data = await res.json()
    if (!data[0]) return null
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
  } catch { return null }
}

function generarURLGoogleMaps(paradas: Parada[]): string {
  const origin = encodeURIComponent('El Regreso Beer, Valdivia, Chile')
  const waypoints = paradas.map(p => encodeURIComponent(p.direccion + ', Valdivia, Chile'))
  return `https://www.google.com/maps/dir/${origin}/${waypoints.join('/')}/${origin}`
}

// ── Helpers Excel ──────────────────────────────────────────────────────────────
function normalizeKey(k: string) {
  return k.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '')
}

function findCol(row: Record<string, unknown>, keys: string[]) {
  const entries = Object.entries(row)
  for (const key of keys) {
    const found = entries.find(([k]) => normalizeKey(k) === key)
    if (found !== undefined) return String(found[1] ?? '').trim()
  }
  return ''
}

function parsearFilas(rows: Record<string, unknown>[]): Parada[] {
  return rows
    .filter(r => findCol(r, ['direccion', 'calle']) || findCol(r, ['numero', 'nro', 'n']))
    .map((r, i) => {
      const ciudad = findCol(r, ['ciudad']) || 'Valdivia'
      const dir = findCol(r, ['direccion', 'calle'])
      const num = findCol(r, ['numero', 'nro', 'n'])
      const cliente = findCol(r, ['cliente', 'destinatario', 'nombre'])
      const fullAddr = [dir, num].filter(Boolean).join(' ') + (ciudad ? `, ${ciudad}` : '')
      return {
        orden: i + 1,
        cliente_nombre: cliente || `${dir} ${num}`.trim(),
        direccion: fullAddr,
        lat: null, lng: null, completada: false,
      }
    })
}

// ── Componente principal ───────────────────────────────────────────────────────
export default function RutasClient({ vehiculos, rutas }: Props) {
  const supabase = createClient()
  const [tab, setTab] = useState<'nueva' | 'historial'>('nueva')
  const [vehiculoId, setVehiculoId] = useState('')
  const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0])
  const [nombreRuta, setNombreRuta] = useState('')
  const [paradas, setParadas] = useState<Parada[]>([])
  const [geocodificando, setGeocodificando] = useState(false)
  const [optimizando, setOptimizando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [kmEst, setKmEst] = useState<number | null>(null)
  const [rutaGuardada, setRutaGuardada] = useState(false)

  // Modos de ingreso
  const [modoAdd, setModoAdd] = useState<'manual' | 'excel'>('manual')

  // Formulario quick-add manual
  const [qCiudad, setQCiudad] = useState('Valdivia')
  const [qDir, setQDir] = useState('')
  const [qNum, setQNum] = useState('')
  const [qCliente, setQCliente] = useState('')

  // Excel
  const excelRef = useRef<HTMLInputElement>(null)
  const [excelPreview, setExcelPreview] = useState<Parada[]>([])
  const [importando, setImportando] = useState(false)
  const [excelError, setExcelError] = useState('')

  // ── Paradas ──────────────────────────────────────────────────────────────────
  function actualizarParada(idx: number, campo: 'cliente_nombre' | 'direccion', valor: string) {
    setParadas(prev => prev.map((p, i) => i === idx ? { ...p, [campo]: valor } : p))
  }

  function eliminarParada(idx: number) {
    setParadas(prev => prev.filter((_, i) => i !== idx).map((p, i) => ({ ...p, orden: i + 1 })))
  }

  // ── Quick-add manual ──────────────────────────────────────────────────────────
  function agregarManual() {
    if (!qDir.trim() || !qNum.trim()) return
    const ciudad = qCiudad.trim() || 'Valdivia'
    const fullAddr = `${qDir.trim()} ${qNum.trim()}, ${ciudad}`
    setParadas(prev => [...prev, {
      orden: prev.length + 1,
      cliente_nombre: qCliente.trim() || `${qDir.trim()} ${qNum.trim()}`,
      direccion: fullAddr,
      lat: null, lng: null, completada: false,
    }])
    setQDir(''); setQNum(''); setQCliente('')
    // qCiudad se mantiene para la siguiente parada
  }

  // ── Import Excel / CSV ────────────────────────────────────────────────────────
  async function handleExcel(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImportando(true)
    setExcelError('')
    setExcelPreview([])
    try {
      const buffer = await file.arrayBuffer()
      const wb = XLSX.read(buffer, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(ws) as Record<string, unknown>[]
      const parsed = parsearFilas(rows)
      if (parsed.length === 0) {
        setExcelError('No se encontraron filas válidas. Verifica que el archivo tenga columnas Ciudad, Dirección y Número.')
      } else {
        setExcelPreview(parsed)
      }
    } catch {
      setExcelError('Error al leer el archivo. Verifica que sea .xlsx, .xls o .csv válido.')
    } finally {
      setImportando(false)
      e.target.value = ''
    }
  }

  function confirmarImport() {
    setParadas(prev => [
      ...prev,
      ...excelPreview.map((p, i) => ({ ...p, orden: prev.length + i + 1 })),
    ])
    setExcelPreview([])
  }

  // ── Geocodificación y optimización ────────────────────────────────────────────
  async function geocodificarTodas() {
    setGeocodificando(true)
    const updated = await Promise.all(
      paradas.map(async p => {
        if (!p.direccion.trim() || (p.lat && p.lng)) return p
        const coords = await geocodificar(p.direccion)
        return coords ? { ...p, ...coords } : p
      })
    )
    setParadas(updated)
    setGeocodificando(false)
  }

  async function optimizar() {
    setOptimizando(true)
    await geocodificarTodas()
    setParadas(prev => {
      const opt = optimizarRuta(prev)
      setKmEst(estimarKm(opt))
      return opt
    })
    setOptimizando(false)
  }

  async function guardar() {
    if (!vehiculoId || paradas.length === 0) return
    setGuardando(true)
    try {
      const { data: ruta } = await supabase.from('rutas_reparto').insert({
        vehiculo_id: vehiculoId,
        nombre: nombreRuta || `Reparto ${fecha}`,
        fecha,
        km_teoricos: kmEst,
        estado: 'pendiente',
      }).select('id').single()

      if (ruta) {
        await supabase.from('ruta_paradas').insert(
          paradas.map(p => ({ ruta_id: ruta.id, orden: p.orden, cliente_nombre: p.cliente_nombre, direccion: p.direccion, lat: p.lat, lng: p.lng }))
        )
      }
      setRutaGuardada(true)
      setTimeout(() => { setParadas([]); setNombreRuta(''); setKmEst(null); setRutaGuardada(false) }, 2000)
    } finally {
      setGuardando(false)
    }
  }

  const puedeOptimizar = paradas.some(p => p.direccion.trim())
  const puedeGuardar = vehiculoId && paradas.length > 0 && paradas.every(p => p.cliente_nombre && p.direccion)

  return (
    <div style={{ padding: '28px 24px', maxWidth: 800 }}>
      <h1 style={{ fontSize: 24, fontWeight: 900, color: 'var(--cream)', marginBottom: 24, letterSpacing: '-0.5px' }}>Planificación de Rutas</h1>

      {/* Tabs */}
      <div style={{ display: 'flex', background: '#1C1C1C', borderRadius: 12, padding: 4, gap: 4, marginBottom: 24 }}>
        {(['nueva', 'historial'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ flex: 1, padding: '10px', borderRadius: 9, border: 'none', cursor: 'pointer', background: tab === t ? F : 'transparent', color: tab === t ? '#fff' : 'var(--muted)', fontSize: 13, fontWeight: 700 }}>
            {t === 'nueva' ? '+ Nueva Ruta' : 'Historial'}
          </button>
        ))}
      </div>

      {tab === 'nueva' && (
        <div>
          {/* Cabecera */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div>
              <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 6 }}>Vehículo *</label>
              <select value={vehiculoId} onChange={e => setVehiculoId(e.target.value)} style={{ width: '100%', padding: '11px 12px', borderRadius: 10, background: '#1C1C1C', border: `1px solid ${vehiculoId ? F_BORDER : 'rgba(255,255,255,0.08)'}`, color: vehiculoId ? '#F4EEDF' : 'var(--muted)', fontSize: 14, outline: 'none' }}>
                <option value="">Seleccionar…</option>
                {vehiculos.map(v => <option key={v.id} value={v.id}>{v.nombre}{v.patente ? ` · ${v.patente}` : ''}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 6 }}>Fecha</label>
              <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} style={{ width: '100%', padding: '11px 12px', borderRadius: 10, background: '#1C1C1C', border: '1px solid rgba(255,255,255,0.08)', color: '#F4EEDF', fontSize: 14, outline: 'none' }} />
            </div>
          </div>
          <div style={{ marginBottom: 24 }}>
            <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 6 }}>Nombre de la ruta (opcional)</label>
            <input value={nombreRuta} onChange={e => setNombreRuta(e.target.value)} placeholder="Ej: Zona Norte Valdivia" style={{ width: '100%', padding: '11px 12px', borderRadius: 10, background: '#1C1C1C', border: '1px solid rgba(255,255,255,0.08)', color: '#F4EEDF', fontSize: 14, outline: 'none' }} />
          </div>

          {/* Lista de paradas */}
          {paradas.length > 0 && (
            <>
              <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 10 }}>
                Paradas de entrega ({paradas.length})
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
                {paradas.map((p, i) => (
                  <div key={i} style={{ background: '#131313', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '12px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <span style={{ width: 22, height: 22, borderRadius: '50%', background: F_DIM, border: `1px solid ${F_BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: F, flexShrink: 0 }}>{p.orden}</span>
                      {p.lat && p.lng && <MapPin size={12} color="#4ADE80" />}
                      <button onClick={() => eliminarParada(i)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#FF5555', padding: 0 }}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <input value={p.cliente_nombre} onChange={e => actualizarParada(i, 'cliente_nombre', e.target.value)} placeholder="Cliente / destinatario" style={{ padding: '9px 10px', borderRadius: 8, background: '#1C1C1C', border: '1px solid rgba(255,255,255,0.06)', color: '#F4EEDF', fontSize: 13, outline: 'none' }} />
                      <input value={p.direccion} onChange={e => actualizarParada(i, 'direccion', e.target.value)} placeholder="Dirección completa" style={{ padding: '9px 10px', borderRadius: 8, background: '#1C1C1C', border: '1px solid rgba(255,255,255,0.06)', color: '#F4EEDF', fontSize: 13, outline: 'none' }} />
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* ─── Sección de ingreso ─────────────────────────────────────────── */}
          <div style={{ marginBottom: 20 }}>
            {/* Toggle modo */}
            <div style={{ display: 'flex', background: '#1C1C1C', borderRadius: 10, padding: 3, gap: 3, marginBottom: 14 }}>
              <button onClick={() => setModoAdd('manual')} style={{ flex: 1, padding: '9px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', background: modoAdd === 'manual' ? '#2A2A2A' : 'transparent', color: modoAdd === 'manual' ? '#F4EEDF' : 'var(--muted)', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
                <PenLine size={14} /> Ingresar manual
              </button>
              <button onClick={() => { setModoAdd('excel'); setExcelPreview([]); setExcelError('') }} style={{ flex: 1, padding: '9px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', background: modoAdd === 'excel' ? '#2A2A2A' : 'transparent', color: modoAdd === 'excel' ? '#F4EEDF' : 'var(--muted)', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
                <FileUp size={14} /> Importar Excel
              </button>
            </div>

            {/* Formulario manual */}
            {modoAdd === 'manual' && (
              <div style={{ background: '#131313', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '14px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, marginBottom: 8 }}>
                  <input
                    value={qCiudad} onChange={e => setQCiudad(e.target.value)}
                    placeholder="Ciudad"
                    style={{ padding: '9px 10px', borderRadius: 8, background: '#1C1C1C', border: '1px solid rgba(255,255,255,0.08)', color: '#F4EEDF', fontSize: 13, outline: 'none' }}
                  />
                  <input
                    value={qNum} onChange={e => setQNum(e.target.value)}
                    placeholder="Número"
                    onKeyDown={e => e.key === 'Enter' && agregarManual()}
                    style={{ width: 90, padding: '9px 10px', borderRadius: 8, background: '#1C1C1C', border: '1px solid rgba(255,255,255,0.08)', color: '#F4EEDF', fontSize: 13, outline: 'none' }}
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
                  <input
                    value={qDir} onChange={e => setQDir(e.target.value)}
                    placeholder="Dirección (calle)"
                    onKeyDown={e => e.key === 'Enter' && agregarManual()}
                    style={{ padding: '9px 10px', borderRadius: 8, background: '#1C1C1C', border: '1px solid rgba(255,255,255,0.08)', color: '#F4EEDF', fontSize: 13, outline: 'none' }}
                  />
                  <input
                    value={qCliente} onChange={e => setQCliente(e.target.value)}
                    placeholder="Cliente (opcional)"
                    onKeyDown={e => e.key === 'Enter' && agregarManual()}
                    style={{ padding: '9px 10px', borderRadius: 8, background: '#1C1C1C', border: '1px solid rgba(255,255,255,0.08)', color: '#F4EEDF', fontSize: 13, outline: 'none' }}
                  />
                </div>
                <button
                  onClick={agregarManual}
                  disabled={!qDir.trim() || !qNum.trim()}
                  style={{ width: '100%', padding: '10px', borderRadius: 9, border: 'none', cursor: qDir.trim() && qNum.trim() ? 'pointer' : 'not-allowed', background: qDir.trim() && qNum.trim() ? F_DIM : 'rgba(255,255,255,0.03)', color: qDir.trim() && qNum.trim() ? F : 'var(--muted)', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}
                >
                  <Plus size={14} /> Agregar parada
                </button>
              </div>
            )}

            {/* Import Excel */}
            {modoAdd === 'excel' && (
              <div>
                <input ref={excelRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleExcel} style={{ display: 'none' }} />

                {/* Zona de carga */}
                <div
                  onClick={() => excelRef.current?.click()}
                  style={{ background: '#0F0F0F', border: '1px dashed rgba(249,115,22,0.3)', borderRadius: 12, padding: '24px 20px', textAlign: 'center', cursor: 'pointer' }}
                >
                  <FileUp size={28} color={F} style={{ margin: '0 auto 10px', display: 'block' }} />
                  <p style={{ fontSize: 14, fontWeight: 700, color: '#F4EEDF', marginBottom: 4 }}>
                    {importando ? 'Procesando archivo…' : 'Seleccionar archivo Excel o CSV'}
                  </p>
                  <p style={{ fontSize: 11, color: 'var(--muted)' }}>
                    Columnas requeridas: <span style={{ color: F }}>Ciudad</span> · <span style={{ color: F }}>Dirección</span> · <span style={{ color: F }}>Número</span>
                    <span style={{ color: '#4A4A44' }}> · Cliente (opcional)</span>
                  </p>
                </div>

                {/* Error */}
                {excelError && (
                  <p style={{ fontSize: 12, color: '#FF5555', marginTop: 10, padding: '10px 12px', background: 'rgba(255,85,85,0.08)', borderRadius: 8, border: '1px solid rgba(255,85,85,0.2)' }}>
                    ⚠ {excelError}
                  </p>
                )}

                {/* Preview */}
                {excelPreview.length > 0 && (
                  <div style={{ marginTop: 14 }}>
                    <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 8 }}>
                      Vista previa — {excelPreview.length} paradas detectadas
                    </p>
                    <div style={{ background: '#0F0F0F', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, overflow: 'hidden', marginBottom: 12 }}>
                      {/* Header */}
                      <div style={{ display: 'grid', gridTemplateColumns: '28px 1fr 1fr', gap: 8, padding: '8px 12px', background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>#</span>
                        <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>Cliente</span>
                        <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>Dirección</span>
                      </div>
                      {/* Rows (max 8 visible) */}
                      <div style={{ maxHeight: 220, overflowY: 'auto' }}>
                        {excelPreview.map((p, i) => (
                          <div key={i} style={{ display: 'grid', gridTemplateColumns: '28px 1fr 1fr', gap: 8, padding: '8px 12px', borderBottom: i < excelPreview.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                            <span style={{ fontSize: 10, fontWeight: 700, color: F }}>{i + 1}</span>
                            <span style={{ fontSize: 11, color: '#F4EEDF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.cliente_nombre}</span>
                            <span style={{ fontSize: 11, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.direccion}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <button
                      onClick={confirmarImport}
                      style={{ width: '100%', padding: '11px', borderRadius: 10, border: `1px solid ${F_BORDER}`, background: F_DIM, color: F, fontSize: 13, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                    >
                      <Plus size={15} /> Agregar {excelPreview.length} parada{excelPreview.length !== 1 ? 's' : ''} a la ruta
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Zona vacía */}
          {paradas.length === 0 && (
            <div style={{ textAlign: 'center', padding: '20px', background: '#0F0F0F', borderRadius: 12, border: '1px dashed rgba(255,255,255,0.06)', marginBottom: 20 }}>
              <p style={{ fontSize: 12, color: 'var(--muted)' }}>Las paradas aparecerán aquí al agregarlas</p>
            </div>
          )}

          {/* Acciones de ruta */}
          {paradas.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button onClick={optimizar} disabled={!puedeOptimizar || optimizando || geocodificando} style={{ width: '100%', padding: '13px', borderRadius: 12, border: `1px solid ${F_BORDER}`, background: F_DIM, color: F, fontSize: 14, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <Zap size={16} />
                {geocodificando ? 'Geocodificando direcciones…' : optimizando ? 'Optimizando ruta…' : 'Optimizar ruta (mínimo combustible)'}
              </button>

              {kmEst !== null && (
                <div style={{ background: 'rgba(212,175,55,0.08)', border: '1px solid rgba(212,175,55,0.2)', borderRadius: 12, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <p style={{ fontSize: 13, color: T, fontWeight: 700 }}>Distancia estimada</p>
                  <p style={{ fontSize: 18, fontWeight: 900, color: T }}>{kmEst} km</p>
                </div>
              )}

              {paradas.some(p => p.lat && p.lng) && (
                <a href={generarURLGoogleMaps(paradas)} target="_blank" rel="noopener noreferrer" style={{ width: '100%', padding: '12px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)', background: 'transparent', color: 'var(--muted)', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, textDecoration: 'none' }}>
                  <ExternalLink size={14} />
                  Ver ruta en Google Maps
                </a>
              )}

              <button onClick={guardar} disabled={!puedeGuardar || guardando} style={{ width: '100%', padding: '15px', borderRadius: 12, border: 'none', background: puedeGuardar && !guardando ? (rutaGuardada ? '#4ADE80' : F) : 'rgba(255,255,255,0.06)', color: puedeGuardar && !guardando ? '#fff' : 'var(--muted)', fontSize: 15, fontWeight: 900, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                {rutaGuardada ? <><CheckCircle size={16} /> Ruta guardada</> : <><Save size={16} />{guardando ? 'Guardando…' : 'Guardar ruta'}</>}
              </button>
            </div>
          )}
        </div>
      )}

      {tab === 'historial' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {rutas.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'var(--muted)', padding: '40px 0' }}>Sin rutas registradas</p>
          ) : rutas.map(r => (
            <RutaCard key={r.id} ruta={r} vehiculo={vehiculos.find(v => v.id === r.vehiculo_id)} />
          ))}
        </div>
      )}
    </div>
  )
}

function RutaCard({ ruta, vehiculo }: { ruta: Ruta; vehiculo: Vehiculo | undefined }) {
  const [open, setOpen] = useState(false)
  const estadoColor = { pendiente: '#F59E0B', en_curso: F, completada: '#4ADE80' }[ruta.estado] ?? 'var(--muted)'

  return (
    <div style={{ background: 'var(--surface2)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, overflow: 'hidden' }}>
      <div onClick={() => setOpen(o => !o)} style={{ padding: '14px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: '#F4EEDF', marginBottom: 2 }}>{ruta.nombre ?? 'Reparto'}</p>
          <p style={{ fontSize: 11, color: 'var(--muted)' }}>
            {vehiculo?.nombre ?? '—'} · {new Date(ruta.fecha + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })}
            {ruta.km_teoricos ? ` · ${ruta.km_teoricos} km` : ''}
          </p>
        </div>
        <span style={{ fontSize: 11, fontWeight: 700, color: estadoColor, background: `${estadoColor}18`, padding: '3px 9px', borderRadius: 20 }}>
          {ruta.estado === 'pendiente' ? 'Pendiente' : ruta.estado === 'en_curso' ? 'En curso' : 'Completada'}
        </span>
        <ChevronDown size={16} color="var(--muted)" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }} />
      </div>
      {open && ruta.ruta_paradas && (
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', padding: '10px 16px' }}>
          {ruta.ruta_paradas.sort((a, b) => a.orden - b.orden).map((p, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: i < ruta.ruta_paradas.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
              <span style={{ width: 20, height: 20, borderRadius: '50%', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: 'var(--muted)', flexShrink: 0 }}>{p.orden}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: '#F4EEDF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.cliente_nombre}</p>
                <p style={{ fontSize: 10, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.direccion}</p>
              </div>
              {p.completada && <CheckCircle size={14} color="#4ADE80" />}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
