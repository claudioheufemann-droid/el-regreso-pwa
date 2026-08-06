'use client'

import { Camera, MapPin, Check, Loader2 } from 'lucide-react'
import { C, TAP, cardStyle } from '../theme'

export type SlotFoto = 'exterior' | 'exhibicion' | 'competencia'

export const SLOTS_FOTO: { key: SlotFoto; label: string; ayuda: string; obligatoria: boolean }[] = [
  { key: 'exterior',    label: 'Fachada del local', ayuda: 'Obligatoria — respaldo de que estuviste ahí', obligatoria: true },
  { key: 'exhibicion',  label: 'Exhibición',        ayuda: 'Cómo está exhibido el producto',              obligatoria: false },
  { key: 'competencia', label: 'Competencia',       ayuda: 'Qué más se vende en el local',                obligatoria: false },
]

/**
 * Check-in de la visita: ubicación + foto de la fachada.
 *
 * La foto de la fachada es obligatoria (pedido de Claudio) y el GPS se toma
 * solo, sin que el vendedor tenga que apretar nada. Es un único toque —
 * apenas la foto queda tomada se pasa directo a vender, sin botón de
 * "continuar" de por medio. Las otras dos fotos son opcionales y se
 * recuerdan recién al cerrar la visita, para no frenar la venta acá.
 */
export default function PasoCheckin({ clienteNombre, gpsEstado, onTomarFoto }: {
  clienteNombre: string
  gpsEstado: 'buscando' | 'ok' | 'error'
  onTomarFoto: () => void
}) {
  return (
    <div>
      {/* Ubicación — informativa, no bloquea */}
      <div style={{
        ...cardStyle,
        padding: '12px 14px', marginBottom: 12,
        display: 'flex', alignItems: 'center', gap: 11,
        background: gpsEstado === 'ok' ? C.greenSoft : C.card,
        border: `1px solid ${gpsEstado === 'ok' ? '#A7F3D0' : C.line}`,
      }}>
        <span style={{
          width: 36, height: 36, borderRadius: 11, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: gpsEstado === 'ok' ? '#D1FAE5' : C.bg,
        }}>
          {gpsEstado === 'buscando'
            ? <Loader2 size={17} color={C.muted} style={{ animation: 'spin 1s linear infinite' }} />
            : <MapPin size={17} color={gpsEstado === 'ok' ? C.green : C.muted} />}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 13.5, fontWeight: 700, color: C.text }}>
            {gpsEstado === 'buscando' ? 'Tomando tu ubicación…'
              : gpsEstado === 'ok' ? 'Ubicación registrada'
              : 'Sin ubicación'}
          </p>
          <p style={{ fontSize: 11.5, color: gpsEstado === 'error' ? C.amber : C.muted }}>
            {gpsEstado === 'error'
              ? 'No pasa nada, puedes seguir igual'
              : 'Se guarda sola, no tienes que hacer nada'}
          </p>
        </div>
        {gpsEstado === 'ok' && <Check size={17} color={C.green} style={{ flexShrink: 0 }} />}
      </div>

      {/* Foto obligatoria */}
      <button
        onClick={onTomarFoto}
        style={{
          width: '100%', cursor: 'pointer', textAlign: 'center',
          background: C.card, border: `2px dashed ${C.blue}`, borderRadius: 18,
          padding: '30px 20px',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
        }}
      >
        <span style={{ width: 60, height: 60, borderRadius: 20, background: C.blueSoft, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Camera size={28} color={C.blue} />
        </span>
        <div>
          <p style={{ fontSize: 17, fontWeight: 800, color: C.text, marginBottom: 4 }}>
            Toma una foto de la fachada
          </p>
          <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.45 }}>
            Es obligatoria para empezar la visita en {clienteNombre}.
          </p>
        </div>
        <span style={{
          minHeight: TAP, padding: '0 22px', borderRadius: 12, background: C.hero, color: '#fff',
          fontSize: 15, fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 8,
        }}>
          <Camera size={17} /> Abrir cámara
        </span>
      </button>

      <p style={{ fontSize: 12, color: C.muted, textAlign: 'center', marginTop: 14, lineHeight: 1.5 }}>
        Después, si quieres, puedes agregar fotos de la exhibición y de la competencia.
      </p>

      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}

/** Recordatorio al cerrar: qué fotos opcionales quedaron sin tomar. */
export function ModalFotosPendientes({ faltantes, onTomar, onContinuar, onCancelar }: {
  faltantes: SlotFoto[]
  onTomar: (slot: SlotFoto) => void
  onContinuar: () => void
  onCancelar: () => void
}) {
  const nombres = SLOTS_FOTO.filter(s => faltantes.includes(s.key))
  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onCancelar() }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.5)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
    >
      <div style={{ background: C.card, borderRadius: 18, padding: 22, width: '100%', maxWidth: 380 }}>
        <span style={{ width: 46, height: 46, borderRadius: 14, background: C.amberSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
          <Camera size={22} color={C.amber} />
        </span>
        <p style={{ fontSize: 16.5, fontWeight: 800, color: C.text, marginBottom: 5 }}>
          {faltantes.length === 1 ? 'Te falta una foto' : `Te faltan ${faltantes.length} fotos`}
        </p>
        <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.5, marginBottom: 16 }}>
          No son obligatorias, pero ayudan harto a revisar la visita después.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 16 }}>
          {nombres.map(s => (
            <button
              key={s.key}
              onClick={() => onTomar(s.key)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
                minHeight: TAP + 10, padding: '10px 13px', borderRadius: 12, cursor: 'pointer',
                border: `1px solid ${C.line}`, background: C.bg,
              }}
            >
              <Camera size={17} color={C.blue} style={{ flexShrink: 0 }} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 14, fontWeight: 700, color: C.text }}>{s.label}</span>
                <span style={{ display: 'block', fontSize: 11.5, color: C.muted }}>{s.ayuda}</span>
              </span>
            </button>
          ))}
        </div>

        <button
          onClick={onContinuar}
          style={{
            width: '100%', minHeight: 50, borderRadius: 12, border: 'none', marginBottom: 8, cursor: 'pointer',
            background: C.green, color: '#fff', fontSize: 15, fontWeight: 800,
          }}
        >
          Cerrar la visita así
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
      </div>
    </div>
  )
}
