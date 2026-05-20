'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
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
  'Kombucha Berry Menta':        '/productos/kombucha/berry-menta.png',
  'Kombucha Detox':              '/productos/kombucha/detox.png',
  'Kombucha Lemon':              '/productos/kombucha/lemon-fresh.png',
  'Kombucha Mango':              '/productos/kombucha/mango-merken.png',
  'Kombucha Maqui':              '/productos/kombucha/maqui-hops.png',
  'Kombucha Maracuyá Cardamomo': '/productos/kombucha/maracuya-cardamomo.png',
  'Kombucha Natural':            '/productos/kombucha/natural.png',
  'Arboretum':                   '/productos/cerveza/arboretum.png',
  'Mocho English':               '/productos/cerveza/mocho.png',
  'La Barra APA':                '/productos/cerveza/la-barra.png',
  'Fisura':                      '/productos/cerveza/fisura.png',
  'Descenso West Coast IPA':     '/productos/cerveza/descenso.png',
  'Aguas Blancas':               '/productos/cerveza/aguas-blancas.png',
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
  tipo: 'catalogo' | 'pedido'
  items?: ItemCarrito[]
  clienteNombre: string
  vendedorNombre: string
  onClose: () => void
}

function WhatsAppModal({ tipo, items, clienteNombre, vendedorNombre, onClose }: WhatsAppModalProps) {
  const [phone, setPhone] = useState('')
  const titulo = tipo === 'catalogo' ? 'Enviar Catálogo' : 'Enviar Cotización'
  const desc = tipo === 'catalogo'
    ? 'Se enviará el catálogo completo con todos los productos y precios.'
    : 'Se enviará el resumen del pedido armado para este cliente.'

  function enviar() {
    const t = phone.trim()
    if (!t) return
    const msg = tipo === 'catalogo' ? generarMensajeCatalogo() : generarMensajePedido(items ?? [], clienteNombre, vendedorNombre)
    abrirWhatsApp(t, msg)
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
            <p style={{ fontSize: 16, fontWeight: 800, color: '#F4EEDF' }}>{titulo}</p>
            <p style={{ fontSize: 11, color: 'var(--muted)' }}>vía WhatsApp</p>
          </div>
        </div>
        <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 20, paddingLeft: 52 }}>{desc}</p>

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
        background: 'rgba(74,222,128,0.06)', border: '1px solid rgba(74,222,128,0.2)',
      }}>
        <CheckCircle size={16} color="#4ADE80" />
        <p style={{ fontSize: 13, color: '#4ADE80', fontWeight: 600 }}>Cliente al día — sin deuda pendiente</p>
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
          background: 'rgba(255,85,85,0.08)', border: '1px solid rgba(255,85,85,0.3)',
          borderRadius: expanded ? '12px 12px 0 0' : 12,
        }}
      >
        <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(255,85,85,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <AlertTriangle size={18} color="#FF5555" />
        </div>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: '#FF5555', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 2 }}>
            Saldo pendiente · {saldo.dias_credito} días de crédito
          </p>
          <p style={{ fontSize: 20, fontWeight: 900, color: '#F4EEDF', letterSpacing: '-0.5px' }}>
            {fmtPrecioCLP(saldo.monto_deuda)}
          </p>
        </div>
        <ChevronDown size={16} color="#FF5555" style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }} />
      </div>

      {expanded && (
        <div style={{ background: 'rgba(255,85,85,0.04)', border: '1px solid rgba(255,85,85,0.2)', borderTop: 'none', borderRadius: '0 0 12px 12px', padding: '12px 16px' }}>
          {saldo.facturas_vencidas.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', padding: '12px 0' }}>
              Sin detalle de facturas disponible
            </p>
          ) : saldo.facturas_vencidas.map((f, i) => (
            <div key={i} style={{ padding: '10px 12px', borderRadius: 10, marginBottom: 6, background: 'rgba(0,0,0,0.25)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#F4EEDF' }}>Doc #{f.numero}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#FF5555', background: 'rgba(255,85,85,0.12)', padding: '2px 8px', borderRadius: 6 }}>
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
}

interface Props {
  vendedor: AppUser
  clientesExistentes: ClienteExistente[]
  catalogoProductos: Producto[]
  visitaRetomada?: VisitaRetomada | null
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
          style={{ width: numW, textAlign: 'center', fontSize, fontWeight: 900, color: value > 0 ? accent : 'var(--muted)', cursor: 'text', padding: '0 2px', margin: '0 2px' }}
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
  return (
    <div style={{ display: 'flex', gap: 4, padding: '0 20px' }}>
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} style={{
          flex: 1, height: 3, borderRadius: 2,
          background: i < paso ? T : 'rgba(255,255,255,0.1)',
          transition: 'background 0.3s',
        }} />
      ))}
    </div>
  )
}

// ─── Paso 1: Selección de cliente ────────────────────────────

function Paso1Cliente({ clientes, onConfirmar }: {
  clientes: ClienteExistente[]
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
        ) : (
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
        )}
      </div>

      <div style={{ padding: '16px', paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
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
  onConfirmar: (coords: { lat: number; lng: number; addr: string }, fotos: Record<string, string>) => void
}) {
  const [gps, setGps] = useState<{ lat: number; lng: number; addr: string } | null>(null)
  const [gpsError, setGpsError] = useState(false)
  const [fotos, setFotos] = useState<Record<string, string>>({})
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
  }

  const fotosListas = FOTO_SLOTS.filter(s => fotos[s.key]).length
  const listo = !!gps && fotosListas === 3

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
        {/* GPS */}
        <div style={{ background: '#1C1C1C', borderRadius: 14, padding: '14px 16px', marginBottom: 20, border: `1px solid ${gps ? T_BORDER : gpsError ? 'rgba(255,77,77,0.3)' : 'rgba(255,255,255,0.06)'}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0, background: gps ? T_DIM : gpsError ? 'rgba(255,77,77,0.1)' : 'rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <MapPin size={18} color={gps ? T : gpsError ? '#FF4D4D' : 'var(--muted)'} />
            </div>
            <div>
              <p style={{ fontSize: 12, fontWeight: 700, color: gps ? T : gpsError ? '#FF4D4D' : 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
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

      <div style={{ padding: '16px', paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
        <button onClick={() => gps && onConfirmar(gps, fotos)} disabled={!listo} style={{
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

      <div style={{ padding: '16px', paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
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
  const [tabCat, setTabCat] = useState<'Cerveza' | 'Kombucha'>('Cerveza')
  const [carrito, setCarrito] = useState<Map<string, ItemCarrito>>(() => {
    const m = new Map<string, ItemCarrito>()
    for (const i of carritoInicial ?? []) m.set(i.producto, i)
    return m
  })
  const [showCierre, setShowCierre] = useState(false)
  const [showCartDetail, setShowCartDetail] = useState(false)
  const [sinVenta, setSinVenta] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [obs, setObs] = useState('')
  const [waModal, setWaModal] = useState<null | 'catalogo' | 'pedido'>(null)

  const prodsFiltrados = productos
    .filter(p => (p.categoria_producto ?? '').toLowerCase().includes(tabCat.toLowerCase()))
    .filter(p => !!PRODUCTO_IMAGENES[p.producto])
    .sort((a, b) => (a.producto ?? '').localeCompare(b.producto ?? ''))

  function ajustar(prod: Producto, delta: number) {
    setCarrito(prev => {
      const next = new Map(prev)
      const key = prod.producto
      const actual = next.get(key)?.cantidad ?? 0
      const nueva = actual + delta
      if (nueva <= 0) { next.delete(key); return next }
      next.set(key, { producto: prod.producto, categoria: prod.categoria_producto ?? '', envase: prod.envase ?? '', cantidad: nueva, precio: CATALOGO_INFO[prod.producto]?.precio_lata ?? 0 })
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

          {/* Botón enviar cotización */}
          {items.length > 0 && (
            <button
              onClick={() => setWaModal('pedido')}
              style={{
                width: '100%', padding: '12px 16px', borderRadius: 12, marginBottom: 16,
                border: `1px solid rgba(37,211,102,0.3)`, background: 'rgba(37,211,102,0.07)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                cursor: 'pointer',
              }}
            >
              <MessageCircle size={16} color={WA} />
              <span style={{ fontSize: 14, fontWeight: 700, color: WA }}>Enviar cotización por WhatsApp</span>
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
          <div onClick={() => setSinVenta(true)} style={{ borderRadius: 14, padding: '16px', marginBottom: 16, cursor: 'pointer', background: sinVenta ? 'rgba(255,77,77,0.06)' : '#1C1C1C', border: `2px solid ${sinVenta ? 'rgba(255,77,77,0.4)' : 'rgba(255,255,255,0.06)'}`, display: 'flex', alignItems: 'center', gap: 12 }}>
            <XCircle size={22} color={sinVenta ? '#FF4D4D' : 'var(--muted)'} />
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
                  <div key={m} onClick={() => setMotivo(m)} style={{ padding: '12px 14px', borderRadius: 10, cursor: 'pointer', background: motivo === m ? 'rgba(255,77,77,0.08)' : '#1C1C1C', border: `1px solid ${motivo === m ? 'rgba(255,77,77,0.4)' : 'rgba(255,255,255,0.06)'}`, fontSize: 14, color: motivo === m ? '#FF4D4D' : '#F4EEDF', fontWeight: motivo === m ? 700 : 400 }}>
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

        <div style={{ padding: '16px', paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
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
            tipo={waModal} items={items} clienteNombre={clienteNombre} vendedorNombre={vendedorNombre}
            onClose={() => setWaModal(null)}
          />
        )}
      </div>
    )
  }

  // Pantalla catálogo
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Tabs + botón catálogo WA */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '12px 16px 0' }}>
        <div style={{ flex: 1, display: 'flex', borderRadius: 12, background: '#1C1C1C', padding: 4, gap: 4 }}>
          {(['Cerveza', 'Kombucha'] as const).map(cat => (
            <button key={cat} onClick={() => setTabCat(cat)} style={{
              flex: 1, padding: '10px 0', borderRadius: 9, border: 'none', cursor: 'pointer',
              background: tabCat === cat ? C : 'transparent',
              color: tabCat === cat ? '#fff' : 'var(--muted)',
              fontSize: 14, fontWeight: 700, transition: 'all 0.15s',
            }}>
              {cat === 'Cerveza' ? '🍺' : '🫧'} {cat}
            </button>
          ))}
        </div>
        {/* Botón enviar catálogo */}
        <button
          onClick={() => setWaModal('catalogo')}
          title="Enviar catálogo por WhatsApp"
          style={{ width: 44, height: 44, borderRadius: 12, border: `1px solid rgba(37,211,102,0.3)`, background: 'rgba(37,211,102,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
        >
          <Share2 size={18} color={WA} />
        </button>
      </div>

      {/* Lista productos */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
        {prodsFiltrados.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <Package size={32} color="var(--muted)" style={{ margin: '0 auto 10px' }} />
            <p style={{ color: 'var(--muted)', fontSize: 14 }}>Sin productos en esta categoría</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {prodsFiltrados.map(p => {
              const cant = carrito.get(p.producto)?.cantidad ?? 0
              return (
                <div key={p.producto} style={{ background: cant > 0 ? C_DIM : '#1C1C1C', border: `1px solid ${cant > 0 ? C_BORDER : 'rgba(255,255,255,0.06)'}`, borderRadius: 12, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12, transition: 'all 0.15s' }}>
                  <ProductoThumb nombre={p.producto} categoria={p.categoria_producto ?? ''} size={46} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: '#F4EEDF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 2 }}>{p.producto}</p>
                    {CATALOGO_INFO[p.producto]?.estilo && (
                      <p style={{ fontSize: 10, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 3 }}>{CATALOGO_INFO[p.producto].estilo}</p>
                    )}
                    {CATALOGO_INFO[p.producto]?.precio_lata && (
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                        <p style={{ fontSize: 17, fontWeight: 900, color: C, letterSpacing: '-0.5px', lineHeight: 1 }}>
                          {fmtPrecioCLP(CATALOGO_INFO[p.producto].precio_lata)}
                          <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted)', marginLeft: 3 }}>/ lata</span>
                        </p>
                        {cant > 0 && (
                          <p style={{ fontSize: 17, fontWeight: 900, color: C, letterSpacing: '-0.5px', lineHeight: 1, opacity: 0.65 }}>
                            = {fmtPrecioCLP(cant * CATALOGO_INFO[p.producto].precio_lata)}
                          </p>
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
                          if (n <= 0) { next.delete(p.producto); return next }
                          next.set(p.producto, { producto: p.producto, categoria: p.categoria_producto ?? '', envase: p.envase ?? '', cantidad: n, precio: CATALOGO_INFO[p.producto]?.precio_lata ?? 0 })
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
              <div key={item.producto} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderBottom: i < items.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                <ProductoThumb nombre={item.producto} categoria={item.categoria} size={30} />
                <p style={{ flex: 1, fontSize: 13, fontWeight: 600, color: '#F4EEDF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{item.producto}</p>
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
      <div style={{ padding: '12px 16px', paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
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
          tipo={waModal} items={items} clienteNombre={clienteNombre} vendedorNombre={vendedorNombre}
          onClose={() => setWaModal(null)}
        />
      )}
    </div>
  )
}

// ─── Wizard principal ─────────────────────────────────────────

export default function NuevaVisitaClient({ vendedor, clientesExistentes, catalogoProductos, visitaRetomada }: Props) {
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

  const totalPasos = cliente?.esNuevo ? 3 : 4

  async function onClienteConfirmado(nombre: string, esNuevo: boolean, canal: string) {
    setCliente({ nombre, esNuevo, canal })
    const { data } = await supabase.from('visitas_terreno').insert({
      vendedor_id: vendedor.id, cliente_nombre: nombre, es_cliente_nuevo: esNuevo, estado: 'en_progreso',
    }).select('id').single()
    if (data) setVisitaId(data.id)
    setPaso(2)
  }

  async function onCheckinConfirmado(coords: { lat: number; lng: number; addr: string }, _fotos: Record<string, string>) {
    setGps(coords)
    if (visitaId) await supabase.from('visitas_terreno').update({ lat: coords.lat, lng: coords.lng, direccion_gps: coords.addr }).eq('id', visitaId)
    setPaso(3)
  }

  function onVista360Continuar(items: ItemCarrito[]) { setCarritoInicial(items); setPaso(4) }

  async function onCerrar(items: ItemCarrito[], tienVenta: boolean, motivo: string, obs: string) {
    if (!visitaId) return
    setGuardando(true)
    try {
      const total = items.reduce((s, i) => s + i.cantidad * (i.precio || CATALOGO_INFO[i.producto]?.precio_lata || 0), 0)
      await supabase.from('visitas_terreno').update({
        tiene_venta: tienVenta, motivo_sin_venta: tienVenta ? null : motivo,
        observaciones: obs || null, total_pedido: total, estado: 'completada', completada_at: new Date().toISOString(),
      }).eq('id', visitaId)
      if (items.length > 0) {
        await supabase.from('visitas_terreno_items').insert(
          items.map(i => ({ visita_id: visitaId, producto: i.producto, categoria: i.categoria, envase: i.envase, cantidad: i.cantidad, precio_unit: i.precio, subtotal: i.cantidad * i.precio }))
        )
      }
      router.push('/terreno')
    } finally {
      setGuardando(false)
    }
  }

  const pasoLabel = ['', 'Cliente', 'Check-In', cliente?.esNuevo ? 'Catálogo' : 'Vista 360°', 'Catálogo'][paso]

  return (
    <div style={{ minHeight: '100vh', background: '#080808', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ background: '#0F0F0F', borderBottom: '1px solid rgba(212,175,55,0.15)', padding: '14px 16px 10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <button onClick={() => paso > 1 ? setPaso(paso - 1) : router.push('/terreno')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T, display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 600, padding: 0 }}>
            <ChevronLeft size={18} /> {paso === 1 ? 'Cancelar' : 'Atrás'}
          </button>
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: 14, fontWeight: 800, color: '#F4EEDF' }}>{cliente ? cliente.nombre : 'Nueva Visita'}</p>
            <p style={{ fontSize: 11, color: 'var(--muted)' }}>Paso {paso}/{totalPasos} · {pasoLabel}</p>
          </div>
          <div style={{ width: 60 }} />
        </div>
        <StepBar paso={paso} total={totalPasos} />
      </div>

      {paso === 1 && <Paso1Cliente clientes={clientesExistentes} onConfirmar={onClienteConfirmado} />}
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
