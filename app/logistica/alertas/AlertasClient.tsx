'use client'

import { useState, useEffect, useCallback } from 'react'
import AppHeader from '@/components/ui/AppHeader'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States'
import { AlertTriangle, CheckCircle2, ShieldCheck } from 'lucide-react'

interface AlertaRow {
  id: string
  producto: string
  envase: string
  cantidad_declarada: number
  cantidad_recibida: number
  diferencia: number
  resuelta: boolean
  nota_resolucion: string | null
  observacion: string | null
  created_at: string
  item: { codigo_lote: string } | null
}

export default function AlertasClient() {
  const [alertas, setAlertas] = useState<AlertaRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [resolviendo, setResolviendo] = useState<string | null>(null)
  const [nota, setNota] = useState('')

  // Crítico: sin `.catch`, un fallo de red dejaba la lista vacía y la
  // pantalla anunciaba "Todo cuadra 🎉" — le decía a bodega que no hay
  // descuadres cuando en realidad nunca llegó a preguntarlo.
  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    fetch('/api/logistica/alertas?resuelta=false')
      .then(async r => {
        if (!r.ok) throw new Error(`La API respondió ${r.status}`)
        return r.json()
      })
      .then(data => setAlertas(Array.isArray(data) ? data : []))
      .catch(err => setError(err instanceof Error ? err.message : 'Error desconocido'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  async function resolver(id: string) {
    const res = await fetch(`/api/logistica/alertas/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nota_resolucion: nota.trim() || undefined }),
    })
    if (!res.ok) { alert('Error al resolver la alerta'); return }
    setResolviendo(null); setNota('')
    load()
  }

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh' }}>
      <AppHeader eyebrow="Logística" title="Alertas de Inventario" backHref="/" />

      <div style={{ maxWidth: 640, margin: '0 auto', padding: '0 16px 100px' }}>
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[0, 1, 2].map(i => <Skeleton key={i} height={92} radius={16} />)}
          </div>
        ) : error ? (
          <ErrorState
            title="No pudimos revisar los descuadres"
            hint="No es lo mismo que “todo cuadra”: la consulta no llegó a completarse. Intenta de nuevo."
            detail={error}
            showDetail
            onRetry={load}
          />
        ) : alertas.length === 0 ? (
          <EmptyState
            icon={ShieldCheck}
            title="Todo cuadra"
            hint="No hay descuadres pendientes entre lo declarado en producción y lo recibido en bodega."
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {alertas.map(a => (
              <div key={a.id} style={{
                background: 'rgba(255,68,68,0.05)', border: '1px solid rgba(255,68,68,0.2)', borderRadius: 16, padding: 14,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <AlertTriangle size={14} color="#FF6666" />
                  <p style={{ fontSize: 13, fontWeight: 800, color: '#FF6666' }}>
                    {a.item?.codigo_lote ?? 'Lote'} · {a.producto} ({a.envase})
                  </p>
                </div>
                <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginBottom: 4 }}>
                  Declarado: <strong style={{ color: 'var(--cream)' }}>{a.cantidad_declarada}</strong> ·
                  {' '}Recibido: <strong style={{ color: 'var(--cream)' }}>{a.cantidad_recibida}</strong> ·
                  {' '}Diferencia: <strong style={{ color: a.diferencia < 0 ? '#FF6666' : a.diferencia > 0 ? '#4ADE80' : 'rgba(255,255,255,0.4)' }}>{a.diferencia > 0 ? '+' : ''}{a.diferencia}</strong>
                </p>
                {a.observacion && (
                  <p style={{ fontSize: 12, color: '#FF6666', marginBottom: 4, fontStyle: 'italic' }}>
                    "{a.observacion}"
                  </p>
                )}
                <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginBottom: 10 }}>
                  {new Date(a.created_at).toLocaleString('es-CL')}
                </p>

                {resolviendo === a.id ? (
                  <div>
                    <input
                      value={nota}
                      onChange={e => setNota(e.target.value)}
                      placeholder="Nota de resolución (ej: se reprocesó, error de conteo...)"
                      style={{
                        width: '100%', padding: '9px 12px', borderRadius: 9, border: '1px solid var(--border)',
                        background: 'rgba(255,255,255,0.03)', color: 'var(--cream)', fontSize: 12, outline: 'none', marginBottom: 8,
                      }}
                    />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={() => resolver(a.id)}
                        style={{ flex: 1, padding: '9px 0', borderRadius: 9, border: 'none', background: '#4ADE80', color: '#062', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}
                      >
                        Confirmar resolución
                      </button>
                      <button
                        onClick={() => { setResolviendo(null); setNota('') }}
                        style={{ padding: '9px 14px', borderRadius: 9, border: '1px solid var(--border)', background: 'transparent', color: 'rgba(255,255,255,0.4)', fontSize: 12, cursor: 'pointer' }}
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setResolviendo(a.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 10,
                      border: '1px solid rgba(74,222,128,0.35)', background: 'rgba(74,222,128,0.1)', color: '#4ADE80', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                    }}
                  >
                    <CheckCircle2 size={12} /> Marcar como resuelta
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
