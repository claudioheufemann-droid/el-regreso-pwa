'use client'

import { Camera, Image as ImageIcon, Check, Loader2 } from 'lucide-react'
import { C, TAP } from '../theme'
import { SLOTS_FOTO, type SlotFoto } from '@/lib/fotosVisita'

/**
 * Hoja de "Fotos del local" — se muestra al intentar cerrar la visita,
 * SOLO si falta alguna de las 4 fotos (frontis, interior, exhibición,
 * competencia). Ninguna es obligatoria para cerrar: el vendedor puede
 * tomarlas ahí mismo (cámara directa o desde la galería) o finalizar sin
 * ellas y completarlas después desde el Historial — ahí es donde se le
 * recuerda cada hora hasta que las suba.
 *
 * Antes la fachada bloqueaba el check-in (pedido de Claudio del
 * 2026-08-06); se revirtió el 2026-08-07: todas las fotos se piden
 * recién al final, para no frenar la venta en ningún momento.
 */
export default function HojaFotosVisita({ fotos, subiendo, onTomarCamara, onSubirGaleria, onContinuar, onCancelar }: {
  fotos: Partial<Record<SlotFoto, string>>
  subiendo: Partial<Record<SlotFoto, boolean>>
  onTomarCamara: (slot: SlotFoto) => void
  onSubirGaleria: (slot: SlotFoto) => void
  onContinuar: () => void
  onCancelar: () => void
}) {
  const faltantes = SLOTS_FOTO.filter(s => !fotos[s.key])

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onCancelar() }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.5)', zIndex: 500, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
    >
      <div style={{ background: C.card, borderRadius: '20px 20px 0 0', padding: '22px 20px', width: '100%', maxWidth: 480, maxHeight: '85vh', overflowY: 'auto' }}>
        <div style={{ width: 38, height: 4, borderRadius: 2, background: C.line, margin: '0 auto 16px' }} />

        <span style={{ width: 46, height: 46, borderRadius: 14, background: C.blueSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
          <Camera size={22} color={C.blue} />
        </span>
        <p style={{ fontSize: 16.5, fontWeight: 800, color: C.text, marginBottom: 5 }}>
          Fotos del local
        </p>
        <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.5, marginBottom: 16 }}>
          Ayudan harto a revisar la visita después. No son obligatorias — si
          no las tienes ahora, puedes subirlas más tarde desde el Historial.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 18 }}>
          {faltantes.map(s => (
            <div key={s.key} style={{ border: `1px solid ${C.line}`, borderRadius: 14, padding: '12px 13px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <span style={{ fontSize: 18 }}>{s.emoji}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13.5, fontWeight: 700, color: C.text }}>{s.label}</p>
                  <p style={{ fontSize: 11.5, color: C.muted }}>{s.ayuda}</p>
                </div>
                {subiendo[s.key] && <Loader2 size={16} color={C.blue} style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }} />}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => onTomarCamara(s.key)}
                  disabled={subiendo[s.key]}
                  style={{
                    flex: 1, minHeight: TAP, borderRadius: 10, cursor: subiendo[s.key] ? 'default' : 'pointer',
                    border: `1px solid ${C.line}`, background: C.bg, color: C.text,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    fontSize: 12.5, fontWeight: 700, opacity: subiendo[s.key] ? 0.5 : 1,
                  }}
                >
                  <Camera size={15} color={C.blue} /> Cámara
                </button>
                <button
                  onClick={() => onSubirGaleria(s.key)}
                  disabled={subiendo[s.key]}
                  style={{
                    flex: 1, minHeight: TAP, borderRadius: 10, cursor: subiendo[s.key] ? 'default' : 'pointer',
                    border: `1px solid ${C.line}`, background: C.bg, color: C.text,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    fontSize: 12.5, fontWeight: 700, opacity: subiendo[s.key] ? 0.5 : 1,
                  }}
                >
                  <ImageIcon size={15} color={C.blue} /> Galería
                </button>
              </div>
            </div>
          ))}

          {SLOTS_FOTO.filter(s => fotos[s.key]).map(s => (
            <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 13px', borderRadius: 14, background: C.greenSoft }}>
              <span style={{ fontSize: 16 }}>{s.emoji}</span>
              <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: C.text }}>{s.label}</span>
              <Check size={16} color={C.green} />
            </div>
          ))}
        </div>

        <button
          onClick={onContinuar}
          style={{
            width: '100%', minHeight: 50, borderRadius: 12, border: 'none', marginBottom: 8, cursor: 'pointer',
            background: C.hero, color: '#fff', fontSize: 15, fontWeight: 800,
          }}
        >
          {faltantes.length === SLOTS_FOTO.length ? 'Finalizar sin fotos' : 'Finalizar visita'}
        </button>
        <button
          onClick={onCancelar}
          style={{
            width: '100%', minHeight: 44, borderRadius: 12, cursor: 'pointer',
            border: `1px solid ${C.line}`, background: C.card, color: C.muted, fontSize: 14, fontWeight: 700,
          }}
        >
          Volver
        </button>

        <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
      </div>
    </div>
  )
}
