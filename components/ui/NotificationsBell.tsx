'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Bell } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface Notificacion {
  id: string
  titulo: string
  cuerpo: string | null
  url: string | null
  tipo: string | null
  leida: boolean
  created_at: string
}

const ICONO_TIPO: Record<string, string> = {
  venta_cargada: '💰',
  visita_completada: '📍',
  visita_sin_venta: '📍',
  camion_salida: '🚚',
  camion_llegada: '🚚',
  pedido_entregado: '📦',
  tarea_asignada: '✅',
  mision_pedido: '🎯',
  alerta_deuda: '⚠️',
  test: '🔔',
}
// El `tipo` guardado es el `tag` del push — en varios call sites es un tag
// dinámico tipo `status-<uuid>` o `review-<uuid>` en vez de una clave fija,
// así que además del match exacto se revisa por prefijo.
const PREFIJO_ICONO: [string, string][] = [
  ['status-', '✅'], ['review-', '⭐'], ['comment-', '💬'],
]
function iconoParaTipo(tipo: string | null): string {
  if (!tipo) return '🔔'
  if (ICONO_TIPO[tipo]) return ICONO_TIPO[tipo]
  const match = PREFIJO_ICONO.find(([pfx]) => tipo.startsWith(pfx))
  return match?.[1] ?? '🔔'
}

function tiempoRelativo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diffMs / 60000)
  if (min < 1) return 'ahora'
  if (min < 60) return `hace ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `hace ${h}h`
  const d = Math.floor(h / 24)
  return `hace ${d}d`
}

export default function NotificationsBell() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<Notificacion[]>([])
  const [loading, setLoading] = useState(false)
  const [unread, setUnread] = useState(0)
  const panelRef = useRef<HTMLDivElement>(null)

  const cargarNoLeidas = useCallback(() => {
    fetch('/api/notificaciones')
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setUnread(data.filter((n: Notificacion) => !n.leida).length) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    cargarNoLeidas()
    const supabase = createClient()
    let channel: ReturnType<typeof supabase.channel> | null = null
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      channel = supabase
        .channel(`notificaciones-${user.id}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notificaciones', filter: `user_id=eq.${user.id}` }, () => {
          setUnread(prev => prev + 1)
        })
        .subscribe()
    })
    return () => { if (channel) supabase.removeChannel(channel) }
  }, [cargarNoLeidas])

  async function abrir() {
    setOpen(true)
    setLoading(true)
    try {
      const res = await fetch('/api/notificaciones')
      const data = await res.json()
      setItems(Array.isArray(data) ? data : [])
      if (Array.isArray(data) && data.some((n: Notificacion) => !n.leida)) {
        setUnread(0)
        fetch('/api/notificaciones/marcar-leidas', { method: 'PATCH' }).catch(() => {})
      }
    } finally {
      setLoading(false)
    }
  }

  function irA(n: Notificacion) {
    setOpen(false)
    if (n.url) router.push(n.url)
  }

  return (
    <>
      <button
        onClick={abrir}
        aria-label="Notificaciones"
        style={{
          position: 'absolute', top: 0, right: 48, zIndex: 5,
          width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
          border: '1.5px solid rgba(212,175,55,0.4)', cursor: 'pointer', padding: 0,
          background: '#14141A',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 2px 12px rgba(212,175,55,0.2)',
        }}
      >
        <Bell size={17} color="#D4AF37" />
        {unread > 0 && (
          <span style={{
            position: 'absolute', top: -3, right: -3,
            minWidth: 17, height: 17, padding: '0 4px', borderRadius: 99,
            background: '#E23E3E', color: '#fff', fontSize: 10, fontWeight: 800,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '2px solid #07070D',
          }}>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          className="fixed inset-0 flex flex-col justify-end"
          style={{ background: 'rgba(0,0,0,0.7)', zIndex: 300 }}
          onClick={e => { if (e.target === e.currentTarget) setOpen(false) }}
        >
          <div ref={panelRef} className="sheet-up w-full safe-bottom" style={{
            background: 'var(--surface)', borderTop: '2px solid rgba(212,175,55,0.25)',
            borderRadius: '20px 20px 0 0', maxHeight: '78vh', display: 'flex', flexDirection: 'column',
          }}>
            <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 6px' }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(128,128,128,0.25)' }} />
            </div>

            <div style={{ padding: '4px 20px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(128,128,128,0.1)' }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--cream)' }}>🔔 Notificaciones</div>
              <button onClick={() => setOpen(false)} style={{ background: 'rgba(128,128,128,0.1)', border: 'none', color: 'var(--cream)', cursor: 'pointer', fontSize: 16, padding: 8, borderRadius: '50%' }}>✕</button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '10px 14px 20px' }}>
              {loading ? (
                <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 13, padding: 30 }}>Cargando…</p>
              ) : items.length === 0 ? (
                <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 13, padding: 30 }}>Sin notificaciones por ahora.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {items.map(n => (
                    <button
                      key={n.id}
                      onClick={() => irA(n)}
                      disabled={!n.url}
                      style={{
                        display: 'flex', alignItems: 'flex-start', gap: 10, textAlign: 'left', width: '100%',
                        padding: '12px 12px', borderRadius: 14, cursor: n.url ? 'pointer' : 'default',
                        background: n.leida ? 'rgba(255,255,255,0.02)' : 'rgba(212,175,55,0.08)',
                        border: `1px solid ${n.leida ? 'rgba(255,255,255,0.06)' : 'rgba(212,175,55,0.25)'}`,
                      }}
                    >
                      <span style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>{iconoParaTipo(n.tipo)}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 13, fontWeight: n.leida ? 600 : 800, color: 'var(--cream)' }}>{n.titulo}</p>
                        {n.cuerpo && <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>{n.cuerpo}</p>}
                        <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 4 }}>{tiempoRelativo(n.created_at)}</p>
                      </div>
                      {!n.leida && <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#D4AF37', flexShrink: 0, marginTop: 5 }} />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
