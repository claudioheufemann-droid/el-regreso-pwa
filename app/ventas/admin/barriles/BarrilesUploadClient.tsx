'use client'

import { useState } from 'react'
import { Upload, CheckCircle, AlertCircle, Layers } from 'lucide-react'
import SyncStatusCard from '@/components/ui/SyncStatusCard'

interface UploadResult { insertadas: number; total: number }

export default function BarrilesUploadClient() {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<UploadResult | null>(null)
  const [dragActive, setDragActive] = useState(false)

  async function handleUpload(file: File) {
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      setError('Solo archivos Excel (.xlsx, .xls)')
      return
    }
    setUploading(true)
    setError('')
    setResult(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/barriles/upload', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error al subir')
      setResult(data)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error desconocido')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div style={{ padding: '40px 48px 60px', maxWidth: 600 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <Layers size={24} style={{ color: 'var(--gold)' }} />
        <h1 style={{ fontSize: 28, fontWeight: 900, color: 'var(--cream)', letterSpacing: '-0.5px' }}>
          Cargar Barriles en Clientes
        </h1>
      </div>
      <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 24 }}>
        Informe "Barriles en Cliente" del ERP — foto completa de los barriles actualmente afuera, se reemplaza en cada carga.
      </p>

      <SyncStatusCard fuente="barriles" />

      <div
        onDragOver={e => { e.preventDefault(); setDragActive(true) }}
        onDragLeave={() => setDragActive(false)}
        onDrop={e => {
          e.preventDefault(); setDragActive(false)
          const f = e.dataTransfer.files?.[0]
          if (f) handleUpload(f)
        }}
        style={{
          borderRadius: 20, padding: '32px 24px', textAlign: 'center', marginBottom: 16,
          cursor: 'pointer', border: `2px dashed ${dragActive ? 'var(--gold)' : 'rgba(255,255,255,0.12)'}`,
          background: dragActive ? 'rgba(212,175,55,0.04)' : 'var(--surface)',
        }}
        onClick={() => document.getElementById('barriles-file-input')?.click()}
      >
        <input
          id="barriles-file-input" type="file" accept=".xlsx,.xls" style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f) }}
        />
        <Upload size={42} style={{ color: 'var(--muted)', margin: '0 auto 12px' }} />
        <p style={{ fontWeight: 700, color: 'var(--cream)', fontSize: 15 }}>
          {uploading ? 'Subiendo…' : 'Arrastra o haz clic para seleccionar'}
        </p>
        <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>Excel del informe "Barriles en Cliente"</p>
      </div>

      {error && (
        <div style={{ borderRadius: 14, padding: '14px 16px', marginBottom: 14, display: 'flex', alignItems: 'flex-start', gap: 10, background: 'rgba(255,68,68,0.06)', border: '1px solid rgba(255,68,68,0.25)' }}>
          <AlertCircle size={17} style={{ color: '#B5543E', flexShrink: 0, marginTop: 1 }} />
          <p style={{ fontSize: 13, color: '#B5543E' }}>{error}</p>
        </div>
      )}

      {result && (
        <div style={{ borderRadius: 14, padding: '18px', background: 'rgba(52,211,153,0.05)', border: '1px solid rgba(52,211,153,0.2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <CheckCircle size={17} style={{ color: '#5A8A4A' }} />
            <span style={{ fontWeight: 700, color: '#5A8A4A', fontSize: 14 }}>Carga completada</span>
          </div>
          <p style={{ fontSize: 13, color: 'var(--cream)' }}>{result.insertadas} barriles cargados de {result.total} filas en el archivo.</p>
        </div>
      )}
    </div>
  )
}
