'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, Upload, CheckCircle2, AlertTriangle, FileSpreadsheet } from 'lucide-react'

// Mismo tema claro que el resto de Administración.
const C = {
  bg: '#F1F5F9', card: '#FFFFFF', text: '#0F172A', muted: '#64748B', line: '#E2E8F0',
  blue: '#2563EB', blueSoft: '#EFF6FF', green: '#059669', greenSoft: '#ECFDF5',
  red: '#DC2626', redSoft: '#FEF2F2', amber: '#D97706', amberSoft: '#FFFBEB',
}

interface Resultado {
  ok: boolean
  cobros?: number
  montoTotal?: number
  clientesActualizados?: number
  clientesSinFicha?: number
  filasLeidas?: number
  filasEspejoIgnoradas?: number
  montoEspejoIgnorado?: number
  anulaciones?: number
  montoAnulaciones?: number
  ajustesContables?: number
  montoAjustes?: number
  cobrosConGuia?: number
  cobrosCruzados?: number
  desde?: string
  hasta?: string
  error?: string
}

const fMoney = (n: number) => '$' + Math.round(n).toLocaleString('es-CL')
const fNum = (n: number) => n.toLocaleString('es-CL')

export default function CargarCobrosClient() {
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
      const r = await fetch('/api/administracion/cobros/upload', { method: 'POST', body: fd })
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
      <div style={{ maxWidth: 680, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <Link href="/administracion" style={{ display: 'flex', alignItems: 'center', gap: 5, color: C.muted, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
          <ChevronLeft size={15} /> Volver a Administración
        </Link>

        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: C.text }}>Cargar cobros del ERP</h1>
          <p style={{ fontSize: 13, color: C.muted, marginTop: 6, lineHeight: 1.6 }}>
            Informe <strong>&quot;Movimientos Cta. Cte.&quot;</strong> del ERP. Es la única fuente de pagos reales
            que tiene el sistema: de acá sale cuánta plata entró de verdad cada semana y cuántos días
            se demora en pagar cada cliente.
          </p>
        </div>

        <div style={{ background: C.blueSoft, border: `1px solid #BFDBFE`, borderRadius: 12, padding: 16, fontSize: 12.5, color: C.text, lineHeight: 1.7 }}>
          <p style={{ fontWeight: 700, marginBottom: 6 }}>Qué hace al subirlo</p>
          <p>· Guarda cada pago con su fecha, monto y medio de pago.</p>
          <p>· Cruza cada pago con su guía para medir los días reales de pago de cada cliente.</p>
          <p>· Actualiza el plazo real de los clientes con 3 o más pagos cruzados, que es el que usa la
            proyección de caja.</p>
          <p style={{ marginTop: 8, color: C.muted }}>
            Se puede volver a subir sin problema: reemplaza el período que trae el archivo en vez de duplicarlo.
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
          {archivo && <p style={{ fontSize: 12, color: C.muted }}>{(archivo.size / 1024 / 1024).toFixed(1)} MB</p>}
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
            padding: '12px 20px', borderRadius: 10, border: 'none',
            cursor: archivo && !subiendo ? 'pointer' : 'default',
            fontSize: 14, fontWeight: 700, color: '#fff',
            background: archivo && !subiendo ? C.blue : C.muted, opacity: archivo && !subiendo ? 1 : 0.6,
          }}
        >
          <Upload size={16} /> {subiendo ? 'Procesando… (puede tardar un minuto)' : 'Subir y procesar'}
        </button>

        {resultado?.ok && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ background: C.greenSoft, border: `1px solid ${C.green}`, borderRadius: 12, padding: 18, display: 'flex', gap: 10 }}>
              <CheckCircle2 size={18} style={{ color: C.green, flexShrink: 0, marginTop: 1 }} />
              <div style={{ fontSize: 13, color: C.text, lineHeight: 1.7 }}>
                <p style={{ fontWeight: 700 }}>Cargado correctamente</p>
                <p>
                  <strong>{fNum(resultado.cobros ?? 0)} pagos</strong> por{' '}
                  <strong>{fMoney(resultado.montoTotal ?? 0)}</strong>, del {resultado.desde} al {resultado.hasta}.
                </p>
                <p>
                  Se actualizó el plazo real de <strong>{resultado.clientesActualizados} clientes</strong>{' '}
                  (de {fNum(resultado.cobrosCruzados ?? 0)} pagos cruzados con su guía).
                </p>
              </div>
            </div>

            {/* El detalle de lo descartado va visible, no escondido: si el ERP
                cambia el formato del informe, estos números se mueven y es la
                única señal temprana de que algo dejó de leerse bien. */}
            <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: 16 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 10 }}>
                Qué se descartó y por qué
              </p>
              <Fila
                label="Filas duplicadas de PDV"
                valor={`${fNum(resultado.filasEspejoIgnoradas ?? 0)} filas · ${fMoney(resultado.montoEspejoIgnorado ?? 0)}`}
                nota="El ERP anota cada venta de mostrador hasta 3 veces. Se cuenta una sola."
              />
              <Fila
                label="Anulaciones de guía"
                valor={`${fNum(resultado.anulaciones ?? 0)} · ${fMoney(resultado.montoAnulaciones ?? 0)}`}
                nota="Reversas, no plata que entró."
              />
              <Fila
                label="Ajustes contables"
                valor={`${fNum(resultado.ajustesContables ?? 0)} · ${fMoney(resultado.montoAjustes ?? 0)}`}
                nota="Notas de crédito, traspasos y ajustes manuales sin medio de pago."
              />
              <Fila
                label="Líneas leídas del archivo"
                valor={fNum(resultado.filasLeidas ?? 0)}
                nota={`${fNum(resultado.cobrosConGuia ?? 0)} pagos traían referencia de guía.`}
                ultimo
              />
              {(resultado.clientesSinFicha ?? 0) > 0 && (
                <p style={{ fontSize: 11.5, color: C.amber, marginTop: 10, background: C.amberSoft, padding: 8, borderRadius: 8 }}>
                  {resultado.clientesSinFicha} clientes del informe no tienen ficha en el maestro, así que su
                  plazo real no se pudo guardar. Se ven igual en el ingreso de caja.
                </p>
              )}
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

function Fila({ label, valor, nota, ultimo }: { label: string; valor: string; nota: string; ultimo?: boolean }) {
  return (
    <div style={{ padding: '8px 0', borderBottom: ultimo ? 'none' : `1px solid ${C.line}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
        <span style={{ fontSize: 12.5, color: C.text, fontWeight: 600 }}>{label}</span>
        <span style={{ fontSize: 12.5, color: C.muted, fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>{valor}</span>
      </div>
      <p style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{nota}</p>
    </div>
  )
}
