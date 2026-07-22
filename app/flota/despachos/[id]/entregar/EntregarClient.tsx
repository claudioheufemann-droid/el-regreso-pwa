'use client'

import { useState, useEffect, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import AppHeader from '@/components/ui/AppHeader'
import { createClient } from '@/lib/supabase/client'
import { compressImage } from '@/lib/compress-image'
import { FileText, Camera, CheckCircle2, XCircle, RotateCcw } from 'lucide-react'

interface ParadaDetalle {
  id: string
  cantidad_pedida: number
  estado: string
  cliente: { nombre_fantasia: string; direccion_entrega: string | null; telefono: string | null } | null
  cliente_terreno: { nombre_fantasia: string; direccion: string | null; telefono: string | null } | null
}

const ORANGE = '#F97316'

export default function EntregarClient() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const paradaId = searchParams.get('parada')

  const [parada, setParada] = useState<ParadaDetalle | null>(null)
  const [loading, setLoading] = useState(true)
  const [modo, setModo] = useState<'entregado' | 'rechazado' | 'devuelto'>('entregado')
  const [barriles, setBarriles] = useState(0)
  const [cajasCerveza, setCajasCerveza] = useState(0)
  const [cajasKombucha, setCajasKombucha] = useState(0)
  const [motivoRechazo, setMotivoRechazo] = useState('')
  const [guiaUrl, setGuiaUrl] = useState<string | null>(null)
  const [fotoUrl, setFotoUrl] = useState<string | null>(null)
  const [subiendoGuia, setSubiendoGuia] = useState(false)
  const [subiendoFoto, setSubiendoFoto] = useState(false)
  const [guardando, setGuardando] = useState(false)

  const guiaInputRef = useRef<HTMLInputElement>(null)
  const fotoInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!paradaId) { setLoading(false); return }
    fetch(`/api/logistica/paradas/${paradaId}`)
      .then(r => r.json())
      .then(data => setParada(data))
      .finally(() => setLoading(false))
  }, [paradaId])

  async function subir(file: File, tipo: 'guia' | 'foto') {
    const setSubiendo = tipo === 'guia' ? setSubiendoGuia : setSubiendoFoto
    const setUrl = tipo === 'guia' ? setGuiaUrl : setFotoUrl
    setSubiendo(true)
    try {
      const supabase = createClient()
      const compressed = await compressImage(file, { maxDim: 1600, quality: 0.8 })
      const path = `entregas/${paradaId}/${tipo}-${Date.now()}.jpg`
      const { error } = await supabase.storage.from('logistica-evidence').upload(path, compressed, { upsert: true, contentType: 'image/jpeg' })
      if (error) throw error
      const { data: { publicUrl } } = supabase.storage.from('logistica-evidence').getPublicUrl(path)
      setUrl(publicUrl)
    } catch (e) {
      console.error(e)
      alert('Error al subir la imagen. Intenta de nuevo.')
    } finally {
      setSubiendo(false)
    }
  }

  function obtenerGps(): Promise<{ lat?: number; lng?: number }> {
    return new Promise(resolve => {
      if (!navigator.geolocation) return resolve({})
      navigator.geolocation.getCurrentPosition(
        pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => resolve({}),
        { timeout: 5000 }
      )
    })
  }

  async function confirmar() {
    if (!paradaId) return
    const totalEntregado = barriles + cajasCerveza + cajasKombucha
    if (modo === 'entregado' && (!guiaUrl || !fotoUrl)) {
      alert('La guía de despacho y la foto de entrega son obligatorias.')
      return
    }
    if (modo === 'entregado' && totalEntregado === 0) {
      alert('Indica al menos un barril o caja entregada.')
      return
    }
    if (modo !== 'entregado' && !motivoRechazo.trim()) {
      alert('Indica el motivo.')
      return
    }
    setGuardando(true)
    try {
      const gps = await obtenerGps()
      const res = await fetch(`/api/logistica/paradas/${paradaId}/entregar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guia_url: guiaUrl ?? undefined,
          foto_entrega_url: fotoUrl ?? undefined,
          cantidad_entregada: totalEntregado,
          barriles, cajas_cerveza: cajasCerveza, cajas_kombucha: cajasKombucha,
          estado: modo,
          motivo_rechazo: modo !== 'entregado' ? motivoRechazo.trim() : undefined,
          ...gps,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        alert(err.error ?? 'Error al registrar la entrega')
        return
      }
      router.push('/flota/despachos')
    } finally {
      setGuardando(false)
    }
  }

  if (loading) return <div style={{ background: 'var(--bg)', minHeight: '100vh' }} />
  if (!paradaId || !parada) {
    return (
      <div style={{ background: 'var(--bg)', minHeight: '100vh' }}>
        <AppHeader eyebrow="Logística" title="Entregar Pedido" backHref="/flota/despachos" />
        <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.4)', marginTop: 40 }}>Parada no encontrada.</p>
      </div>
    )
  }

  const nombre = parada.cliente?.nombre_fantasia ?? parada.cliente_terreno?.nombre_fantasia ?? 'Cliente'
  const direccion = parada.cliente?.direccion_entrega ?? parada.cliente_terreno?.direccion ?? null

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh' }}>
      <AppHeader eyebrow="Logística" title="Entregar Pedido" backHref="/flota/despachos" />

      <div style={{ maxWidth: 520, margin: '0 auto', padding: '0 16px 100px' }}>

        {/* ── Cliente ── */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 16, marginBottom: 18 }}>
          <p style={{ fontSize: 16, fontWeight: 900, color: 'var(--cream)' }}>{nombre}</p>
          {direccion && <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{direccion}</p>}
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 6 }}>Cantidad pedida: {parada.cantidad_pedida} unidades</p>
        </div>

        {/* ── Selector de resultado ── */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
          {([
            { key: 'entregado', label: 'Entregado', icon: CheckCircle2, color: '#4ADE80' },
            { key: 'rechazado', label: 'Rechazado', icon: XCircle, color: '#FF6666' },
            { key: 'devuelto', label: 'Devuelto', icon: RotateCcw, color: '#FBBF24' },
          ] as const).map(opt => (
            <button
              key={opt.key}
              onClick={() => setModo(opt.key)}
              style={{
                flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '12px 4px',
                borderRadius: 12, cursor: 'pointer',
                border: `1.5px solid ${modo === opt.key ? opt.color : 'var(--border)'}`,
                background: modo === opt.key ? `${opt.color}15` : 'transparent',
              }}
            >
              <opt.icon size={18} color={modo === opt.key ? opt.color : 'rgba(255,255,255,0.4)'} />
              <span style={{ fontSize: 10, fontWeight: 700, color: modo === opt.key ? opt.color : 'rgba(255,255,255,0.4)' }}>{opt.label}</span>
            </button>
          ))}
        </div>

        {modo === 'entregado' ? (
          <>
            <label style={labelStyle}>Mercadería entregada</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 16 }}>
              <div>
                <p style={desgloseLabel}>🍺 Barriles</p>
                <input type="number" min={0} value={barriles}
                  onChange={e => setBarriles(Math.max(0, parseInt(e.target.value) || 0))}
                  style={inputStyle} />
              </div>
              <div>
                <p style={desgloseLabel}>🥫 Cajas cerveza</p>
                <input type="number" min={0} value={cajasCerveza}
                  onChange={e => setCajasCerveza(Math.max(0, parseInt(e.target.value) || 0))}
                  style={inputStyle} />
              </div>
              <div>
                <p style={desgloseLabel}>🍵 Cajas kombucha</p>
                <input type="number" min={0} value={cajasKombucha}
                  onChange={e => setCajasKombucha(Math.max(0, parseInt(e.target.value) || 0))}
                  style={inputStyle} />
              </div>
            </div>

            {/* Guía de despacho */}
            <input ref={guiaInputRef} type="file" accept="image/*,.pdf" capture="environment" hidden
              onChange={e => { const f = e.target.files?.[0]; if (f) subir(f, 'guia') }} />
            <button onClick={() => guiaInputRef.current?.click()} style={captureBtnStyle(!!guiaUrl)}>
              <FileText size={16} />
              {subiendoGuia ? 'Subiendo…' : guiaUrl ? '✓ Guía de despacho cargada' : 'Subir guía de despacho (obligatorio)'}
            </button>

            {/* Foto de entrega */}
            <input ref={fotoInputRef} type="file" accept="image/*" capture="environment" hidden
              onChange={e => { const f = e.target.files?.[0]; if (f) subir(f, 'foto') }} />
            <button onClick={() => fotoInputRef.current?.click()} style={captureBtnStyle(!!fotoUrl)}>
              <Camera size={16} />
              {subiendoFoto ? 'Subiendo…' : fotoUrl ? '✓ Foto de entrega cargada' : 'Tomar foto del pedido entregado (obligatorio)'}
            </button>
          </>
        ) : (
          <>
            <label style={labelStyle}>Motivo (obligatorio)</label>
            <textarea
              value={motivoRechazo}
              onChange={e => setMotivoRechazo(e.target.value)}
              placeholder="Ej: cliente cerrado, mercadería dañada, rechazo por diferencia de precio..."
              rows={3}
              style={{ ...inputStyle, marginBottom: 16, resize: 'vertical' }}
            />
          </>
        )}

        <button
          onClick={confirmar}
          disabled={guardando || subiendoGuia || subiendoFoto}
          style={{
            width: '100%', padding: '14px 0', borderRadius: 13, border: 'none', cursor: 'pointer', marginTop: 8,
            background: `linear-gradient(135deg, ${ORANGE}, #C2410C)`, color: '#080808', fontSize: 14, fontWeight: 900,
            opacity: guardando ? 0.7 : 1,
          }}
        >
          {guardando ? 'Guardando…' : 'Confirmar'}
        </button>
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '11px 12px', borderRadius: 11, border: '1px solid var(--border)',
  background: 'rgba(255,255,255,0.03)', color: 'var(--cream)', fontSize: 13, outline: 'none', fontFamily: 'inherit',
}
const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 10, color: 'rgba(255,255,255,0.35)', marginBottom: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5,
}
const desgloseLabel: React.CSSProperties = {
  fontSize: 10, color: 'rgba(255,255,255,0.45)', marginBottom: 4, fontWeight: 600, textAlign: 'center',
}
function captureBtnStyle(done: boolean): React.CSSProperties {
  return {
    width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '13px 14px', borderRadius: 12, cursor: 'pointer', marginBottom: 10,
    border: `1px solid ${done ? '#4ADE8055' : 'var(--border)'}`,
    background: done ? 'rgba(74,222,128,0.08)' : 'rgba(255,255,255,0.03)',
    color: done ? '#4ADE80' : 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: 700, textAlign: 'left',
  }
}
