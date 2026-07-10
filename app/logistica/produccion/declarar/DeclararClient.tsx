'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import AppHeader from '@/components/ui/AppHeader'
import { Plus, Minus, Send, Trash2, FileText, Calendar, Clock, ChevronDown, ShoppingCart } from 'lucide-react'

// Catálogo real: sin botellas, un solo tamaño de barril (30L).
// Cerveza = Lata 500cc · Kombucha = Lata 355cc.
type Categoria = 'Cerveza' | 'Kombucha'
type FormatoTab = 'lata' | 'barril'

interface ProductoCatalogo {
  nombre: string
  categoria: Categoria
}

const VARIEDADES: ProductoCatalogo[] = [
  { nombre: 'Arboretum',               categoria: 'Cerveza' },
  { nombre: 'Mocho English',           categoria: 'Cerveza' },
  { nombre: 'La Barra APA',            categoria: 'Cerveza' },
  { nombre: 'Fisura',                  categoria: 'Cerveza' },
  { nombre: 'Descenso West Coast IPA', categoria: 'Cerveza' },
  { nombre: 'Aguas Blancas',           categoria: 'Cerveza' },
  { nombre: 'Nitro Coffee',            categoria: 'Cerveza' },
  { nombre: 'Kombucha Berry Menta',        categoria: 'Kombucha' },
  { nombre: 'Kombucha Lemon',              categoria: 'Kombucha' },
  { nombre: 'Kombucha Maqui',              categoria: 'Kombucha' },
  { nombre: 'Kombucha Maracuyá Cardamomo', categoria: 'Kombucha' },
  { nombre: 'Kombucha Detox',              categoria: 'Kombucha' },
  { nombre: 'Kombucha Natural',            categoria: 'Kombucha' },
  { nombre: 'Kombucha Mango',              categoria: 'Kombucha' },
]

const PRODUCTO_IMAGENES: Record<string, string> = {
  'Arboretum':                   '/productos/cerveza/arboretum.webp',
  'Mocho English':               '/productos/cerveza/mocho.webp',
  'La Barra APA':                '/productos/cerveza/la-barra.webp',
  'Fisura':                      '/productos/cerveza/fisura.webp',
  'Descenso West Coast IPA':     '/productos/cerveza/descenso.webp',
  'Aguas Blancas':               '/productos/cerveza/aguas-blancas.webp',
  'Kombucha Berry Menta':        '/productos/kombucha/berry-menta.webp',
  'Kombucha Detox':              '/productos/kombucha/detox.webp',
  'Kombucha Lemon':              '/productos/kombucha/lemon-fresh.webp',
  'Kombucha Mango':              '/productos/kombucha/mango-merken.webp',
  'Kombucha Maqui':              '/productos/kombucha/maqui-hops.webp',
  'Kombucha Maracuyá Cardamomo': '/productos/kombucha/maracuya-cardamomo.webp',
  'Kombucha Natural':            '/productos/kombucha/natural.webp',
}

function envaseDe(categoria: Categoria, tab: FormatoTab): string {
  if (tab === 'barril') return 'Barril 30L'
  return categoria === 'Cerveza' ? 'Lata 500cc' : 'Lata 355cc'
}

function cartKey(producto: string, envase: string) {
  return `${producto}|${envase}`
}

// Cada producto declarado lleva su propio código de lote — cada cerveza/kombucha
// se produce en un lote distinto, aunque se declaren juntas en el mismo envío.
interface ItemPedido {
  id: string
  producto: string
  envase: string
  cantidad_declarada: number
  codigo_lote: string
}

interface LoteRow {
  id: string
  eta_entrega: string
  estado: string
  observaciones: string | null
  items: { id: string; producto: string; envase: string; cantidad_declarada: number; codigo_lote: string }[]
}

const ORANGE = '#F97316'
const ORANGE_DIM = 'rgba(249,115,22,0.12)'
const ORANGE_BORDER = 'rgba(249,115,22,0.28)'

function ProductoThumb({ nombre, categoria, size = 44 }: { nombre: string; categoria: Categoria; size?: number }) {
  const src = PRODUCTO_IMAGENES[nombre]
  const [imgOk, setImgOk] = useState(!!src)
  const emoji = categoria === 'Kombucha' ? '🫧' : '🍺'

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

function CantidadInput({ value, onchange }: { value: number; onchange: (n: number) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const btnW = 36
  const numW = 34

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

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
      <button
        onClick={() => onchange(Math.max(0, value - 1))}
        style={{ width: btnW, height: btnW, borderRadius: 9, border: 'none', cursor: 'pointer', background: value > 0 ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.04)', color: 'var(--cream)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <Minus size={15} />
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
            width: numW + 12, height: btnW, textAlign: 'center', fontSize: 16, fontWeight: 900,
            background: ORANGE_DIM, border: `1px solid ${ORANGE}`, borderRadius: 9,
            color: ORANGE, outline: 'none', margin: '0 4px',
          }}
        />
      ) : (
        <span
          onClick={startEdit}
          style={{ width: numW + 8, height: btnW, textAlign: 'center', fontSize: 16, fontWeight: 900, color: value > 0 ? ORANGE : 'rgba(255,255,255,0.3)', cursor: 'text', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 9, border: `1px dashed ${value > 0 ? ORANGE : 'rgba(255,255,255,0.18)'}`, margin: '0 3px', flexShrink: 0 }}
          title="Toca para escribir cantidad"
        >
          {value}
        </span>
      )}

      <button
        onClick={() => onchange(value + 1)}
        style={{ width: btnW, height: btnW, borderRadius: 9, cursor: 'pointer', background: ORANGE_DIM, border: `1px solid ${ORANGE_BORDER}`, color: ORANGE, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <Plus size={15} />
      </button>
    </div>
  )
}

let nextId = 0
function newId() { nextId += 1; return `item-${Date.now()}-${nextId}` }

export default function DeclararClient() {
  const router = useRouter()
  const [lotes, setLotes] = useState<LoteRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [fecha, setFecha] = useState('')
  const [hora, setHora] = useState('')
  const [observaciones, setObservaciones] = useState('')

  const [categoria, setCategoria] = useState<Categoria>('Cerveza')
  const [formatoTab, setFormatoTab] = useState<FormatoTab>('lata')
  const [showCartDetail, setShowCartDetail] = useState(false)

  // ── Pedido: items ya confirmados con "Agregar" (van en el envío) ──
  const [carrito, setCarrito] = useState<ItemPedido[]>([])
  // ── Staging: cantidad y código de lote que se están eligiendo en cada card ──
  const [stagingCantidad, setStagingCantidad] = useState<Map<string, number>>(new Map())
  const [stagingLote, setStagingLote] = useState<Map<string, string>>(new Map())

  const dateRef = useRef<HTMLInputElement>(null)
  const timeRef = useRef<HTMLInputElement>(null)

  const load = useCallback(() => {
    setLoading(true)
    fetch('/api/logistica/lotes?estado=declarado')
      .then(r => r.json())
      .then(data => setLotes(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const envaseActual = envaseDe(categoria, formatoTab)
  const totalItems = carrito.reduce((s, it) => s + it.cantidad_declarada, 0)

  // ── Lotes pendientes agrupados por producto, para mostrarlos bajo cada card ──
  const lotesPorProducto = new Map<string, { lote: LoteRow; item: LoteRow['items'][0] }[]>()
  for (const lote of lotes) {
    for (const item of lote.items) {
      const lista = lotesPorProducto.get(item.producto) ?? []
      lista.push({ lote, item })
      lotesPorProducto.set(item.producto, lista)
    }
  }

  // Los productos con lotes pendientes de envío suben al principio de la lista,
  // para que no queden escondidos si están al final del catálogo.
  const variedadesFiltradas = VARIEDADES
    .filter(v => v.categoria === categoria)
    .slice()
    .sort((a, b) => {
      const pa = lotesPorProducto.get(a.nombre)?.length ?? 0
      const pb = lotesPorProducto.get(b.nombre)?.length ?? 0
      return pb - pa
    })

  function setCantidad(producto: string, envase: string, cantidad: number) {
    setStagingCantidad(prev => {
      const next = new Map(prev)
      const key = cartKey(producto, envase)
      if (cantidad <= 0) { next.delete(key); return next }
      next.set(key, cantidad)
      return next
    })
  }

  function setLoteTexto(producto: string, envase: string, texto: string) {
    setStagingLote(prev => {
      const next = new Map(prev)
      next.set(cartKey(producto, envase), texto)
      return next
    })
  }

  function agregarAlPedido(producto: string, envase: string) {
    const key = cartKey(producto, envase)
    const cantidad = stagingCantidad.get(key) ?? 0
    const codigoLote = (stagingLote.get(key) ?? '').trim()
    if (!cantidad || !codigoLote) return
    setCarrito(prev => [...prev, { id: newId(), producto, envase, cantidad_declarada: cantidad, codigo_lote: codigoLote }])
    // Reinicia el picker de esta card para cargar el siguiente lote desde cero
    setStagingCantidad(prev => { const next = new Map(prev); next.delete(key); return next })
    setStagingLote(prev => { const next = new Map(prev); next.delete(key); return next })
  }

  function quitarDelPedido(id: string) {
    setCarrito(prev => prev.filter(it => it.id !== id))
  }

  async function declarar() {
    if (!fecha || !carrito.length) return
    setSaving(true)
    try {
      const etaEntrega = new Date(`${fecha}T${hora || '09:00'}:00`).toISOString()
      const res = await fetch('/api/logistica/lotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eta_entrega: etaEntrega,
          observaciones: observaciones.trim() || undefined,
          items: carrito.map(({ producto, envase, cantidad_declarada, codigo_lote }) => ({ producto, envase, cantidad_declarada, codigo_lote })),
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        alert(err.error ?? 'Error al crear el envío')
        return
      }
      const nuevoLote = await res.json() as { id: string }
      setFecha(''); setHora(''); setObservaciones('')
      setCarrito([])
      setStagingCantidad(new Map())
      setStagingLote(new Map())
      setShowCartDetail(false)
      // Sigue a subir la guía de despacho — recién ahí el envío sale hacia Logística
      router.push(`/logistica/produccion/declarar/${nuevoLote.id}/guia`)
    } finally {
      setSaving(false)
    }
  }

  async function eliminarLote(loteId: string) {
    if (!confirm('¿Eliminar este envío? No se podrá deshacer.')) return
    const res = await fetch(`/api/logistica/lotes/${loteId}`, { method: 'DELETE' })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      alert(err.error ?? 'Error al eliminar el envío')
      return
    }
    load()
  }

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh' }}>
      <AppHeader eyebrow="Producción" title="Declarar Lote" backHref="/" />

      <div style={{ maxWidth: 640, margin: '0 auto', padding: '0 16px 100px' }}>

        {/* ── Datos del envío a bodega ── */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, padding: 18, marginBottom: 16 }}>
          <p style={{ fontSize: 14, fontWeight: 800, color: 'var(--cream)', marginBottom: 14 }}>Datos del envío a bodega</p>

          <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Fecha</label>
              <div style={{ position: 'relative' }} onClick={() => dateRef.current?.showPicker?.()}>
                <input
                  ref={dateRef}
                  type="date"
                  value={fecha}
                  onChange={e => setFecha(e.target.value)}
                  style={{ ...inputStyle, paddingRight: 34 }}
                />
                <Calendar size={15} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.35)', pointerEvents: 'none' }} />
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Hora (aprox.)</label>
              <div style={{ position: 'relative' }} onClick={() => timeRef.current?.showPicker?.()}>
                <input
                  ref={timeRef}
                  type="time"
                  value={hora}
                  onChange={e => setHora(e.target.value)}
                  style={{ ...inputStyle, paddingRight: 34 }}
                />
                <Clock size={15} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.35)', pointerEvents: 'none' }} />
              </div>
            </div>
          </div>

          <div>
            <label style={labelStyle}>Observaciones (opcional)</label>
            <input
              value={observaciones}
              onChange={e => setObservaciones(e.target.value)}
              placeholder="Notas para Logística..."
              style={inputStyle}
            />
          </div>
        </div>

        {/* ── Selector producto/formato + lista con steppers ── */}
        <p style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.22)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 8 }}>Producto</p>
        <div style={{ display: 'flex', background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 3, gap: 2, marginBottom: 16 }}>
          {(['Cerveza', 'Kombucha'] as const).map(c => (
            <button
              key={c}
              onClick={() => setCategoria(c)}
              style={{
                flex: 1, padding: '10px 0', borderRadius: 9, border: 'none', cursor: 'pointer',
                background: categoria === c ? ORANGE : 'transparent',
                color: categoria === c ? '#0A0A0A' : 'rgba(255,255,255,0.4)',
                fontSize: 13, fontWeight: 700,
              }}
            >
              {c}
            </button>
          ))}
        </div>

        <p style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.22)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 8 }}>Formato</p>
        <div style={{ display: 'flex', background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 3, gap: 2, marginBottom: 18 }}>
          {([
            { key: 'lata' as const,   label: categoria === 'Cerveza' ? 'Lata 500cc' : 'Lata 355cc' },
            { key: 'barril' as const, label: 'Barril 30L' },
          ]).map(opt => (
            <button
              key={opt.key}
              onClick={() => setFormatoTab(opt.key)}
              style={{
                flex: 1, padding: '10px 0', borderRadius: 9, border: 'none', cursor: 'pointer',
                background: formatoTab === opt.key ? ORANGE : 'transparent',
                color: formatoTab === opt.key ? '#0A0A0A' : 'rgba(255,255,255,0.4)',
                fontSize: 13, fontWeight: 700,
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
          {variedadesFiltradas.map(v => {
            const key = cartKey(v.nombre, envaseActual)
            const eligiendo = stagingCantidad.get(key) ?? 0
            const loteTexto = stagingLote.get(key) ?? ''
            const enEsteEnvio = carrito.filter(it => it.producto === v.nombre && it.envase === envaseActual)
            const pendientes = lotesPorProducto.get(v.nombre) ?? []
            const destacado = pendientes.length > 0 || enEsteEnvio.length > 0
            return (
              <div key={key} style={{
                background: pendientes.length > 0
                  ? 'linear-gradient(135deg, rgba(249,115,22,0.14) 0%, rgba(249,115,22,0.05) 100%)'
                  : destacado
                  ? 'linear-gradient(135deg, rgba(249,115,22,0.1) 0%, rgba(249,115,22,0.04) 100%)'
                  : 'rgba(255,255,255,0.025)',
                border: `1px solid ${destacado ? ORANGE_BORDER : 'rgba(255,255,255,0.055)'}`,
                borderRadius: 18, padding: '12px 14px',
                boxShadow: destacado ? '0 0 20px rgba(249,115,22,0.07)' : 'none',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ position: 'relative', flexShrink: 0 }}>
                    <ProductoThumb nombre={v.nombre} categoria={v.categoria} size={44} />
                    {pendientes.length > 0 && (
                      <span style={{
                        position: 'absolute', top: -4, right: -4, minWidth: 16, height: 16, borderRadius: 8,
                        background: ORANGE, color: '#0A0A0A', fontSize: 9, fontWeight: 900,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px',
                        border: '2px solid var(--bg)',
                      }}>
                        {pendientes.length}
                      </span>
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--cream)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {v.nombre.replace('Kombucha ', '')}
                    </p>
                    <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontWeight: 500 }}>
                      {envaseActual}
                    </p>
                    {pendientes.length > 0 && (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 4, padding: '2px 7px', borderRadius: 6,
                        background: ORANGE_DIM, color: ORANGE, fontSize: 10, fontWeight: 800,
                      }}>
                        <Send size={9} /> {pendientes.length} lote{pendientes.length === 1 ? '' : 's'} pendiente{pendientes.length === 1 ? '' : 's'} de envío
                      </span>
                    )}
                  </div>
                  <CantidadInput value={eligiendo} onchange={n => setCantidad(v.nombre, envaseActual, n)} />
                </div>

                {eligiendo > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <input
                      value={loteTexto}
                      onChange={e => setLoteTexto(v.nombre, envaseActual, e.target.value)}
                      placeholder="Código de lote de esta cerveza (ej: LP-2026-0714-01)"
                      style={{ ...inputStyle, padding: '9px 12px', fontSize: 12, marginBottom: 8 }}
                    />
                    <button
                      onClick={() => agregarAlPedido(v.nombre, envaseActual)}
                      disabled={!loteTexto.trim()}
                      style={{
                        width: '100%', padding: '9px 0', borderRadius: 10, border: 'none',
                        cursor: loteTexto.trim() ? 'pointer' : 'default',
                        background: `linear-gradient(135deg, ${ORANGE}, #C2410C)`, color: '#080808', fontSize: 12, fontWeight: 900,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                        opacity: loteTexto.trim() ? 1 : 0.4,
                      }}
                    >
                      <Plus size={14} /> Agregar {eligiendo} al pedido
                    </button>
                  </div>
                )}

                {enEsteEnvio.length > 0 && (
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <p style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: 0.6 }}>
                      En este envío
                    </p>
                    {enEsteEnvio.map(it => (
                      <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
                        <span style={{ flex: 1, color: ORANGE, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {it.codigo_lote} <span style={{ color: 'rgba(255,255,255,0.4)', fontWeight: 500 }}>× {it.cantidad_declarada}</span>
                        </span>
                        <button
                          onClick={() => quitarDelPedido(it.id)}
                          style={{ background: 'none', border: 'none', color: '#FF6666', cursor: 'pointer', padding: 2, flexShrink: 0, fontSize: 11, fontWeight: 700 }}
                        >
                          Quitar
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {pendientes.length > 0 && (
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <p style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: 0.6 }}>
                      Pendiente de envío
                    </p>
                    {pendientes.map(({ lote, item }) => (
                      <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
                        <span style={{ flex: 1, color: 'rgba(255,255,255,0.55)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {item.codigo_lote} <span style={{ color: 'rgba(255,255,255,0.3)' }}>· {item.envase} × {item.cantidad_declarada}</span>
                        </span>
                        <button
                          onClick={() => router.push(`/logistica/produccion/declarar/${lote.id}/guia`)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 4, padding: '5px 9px', borderRadius: 8, flexShrink: 0,
                            border: `1px solid ${ORANGE}55`, background: `${ORANGE}15`, color: ORANGE, fontSize: 10, fontWeight: 700, cursor: 'pointer',
                          }}
                        >
                          <FileText size={10} /> Subir guía y enviar
                        </button>
                        <button
                          onClick={() => eliminarLote(lote.id)}
                          style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 8, flexShrink: 0,
                            border: '1px solid rgba(255,102,102,0.35)', background: 'rgba(255,102,102,0.1)', color: '#FF6666', cursor: 'pointer',
                          }}
                          title="Eliminar envío"
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* ── Panel detalle carrito ── */}
        {showCartDetail && carrito.length > 0 && (
          <div style={{ background: '#131313', border: `1px solid ${ORANGE_BORDER}`, borderRadius: 14, overflow: 'hidden', marginBottom: 10 }}>
            {carrito.map((item, i) => (
              <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderBottom: i < carrito.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--cream)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.producto.replace('Kombucha ', '')} <span style={{ color: 'rgba(255,255,255,0.4)', fontWeight: 500 }}>· {item.envase} · {item.codigo_lote}</span>
                </span>
                <span style={{ fontSize: 13, fontWeight: 900, color: ORANGE, flexShrink: 0 }}>× {item.cantidad_declarada}</span>
                <button
                  onClick={() => quitarDelPedido(item.id)}
                  style={{ background: 'none', border: 'none', color: '#FF6666', cursor: 'pointer', padding: 2, flexShrink: 0, fontSize: 11, fontWeight: 700 }}
                >
                  Quitar
                </button>
              </div>
            ))}
          </div>
        )}

        {/* ── Barra de resumen + declarar ── */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
          {carrito.length > 0 && (
            <button
              onClick={() => setShowCartDetail(s => !s)}
              style={{
                width: 52, borderRadius: 14, border: `1px solid ${ORANGE_BORDER}`, background: showCartDetail ? ORANGE_DIM : 'rgba(255,255,255,0.04)',
                color: ORANGE, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0,
              }}
            >
              <ChevronDown size={20} style={{ transform: showCartDetail ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
            </button>
          )}
          <button
            onClick={declarar}
            disabled={saving || !carrito.length || !fecha}
            style={{
              flex: 1, padding: '15px 18px', borderRadius: 14, border: 'none',
              cursor: saving || !carrito.length || !fecha ? 'default' : 'pointer',
              background: carrito.length > 0 ? `linear-gradient(135deg, ${ORANGE}, #C2410C)` : 'rgba(255,255,255,0.06)',
              color: carrito.length > 0 ? '#080808' : 'rgba(255,255,255,0.35)',
              fontSize: 14, fontWeight: 900,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              opacity: saving ? 0.6 : 1,
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <ShoppingCart size={18} />
              {carrito.length > 0 ? `${totalItems} unidad${totalItems === 1 ? '' : 'es'} · ${carrito.length} lote${carrito.length === 1 ? '' : 's'}` : 'Sin productos'}
            </span>
            <span>{saving ? 'Creando…' : 'Crear envío →'}</span>
          </button>
        </div>

        {loading && (
          <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13, textAlign: 'center' }}>Cargando lotes pendientes…</p>
        )}
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)',
  background: 'var(--surface2)', color: 'var(--cream)', fontSize: 13, outline: 'none', colorScheme: 'dark',
}
const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 10, color: 'rgba(255,255,255,0.35)', marginBottom: 5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5,
}
