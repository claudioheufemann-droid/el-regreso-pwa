'use client'

import { useState } from 'react'
import { Check, MapPin, Store } from 'lucide-react'
import { C, cardStyle, TAP } from '../../theme'

export interface PuntoPendiente {
  entidad: 'cliente' | 'cliente_terreno'
  id: string | number
  nombre: string
  direccion: string | null
  localidad: string | null
  lat: number | null
  lng: number | null
  radioM: number
  esProspecto: boolean
}

export default function ClientesAdminClient({ pendientes }: { pendientes: PuntoPendiente[] }) {
  const [lista, setLista] = useState(pendientes)
  const [ediciones, setEdiciones] = useState<Record<string, { lat: string; lng: string; radioM: string }>>({})
  const [procesandoKey, setProcesandoKey] = useState<string | null>(null)

  function key(p: PuntoPendiente) { return `${p.entidad}:${p.id}` }

  async function validar(p: PuntoPendiente) {
    const k = key(p)
    const edit = ediciones[k]
    setProcesandoKey(k)
    try {
      const lat = edit?.lat ? Number(edit.lat) : undefined
      const lng = edit?.lng ? Number(edit.lng) : undefined
      const radioM = edit?.radioM ? Number(edit.radioM) : undefined
      const r = await fetch('/api/terreno/ubicacion/validar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entidad: p.entidad, id: p.id, lat, lng, radioM }),
      })
      if (r.ok) setLista(prev => prev.filter(x => key(x) !== k))
      else window.alert((await r.json().catch(() => ({})) as { error?: string }).error ?? 'No se pudo validar.')
    } finally {
      setProcesandoKey(null)
    }
  }

  return (
    <div style={{ padding: '28px 28px 60px', maxWidth: 1040 }}>
      <p style={{ fontSize: 12, fontWeight: 700, color: C.muted, letterSpacing: '0.04em' }}>PUNTOS DE REFERENCIA</p>
      <h1 style={{ fontSize: 26, fontWeight: 900, color: C.text, letterSpacing: '-0.4px', marginBottom: 4 }}>
        Clientes por validar
      </h1>
      <p style={{ fontSize: 13.5, color: C.muted, marginBottom: 20, maxWidth: 640 }}>
        Ninguna llegada verifica automático mientras el pin del local siga &quot;pendiente&quot; — corrige la
        posición si hace falta y valida. Cada cambio queda auditado.
      </p>

      {lista.length === 0 && (
        <div style={{ ...cardStyle, padding: 40, textAlign: 'center' }}>
          <p style={{ fontSize: 14, color: C.muted }}>No hay puntos pendientes de validar.</p>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {lista.map(p => {
          const k = key(p)
          const edit = ediciones[k] ?? { lat: '', lng: '', radioM: '' }
          return (
            <div key={k} style={{ ...cardStyle, padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
                <span style={{ width: 34, height: 34, borderRadius: 10, background: p.esProspecto ? C.blueSoft : C.line, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Store size={16} color={p.esProspecto ? C.blue : C.muted} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 14.5, fontWeight: 800, color: C.text }}>{p.nombre}</p>
                  <p style={{ fontSize: 12, color: C.muted }}>
                    {[p.direccion, p.localidad].filter(Boolean).join(' · ') || 'Sin dirección'}
                    {p.esProspecto && ' · Prospecto de campo'}
                  </p>
                </div>
                {p.lat != null && p.lng != null && (
                  <span style={{ fontSize: 11, color: C.faint, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <MapPin size={11} /> {p.lat.toFixed(5)}, {p.lng.toFixed(5)}
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <input
                  value={edit.lat} onChange={e => setEdiciones(prev => ({ ...prev, [k]: { ...edit, lat: e.target.value } }))}
                  placeholder={p.lat != null ? `Lat: ${p.lat.toFixed(5)}` : 'Lat (opcional, corrige)'}
                  style={{ minHeight: 36, width: 160, padding: '0 10px', borderRadius: 9, border: `1px solid ${C.line}`, fontSize: 12.5 }}
                />
                <input
                  value={edit.lng} onChange={e => setEdiciones(prev => ({ ...prev, [k]: { ...edit, lng: e.target.value } }))}
                  placeholder={p.lng != null ? `Lng: ${p.lng.toFixed(5)}` : 'Lng (opcional, corrige)'}
                  style={{ minHeight: 36, width: 160, padding: '0 10px', borderRadius: 9, border: `1px solid ${C.line}`, fontSize: 12.5 }}
                />
                <input
                  value={edit.radioM} onChange={e => setEdiciones(prev => ({ ...prev, [k]: { ...edit, radioM: e.target.value } }))}
                  placeholder={`Radio: ${p.radioM} m`}
                  style={{ minHeight: 36, width: 110, padding: '0 10px', borderRadius: 9, border: `1px solid ${C.line}`, fontSize: 12.5 }}
                />
                <button
                  onClick={() => validar(p)}
                  disabled={procesandoKey === k}
                  style={{
                    marginLeft: 'auto', minHeight: TAP - 6, padding: '0 16px', borderRadius: 10, border: 'none', cursor: 'pointer',
                    background: C.verdeLlegada, color: '#fff', fontSize: 13, fontWeight: 800,
                    display: 'flex', alignItems: 'center', gap: 6, opacity: procesandoKey === k ? 0.6 : 1,
                  }}
                >
                  <Check size={15} /> Validar
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
