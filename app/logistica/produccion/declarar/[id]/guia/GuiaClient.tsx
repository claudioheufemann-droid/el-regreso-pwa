'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import AppHeader from '@/components/ui/AppHeader'
import { createClient } from '@/lib/supabase/client'
import { compressImage } from '@/lib/compress-image'
import { FileText, Send } from 'lucide-react'

interface LoteDetalle {
  id: string
  eta_entrega: string
  estado: string
  items: { id: string; producto: string; envase: string; cantidad_declarada: number; codigo_lote: string }[]
}

const ORANGE = '#F97316'

export default function GuiaClient({ loteId }: { loteId: string }) {
  const router = useRouter()
  const [lote, setLote] = useState<LoteDetalle | null>(null)
  const [loading, setLoading] = useState(true)
  const [guiaUrl, setGuiaUrl] = useState<string | null>(null)
  const [subiendo, setSubiendo] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch(`/api/logistica/lotes/${loteId}`)
      .then(r => r.json())
      .then(setLote)
      .finally(() => setLoading(false))
  }, [loteId])

  async function subir(file: File) {
    setSubiendo(true)
    try {
      const supabase = createClient()
      const compressed = await compressImage(file, { maxDim: 1600, quality: 0.8 })
      const path = `produccion/${loteId}/guia-${Date.now()}.jpg`
      const { error } = await supabase.storage.from('logistica-evidence').upload(path, compressed, { upsert: true, contentType: 'image/jpeg' })
      if (error) throw error
      const { data: { publicUrl } } = supabase.storage.from('logistica-evidence').getPublicUrl(path)
      setGuiaUrl(publicUrl)
    } catch (e) {
      console.error(e)
      alert('Error al subir la guía. Intenta de nuevo.')
    } finally {
      setSubiendo(false)
    }
  }

  async function enviarABodega() {
    if (!guiaUrl) return
    setEnviando(true)
    try {
      const res = await fetch(`/api/logistica/lotes/${loteId}/enviar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guia_despacho_url: guiaUrl }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        alert(err.error ?? 'Error al enviar a bodega')
        return
      }
      router.push('/logistica/produccion/declarar')
    } finally {
      setEnviando(false)
    }
  }

  if (loading) return <div style={{ background: 'var(--bg)', minHeight: '100vh' }} />
  if (!lote) {
    return (
      <div style={{ background: 'var(--bg)', minHeight: '100vh' }}>
        <AppHeader eyebrow="Producción" title="Guía de despacho" backHref="/logistica/produccion/declarar" />
        <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.4)', marginTop: 40 }}>Envío no encontrado.</p>
      </div>
    )
  }

  const totalUnidades = lote.items.reduce((s, it) => s + it.cantidad_declarada, 0)

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh' }}>
      <AppHeader eyebrow="Producción" title="Guía de despacho" backHref="/logistica/produccion/declarar" />

      <div style={{ maxWidth: 520, margin: '0 auto', padding: '0 16px 100px' }}>
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginBottom: 18, lineHeight: 1.5 }}>
          Sube una foto de la guía de despacho de este envío. Logística la usará para corroborar que lo que llega
          a bodega coincide con lo declarado.
        </p>

        {/* ── Resumen del envío ── */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 14, marginBottom: 18 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10 }}>
            {lote.items.length} producto{lote.items.length === 1 ? '' : 's'} · {totalUnidades} unidad{totalUnidades === 1 ? '' : 'es'}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {lote.items.map(it => (
              <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                <span style={{ flex: 1, color: 'var(--cream)' }}>
                  <span style={{ color: ORANGE, fontWeight: 700 }}>{it.codigo_lote}</span> · {it.producto} · {it.envase}
                </span>
                <span style={{ fontWeight: 800, color: 'rgba(255,255,255,0.6)' }}>× {it.cantidad_declarada}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Subir guía ── */}
        <input ref={fileInputRef} type="file" accept="image/*,.pdf" capture="environment" hidden
          onChange={e => { const f = e.target.files?.[0]; if (f) subir(f) }} />
        <button
          onClick={() => fileInputRef.current?.click()}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderRadius: 13, cursor: 'pointer', marginBottom: 18,
            border: `1px solid ${guiaUrl ? '#4ADE8055' : 'var(--border)'}`,
            background: guiaUrl ? 'rgba(74,222,128,0.08)' : 'rgba(255,255,255,0.03)',
            color: guiaUrl ? '#4ADE80' : 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: 700, textAlign: 'left',
          }}
        >
          <FileText size={18} />
          {subiendo ? 'Subiendo…' : guiaUrl ? '✓ Guía de despacho cargada' : 'Subir foto de la guía de despacho'}
        </button>

        <button
          onClick={enviarABodega}
          disabled={!guiaUrl || enviando || subiendo}
          style={{
            width: '100%', padding: '15px 0', borderRadius: 14, border: 'none',
            cursor: guiaUrl && !enviando ? 'pointer' : 'default',
            background: guiaUrl ? `linear-gradient(135deg, ${ORANGE}, #C2410C)` : 'rgba(255,255,255,0.06)',
            color: guiaUrl ? '#080808' : 'rgba(255,255,255,0.35)',
            fontSize: 14, fontWeight: 900,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            opacity: enviando ? 0.7 : 1,
          }}
        >
          <Send size={16} /> {enviando ? 'Enviando…' : 'Enviar a bodega'}
        </button>
      </div>
    </div>
  )
}
