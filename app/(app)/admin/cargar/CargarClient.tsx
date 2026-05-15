'use client'

import { useState, useRef } from 'react'
import { Upload, CheckCircle, AlertCircle, FileSpreadsheet, Loader2, Settings, Calendar, Droplets, Copy } from 'lucide-react'
import { Periodo } from '@/lib/types'
import Link from 'next/link'

interface Props {
  periodos: Periodo[]
}

interface VendedorResumen {
  nombre: string
  filas: number
  litros: number
  fechas: number
}

interface UploadResult {
  insertadas: number
  duplicadosEnArchivo: number
  erroresMapeo: string[]
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
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<UploadResult | null>(null)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const f = e.dataTransfer.files[0]
    if (f?.name.endsWith('.xlsx')) {
      setFile(f)
      setResult(null)
      setError('')
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null
    setFile(f)
    setResult(null)
    setError('')
  }

  async function handleUpload() {
    if (!file) return
    setLoading(true)
    setError('')
    setResult(null)

    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await fetch('/api/upload-ventas', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error al subir')
      setResult(data)
      setFile(null)
      if (inputRef.current) inputRef.current.value = ''
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error desconocido')
    } finally {
      setLoading(false)
    }
  }

  const periodoActivo = periodos.find(p => p.activo)

  return (
    <div style={{ padding: '40px 48px 60px' }} className="px-4 pt-8 lg:px-12 lg:pt-10">
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 32, fontWeight: 900, color: 'var(--cream)', letterSpacing: '-1px', lineHeight: 1.1 }}>
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

        {/* Zona de carga */}
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

        {/* Botón subir */}
        <button
          onClick={handleUpload}
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
            <>
              <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
              Procesando...
            </>
          ) : (
            <>
              <Upload size={18} />
              Subir ventas
            </>
          )}
        </button>

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

        {/* Resultado exitoso */}
        {result && (
          <div style={{
            borderRadius: 14, padding: '18px', marginBottom: 14,
            background: 'rgba(52,211,153,0.05)', border: '1px solid rgba(52,211,153,0.2)',
          }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <CheckCircle size={17} style={{ color: '#34D399' }} />
              <span style={{ fontWeight: 700, color: '#34D399', fontSize: 14 }}>Carga completada</span>
            </div>

            {/* Resumen general */}
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

            {/* Por vendedor */}
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

            {/* Duplicados en archivo */}
            {result.duplicadosEnArchivo > 0 && (
              <div style={{
                display: 'flex', alignItems: 'flex-start', gap: 8, borderRadius: 10, padding: '10px 14px',
                background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.2)',
                marginBottom: 8,
              }}>
                <Copy size={13} style={{ color: '#F59E0B', flexShrink: 0, marginTop: 1 }} />
                <p style={{ fontSize: 12, color: '#F59E0B' }}>
                  {result.duplicadosEnArchivo} fila{result.duplicadosEnArchivo > 1 ? 's' : ''} duplicada{result.duplicadosEnArchivo > 1 ? 's' : ''} detectada{result.duplicadosEnArchivo > 1 ? 's' : ''} en el archivo — ignoradas automáticamente.
                </p>
              </div>
            )}

            {/* Errores de mapeo */}
            {result.erroresMapeo.length > 0 && (
              <div style={{
                borderRadius: 10, padding: '10px 14px',
                background: 'rgba(249,115,22,0.07)', border: '1px solid rgba(249,115,22,0.2)',
              }}>
                <p style={{ fontSize: 12, fontWeight: 600, color: '#F97316', marginBottom: 6 }}>
                  {result.erroresMapeo.length} fila{result.erroresMapeo.length > 1 ? 's' : ''} con fecha inválida (ignoradas):
                </p>
                {result.erroresMapeo.map((e, i) => (
                  <p key={i} style={{ fontSize: 11, color: '#FDA47A' }}>{e}</p>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Acceso a metas */}
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

        {/* Instrucciones */}
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
      </div>
    </div>
  )
}
