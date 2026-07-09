'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import AppHeader from '@/components/ui/AppHeader'
import { Plus, Trash2, Send, Package, Calendar, Clock } from 'lucide-react'

// Catálogo real: sin botellas, un solo tamaño de barril (30L).
// Cerveza = Lata 500cc · Kombucha = Lata 355cc · Nitro Coffee solo existe en barril.
type Categoria = 'Cerveza' | 'Kombucha' | 'Café'

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
  { nombre: 'Kombucha Berry Menta',        categoria: 'Kombucha' },
  { nombre: 'Kombucha Lemon',              categoria: 'Kombucha' },
  { nombre: 'Kombucha Maqui',              categoria: 'Kombucha' },
  { nombre: 'Kombucha Maracuyá Cardamomo', categoria: 'Kombucha' },
  { nombre: 'Kombucha Detox',              categoria: 'Kombucha' },
  { nombre: 'Kombucha Natural',            categoria: 'Kombucha' },
  { nombre: 'Kombucha Mango',              categoria: 'Kombucha' },
  { nombre: 'Nitro Coffee',            categoria: 'Café' },
]

const CATEGORIAS: Categoria[] = ['Cerveza', 'Kombucha', 'Café']

// Formatos válidos por categoría — un solo tamaño de barril (30L). Nitro Coffee no existe en lata.
function formatosDe(categoria: Categoria): string[] {
  if (categoria === 'Cerveza') return ['Lata 500cc', 'Barril 30L']
  if (categoria === 'Kombucha') return ['Lata 355cc', 'Barril 30L']
  return ['Barril 30L']
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

export default function DeclararClient() {
  const [lotes, setLotes] = useState<LoteRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [codigoLote, setCodigoLote] = useState('')
  const [fecha, setFecha] = useState('')
  const [hora, setHora] = useState('')
  const [observaciones, setObservaciones] = useState('')

  // ── Selector del próximo item a agregar (no es un item ya confirmado) ──
  const [categoria, setCategoria] = useState<Categoria>('Cerveza')
  const [producto, setProducto] = useState<string>(VARIEDADES[0].nombre)
  const [envase, setEnvase] = useState<string>(formatosDe('Cerveza')[0])
  const [cantidadTexto, setCantidadTexto] = useState('')
  const cantidadInputRef = useRef<HTMLInputElement>(null)

  // ── El pedido: varias variedades/formatos en un solo envío ──
  const [pedido, setPedido] = useState<ItemPedido[]>([])

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

  function cambiarCategoria(c: Categoria) {
    setCategoria(c)
    const primeraVariedad = VARIEDADES.find(v => v.categoria === c)!
    setProducto(primeraVariedad.nombre)
    setEnvase(formatosDe(c)[0])
  }

  function agregarAlPedido() {
    const cantidad = Math.max(1, parseInt(cantidadTexto) || 0)
    if (!cantidad) return
    setPedido(prev => {
      // Si ya existe el mismo producto+envase, suma cantidades en vez de duplicar la línea
      const idx = prev.findIndex(it => it.producto === producto && it.envase === envase)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = { ...next[idx], cantidad_declarada: next[idx].cantidad_declarada + cantidad }
        return next
      }
      return [...prev, { producto, envase, cantidad_declarada: cantidad }]
    })
    setCantidadTexto('')
    cantidadInputRef.current?.focus()
  }

  function quitarDelPedido(i: number) {
    setPedido(prev => prev.filter((_, idx) => idx !== i))
  }

  async function declarar() {
    if (!codigoLote.trim() || !fecha || !pedido.length) return
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
          items: pedido,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        alert(err.error ?? 'Error al declarar el lote')
        return
      }
      setCodigoLote(''); setFecha(''); setHora(''); setObservaciones('')
      setPedido([])
      setCantidadTexto('')
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

        {/* ── Formulario de declaración ── */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, padding: 18, marginBottom: 24 }}>
          <p style={{ fontSize: 14, fontWeight: 800, color: 'var(--cream)', marginBottom: 14 }}>Nueva declaración</p>

          <div style={{ marginBottom: 10 }}>
            <label style={labelStyle}>Código de lote</label>
            <input
              value={codigoLote}
              onChange={e => setCodigoLote(e.target.value)}
              placeholder="Ej: LP-2026-0714-01"
              style={inputStyle}
            />
          </div>

          <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
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

          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>Observaciones (opcional)</label>
            <input
              value={observaciones}
              onChange={e => setObservaciones(e.target.value)}
              placeholder="Notas para Logística..."
              style={inputStyle}
            />
          </div>

          {/* ── Selector: arma el próximo item del pedido ── */}
          <p style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10 }}>
            Agregar producto al pedido
          </p>

          <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: 14, padding: 12, marginBottom: 14 }}>
            {/* Categoría */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
              {CATEGORIAS.map(c => (
                <button
                  key={c}
                  onClick={() => cambiarCategoria(c)}
                  style={{
                    flex: 1, padding: '8px 0', borderRadius: 9, cursor: 'pointer', fontSize: 12, fontWeight: 800,
                    border: `1px solid ${categoria === c ? ORANGE : 'var(--border)'}`,
                    background: categoria === c ? `${ORANGE}18` : 'transparent',
                    color: categoria === c ? ORANGE : 'rgba(255,255,255,0.5)',
                  }}
                >
                  {c}
                </button>
              ))}
            </div>

            {/* Variedad */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
              {VARIEDADES.filter(v => v.categoria === categoria).map(v => (
                <button
                  key={v.nombre}
                  onClick={() => setProducto(v.nombre)}
                  style={{
                    padding: '7px 11px', borderRadius: 9, cursor: 'pointer', fontSize: 12, fontWeight: 600,
                    border: `1px solid ${producto === v.nombre ? ORANGE : 'var(--border)'}`,
                    background: producto === v.nombre ? `${ORANGE}18` : 'transparent',
                    color: producto === v.nombre ? ORANGE : 'rgba(255,255,255,0.55)',
                  }}
                >
                  {v.nombre.replace('Kombucha ', '')}
                </button>
              ))}
            </div>

            {/* Formato + cantidad + agregar */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              {formatosDe(categoria).map(f => (
                <button
                  key={f}
                  onClick={() => setEnvase(f)}
                  style={{
                    padding: '7px 12px', borderRadius: 9, cursor: 'pointer', fontSize: 12, fontWeight: 700,
                    border: `1px solid ${envase === f ? ORANGE : 'var(--border)'}`,
                    background: envase === f ? `${ORANGE}18` : 'transparent',
                    color: envase === f ? ORANGE : 'rgba(255,255,255,0.5)',
                  }}
                >
                  {f}
                </button>
              ))}
              <input
                ref={cantidadInputRef}
                type="number" min={1} inputMode="numeric" placeholder="Cant."
                value={cantidadTexto}
                onFocus={e => e.target.select()}
                onChange={e => setCantidadTexto(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') agregarAlPedido() }}
                style={{ ...inputStyle, width: 64, padding: '7px 8px', textAlign: 'center' }}
              />
              <button
                onClick={agregarAlPedido}
                disabled={!cantidadTexto}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5, padding: '8px 14px', borderRadius: 9, cursor: cantidadTexto ? 'pointer' : 'default',
                  border: 'none', background: `linear-gradient(135deg, ${ORANGE}, #C2410C)`, color: '#080808', fontSize: 12, fontWeight: 900,
                  opacity: cantidadTexto ? 1 : 0.4,
                }}
              >
                <Plus size={13} /> Agregar
              </button>
            </div>
          </div>

          {/* ── Resumen del pedido: todo lo que va en este mismo envío ── */}
          <p style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>
            Resumen del pedido {pedido.length > 0 && `(${pedido.length})`}
          </p>

          {pedido.length === 0 ? (
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginBottom: 16 }}>
              Todavía no agregaste ningún producto.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
              {pedido.map((it, i) => (
                <div key={`${it.producto}-${it.envase}`} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 10,
                  background: 'rgba(249,115,22,0.06)', border: '1px solid rgba(249,115,22,0.2)',
                }}>
                  <span style={{ flex: 1, fontSize: 12, fontWeight: 700, color: 'var(--cream)' }}>
                    {it.producto.replace('Kombucha ', '')} <span style={{ color: 'rgba(255,255,255,0.4)', fontWeight: 500 }}>· {it.envase}</span>
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 900, color: ORANGE }}>× {it.cantidad_declarada}</span>
                  <button onClick={() => quitarDelPedido(i)} style={{ background: 'none', border: 'none', color: '#FF6666', cursor: 'pointer', padding: 4, flexShrink: 0 }}>
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <button
            onClick={declarar}
            disabled={saving || !pedido.length || !codigoLote.trim() || !fecha}
            style={{
              width: '100%', padding: '13px 0', borderRadius: 13, border: 'none', cursor: 'pointer',
              background: `linear-gradient(135deg, ${ORANGE}, #C2410C)`, color: '#080808', fontSize: 14, fontWeight: 900,
              opacity: saving || !pedido.length || !codigoLote.trim() || !fecha ? 0.4 : 1,
            }}
          >
            {saving ? 'Declarando…' : `Declarar lote (${pedido.length} producto${pedido.length === 1 ? '' : 's'})`}
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
