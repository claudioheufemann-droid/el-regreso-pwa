'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AlertTriangle, Check, ChevronRight, FileText, HelpCircle, Loader2, Pencil, User,
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import type { DetalleCobranza, DocumentoVencido } from '@/lib/cobranza'

// ── Datos ────────────────────────────────────────────────────────────────────
export interface ContactoCobranza {
  contacto: string
  cargo: string | null
  telefono: string | null
  updated_at?: string
}

export interface DatosCobranza {
  cliente: string
  razonSocial: string | null
  telefono: string | null
  email: string | null
  localidad: string | null
  deudaVencida: number
  /** Deuda vencida menos la maquila: lo que persigue el área comercial. */
  deudaComercial: number
  saldoTotal: number
  contacto: ContactoCobranza | null
  detalle: DetalleCobranza
}

// ── Paletas ──────────────────────────────────────────────────────────────────
// El módulo vive en dos temas: la tarjeta móvil es clara (mismo lenguaje que
// Clientes/Stock) y la tabla de escritorio es oscura. Mismo componente, misma
// jerarquía visual, sólo cambian los tokens.
interface Paleta {
  card: string; sub: string; text: string; muted: string; faint: string
  border: string; red: string; redSoft: string; amber: string; amberSoft: string
  green: string; greenSoft: string; accent: string
}

const CLARO: Paleta = {
  card: '#FFFFFF', sub: '#F8FAFC', text: '#0F172A', muted: '#64748B', faint: '#94A3B8',
  border: '#E2E8F0', red: '#DC2626', redSoft: '#FEF2F2', amber: '#D97706', amberSoft: '#FFFBEB',
  green: '#059669', greenSoft: '#ECFDF5', accent: '#2563EB',
}

const OSCURO: Paleta = {
  card: 'rgba(255,255,255,0.03)', sub: 'rgba(255,255,255,0.05)', text: 'var(--cream)',
  muted: 'var(--muted)', faint: '#6B7280', border: 'var(--border)',
  red: '#f87171', redSoft: 'rgba(248,113,113,0.10)', amber: '#fbbf24', amberSoft: 'rgba(251,191,36,0.10)',
  green: '#4ade80', greenSoft: 'rgba(74,222,128,0.10)', accent: 'var(--gold)',
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

function fFecha(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${parseInt(d)} ${MESES[parseInt(m) - 1]} ${y}`
}

function fFechaCorta(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split('-')
  return `${parseInt(d)} ${MESES[parseInt(m) - 1]}`
}

/** Un solo criterio de color para la mora en toda la pantalla. */
function colorMora(dias: number, p: Paleta): { fg: string; bg: string } {
  if (dias >= 60) return { fg: p.red, bg: p.redSoft }
  if (dias >= 1) return { fg: p.amber, bg: p.amberSoft }
  return { fg: p.green, bg: p.greenSoft }
}

function nLitros(l: number): string {
  return l.toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}

/** formatCurrency deja los negativos como "$-16.800"; acá el signo va delante. */
function fPlata(n: number): string {
  const v = Math.round(n)
  return v < 0 ? `-${formatCurrency(-v)}` : formatCurrency(v)
}

// ── Contacto de cobranza ─────────────────────────────────────────────────────
// Editable en línea porque el ERP no trae el dato: su maestro de clientes no
// tiene columna Contacto, así que el nombre sólo puede salir del vendedor, que
// es quien habla con la persona.
function BloqueContacto({ cliente, contacto, p, onCambio }: {
  cliente: string; contacto: ContactoCobranza | null; p: Paleta
  onCambio: (c: ContactoCobranza | null) => void
}) {
  const [editando, setEditando] = useState(false)
  const [nombre, setNombre] = useState(contacto?.contacto ?? '')
  const [cargo, setCargo] = useState(contacto?.cargo ?? '')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function guardar() {
    setGuardando(true)
    setError(null)
    try {
      const r = await fetch('/api/deudores/contacto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cliente, contacto: nombre, cargo }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error ?? 'No se pudo guardar')
      onCambio(j.contacto ?? null)
      setEditando(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar')
    } finally {
      setGuardando(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', minHeight: 40, padding: '9px 11px', borderRadius: 10,
    border: `1px solid ${p.border}`, background: p.card, color: p.text,
    fontSize: 13, outline: 'none', boxSizing: 'border-box',
  }

  if (editando) {
    return (
      <div style={{ background: p.sub, border: `1px solid ${p.border}`, borderRadius: 12, padding: 12, marginBottom: 12 }}>
        <p style={{ fontSize: 9.5, color: p.muted, fontWeight: 700, letterSpacing: '0.05em', marginBottom: 8 }}>
          CONTACTO DE COBRANZA
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input autoFocus value={nombre} onChange={e => setNombre(e.target.value)}
            placeholder="Nombre de la persona" style={inputStyle}
            onKeyDown={e => { if (e.key === 'Enter') guardar() }} />
          <input value={cargo} onChange={e => setCargo(e.target.value)}
            placeholder="Cargo (opcional) — ej. Administración" style={inputStyle}
            onKeyDown={e => { if (e.key === 'Enter') guardar() }} />
        </div>
        {error && <p style={{ fontSize: 11.5, color: p.red, marginTop: 8 }}>{error}</p>}
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button onClick={() => { setEditando(false); setNombre(contacto?.contacto ?? ''); setCargo(contacto?.cargo ?? '') }}
            style={{ flex: 1, minHeight: 40, borderRadius: 10, border: `1px solid ${p.border}`,
              background: 'transparent', color: p.muted, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
            Cancelar
          </button>
          <button onClick={guardar} disabled={guardando}
            style={{ flex: 1.4, minHeight: 40, borderRadius: 10, border: 'none', background: p.accent,
              color: '#fff', fontSize: 12.5, fontWeight: 800, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: guardando ? 0.6 : 1 }}>
            {guardando ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            Guardar
          </button>
        </div>
      </div>
    )
  }

  return (
    <button onClick={() => setEditando(true)}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, width: '100%', minHeight: 48,
        padding: '10px 12px', marginBottom: 12, textAlign: 'left', cursor: 'pointer', font: 'inherit',
        background: p.sub, border: `1px solid ${p.border}`, borderRadius: 12,
      }}>
      <div style={{ width: 32, height: 32, borderRadius: '50%', flexShrink: 0, background: p.card,
        border: `1px solid ${p.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <User size={15} color={contacto ? p.accent : p.faint} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 9.5, color: p.muted, fontWeight: 700, letterSpacing: '0.05em' }}>CONTACTO DE COBRANZA</p>
        <p style={{ fontSize: 13.5, fontWeight: contacto ? 800 : 500, color: contacto ? p.text : p.faint,
          marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {contacto ? contacto.contacto : 'Sin contacto — tócalo para agregarlo'}
          {contacto?.cargo && <span style={{ fontWeight: 500, color: p.muted }}> · {contacto.cargo}</span>}
        </p>
      </div>
      <Pencil size={14} color={p.faint} style={{ flexShrink: 0 }} />
    </button>
  )
}

// ── Un documento vencido ─────────────────────────────────────────────────────
function FilaDocumento({ d, p }: { d: DocumentoVencido; p: Paleta }) {
  const [abierto, setAbierto] = useState(false)
  const c = colorMora(d.diasMora, p)
  // Las líneas negativas del ERP son notas de crédito/ajustes de la misma
  // factura: se muestran igual, marcadas, porque explican por qué el total no
  // es la simple suma de los productos.
  const items = d.items

  return (
    <div style={{ border: `1px solid ${p.border}`, borderRadius: 12, overflow: 'hidden', background: p.card }}>
      <button onClick={() => setAbierto(!abierto)}
        style={{ display: 'block', width: '100%', textAlign: 'left', background: 'transparent',
          border: 'none', cursor: 'pointer', padding: '10px 12px', font: 'inherit', minHeight: 44 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <FileText size={14} color={p.faint} style={{ flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 13, fontWeight: 800, color: p.text }}>
              N° {d.pedido.replace(/^0+/, '')}
              {d.abonoParcial && (
                <span style={{ fontSize: 9.5, fontWeight: 700, color: p.amber, background: p.amberSoft,
                  padding: '2px 6px', borderRadius: 6, marginLeft: 6 }}>
                  con abono
                </span>
              )}
              {d.esMaquila && (
                <span style={{ fontSize: 9.5, fontWeight: 700, color: p.muted, background: p.sub,
                  border: `1px solid ${p.border}`, padding: '2px 6px', borderRadius: 6, marginLeft: 6 }}>
                  maquila
                </span>
              )}
            </p>
            <p style={{ fontSize: 11, color: p.muted, marginTop: 1 }}>
              {fFechaCorta(d.fechaEmision)} · venció {fFechaCorta(d.fechaVencimiento)}
            </p>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <p style={{ fontSize: 13.5, fontWeight: 800, color: p.text }}>{fPlata(d.monto)}</p>
            <span style={{ fontSize: 10, fontWeight: 700, color: c.fg }}>
              {d.diasMora} {d.diasMora === 1 ? 'día' : 'días'}
            </span>
          </div>
          <ChevronRight size={15} color={p.faint}
            style={{ flexShrink: 0, transform: abierto ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }} />
        </div>
      </button>

      {abierto && (
        <div style={{ borderTop: `1px solid ${p.border}`, background: p.sub, padding: '10px 12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 9.5, color: p.muted, fontWeight: 700, letterSpacing: '0.05em' }}>PRODUCTO</span>
            <span style={{ fontSize: 9.5, color: p.muted, fontWeight: 700, letterSpacing: '0.05em' }}>PRECIO</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {items.map((it, i) => (
              <div key={`${it.producto}-${i}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 12, fontWeight: 600, color: it.bruto < 0 ? p.muted : p.text, lineHeight: 1.35 }}>
                    {it.producto}
                  </p>
                  <p style={{ fontSize: 10.5, color: p.faint, marginTop: 1 }}>
                    {[it.envase || null, it.litros > 0 ? `${nLitros(it.litros)} L` : null, it.bruto < 0 ? 'nota de crédito' : null]
                      .filter(Boolean)
                      .join(' · ') || 'servicio'}
                  </p>
                </div>
                <p style={{ fontSize: 12, fontWeight: 700, color: it.bruto < 0 ? p.green : p.text, flexShrink: 0, whiteSpace: 'nowrap' }}>
                  {fPlata(it.bruto)}
                </p>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: `1px solid ${p.border}`, marginTop: 10, paddingTop: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: p.muted }}>
              Total documento{d.abonoParcial ? ' (queda por pagar)' : ''}
            </span>
            <span style={{ fontSize: 13, fontWeight: 800, color: p.text }}>{fPlata(d.monto)}</span>
          </div>
          {d.abonoParcial && (
            <p style={{ fontSize: 10.5, color: p.muted, marginTop: 6, lineHeight: 1.45 }}>
              El documento se emitió por {fPlata(d.montoOriginal)} y ya tiene abonos a cuenta.
            </p>
          )}
          <p style={{ fontSize: 10, color: p.faint, marginTop: 6 }}>Precios con IVA{d.items.some(i => i.bruto > i.neto * 1.2) ? ' e ILA' : ''} incluidos.</p>
        </div>
      )}
    </div>
  )
}

// ── Panel ────────────────────────────────────────────────────────────────────
export default function PanelCobranza({ cliente, tema = 'claro', onDatos }: {
  cliente: string
  tema?: 'claro' | 'oscuro'
  /** Se llama cuando llegan los datos, para que el padre arme el mensaje de WhatsApp. */
  onDatos?: (d: DatosCobranza) => void
}) {
  const p = tema === 'oscuro' ? OSCURO : CLARO
  const [datos, setDatos] = useState<DatosCobranza | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [intento, setIntento] = useState(0)

  // El callback va por ref para que el fetch dependa sólo del cliente: si
  // dependiera de `onDatos`, un padre que pase una arrow inline dispararía un
  // fetch en cada render. Este efecto va declarado ANTES del de carga para que
  // la ref ya esté al día cuando el fetch resuelva.
  const onDatosRef = useRef(onDatos)
  useEffect(() => { onDatosRef.current = onDatos })

  useEffect(() => {
    let vivo = true
    ;(async () => {
      try {
        const r = await fetch(`/api/deudores/detalle?cliente=${encodeURIComponent(cliente)}`)
        const j = await r.json()
        if (!vivo) return
        if (!r.ok) throw new Error(j.error ?? 'No se pudo cargar el detalle')
        setDatos(j)
        setError(null)
        setCargando(false)
        onDatosRef.current?.(j)
      } catch (e) {
        if (!vivo) return
        setError(e instanceof Error ? e.message : 'No se pudo cargar el detalle')
        setCargando(false)
      }
    })()
    return () => { vivo = false }
  }, [cliente, intento])

  const cargar = useCallback(() => {
    setCargando(true)
    setError(null)
    setIntento(i => i + 1)
  }, [])

  if (cargando) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
        {[56, 44, 44].map((h, i) => (
          <div key={i} style={{ height: h, borderRadius: 12, background: p.sub, border: `1px solid ${p.border}` }} />
        ))}
      </div>
    )
  }

  if (error || !datos) {
    return (
      <div style={{ background: p.redSoft, border: `1px solid ${p.border}`, borderRadius: 12, padding: 12, marginBottom: 12 }}>
        <p style={{ fontSize: 12, color: p.red, marginBottom: 8 }}>{error ?? 'Sin datos'}</p>
        <button onClick={cargar}
          style={{ minHeight: 36, padding: '0 14px', borderRadius: 9, border: `1px solid ${p.border}`,
            background: p.card, color: p.text, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
          Reintentar
        </button>
      </div>
    )
  }

  const { detalle } = datos
  const c = colorMora(detalle.diasMoraMaxima, p)
  // La maquila va en su propio bloque: es plata del mismo cliente pero de otra
  // línea de negocio (co-packing), y mezclarla infla lo que el vendedor cree
  // que tiene que cobrar.
  const comerciales = detalle.vencidos.filter(d => !d.esMaquila)
  const maquila = detalle.vencidos.filter(d => d.esMaquila)

  return (
    <div style={{ marginBottom: 12 }}>
      {/* Días exactos de mora — el número que el vendedor dice por teléfono. */}
      {datos.deudaComercial > 0 && (
        <div style={{ background: c.bg, border: `1px solid ${c.fg}30`, borderRadius: 12, padding: '12px 14px', marginBottom: 12 }}>
          <p style={{ fontSize: 9.5, color: p.muted, fontWeight: 700, letterSpacing: '0.05em' }}>DEUDA VENCIDA HACE</p>
          <p style={{ fontSize: 26, fontWeight: 900, color: c.fg, letterSpacing: '-0.5px', lineHeight: 1.1, marginTop: 2 }}>
            {detalle.diasMoraMaxima} <span style={{ fontSize: 15, fontWeight: 700 }}>{detalle.diasMoraMaxima === 1 ? 'día' : 'días'}</span>
          </p>
          {detalle.fechaDocumentoAntiguo && (
            <p style={{ fontSize: 11.5, color: p.muted, marginTop: 4, lineHeight: 1.45 }}>
              Documento más antiguo impago
              {detalle.remitoMasAntiguo ? `: remito N° ${detalle.remitoMasAntiguo}` : ''} del{' '}
              {fFecha(detalle.fechaDocumentoAntiguo)}. Venció el{' '}
              {fFecha(new Date(new Date(detalle.fechaDocumentoAntiguo + 'T00:00:00Z').getTime() + detalle.diasPago * 86400000).toISOString())}
              {detalle.diasPago > 0 ? ` (${detalle.diasPago} días de plazo)` : ''}.
            </p>
          )}
        </div>
      )}

      <BloqueContacto cliente={cliente} contacto={datos.contacto} p={p}
        onCambio={ct => setDatos(d => (d ? { ...d, contacto: ct } : d))} />

      {/* Facturas vencidas con su detalle. El total del encabezado es la deuda
          COMERCIAL y la lista siempre la suma: facturas identificadas + resto.
          Antes el resto no se mostraba y el vendedor veía menos plata de la
          que en realidad tiene que cobrar. */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 7 }}>
        <span style={{ fontSize: 9.5, color: p.muted, fontWeight: 700, letterSpacing: '0.05em' }}>
          DEUDA VENCIDA A COBRAR
        </span>
        <span style={{ fontSize: 12, fontWeight: 800, color: p.red }}>{formatCurrency(datos.deudaComercial)}</span>
      </div>

      {comerciales.length === 0 && detalle.restoPorTramo.length === 0 ? (
        <div style={{ background: p.sub, border: `1px solid ${p.border}`, borderRadius: 12, padding: '14px 12px', marginBottom: 10 }}>
          <p style={{ fontSize: 12, color: p.muted, lineHeight: 1.5 }}>
            {datos.deudaComercial > 0
              ? 'El ERP marca deuda vencida pero no hay ventas cargadas que la expliquen.'
              : 'Este cliente no tiene deuda comercial vencida.'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
          {comerciales.map(d => <FilaDocumento key={d.pedido} d={d} p={p} />)}

          {/* El resto: plata vencida que el ERP tiene pero que ninguna factura
              del informe de ventas explica. Va con su antigüedad, que es lo
              único que se sabe de ella y sirve igual para cobrar. */}
          {detalle.restoPorTramo.map(r => (
            <div key={r.tramo} style={{ border: `1px dashed ${p.border}`, borderRadius: 12, background: p.sub, padding: '10px 12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <HelpCircle size={14} color={p.faint} style={{ flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: p.text }}>Sin detalle de factura</p>
                  <p style={{ fontSize: 11, color: p.muted, marginTop: 1 }}>Vencida hace {r.label}</p>
                </div>
                <p style={{ fontSize: 13.5, fontWeight: 800, color: p.text, flexShrink: 0 }}>{fPlata(r.monto)}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Explicación del resto — una sola vez, no por fila. */}
      {detalle.restoSinDetalle > 0 && (
        <div style={{ display: 'flex', gap: 8, background: p.amberSoft, border: `1px solid ${p.amber}30`,
          borderRadius: 10, padding: '9px 11px', marginBottom: 10 }}>
          <AlertTriangle size={14} color={p.amber} style={{ flexShrink: 0, marginTop: 1 }} />
          <p style={{ fontSize: 11, color: p.muted, lineHeight: 1.45 }}>
            Los {fPlata(detalle.restoSinDetalle)} sin detalle están en la deuda del ERP pero no hay factura en el
            informe de ventas que los explique: suele ser deuda anterior al histórico de la app, un ajuste de cuenta
            corriente hecho a mano, o notas de crédito.{' '}
            <strong style={{ color: p.text }}>Igual hay que cobrarlos.</strong>
          </p>
        </div>
      )}

      {/* Maquila: se muestra aparte y no suma al total de arriba. */}
      {maquila.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 7 }}>
            <span style={{ fontSize: 9.5, color: p.faint, fontWeight: 700, letterSpacing: '0.05em' }}>
              MAQUILA — NO ES COBRANZA COMERCIAL
            </span>
            <span style={{ fontSize: 12, fontWeight: 700, color: p.muted }}>{fPlata(detalle.maquilaVencida)}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, opacity: 0.72 }}>
            {maquila.map(d => <FilaDocumento key={d.pedido} d={d} p={p} />)}
          </div>
        </div>
      )}

      {detalle.porVencer.length > 0 && (
        <p style={{ fontSize: 11, color: p.faint, lineHeight: 1.45 }}>
          Además tiene {detalle.porVencer.length} documento{detalle.porVencer.length === 1 ? '' : 's'} aún no vencido
          {detalle.porVencer.length === 1 ? '' : 's'} por {fPlata(detalle.porVencer.reduce((s, d) => s + d.monto, 0))}.
        </p>
      )}
    </div>
  )
}

/**
 * Documentos en el formato que espera el mensaje de WhatsApp. Sin maquila: al
 * cliente se le cobra su deuda comercial, el co-packing se conversa aparte.
 */
export function documentosParaWA(d: DetalleCobranza) {
  return d.vencidos.filter(v => !v.esMaquila).map(v => ({
    pedido: v.pedido,
    fechaEmision: v.fechaEmision,
    fechaVencimiento: v.fechaVencimiento,
    diasMora: v.diasMora,
    monto: Math.round(v.monto),
  }))
}
