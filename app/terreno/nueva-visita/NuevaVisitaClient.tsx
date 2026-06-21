'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { notificar } from '@/lib/notificar'
import { upsertOrQueue } from '@/lib/offlineQueue'
import { useRouter } from 'next/navigation'
import {
  MapPin, Camera, CheckCircle, XCircle, ChevronLeft, ChevronDown,
  Search, Plus, ShoppingCart, Minus, Package, AlertTriangle, MessageCircle, Share2,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { AppUser } from '@/lib/auth'

const T = '#D4AF37'
const T_DIM = 'rgba(212,175,55,0.12)'
const T_BORDER = 'rgba(212,175,55,0.25)'
const C = '#D4AF37'
const C_DIM = 'rgba(212,175,55,0.12)'
const C_BORDER = 'rgba(212,175,55,0.28)'
const WA = '#25D366'

// ─── Types ────────────────────────────────────────────────────

interface ClienteExistente {
  nombre_fantasia: string
  categoria_negocio: string | null
  localidad: string | null
}

interface Producto {
  producto: string
  categoria_producto: string | null
  envase: string | null
}

interface FotoSlot { label: string; key: 'exterior' | 'exhibicion' | 'competencia'; emoji: string }
const FOTO_SLOTS: FotoSlot[] = [
  { label: 'Exterior',   key: 'exterior',   emoji: '🏪' },
  { label: 'Exhibición', key: 'exhibicion', emoji: '🍺' },
  { label: 'Competencia',key: 'competencia',emoji: '🔍' },
]

// ─── Imágenes de producto ─────────────────────────────────────

const PRODUCTO_IMAGENES: Record<string, string> = {
  'Kombucha Berry Menta':        '/productos/kombucha/berry-menta.webp',
  'Kombucha Detox':              '/productos/kombucha/detox.webp',
  'Kombucha Lemon':              '/productos/kombucha/lemon-fresh.webp',
  'Kombucha Mango':              '/productos/kombucha/mango-merken.webp',
  'Kombucha Maqui':              '/productos/kombucha/maqui-hops.webp',
  'Kombucha Maracuyá Cardamomo': '/productos/kombucha/maracuya-cardamomo.webp',
  'Kombucha Natural':            '/productos/kombucha/natural.webp',
  'Arboretum':                   '/productos/cerveza/arboretum.webp',
  'Mocho English':               '/productos/cerveza/mocho.webp',
  'La Barra APA':                '/productos/cerveza/la-barra.webp',
  'Fisura':                      '/productos/cerveza/fisura.webp',
  'Descenso West Coast IPA':     '/productos/cerveza/descenso.webp',
  'Aguas Blancas':               '/productos/cerveza/aguas-blancas.webp',
}

function ProductoThumb({ nombre, categoria, size = 44 }: { nombre: string; categoria: string; size?: number }) {
  const src = PRODUCTO_IMAGENES[nombre]
  const [imgOk, setImgOk] = useState(!!src)
  const esKombucha = (categoria ?? '').toLowerCase().includes('kombucha')
  const emoji = esKombucha ? '🫧' : '🍺'

  if (src && imgOk) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src} alt={nombre} width={size} height={size}
        onError={() => setImgOk(false)}
        style={{ width: size, height: size, borderRadius: 10, objectFit: 'contain', background: 'rgba(255,255,255,0.03)', flexShrink: 0 }}
      />
    )
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: 10, flexShrink: 0,
      background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.5,
    }}>
      {emoji}
    </div>
  )
}

// ─── Catálogo estático ────────────────────────────────────────

interface CatalogoInfo {
  estilo: string
  precio_lata: number
  precio_barril: number
  descripcion: string
  abv?: string
  ibu?: string
  dulzor?: string
  acidez?: string
  envase_ml: number
}

const CATALOGO_INFO: Record<string, CatalogoInfo> = {
  'Nitro Coffee':                { estilo: 'Nitro Cold Brew',           precio_lata: 0,    precio_barril: 120000, envase_ml: 470, descripcion: 'Cold brew de café con nitrógeno. Cremoso, suave y con notas a chocolate y avellana.' },
  'Arboretum':                   { estilo: 'Kölsch',                   precio_lata: 2100, precio_barril: 83000,  envase_ml: 470, descripcion: 'Color amarillo pajizo, aromas a grano y pan con notas florales. Super ligera y fácil de beber.' },
  'Mocho English':               { estilo: 'English Red Ale',          precio_lata: 2100, precio_barril: 83000,  envase_ml: 470, abv: '5.5%', ibu: '25', descripcion: 'Rojizo brillante con aromas a galleta, almendras y caramelo. Retrogusto semi dulce y tostado.' },
  'La Barra APA':                { estilo: 'American Pale Ale',        precio_lata: 2250, precio_barril: 90000,  envase_ml: 470, descripcion: 'Dorado intenso y cítrico con lúpulos Citra y Cascade. Amargor medio y final seco.' },
  'Fisura':                      { estilo: 'Robust Porter',            precio_lata: 2250, precio_barril: 90000,  envase_ml: 470, descripcion: 'Negro intenso, notas a chocolate amargo, cacao y café. Cuerpo medio-alto con avena.' },
  'Descenso West Coast IPA':     { estilo: 'West Coast IPA',           precio_lata: 2750, precio_barril: 110000, envase_ml: 470, abv: '6.5%', descripcion: 'Aromas resinosos a pino, mentol y pomelo. Sabor intenso con amargor potente.' },
  'Aguas Blancas':               { estilo: 'Hazy IPA',                 precio_lata: 3000, precio_barril: 125000, envase_ml: 470, abv: '5.5%', ibu: '25', descripcion: 'Turbia y tropical con Centennial, Mosaic y Citra. Notas a durazno, mango y maracuyá.' },
  'Kombucha Berry Menta':        { estilo: 'Kombucha · Té Negro',      precio_lata: 1500, precio_barril: 75000,  envase_ml: 355, dulzor: 'Medio', acidez: 'Media',      descripcion: 'Frambuesa y menta fresca. Equilibrio perfecto entre dulzor y acidez.' },
  'Kombucha Lemon':              { estilo: 'Kombucha · Té Verde',      precio_lata: 1500, precio_barril: 75000,  envase_ml: 355, dulzor: 'Medio', acidez: 'Media-alta', descripcion: 'Limón, jengibre y cilantro. Cítrica, especiada y muy refrescante.' },
  'Kombucha Maqui':              { estilo: 'Kombucha · Té Verde+Negro',precio_lata: 1500, precio_barril: 75000,  envase_ml: 355, dulzor: 'Medio', acidez: 'Media',      descripcion: 'Maqui, mora y lúpulos nobles. Frutal y terroso con toque herbal. Color púrpura.' },
  'Kombucha Maracuyá Cardamomo': { estilo: 'Kombucha · Té Verde',      precio_lata: 1500, precio_barril: 75000,  envase_ml: 355, dulzor: 'Alto',  acidez: 'Baja',       descripcion: 'Maracuyá tropical con cardamomo verde. Dulce, aromático y floral.' },
  'Kombucha Detox':              { estilo: 'Kombucha · Té Verde',      precio_lata: 1500, precio_barril: 75000,  envase_ml: 355, dulzor: 'Bajo',  acidez: 'Media-alta', descripcion: 'Arándano, manzanilla e hinojo. Fresco, limpio y con propiedades diuréticas.' },
  'Kombucha Natural':            { estilo: 'Kombucha · Té Verde',      precio_lata: 1500, precio_barril: 75000,  envase_ml: 355, dulzor: 'Bajo',  acidez: 'Media-alta', descripcion: 'Esencia pura de fermentación. Notas a pera y florales. Para puristas.' },
  'Kombucha Mango':              { estilo: 'Kombucha',                  precio_lata: 1500, precio_barril: 75000,  envase_ml: 355, descripcion: 'Kombucha de mango con toque de merkén. Dulce y tropical.' },
}

function fmtPrecioCLP(n: number) {
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)
}

// ─── WhatsApp helpers ─────────────────────────────────────────

function generarMensajeCatalogo(): string {
  const cervezas = Object.entries(CATALOGO_INFO).filter(([, i]) => !i.estilo.toLowerCase().includes('kombucha'))
  const kombuchas = Object.entries(CATALOGO_INFO).filter(([, i]) => i.estilo.toLowerCase().includes('kombucha'))

  let m = '🍺 *CATÁLOGO EL REGRESO BEER CO*\n_www.elregresobeer.com_\n\n'
  m += '*━━━ CERVEZAS ━━━*\n\n'
  for (const [nombre, info] of cervezas) {
    m += `🍺 *${nombre}* — ${info.estilo}\n`
    m += `$${info.precio_lata.toLocaleString('es-CL')} la lata · Caja 24: $${(info.precio_lata * 24).toLocaleString('es-CL')}\n\n`
  }
  m += '*━━━ KOMBUCHA LA IDA ━━━*\n\n'
  for (const [nombre, info] of kombuchas) {
    m += `🫧 *${nombre}*\n`
    m += `$${info.precio_lata.toLocaleString('es-CL')} la lata · Caja 24: $${(info.precio_lata * 24).toLocaleString('es-CL')}\n\n`
  }
  m += '📦 _Pedido mínimo: 1 caja de 24 latas (puede ser mixta)_\n'
  m += '💰 _Descuento +3 cajas: $100/lata cerveza · $50/lata kombucha_\n'
  m += '💳 _Pago: Transferencia o tarjeta vía Flow_'
  return m
}

function generarMensajePedido(items: ItemCarrito[], clienteNombre: string, vendedorNombre: string): string {
  const fecha = new Date().toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })
  const total = items.reduce((s, i) => s + i.precio * i.cantidad, 0)
  let m = `🍺 *COTIZACIÓN EL REGRESO BEER*\n_${fecha}_\n\n`
  m += `*Cliente:* ${clienteNombre}\n`
  m += `*Vendedor:* ${vendedorNombre}\n\n`
  m += '*Detalle del pedido:*\n'
  for (const item of items) {
    m += `• ${item.producto} ×${item.cantidad}`
    if (item.precio > 0) m += ` = $${(item.precio * item.cantidad).toLocaleString('es-CL')}`
    m += '\n'
  }
  if (total > 0) m += `\n*Total: $${total.toLocaleString('es-CL')}*\n`
  m += '\n_Precios brutos sin IVA · Sujeto a disponibilidad_'
  return m
}

function abrirWhatsApp(phone: string, mensaje: string) {
  const num = phone.replace(/[\s\-\(\)]/g, '').replace(/^\+?56/, '56').replace(/^(?!56)/, '56')
  const url = `https://wa.me/${num}?text=${encodeURIComponent(mensaje)}`
  window.open(url, '_blank')
}

// ─── Modal WhatsApp ───────────────────────────────────────────

interface WhatsAppModalProps {
  tipo: 'catalogo'
  clienteNombre: string
  vendedorNombre: string
  onClose: () => void
}

function WhatsAppModal({ onClose }: WhatsAppModalProps) {
  const [phone, setPhone] = useState('')

  function enviar() {
    const t = phone.trim()
    if (!t) return
    abrirWhatsApp(t, generarMensajeCatalogo())
    onClose()
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 300 }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: '#1C1C1C', borderRadius: '20px 20px 0 0', padding: '24px 20px 32px', width: '100%', maxWidth: 480 }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(37,211,102,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <MessageCircle size={20} color={WA} />
          </div>
          <div>
            <p style={{ fontSize: 16, fontWeight: 800, color: '#F4EEDF' }}>Enviar Catálogo</p>
            <p style={{ fontSize: 11, color: 'var(--muted)' }}>vía WhatsApp</p>
          </div>
        </div>
        <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 20, paddingLeft: 52 }}>
          Se enviará el catálogo completo con todos los productos y precios.
        </p>

        <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.8px', display: 'block', marginBottom: 6 }}>
          Número de WhatsApp del cliente
        </label>
        <input
          value={phone} onChange={e => setPhone(e.target.value)}
          placeholder="+56 9 12345678"
          type="tel"
          autoFocus
          style={{
            width: '100%', padding: '14px', borderRadius: 12,
            background: '#131313', border: '1px solid rgba(255,255,255,0.1)',
            color: '#F4EEDF', fontSize: 16, outline: 'none', marginBottom: 16,
          }}
        />
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{
            flex: 1, padding: '14px', borderRadius: 12,
            border: '1px solid rgba(255,255,255,0.08)', background: 'transparent',
            color: 'var(--muted)', fontSize: 14, fontWeight: 600, cursor: 'pointer',
          }}>Cancelar</button>
          <button onClick={enviar} disabled={!phone.trim()} style={{
            flex: 2, padding: '14px', borderRadius: 12, border: 'none',
            background: phone.trim() ? WA : 'rgba(37,211,102,0.12)',
            color: phone.trim() ? '#fff' : 'rgba(37,211,102,0.35)',
            fontSize: 14, fontWeight: 800, cursor: phone.trim() ? 'pointer' : 'not-allowed',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}>
            <MessageCircle size={16} />
            Abrir WhatsApp
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Imagen de venta (Canvas) ────────────────────────────────

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const i = new Image()
    i.onload = () => res(i)
    i.onerror = rej
    i.src = src
  })
}

async function generarImagenVenta(
  items: ItemCarrito[],
  clienteNombre: string,
  vendedorNombre: string,
): Promise<Blob> {
  const W = 600; const PAD = 28; const ROW = 76
  const HEADER = 172; const TOTAL_ROW = 62; const FOOTER = 56
  const H = HEADER + items.length * ROW + TOTAL_ROW + FOOTER
  const DPR = 2
  const canvas = document.createElement('canvas')
  canvas.width = W * DPR; canvas.height = H * DPR
  const ctx = canvas.getContext('2d')!
  ctx.scale(DPR, DPR)

  // pre-cargar imágenes de productos
  const imgs: Record<string, HTMLImageElement | null> = {}
  await Promise.all(items.map(async it => {
    const src = PRODUCTO_IMAGENES[it.producto]
    imgs[it.producto] = src ? await loadImg(src).catch(() => null) : null
  }))

  // fondo general
  ctx.fillStyle = '#0D0D0D'; ctx.fillRect(0, 0, W, H)

  // barra dorada superior
  ctx.fillStyle = '#D4AF37'; ctx.fillRect(0, 0, W, 5)

  // zona header
  ctx.fillStyle = '#131313'; ctx.fillRect(0, 5, W, HEADER - 5)

  // logo / marca
  ctx.font = `900 20px system-ui, sans-serif`
  ctx.fillStyle = '#D4AF37'
  ctx.fillText('EL REGRESO BEER CO.', PAD, 44)
  ctx.font = `400 11px system-ui, sans-serif`
  ctx.fillStyle = 'rgba(255,255,255,0.35)'
  ctx.fillText('Valdivia, Chile  ·  www.elregresobeer.com', PAD, 62)

  // línea separadora interna
  ctx.fillStyle = 'rgba(212,175,55,0.18)'; ctx.fillRect(PAD, 76, W - PAD * 2, 1)

  // datos cliente / fecha
  const fecha = new Date().toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })
  const cols = [
    { label: 'FECHA',    value: fecha },
    { label: 'CLIENTE',  value: clienteNombre },
    { label: 'VENDEDOR', value: vendedorNombre.split(' ')[0] },
  ]
  cols.forEach((col, ci) => {
    const x = PAD + ci * 186
    ctx.font = '700 9px system-ui, sans-serif'
    ctx.fillStyle = 'rgba(255,255,255,0.38)'
    ctx.fillText(col.label, x, 100)
    ctx.font = '700 13px system-ui, sans-serif'
    ctx.fillStyle = '#F4EEDF'
    ctx.fillText(col.value.slice(0, 22), x, 120)
  })

  // línea de cierre de header
  ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fillRect(0, HEADER - 1, W, 1)

  // filas de productos
  items.forEach((item, idx) => {
    const y = HEADER + idx * ROW
    ctx.fillStyle = idx % 2 === 0 ? '#0F0F0F' : '#111111'
    ctx.fillRect(0, y, W, ROW)

    // foto producto
    const IMG = 48; const imgX = PAD; const imgY = y + (ROW - IMG) / 2
    if (imgs[item.producto]) {
      ctx.save()
      ctx.beginPath()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(ctx as any).roundRect?.(imgX, imgY, IMG, IMG, 8) ?? ctx.rect(imgX, imgY, IMG, IMG)
      ctx.clip()
      ctx.drawImage(imgs[item.producto]!, imgX, imgY, IMG, IMG)
      ctx.restore()
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.06)'
      ctx.beginPath()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(ctx as any).roundRect?.(imgX, imgY, IMG, IMG, 8) ?? ctx.rect(imgX, imgY, IMG, IMG)
      ctx.fill()
    }

    // nombre
    ctx.font = '700 14px system-ui, sans-serif'
    ctx.fillStyle = '#F4EEDF'
    ctx.fillText(item.producto.slice(0, 34), PAD + IMG + 12, y + 28)
    // detalle
    ctx.font = '400 11px system-ui, sans-serif'
    ctx.fillStyle = 'rgba(255,255,255,0.38)'
    ctx.fillText(`${item.cantidad} ud. × ${fmtPrecioCLP(item.precio)}`, PAD + IMG + 12, y + 48)

    // subtotal (derecha)
    const sub = fmtPrecioCLP(item.cantidad * item.precio)
    ctx.font = '800 16px system-ui, sans-serif'
    ctx.fillStyle = '#D4AF37'
    ctx.textAlign = 'right'
    ctx.fillText(sub, W - PAD, y + ROW / 2 + 6)
    ctx.textAlign = 'left'

    ctx.fillStyle = 'rgba(255,255,255,0.04)'; ctx.fillRect(0, y + ROW - 1, W, 1)
  })

  // fila total
  const yT = HEADER + items.length * ROW
  ctx.fillStyle = '#161616'; ctx.fillRect(0, yT, W, TOTAL_ROW)
  ctx.fillStyle = 'rgba(212,175,55,0.2)'; ctx.fillRect(0, yT, W, 1)
  ctx.font = '700 10px system-ui, sans-serif'
  ctx.fillStyle = 'rgba(255,255,255,0.4)'
  ctx.fillText('TOTAL PEDIDO', PAD, yT + 38)
  const total = items.reduce((s, i) => s + i.cantidad * i.precio, 0)
  ctx.font = '900 22px system-ui, sans-serif'
  ctx.fillStyle = '#F4EEDF'
  ctx.textAlign = 'right'
  ctx.fillText(fmtPrecioCLP(total), W - PAD, yT + 42)
  ctx.textAlign = 'left'

  // footer
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

// ─── Modal imagen de venta ────────────────────────────────────

function VentaImageModal({ items, clienteNombre, vendedorNombre, onClose }: {
  items: ItemCarrito[]; clienteNombre: string; vendedorNombre: string; onClose: () => void
}) {
  const [estado, setEstado] = useState<'generando' | 'listo' | 'error'>('generando')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const blobRef = useRef<Blob | null>(null)

  useEffect(() => {
    generarImagenVenta(items, clienteNombre, vendedorNombre)
      .then(blob => {
        blobRef.current = blob
        setPreviewUrl(URL.createObjectURL(blob))
        setEstado('listo')
      })
      .catch(() => setEstado('error'))
    return () => { if (previewUrl) URL.revokeObjectURL(previewUrl) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function compartir() {
    if (blobRef.current) await compartirImagen(blobRef.current)
    onClose()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 300 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#1C1C1C', borderRadius: '20px 20px 0 0', padding: '20px 20px 32px', width: '100%', maxWidth: 520 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: T_DIM, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <MessageCircle size={20} color={T} />
          </div>
          <div>
            <p style={{ fontSize: 16, fontWeight: 800, color: '#F4EEDF' }}>Imagen del pedido</p>
            <p style={{ fontSize: 11, color: 'var(--muted)' }}>Lista para compartir por WhatsApp</p>
          </div>
        </div>

        {/* Preview */}
        <div style={{ borderRadius: 12, overflow: 'hidden', marginBottom: 16, background: '#0D0D0D', minHeight: 120, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {estado === 'generando' && (
            <div style={{ textAlign: 'center', padding: 24 }}>
              <div style={{ width: 32, height: 32, border: `3px solid ${T_BORDER}`, borderTopColor: T, borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 10px' }} />
              <p style={{ fontSize: 13, color: 'var(--muted)' }}>Generando imagen…</p>
            </div>
          )}
          {estado === 'error' && <p style={{ fontSize: 13, color: '#B5543E', padding: 24 }}>Error al generar la imagen</p>}
          {estado === 'listo' && previewUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl} alt="Pedido" style={{ width: '100%', display: 'block' }} />
          )}
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '14px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)', background: 'transparent', color: 'var(--muted)', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
            Cancelar
          </button>
          <button onClick={compartir} disabled={estado !== 'listo'} style={{
            flex: 2, padding: '14px', borderRadius: 12, border: 'none',
            background: estado === 'listo' ? WA : 'rgba(37,211,102,0.12)',
            color: estado === 'listo' ? '#fff' : 'rgba(37,211,102,0.35)',
            fontSize: 14, fontWeight: 800, cursor: estado === 'listo' ? 'pointer' : 'not-allowed',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}>
            <MessageCircle size={16} />
            Compartir imagen
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Sección Deuda/Crédito ────────────────────────────────────

interface Factura {
  numero: string
  fecha_emision: string
  fecha_vencimiento: string
  dias_atraso: number
  monto: number
  productos?: string
}

interface SaldoCliente {
  monto_deuda: number
  dias_credito: number
  facturas_vencidas: Factura[]
}

function DeudaSection({ clienteNombre }: { clienteNombre: string }) {
  const [saldo, setSaldo] = useState<SaldoCliente | null>(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('saldos_clientes')
      .select('monto_deuda, dias_credito, facturas_vencidas')
      .eq('nombre_fantasia', clienteNombre)
      .maybeSingle()
      .then(({ data }) => {
        if (data && data.monto_deuda > 0) setSaldo(data as SaldoCliente)
        setLoading(false)
      })
  }, [clienteNombre])

  if (loading) return <div style={{ height: 44, marginBottom: 16 }} />

  // Sin deuda
  if (!saldo) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px',
        borderRadius: 12, marginBottom: 16,
        background: 'rgba(90,138,74,0.06)', border: '1px solid rgba(90,138,74,0.2)',
      }}>
        <CheckCircle size={16} color="#5A8A4A" />
        <p style={{ fontSize: 13, color: '#5A8A4A', fontWeight: 600 }}>Cliente al día — sin deuda pendiente</p>
      </div>
    )
  }

  // Con deuda
  return (
    <div style={{ marginBottom: 16 }}>
      <div
        onClick={() => setExpanded(e => !e)}
        style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', cursor: 'pointer',
          background: 'rgba(181,84,62,0.08)', border: '1px solid rgba(181,84,62,0.3)',
          borderRadius: expanded ? '12px 12px 0 0' : 12,
        }}
      >
        <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(181,84,62,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <AlertTriangle size={18} color="#B5543E" />
        </div>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: '#B5543E', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 2 }}>
            Saldo pendiente · {saldo.dias_credito} días de crédito
          </p>
          <p style={{ fontSize: 20, fontWeight: 900, color: '#F4EEDF', letterSpacing: '-0.5px' }}>
            {fmtPrecioCLP(saldo.monto_deuda)}
          </p>
        </div>
        <ChevronDown size={16} color="#B5543E" style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }} />
      </div>

      {expanded && (
        <div style={{ background: 'rgba(181,84,62,0.04)', border: '1px solid rgba(181,84,62,0.2)', borderTop: 'none', borderRadius: '0 0 12px 12px', padding: '12px 16px' }}>
          {saldo.facturas_vencidas.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', padding: '12px 0' }}>
              Sin detalle de facturas disponible
            </p>
          ) : saldo.facturas_vencidas.map((f, i) => (
            <div key={i} style={{ padding: '10px 12px', borderRadius: 10, marginBottom: 6, background: 'rgba(0,0,0,0.25)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#F4EEDF' }}>Doc #{f.numero}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#B5543E', background: 'rgba(181,84,62,0.12)', padding: '2px 8px', borderRadius: 6 }}>
                  {f.dias_atraso}d atraso
                </span>
              </div>
              <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>
                Emisión: {f.fecha_emision} · Vence: {f.fecha_vencimiento}
              </p>
              {f.productos && <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginBottom: 4 }}>{f.productos}</p>}
              <p style={{ fontSize: 13, fontWeight: 800, color: '#F4EEDF' }}>{fmtPrecioCLP(f.monto)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Motivos sin venta ────────────────────────────────────────

const MOTIVOS_SIN_VENTA = [
  'Ya compró esta semana',
  'No había encargado',
  'Precio no convenció',
  'Sin stock del cliente',
  'Local cerrado',
  'Otro motivo',
]

interface ItemCarrito { producto: string; categoria: string; envase: string; cantidad: number; precio: number }

interface VisitaRetomada {
  id: string
  cliente_nombre: string
  es_cliente_nuevo: boolean
  lat: number | null
  lng: number | null
  direccion_gps: string | null
  estado?: string
}

interface DeudorInfo {
  nombre_fantasia: string
  saldo_total: number
  deuda_vencida: number
  ultimo_pago: string | null
  fecha_ultima_compra: string | null
  limite_cta_cte: number | null
}

interface Props {
  vendedor: AppUser
  clientesExistentes: ClienteExistente[]
  catalogoProductos: Producto[]
  visitaRetomada?: VisitaRetomada | null
  deudores?: DeudorInfo[]
  clientePre?: string | null
}

// ─── Selector de cantidad editable ───────────────────────────

function CantidadInput({
  value, onchange, accent, size = 'md',
}: {
  value: number
  onchange: (n: number) => void
  accent: string
  size?: 'sm' | 'md'
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const btnW = size === 'sm' ? 34 : 36
  const numW = size === 'sm' ? 30 : 34
  const fontSize = size === 'sm' ? 15 : 16
  const iconSize = size === 'sm' ? 14 : 15

  const confirm = useCallback((raw: string) => {
    const n = parseInt(raw, 10)
    if (!isNaN(n) && n >= 0) onchange(n)
    setEditing(false)
  }, [onchange])

  function startEdit() {
    setDraft(value > 0 ? String(value) : '')
    setEditing(true)
    setTimeout(() => { inputRef.current?.select() }, 0)
  }

  const accentDim = accent === T ? T_DIM : 'rgba(212,175,55,0.12)'
  const accentBorder = accent === T ? T_BORDER : 'rgba(212,175,55,0.25)'

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
      <button
        onClick={() => onchange(Math.max(0, value - 1))}
        style={{ width: btnW, height: btnW, borderRadius: 9, border: 'none', cursor: 'pointer', background: value > 0 ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.04)', color: '#F4EEDF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <Minus size={iconSize} />
      </button>

      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={e => setDraft(e.target.value.replace(/\D/g, ''))}
          onBlur={() => confirm(draft)}
          onKeyDown={e => {
            if (e.key === 'Enter') confirm(draft)
            if (e.key === 'Escape') setEditing(false)
          }}
          type="text"
          inputMode="numeric"
          style={{
            width: numW + 12, height: btnW, textAlign: 'center', fontSize, fontWeight: 900,
            background: accentDim, border: `1px solid ${accent}`, borderRadius: 9,
            color: accent, outline: 'none', margin: '0 4px',
          }}
        />
      ) : (
        <span
          onClick={startEdit}
          style={{ width: numW + 8, height: btnW, textAlign: 'center', fontSize, fontWeight: 900, color: value > 0 ? accent : 'var(--muted)', cursor: 'text', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 9, border: `1px dashed ${value > 0 ? accent : 'rgba(255,255,255,0.18)'}`, margin: '0 3px', flexShrink: 0 }}
          title="Toca para escribir cantidad"
        >
          {value}
        </span>
      )}

      <button
        onClick={() => onchange(value + 1)}
        style={{ width: btnW, height: btnW, borderRadius: 9, cursor: 'pointer', background: accentDim, border: `1px solid ${accentBorder}`, color: accent, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <Plus size={iconSize} />
      </button>
    </div>
  )
}

// ─── Step indicator ───────────────────────────────────────────

function StepBar({ paso, total }: { paso: number; total: number }) {
  const pct = Math.round((paso / total) * 100)
  return (
    <div style={{ padding: '0 20px' }}>
      <div style={{ height: 2, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${pct}%`, borderRadius: 2,
          background: 'linear-gradient(90deg, #B8962E 0%, #D4AF37 60%, #F0D060 100%)',
          boxShadow: '0 0 10px rgba(212,175,55,0.7)',
          transition: 'width 0.5s cubic-bezier(0.16,1,0.3,1)',
        }} />
      </div>
    </div>
  )
}

// ─── Paso 1: Selección de cliente ────────────────────────────

function Paso1Cliente({ clientes, deudores, onConfirmar }: {
  clientes: ClienteExistente[]
  deudores: DeudorInfo[]
  onConfirmar: (nombre: string, esNuevo: boolean, canal: string) => void
}) {
  const [tab, setTab] = useState<'existente' | 'nuevo'>('existente')
  const [query, setQuery] = useState('')
  const [seleccionado, setSeleccionado] = useState<ClienteExistente | null>(null)
  const [nombre, setNombre] = useState('')
  const [canal, setCanal] = useState('')
  const [direccion, setDireccion] = useState('')
  const [contacto, setContacto] = useState('')
  const [rut, setRut] = useState('')

  const filtrados = query.length > 1
    ? clientes.filter(c => c.nombre_fantasia.toLowerCase().includes(query.toLowerCase())).slice(0, 12)
    : clientes.slice(0, 8)

  const canalesNegocio = ['Bar', 'Minimarket', 'Cafetería', 'Botillería', 'Almacén', 'Restaurante', 'Supermercado', 'Distribuidor', 'Actividades Turísticas', 'Cliente Directo', 'Otros']

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ display: 'flex', margin: '16px 16px 0', borderRadius: 12, background: '#1C1C1C', padding: 4, gap: 4 }}>
        {(['existente', 'nuevo'] as const).map(t => (
          <button key={t} onClick={() => { setTab(t); setSeleccionado(null) }} style={{
            flex: 1, padding: '10px 0', borderRadius: 9, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700,
            background: tab === t ? T : 'transparent',
            color: tab === t ? '#080808' : 'var(--muted)',
            transition: 'all 0.15s',
          }}>
            {t === 'existente' ? '🔍 Cliente Existente' : '➕ Cliente Nuevo'}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 0' }}>
        {tab === 'existente' ? (
          <>
            <div style={{ position: 'relative', marginBottom: 12 }}>
              <Search size={16} color="var(--muted)" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }} />
              <input
                value={query} onChange={e => { setQuery(e.target.value); setSeleccionado(null) }}
                placeholder="Buscar cliente..."
                style={{ width: '100%', padding: '13px 14px 13px 40px', borderRadius: 12, background: '#1C1C1C', border: `1px solid ${seleccionado ? T_BORDER : 'rgba(255,255,255,0.08)'}`, color: '#F4EEDF', fontSize: 15, outline: 'none' }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {filtrados.map(c => (
                <div key={c.nombre_fantasia} onClick={() => setSeleccionado(c)} style={{
                  padding: '13px 14px', borderRadius: 12, cursor: 'pointer',
                  background: seleccionado?.nombre_fantasia === c.nombre_fantasia ? T_DIM : '#1C1C1C',
                  border: `1px solid ${seleccionado?.nombre_fantasia === c.nombre_fantasia ? T_BORDER : 'rgba(255,255,255,0.06)'}`,
                  display: 'flex', alignItems: 'center', gap: 10, transition: 'all 0.1s',
                }}>
                  <div style={{ width: 34, height: 34, borderRadius: 9, background: T_DIM, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span style={{ fontSize: 16 }}>🏪</span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 14, fontWeight: 700, color: '#F4EEDF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nombre_fantasia}</p>
                    <p style={{ fontSize: 11, color: 'var(--muted)' }}>{[c.categoria_negocio, c.localidad].filter(Boolean).join(' · ')}</p>
                  </div>
                  {seleccionado?.nombre_fantasia === c.nombre_fantasia && <CheckCircle size={18} color={T} />}
                </div>
              ))}
            </div>
          </>
        ) : (<>
          {/* Badge de deuda si hay cliente seleccionado */}
          {(() => {
            const d = seleccionado ? deudores.find(x => x.nombre_fantasia === seleccionado.nombre_fantasia) : null
            if (!d) return null
            const tieneDeuda = d.saldo_total > 0
            const color = d.deuda_vencida > 0 ? '#B5543E' : '#D4AF37'
            const rgb   = d.deuda_vencida > 0 ? '239,68,68' : '245,158,11'
            if (!tieneDeuda) return (
              <div style={{ margin: '8px 0 4px', padding: '10px 14px', background: 'rgba(90,138,74,0.07)', border: '1px solid rgba(90,138,74,0.2)', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                <CheckCircle size={14} color="#5A8A4A" />
                <span style={{ fontSize: 12, fontWeight: 700, color: '#5A8A4A' }}>Cliente al día — sin deuda pendiente</span>
              </div>
            )
            return (
              <div style={{ margin: '8px 0 4px', padding: '12px 14px', background: `rgba(${rgb},0.07)`, border: `1px solid rgba(${rgb},0.25)`, borderRadius: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 14 }}>{d.deuda_vencida > 0 ? '⚠️' : '💰'}</span>
                  <span style={{ fontSize: 12, fontWeight: 800, color, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    {d.deuda_vencida > 0 ? 'Deuda vencida' : 'Saldo pendiente'}
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div>
                    <p style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 2 }}>Saldo total</p>
                    <p style={{ fontSize: 16, fontWeight: 900, color, letterSpacing: '-0.5px' }}>
                      {new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(d.saldo_total)}
                    </p>
                  </div>
                  {d.deuda_vencida > 0 && (
                    <div>
                      <p style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 2 }}>Vencida</p>
                      <p style={{ fontSize: 16, fontWeight: 900, color: '#B5543E', letterSpacing: '-0.5px' }}>
                        {new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(d.deuda_vencida)}
                      </p>
                    </div>
                  )}
                  {d.ultimo_pago && (
                    <div style={{ gridColumn: '1 / -1' }}>
                      <p style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 2 }}>Último pago</p>
                      <p style={{ fontSize: 11, color: '#F4EEDF' }}>{new Date(d.ultimo_pago).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                    </div>
                  )}
                </div>
              </div>
            )
          })()}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              { label: 'Nombre de fantasía *', value: nombre, onChange: setNombre, placeholder: 'Ej: Bar El Cóndor' },
              { label: 'Dirección *',           value: direccion, onChange: setDireccion, placeholder: 'Calle, número' },
              { label: 'Contacto / Teléfono',  value: contacto, onChange: setContacto, placeholder: '+56 9 ...' },
              { label: 'RUT (opcional)',        value: rut, onChange: setRut, placeholder: '12.345.678-9' },
            ].map(f => (
              <div key={f.label}>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.5px', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>{f.label}</label>
                <input value={f.value} onChange={e => f.onChange(e.target.value)} placeholder={f.placeholder}
                  style={{ width: '100%', padding: '13px 14px', borderRadius: 12, background: '#1C1C1C', border: '1px solid rgba(255,255,255,0.08)', color: '#F4EEDF', fontSize: 15, outline: 'none' }} />
              </div>
            ))}
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.5px', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Canal de venta *</label>
              <select value={canal} onChange={e => setCanal(e.target.value)}
                style={{ width: '100%', padding: '13px 14px', borderRadius: 12, background: '#1C1C1C', border: '1px solid rgba(255,255,255,0.08)', color: canal ? '#F4EEDF' : 'var(--muted)', fontSize: 15, outline: 'none' }}>
                <option value="">Seleccionar canal...</option>
                {canalesNegocio.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
        </>)}
      </div>

      <div style={{ padding: '16px', paddingBottom: 'max(80px, calc(64px + env(safe-area-inset-bottom)))' }}>
        <button
          onClick={() => {
            if (tab === 'existente' && seleccionado) onConfirmar(seleccionado.nombre_fantasia, false, seleccionado.categoria_negocio ?? '')
            else if (tab === 'nuevo' && nombre && canal) onConfirmar(nombre, true, canal)
          }}
          disabled={tab === 'existente' ? !seleccionado : !nombre || !canal}
          style={{
            width: '100%', padding: '17px 0', borderRadius: 14, border: 'none', cursor: 'pointer',
            background: (tab === 'existente' ? !!seleccionado : !!nombre && !!canal) ? T : 'rgba(255,255,255,0.06)',
            color: (tab === 'existente' ? !!seleccionado : !!nombre && !!canal) ? '#080808' : 'var(--muted)',
            fontSize: 16, fontWeight: 900, letterSpacing: '-0.3px', transition: 'all 0.2s',
          }}
        >
          Confirmar cliente →
        </button>
      </div>
    </div>
  )
}

// ─── Paso 2: Check-in GPS + Fotos ────────────────────────────

function Paso2Checkin({ onConfirmar }: {
  onConfirmar: (coords: { lat: number; lng: number; addr: string }, fotos: Record<string, string>, fotosFiles: Record<string, File>) => void
}) {
  const [gps, setGps] = useState<{ lat: number; lng: number; addr: string } | null>(null)
  const [gpsError, setGpsError] = useState(false)
  const [fotos, setFotos] = useState<Record<string, string>>({})
  const [fotosFiles, setFotosFiles] = useState<Record<string, File>>({})
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({})

  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      pos => setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude, addr: `${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}` }),
      () => setGpsError(true),
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }, [])

  function handleFoto(key: string, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setFotos(prev => ({ ...prev, [key]: URL.createObjectURL(file) }))
    setFotosFiles(prev => ({ ...prev, [key]: file }))
  }

  const fotosListas = FOTO_SLOTS.filter(s => fotos[s.key]).length
  const listo = !!gps && fotosListas === 3

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
        {/* GPS */}
        <div style={{ background: '#1C1C1C', borderRadius: 14, padding: '14px 16px', marginBottom: 20, border: `1px solid ${gps ? T_BORDER : gpsError ? 'rgba(181,84,62,0.3)' : 'rgba(255,255,255,0.06)'}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0, background: gps ? T_DIM : gpsError ? 'rgba(181,84,62,0.1)' : 'rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <MapPin size={18} color={gps ? T : gpsError ? '#B5543E' : 'var(--muted)'} />
            </div>
            <div>
              <p style={{ fontSize: 12, fontWeight: 700, color: gps ? T : gpsError ? '#B5543E' : 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                {gps ? 'Ubicación capturada' : gpsError ? 'GPS no disponible' : 'Capturando ubicación…'}
              </p>
              {gps && <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{gps.addr}</p>}
              {!gps && !gpsError && (
                <div style={{ display: 'flex', gap: 3, marginTop: 4 }}>
                  {[0, 1, 2].map(i => (
                    <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: T, animation: `pulse-opacity 1.2s ${i * 0.2}s ease-in-out infinite` }} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Fotos */}
        <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 10 }}>
          Fotos requeridas ({fotosListas} / 3)
        </p>
        <div style={{ display: 'flex', gap: 10, marginBottom: 8 }}>
          {FOTO_SLOTS.map(slot => (
            <div key={slot.key} style={{ flex: 1 }}>
              <input ref={el => { fileRefs.current[slot.key] = el }} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={e => handleFoto(slot.key, e)} />
              <div onClick={() => fileRefs.current[slot.key]?.click()} style={{ height: 80, borderRadius: 12, overflow: 'hidden', cursor: 'pointer', background: fotos[slot.key] ? 'transparent' : '#1C1C1C', border: `2px solid ${fotos[slot.key] ? T : 'rgba(255,255,255,0.08)'}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                {fotos[slot.key] ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={fotos[slot.key]} alt={slot.label} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    <div style={{ position: 'absolute', bottom: 3, right: 3, width: 18, height: 18, background: T, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <CheckCircle size={11} color="#080808" />
                    </div>
                  </>
                ) : (
                  <>
                    <span style={{ fontSize: 22, marginBottom: 4 }}>{slot.emoji}</span>
                    <Camera size={14} color="var(--muted)" />
                  </>
                )}
              </div>
              <p style={{ fontSize: 10, textAlign: 'center', color: fotos[slot.key] ? T : 'var(--muted)', marginTop: 5, fontWeight: 600 }}>{slot.label}</p>
            </div>
          ))}
        </div>
        {!listo && <p style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', marginTop: 8 }}>{!gps ? 'Esperando GPS…' : `Falta${fotosListas < 3 ? ` ${3 - fotosListas} foto${3 - fotosListas > 1 ? 's' : ''}` : ''}`}</p>}
      </div>

      <div style={{ padding: '16px', paddingBottom: 'max(80px, calc(64px + env(safe-area-inset-bottom)))' }}>
        <button onClick={() => gps && onConfirmar(gps, fotos, fotosFiles)} disabled={!listo} style={{
          width: '100%', padding: '17px 0', borderRadius: 14, border: 'none', cursor: listo ? 'pointer' : 'not-allowed',
          background: listo ? T : 'rgba(255,255,255,0.06)', color: listo ? '#080808' : 'var(--muted)',
          fontSize: 16, fontWeight: 900, letterSpacing: '-0.3px', transition: 'all 0.2s',
        }}>
          {listo ? 'Iniciar visita →' : `GPS + ${3 - fotosListas} foto${3 - fotosListas !== 1 ? 's' : ''} pendiente${3 - fotosListas !== 1 ? 's' : ''}`}
        </button>
      </div>
    </div>
  )
}

// ─── Paso 3: Vista 360° del cliente ──────────────────────────

interface ClienteStats {
  totalPedidos: number
  totalLitros: number
  totalFacturado: number
  ultimaCompra: string | null
  sugeridos: { nombre: string; categoria: string; veces: number }[]
}

const EXCLUIR_SUGERIDOS = ['empaque', 'distribuci']

function Paso3Vista360({ clienteNombre, esNuevo, onContinuar }: {
  clienteNombre: string; esNuevo: boolean; onContinuar: (items: ItemCarrito[]) => void
}) {
  const [stats, setStats] = useState<ClienteStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [carritoSug, setCarritoSug] = useState<Map<string, ItemCarrito>>(new Map())

  function ajustarSug(nombre: string, categoria: string, delta: number) {
    setSugCant(nombre, categoria, (carritoSug.get(nombre)?.cantidad ?? 0) + delta)
  }

  function setSugCant(nombre: string, categoria: string, nueva: number) {
    setCarritoSug(prev => {
      const next = new Map(prev)
      if (nueva <= 0) { next.delete(nombre); return next }
      next.set(nombre, { producto: nombre, categoria, envase: 'Lata', cantidad: nueva, precio: CATALOGO_INFO[nombre]?.precio_lata ?? 0 })
      return next
    })
  }

  useEffect(() => {
    if (esNuevo) { onContinuar([]); return }
    const supabase = createClient()
    supabase
      .from('ventas')
      .select('producto, categoria_producto, total_sin_impuesto, litros, fecha_pedido')
      .eq('nombre_fantasia', clienteNombre)
      .order('fecha_pedido', { ascending: false })
      .then(({ data }) => {
        if (!data || data.length === 0) {
          setStats({ totalPedidos: 0, totalLitros: 0, totalFacturado: 0, ultimaCompra: null, sugeridos: [] })
          setLoading(false)
          return
        }
        const totalFacturado = data.reduce((s, r) => s + (r.total_sin_impuesto ?? 0), 0)
        const totalLitros    = data.reduce((s, r) => s + (r.litros ?? 0), 0)
        const ultimaCompra   = data[0].fecha_pedido ?? null
        const totalPedidos   = data.length
        const prodCount: Record<string, { count: number; categoria: string }> = {}
        for (const r of data) {
          if (!r.producto) continue
          const nl = r.producto.toLowerCase()
          if (EXCLUIR_SUGERIDOS.some(ex => nl.includes(ex))) continue
          if (!prodCount[r.producto]) prodCount[r.producto] = { count: 0, categoria: r.categoria_producto ?? '' }
          prodCount[r.producto].count++
        }
        const sugeridos = Object.entries(prodCount)
          .sort((a, b) => b[1].count - a[1].count)
          .slice(0, 3)
          .map(([nombre, v]) => ({ nombre, categoria: v.categoria, veces: v.count }))
        setStats({ totalPedidos, totalLitros, totalFacturado, ultimaCompra, sugeridos })
        setLoading(false)
      })
  }, [clienteNombre, esNuevo, onContinuar])

  if (esNuevo) return null

  const fmtFecha = (iso: string) => new Date(iso).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>

        {/* Sección deuda */}
        <DeudaSection clienteNombre={clienteNombre} />

        {/* Historial */}
        <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 10 }}>
          Historial de compras
        </p>

        {loading ? (
          <div style={{ background: '#131313', borderRadius: 14, padding: '16px', marginBottom: 20, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {[1, 2, 3, 4].map(i => <div key={i} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: '10px 12px', height: 52 }} />)}
          </div>
        ) : stats && stats.totalPedidos > 0 ? (
          <div style={{ borderRadius: 14, padding: '16px', background: T_DIM, border: `1px solid ${T_BORDER}`, marginBottom: 20 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {[
                { label: 'Última compra',  value: stats.ultimaCompra ? fmtFecha(stats.ultimaCompra) : '—' },
                { label: 'Total pedidos',  value: `${stats.totalPedidos}` },
                { label: 'Litros totales', value: `${stats.totalLitros.toLocaleString('es-CL')} L` },
                { label: 'Total facturado',value: fmtPrecioCLP(stats.totalFacturado) },
              ].map(d => (
                <div key={d.label} style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 10, padding: '10px 12px' }}>
                  <p style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 3 }}>{d.label}</p>
                  <p style={{ fontSize: 13, fontWeight: 800, color: '#F4EEDF' }}>{d.value}</p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ borderRadius: 14, padding: '16px', marginBottom: 20, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', textAlign: 'center' }}>
            <p style={{ fontSize: 13, color: 'var(--muted)' }}>Sin historial de compras registrado</p>
          </div>
        )}

        {/* Productos frecuentes — interactivo */}
        {!loading && stats && stats.sugeridos.length > 0 && (
          <>
            <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 10 }}>
              Compra recomendada
            </p>
            <div style={{ background: '#1C1C1C', border: `1px solid ${T_BORDER}`, borderRadius: 14, overflow: 'hidden', marginBottom: 16 }}>
              <div style={{ padding: '10px 14px 8px', borderBottom: '1px solid rgba(255,255,255,0.04)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <p style={{ fontSize: 12, color: T, fontWeight: 600 }}>Lo que más compra {clienteNombre.split(' ')[0]}</p>
                {carritoSug.size > 0 && (
                  <p style={{ fontSize: 11, fontWeight: 700, color: T }}>
                    {Array.from(carritoSug.values()).reduce((s, i) => s + i.cantidad, 0)} ud. · {fmtPrecioCLP(Array.from(carritoSug.values()).reduce((s, i) => s + i.precio * i.cantidad, 0))}
                  </p>
                )}
              </div>
              {stats.sugeridos.map((p, i) => {
                const cant = carritoSug.get(p.nombre)?.cantidad ?? 0
                const precio = CATALOGO_INFO[p.nombre]?.precio_lata ?? 0
                return (
                  <div key={p.nombre} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px', borderBottom: i < stats.sugeridos.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none', background: cant > 0 ? T_DIM : 'transparent', transition: 'background 0.15s' }}>
                    <ProductoThumb nombre={p.nombre} categoria={p.categoria} size={64} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 14, fontWeight: 700, color: '#F4EEDF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 2 }}>{p.nombre}</p>
                      <p style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 6 }}>Comprado {p.veces}x</p>
                      {precio > 0 && (
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                          <p style={{ fontSize: 17, fontWeight: 900, color: T, letterSpacing: '-0.5px', lineHeight: 1 }}>
                            {fmtPrecioCLP(precio)}
                            <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted)', marginLeft: 3 }}>/ lata</span>
                          </p>
                          {cant > 0 && (
                            <p style={{ fontSize: 17, fontWeight: 900, color: T, letterSpacing: '-0.5px', lineHeight: 1, opacity: 0.65 }}>
                              = {fmtPrecioCLP(cant * precio)}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                    <div style={{ flexShrink: 0 }}>
                      <CantidadInput
                        value={cant}
                        accent={T}
                        onchange={n => setSugCant(p.nombre, p.categoria, n)}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>

      <div style={{ padding: '16px', paddingBottom: 'max(80px, calc(64px + env(safe-area-inset-bottom)))' }}>
        <button onClick={() => onContinuar(Array.from(carritoSug.values()))} style={{ width: '100%', padding: '17px 0', borderRadius: 14, border: 'none', cursor: 'pointer', background: T, color: '#080808', fontSize: 16, fontWeight: 900, letterSpacing: '-0.3px' }}>
          {carritoSug.size > 0 ? `Ir a la Venta · ${Array.from(carritoSug.values()).reduce((s, i) => s + i.cantidad, 0)} ud. →` : 'Ir a la Venta →'}
        </button>
      </div>
    </div>
  )
}

// ─── Paso 4: Catálogo + Carrito ───────────────────────────────

function Paso4Catalogo({ productos, clienteNombre, vendedorNombre, carritoInicial, onCerrar }: {
  productos: Producto[]
  clienteNombre: string
  vendedorNombre: string
  carritoInicial?: ItemCarrito[]
  onCerrar: (carrito: ItemCarrito[], tienVenta: boolean, motivo: string, obs: string) => void
}) {
  const [tabCat, setTabCat]     = useState<'Cerveza' | 'Kombucha'>('Cerveza')
  const [tabEnvase, setTabEnvase] = useState<'lata' | 'barril'>('lata')
  const [carrito, setCarrito] = useState<Map<string, ItemCarrito>>(() => {
    const m = new Map<string, ItemCarrito>()
    // Key: "producto|envase" para permitir lata y barril del mismo producto
    for (const i of carritoInicial ?? []) m.set(`${i.producto}|${i.envase}`, i)
    return m
  })
  const [showCierre, setShowCierre] = useState(false)
  const [showCartDetail, setShowCartDetail] = useState(false)
  const [sinVenta, setSinVenta] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [obs, setObs] = useState('')
  const [waModal, setWaModal] = useState<null | 'catalogo'>(null)
  const [showImagenModal, setShowImagenModal] = useState(false)

  // Siempre usa CATALOGO_INFO como fuente de verdad — evita depender de la BD
  const esBarril = tabEnvase === 'barril'
  const envaseName = esBarril ? 'Barril 30L' : 'Lata'

  const prodsFiltrados: Producto[] = Object.entries(CATALOGO_INFO)
    .filter(([, info]) => {
      const esKom = info.estilo.toLowerCase().includes('kombucha')
      if (tabCat === 'Kombucha' ? !esKom : esKom) return false
      // En modo barril: solo mostrar los que tienen precio de barril
      if (esBarril && info.precio_barril <= 0) return false
      // En modo lata: solo mostrar los que tienen precio de lata
      if (!esBarril && info.precio_lata <= 0) return false
      return true
    })
    .map(([nombre, info]) => ({
      producto: nombre,
      categoria_producto: info.estilo.toLowerCase().includes('kombucha') ? 'Kombucha' : 'Cerveza',
      envase: envaseName,
    }))
    .sort((a, b) => a.producto.localeCompare(b.producto))

  function cartKey(producto: string, envase: string) { return `${producto}|${envase}` }

  function ajustar(prod: Producto, delta: number) {
    setCarrito(prev => {
      const next = new Map(prev)
      const key = cartKey(prod.producto, prod.envase ?? envaseName)
      const actual = next.get(key)?.cantidad ?? 0
      const nueva = actual + delta
      if (nueva <= 0) { next.delete(key); return next }
      const precio = esBarril
        ? (CATALOGO_INFO[prod.producto]?.precio_barril ?? 0)
        : (CATALOGO_INFO[prod.producto]?.precio_lata ?? 0)
      next.set(key, { producto: prod.producto, categoria: prod.categoria_producto ?? '', envase: prod.envase ?? envaseName, cantidad: nueva, precio })
      return next
    })
  }

  const items = Array.from(carrito.values())
  const totalItems = items.reduce((s, i) => s + i.cantidad, 0)
  const totalPrecio = items.reduce((s, i) => s + i.precio * i.cantidad, 0)

  // Pantalla cierre
  if (showCierre) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
          <p style={{ fontSize: 18, fontWeight: 900, color: '#F4EEDF', marginBottom: 16 }}>Cerrar visita</p>

          {/* Resumen carrito */}
          {items.length > 0 && (
            <div style={{ background: '#131313', border: `1px solid ${C_BORDER}`, borderRadius: 14, overflow: 'hidden', marginBottom: 12 }}>
              <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: C, textTransform: 'uppercase', letterSpacing: '0.8px' }}>Pedido</p>
                <p style={{ fontSize: 11, color: 'var(--muted)' }}>{totalItems} ud.</p>
              </div>
              {items.map((item, i) => (
                <div key={item.producto} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: i < items.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                  <ProductoThumb nombre={item.producto} categoria={item.categoria} size={36} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: '#F4EEDF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.producto}</p>
                    {item.envase && <p style={{ fontSize: 11, color: 'var(--muted)' }}>{item.envase}</p>}
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <p style={{ fontSize: 14, fontWeight: 900, color: C }}>×{item.cantidad}</p>
                    {item.precio > 0 && <p style={{ fontSize: 11, color: 'var(--muted)' }}>{fmtPrecioCLP(item.precio * item.cantidad)}</p>}
                  </div>
                </div>
              ))}
              {totalPrecio > 0 && (
                <div style={{ padding: '10px 14px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total pedido</p>
                  <p style={{ fontSize: 16, fontWeight: 900, color: '#F4EEDF' }}>{fmtPrecioCLP(totalPrecio)}</p>
                </div>
              )}
            </div>
          )}

          {/* Botón enviar venta como imagen */}
          {items.length > 0 && (
            <button
              onClick={() => setShowImagenModal(true)}
              style={{
                width: '100%', padding: '12px 16px', borderRadius: 12, marginBottom: 16,
                border: `1px solid rgba(37,211,102,0.3)`, background: 'rgba(37,211,102,0.07)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                cursor: 'pointer',
              }}
            >
              <MessageCircle size={16} color={WA} />
              <span style={{ fontSize: 14, fontWeight: 700, color: WA }}>Enviar venta por WhatsApp</span>
            </button>
          )}

          {/* Venta efectiva */}
          {items.length > 0 && (
            <div onClick={() => setSinVenta(false)} style={{ borderRadius: 14, padding: '16px', marginBottom: 10, cursor: 'pointer', background: !sinVenta ? T_DIM : '#1C1C1C', border: `2px solid ${!sinVenta ? T : 'rgba(255,255,255,0.06)'}`, display: 'flex', alignItems: 'center', gap: 12 }}>
              <CheckCircle size={22} color={!sinVenta ? T : 'var(--muted)'} />
              <div>
                <p style={{ fontSize: 15, fontWeight: 800, color: '#F4EEDF' }}>Venta efectiva</p>
                <p style={{ fontSize: 12, color: 'var(--muted)' }}>Confirmar los {totalItems} productos del carrito</p>
              </div>
            </div>
          )}

          {/* Sin venta */}
          <div onClick={() => setSinVenta(true)} style={{ borderRadius: 14, padding: '16px', marginBottom: 16, cursor: 'pointer', background: sinVenta ? 'rgba(181,84,62,0.06)' : '#1C1C1C', border: `2px solid ${sinVenta ? 'rgba(181,84,62,0.4)' : 'rgba(255,255,255,0.06)'}`, display: 'flex', alignItems: 'center', gap: 12 }}>
            <XCircle size={22} color={sinVenta ? '#B5543E' : 'var(--muted)'} />
            <div>
              <p style={{ fontSize: 15, fontWeight: 800, color: '#F4EEDF' }}>Visita sin venta</p>
              <p style={{ fontSize: 12, color: 'var(--muted)' }}>Registrar motivo de no cierre</p>
            </div>
          </div>

          {sinVenta && (
            <div style={{ marginBottom: 16 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: 8 }}>Motivo</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {MOTIVOS_SIN_VENTA.map(m => (
                  <div key={m} onClick={() => setMotivo(m)} style={{ padding: '12px 14px', borderRadius: 10, cursor: 'pointer', background: motivo === m ? 'rgba(181,84,62,0.08)' : '#1C1C1C', border: `1px solid ${motivo === m ? 'rgba(181,84,62,0.4)' : 'rgba(255,255,255,0.06)'}`, fontSize: 14, color: motivo === m ? '#B5543E' : '#F4EEDF', fontWeight: motivo === m ? 700 : 400 }}>
                    {m}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: 8 }}>Observaciones (opcional)</p>
            <textarea value={obs} onChange={e => setObs(e.target.value)} placeholder="Notas adicionales..." rows={3}
              style={{ width: '100%', padding: '12px 14px', borderRadius: 12, background: '#1C1C1C', border: '1px solid rgba(255,255,255,0.08)', color: '#F4EEDF', fontSize: 14, resize: 'none', outline: 'none' }} />
          </div>
        </div>

        <div style={{ padding: '16px', paddingBottom: 'max(80px, calc(64px + env(safe-area-inset-bottom)))' }}>
          <button
            onClick={() => { if (sinVenta && !motivo) return; onCerrar(items, !sinVenta, motivo, obs) }}
            disabled={sinVenta && !motivo}
            style={{ width: '100%', padding: '17px 0', borderRadius: 14, border: 'none', cursor: sinVenta && !motivo ? 'not-allowed' : 'pointer', background: sinVenta && !motivo ? 'rgba(255,255,255,0.06)' : C, color: sinVenta && !motivo ? 'var(--muted)' : '#080808', fontSize: 16, fontWeight: 900, letterSpacing: '-0.3px' }}
          >
            Confirmar y finalizar ✓
          </button>
        </div>

        {waModal && (
          <WhatsAppModal
            tipo={waModal} clienteNombre={clienteNombre} vendedorNombre={vendedorNombre}
            onClose={() => setWaModal(null)}
          />
        )}
        {showImagenModal && (
          <VentaImageModal
            items={items} clienteNombre={clienteNombre} vendedorNombre={vendedorNombre}
            onClose={() => setShowImagenModal(false)}
          />
        )}
      </div>
    )
  }

  // Pantalla catálogo
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* ── Selectors premium ── */}
      <div style={{ padding: '20px 18px 0' }}>

        {/* Selector PRODUCTO */}
        <p style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.22)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 8 }}>PRODUCTO</p>
        <div style={{
          display: 'flex',
          background: 'rgba(255,255,255,0.035)',
          border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: 18, padding: 5,
          backdropFilter: 'blur(20px)',
        }}>
          {([
            { key: 'Cerveza', label: 'Cerveza', icon: '🍺' },
            { key: 'Kombucha', label: 'Kombucha', icon: '🫧' },
          ] as const).map(opt => {
            const active = tabCat === opt.key
            return (
              <button key={opt.key} onClick={() => setTabCat(opt.key)} style={{
                flex: 1, padding: '13px 0', borderRadius: 14, border: 'none', cursor: 'pointer',
                background: active
                  ? 'linear-gradient(145deg, rgba(212,175,55,0.22) 0%, rgba(212,175,55,0.10) 100%)'
                  : 'transparent',
                boxShadow: active
                  ? '0 0 24px rgba(212,175,55,0.12), inset 0 0 0 1px rgba(212,175,55,0.22)'
                  : 'none',
                transition: 'all 0.25s cubic-bezier(0.16,1,0.3,1)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
              }}>
                <span style={{ fontSize: 22, lineHeight: 1 }}>{opt.icon}</span>
                <span style={{ fontSize: 13, fontWeight: active ? 600 : 500, color: active ? '#F0D060' : 'rgba(255,255,255,0.3)', letterSpacing: '-0.1px', transition: 'color 0.2s' }}>
                  {opt.label}
                </span>
              </button>
            )
          })}
        </div>

        {/* Selector FORMATO */}
        <p style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.22)', letterSpacing: '2px', textTransform: 'uppercase', marginTop: 16, marginBottom: 8 }}>FORMATO</p>
        <div style={{
          display: 'flex',
          background: 'rgba(255,255,255,0.035)',
          border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: 18, padding: 5,
          backdropFilter: 'blur(20px)',
        }}>
          {([
            { key: 'lata',   label: 'Lata',       icon: '🥫' },
            { key: 'barril', label: 'Barril 30L',  icon: '🛢️' },
          ] as const).map(opt => {
            const active = tabEnvase === opt.key
            return (
              <button key={opt.key} onClick={() => setTabEnvase(opt.key)} style={{
                flex: 1, padding: '13px 0', borderRadius: 14, border: 'none', cursor: 'pointer',
                background: active
                  ? 'linear-gradient(145deg, rgba(212,175,55,0.22) 0%, rgba(212,175,55,0.10) 100%)'
                  : 'transparent',
                boxShadow: active
                  ? '0 0 24px rgba(212,175,55,0.12), inset 0 0 0 1px rgba(212,175,55,0.22)'
                  : 'none',
                transition: 'all 0.25s cubic-bezier(0.16,1,0.3,1)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
              }}>
                <span style={{ fontSize: 22, lineHeight: 1 }}>{opt.icon}</span>
                <span style={{ fontSize: 13, fontWeight: active ? 600 : 500, color: active ? '#F0D060' : 'rgba(255,255,255,0.3)', letterSpacing: '-0.1px', transition: 'color 0.2s' }}>
                  {opt.label}
                </span>
              </button>
            )
          })}
        </div>

        {/* Info barril */}
        {esBarril && (
          <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 12, background: 'rgba(212,175,55,0.05)', border: '1px solid rgba(212,175,55,0.12)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 14 }}>🛢️</span>
            <span style={{ fontSize: 11, color: 'rgba(212,175,55,0.65)', fontWeight: 500 }}>
              Barril de <strong style={{ color: '#D4AF37' }}>30 litros</strong> · Precio con IVA incluido
            </span>
          </div>
        )}

        {/* Botón enviar catálogo por WA */}
        <button
          onClick={() => setWaModal('catalogo')}
          style={{
            marginTop: 12, width: '100%', padding: '11px 0',
            borderRadius: 14, border: '1px solid rgba(37,211,102,0.18)',
            background: 'rgba(37,211,102,0.05)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
            cursor: 'pointer',
          }}
        >
          <Share2 size={14} color={WA} />
          <span style={{ fontSize: 12, fontWeight: 600, color: WA }}>Enviar catálogo por WhatsApp</span>
        </button>
      </div>

      {/* Lista productos */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px' }}>
        {prodsFiltrados.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <Package size={32} color="var(--muted)" style={{ margin: '0 auto 10px' }} />
            <p style={{ color: 'var(--muted)', fontSize: 14 }}>Sin productos en esta categoría</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {prodsFiltrados.map(p => {
              const key = cartKey(p.producto, p.envase ?? envaseName)
              const cant   = carrito.get(key)?.cantidad ?? 0
              const info   = CATALOGO_INFO[p.producto]
              const precio = esBarril ? (info?.precio_barril ?? 0) : (info?.precio_lata ?? 0)
              const unidadLabel = esBarril ? '/ barril' : '/ lata'
              return (
                <div key={key} style={{
                  background: cant > 0
                    ? 'linear-gradient(135deg, rgba(212,175,55,0.08) 0%, rgba(212,175,55,0.04) 100%)'
                    : 'rgba(255,255,255,0.025)',
                  border: `1px solid ${cant > 0 ? 'rgba(212,175,55,0.18)' : 'rgba(255,255,255,0.055)'}`,
                  borderRadius: 18,
                  padding: '14px 16px',
                  display: 'flex', alignItems: 'center', gap: 14,
                  transition: 'all 0.25s cubic-bezier(0.16,1,0.3,1)',
                  boxShadow: cant > 0 ? '0 0 20px rgba(212,175,55,0.07)' : 'none',
                }}>
                  <ProductoThumb nombre={p.producto} categoria={p.categoria_producto ?? ''} size={48} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 14, fontWeight: 600, color: '#F0EDE8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 2, letterSpacing: '-0.2px' }}>
                      {p.producto}
                    </p>
                    <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.28)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 6, fontWeight: 500 }}>
                      {info?.estilo}
                      {esBarril && <span style={{ marginLeft: 6, color: 'rgba(212,175,55,0.6)', fontWeight: 600 }}>· 30 L</span>}
                    </p>
                    {precio > 0 && (
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                        <span style={{ fontSize: 16, fontWeight: 700, color: '#D4AF37', letterSpacing: '-0.4px', lineHeight: 1 }}>
                          {fmtPrecioCLP(precio)}
                        </span>
                        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', fontWeight: 500 }}>{unidadLabel}</span>
                        {cant > 0 && (
                          <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(212,175,55,0.55)', letterSpacing: '-0.2px' }}>
                            · {fmtPrecioCLP(cant * precio)}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <div style={{ flexShrink: 0 }}>
                    <CantidadInput
                      value={cant}
                      accent={C}
                      onchange={n => {
                        setCarrito(prev => {
                          const next = new Map(prev)
                          if (n <= 0) { next.delete(key); return next }
                          next.set(key, { producto: p.producto, categoria: p.categoria_producto ?? '', envase: p.envase ?? envaseName, cantidad: n, precio })
                          return next
                        })
                      }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Panel detalle carrito */}
      <div style={{ padding: '0 16px', paddingBottom: showCartDetail && items.length > 0 ? 0 : 0 }}>
        {showCartDetail && items.length > 0 && (
          <div style={{ background: '#131313', border: `1px solid ${C_BORDER}`, borderRadius: '14px 14px 0 0', overflow: 'hidden', marginBottom: -1 }}>
            {items.map((item, i) => (
              <div key={`${item.producto}|${item.envase}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderBottom: i < items.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                <ProductoThumb nombre={item.producto} categoria={item.categoria} size={30} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: '#F4EEDF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.producto}</p>
                  {item.envase && <p style={{ fontSize: 10, color: 'var(--muted)' }}>{item.envase}</p>}
                </div>
                <span style={{ fontSize: 12, color: 'var(--muted)', flexShrink: 0 }}>×{item.cantidad}</span>
                {item.precio > 0 && (
                  <span style={{ fontSize: 13, fontWeight: 800, color: C, flexShrink: 0, minWidth: 64, textAlign: 'right' }}>
                    {fmtPrecioCLP(item.precio * item.cantidad)}
                  </span>
                )}
              </div>
            ))}
            <div style={{ padding: '9px 14px', background: 'rgba(79,70,229,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total</span>
              <span style={{ fontSize: 15, fontWeight: 900, color: '#F4EEDF' }}>{fmtPrecioCLP(totalPrecio)}</span>
            </div>
          </div>
        )}
      </div>

      {/* Carrito flotante */}
      <div style={{ padding: '12px 16px', paddingBottom: 'max(76px, calc(64px + env(safe-area-inset-bottom)))' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          {/* Botón ver detalle */}
          {totalItems > 0 && (
            <button
              onClick={() => setShowCartDetail(s => !s)}
              style={{
                width: 52, borderRadius: 14, border: `1px solid ${C_BORDER}`, background: showCartDetail ? C_DIM : 'rgba(255,255,255,0.04)',
                color: C, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0,
              }}
            >
              <ChevronDown size={20} style={{ transform: showCartDetail ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
            </button>
          )}
          <button onClick={() => setShowCierre(true)} style={{
            flex: 1, padding: '17px 20px', borderRadius: 14, border: 'none', cursor: 'pointer',
            background: totalItems > 0 ? C : 'rgba(255,255,255,0.06)',
            color: totalItems > 0 ? '#080808' : 'var(--muted)',
            fontSize: 15, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'space-between', transition: 'all 0.2s',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <ShoppingCart size={18} />
              <span>{totalItems > 0 ? `${totalItems} producto${totalItems > 1 ? 's' : ''}` : 'Carrito vacío'}</span>
            </div>
            <span>{totalItems > 0 ? `${fmtPrecioCLP(totalPrecio)} →` : 'Sin venta →'}</span>
          </button>
        </div>
      </div>

      {waModal && (
        <WhatsAppModal
          tipo={waModal} clienteNombre={clienteNombre} vendedorNombre={vendedorNombre}
          onClose={() => setWaModal(null)}
        />
      )}
    </div>
  )
}

// ─── Wizard principal ─────────────────────────────────────────

export default function NuevaVisitaClient({ vendedor, clientesExistentes, catalogoProductos, visitaRetomada, deudores = [], clientePre = null }: Props) {
  const router = useRouter()
  const supabase = createClient()

  // Si retomamos visita, inicializar estado directamente en el paso correcto
  const pasoInicial = visitaRetomada
    ? (visitaRetomada.lat ? (visitaRetomada.es_cliente_nuevo ? 3 : 3) : 2)
    : 1

  const [paso, setPaso] = useState(pasoInicial)
  const [guardando, setGuardando] = useState(false)
  const [cliente, setCliente] = useState<{ nombre: string; esNuevo: boolean; canal: string } | null>(
    visitaRetomada ? { nombre: visitaRetomada.cliente_nombre, esNuevo: visitaRetomada.es_cliente_nuevo, canal: '' } : null
  )
  const [visitaId, setVisitaId] = useState<string | null>(visitaRetomada?.id ?? null)
  const [gps, setGps] = useState<{ lat: number; lng: number; addr: string } | null>(
    visitaRetomada?.lat ? { lat: visitaRetomada.lat, lng: visitaRetomada.lng!, addr: visitaRetomada.direccion_gps ?? '' } : null
  )
  const [carritoInicial, setCarritoInicial] = useState<ItemCarrito[]>([])
  const [syncPendiente, setSyncPendiente] = useState(false)

  const totalPasos = cliente?.esNuevo ? 3 : 4

  // Draft acumulativo de la visita: cada escritura es un upsert con TODOS los
  // campos conocidos hasta el momento. Así, si se reintenta offline en
  // cualquier orden, nunca se pisa un campo con null por accidente.
  const visitaDraft = useRef<Record<string, unknown>>(
    visitaRetomada ? {
      id: visitaRetomada.id, vendedor_id: vendedor.id,
      cliente_nombre: visitaRetomada.cliente_nombre, es_cliente_nuevo: visitaRetomada.es_cliente_nuevo,
      estado: visitaRetomada.estado,
      ...(visitaRetomada.lat ? { lat: visitaRetomada.lat, lng: visitaRetomada.lng, direccion_gps: visitaRetomada.direccion_gps } : {}),
    } : {}
  )

  async function onClienteConfirmado(nombre: string, esNuevo: boolean, canal: string) {
    setCliente({ nombre, esNuevo, canal })
    // ID generado en el cliente — no depende de la red para existir,
    // así el resto del flujo (check-in, catálogo) puede avanzar sin conexión.
    const id = crypto.randomUUID()
    setVisitaId(id)
    visitaDraft.current = {
      id, vendedor_id: vendedor.id, cliente_nombre: nombre, es_cliente_nuevo: esNuevo, estado: 'en_progreso',
    }
    setSyncPendiente(true)
    upsertOrQueue(supabase, 'visitas_terreno', visitaDraft.current).then(r => setSyncPendiente(!r.ok))
    setPaso(2)
  }

  // Pedido rápido: si llegamos con ?cliente=Nombre (desde misiones / detalle de
  // cliente), pre-seleccionamos ese cliente y arrancamos directo en el check-in.
  const pedidoRapidoRef = useRef(false)
  useEffect(() => {
    if (pedidoRapidoRef.current) return
    if (!clientePre || visitaRetomada || cliente) return
    pedidoRapidoRef.current = true
    const c = clientesExistentes.find(x => x.nombre_fantasia?.toLowerCase().trim() === clientePre.toLowerCase().trim())
    onClienteConfirmado(clientePre, !c, c?.categoria_negocio ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientePre])

  async function onCheckinConfirmado(
    coords: { lat: number; lng: number; addr: string },
    _fotos: Record<string, string>,
    fotosFiles: Record<string, File>,
  ) {
    setGps(coords)
    if (!visitaId) { setPaso(3); return }

    // Subir fotos a Supabase Storage y obtener URLs públicas
    const photoUrls: Record<string, string | null> = {
      foto_exterior: null,
      foto_exhibicion: null,
      foto_competencia: null,
    }
    const keyMap: Record<string, string> = {
      exterior: 'foto_exterior',
      exhibicion: 'foto_exhibicion',
      competencia: 'foto_competencia',
    }
    // Sin conexión: las fotos no se pueden encolar (binarios), se omiten sin
    // bloquear el flujo. El pedido y los datos del cliente sí se preservan.
    await Promise.all(
      Object.entries(fotosFiles).map(async ([key, file]) => {
        try {
          const path = `${visitaId}/${key}.jpg`
          const { error } = await supabase.storage
            .from('terreno-fotos')
            .upload(path, file, { upsert: true, contentType: file.type || 'image/jpeg' })
          if (!error) {
            const { data: { publicUrl } } = supabase.storage
              .from('terreno-fotos')
              .getPublicUrl(path)
            photoUrls[keyMap[key]] = publicUrl
          }
        } catch { /* sin conexión — se omite la foto, no bloquea el flujo */ }
      })
    )

    visitaDraft.current = {
      ...visitaDraft.current,
      id: visitaId,
      lat: coords.lat, lng: coords.lng, direccion_gps: coords.addr,
      ...photoUrls,
    }
    setSyncPendiente(true)
    upsertOrQueue(supabase, 'visitas_terreno', visitaDraft.current).then(r => setSyncPendiente(!r.ok))

    setPaso(3)
  }

  function onVista360Continuar(items: ItemCarrito[]) { setCarritoInicial(items); setPaso(4) }

  async function onCerrar(items: ItemCarrito[], tienVenta: boolean, motivo: string, obs: string) {
    if (!visitaId) return
    setGuardando(true)
    try {
      const total = items.reduce((s, i) => s + i.cantidad * (i.precio || CATALOGO_INFO[i.producto]?.precio_lata || 0), 0)

      visitaDraft.current = {
        ...visitaDraft.current,
        id: visitaId,
        tiene_venta: tienVenta, motivo_sin_venta: tienVenta ? null : motivo,
        observaciones: obs || null, total_pedido: total, estado: 'completada', completada_at: new Date().toISOString(),
      }
      const rVisita = await upsertOrQueue(supabase, 'visitas_terreno', visitaDraft.current)

      let itemsQuedaronPendientes = false
      if (items.length > 0) {
        const resultados = await Promise.all(
          items.map(i => upsertOrQueue(supabase, 'visitas_terreno_items', {
            id: crypto.randomUUID(), visita_id: visitaId, producto: i.producto, categoria: i.categoria,
            envase: i.envase, cantidad: i.cantidad, precio_unit: i.precio, subtotal: i.cantidad * i.precio,
          }))
        )
        itemsQuedaronPendientes = resultados.some(r => r.queued)
      }
      setSyncPendiente(!rVisita.ok || itemsQuedaronPendientes)

      // 🔔 Notificar según resultado
      if (tienVenta) {
        const fmtCLP = (n: number) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)
        notificar({
          event: 'visita_completada',
          title: `✅ Venta en ${cliente?.nombre ?? 'local'}`,
          body: `${fmtCLP(total)} · ${items.length} producto${items.length !== 1 ? 's' : ''}`,
          url: '/terreno/historial',
        })
      } else if (motivo) {
        notificar({
          event: 'visita_sin_venta',
          title: `📍 Visita sin venta — ${cliente?.nombre ?? 'local'}`,
          body: motivo,
          url: '/terreno/historial',
        })
      }

      router.push('/terreno?cierre=1')
    } finally {
      setGuardando(false)
    }
  }

  const pasoLabel = ['', 'Cliente', 'Check-In', cliente?.esNuevo ? 'Catálogo' : 'Vista 360°', 'Catálogo'][paso]

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(160deg, #07060F 0%, #0A0810 40%, #070612 100%)', display: 'flex', flexDirection: 'column' }}>
      {/* Header premium glass */}
      <div style={{
        background: 'rgba(10,8,20,0.85)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        paddingTop: 'max(16px, env(safe-area-inset-top, 16px))',
        paddingBottom: 14,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 18px', marginBottom: 16 }}>
          {/* Back button: glass circle */}
          <button
            onClick={() => paso > 1 ? setPaso(paso - 1) : router.push('/terreno')}
            style={{
              width: 38, height: 38, borderRadius: '50%',
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.09)',
              backdropFilter: 'blur(12px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', flexShrink: 0,
            }}
          >
            <ChevronLeft size={18} color="rgba(255,255,255,0.75)" />
          </button>

          {/* Title center */}
          <div style={{ textAlign: 'center', flex: 1, padding: '0 12px' }}>
            <p style={{ fontSize: 16, fontWeight: 700, color: '#F8F6F0', letterSpacing: '-0.4px', lineHeight: 1.2 }}>
              {cliente ? cliente.nombre : 'Nueva Visita'}
            </p>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', fontWeight: 500, marginTop: 3, letterSpacing: '0.1px' }}>
              Paso {paso}/{totalPasos} · {pasoLabel}
            </p>
          </div>

          {/* Share placeholder (mismo tamaño que el back para centrar) */}
          <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Share2 size={15} color="rgba(255,255,255,0.4)" />
          </div>
        </div>
        <StepBar paso={paso} total={totalPasos} />
      </div>

      {paso === 1 && <Paso1Cliente clientes={clientesExistentes} deudores={deudores} onConfirmar={onClienteConfirmado} />}
      {paso === 2 && <Paso2Checkin onConfirmar={onCheckinConfirmado} />}
      {paso === 3 && !cliente?.esNuevo && <Paso3Vista360 clienteNombre={cliente?.nombre ?? ''} esNuevo={false} onContinuar={onVista360Continuar} />}
      {(paso === 4 || (paso === 3 && cliente?.esNuevo)) && (
        <Paso4Catalogo
          productos={catalogoProductos}
          clienteNombre={cliente?.nombre ?? ''}
          vendedorNombre={vendedor.nombre ?? ''}
          carritoInicial={carritoInicial}
          onCerrar={onCerrar}
        />
      )}

      {guardando && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: '#1C1C1C', borderRadius: 16, padding: '24px 32px', textAlign: 'center' }}>
            <p style={{ fontSize: 15, fontWeight: 700, color: '#F4EEDF' }}>Guardando visita…</p>
          </div>
        </div>
      )}
    </div>
  )
}
