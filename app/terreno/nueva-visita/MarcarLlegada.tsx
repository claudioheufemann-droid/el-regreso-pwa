'use client'

import { useEffect, useRef, useState } from 'react'
import { Camera, ChevronLeft, MapPin, Loader2 } from 'lucide-react'
import { C, TAP, cardStyle } from '../theme'
import { comprimirFotoLlegada } from '@/lib/terreno/comprimirFoto'
import { distanciaMetros } from '@/lib/geo'
import { fDistancia } from '@/lib/terreno/formato'

export interface EvidenciaCapturada {
  blob: Blob
  lat: number | null
  lng: number | null
  precisionM: number | null
  timestampLecturaGps: string | null
  sesionCapturaId: string | null
  capturaOffline: boolean
}

interface Props {
  visitaId: string
  clienteNombre: string
  direccionCliente?: string | null
  clienteLat?: number | null
  clienteLng?: number | null
  onListo: (evidencia: EvidenciaCapturada) => void
  onVolver: () => void
}

/**
 * Paso "Marcar llegada" — cámara + GPS en paralelo, sin selección de
 * productos. Objetivo de usabilidad del spec: ~30 s de interacción
 * habitual. La ubicación se muestra apenas está disponible como estimación
 * amistosa ("a 18 m del local"); la verificación real la hace el servidor
 * en /api/terreno/visitas/[id]/llegada — esto es sólo feedback inmediato.
 */
export default function MarcarLlegada({
  visitaId, clienteNombre, direccionCliente, clienteLat, clienteLng, onListo, onVolver,
}: Props) {
  const [gpsEstado, setGpsEstado] = useState<'buscando' | 'ok' | 'error'>('buscando')
  const [gps, setGps] = useState<{ lat: number; lng: number; precisionM: number; timestamp: string } | null>(null)
  const [sesionCapturaId, setSesionCapturaId] = useState<string | null>(null)
  const [sesionOffline, setSesionOffline] = useState(false)
  const [comprimiendo, setComprimiendo] = useState(false)
  const [errorFoto, setErrorFoto] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch(`/api/terreno/visitas/${visitaId}/sesion`, { method: 'POST' })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then((j: { sesionCapturaId: string }) => setSesionCapturaId(j.sesionCapturaId))
      .catch(() => setSesionOffline(true))
  }, [visitaId])

  function pedirUbicacion() {
    if (typeof navigator === 'undefined' || !navigator.geolocation) { setGpsEstado('error'); return }
    navigator.geolocation.getCurrentPosition(
      pos => {
        setGps({
          lat: pos.coords.latitude, lng: pos.coords.longitude,
          precisionM: pos.coords.accuracy, timestamp: new Date(pos.timestamp).toISOString(),
        })
        setGpsEstado('ok')
      },
      () => setGpsEstado('error'),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    )
  }
  function reintentarUbicacion() {
    setGpsEstado('buscando')
    pedirUbicacion()
  }
  // Arranca apenas se monta la pantalla — gpsEstado ya nace en 'buscando'.
  // eslint-disable-next-line react-hooks/set-state-in-effect -- dispara la API de geolocalización del navegador, no un cálculo derivable en render
  useEffect(pedirUbicacion, [])

  async function onFileElegido(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setErrorFoto(null)
    setComprimiendo(true)
    try {
      const blob = await comprimirFotoLlegada(file)
      onListo({
        blob,
        lat: gps?.lat ?? null, lng: gps?.lng ?? null, precisionM: gps?.precisionM ?? null,
        timestampLecturaGps: gps?.timestamp ?? null,
        sesionCapturaId,
        capturaOffline: sesionOffline || !navigator.onLine,
      })
    } catch (err) {
      setErrorFoto(err instanceof Error ? err.message : 'No se pudo procesar la foto.')
    } finally {
      setComprimiendo(false)
    }
  }

  const distanciaEstimadaM = gps && clienteLat != null && clienteLng != null
    ? Math.round(distanciaMetros(gps.lat, gps.lng, clienteLat, clienteLng))
    : null
  const lejosDelLocal = distanciaEstimadaM != null && distanciaEstimadaM > 100

  return (
    <div>
      <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={onFileElegido} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <button
          onClick={onVolver}
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

      <p style={{ fontSize: 12, fontWeight: 700, color: C.muted, letterSpacing: '0.04em' }}>MARCAR LLEGADA</p>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: C.text, letterSpacing: '-0.4px', lineHeight: 1.2, marginBottom: 2 }}>
        {clienteNombre}
      </h1>
      {direccionCliente && <p style={{ fontSize: 12.5, color: C.muted, marginBottom: 16 }}>{direccionCliente}</p>}
      {!direccionCliente && <div style={{ marginBottom: 16 }} />}

      <button
        onClick={() => fileRef.current?.click()}
        disabled={comprimiendo}
        style={{
          width: '100%', aspectRatio: '4/3', borderRadius: 20, border: `2px dashed ${C.line}`,
          background: C.card, cursor: comprimiendo ? 'wait' : 'pointer',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10,
          marginBottom: 14,
        }}
      >
        {comprimiendo ? (
          <>
            <Loader2 size={30} color={C.muted} style={{ animation: 'spin 1s linear infinite' }} />
            <span style={{ fontSize: 13, color: C.muted, fontWeight: 600 }}>Procesando foto…</span>
          </>
        ) : (
          <>
            <span style={{
              width: 64, height: 64, borderRadius: '50%', background: C.verdeLlegadaSoft,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Camera size={28} color={C.verdeLlegada} />
            </span>
            <span style={{ fontSize: 15, fontWeight: 800, color: C.text }}>Tomar foto</span>
            <span style={{ fontSize: 11.5, color: C.faint, textAlign: 'center', padding: '0 24px' }}>
              La fachada del local, desde afuera — se comprimirá automáticamente
            </span>
          </>
        )}
      </button>

      {errorFoto && (
        <div style={{ ...cardStyle, border: `1px solid #FECACA`, background: C.redSoft, padding: 12, marginBottom: 12 }}>
          <p style={{ fontSize: 12.5, color: C.red, fontWeight: 600 }}>{errorFoto}</p>
        </div>
      )}

      <div style={{ ...cardStyle, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
        {gpsEstado === 'buscando' && (
          <>
            <Loader2 size={16} color={C.muted} style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }} />
            <span style={{ fontSize: 13, color: C.muted, fontWeight: 600 }}>Obteniendo ubicación…</span>
          </>
        )}
        {gpsEstado === 'ok' && (
          <>
            <MapPin size={16} color={lejosDelLocal ? C.amber : C.verdeLlegada} style={{ flexShrink: 0 }} />
            <span style={{ fontSize: 13, color: C.text, fontWeight: 600 }}>
              {distanciaEstimadaM != null
                ? `A ${fDistancia(distanciaEstimadaM)} del local · Precisión ${Math.round(gps!.precisionM)} m`
                : `Ubicación lista · Precisión ${Math.round(gps!.precisionM)} m`}
            </span>
          </>
        )}
        {gpsEstado === 'error' && (
          <>
            <span style={{ fontSize: 13, color: C.muted, flex: 1 }}>No pudimos obtener tu ubicación.</span>
            <button
              onClick={reintentarUbicacion}
              style={{ minHeight: TAP - 8, padding: '0 12px', borderRadius: 100, border: 'none', cursor: 'pointer', background: C.blueSoft, color: C.blue, fontSize: 12.5, fontWeight: 700, flexShrink: 0 }}
            >
              Reintentar
            </button>
          </>
        )}
      </div>

      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}
