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
    <div className="px-4 pt-6 pb-4 max-w-5xl mx-auto lg:max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-black text-white">Cargar Ventas</h1>
        <p className="text-sm mt-1" style={{ color: '#888' }}>Sube el informe diario en formato Excel (.xlsx)</p>
      </div>

      {/* Período activo */}
      {periodoActivo && (
        <div className="rounded-xl p-3 mb-5 flex items-center gap-2" style={{ background: '#1A1A00', border: '1px solid #3D2E00' }}>
          <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: '#F59E0B' }} />
          <span className="text-sm" style={{ color: '#F59E0B' }}>Período activo: {periodoActivo.nombre}</span>
        </div>
      )}

      {/* Zona de carga */}
      <div
        className="rounded-2xl p-6 text-center mb-5 transition-all cursor-pointer"
        style={{ background: '#1A1A1A', border: `2px dashed ${file ? '#F59E0B' : '#333'}` }}
        onDragOver={e => e.preventDefault()}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx"
          className="hidden"
          onChange={e => setFile(e.target.files?.[0] ?? null)}
        />

        {file ? (
          <div>
            <FileSpreadsheet size={40} className="mx-auto mb-3" style={{ color: '#F59E0B' }} />
            <p className="font-semibold text-white">{file.name}</p>
            <p className="text-sm mt-1" style={{ color: '#888' }}>{(file.size / 1024).toFixed(0)} KB</p>
          </div>
        ) : (
          <div>
            <Upload size={40} className="mx-auto mb-3" style={{ color: '#444' }} />
            <p className="font-semibold text-white">Arrastra o toca para subir</p>
            <p className="text-sm mt-1" style={{ color: '#666' }}>Archivo .xlsx — mismo formato del informe</p>
          </div>
        )}
      </div>

      {/* Botón subir */}
      <button
        onClick={handleUpload}
        disabled={!file || loading}
        className="w-full py-3.5 rounded-xl font-bold text-black transition-all mb-4 flex items-center justify-center gap-2"
        style={{ background: file && !loading ? '#F59E0B' : '#333', color: file && !loading ? '#000' : '#666' }}
      >
        {loading ? (
          <>
            <Loader2 size={18} className="animate-spin" />
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
        <div className="rounded-xl p-4 mb-4 flex items-start gap-3" style={{ background: '#2A0000', border: '1px solid #5A0000' }}>
          <AlertCircle size={18} style={{ color: '#F87171' }} className="flex-shrink-0 mt-0.5" />
          <p className="text-sm" style={{ color: '#F87171' }}>{error}</p>
        </div>
      )}

      {/* Resultado exitoso */}
      {result && (
        <div className="rounded-xl p-4 mb-4" style={{ background: '#002A10', border: '1px solid #004020' }}>
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle size={18} style={{ color: '#34D399' }} />
            <span className="font-semibold" style={{ color: '#34D399' }}>Ventas cargadas correctamente</span>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-white">✅ <strong>{result.insertadas}</strong> registros insertados</p>
            {result.duplicadas > 0 && (
              <p className="text-sm" style={{ color: '#888' }}>⚠️ {result.duplicadas} duplicados ignorados</p>
            )}
          </div>
        </div>
      )}

      {/* Acceso rápido a metas */}
      <Link
        href="/admin/metas"
        className="w-full py-3.5 rounded-xl font-semibold transition-all flex items-center justify-center gap-2"
        style={{ background: '#1A1A1A', color: '#888', border: '1px solid #2A2A2A' }}
      >
        <Settings size={18} />
        Gestionar metas
      </Link>

      {/* Instrucciones */}
      <div className="mt-5 rounded-xl p-4" style={{ background: '#1A1A1A', border: '1px solid #2A2A2A' }}>
        <p className="text-sm font-semibold text-white mb-2">Formato esperado</p>
        <ul className="space-y-1">
          {['Hoja "Datos" con columnas estándar', 'Columna VendedorActual con el nombre del vendedor', 'Columna FechaPedido para la fecha', 'Columna Litros y TotalSImp$'].map(txt => (
            <li key={txt} className="text-xs flex items-center gap-1.5" style={{ color: '#888' }}>
              <div className="w-1 h-1 rounded-full" style={{ background: '#F59E0B' }} />
              {txt}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
