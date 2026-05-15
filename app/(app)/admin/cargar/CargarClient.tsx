'use client'

import { useState, useRef } from 'react'
import { Upload, CheckCircle, AlertCircle, FileSpreadsheet, Loader2, Settings } from 'lucide-react'
import { Periodo } from '@/lib/types'
import Link from 'next/link'

interface Props {
  periodos: Periodo[]
}

interface UploadResult {
  insertadas: number
  duplicadas: number
  errores: string[]
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
    if (f?.name.endsWith('.xlsx')) setFile(f)
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
          Sube el informe diario en formato Excel (.xlsx)
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
            onChange={e => setFile(e.target.files?.[0] ?? null)}
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
              <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>Archivo .xlsx — mismo formato del informe</p>
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
            borderRadius: 14, padding: '16px', marginBottom: 14,
            background: 'rgba(74,122,58,0.08)', border: '1px solid rgba(74,122,58,0.3)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <CheckCircle size={17} style={{ color: '#4ADE80' }} />
              <span style={{ fontWeight: 700, color: '#4ADE80', fontSize: 14 }}>Ventas cargadas correctamente</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <p style={{ fontSize: 13, color: 'var(--cream)' }}>✅ <strong>{result.insertadas}</strong> registros insertados</p>
              {result.duplicadas > 0 && (
                <p style={{ fontSize: 13, color: 'var(--muted)' }}>⚠️ {result.duplicadas} duplicados ignorados</p>
              )}
            </div>
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
              'Columna VendedorActual con el nombre del vendedor',
              'Columna FechaPedido para la fecha',
              'Columna Litros y TotalSImp$',
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
