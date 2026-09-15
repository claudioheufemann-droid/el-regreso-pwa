'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, Upload, CheckCircle2, AlertTriangle, FileSpreadsheet } from 'lucide-react'

// Mismo tema claro que el resto de Administración.
const C = {
  bg: '#F1F5F9', card: '#FFFFFF', text: '#0F172A', muted: '#64748B', line: '#E2E8F0',
  blue: '#2563EB', green: '#059669', greenSoft: '#ECFDF5', red: '#DC2626', redSoft: '#FEF2F2',
}

interface Resultado {
  ok: boolean
  filasGuardadas?: number
  proveedores?: number
  filasLeidas?: number
  filasIgnoradas?: number
  desde?: string
  hasta?: string
  error?: string
}

export default function CargarComprasClient() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [archivo, setArchivo] = useState<File | null>(null)
  const [subiendo, setSubiendo] = useState(false)
  const [resultado, setResultado] = useState<Resultado | null>(null)

  async function subir() {
    if (!archivo) return
    setSubiendo(true)
    setResultado(null)
    try {
      const fd = new FormData()
      fd.append('file', archivo)
      const r = await fetch('/api/administracion/compras-historico/upload', { method: 'POST', body: fd })
      const data = await r.json()
      setResultado(r.ok ? { ok: true, ...data } : { ok: false, error: data.error ?? 'Error desconocido' })
    } catch (e) {
      setResultado({ ok: false, error: e instanceof Error ? e.message : String(e) })
    } finally {
      setSubiendo(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, padding: '28px 24px 60px' }}>
      <div style={{ maxWidth: 640, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <Link href="/administracion" style={{ display: 'flex', alignItems: 'center', gap: 5, color: C.muted, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
          <ChevronLeft size={15} /> Volver a Administración
        </Link>

        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: C.text }}>Cargar compras</h1>
          <p style={{ fontSize: 13, color: C.muted, marginTop: 6, lineHeight: 1.5 }}>
            Informe &quot;Compras detalladas&quot; del ERP. Se agrupa por &quot;Fecha&quot; + &quot;Proveedor&quot; sumando
            &quot;Total$&quot;, y se guarda en <code>compras_historico</code> — alimenta el forecast de Compras
            (filtrable por proveedor) en la pestaña Forecast. Subir el archivo es seguro de repetir: los
            días+proveedor que ya existen se reemplazan con el nuevo total, no se duplican.
          </p>
        </div>

        <div
          style={{
            background: C.card, border: `1.5px dashed ${C.line}`, borderRadius: 14, padding: 28,
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, textAlign: 'center',
            cursor: 'pointer',
          }}
          onClick={() => inputRef.current?.click()}
        >
          <FileSpreadsheet size={28} style={{ color: archivo ? C.blue : C.muted }} />
          <p style={{ fontSize: 13.5, fontWeight: 700, color: C.text }}>
            {archivo ? archivo.name : 'Hacer clic para elegir el archivo .xlsx'}
          </p>
          {archivo && (
            <p style={{ fontSize: 12, color: C.muted }}>{(archivo.size / 1024).toFixed(0)} KB</p>
          )}
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls"
            style={{ display: 'none' }}
            onChange={e => { setArchivo(e.target.files?.[0] ?? null); setResultado(null) }}
          />
        </div>

        <button
          onClick={subir}
          disabled={!archivo || subiendo}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            padding: '12px 20px', borderRadius: 10, border: 'none', cursor: archivo && !subiendo ? 'pointer' : 'default',
            fontSize: 14, fontWeight: 700, color: '#fff',
            background: archivo && !subiendo ? C.blue : C.muted, opacity: archivo && !subiendo ? 1 : 0.6,
          }}
        >
          <Upload size={16} /> {subiendo ? 'Subiendo…' : 'Subir y procesar'}
        </button>

        {resultado?.ok && (
          <div style={{ background: C.greenSoft, border: `1px solid ${C.green}`, borderRadius: 12, padding: 18, display: 'flex', gap: 10 }}>
            <CheckCircle2 size={18} style={{ color: C.green, flexShrink: 0, marginTop: 1 }} />
            <div style={{ fontSize: 13, color: C.text, lineHeight: 1.6 }}>
              <p style={{ fontWeight: 700 }}>Cargado correctamente</p>
              <p>{resultado.filasGuardadas} combinaciones día+proveedor ({resultado.proveedores} proveedores), del {resultado.desde} al {resultado.hasta}.</p>
              <p style={{ color: C.muted }}>{resultado.filasLeidas} líneas leídas del archivo{(resultado.filasIgnoradas ?? 0) > 0 ? `, ${resultado.filasIgnoradas} ignoradas por no tener fecha o proveedor` : ''}.</p>
            </div>
          </div>
        )}

        {resultado && !resultado.ok && (
          <div style={{ background: C.redSoft, border: `1px solid ${C.red}`, borderRadius: 12, padding: 18, display: 'flex', gap: 10 }}>
            <AlertTriangle size={18} style={{ color: C.red, flexShrink: 0, marginTop: 1 }} />
            <p style={{ fontSize: 13, color: C.text }}>{resultado.error}</p>
          </div>
        )}
      </div>
    </div>
  )
}
