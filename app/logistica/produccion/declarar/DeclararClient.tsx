'use client'

import { useState, useEffect, useCallback } from 'react'
import AppHeader from '@/components/ui/AppHeader'
import { Plus, Trash2, Send, Package } from 'lucide-react'

const PRODUCTOS = [
  'Nitro Coffee', 'Arboretum', 'Mocho English', 'La Barra APA', 'Fisura',
  'Descenso West Coast IPA', 'Aguas Blancas',
  'Kombucha Berry Menta', 'Kombucha Lemon', 'Kombucha Maqui',
  'Kombucha Maracuyá Cardamomo', 'Kombucha Detox', 'Kombucha Natural', 'Kombucha Mango',
]
const ENVASES = ['Lata 350ml', 'Lata 500ml', 'Botella 330ml', 'Barril 20L', 'Barril 50L']

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

export default function DeclararClient() {
  const [lotes, setLotes] = useState<LoteRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [codigoLote, setCodigoLote] = useState('')
  const [etaEntrega, setEtaEntrega] = useState('')
  const [observaciones, setObservaciones] = useState('')
  const [items, setItems] = useState<ItemForm[]>([{ producto: PRODUCTOS[0], envase: ENVASES[0], cantidad_declarada: 1 }])

  const load = useCallback(() => {
    setLoading(true)
    fetch('/api/logistica/lotes?estado=declarado')
      .then(r => r.json())
      .then(data => setLotes(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  function addItem() {
    setItems(prev => [...prev, { producto: PRODUCTOS[0], envase: ENVASES[0], cantidad_declarada: 1 }])
  }
  function removeItem(i: number) {
    setItems(prev => prev.filter((_, idx) => idx !== i))
  }
  function updateItem(i: number, patch: Partial<ItemForm>) {
    setItems(prev => prev.map((it, idx) => idx === i ? { ...it, ...patch } : it))
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
      setItems([{ producto: PRODUCTOS[0], envase: ENVASES[0], cantidad_declarada: 1 }])
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

          <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
            <input
              value={codigoLote}
              onChange={e => setCodigoLote(e.target.value)}
              placeholder="Código de lote (ej: LP-2026-0714-01)"
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

          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Observaciones (opcional)</label>
            <input
              value={observaciones}
              onChange={e => setObservaciones(e.target.value)}
              placeholder="Notas para Logística..."
              style={inputStyle}
            />
          </div>

          <p style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>
            Items del lote
          </p>

          {items.map((it, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
              <select value={it.producto} onChange={e => updateItem(i, { producto: e.target.value })} style={{ ...inputStyle, flex: 2 }}>
                {PRODUCTOS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <select value={it.envase} onChange={e => updateItem(i, { envase: e.target.value })} style={{ ...inputStyle, flex: 1 }}>
                {ENVASES.map(e => <option key={e} value={e}>{e}</option>)}
              </select>
              <input
                type="number" min={1} value={it.cantidad_declarada}
                onChange={e => updateItem(i, { cantidad_declarada: Math.max(1, parseInt(e.target.value) || 1) })}
                style={{ ...inputStyle, flex: 1, textAlign: 'center' }}
              />
              {items.length > 1 && (
                <button onClick={() => removeItem(i)} style={{ background: 'none', border: 'none', color: '#FF6666', cursor: 'pointer', padding: 8, flexShrink: 0 }}>
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          ))}

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
const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 10, color: 'rgba(255,255,255,0.35)', marginBottom: 5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5,
}
