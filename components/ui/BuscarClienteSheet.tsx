'use client'

/**
 * Búsqueda rápida de cliente — hoja flotante accesible desde Terreno sin
 * abandonar la pantalla actual. El vendedor a mitad de una visita no debería
 * tener que navegar 3 pantallas (Inicio → Ventas → Clientes) para encontrar
 * a alguien. Resultados con acciones directas: pedido, llamar, WhatsApp.
 */
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Search, X, ShoppingBag, Phone, MessageCircle, MapPin } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface Resultado {
  nombre_fantasia: string
  categoria: string | null
  localidad: string | null
  telefono: string | null
}

export default function BuscarClienteSheet({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const [q, setQ] = useState('')
  const [resultados, setResultados] = useState<Resultado[]>([])
  const [buscando, setBuscando] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const term = q.trim()
    if (term.length < 2) { setResultados([]); return }
    debounceRef.current = setTimeout(async () => {
      setBuscando(true)
      const supabase = createClient()
      // RLS por región ya filtra automáticamente — el vendedor solo ve los suyos.
      const { data } = await supabase
        .from('clientes')
        .select('nombre_fantasia, categoria, localidad, telefono')
        .ilike('nombre_fantasia', `%${term}%`)
        .not('nombre_fantasia', 'is', null)
        .order('nombre_fantasia')
        .limit(8)
      setResultados((data ?? []) as Resultado[])
      setBuscando(false)
    }, 350)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [q])

  function irAPedido(nombre: string) {
    onClose()
    router.push(`/terreno/nueva-visita?cliente=${encodeURIComponent(nombre)}`)
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 300,
        background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(3px)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        paddingTop: 'max(60px, env(safe-area-inset-top, 60px))',
        animation: 'bcs-fade 0.15s ease',
      }}
    >
      <style>{`
        @keyframes bcs-fade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes bcs-pop { from { transform: translateY(-8px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
      `}</style>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '92%', maxWidth: 420,
          background: 'linear-gradient(160deg, #14110A 0%, #0A0808 100%)',
          border: '1px solid rgba(212,175,55,0.25)', borderRadius: 18,
          padding: 14, animation: 'bcs-pop 0.2s cubic-bezier(0.16,1,0.3,1)',
          maxHeight: '70vh', display: 'flex', flexDirection: 'column',
        }}
      >
        {/* Input */}
        <div style={{ position: 'relative', marginBottom: 10, flexShrink: 0 }}>
          <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.3)' }} />
          <input
            ref={inputRef}
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Buscar cliente por nombre…"
            style={{
              width: '100%', height: 46, paddingLeft: 36, paddingRight: 36,
              background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 12, color: '#F0EDE8', fontSize: 16, outline: 'none',
            }}
          />
          <button onClick={onClose} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', width: 28, height: 28, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <X size={13} color="rgba(255,255,255,0.5)" />
          </button>
        </div>

        {/* Resultados */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {buscando && (
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', textAlign: 'center', padding: '16px 0' }}>Buscando…</p>
          )}
          {!buscando && q.trim().length >= 2 && resultados.length === 0 && (
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', textAlign: 'center', padding: '16px 0' }}>Sin resultados</p>
          )}
          {!buscando && resultados.map(c => (
            <div key={c.nombre_fantasia} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '10px 6px',
              borderTop: '1px solid rgba(255,255,255,0.05)',
            }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(212,175,55,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 12, fontWeight: 900, color: '#D4AF37' }}>
                {c.nombre_fantasia.charAt(0).toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: '#F0EDE8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nombre_fantasia}</p>
                <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', display: 'flex', alignItems: 'center', gap: 3 }}>
                  <MapPin size={9} /> {c.categoria ?? c.localidad ?? 'Sin datos'}
                </p>
              </div>
              <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                {c.telefono && (
                  <a href={`tel:${c.telefono}`} onClick={e => e.stopPropagation()} style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(212,175,55,0.08)', border: '1px solid rgba(212,175,55,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Phone size={13} color="#D4AF37" />
                  </a>
                )}
                {c.telefono && (
                  <a href={`https://wa.me/${c.telefono.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(37,211,102,0.08)', border: '1px solid rgba(37,211,102,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <MessageCircle size={13} color="#25D366" />
                  </a>
                )}
                <button onClick={() => irAPedido(c.nombre_fantasia)} style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg, #E5C45A, #B8962E)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                  <ShoppingBag size={13} color="#080808" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
