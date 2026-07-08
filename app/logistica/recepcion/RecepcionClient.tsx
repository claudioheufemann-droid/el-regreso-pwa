'use client'

import { useState, useEffect, useCallback } from 'react'
import AppHeader from '@/components/ui/AppHeader'
import { PackageCheck, Inbox } from 'lucide-react'

interface LoteItem {
  id: string
  producto: string
  envase: string
  cantidad_declarada: number
}
interface LoteRow {
  id: string
  codigo_lote: string
  eta_entrega: string
  estado: string
  enviado_at: string | null
  items: LoteItem[]
}

const ORANGE = '#F97316'

export default function RecepcionClient() {
  const [lotes, setLotes] = useState<LoteRow[]>([])
  const [loading, setLoading] = useState(true)
  const [abierto, setAbierto] = useState<string | null>(null)
  const [cantidades, setCantidades] = useState<Record<string, number>>({})
  const [saving, setSaving] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    fetch('/api/logistica/lotes?estado=enviado')
      .then(r => r.json())
      .then(data => setLotes(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  function abrir(lote: LoteRow) {
    setAbierto(lote.id)
    const init: Record<string, number> = {}
    lote.items.forEach(it => { init[it.id] = it.cantidad_declarada })
    setCantidades(init)
  }

  async function confirmar(loteId: string) {
    setSaving(true)
    try {
      const items = Object.entries(cantidades).map(([item_id, cantidad_recibida]) => ({ item_id, cantidad_recibida }))
      const res = await fetch(`/api/logistica/lotes/${loteId}/recepcion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      })
      const data = await res.json()
      if (!res.ok) { alert(data.error ?? 'Error al confirmar recepción'); return }

      if (data.estado === 'con_discrepancia') {
        alert('⚠️ Se registró la recepción, pero hay diferencias con lo declarado. Se generó una alerta en /logistica/alertas.')
      }
      setAbierto(null)
      load()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh' }}>
      <AppHeader eyebrow="Logística" title="Recepción en Bodega" backHref="/" />

      <div style={{ maxWidth: 640, margin: '0 auto', padding: '0 16px 100px' }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10 }}>
          Lotes en camino
        </p>

        {loading ? (
          <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>Cargando…</p>
        ) : lotes.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'rgba(255,255,255,0.3)' }}>
            <Inbox size={28} style={{ marginBottom: 8, opacity: 0.4 }} />
            <p style={{ fontSize: 13 }}>No hay lotes esperando check-in.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {lotes.map(l => (
              <div key={l.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: abierto === l.id ? 14 : 0 }}>
                  <div>
                    <p style={{ fontSize: 14, fontWeight: 800, color: 'var(--cream)' }}>{l.codigo_lote}</p>
                    <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
                      ETA {new Date(l.eta_entrega).toLocaleString('es-CL')}
                    </p>
                  </div>
                  {abierto !== l.id && (
                    <button
                      onClick={() => abrir(l)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 10,
                        border: `1px solid ${ORANGE}55`, background: `${ORANGE}15`, color: ORANGE, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                      }}
                    >
                      <PackageCheck size={12} /> Confirmar recepción
                    </button>
                  )}
                </div>

                {abierto === l.id && (
                  <div>
                    <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginBottom: 8 }}>
                      Ingresa lo que realmente llegó a bodega — se compara automáticamente con lo declarado.
                    </p>
                    {l.items.map(it => (
                      <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                        <span style={{ flex: 1, fontSize: 12, color: 'var(--cream)' }}>
                          {it.producto} · {it.envase}
                          <span style={{ color: 'rgba(255,255,255,0.35)' }}> (declarado: {it.cantidad_declarada})</span>
                        </span>
                        <input
                          type="number" min={0}
                          value={cantidades[it.id] ?? it.cantidad_declarada}
                          onChange={e => setCantidades(prev => ({ ...prev, [it.id]: Math.max(0, parseInt(e.target.value) || 0) }))}
                          style={{
                            width: 72, padding: '8px 10px', borderRadius: 9, textAlign: 'center',
                            border: `1px solid ${(cantidades[it.id] ?? it.cantidad_declarada) !== it.cantidad_declarada ? '#FF6666' : 'var(--border)'}`,
                            background: 'rgba(255,255,255,0.03)', color: 'var(--cream)', fontSize: 13, outline: 'none',
                          }}
                        />
                      </div>
                    ))}
                    <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                      <button
                        onClick={() => confirmar(l.id)}
                        disabled={saving}
                        style={{
                          flex: 1, padding: '11px 0', borderRadius: 11, border: 'none', cursor: 'pointer',
                          background: `linear-gradient(135deg, ${ORANGE}, #C2410C)`, color: '#080808', fontSize: 13, fontWeight: 900,
                          opacity: saving ? 0.7 : 1,
                        }}
                      >
                        {saving ? 'Confirmando…' : 'Confirmar recepción'}
                      </button>
                      <button
                        onClick={() => setAbierto(null)}
                        style={{ padding: '11px 16px', borderRadius: 11, border: '1px solid var(--border)', background: 'transparent', color: 'rgba(255,255,255,0.4)', fontSize: 12, cursor: 'pointer' }}
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
