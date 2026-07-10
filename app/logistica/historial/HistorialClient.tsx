'use client'

import { useState, useEffect, useCallback } from 'react'
import AppHeader from '@/components/ui/AppHeader'
import { Archive, FileText, ImageIcon } from 'lucide-react'

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
  observaciones: string | null
  guia_despacho_url: string | null
  guia_recepcion_url: string | null
  enviado_at: string | null
  created_at: string
  declarante: { nombre: string } | null
  items: LoteItem[]
}

const ESTADO_INFO: Record<string, { label: string; color: string }> = {
  declarado:         { label: 'Declarado — sin enviar', color: 'rgba(255,255,255,0.4)' },
  enviado:           { label: 'En camino a bodega',     color: '#F97316' },
  recibido:          { label: 'Recibido conforme',      color: '#4ADE80' },
  con_discrepancia:  { label: 'Con descuadre',           color: '#FF6666' },
}

export default function HistorialClient() {
  const [lotes, setLotes] = useState<LoteRow[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    fetch('/api/logistica/lotes')
      .then(r => r.json())
      .then(data => setLotes(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

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
                    <span style={{
                      flexShrink: 0, padding: '4px 9px', borderRadius: 8, fontSize: 10, fontWeight: 800,
                      color: info.color, background: `${info.color}18`, border: `1px solid ${info.color}40`,
                    }}>
                      {info.label}
                    </span>
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
