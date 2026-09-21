'use client'

import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, MapPin, Ruler, Crosshair, Clock, RotateCcw, Loader2 } from 'lucide-react'
import { C, TAP, cardStyle, btnPrimario } from '../theme'
import type { EvidenciaCapturada } from './MarcarLlegada'
import { enviarLlegadaConTimeout } from '@/lib/terreno/colaLlegadaOffline'
import { distanciaMetros } from '@/lib/geo'

export interface ResultadoLlegada {
  estadoPresencia: string
  motivoRevision: string | null
  distanciaM: number | null
  precisionM: number | null
  radioM: number | null
  pendienteSync: boolean
  fotoUrl?: string
}

interface Props {
  visitaId: string
  evidencia: EvidenciaCapturada
  clienteNombre: string
  clienteLat?: number | null
  clienteLng?: number | null
  clienteErpId?: number | null
  clienteTerrenoId?: string | null
  onConfirmado: (r: ResultadoLlegada) => void
  onRepetir: () => void
}

export default function ConfirmarEvidencia({
  visitaId, evidencia, clienteNombre, clienteLat, clienteLng, clienteErpId, clienteTerrenoId, onConfirmado, onRepetir,
}: Props) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const url = URL.createObjectURL(evidencia.blob)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sincroniza con el Blob URL, que sólo existe en el navegador
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [evidencia.blob])

  const distanciaEstimadaM = useMemo(() => {
    if (evidencia.lat == null || evidencia.lng == null || clienteLat == null || clienteLng == null) return null
    return Math.round(distanciaMetros(evidencia.lat, evidencia.lng, clienteLat, clienteLng))
  }, [evidencia, clienteLat, clienteLng])

  const coincide = distanciaEstimadaM != null ? distanciaEstimadaM <= 100 : null
  const horaCaptura = evidencia.timestampLecturaGps
    ? new Date(evidencia.timestampLecturaGps).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
    : '—'

  async function confirmar() {
    setEnviando(true)
    setError(null)
    const r = await enviarLlegadaConTimeout({
      visitaId, blob: evidencia.blob, lat: evidencia.lat, lng: evidencia.lng,
      precisionM: evidencia.precisionM, timestampLecturaGps: evidencia.timestampLecturaGps,
      sesionCapturaId: evidencia.sesionCapturaId, clienteErpId: clienteErpId ?? null, clienteTerrenoId: clienteTerrenoId ?? null,
    })
    setEnviando(false)

    if (r.ok) {
      const d = r.data as { estadoPresencia: string; motivoRevision: string | null; distanciaM: number | null; precisionM: number | null; radioM: number | null; fotoUrl?: string }
      onConfirmado({
        estadoPresencia: d.estadoPresencia, motivoRevision: d.motivoRevision,
        distanciaM: d.distanciaM, precisionM: d.precisionM, radioM: d.radioM, pendienteSync: false,
        fotoUrl: d.fotoUrl,
      })
      return
    }
    if (r.encolada) {
      onConfirmado({
        estadoPresencia: 'pendiente_revision', motivoRevision: 'captura_offline',
        distanciaM: distanciaEstimadaM, precisionM: evidencia.precisionM, radioM: 100, pendienteSync: true,
      })
      return
    }
    setError(r.error)
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <button
          onClick={onRepetir}
          aria-label="Volver"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4, minHeight: 38, cursor: 'pointer',
            background: C.card, border: `1px solid ${C.line}`, borderRadius: 100,
            padding: '7px 14px 7px 10px', color: C.blue, fontSize: 13, fontWeight: 700,
          }}
        >
          <ChevronLeft size={17} strokeWidth={2.5} color={C.blue} />
          Volver
        </button>
      </div>

      <p style={{ fontSize: 12, fontWeight: 700, color: C.muted, letterSpacing: '0.04em' }}>CONFIRMA LA LLEGADA</p>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: C.text, letterSpacing: '-0.4px', lineHeight: 1.2, marginBottom: 14 }}>
        {clienteNombre}
      </h1>

      <div style={{ position: 'relative', borderRadius: 18, overflow: 'hidden', marginBottom: 14, background: C.line }}>
        {previewUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewUrl} alt="Foto de llegada" style={{ width: '100%', display: 'block', aspectRatio: '4/3', objectFit: 'cover' }} />
        )}
        <span style={{
          position: 'absolute', bottom: 10, left: 10, background: 'rgba(15,23,42,.72)', color: '#fff',
          fontSize: 11.5, fontWeight: 700, borderRadius: 100, padding: '4px 10px',
        }}>
          Foto lista · {Math.round(evidencia.blob.size / 1024)} KB
        </span>
      </div>

      <div style={{ ...cardStyle, padding: '4px 14px', marginBottom: 14 }}>
        <FilaEstado icon={MapPin} label="Ubicación" valor={coincide == null ? 'Sin referencia' : coincide ? 'Coincide' : 'Fuera de rango'} color={coincide == null ? C.muted : coincide ? C.verdeLlegada : C.amber} />
        <FilaEstado icon={Ruler} label="Distancia al local" valor={distanciaEstimadaM != null ? `${distanciaEstimadaM} m` : '—'} />
        <FilaEstado icon={Crosshair} label="Precisión" valor={evidencia.precisionM != null ? `${Math.round(evidencia.precisionM)} m` : '—'} />
        <FilaEstado icon={Clock} label="Hora de captura" valor={horaCaptura} ultima />
      </div>

      {error && (
        <div style={{ ...cardStyle, border: '1px solid #FECACA', background: C.redSoft, padding: 12, marginBottom: 12 }}>
          <p style={{ fontSize: 12.5, color: C.red, fontWeight: 600 }}>{error}</p>
        </div>
      )}

      <button
        onClick={confirmar}
        disabled={enviando}
        style={{
          ...btnPrimario, background: C.verdeLlegada, marginBottom: 10,
          opacity: enviando ? 0.7 : 1, cursor: enviando ? 'wait' : 'pointer',
        }}
      >
        {enviando ? <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> : null}
        {enviando ? 'Registrando…' : 'Usar foto y registrar llegada'}
      </button>
      <button
        onClick={onRepetir}
        disabled={enviando}
        style={{
          width: '100%', minHeight: TAP, borderRadius: 14, border: `1px solid ${C.line}`, background: C.card,
          color: C.muted, fontSize: 14.5, fontWeight: 700, cursor: enviando ? 'not-allowed' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}
      >
        <RotateCcw size={16} />
        Repetir foto
      </button>

      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}

function FilaEstado({ icon: Icon, label, valor, color = C.text, ultima = false }: {
  icon: typeof MapPin; label: string; valor: string; color?: string; ultima?: boolean
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '11px 0',
      borderBottom: ultima ? 'none' : `1px solid ${C.line}`,
    }}>
      <Icon size={16} color={C.muted} style={{ flexShrink: 0 }} />
      <span style={{ fontSize: 13.5, color: C.muted, flex: 1 }}>{label}</span>
      <span style={{ fontSize: 13.5, fontWeight: 800, color }}>{valor}</span>
    </div>
  )
}
