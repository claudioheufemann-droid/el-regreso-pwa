'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Bell } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States'

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

const LIGHT_LINE = '#E2E8F0'

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

interface NotificationsBellProps {
  /** true = botón normal dentro de un flex row (headers de módulo). false (default) = posicionado absoluto, como en el Hub principal. */
  inline?: boolean
  /** 'dark' (default) = look dorado/oscuro del resto de la app. 'light' = para headers claros (Ventas, Stock). */
  variant?: 'dark' | 'light'
}

export default function NotificationsBell({ inline = false, variant = 'dark' }: NotificationsBellProps = {}) {
  const router = useRouter()
  const isDark = variant === 'dark'
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<Notificacion[]>([])
  const [loading, setLoading] = useState(false)
  const [errorItems, setErrorItems] = useState<string | null>(null)
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

  // Abrir la campana SOLO carga la lista — ya no marca nada como leído acá.
  // Antes marcaba TODO leído apenas se abría (antes de que hubiera chance de
  // ver el contenido), así que el contador de no leídas volvía a 0 sin que el
  // usuario alcanzara a enterarse de nada — parecía que "no llegaba" ninguna
  // notificación aunque sí estaban guardadas.
  async function abrir() {
    setOpen(true)
    setLoading(true)
    setErrorItems(null)
    try {
      const res = await fetch('/api/notificaciones')
      if (!res.ok) throw new Error(`La API respondió ${res.status}`)
      const data = await res.json()
      setItems(Array.isArray(data) ? data : [])
    } catch (err) {
      // Antes un fallo acá dejaba `items` en su valor previo (o vacío la
      // primera vez) y el panel decía "Sin notificaciones por ahora" —
      // indistinguible de que realmente no hubiera ninguna.
      setErrorItems(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setLoading(false)
    }
  }

  function marcarUnaLeida(id: string) {
    setItems(prev => prev.map(n => n.id === id ? { ...n, leida: true } : n))
    setUnread(prev => Math.max(0, prev - 1))
    fetch('/api/notificaciones/marcar-leidas', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }),
    }).catch(() => {})
  }

  function marcarTodasLeidas() {
    setItems(prev => prev.map(n => ({ ...n, leida: true })))
    setUnread(0)
    fetch('/api/notificaciones/marcar-leidas', { method: 'PATCH' }).catch(() => {})
  }

  function irA(n: Notificacion) {
    if (!n.leida) marcarUnaLeida(n.id)
    setOpen(false)
    if (n.url) router.push(n.url)
  }

  return (
    <>
      <button
        onClick={abrir}
        aria-label="Notificaciones"
        style={{
          ...(inline ? { position: 'relative' } : { position: 'absolute', top: 0, right: 48 }),
          zIndex: 5,
          width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
          border: isDark ? '1.5px solid rgba(212,175,55,0.4)' : `1px solid ${LIGHT_LINE}`,
          cursor: 'pointer', padding: 0,
          background: isDark ? '#14141A' : '#FFFFFF',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: isDark ? '0 2px 12px rgba(212,175,55,0.2)' : 'none',
        }}
      >
        <Bell size={17} color={isDark ? '#D4AF37' : '#0F172A'} />
        {unread > 0 && (
          <span style={{
            position: 'absolute', top: -3, right: -3,
            minWidth: 17, height: 17, padding: '0 4px', borderRadius: 99,
            background: '#E23E3E', color: '#fff', fontSize: 10, fontWeight: 800,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: `2px solid ${isDark ? '#07070D' : '#FFFFFF'}`,
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {items.some(n => !n.leida) && (
                  <button onClick={marcarTodasLeidas} style={{ background: 'none', border: 'none', color: '#D4AF37', cursor: 'pointer', fontSize: 11.5, fontWeight: 700, padding: '6px 4px' }}>
                    Marcar todas
                  </button>
                )}
                <button onClick={() => setOpen(false)} style={{ background: 'rgba(128,128,128,0.1)', border: 'none', color: 'var(--cream)', cursor: 'pointer', fontSize: 16, padding: 8, borderRadius: '50%' }}>✕</button>
              </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '10px 14px 20px' }}>
              {loading ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[0, 1, 2, 3].map(i => <Skeleton key={i} height={48} radius={10} />)}
                </div>
              ) : errorItems ? (
                <ErrorState
                  compact
                  title="No pudimos cargar tus notificaciones"
                  hint="Revisa tu conexión y vuelve a intentar."
                  detail={errorItems}
                  showDetail
                  onRetry={abrir}
                />
              ) : items.length === 0 ? (
                <EmptyState
                  compact
                  title="Sin notificaciones por ahora"
                />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {items.map(n => (
                    <button
                      key={n.id}
                      onClick={() => irA(n)}
                      style={{
                        display: 'flex', alignItems: 'flex-start', gap: 10, textAlign: 'left', width: '100%',
                        padding: '12px 12px', borderRadius: 14, cursor: 'pointer',
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
