'use client'

import { useState, useRef } from 'react'
import {
  Upload, CheckCircle, AlertCircle, FileSpreadsheet, Loader2,
  Users, RefreshCw, Download, Info,
} from 'lucide-react'
import * as XLSX from 'xlsx'

interface UploadResult {
  total: number
  insertadas: number
  actualizadas: number
  eliminadasPrev: string | number
  modo: string
}

const SQL_TABLA = `-- Ejecutar en Supabase SQL Editor
CREATE TABLE IF NOT EXISTS clientes (
  id               BIGSERIAL PRIMARY KEY,
  nombre_fantasia  TEXT UNIQUE,
  razon_social     TEXT,
  rut              TEXT,
  telefono         TEXT,
  email            TEXT,
  contacto         TEXT,
  direccion        TEXT,
  localidad        TEXT,
  provincia        TEXT,
  codigo_postal    TEXT,
  condicion_fiscal TEXT,
  direccion_entrega    TEXT,
  localidad_entrega    TEXT,
  provincia_entrega    TEXT,
  saldo_cta_cte_inicial NUMERIC DEFAULT 0,
  dias_horas_entrega TEXT,
  notas            TEXT,
  ruta_despacho    TEXT,
  direccion_google_maps TEXT,
  lista_precios    TEXT,
  codigo_cliente   TEXT,
  vendedor         TEXT,
  dias_pago        INTEGER,
  porcentaje_bonificacion NUMERIC DEFAULT 0,
  limite_cta_cte   NUMERIC DEFAULT 0,
  tipo             TEXT,
  categoria        TEXT,
  condicion_venta  TEXT,
  giro             TEXT,
  lat              DOUBLE PRECISION,
  lng              DOUBLE PRECISION,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clientes_all" ON clientes
  FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);`

const COLUMNAS_TEMPLATE = [
  'nombre', 'razon_social', 'rut', 'telefonos', 'email', 'contacto',
  'direccion', 'localidad', 'provincia', 'codigo_postal', 'condicion_fiscal',
  'direccion_entrega', 'localidad_entrega', 'provincia_entrega',
  'saldo_cta_cte_inicial', 'dias_horas_entrega', 'notas', 'nro_ruta',
  'direccion_google_maps', 'lista_precios', 'codigo_cliente', 'vendedor',
  'dias_pago', 'porcentaje_bonificacion', 'limite_cta_cte', 'tipo',
  'categoria', 'condicion_venta', 'giro',
]

export default function ClientesUploadClient() {
  const [file, setFile] = useState<File | null>(null)
  const [modo, setModo] = useState<'upsert' | 'replace'>('upsert')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<UploadResult | null>(null)
  const [error, setError] = useState('')
  const [showSql, setShowSql] = useState(false)
  const [sqlCopied, setSqlCopied] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const f = e.dataTransfer.files[0]
    if (f?.name.endsWith('.xlsx') || f?.name.endsWith('.xls')) {
      setFile(f); setResult(null); setError('')
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null
    setFile(f); setResult(null); setError('')
  }

  async function handleUpload() {
    if (!file) return
    setLoading(true); setError(''); setResult(null)

    const fd = new FormData()
    fd.append('file', file)
    fd.append('mode', modo)

    try {
      const res = await fetch('/api/clientes/upload', { method: 'POST', body: fd })
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

  function downloadTemplate() {
    const wb = XLSX.utils.book_new()
    const wsData = [
      COLUMNAS_TEMPLATE,
      // Example row
      ['Bar El Ejemplo', 'Ejemplo S.A.', '12.345.678-9', '+56912345678', 'contacto@ejemplo.cl',
       'Juan Pérez', 'Calle Falsa 123', 'Santiago', 'Santiago', '8320000', 'IVA',
       'Calle Falsa 123', 'Santiago', 'Santiago', '0', 'Lun-Vie 9-18',
       'Sin notas', '1', 'https://maps.google.com/?q=...', 'Lista A',
       'CLI-001', 'Javier Badilla', '30', '0', '0', 'Particular',
       'Bar', 'Contado', 'Expendio de bebidas'],
    ]
    const ws = XLSX.utils.aoa_to_sheet(wsData)
    // Column widths
    ws['!cols'] = COLUMNAS_TEMPLATE.map(() => ({ wch: 20 }))
    XLSX.utils.book_append_sheet(wb, ws, 'Clientes')
    XLSX.writeFile(wb, 'plantilla_clientes.xlsx')
  }

  function copySql() {
    navigator.clipboard.writeText(SQL_TABLA)
    setSqlCopied(true)
    setTimeout(() => setSqlCopied(false), 2000)
  }

  return (
    <div className="px-4 pt-8 pb-20 lg:px-12 lg:pt-10" style={{ maxWidth: 680, margin: '0 auto', width: '100%' }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <Users size={24} style={{ color: 'var(--gold)' }} />
          <h1 style={{ fontSize: 28, fontWeight: 900, color: 'var(--cream)', letterSpacing: '-0.5px' }}>
            Importar Clientes
          </h1>
        </div>
        <p style={{ fontSize: 13, color: 'var(--muted)' }}>
          Sube un Excel con la lista de clientes para cargarlos en Supabase
        </p>
      </div>

      {/* SQL Setup notice */}
      <div style={{
        borderRadius: 14, padding: '14px 16px', marginBottom: 24,
        background: 'rgba(212,175,55,0.06)', border: '1px solid rgba(212,175,55,0.2)',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <Info size={16} style={{ color: 'var(--gold)', flexShrink: 0, marginTop: 1 }} />
            <div>
              <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--gold)', marginBottom: 4 }}>
                ¿Primera vez? Crea la tabla en Supabase
              </p>
              <p style={{ fontSize: 12, color: 'var(--muted)' }}>
                Ejecuta el SQL en el Supabase SQL Editor antes de subir el archivo.
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowSql(!showSql)}
            style={{
              padding: '5px 12px', borderRadius: 8, fontSize: 11, fontWeight: 700,
              border: '1px solid rgba(212,175,55,0.3)', cursor: 'pointer',
              background: showSql ? 'rgba(212,175,55,0.15)' : 'transparent',
              color: 'var(--gold)', flexShrink: 0,
            }}
          >
            {showSql ? 'Ocultar' : 'Ver SQL'}
          </button>
        </div>

        {showSql && (
          <div style={{ marginTop: 12 }}>
            <pre style={{
              fontSize: 10, color: '#888', background: 'rgba(0,0,0,0.3)', borderRadius: 10,
              padding: '12px 14px', overflow: 'auto', maxHeight: 240, lineHeight: 1.6,
            }}>
              {SQL_TABLA}
            </pre>
            <button
              onClick={copySql}
              style={{
                marginTop: 8, padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                border: 'none', cursor: 'pointer',
                background: sqlCopied ? 'rgba(52,211,153,0.15)' : 'var(--surface2)',
                color: sqlCopied ? '#34D399' : 'var(--cream)',
              }}
            >
              {sqlCopied ? '✓ Copiado' : 'Copiar SQL'}
            </button>
          </div>
        )}
      </div>

      {/* Download template */}
      <button
        onClick={downloadTemplate}
        style={{
          width: '100%', padding: '12px 0', borderRadius: 14, marginBottom: 16,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          background: 'var(--surface)', border: '1px solid var(--border)',
          color: 'var(--muted)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
          transition: 'all 0.15s',
        }}
        onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--cream)'}
        onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--muted)'}
      >
        <Download size={15} />
        Descargar plantilla Excel
      </button>

      {/* Mode selector */}
      <div style={{
        borderRadius: 12, padding: '14px 16px', marginBottom: 16,
        background: 'var(--surface)', border: '1px solid var(--border)',
      }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.05em', marginBottom: 10 }}>
          MODO DE IMPORTACIÓN
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {([
            {
              key: 'upsert',
              label: 'Actualizar / Agregar',
              desc: 'Actualiza clientes existentes y agrega nuevos. Recomendado.',
            },
            {
              key: 'replace',
              label: 'Reemplazar todo',
              desc: 'Elimina todos los clientes existentes y carga desde cero.',
            },
          ] as const).map(op => (
            <label
              key={op.key}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer',
                padding: '10px 12px', borderRadius: 10,
                background: modo === op.key ? (op.key === 'replace' ? 'rgba(248,113,113,0.06)' : 'rgba(212,175,55,0.06)') : 'transparent',
                border: `1px solid ${modo === op.key ? (op.key === 'replace' ? 'rgba(248,113,113,0.3)' : 'rgba(212,175,55,0.25)') : 'transparent'}`,
                transition: 'all 0.15s',
              }}
            >
              <input
                type="radio"
                name="modo"
                value={op.key}
                checked={modo === op.key}
                onChange={() => setModo(op.key)}
                style={{ marginTop: 2, accentColor: op.key === 'replace' ? '#F87171' : 'var(--gold)', flexShrink: 0 }}
              />
              <div>
                <p style={{ fontSize: 13, fontWeight: 700, color: op.key === 'replace' && modo === op.key ? '#F87171' : 'var(--cream)' }}>
                  {op.label}
                </p>
                <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{op.desc}</p>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Drop zone */}
      <div
        style={{
          borderRadius: 20, padding: '32px 24px', textAlign: 'center', marginBottom: 14,
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
          accept=".xlsx,.xls"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />

        {file ? (
          <div>
            <FileSpreadsheet size={42} style={{ color: 'var(--gold)', margin: '0 auto 12px' }} />
            <p style={{ fontWeight: 700, color: 'var(--cream)', fontSize: 15 }}>{file.name}</p>
            <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
              {(file.size / 1024).toFixed(0)} KB · listo para subir
            </p>
          </div>
        ) : (
          <div>
            <Upload size={42} style={{ color: 'var(--muted)', margin: '0 auto 12px' }} />
            <p style={{ fontWeight: 700, color: 'var(--cream)', fontSize: 15 }}>
              Arrastra o haz clic para seleccionar
            </p>
            <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
              Archivo .xlsx con la lista de clientes
            </p>
          </div>
        )}
      </div>

      {/* Upload button */}
      <button
        onClick={handleUpload}
        disabled={!file || loading}
        style={{
          width: '100%', padding: '14px 0', borderRadius: 14, fontWeight: 700, fontSize: 15,
          border: 'none', cursor: file && !loading ? 'pointer' : 'not-allowed',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 14,
          background: file && !loading
            ? (modo === 'replace' ? '#dc2626' : 'var(--gold)')
            : 'var(--surface2)',
          color: file && !loading ? (modo === 'replace' ? '#fff' : '#080808') : 'var(--muted)',
          transition: 'all 0.15s',
        }}
      >
        {loading ? (
          <>
            <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
            Procesando clientes...
          </>
        ) : (
          <>
            {modo === 'replace' ? <RefreshCw size={18} /> : <Upload size={18} />}
            {modo === 'replace' ? 'Reemplazar todos los clientes' : 'Importar clientes'}
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

      {/* Success result */}
      {result && (
        <div style={{
          borderRadius: 14, padding: '18px', marginBottom: 14,
          background: 'rgba(52,211,153,0.05)', border: '1px solid rgba(52,211,153,0.2)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <CheckCircle size={17} style={{ color: '#34D399' }} />
            <span style={{ fontWeight: 700, color: '#34D399', fontSize: 14 }}>Importación completada</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div style={{ borderRadius: 10, padding: '12px 14px', background: 'rgba(52,211,153,0.07)' }}>
              <p style={{ fontSize: 11, color: '#34D399', marginBottom: 6 }}>PROCESADOS EN EXCEL</p>
              <p style={{ fontSize: 28, fontWeight: 900, color: 'white' }}>{result.total}</p>
              <p style={{ fontSize: 11, color: '#666', marginTop: 2 }}>clientes</p>
            </div>
            <div style={{ borderRadius: 10, padding: '12px 14px', background: 'rgba(52,211,153,0.07)' }}>
              <p style={{ fontSize: 11, color: '#34D399', marginBottom: 6 }}>INSERTADOS EN DB</p>
              <p style={{ fontSize: 28, fontWeight: 900, color: 'white' }}>{result.insertadas}</p>
              <p style={{ fontSize: 11, color: '#666', marginTop: 2 }}>
                modo: {result.modo === 'replace' ? 'reemplazo' : 'upsert'}
              </p>
            </div>
          </div>

          {result.modo === 'replace' && (
            <p style={{ fontSize: 12, color: '#F59E0B', marginTop: 10 }}>
              ⚠ Se eliminaron todos los clientes anteriores antes de la importación.
            </p>
          )}
        </div>
      )}

      {/* Column reference */}
      <div style={{
        borderRadius: 16, padding: '18px 20px',
        background: 'var(--surface)', border: '1px solid var(--border)',
        marginTop: 8,
      }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--cream)', marginBottom: 10 }}>
          Columnas reconocidas
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {COLUMNAS_TEMPLATE.map(col => (
            <span
              key={col}
              style={{
                fontSize: 11, padding: '3px 10px', borderRadius: 20, fontWeight: 600,
                background: 'var(--surface2)', color: 'var(--muted)',
              }}
            >
              {col}
            </span>
          ))}
        </div>
        <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 10 }}>
          La primera fila del Excel debe contener los encabezados. El campo <strong style={{ color: 'var(--cream)' }}>nombre</strong> es obligatorio.
        </p>
      </div>
    </div>
  )
}
