'use client'

import { useState, useRef } from 'react'
import { Upload, CheckCircle, AlertCircle, FileSpreadsheet, Loader2, Settings, Calendar, Droplets, Copy, AlertTriangle, ShieldCheck } from 'lucide-react'
import { Periodo } from '@/lib/types'
import { useIsDesktop } from '@/lib/useIsDesktop'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface Props {
  periodos: Periodo[]
}

interface DetalleFecha {
  fecha: string
  litros: number
}

interface VendedorResumen {
  nombre: string
  filas: number
  litros: number
  litrosNegativos: number
  filasSinLitros: number
  fechas: number
  detalleFechas: DetalleFecha[]
}

interface PreviewResult {
  preview: true
  totalFilas: number
  duplicadosEnArchivo: number
  erroresMapeo: string[]
  advertenciasLitros: string[]
  fechaMin: string
  fechaMax: string
  vendedores: VendedorResumen[]
}

interface UploadResult {
  insertadas: number
  duplicadosEnArchivo: number
  erroresMapeo: string[]
  advertenciasLitros: string[]
  fechas: string[]
  fechaMin: string
  fechaMax: string
  vendedores: VendedorResumen[]
}

function formatFecha(dateStr: string) {
  if (!dateStr) return ''
  const [y, m, d] = dateStr.split('-')
  const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
  return `${parseInt(d)} ${meses[parseInt(m) - 1]} ${y}`
}

export default function CargarClient({ periodos }: Props) {
  const isDesktop = useIsDesktop()
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [preview, setPreview] = useState<PreviewResult | null>(null)
  const [result, setResult] = useState<UploadResult | null>(null)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const f = e.dataTransfer.files[0]
    if (f?.name.endsWith('.xlsx')) {
      setFile(f)
      setPreview(null)
      setResult(null)
      setError('')
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null
    setFile(f)
    setPreview(null)
    setResult(null)
    setError('')
  }

  function handleReset() {
    setFile(null)
    setPreview(null)
    setResult(null)
    setError('')
    if (inputRef.current) inputRef.current.value = ''
  }

  async function handleValidate() {
    if (!file) return
    setLoading(true)
    setError('')
    setPreview(null)

    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await fetch('/api/upload-ventas?preview=true', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error al validar')
      setPreview(data)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error desconocido')
    } finally {
      setLoading(false)
    }
  }

  async function handleConfirm() {
    if (!file) return
    setLoading(true)
    setError('')

    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await fetch('/api/upload-ventas', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error al subir')
      setResult(data)
      setFile(null)
      setPreview(null)
      if (inputRef.current) inputRef.current.value = ''
      // Invalida el router cache para que Hoy y Acumulado muestren datos frescos
      router.refresh()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error desconocido')
    } finally {
      setLoading(false)
    }
  }

  const periodoActivo = periodos.find(p => p.activo)
  const tieneAdvertencias = preview && (preview.advertenciasLitros.length > 0 || preview.erroresMapeo.length > 0)

  return (
    <div style={{ padding: isDesktop ? '40px 48px 60px' : '16px 14px 80px' }}>
      {/* Header */}
      <div style={{ marginBottom: isDesktop ? 32 : 16 }}>
        <h1 style={{ fontSize: isDesktop ? 32 : 20, fontWeight: 900, color: 'var(--cream)', letterSpacing: '-1px', lineHeight: 1.1 }}>
          Cargar Ventas
        </h1>
        <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 6 }}>
          Sube el informe detallado en formato Excel (.xlsx)
        </p>
      </div>

      <div style={{ maxWidth: 600 }}>
        {/* Período activo */}
        {periodoActivo && (
          <div style={{
            borderRadius: 12, padding: '10px 16px', marginBottom: 20,
            display: 'flex', alignItems: 'center', gap: 10,
            background: 'rgba(212,175,55,0.06)', border: '1px solid rgba(212,175,55,0.2)',
          }}>
            <div className="animate-pulse-opacity" style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--gold)', flexShrink: 0 }} />
            <span style={{ fontSize: 13, color: 'var(--gold)', fontWeight: 600 }}>
              Período activo: {periodoActivo.nombre}
            </span>
          </div>
        )}

        {/* Zona de carga — solo si no hay preview ni resultado */}
        {!preview && !result && (
          <>
            <div
              style={{
                borderRadius: 20, padding: '32px 24px', textAlign: 'center', marginBottom: 16,
                cursor: 'pointer', transition: 'border-color 0.15s, background 0.15s',
                background: file ? 'rgba(212,175,55,0.04)' : 'var(--surface)',
                border: `2px dashed ${file ? 'var(--gold)' : 'rgba(255,255,255,0.12)'}`,
              }}
              onDragOver={e => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => inputRef.current?.click()}
            >
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx"
                style={{ display: 'none' }}
                onChange={handleFileChange}
              />
              {file ? (
                <div>
                  <FileSpreadsheet size={42} style={{ color: 'var(--gold)', margin: '0 auto 12px' }} />
                  <p style={{ fontWeight: 700, color: 'var(--cream)', fontSize: 15 }}>{file.name}</p>
                  <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>{(file.size / 1024).toFixed(0)} KB</p>
                </div>
              ) : (
                <div>
                  <Upload size={42} style={{ color: 'var(--muted)', margin: '0 auto 12px' }} />
                  <p style={{ fontWeight: 700, color: 'var(--cream)', fontSize: 15 }}>Arrastra o haz clic para subir</p>
                  <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>Archivo .xlsx — informe de ventas detalladas</p>
                </div>
              )}
            </div>

            {/* Botón validar */}
            <button
              onClick={handleValidate}
              disabled={!file || loading}
              style={{
                width: '100%', padding: '14px 0', borderRadius: 14, fontWeight: 700, fontSize: 15,
                border: 'none', cursor: file && !loading ? 'pointer' : 'not-allowed',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 14,
                background: file && !loading ? 'var(--gold)' : 'var(--surface2)',
                color: file && !loading ? '#080808' : 'var(--muted)',
                transition: 'all 0.15s',
              }}
            >
              {loading ? (
                <><Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />Validando...</>
              ) : (
                <><ShieldCheck size={18} />Validar informe</>
              )}
            </button>
          </>
        )}

        {/* Error */}
        {error && (
          <div style={{
            borderRadius: 14, padding: '14px 16px', marginBottom: 14,
            display: 'flex', alignItems: 'flex-start', gap: 10,
            background: 'rgba(255,68,68,0.06)', border: '1px solid rgba(255,68,68,0.25)',
          }}>
            <AlertCircle size={17} style={{ color: '#F87171', flexShrink: 0, marginTop: 1 }} />
            <p style={{ fontSize: 13, color: '#F87171' }}>{error}</p>
          </div>
        )}

        {/* ── PREVIEW ── */}
        {preview && !result && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

            {/* Encabezado del preview */}
            <div style={{
              borderRadius: 14, padding: '14px 16px',
              background: tieneAdvertencias ? 'rgba(245,158,11,0.06)' : 'rgba(52,211,153,0.05)',
              border: `1px solid ${tieneAdvertencias ? 'rgba(245,158,11,0.25)' : 'rgba(52,211,153,0.2)'}`,
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              {tieneAdvertencias
                ? <AlertTriangle size={17} style={{ color: '#F59E0B', flexShrink: 0 }} />
                : <CheckCircle size={17} style={{ color: '#34D399', flexShrink: 0 }} />
              }
              <div>
                <p style={{ fontSize: 14, fontWeight: 700, color: tieneAdvertencias ? '#F59E0B' : '#34D399' }}>
                  {tieneAdvertencias ? 'Validación con advertencias' : 'Validación correcta'}
                </p>
                <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                  {preview.totalFilas} filas · {formatFecha(preview.fechaMin)}{preview.fechaMin !== preview.fechaMax ? ` → ${formatFecha(preview.fechaMax)}` : ''}
                </p>
              </div>
            </div>

            {/* Resumen por vendedor */}
            <div>
              <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.06em', marginBottom: 8 }}>
                LITROS POR VENDEDOR
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {preview.vendedores.map(v => (
                  <div key={v.nombre} style={{
                    borderRadius: 12, padding: '12px 16px',
                    background: 'var(--surface)', border: '1px solid var(--border)',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--cream)' }}>{v.nombre}</span>
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: 'rgba(96,165,250,0.1)', color: '#60A5FA' }}>
                        {v.filas} filas
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Droplets size={14} style={{ color: '#60A5FA' }} />
                        <span style={{ fontSize: 18, fontWeight: 900, color: 'var(--cream)' }}>{v.litros.toFixed(1)}</span>
                        <span style={{ fontSize: 12, color: 'var(--muted)' }}>L totales</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Calendar size={13} style={{ color: '#A78BFA' }} />
                        <span style={{ fontSize: 12, color: 'var(--muted)' }}>{v.fechas} {v.fechas === 1 ? 'día' : 'días'}</span>
                      </div>
                    </div>
                    {/* Advertencias de litros de este vendedor */}
                    {(v.filasSinLitros > 0 || v.litrosNegativos > 0) && (
                      <div style={{ marginTop: 8, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        {v.filasSinLitros > 0 && (
                          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: 'rgba(245,158,11,0.1)', color: '#F59E0B', fontWeight: 600 }}>
                            ⚠ {v.filasSinLitros} fila{v.filasSinLitros > 1 ? 's' : ''} sin litros
                          </span>
                        )}
                        {v.litrosNegativos > 0 && (
                          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: 'rgba(239,68,68,0.1)', color: '#F87171', fontWeight: 600 }}>
                            ↓ {v.litrosNegativos} devolución{v.litrosNegativos > 1 ? 'es' : ''}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Detalle de fechas detectadas */}
                    {v.detalleFechas.length > 0 && (
                      <div style={{ marginTop: 10, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 8 }}>
                        <p style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 700, letterSpacing: '0.05em', marginBottom: 6 }}>
                          FECHAS DETECTADAS (FechaPedido)
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                          {v.detalleFechas.map(df => {
                            const [y, m, d] = df.fecha.split('-')
                            const meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
                            const fechaLegible = `${parseInt(d)} ${meses[parseInt(m)-1]} ${y}`
                            return (
                              <div key={df.fecha} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: 12, color: 'var(--cream)', fontWeight: 600 }}>{fechaLegible}</span>
                                <span style={{ fontSize: 12, color: '#60A5FA', fontWeight: 700 }}>{df.litros.toFixed(1)} L</span>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Advertencias de litros */}
            {preview.advertenciasLitros.length > 0 && (
              <div style={{
                borderRadius: 12, padding: '12px 16px',
                background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.2)',
              }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: '#F59E0B', marginBottom: 8 }}>
                  <AlertTriangle size={13} style={{ display: 'inline', marginRight: 5 }} />
                  {preview.advertenciasLitros.length} advertencia{preview.advertenciasLitros.length > 1 ? 's' : ''} de litros
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 160, overflowY: 'auto' }}>
                  {preview.advertenciasLitros.map((w, i) => (
                    <p key={i} style={{ fontSize: 11, color: '#FDA47A' }}>{w}</p>
                  ))}
                </div>
              </div>
            )}

            {/* Errores de mapeo */}
            {preview.erroresMapeo.length > 0 && (
              <div style={{
                borderRadius: 12, padding: '12px 16px',
                background: 'rgba(249,115,22,0.06)', border: '1px solid rgba(249,115,22,0.2)',
              }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: '#F97316', marginBottom: 6 }}>
                  {preview.erroresMapeo.length} fila{preview.erroresMapeo.length > 1 ? 's' : ''} con fecha inválida (serán ignoradas):
                </p>
                {preview.erroresMapeo.map((e, i) => (
                  <p key={i} style={{ fontSize: 11, color: '#FDA47A' }}>{e}</p>
                ))}
              </div>
            )}

            {/* Duplicados en archivo */}
            {preview.duplicadosEnArchivo > 0 && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8, borderRadius: 10, padding: '10px 14px',
                background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.2)',
              }}>
                <Copy size={13} style={{ color: '#F59E0B' }} />
                <p style={{ fontSize: 12, color: '#F59E0B' }}>
                  {preview.duplicadosEnArchivo} fila{preview.duplicadosEnArchivo > 1 ? 's' : ''} duplicada{preview.duplicadosEnArchivo > 1 ? 's' : ''} en el archivo — serán ignoradas.
                </p>
              </div>
            )}

            {/* Botones de acción */}
            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <button
                onClick={handleReset}
                disabled={loading}
                style={{
                  flex: 1, padding: '13px 0', borderRadius: 12, fontWeight: 600, fontSize: 14,
                  border: '1px solid var(--border)', cursor: 'pointer',
                  background: 'var(--surface)', color: 'var(--muted)', transition: 'all 0.15s',
                }}
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirm}
                disabled={loading}
                style={{
                  flex: 2, padding: '13px 0', borderRadius: 12, fontWeight: 700, fontSize: 14,
                  border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  background: tieneAdvertencias ? '#D97706' : 'var(--gold)',
                  color: '#080808', transition: 'all 0.15s',
                }}
              >
                {loading ? (
                  <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />Cargando...</>
                ) : (
                  <><Upload size={16} />{tieneAdvertencias ? 'Cargar de todas formas' : 'Confirmar y cargar'}</>
                )}
              </button>
            </div>
          </div>
        )}

        {/* ── RESULTADO FINAL ── */}
        {result && (
          <div style={{
            borderRadius: 14, padding: '18px', marginBottom: 14,
            background: 'rgba(52,211,153,0.05)', border: '1px solid rgba(52,211,153,0.2)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <CheckCircle size={17} style={{ color: '#34D399' }} />
              <span style={{ fontWeight: 700, color: '#34D399', fontSize: 14 }}>Carga completada</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
              <div style={{ borderRadius: 10, padding: '10px 14px', background: 'rgba(52,211,153,0.07)' }}>
                <p style={{ fontSize: 11, color: '#34D399', marginBottom: 4 }}>Registros insertados</p>
                <p style={{ fontSize: 24, fontWeight: 800, color: 'white' }}>{result.insertadas}</p>
              </div>
              <div style={{ borderRadius: 10, padding: '10px 14px', background: 'rgba(52,211,153,0.07)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
                  <Calendar size={11} style={{ color: '#34D399' }} />
                  <p style={{ fontSize: 11, color: '#34D399' }}>Rango de fechas</p>
                </div>
                <p style={{ fontSize: 13, fontWeight: 700, color: 'white' }}>{formatFecha(result.fechaMin)}</p>
                {result.fechaMin !== result.fechaMax && (
                  <p style={{ fontSize: 11, color: '#888', marginTop: 2 }}>→ {formatFecha(result.fechaMax)}</p>
                )}
              </div>
            </div>

            {result.vendedores.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <p style={{ fontSize: 11, fontWeight: 600, color: '#888', marginBottom: 8, letterSpacing: '0.05em' }}>
                  DETALLE POR VENDEDOR
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {result.vendedores.map(v => (
                    <div key={v.nombre} style={{ borderRadius: 10, padding: '10px 14px', background: 'rgba(52,211,153,0.07)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'white' }}>{v.nombre}</span>
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: 'rgba(52,211,153,0.15)', color: '#34D399' }}>
                          {v.filas} filas
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <Droplets size={13} style={{ color: '#60A5FA' }} />
                          <span style={{ fontSize: 13, fontWeight: 700, color: 'white' }}>{v.litros.toFixed(1)} L</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <Calendar size={12} style={{ color: '#A78BFA' }} />
                          <span style={{ fontSize: 12, color: '#888' }}>
                            {v.fechas} {v.fechas === 1 ? 'día' : 'días'}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {result.duplicadosEnArchivo > 0 && (
              <div style={{
                display: 'flex', alignItems: 'flex-start', gap: 8, borderRadius: 10, padding: '10px 14px',
                background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.2)',
                marginBottom: 8,
              }}>
                <Copy size={13} style={{ color: '#F59E0B', flexShrink: 0, marginTop: 1 }} />
                <p style={{ fontSize: 12, color: '#F59E0B' }}>
                  {result.duplicadosEnArchivo} fila{result.duplicadosEnArchivo > 1 ? 's' : ''} duplicada{result.duplicadosEnArchivo > 1 ? 's' : ''} ignoradas.
                </p>
              </div>
            )}

            {result.erroresMapeo.length > 0 && (
              <div style={{
                borderRadius: 10, padding: '10px 14px',
                background: 'rgba(249,115,22,0.07)', border: '1px solid rgba(249,115,22,0.2)',
                marginBottom: 8,
              }}>
                <p style={{ fontSize: 12, fontWeight: 600, color: '#F97316', marginBottom: 6 }}>
                  {result.erroresMapeo.length} fila{result.erroresMapeo.length > 1 ? 's' : ''} con fecha inválida (ignoradas):
                </p>
                {result.erroresMapeo.map((e, i) => (
                  <p key={i} style={{ fontSize: 11, color: '#FDA47A' }}>{e}</p>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button
                onClick={handleReset}
                style={{
                  flex: 1, padding: '11px 0', borderRadius: 12, fontWeight: 600, fontSize: 13,
                  border: '1px solid var(--border)', cursor: 'pointer',
                  background: 'var(--surface)', color: 'var(--muted)',
                }}
              >
                Cargar otro
              </button>
              <button
                onClick={() => router.push('/ventas')}
                style={{
                  flex: 2, padding: '11px 0', borderRadius: 12, fontWeight: 700, fontSize: 13,
                  border: 'none', cursor: 'pointer',
                  background: 'var(--gold)', color: '#080808',
                }}
              >
                Ver Hoy →
              </button>
            </div>
          </div>
        )}

        {/* Acceso a metas */}
        {!preview && (
          <Link
            href="/admin/metas"
            style={{
              width: '100%', padding: '12px 0', borderRadius: 14, fontWeight: 600, fontSize: 14,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 20,
              background: 'var(--surface)', color: 'var(--muted)',
              border: '1px solid var(--border)', textDecoration: 'none', transition: 'all 0.15s',
            }}
          >
            <Settings size={16} />
            Gestionar metas
          </Link>
        )}

        {/* Instrucciones */}
        {!preview && !result && (
          <div style={{
            borderRadius: 16, padding: '18px 20px',
            background: 'var(--surface)', border: '1px solid var(--border)',
          }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--cream)', marginBottom: 12 }}>
              Formato esperado
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                'Hoja "Datos" con columnas estándar',
                'VendedorActual: Javier Badilla / Carlos Urrejola',
                'FechaPedido para la fecha del pedido',
                'Litros y TotalSImp$ para montos',
              ].map(txt => (
                <div key={txt} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--gold)', flexShrink: 0, marginTop: 5 }} />
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>{txt}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
