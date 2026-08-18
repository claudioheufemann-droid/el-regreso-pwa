'use client'

import { useState, useRef } from 'react'
import { Upload, CheckCircle, AlertCircle, FileSpreadsheet, Loader2, Package } from 'lucide-react'
import { useIsDesktop } from '@/lib/useIsDesktop'

interface StockProductoParsed {
  tipo: 'barril' | 'envase'
  producto: string
  codigoProducto: string | null
  categoria: string
  cantidad: number
  litros: number | null
}

interface Resumen {
  barriles: { productos: number; cantidad: number; litros: number }
  envases: { productos: number; cantidad: number }
}

interface PreviewResult {
  preview: true
  resumen: Resumen
  productos: StockProductoParsed[]
}

interface UploadResult {
  insertadas: number
  fechaInforme: string
  resumen: Resumen
}

const fmt = (n: number) => n.toLocaleString('es-CL')

export default function StockUploadClient() {
  const isDesktop = useIsDesktop()
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [preview, setPreview] = useState<PreviewResult | null>(null)
  const [result, setResult] = useState<UploadResult | null>(null)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const f = e.dataTransfer.files[0]
    if (f?.name.endsWith('.xlsx')) { setFile(f); setPreview(null); setResult(null); setError('') }
  }
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null
    setFile(f); setPreview(null); setResult(null); setError('')
  }
  function handleReset() {
    setFile(null); setPreview(null); setResult(null); setError('')
    if (inputRef.current) inputRef.current.value = ''
  }

  async function handleValidate() {
    if (!file) return
    setLoading(true); setError(''); setPreview(null)
    const formData = new FormData()
    formData.append('file', file)
    try {
      const res = await fetch('/api/stock/upload?preview=true', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error al validar')
      setPreview(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido')
    } finally {
      setLoading(false)
    }
  }

  async function handleConfirm() {
    if (!file) return
    setLoading(true); setError('')
    const formData = new FormData()
    formData.append('file', file)
    try {
      const res = await fetch('/api/stock/upload', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error al subir')
      setResult(data)
      setFile(null); setPreview(null)
      if (inputRef.current) inputRef.current.value = ''
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ padding: isDesktop ? '40px 48px 60px' : '16px 14px 80px' }}>
      <div style={{ marginBottom: isDesktop ? 32 : 16 }}>
        <h1 style={{ fontSize: isDesktop ? 32 : 20, fontWeight: 900, color: 'var(--cream)', letterSpacing: '-1px', lineHeight: 1.1 }}>
          Cargar Stock
        </h1>
        <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 6 }}>
          Informe de stock de bodega (.xlsx) — sólo Cámara General Barrios Bajos (barriles y envases)
        </p>
      </div>

      <div style={{ maxWidth: 600 }}>
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
              <input ref={inputRef} type="file" accept=".xlsx" style={{ display: 'none' }} onChange={handleFileChange} />
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
                  <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>Archivo .xlsx — informe de stock de productos</p>
                </div>
              )}
            </div>

            <button
              onClick={handleValidate}
              disabled={!file || loading}
              style={{
                width: '100%', padding: '14px 0', borderRadius: 14, fontWeight: 700, fontSize: 15,
                border: 'none', cursor: file && !loading ? 'pointer' : 'not-allowed',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 14,
                background: file && !loading ? 'var(--gold)' : 'var(--surface2)',
                color: file && !loading ? '#080808' : 'var(--muted)',
              }}
            >
              {loading ? <Loader2 size={18} className="animate-spin" /> : <FileSpreadsheet size={18} />}
              {loading ? 'Validando…' : 'Validar archivo'}
            </button>

            {error && (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '12px 14px', borderRadius: 12, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)' }}>
                <AlertCircle size={16} style={{ color: '#EF4444', flexShrink: 0, marginTop: 1 }} />
                <p style={{ fontSize: 13, color: '#F87171' }}>{error}</p>
              </div>
            )}
          </>
        )}

        {preview && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 20 }}>
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 16 }}>
                <p style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>Barriles</p>
                <p style={{ fontSize: 22, fontWeight: 800, color: 'var(--cream)' }}>{fmt(preview.resumen.barriles.cantidad)}</p>
                <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{fmt(preview.resumen.barriles.litros)} L · {preview.resumen.barriles.productos} productos</p>
              </div>
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 16 }}>
                <p style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>Envases</p>
                <p style={{ fontSize: 22, fontWeight: 800, color: 'var(--cream)' }}>{fmt(preview.resumen.envases.cantidad)}</p>
                <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>unidades · {preview.resumen.envases.productos} productos</p>
              </div>
            </div>

            <div style={{ maxHeight: 320, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 12, marginBottom: 20 }}>
              {preview.productos.map((p, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '9px 13px', borderTop: i === 0 ? 'none' : '1px solid var(--border)' }}>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontSize: 13, color: 'var(--cream)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.producto}</p>
                    <p style={{ fontSize: 11, color: 'var(--muted)' }}>{p.tipo === 'barril' ? 'Barril' : 'Envase'} · {p.codigoProducto ?? '—'}</p>
                  </div>
                  <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--cream)', flexShrink: 0 }}>
                    {fmt(p.cantidad)} {p.tipo === 'barril' ? 'barr.' : 'un.'}
                  </p>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={handleReset} style={{ flex: 1, padding: '13px 0', borderRadius: 14, fontWeight: 700, fontSize: 14, border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)', cursor: 'pointer' }}>
                Cancelar
              </button>
              <button
                onClick={handleConfirm}
                disabled={loading}
                style={{ flex: 2, padding: '13px 0', borderRadius: 14, fontWeight: 700, fontSize: 14, border: 'none', cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: 'var(--gold)', color: '#080808' }}
              >
                {loading ? <Loader2 size={16} className="animate-spin" /> : <Package size={16} />}
                {loading ? 'Guardando…' : 'Confirmar y reemplazar stock'}
              </button>
            </div>
            <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 10, textAlign: 'center' }}>
              Esto reemplaza por completo el stock actual — es una foto del momento, no se acumula.
            </p>
          </div>
        )}

        {result && (
          <div style={{ textAlign: 'center', padding: '32px 16px' }}>
            <CheckCircle size={48} style={{ color: '#4ADE80', margin: '0 auto 16px' }} />
            <p style={{ fontSize: 17, fontWeight: 800, color: 'var(--cream)', marginBottom: 6 }}>Stock actualizado</p>
            <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 20 }}>
              {result.insertadas} filas guardadas · {result.resumen.barriles.cantidad} barriles ({fmt(result.resumen.barriles.litros)} L) · {result.resumen.envases.cantidad} envases
            </p>
            <button onClick={handleReset} style={{ padding: '11px 24px', borderRadius: 12, fontWeight: 700, fontSize: 13, border: '1px solid var(--border)', background: 'transparent', color: 'var(--cream)', cursor: 'pointer' }}>
              Cargar otro archivo
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
