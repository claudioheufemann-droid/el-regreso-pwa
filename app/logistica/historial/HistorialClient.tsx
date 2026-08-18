'use client'

import { useState, useEffect, useCallback } from 'react'
import AppHeader from '@/components/ui/AppHeader'
import { Archive, FileText, ImageIcon, AlertTriangle, Trash2 } from 'lucide-react'
import type { AppUser } from '@/lib/auth'

interface LoteItem {
  id: string
  producto: string
  envase: string
  cantidad_declarada: number
  codigo_lote: string
}
interface AlertaRow {
  id: string
  producto: string
  envase: string
  cantidad_declarada: number
  cantidad_recibida: number
  diferencia: number
  resuelta: boolean
  nota_resolucion: string | null
  observacion: string | null
}
interface LoteRow {
  id: string
  eta_entrega: string
  estado: string
  observaciones: string | null
  guia_despacho_url: string | null
  guia_recepcion_url: string | null
  enviado_at: string | null
  created_at: string
  declarado_por: string
  declarante: { nombre: string } | null
  items: LoteItem[]
  alertas: AlertaRow[]
}

const ESTADO_INFO: Record<string, { label: string; color: string }> = {
  declarado:         { label: 'Declarado — sin enviar', color: 'rgba(255,255,255,0.4)' },
  enviado:           { label: 'En camino a bodega',     color: '#F97316' },
  recibido:          { label: 'Recibido conforme',      color: '#4ADE80' },
  con_discrepancia:  { label: 'Con descuadre',           color: '#FF6666' },
}

export default function HistorialClient({ user }: { user: AppUser }) {
  const [lotes, setLotes] = useState<LoteRow[]>([])
  const [loading, setLoading] = useState(true)
  const [borrandoId, setBorrandoId] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    fetch('/api/logistica/lotes')
      .then(r => r.json())
      .then(data => setLotes(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  async function eliminarLote(loteId: string) {
    if (!confirm('¿Eliminar este envío del historial? Esta acción no se puede deshacer.')) return
    setBorrandoId(loteId)
    try {
      const res = await fetch(`/api/logistica/lotes/${loteId}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        alert(err.error ?? 'Error al eliminar el envío')
        return
      }
      setLotes(prev => prev.filter(l => l.id !== loteId))
    } finally {
      setBorrandoId(null)
    }
  }

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh' }}>
      <AppHeader eyebrow="Producción · Logística" title="Historial" backHref="/" />

      <div style={{ maxWidth: 640, margin: '0 auto', padding: '0 16px 100px' }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10 }}>
          Todos los envíos
        </p>

        {loading ? (
          <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>Cargando…</p>
        ) : lotes.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'rgba(255,255,255,0.3)' }}>
            <Archive size={28} style={{ marginBottom: 8, opacity: 0.4 }} />
            <p style={{ fontSize: 13 }}>Todavía no hay envíos registrados.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {lotes.map(l => {
              const info = ESTADO_INFO[l.estado] ?? { label: l.estado, color: 'rgba(255,255,255,0.4)' }
              const totalUnidades = l.items.reduce((s, it) => s + it.cantidad_declarada, 0)
              return (
                <div key={l.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                    <div>
                      <p style={{ fontSize: 14, fontWeight: 800, color: 'var(--cream)' }}>
                        {new Date(l.eta_entrega).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })}
                        {' '}· {new Date(l.eta_entrega).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                      <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
                        {l.declarante?.nombre ?? 'Producción'} · {l.items.length} producto{l.items.length === 1 ? '' : 's'} · {totalUnidades} unidad{totalUnidades === 1 ? '' : 'es'}
                      </p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                      <span style={{
                        padding: '4px 9px', borderRadius: 8, fontSize: 10, fontWeight: 800,
                        color: info.color, background: `${info.color}18`, border: `1px solid ${info.color}40`,
                      }}>
                        {info.label}
                      </span>
                      {(user.isAdmin || l.declarado_por === user.id) && (
                        <button
                          onClick={() => eliminarLote(l.id)}
                          disabled={borrandoId === l.id}
                          title="Eliminar del historial"
                          style={{
                            width: 26, height: 26, borderRadius: 8, flexShrink: 0,
                            background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.18)',
                            color: '#F87171', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: borrandoId === l.id ? 'default' : 'pointer', opacity: borrandoId === l.id ? 0.4 : 1,
                          }}
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
                    {l.items.map(it => (
                      <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
                        <span style={{ flex: 1, color: 'rgba(255,255,255,0.6)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          <span style={{ color: '#F97316', fontWeight: 700 }}>{it.codigo_lote}</span> · {it.producto} · {it.envase}
                        </span>
                        <span style={{ fontWeight: 800, color: 'rgba(255,255,255,0.5)', flexShrink: 0 }}>× {it.cantidad_declarada}</span>
                      </div>
                    ))}
                  </div>

                  {l.observaciones && (
                    <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 10, fontStyle: 'italic' }}>
                      "{l.observaciones}"
                    </p>
                  )}

                  {l.alertas?.length > 0 && (
                    <div style={{ background: 'rgba(255,102,102,0.06)', border: '1px solid rgba(255,102,102,0.25)', borderRadius: 12, padding: 10, marginBottom: 10 }}>
                      <p style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 800, color: '#FF6666', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                        <AlertTriangle size={12} /> Problemas en este envío
                      </p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {l.alertas.map(a => (
                          <div key={a.id} style={{ fontSize: 11 }}>
                            <p style={{ color: 'var(--cream)' }}>
                              {a.producto} · {a.envase} — declarado {a.cantidad_declarada}, recibido {a.cantidad_recibida}
                              {a.diferencia !== 0 && (
                                <strong style={{ color: a.diferencia < 0 ? '#FF6666' : '#4ADE80' }}> ({a.diferencia > 0 ? '+' : ''}{a.diferencia})</strong>
                              )}
                            </p>
                            {a.observacion && <p style={{ color: '#FF6666', fontStyle: 'italic', marginTop: 2 }}>"{a.observacion}"</p>}
                            <p style={{ color: a.resuelta ? '#4ADE80' : 'rgba(255,255,255,0.35)', marginTop: 2, fontSize: 10, fontWeight: 700 }}>
                              {a.resuelta ? `✓ Resuelto${a.nota_resolucion ? `: ${a.nota_resolucion}` : ''}` : 'Sin resolver'}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {(l.guia_despacho_url || l.guia_recepcion_url) && (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {l.guia_despacho_url && (
                        <a href={l.guia_despacho_url} target="_blank" rel="noopener noreferrer"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 8, background: 'rgba(249,115,22,0.1)', border: '1px solid rgba(249,115,22,0.3)', color: '#F97316', fontSize: 10, fontWeight: 700, textDecoration: 'none' }}>
                          <FileText size={11} /> Guía de despacho
                        </a>
                      )}
                      {l.guia_recepcion_url && (
                        <a href={l.guia_recepcion_url} target="_blank" rel="noopener noreferrer"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 8, background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.3)', color: '#4ADE80', fontSize: 10, fontWeight: 700, textDecoration: 'none' }}>
                          <ImageIcon size={11} /> Guía corregida
                        </a>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
