'use client'

import { useState, useRef } from 'react'
import { Upload, CheckCircle, AlertCircle, FileSpreadsheet, Loader2, Beaker } from 'lucide-react'
import { useIsDesktop } from '@/lib/useIsDesktop'
import SyncStatusCard from '@/components/ui/SyncStatusCard'

interface Matcheado { insumoId: string; nombre: string; cantidadBase: number }
interface SinMatch { nombreCrudo: string; cantidad: number; unidadCruda: string; motivo: string }
interface Resumen { filasLeidas: number; matcheados: number; sinMatch: number; conPrecio: number }

interface PreviewResult {
  preview: true
  resumen: Resumen
  matcheados: Matcheado[]
  sinMatch: SinMatch[]
}

interface UploadResult {
  insertados: number
  sinMatch: number
  /** Cuántos insumos quedaron con precio actualizado — 0 si el archivo no
   *  traía columna de precio ni de valorizado. */
  preciosActualizados: number
  fechaInforme: string
  resumen: Resumen
  sinMatchDetalle: SinMatch[]
}

const fmt = (n: number) => n.toLocaleString('es-CL', { maximumFractionDigits: 1 })

export default function InsumosUploadClient() {
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
      const res = await fetch('/api/insumos/stock/upload?preview=true', { method: 'POST', body: formData })
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
      const res = await fetch('/api/insumos/stock/upload', { method: 'POST', body: formData })
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
          Cargar Stock de Insumos
        </h1>
        <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 6 }}>
          Informe de Gestión Cervecera → Compra → Stock de Insumos (.xlsx) — alimenta la sección
          &quot;Insumos y Compras&quot; del módulo de Producción
        </p>
      </div>

      <div style={{ maxWidth: 600 }}>
        <SyncStatusCard fuente="stock_insumos" />

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
                  <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>Archivo .xlsx — listado de stock de insumos</p>
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
                <p style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>Matchean</p>
                <p style={{ fontSize: 22, fontWeight: 800, color: 'var(--cream)' }}>{fmt(preview.resumen.matcheados)}</p>
                <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>de {preview.resumen.filasLeidas} filas leídas</p>
              </div>
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 16 }}>
                <p style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>Sin match</p>
                <p style={{ fontSize: 22, fontWeight: 800, color: preview.resumen.sinMatch > 0 ? '#F0B429' : 'var(--cream)' }}>{fmt(preview.resumen.sinMatch)}</p>
                <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>no calzan con el catálogo</p>
              </div>
            </div>

            {/* El precio es opcional: si el informe trae columna de precio o de
                valorizado, se aprovecha para valorizar el MRP y el presupuesto.
                Si no viene, se avisa en vez de fallar en silencio — era
                justamente el dato que faltaba para presupuestar. */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 16, marginBottom: 20 }}>
              <p style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>Precios</p>
              {preview.resumen.conPrecio > 0 ? (
                <>
                  <p style={{ fontSize: 22, fontWeight: 800, color: '#4ADE80' }}>{fmt(preview.resumen.conPrecio)}</p>
                  <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                    filas con precio o valorizado — se actualizará el costo unitario de esos insumos
                  </p>
                </>
              ) : (
                <>
                  <p style={{ fontSize: 22, fontWeight: 800, color: '#F0B429' }}>0</p>
                  <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                    El archivo no trae columna de precio ni de valorizado: sólo se actualiza el stock.
                    Sin precios, el MRP y el presupuesto no pueden mostrar pesos.
                  </p>
                </>
              )}
            </div>

            <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.05em' }}>
              Insumos que sí se van a actualizar ({preview.matcheados.length})
            </p>
            <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 12, marginBottom: 16 }}>
              {preview.matcheados.length === 0 ? (
                <p style={{ padding: 14, fontSize: 13, color: 'var(--muted)' }}>Ningún insumo del catálogo matcheó con este archivo.</p>
              ) : preview.matcheados.map((m, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '9px 13px', borderTop: i === 0 ? 'none' : '1px solid var(--border)' }}>
                  <p style={{ fontSize: 13, color: 'var(--cream)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.nombre}</p>
                  <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--cream)', flexShrink: 0 }}>{fmt(m.cantidadBase)}</p>
                </div>
              ))}
            </div>

            {preview.sinMatch.length > 0 && (
              <>
                <p style={{ fontSize: 11, color: '#F0B429', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                  Sin match ({preview.sinMatch.length}) — no afectan insumos del catálogo
                </p>
                <div style={{ maxHeight: 160, overflowY: 'auto', border: '1px solid rgba(251,191,36,0.25)', borderRadius: 12, marginBottom: 20, background: 'rgba(251,191,36,0.04)' }}>
                  {preview.sinMatch.map((s, i) => (
                    <div key={i} style={{ padding: '8px 13px', borderTop: i === 0 ? 'none' : '1px solid rgba(251,191,36,0.15)' }}>
                      <p style={{ fontSize: 12.5, color: 'var(--cream)', fontWeight: 600 }}>{s.nombreCrudo}</p>
                      <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>{s.motivo}</p>
                    </div>
                  ))}
                </div>
              </>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={handleReset} style={{ flex: 1, padding: '13px 0', borderRadius: 14, fontWeight: 700, fontSize: 14, border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)', cursor: 'pointer' }}>
                Cancelar
              </button>
              <button
                onClick={handleConfirm}
                disabled={loading}
                style={{ flex: 2, padding: '13px 0', borderRadius: 14, fontWeight: 700, fontSize: 14, border: 'none', cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: 'var(--gold)', color: '#080808' }}
              >
                {loading ? <Loader2 size={16} className="animate-spin" /> : <Beaker size={16} />}
                {loading ? 'Guardando…' : 'Confirmar y reemplazar stock'}
              </button>
            </div>
            <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 10, textAlign: 'center' }}>
              Esto reemplaza por completo el stock de insumos actual — es una foto del momento, no se acumula.
            </p>
          </div>
        )}

        {result && (
          <div style={{ textAlign: 'center', padding: '32px 16px' }}>
            <CheckCircle size={48} style={{ color: '#4ADE80', margin: '0 auto 16px' }} />
            <p style={{ fontSize: 17, fontWeight: 800, color: 'var(--cream)', marginBottom: 6 }}>Stock de insumos actualizado</p>
            <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 20 }}>
              {result.insertados} insumos guardados · {result.sinMatch} filas sin match del archivo
              {result.preciosActualizados > 0 && ` · ${result.preciosActualizados} precios actualizados`}
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
