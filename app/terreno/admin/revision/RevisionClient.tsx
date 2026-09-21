'use client'

import { useState } from 'react'
import { Check, X, Camera, CloudOff } from 'lucide-react'
import { C, cardStyle } from '../../theme'
import { MOTIVO_LABEL, type MotivoRevision } from '@/lib/terreno/verificacion'

export interface ItemRevision {
  id: string
  clienteNombre: string
  vendedorNombre: string
  iniciadaAt: string
  distanciaM: number | null
  precisionM: number | null
  fotoUrl: string | null
  fotoBytes: number | null
  motivoRevision: string | null
  capturaOffline: boolean
}

function fHora(iso: string) {
  return new Date(iso).toLocaleString('es-CL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export default function RevisionClient({ items }: { items: ItemRevision[] }) {
  const [lista, setLista] = useState(items)
  const [procesandoId, setProcesandoId] = useState<string | null>(null)
  const [motivoRechazo, setMotivoRechazo] = useState<Record<string, string>>({})

  async function revisar(id: string, accion: 'aprobar' | 'rechazar') {
    if (accion === 'rechazar' && !motivoRechazo[id]?.trim()) {
      window.alert('Escribe un motivo antes de rechazar.')
      return
    }
    setProcesandoId(id)
    try {
      const r = await fetch(`/api/terreno/visitas/${id}/revision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion, motivo: accion === 'rechazar' ? motivoRechazo[id] : undefined }),
      })
      if (r.ok) setLista(prev => prev.filter(x => x.id !== id))
      else window.alert((await r.json().catch(() => ({})) as { error?: string }).error ?? 'No se pudo procesar.')
    } finally {
      setProcesandoId(null)
    }
  }

  return (
    <div style={{ padding: '28px 28px 60px', maxWidth: 1040 }}>
      <p style={{ fontSize: 12, fontWeight: 700, color: C.muted, letterSpacing: '0.04em' }}>REVISIÓN MANUAL</p>
      <h1 style={{ fontSize: 26, fontWeight: 900, color: C.text, letterSpacing: '-0.4px', marginBottom: 4 }}>
        Evidencias por revisar
      </h1>
      <p style={{ fontSize: 13.5, color: C.muted, marginBottom: 20 }}>
        {lista.length} visita{lista.length !== 1 ? 's' : ''} sin verificación automática — el vendedor nunca puede aprobar la suya.
      </p>

      {lista.length === 0 && (
        <div style={{ ...cardStyle, padding: 40, textAlign: 'center' }}>
          <p style={{ fontSize: 14, color: C.muted }}>No hay evidencias pendientes. 🎉</p>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {lista.map(item => (
          <div key={item.id} style={{ ...cardStyle, padding: 16, display: 'flex', gap: 14 }}>
            <div style={{ width: 84, height: 84, borderRadius: 12, overflow: 'hidden', background: C.line, flexShrink: 0 }}>
              {item.fotoUrl
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={item.fotoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Camera size={20} color={C.faint} /></div>}
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <div>
                  <p style={{ fontSize: 14.5, fontWeight: 800, color: C.text }}>{item.clienteNombre}</p>
                  <p style={{ fontSize: 12, color: C.muted }}>{item.vendedorNombre} · {fHora(item.iniciadaAt)}</p>
                </div>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: C.amber, background: C.amberSoft, borderRadius: 100, padding: '3px 9px', whiteSpace: 'nowrap' }}>
                  {item.motivoRevision ? (MOTIVO_LABEL[item.motivoRevision as MotivoRevision] ?? item.motivoRevision) : 'En revisión'}
                </span>
              </div>

              <div style={{ display: 'flex', gap: 14, marginTop: 8, fontSize: 12, color: C.muted, flexWrap: 'wrap' }}>
                {item.distanciaM != null && <span>Distancia: <b style={{ color: C.text }}>{item.distanciaM} m</b></span>}
                {item.precisionM != null && <span>Precisión: <b style={{ color: C.text }}>{Math.round(item.precisionM)} m</b></span>}
                {item.fotoBytes != null && <span>Foto: <b style={{ color: C.text }}>{Math.round(item.fotoBytes / 1024)} KB</b></span>}
                {item.capturaOffline && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><CloudOff size={12} /> Capturada offline</span>
                )}
              </div>

              <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <button
                  onClick={() => revisar(item.id, 'aprobar')}
                  disabled={procesandoId === item.id}
                  style={{
                    minHeight: 38, padding: '0 14px', borderRadius: 10, border: 'none', cursor: 'pointer',
                    background: C.verdeLlegada, color: '#fff', fontSize: 12.5, fontWeight: 800,
                    display: 'flex', alignItems: 'center', gap: 6, opacity: procesandoId === item.id ? 0.6 : 1,
                  }}
                >
                  <Check size={14} /> Aprobar
                </button>
                <input
                  value={motivoRechazo[item.id] ?? ''}
                  onChange={e => setMotivoRechazo(prev => ({ ...prev, [item.id]: e.target.value }))}
                  placeholder="Motivo de rechazo…"
                  style={{ flex: 1, minWidth: 160, minHeight: 38, padding: '0 10px', borderRadius: 10, border: `1px solid ${C.line}`, fontSize: 12.5, outline: 'none' }}
                />
                <button
                  onClick={() => revisar(item.id, 'rechazar')}
                  disabled={procesandoId === item.id}
                  style={{
                    minHeight: 38, padding: '0 14px', borderRadius: 10, cursor: 'pointer',
                    border: `1px solid ${C.red}`, background: C.redSoft, color: C.red, fontSize: 12.5, fontWeight: 800,
                    display: 'flex', alignItems: 'center', gap: 6, opacity: procesandoId === item.id ? 0.6 : 1,
                  }}
                >
                  <X size={14} /> Rechazar
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
