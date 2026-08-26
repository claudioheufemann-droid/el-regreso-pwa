'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { MessageCircle, Minus, Plus, AlertTriangle, ChevronDown, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { CATALOGO_INFO_DEFAULT, type CatalogoInfo, fmtPrecioCLP } from '@/lib/catalogo-productos'
import { imagenProducto } from '@/lib/producto-imagenes'
import ProductImage from '@/components/ui/ProductImage'
import { C } from '../theme'

/**
 * Piezas compartidas del flujo de venta en terreno.
 *
 * Viven fuera de NuevaVisitaClient para que ese archivo quede sólo con el
 * flujo (elegir cliente → vender → cerrar). Todo acá ya está en el tema
 * claro del módulo Ventas; la única excepción a propósito es la imagen del
 * pedido que se comparte por WhatsApp, que sigue siendo oscura con dorado
 * porque es material de marca que ve el CLIENTE, no una pantalla interna.
 */

export const WA = '#25D366'

export interface ItemCarrito {
  producto: string
  categoria: string
  envase: string
  cantidad: number
  precio: number
}

// ─── Catálogo activo (lo fija NuevaVisitaClient según el vendedor) ──────────
let CATALOGO: Record<string, CatalogoInfo> = CATALOGO_INFO_DEFAULT
export function setCatalogo(c: Record<string, CatalogoInfo>) { CATALOGO = c }
export function getCatalogo() { return CATALOGO }

// ─── Fotos de producto ──────────────────────────────────────────────────────
// El mapa nombre→foto vive en lib/producto-imagenes.ts (fuente única). Antes
// estaba copiado acá y en otros cuatro archivos, y el respaldo era un emoji.

export function ProductoThumb({ nombre, categoria, esBarril = false, size = 48 }: {
  nombre: string; categoria: string; esBarril?: boolean; size?: number
}) {
  return <ProductImage nombre={nombre} categoria={categoria} esBarril={esBarril} size={size} />
}

// ─── Selector de cantidad ───────────────────────────────────────────────────
/** El número se puede tocar para escribir la cantidad directo — cargar 24
 *  latas a punta de "+" era inviable en terreno. */
export function CantidadInput({ value, onchange }: { value: number; onchange: (n: number) => void }) {
  const [editando, setEditando] = useState(false)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const confirmar = useCallback((raw: string) => {
    const n = parseInt(raw, 10)
    if (!isNaN(n) && n >= 0) onchange(n)
    setEditando(false)
  }, [onchange])

  const activo = value > 0

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <button
        onClick={() => onchange(Math.max(0, value - 1))}
        aria-label="Quitar uno"
        style={{
          width: 40, height: 40, borderRadius: 11, cursor: 'pointer',
          border: `1px solid ${C.line}`, background: activo ? C.card : C.bg,
          color: activo ? C.text : C.faint, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <Minus size={16} />
      </button>

      {editando ? (
        <input
          ref={inputRef}
          value={draft}
          autoFocus
          onChange={e => setDraft(e.target.value.replace(/\D/g, ''))}
          onBlur={() => confirmar(draft)}
          onKeyDown={e => {
            if (e.key === 'Enter') confirmar(draft)
            if (e.key === 'Escape') setEditando(false)
          }}
          type="text"
          inputMode="numeric"
          style={{
            width: 46, height: 40, textAlign: 'center', fontSize: 16, fontWeight: 800,
            background: C.blueSoft, border: `1.5px solid ${C.blue}`, borderRadius: 11,
            color: C.blue, outline: 'none',
          }}
        />
      ) : (
        <button
          onClick={() => { setDraft(value > 0 ? String(value) : ''); setEditando(true) }}
          title="Toca para escribir la cantidad"
          style={{
            width: 46, height: 40, fontSize: 17, fontWeight: 800, cursor: 'text',
            color: activo ? C.text : C.faint, background: 'transparent',
            border: `1px dashed ${activo ? C.blue : C.line}`, borderRadius: 11,
          }}
        >
          {value}
        </button>
      )}

      <button
        onClick={() => onchange(value + 1)}
        aria-label="Agregar uno"
        style={{
          width: 40, height: 40, borderRadius: 11, cursor: 'pointer',
          border: 'none', background: C.hero, color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <Plus size={16} />
      </button>
    </div>
  )
}

// ─── Catálogo por WhatsApp ──────────────────────────────────────────────────

export function generarMensajeCatalogo(): string {
  const cervezas  = Object.entries(CATALOGO).filter(([, i]) => !i.estilo.toLowerCase().includes('kombucha'))
  const kombuchas = Object.entries(CATALOGO).filter(([, i]) =>  i.estilo.toLowerCase().includes('kombucha'))

  let m = '🍺 *CATÁLOGO EL REGRESO BEER CO*\n_www.elregresobeer.com_\n\n'
  m += '*━━━ CERVEZAS ━━━*\n\n'
  for (const [nombre, info] of cervezas) {
    m += `🍺 *${nombre}* — ${info.estilo}\n`
    m += `$${info.precio_lata.toLocaleString('es-CL')} la lata · Caja 24: $${(info.precio_lata * 24).toLocaleString('es-CL')}\n\n`
  }
  if (kombuchas.length) {
    m += '*━━━ KOMBUCHAS ━━━*\n\n'
    for (const [nombre, info] of kombuchas) {
      m += `🫧 *${nombre}*\n`
      m += `$${info.precio_lata.toLocaleString('es-CL')} la lata · Caja 24: $${(info.precio_lata * 24).toLocaleString('es-CL')}\n\n`
    }
  }
  m += '_Precios con IVA incluido._'
  return m
}

function abrirWhatsApp(phone: string, mensaje: string) {
  const num = phone.replace(/[\s\-()]/g, '').replace(/^\+?56/, '56').replace(/^(?!56)/, '56')
  window.open(`https://wa.me/${num}?text=${encodeURIComponent(mensaje)}`, '_blank')
}

export function WhatsAppCatalogoModal({ onClose }: { onClose: () => void }) {
  const [phone, setPhone] = useState('')

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 400 }}
    >
      <div style={{ background: C.bg, borderRadius: '20px 20px 0 0', padding: '20px 16px 32px', width: '100%', maxWidth: 520 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 14 }}>
          <span style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(37,211,102,.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <MessageCircle size={20} color={WA} />
          </span>
          <div>
            <p style={{ fontSize: 16, fontWeight: 800, color: C.text }}>Enviar catálogo</p>
            <p style={{ fontSize: 12, color: C.muted }}>Se envía la lista completa con precios</p>
          </div>
        </div>

        <input
          value={phone} onChange={e => setPhone(e.target.value)}
          placeholder="+56 9 1234 5678" type="tel" autoFocus
          style={{
            width: '100%', padding: '13px 14px', borderRadius: 12, marginBottom: 14,
            background: C.card, border: `1px solid ${C.line}`, color: C.text, fontSize: 16, outline: 'none',
          }}
        />

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{
            flex: 1, minHeight: 50, borderRadius: 12, border: `1px solid ${C.line}`,
            background: C.card, color: C.muted, fontSize: 14, fontWeight: 700, cursor: 'pointer',
          }}>
            Cancelar
          </button>
          <button
            onClick={() => { if (phone.trim()) { abrirWhatsApp(phone, generarMensajeCatalogo()); onClose() } }}
            disabled={!phone.trim()}
            style={{
              flex: 2, minHeight: 50, borderRadius: 12, border: 'none',
              background: phone.trim() ? WA : '#D1FAE5', color: phone.trim() ? '#fff' : '#6EE7B7',
              fontSize: 14, fontWeight: 800, cursor: phone.trim() ? 'pointer' : 'not-allowed',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            <MessageCircle size={16} /> Abrir WhatsApp
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Imagen del pedido (canvas) ─────────────────────────────────────────────
// A propósito sigue siendo oscura con dorado: es la pieza de marca que recibe
// el CLIENTE por WhatsApp, no una pantalla interna del vendedor.

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const i = new Image()
    i.onload = () => res(i)
    i.onerror = rej
    i.src = src
  })
}

async function generarImagenVenta(items: ItemCarrito[], clienteNombre: string, vendedorNombre: string): Promise<Blob> {
  const W = 600, PAD = 28, ROW = 76, HEADER = 172, TOTAL_ROW = 62, FOOTER = 56
  const H = HEADER + items.length * ROW + TOTAL_ROW + FOOTER
  const DPR = 2
  const canvas = document.createElement('canvas')
  canvas.width = W * DPR; canvas.height = H * DPR
  const ctx = canvas.getContext('2d')!
  ctx.scale(DPR, DPR)

  const imgs: Record<string, HTMLImageElement | null> = {}
  await Promise.all(items.map(async it => {
    const src = imagenProducto({ nombre: it.producto })
    imgs[it.producto] = src ? await loadImg(src).catch(() => null) : null
  }))

  ctx.fillStyle = '#0D0D0D'; ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = '#D4AF37'; ctx.fillRect(0, 0, W, 5)
  ctx.fillStyle = '#131313'; ctx.fillRect(0, 5, W, HEADER - 5)

  ctx.font = '900 20px system-ui, sans-serif'
  ctx.fillStyle = '#D4AF37'
  ctx.fillText('EL REGRESO BEER CO.', PAD, 44)
  ctx.font = '400 11px system-ui, sans-serif'
  ctx.fillStyle = 'rgba(255,255,255,0.35)'
  ctx.fillText('Valdivia, Chile  ·  www.elregresobeer.com', PAD, 62)
  ctx.fillStyle = 'rgba(212,175,55,0.18)'; ctx.fillRect(PAD, 76, W - PAD * 2, 1)

  const fecha = new Date().toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })
  ;[
    { label: 'FECHA',    value: fecha },
    { label: 'CLIENTE',  value: clienteNombre },
    { label: 'VENDEDOR', value: vendedorNombre.split(' ')[0] },
  ].forEach((col, ci) => {
    const x = PAD + ci * 186
    ctx.font = '700 9px system-ui, sans-serif'
    ctx.fillStyle = 'rgba(255,255,255,0.38)'
    ctx.fillText(col.label, x, 100)
    ctx.font = '700 13px system-ui, sans-serif'
    ctx.fillStyle = '#F4EEDF'
    ctx.fillText(col.value.slice(0, 22), x, 120)
  })
  ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fillRect(0, HEADER - 1, W, 1)

  items.forEach((item, idx) => {
    const y = HEADER + idx * ROW
    ctx.fillStyle = idx % 2 === 0 ? '#0F0F0F' : '#111111'
    ctx.fillRect(0, y, W, ROW)

    const IMG = 48, imgX = PAD, imgY = y + (ROW - IMG) / 2
    ctx.save()
    ctx.beginPath()
    // roundRect no existe en WebViews antiguos (iOS < 16): se cae a esquinas
    // rectas en vez de romper la generación completa de la imagen.
    if (typeof ctx.roundRect === 'function') ctx.roundRect(imgX, imgY, IMG, IMG, 8)
    else ctx.rect(imgX, imgY, IMG, IMG)
    ctx.clip()
    if (imgs[item.producto]) ctx.drawImage(imgs[item.producto]!, imgX, imgY, IMG, IMG)
    else { ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fillRect(imgX, imgY, IMG, IMG) }
    ctx.restore()

    ctx.font = '700 14px system-ui, sans-serif'
    ctx.fillStyle = '#F4EEDF'
    ctx.fillText(item.producto.slice(0, 34), PAD + IMG + 12, y + 28)
    ctx.font = '400 11px system-ui, sans-serif'
    ctx.fillStyle = 'rgba(255,255,255,0.38)'
    ctx.fillText(`${item.cantidad} ud. × ${fmtPrecioCLP(item.precio)}`, PAD + IMG + 12, y + 48)

    ctx.font = '800 16px system-ui, sans-serif'
    ctx.fillStyle = '#D4AF37'
    ctx.textAlign = 'right'
    ctx.fillText(fmtPrecioCLP(item.cantidad * item.precio), W - PAD, y + ROW / 2 + 6)
    ctx.textAlign = 'left'
    ctx.fillStyle = 'rgba(255,255,255,0.04)'; ctx.fillRect(0, y + ROW - 1, W, 1)
  })

  const yT = HEADER + items.length * ROW
  ctx.fillStyle = '#161616'; ctx.fillRect(0, yT, W, TOTAL_ROW)
  ctx.fillStyle = 'rgba(212,175,55,0.2)'; ctx.fillRect(0, yT, W, 1)
  ctx.font = '700 10px system-ui, sans-serif'
  ctx.fillStyle = 'rgba(255,255,255,0.4)'
  ctx.fillText('TOTAL PEDIDO', PAD, yT + 38)
  ctx.font = '900 22px system-ui, sans-serif'
  ctx.fillStyle = '#F4EEDF'
  ctx.textAlign = 'right'
  ctx.fillText(fmtPrecioCLP(items.reduce((s, i) => s + i.cantidad * i.precio, 0)), W - PAD, yT + 42)
  ctx.textAlign = 'left'

  const yF = yT + TOTAL_ROW
  ctx.fillStyle = '#0A0A0A'; ctx.fillRect(0, yF, W, FOOTER)
  ctx.fillStyle = '#D4AF37'; ctx.fillRect(0, yF, W, 3)
  ctx.font = '400 11px system-ui, sans-serif'
  ctx.fillStyle = 'rgba(255,255,255,0.28)'
  ctx.textAlign = 'center'
  ctx.fillText('El Regreso Beer Co. · Valdivia, Chile · www.elregresobeer.com', W / 2, yF + 34)
  ctx.textAlign = 'left'

  return new Promise(resolve => canvas.toBlob(b => resolve(b!), 'image/png'))
}

async function compartirImagen(blob: Blob) {
  const file = new File([blob], 'pedido-el-regreso.png', { type: 'image/png' })
  if (typeof navigator !== 'undefined' && navigator.share && navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: 'Pedido El Regreso Beer' })
  } else {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'pedido-el-regreso.png'; a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}

export function VentaImageModal({ items, clienteNombre, vendedorNombre, onClose }: {
  items: ItemCarrito[]; clienteNombre: string; vendedorNombre: string; onClose: () => void
}) {
  const [estado, setEstado] = useState<'generando' | 'listo' | 'error'>('generando')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const blobRef = useRef<Blob | null>(null)

  useEffect(() => {
    let vivo = true
    generarImagenVenta(items, clienteNombre, vendedorNombre)
      .then(blob => {
        if (!vivo) return
        blobRef.current = blob
        setPreviewUrl(URL.createObjectURL(blob))
        setEstado('listo')
      })
      .catch(() => { if (vivo) setEstado('error') })
    return () => { vivo = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.55)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 400 }}
    >
      <div style={{ background: C.bg, borderRadius: '20px 20px 0 0', padding: '20px 16px 32px', width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto' }}>
        <p style={{ fontSize: 16, fontWeight: 800, color: C.text, marginBottom: 2 }}>Imagen del pedido</p>
        <p style={{ fontSize: 12, color: C.muted, marginBottom: 14 }}>Lista para enviar al cliente</p>

        <div style={{ borderRadius: 12, overflow: 'hidden', marginBottom: 14, background: C.card, border: `1px solid ${C.line}`, minHeight: 120, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {estado === 'generando' && (
            <div style={{ textAlign: 'center', padding: 28 }}>
              <Loader2 size={26} color={C.faint} style={{ animation: 'spin 0.8s linear infinite' }} />
              <p style={{ fontSize: 13, color: C.muted, marginTop: 8 }}>Generando…</p>
            </div>
          )}
          {estado === 'error' && <p style={{ fontSize: 13, color: C.red, padding: 28 }}>No se pudo generar la imagen</p>}
          {estado === 'listo' && previewUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl} alt="Pedido" style={{ width: '100%', display: 'block' }} />
          )}
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{
            flex: 1, minHeight: 50, borderRadius: 12, border: `1px solid ${C.line}`,
            background: C.card, color: C.muted, fontSize: 14, fontWeight: 700, cursor: 'pointer',
          }}>
            Cerrar
          </button>
          <button
            onClick={async () => { if (blobRef.current) await compartirImagen(blobRef.current); onClose() }}
            disabled={estado !== 'listo'}
            style={{
              flex: 2, minHeight: 50, borderRadius: 12, border: 'none',
              background: estado === 'listo' ? WA : '#D1FAE5', color: estado === 'listo' ? '#fff' : '#6EE7B7',
              fontSize: 14, fontWeight: 800, cursor: estado === 'listo' ? 'pointer' : 'not-allowed',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            <MessageCircle size={16} /> Compartir
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Aviso de deuda del cliente ─────────────────────────────────────────────

interface Factura {
  numero: string; fecha_emision: string; fecha_vencimiento: string
  dias_atraso: number; monto: number; productos?: string
}
interface SaldoCliente { monto_deuda: number; dias_credito: number; facturas_vencidas: Factura[] }

/**
 * Aviso compacto de deuda. Antes vivía en una pantalla intermedia propia
 * ("Vista 360°"); ahora va arriba de la venta, que es donde el vendedor
 * necesita el dato — justo cuando está por tomar el pedido.
 */
export function AvisoDeuda({ clienteNombre }: { clienteNombre: string }) {
  const [saldo, setSaldo] = useState<SaldoCliente | null>(null)
  const [cargando, setCargando] = useState(true)
  const [abierto, setAbierto] = useState(false)

  useEffect(() => {
    let vivo = true
    const supabase = createClient()
    supabase
      .from('saldos_clientes')
      .select('monto_deuda, dias_credito, facturas_vencidas')
      .eq('nombre_fantasia', clienteNombre)
      .maybeSingle()
      .then(({ data }) => {
        if (!vivo) return
        if (data && data.monto_deuda > 0) setSaldo(data as SaldoCliente)
        setCargando(false)
      })
    return () => { vivo = false }
  }, [clienteNombre])

  // Sin deuda no se muestra nada: un "cliente al día" en verde ocupaba
  // espacio en cada visita sin cambiar ninguna decisión del vendedor.
  if (cargando || !saldo) return null

  return (
    <div style={{ marginBottom: 12 }}>
      <button
        onClick={() => setAbierto(a => !a)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 11, cursor: 'pointer',
          padding: '12px 14px', textAlign: 'left', font: 'inherit',
          background: C.redSoft, border: `1px solid #FECACA`,
          borderRadius: abierto ? '12px 12px 0 0' : 12,
        }}
      >
        <AlertTriangle size={18} color={C.red} style={{ flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: C.red }}>
            Deuda pendiente · {saldo.dias_credito} días de crédito
          </p>
          <p style={{ fontSize: 18, fontWeight: 800, color: C.red, letterSpacing: '-0.4px' }}>
            {fmtPrecioCLP(saldo.monto_deuda)}
          </p>
        </div>
        <ChevronDown size={16} color={C.red} style={{ flexShrink: 0, transform: abierto ? 'rotate(180deg)' : undefined, transition: 'transform .15s' }} />
      </button>

      {abierto && (
        <div style={{ background: C.card, border: '1px solid #FECACA', borderTop: 'none', borderRadius: '0 0 12px 12px', padding: '10px 14px' }}>
          {saldo.facturas_vencidas.length === 0 ? (
            <p style={{ fontSize: 12, color: C.muted, textAlign: 'center', padding: '8px 0' }}>Sin detalle de facturas</p>
          ) : saldo.facturas_vencidas.map((f, i) => (
            <div key={i} style={{ padding: '8px 0', borderBottom: i < saldo.facturas_vencidas.length - 1 ? `1px solid ${C.line}` : 'none' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Doc #{f.numero}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: C.red, whiteSpace: 'nowrap' }}>{f.dias_atraso}d atraso</span>
              </div>
              <p style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>Vence {f.fecha_vencimiento}</p>
              <p style={{ fontSize: 13, fontWeight: 700, color: C.text, marginTop: 2 }}>{fmtPrecioCLP(f.monto)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

