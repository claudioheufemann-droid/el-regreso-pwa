'use client'

import { useState, useEffect, useCallback } from 'react'
import AppHeader from '@/components/ui/AppHeader'
import { Plus, Trash2, Send, Package } from 'lucide-react'

// Catálogo real: sin botellas. Kombucha = lata 355ml, cerveza = lata 500ml.
// Nitro Coffee solo se vende en barril (no existe en lata).
interface ProductoCatalogo {
  nombre: string
  categoria: 'Cerveza' | 'Kombucha' | 'Café'
  formatos: string[]
}

const CATALOGO: ProductoCatalogo[] = [
  { nombre: 'Nitro Coffee',             categoria: 'Café',     formatos: ['Barril 20L', 'Barril 50L'] },
  { nombre: 'Arboretum',                categoria: 'Cerveza',  formatos: ['Lata 500ml', 'Barril 20L', 'Barril 50L'] },
  { nombre: 'Mocho English',            categoria: 'Cerveza',  formatos: ['Lata 500ml', 'Barril 20L', 'Barril 50L'] },
  { nombre: 'La Barra APA',             categoria: 'Cerveza',  formatos: ['Lata 500ml', 'Barril 20L', 'Barril 50L'] },
  { nombre: 'Fisura',                   categoria: 'Cerveza',  formatos: ['Lata 500ml', 'Barril 20L', 'Barril 50L'] },
  { nombre: 'Descenso West Coast IPA',  categoria: 'Cerveza',  formatos: ['Lata 500ml', 'Barril 20L', 'Barril 50L'] },
  { nombre: 'Aguas Blancas',            categoria: 'Cerveza',  formatos: ['Lata 500ml', 'Barril 20L', 'Barril 50L'] },
  { nombre: 'Kombucha Berry Menta',            categoria: 'Kombucha', formatos: ['Lata 355ml', 'Barril 20L', 'Barril 50L'] },
  { nombre: 'Kombucha Lemon',                  categoria: 'Kombucha', formatos: ['Lata 355ml', 'Barril 20L', 'Barril 50L'] },
  { nombre: 'Kombucha Maqui',                  categoria: 'Kombucha', formatos: ['Lata 355ml', 'Barril 20L', 'Barril 50L'] },
  { nombre: 'Kombucha Maracuyá Cardamomo',     categoria: 'Kombucha', formatos: ['Lata 355ml', 'Barril 20L', 'Barril 50L'] },
  { nombre: 'Kombucha Detox',                  categoria: 'Kombucha', formatos: ['Lata 355ml', 'Barril 20L', 'Barril 50L'] },
  { nombre: 'Kombucha Natural',                categoria: 'Kombucha', formatos: ['Lata 355ml', 'Barril 20L', 'Barril 50L'] },
  { nombre: 'Kombucha Mango',                  categoria: 'Kombucha', formatos: ['Lata 355ml', 'Barril 20L', 'Barril 50L'] },
]

function catalogoDe(nombre: string): ProductoCatalogo {
  return CATALOGO.find(p => p.nombre === nombre) ?? CATALOGO[0]
}

interface ItemForm {
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

function itemInicial(): ItemForm {
  const primero = CATALOGO[0]
  return { producto: primero.nombre, envase: primero.formatos[0], cantidad_declarada: 1 }
}

export default function DeclararClient() {
  const [lotes, setLotes] = useState<LoteRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [codigoLote, setCodigoLote] = useState('')
  const [etaEntrega, setEtaEntrega] = useState('')
  const [observaciones, setObservaciones] = useState('')
  const [items, setItems] = useState<ItemForm[]>([itemInicial()])

  const load = useCallback(() => {
    setLoading(true)
    fetch('/api/logistica/lotes?estado=declarado')
      .then(r => r.json())
      .then(data => setLotes(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  function addItem() {
    setItems(prev => [...prev, itemInicial()])
  }
  function removeItem(i: number) {
    setItems(prev => prev.filter((_, idx) => idx !== i))
  }
  function updateItem(i: number, patch: Partial<ItemForm>) {
    setItems(prev => prev.map((it, idx) => idx === i ? { ...it, ...patch } : it))
  }
  function cambiarProducto(i: number, nombre: string) {
    const cat = catalogoDe(nombre)
    updateItem(i, { producto: nombre, envase: cat.formatos[0] })
  }

  async function declarar() {
    if (!codigoLote.trim() || !etaEntrega || !items.length) return
    setSaving(true)
    try {
      const res = await fetch('/api/logistica/lotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          codigo_lote: codigoLote.trim(),
          eta_entrega: new Date(etaEntrega).toISOString(),
          observaciones: observaciones.trim() || undefined,
          items,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        alert(err.error ?? 'Error al declarar el lote')
        return
      }
      setCodigoLote(''); setEtaEntrega(''); setObservaciones('')
      setItems([itemInicial()])
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

          <div style={{ marginBottom: 10 }}>
            <label style={labelStyle}>ETA a bodega de Logística (obligatorio)</label>
            <input
              type="datetime-local"
              value={etaEntrega}
              onChange={e => setEtaEntrega(e.target.value)}
              style={inputStyle}
            />
          </div>

          <div style={{ marginBottom: 18 }}>
            <label style={labelStyle}>Observaciones (opcional)</label>
            <input
              value={observaciones}
              onChange={e => setObservaciones(e.target.value)}
              placeholder="Notas para Logística..."
              style={inputStyle}
            />
          </div>

          <p style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10 }}>
            Items del lote
          </p>

          {items.map((it, i) => {
            const cat = catalogoDe(it.producto)
            return (
              <div key={i} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: 14, padding: 12, marginBottom: 10 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
                  <select value={it.producto} onChange={e => cambiarProducto(i, e.target.value)} style={{ ...inputStyle, flex: 1 }}>
                    <optgroup label="Cerveza">
                      {CATALOGO.filter(p => p.categoria === 'Cerveza').map(p => (
                        <option key={p.nombre} value={p.nombre} style={optionStyle}>{p.nombre}</option>
                      ))}
                    </optgroup>
                    <optgroup label="Kombucha">
                      {CATALOGO.filter(p => p.categoria === 'Kombucha').map(p => (
                        <option key={p.nombre} value={p.nombre} style={optionStyle}>{p.nombre}</option>
                      ))}
                    </optgroup>
                    <optgroup label="Café">
                      {CATALOGO.filter(p => p.categoria === 'Café').map(p => (
                        <option key={p.nombre} value={p.nombre} style={optionStyle}>{p.nombre}</option>
                      ))}
                    </optgroup>
                  </select>
                  <input
                    type="number" min={1} value={it.cantidad_declarada}
                    onChange={e => updateItem(i, { cantidad_declarada: Math.max(1, parseInt(e.target.value) || 1) })}
                    style={{ ...inputStyle, width: 64, flexShrink: 0, textAlign: 'center' }}
                  />
                  {items.length > 1 && (
                    <button onClick={() => removeItem(i)} style={{ background: 'none', border: 'none', color: '#FF6666', cursor: 'pointer', padding: 6, flexShrink: 0 }}>
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>

                {/* Formato: pastillas, no <select> — solo muestra las opciones válidas para el producto elegido */}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {cat.formatos.map(f => (
                    <button
                      key={f}
                      onClick={() => updateItem(i, { envase: f })}
                      style={{
                        padding: '7px 12px', borderRadius: 9, cursor: 'pointer', fontSize: 12, fontWeight: 700,
                        border: `1px solid ${it.envase === f ? ORANGE : 'var(--border)'}`,
                        background: it.envase === f ? `${ORANGE}18` : 'transparent',
                        color: it.envase === f ? ORANGE : 'rgba(255,255,255,0.5)',
                      }}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>
            )
          })}

          <button onClick={addItem} style={{
            display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: '1px dashed var(--border)',
            borderRadius: 10, padding: '8px 12px', color: 'rgba(255,255,255,0.5)', fontSize: 12, cursor: 'pointer', marginBottom: 16,
          }}>
            <Plus size={14} /> Agregar producto
          </button>

          <button
            onClick={declarar}
            disabled={saving}
            style={{
              width: '100%', padding: '13px 0', borderRadius: 13, border: 'none', cursor: 'pointer',
              background: `linear-gradient(135deg, ${ORANGE}, #C2410C)`, color: '#080808', fontSize: 14, fontWeight: 900,
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? 'Declarando…' : 'Declarar lote'}
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
// Los <option>/<optgroup> nativos suelen ignorar el tema oscuro del padre y renderizan
// con fondo claro del sistema — se fuerza texto oscuro para que sean legibles en ese caso.
const optionStyle: React.CSSProperties = { color: '#111827', background: '#FFFFFF' }
const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 10, color: 'rgba(255,255,255,0.35)', marginBottom: 5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5,
}
