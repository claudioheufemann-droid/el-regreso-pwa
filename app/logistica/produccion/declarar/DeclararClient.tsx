'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import AppHeader from '@/components/ui/AppHeader'
import { Plus, Minus, Send, Package, Calendar, Clock, ChevronDown, ShoppingCart } from 'lucide-react'

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

interface ItemPedido {
  producto: string
  envase: string
  cantidad_declarada: number
}

interface LoteRow {
  id: string
  codigo_lote: string
  eta_entrega: string
  estado: string
  observaciones: string | null
  items: { id: string; producto: string; envase: string; cantidad_declarada: number }[]
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

export default function DeclararClient() {
  const [lotes, setLotes] = useState<LoteRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [codigoLote, setCodigoLote] = useState('')
  const [fecha, setFecha] = useState('')
  const [hora, setHora] = useState('')
  const [observaciones, setObservaciones] = useState('')

  const [categoria, setCategoria] = useState<Categoria>('Cerveza')
  const [formatoTab, setFormatoTab] = useState<FormatoTab>('lata')
  const [showCartDetail, setShowCartDetail] = useState(false)

  // ── Carrito: items ya confirmados con "Agregar" (van en el lote) ──
  const [carrito, setCarrito] = useState<Map<string, ItemPedido>>(new Map())
  // ── Staging: cantidad que se está eligiendo en cada card, antes de confirmar ──
  const [staging, setStaging] = useState<Map<string, number>>(new Map())

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
  const variedadesFiltradas = VARIEDADES.filter(v => v.categoria === categoria)
  const items = Array.from(carrito.values())
  const totalItems = items.reduce((s, it) => s + it.cantidad_declarada, 0)

  function setStagingCantidad(producto: string, envase: string, cantidad: number) {
    setStaging(prev => {
      const next = new Map(prev)
      const key = cartKey(producto, envase)
      if (cantidad <= 0) { next.delete(key); return next }
      next.set(key, cantidad)
      return next
    })
  }

  function agregarAlPedido(producto: string, envase: string) {
    const key = cartKey(producto, envase)
    const cantidad = staging.get(key) ?? 0
    if (!cantidad) return
    setCarrito(prev => {
      const next = new Map(prev)
      const existente = next.get(key)
      next.set(key, { producto, envase, cantidad_declarada: (existente?.cantidad_declarada ?? 0) + cantidad })
      return next
    })
    // Reinicia el picker de esta card para elegir la siguiente cantidad desde cero
    setStaging(prev => {
      const next = new Map(prev)
      next.delete(key)
      return next
    })
  }

  function quitarDelPedido(producto: string, envase: string) {
    setCarrito(prev => {
      const next = new Map(prev)
      next.delete(cartKey(producto, envase))
      return next
    })
  }

  async function declarar() {
    if (!codigoLote.trim() || !fecha || !items.length) return
    setSaving(true)
    try {
      const etaEntrega = new Date(`${fecha}T${hora || '09:00'}:00`).toISOString()
      const res = await fetch('/api/logistica/lotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          codigo_lote: codigoLote.trim(),
          eta_entrega: etaEntrega,
          observaciones: observaciones.trim() || undefined,
          items,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        alert(err.error ?? 'Error al declarar el lote')
        return
      }
      setCodigoLote(''); setFecha(''); setHora(''); setObservaciones('')
      setCarrito(new Map())
      setStaging(new Map())
      setShowCartDetail(false)
      load()
    } finally {
      setSaving(false)
    }
  }

  async function marcarEnviado(loteId: string) {
    if (!confirm('¿Confirmas que el lote salió físicamente hacia bodega de Logística?')) return
    const res = await fetch(`/api/logistica/lotes/${loteId}/enviar`, { method: 'POST' })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      alert(err.error ?? 'Error al marcar enviado')
      return
    }
    load()
  }

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh' }}>
      <AppHeader eyebrow="Producción" title="Declarar Lote" backHref="/" />

      <div style={{ maxWidth: 640, margin: '0 auto', padding: '0 16px 100px' }}>

        {/* ── Datos del lote ── */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, padding: 18, marginBottom: 16 }}>
          <p style={{ fontSize: 14, fontWeight: 800, color: 'var(--cream)', marginBottom: 14 }}>Datos del lote</p>

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
            const enPedido = carrito.get(key)?.cantidad_declarada ?? 0
            const eligiendo = staging.get(key) ?? 0
            return (
              <div key={key} style={{
                background: enPedido > 0
                  ? 'linear-gradient(135deg, rgba(249,115,22,0.1) 0%, rgba(249,115,22,0.04) 100%)'
                  : 'rgba(255,255,255,0.025)',
                border: `1px solid ${enPedido > 0 ? ORANGE_BORDER : 'rgba(255,255,255,0.055)'}`,
                borderRadius: 18, padding: '12px 14px',
                boxShadow: enPedido > 0 ? '0 0 20px rgba(249,115,22,0.07)' : 'none',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <ProductoThumb nombre={v.nombre} categoria={v.categoria} size={44} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--cream)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {v.nombre.replace('Kombucha ', '')}
                    </p>
                    <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontWeight: 500 }}>
                      {envaseActual}
                      {enPedido > 0 && <span style={{ color: ORANGE, fontWeight: 700 }}> · {enPedido} en el pedido</span>}
                    </p>
                  </div>
                  <CantidadInput value={eligiendo} onchange={n => setStagingCantidad(v.nombre, envaseActual, n)} />
                </div>
                {eligiendo > 0 && (
                  <button
                    onClick={() => agregarAlPedido(v.nombre, envaseActual)}
                    style={{
                      width: '100%', marginTop: 10, padding: '9px 0', borderRadius: 10, border: 'none', cursor: 'pointer',
                      background: `linear-gradient(135deg, ${ORANGE}, #C2410C)`, color: '#080808', fontSize: 12, fontWeight: 900,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    }}
                  >
                    <Plus size={14} /> Agregar {eligiendo} al pedido
                  </button>
                )}
              </div>
            )
          })}
        </div>

        {/* ── Panel detalle carrito ── */}
        {showCartDetail && items.length > 0 && (
          <div style={{ background: '#131313', border: `1px solid ${ORANGE_BORDER}`, borderRadius: 14, overflow: 'hidden', marginBottom: 10 }}>
            {items.map((item, i) => (
              <div key={`${item.producto}|${item.envase}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderBottom: i < items.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--cream)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.producto.replace('Kombucha ', '')} <span style={{ color: 'rgba(255,255,255,0.4)', fontWeight: 500 }}>· {item.envase}</span>
                </span>
                <span style={{ fontSize: 13, fontWeight: 900, color: ORANGE, flexShrink: 0 }}>× {item.cantidad_declarada}</span>
                <button
                  onClick={() => quitarDelPedido(item.producto, item.envase)}
                  style={{ background: 'none', border: 'none', color: '#FF6666', cursor: 'pointer', padding: 2, flexShrink: 0, fontSize: 11, fontWeight: 700 }}
                >
                  Quitar
                </button>
              </div>
            ))}
          </div>
        )}

        {/* ── Código de lote: se completa al final, justo antes de enviar ── */}
        {items.length > 0 && (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 14, marginBottom: 10 }}>
            <label style={labelStyle}>Código de lote</label>
            <input
              value={codigoLote}
              onChange={e => setCodigoLote(e.target.value)}
              placeholder="Ej: LP-2026-0714-01"
              style={inputStyle}
            />
          </div>
        )}

        {/* ── Barra de resumen + declarar ── */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
          {items.length > 0 && (
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
            disabled={saving || !items.length || !codigoLote.trim() || !fecha}
            style={{
              flex: 1, padding: '15px 18px', borderRadius: 14, border: 'none',
              cursor: saving || !items.length || !codigoLote.trim() || !fecha ? 'default' : 'pointer',
              background: items.length > 0 ? `linear-gradient(135deg, ${ORANGE}, #C2410C)` : 'rgba(255,255,255,0.06)',
              color: items.length > 0 ? '#080808' : 'rgba(255,255,255,0.35)',
              fontSize: 14, fontWeight: 900,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              opacity: saving ? 0.6 : 1,
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <ShoppingCart size={18} />
              {items.length > 0 ? `${totalItems} unidad${totalItems === 1 ? '' : 'es'} · ${items.length} producto${items.length === 1 ? '' : 's'}` : 'Sin productos'}
            </span>
            <span>{saving ? 'Declarando…' : 'Declarar →'}</span>
          </button>
        </div>

        {/* ── Lotes declarados pendientes de envío ── */}
        <p style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10 }}>
          Pendientes de envío
        </p>

        {loading ? (
          <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>Cargando…</p>
        ) : lotes.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'rgba(255,255,255,0.3)' }}>
            <Package size={28} style={{ marginBottom: 8, opacity: 0.4 }} />
            <p style={{ fontSize: 13 }}>No hay lotes declarados pendientes de envío.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {lotes.map(l => (
              <div key={l.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <div>
                    <p style={{ fontSize: 14, fontWeight: 800, color: 'var(--cream)' }}>{l.codigo_lote}</p>
                    <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
                      ETA {new Date(l.eta_entrega).toLocaleString('es-CL')}
                    </p>
                  </div>
                  <button
                    onClick={() => marcarEnviado(l.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 10,
                      border: `1px solid ${ORANGE}55`, background: `${ORANGE}15`, color: ORANGE, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                    }}
                  >
                    <Send size={12} /> Marcar enviado
                  </button>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {l.items.map(it => (
                    <span key={it.id} style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '4px 8px' }}>
                      {it.producto} · {it.envase} × {it.cantidad_declarada}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
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
