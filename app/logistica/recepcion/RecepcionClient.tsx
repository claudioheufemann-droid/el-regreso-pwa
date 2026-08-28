'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import AppHeader from '@/components/ui/AppHeader'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States'
import { createClient } from '@/lib/supabase/client'
import { compressImage } from '@/lib/compress-image'
import { PackageCheck, Inbox, FileText, ImageIcon, AlertTriangle, Minus, Plus } from 'lucide-react'

interface LoteItem {
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
  enviado_at: string | null
  guia_despacho_url: string | null
  items: LoteItem[]
}

const ORANGE = '#F97316'

function CantidadStepper({ value, alterada, onchange }: { value: number; alterada: boolean; onchange: (n: number) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const btnW = 32
  const color = alterada ? '#FF6666' : ORANGE

  function confirm(raw: string) {
    const n = parseInt(raw, 10)
    if (!isNaN(n) && n >= 0) onchange(n)
    setEditing(false)
  }

  function startEdit() {
    setDraft(value > 0 ? String(value) : '')
    setEditing(true)
    setTimeout(() => { inputRef.current?.select() }, 0)
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, flexShrink: 0 }}>
      <button
        onClick={() => onchange(Math.max(0, value - 1))}
        style={{ width: btnW, height: btnW, borderRadius: 8, border: 'none', cursor: 'pointer', background: 'rgba(255,255,255,0.1)', color: 'var(--cream)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <Minus size={13} />
      </button>

      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={e => setDraft(e.target.value.replace(/\D/g, ''))}
          onBlur={() => confirm(draft)}
          onKeyDown={e => { if (e.key === 'Enter') confirm(draft); if (e.key === 'Escape') setEditing(false) }}
          type="text"
          inputMode="numeric"
          style={{
            minWidth: 34, maxWidth: 56, height: btnW, textAlign: 'center', fontSize: 14, fontWeight: 900,
            background: `${color}1F`, border: `1px solid ${color}`, borderRadius: 8, color, outline: 'none', margin: '0 3px', padding: '0 4px',
          }}
        />
      ) : (
        <span
          onClick={startEdit}
          style={{
            minWidth: 34, maxWidth: 56, height: btnW, padding: '0 4px', textAlign: 'center', whiteSpace: 'nowrap',
            fontSize: value >= 1000 ? 12 : 14, fontWeight: 900, color,
            cursor: 'text', display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 8, border: `1px dashed ${color}`, margin: '0 3px',
          }}
          title="Toca para escribir la cantidad"
        >
          {value}
        </span>
      )}

      <button
        onClick={() => onchange(value + 1)}
        style={{ width: btnW, height: btnW, borderRadius: 8, cursor: 'pointer', border: 'none', background: `${color}1F`, color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <Plus size={13} />
      </button>
    </div>
  )
}

export default function RecepcionClient() {
  const [lotes, setLotes] = useState<LoteRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [abierto, setAbierto] = useState<string | null>(null)
  const [cantidades, setCantidades] = useState<Record<string, number>>({})
  const [noCorresponde, setNoCorresponde] = useState<Record<string, boolean>>({})
  const [observaciones, setObservaciones] = useState<Record<string, string>>({})
  const [guiaCorregidaUrl, setGuiaCorregidaUrl] = useState<string | null>(null)
  const [subiendoGuia, setSubiendoGuia] = useState(false)
  const [saving, setSaving] = useState(false)
  const guiaInputRef = useRef<HTMLInputElement>(null)

  // Sin `.catch`, un fallo de red se veía como "no hay lotes esperando
  // check-in" — bodega podía dar por recibido un envío que la pantalla
  // nunca alcanzó a consultar.
  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    fetch('/api/logistica/lotes?estado=enviado')
      .then(async r => {
        if (!r.ok) throw new Error(`La API respondió ${r.status}`)
        return r.json()
      })
      .then(data => setLotes(Array.isArray(data) ? data : []))
      .catch(err => setError(err instanceof Error ? err.message : 'Error desconocido'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  function abrir(lote: LoteRow) {
    setAbierto(lote.id)
    setGuiaCorregidaUrl(null)
    setNoCorresponde({})
    setObservaciones({})
    const init: Record<string, number> = {}
    lote.items.forEach(it => { init[it.id] = it.cantidad_declarada })
    setCantidades(init)
  }

  async function subirGuiaCorregida(loteId: string, file: File) {
    setSubiendoGuia(true)
    try {
      const supabase = createClient()
      const compressed = await compressImage(file, { maxDim: 1600, quality: 0.8 })
      const path = `produccion/${loteId}/guia-recepcion-${Date.now()}.jpg`
      const { error } = await supabase.storage.from('logistica-evidence').upload(path, compressed, { upsert: true, contentType: 'image/jpeg' })
      if (error) throw error
      const { data: { publicUrl } } = supabase.storage.from('logistica-evidence').getPublicUrl(path)
      setGuiaCorregidaUrl(publicUrl)
    } catch (e) {
      console.error(e)
      alert('Error al subir la guía. Intenta de nuevo.')
    } finally {
      setSubiendoGuia(false)
    }
  }

  async function confirmar(loteId: string) {
    setSaving(true)
    try {
      const items = Object.entries(cantidades).map(([item_id, cantidad_recibida]) => ({
        item_id,
        cantidad_recibida,
        no_corresponde: noCorresponde[item_id] ?? false,
        observacion: observaciones[item_id]?.trim() || undefined,
      }))
      const res = await fetch(`/api/logistica/lotes/${loteId}/recepcion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items, guia_recepcion_url: guiaCorregidaUrl ?? undefined }),
      })
      const data = await res.json()
      if (!res.ok) { alert(data.error ?? 'Error al confirmar recepción'); return }

      if (data.estado === 'con_discrepancia') {
        alert('⚠️ Se registró la recepción, pero hay diferencias con lo declarado. Se generó una alerta en /logistica/alertas.')
      }
      setAbierto(null)
      setGuiaCorregidaUrl(null)
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[0, 1, 2].map(i => <Skeleton key={i} height={86} radius={16} />)}
          </div>
        ) : error ? (
          <ErrorState
            title="No pudimos cargar los lotes en camino"
            hint="La consulta no llegó a completarse, así que esta pantalla no prueba que no haya envíos. Intenta de nuevo."
            detail={error}
            showDetail
            onRetry={load}
          />
        ) : lotes.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title="No hay lotes esperando check-in"
            hint="Cuando producción declare un envío, aparecerá acá para que lo recibas."
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {lotes.map(l => (
              <div key={l.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: abierto === l.id ? 14 : 0 }}>
                  <div>
                    <p style={{ fontSize: 14, fontWeight: 800, color: 'var(--cream)' }}>
                      Envío · {new Date(l.eta_entrega).toLocaleDateString('es-CL')}
                    </p>
                    <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
                      ETA {new Date(l.eta_entrega).toLocaleString('es-CL')} · {l.items.length} producto{l.items.length === 1 ? '' : 's'}
                    </p>
                    {l.guia_despacho_url && (
                      <a href={l.guia_despacho_url} target="_blank" rel="noopener noreferrer"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 4, fontSize: 11, color: ORANGE, fontWeight: 700, textDecoration: 'none' }}>
                        <FileText size={11} /> Ver guía de despacho
                      </a>
                    )}
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
                    {l.items.map(it => {
                      const marcado = noCorresponde[it.id] ?? false
                      return (
                        <div key={it.id} style={{ marginBottom: 10, paddingBottom: 10, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                            <span style={{ flex: 1, fontSize: 12, color: 'var(--cream)' }}>
                              <span style={{ color: ORANGE, fontWeight: 700 }}>{it.codigo_lote}</span> · {it.producto} · {it.envase}
                              <span style={{ color: 'rgba(255,255,255,0.35)' }}> (declarado: {it.cantidad_declarada})</span>
                            </span>
                            <CantidadStepper
                              value={cantidades[it.id] ?? it.cantidad_declarada}
                              alterada={(cantidades[it.id] ?? it.cantidad_declarada) !== it.cantidad_declarada}
                              onchange={n => setCantidades(prev => ({ ...prev, [it.id]: n }))}
                            />
                          </div>

                          <button
                            onClick={() => setNoCorresponde(prev => ({ ...prev, [it.id]: !marcado }))}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 8, cursor: 'pointer',
                              border: `1px solid ${marcado ? '#FF666655' : 'var(--border)'}`,
                              background: marcado ? 'rgba(255,102,102,0.1)' : 'transparent',
                              color: marcado ? '#FF6666' : 'rgba(255,255,255,0.4)', fontSize: 10, fontWeight: 700,
                            }}
                          >
                            <AlertTriangle size={11} /> Lo que llegó no corresponde con la guía
                          </button>

                          {marcado && (
                            <input
                              value={observaciones[it.id] ?? ''}
                              onChange={e => setObservaciones(prev => ({ ...prev, [it.id]: e.target.value }))}
                              placeholder="¿Qué llegó en realidad? (ej: llegó Fisura en vez de Arboretum, viene dañado...)"
                              style={{
                                width: '100%', marginTop: 8, padding: '9px 12px', borderRadius: 9, border: '1px solid rgba(255,102,102,0.3)',
                                background: 'rgba(255,102,102,0.05)', color: 'var(--cream)', fontSize: 12, outline: 'none',
                              }}
                            />
                          )}
                        </div>
                      )
                    })}

                    {l.items.some(it => (cantidades[it.id] ?? it.cantidad_declarada) !== it.cantidad_declarada || noCorresponde[it.id]) && (
                      <div style={{ marginTop: 10 }}>
                        <input ref={guiaInputRef} type="file" accept="image/*,.pdf" capture="environment" hidden
                          onChange={e => { const f = e.target.files?.[0]; if (f) subirGuiaCorregida(l.id, f) }} />
                        <button
                          onClick={() => guiaInputRef.current?.click()}
                          style={{
                            width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 10, cursor: 'pointer',
                            border: `1px solid ${guiaCorregidaUrl ? '#4ADE8055' : '#FBBF2455'}`,
                            background: guiaCorregidaUrl ? 'rgba(74,222,128,0.08)' : 'rgba(251,191,36,0.08)',
                            color: guiaCorregidaUrl ? '#4ADE80' : '#FBBF24', fontSize: 11, fontWeight: 700, textAlign: 'left',
                          }}
                        >
                          <ImageIcon size={14} />
                          {subiendoGuia ? 'Subiendo…' : guiaCorregidaUrl ? '✓ Guía corregida cargada' : 'Hay diferencias — sube la guía corregida (opcional)'}
                        </button>
                      </div>
                    )}

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
