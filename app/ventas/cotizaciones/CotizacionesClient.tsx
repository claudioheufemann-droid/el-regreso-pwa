'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Plus, FileText, ChevronDown, Send, Loader2, Check } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { fmtPrecioCLP } from '@/lib/catalogo-productos'
import type { CotizacionRow } from './page'

const C = {
  bg: '#F1F5F9', card: '#FFFFFF', hero: '#0F172A',
  text: '#0F172A', muted: '#64748B', faint: '#94A3B8', line: '#E2E8F0',
  blue: '#2563EB', blueSoft: '#EFF6FF',
  green: '#059669', greenSoft: '#ECFDF5',
  amber: '#D97706', amberSoft: '#FFFBEB',
  red: '#DC2626', redSoft: '#FEF2F2',
}

const ESTADO_INFO: Record<CotizacionRow['estado'], { label: string; fg: string; bg: string }> = {
  borrador: { label: 'Borrador', fg: C.muted, bg: '#F1F5F9' },
  enviada:  { label: 'Enviada',  fg: C.blue,  bg: C.blueSoft },
  ganada:   { label: 'Ganada',   fg: C.green, bg: C.greenSoft },
  perdida:  { label: 'Perdida',  fg: C.red,   bg: C.redSoft },
}

function fFecha(iso: string) {
  return new Date(iso).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function CotizacionesClient({ filas }: { filas: CotizacionRow[] }) {
  const router = useRouter()
  const supabase = createClient()
  const [busqueda, setBusqueda] = useState('')
  const [expandido, setExpandido] = useState<string | null>(null)
  const [filas2, setFilas2] = useState(filas)
  const [reenviando, setReenviando] = useState<string | null>(null)

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    if (!q) return filas2
    return filas2.filter(f =>
      f.cliente_nombre.toLowerCase().includes(q) ||
      (f.cliente_empresa ?? '').toLowerCase().includes(q) ||
      String(f.numero).includes(q),
    )
  }, [busqueda, filas2])

  async function cambiarEstado(id: string, estado: CotizacionRow['estado']) {
    setFilas2(prev => prev.map(f => f.id === id ? { ...f, estado } : f))
    await supabase.from('cotizaciones').update({ estado }).eq('id', id)
  }

  async function reenviarCorreo(f: CotizacionRow) {
    if (!f.cliente_email) return
    setReenviando(f.id)
    try {
      const res = await fetch('/api/cotizaciones/enviar-email', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cotizacionId: f.id }),
      })
      if (res.ok) cambiarEstado(f.id, f.estado === 'borrador' ? 'enviada' : f.estado)
    } finally {
      setReenviando(null)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, paddingBottom: 'max(140px, calc(env(safe-area-inset-bottom, 0px) + 120px))' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '20px 16px 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 16 }}>
          <div>
            <p style={{ fontSize: 12, fontWeight: 700, color: C.muted, letterSpacing: '0.04em' }}>VENTAS</p>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: C.text, letterSpacing: '-0.5px' }}>Cotizaciones</h1>
            <p style={{ fontSize: 12, color: C.faint, marginTop: 2 }}>{filas2.length} en total</p>
          </div>
          <button
            onClick={() => router.push('/ventas/cotizaciones/nueva')}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, marginTop: 2,
              padding: '10px 16px', borderRadius: 12, border: 'none',
              background: C.hero, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
            }}
          >
            <Plus size={15} /> Nueva
          </button>
        </div>

        <div style={{ position: 'relative', marginBottom: 16 }}>
          <Search size={15} color={C.faint} style={{ position: 'absolute', left: 12, top: 13 }} />
          <input
            value={busqueda} onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar por cliente o N° de cotización…"
            style={{ width: '100%', padding: '12px 12px 12px 36px', borderRadius: 12, border: `1px solid ${C.line}`, background: C.card, color: C.text, fontSize: 14, outline: 'none' }}
          />
        </div>

        {filtradas.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px' }}>
            <FileText size={32} color={C.faint} style={{ marginBottom: 10 }} />
            <p style={{ fontSize: 14, color: C.muted, marginBottom: 4 }}>
              {filas2.length === 0 ? 'Todavía no hay cotizaciones' : 'Sin resultados'}
            </p>
            {filas2.length === 0 && (
              <button onClick={() => router.push('/ventas/cotizaciones/nueva')} style={{ marginTop: 10, padding: '10px 18px', borderRadius: 100, border: 'none', background: C.hero, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                Crear la primera
              </button>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filtradas.map(f => {
              const est = ESTADO_INFO[f.estado]
              const abierto = expandido === f.id
              return (
                <div key={f.id} style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, overflow: 'hidden' }}>
                  <button
                    onClick={() => setExpandido(abierto ? null : f.id)}
                    style={{ display: 'block', width: '100%', textAlign: 'left', background: 'transparent', border: 'none', cursor: 'pointer', padding: '13px 14px', font: 'inherit' }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                      <div style={{ minWidth: 0 }}>
                        <p style={{ fontSize: 11, color: C.faint, fontWeight: 700 }}>N° {String(f.numero).padStart(4, '0')} · {fFecha(f.created_at)}</p>
                        <p style={{ fontSize: 14.5, fontWeight: 700, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {f.cliente_nombre}{f.cliente_empresa ? ` · ${f.cliente_empresa}` : ''}
                        </p>
                        <p style={{ fontSize: 11, color: C.faint, marginTop: 2 }}>Por {f.creado_por_nombre}</p>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                        <p style={{ fontSize: 15, fontWeight: 800, color: C.text }}>{fmtPrecioCLP(f.total)}</p>
                        <span style={{ fontSize: 10.5, fontWeight: 700, color: est.fg, background: est.bg, borderRadius: 999, padding: '2px 8px' }}>{est.label}</span>
                      </div>
                    </div>
                    <ChevronDown size={15} color={C.faint} style={{ marginTop: 6, transform: abierto ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
                  </button>

                  {abierto && (
                    <div style={{ padding: '0 14px 14px', borderTop: `1px solid ${C.line}` }}>
                      {f.imagen_url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={f.imagen_url} alt={`Cotización ${f.numero}`} style={{ width: '100%', borderRadius: 10, marginTop: 12, marginBottom: 12, border: `1px solid ${C.line}` }} />
                      )}
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                        {(['enviada', 'ganada', 'perdida'] as const).map(e => (
                          <button key={e} onClick={() => cambiarEstado(f.id, e)} style={{
                            padding: '6px 12px', borderRadius: 100, cursor: 'pointer', fontSize: 11.5, fontWeight: 700,
                            border: `1px solid ${f.estado === e ? ESTADO_INFO[e].fg : C.line}`,
                            background: f.estado === e ? ESTADO_INFO[e].bg : C.card,
                            color: f.estado === e ? ESTADO_INFO[e].fg : C.muted,
                          }}>
                            {f.estado === e && <Check size={11} style={{ marginRight: 3, verticalAlign: -1 }} />}
                            Marcar {ESTADO_INFO[e].label.toLowerCase()}
                          </button>
                        ))}
                      </div>
                      <button
                        onClick={() => reenviarCorreo(f)} disabled={!f.cliente_email || reenviando === f.id}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%', padding: '10px', borderRadius: 10,
                          border: `1px solid ${C.blue}`, background: C.blueSoft, color: C.blue, fontSize: 12.5, fontWeight: 700,
                          cursor: !f.cliente_email || reenviando === f.id ? 'not-allowed' : 'pointer', opacity: !f.cliente_email ? 0.5 : 1,
                        }}
                      >
                        {reenviando === f.id ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                        {!f.cliente_email ? 'Sin email del cliente' : reenviando === f.id ? 'Enviando…' : 'Reenviar por correo'}
                      </button>
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
