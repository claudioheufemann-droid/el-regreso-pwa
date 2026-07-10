'use client'

import { useState, useEffect, useCallback } from 'react'
import AppHeader from '@/components/ui/AppHeader'
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
  created_at: string
  item: { codigo_lote: string } | null
}

export default function AlertasClient() {
  const [alertas, setAlertas] = useState<AlertaRow[]>([])
  const [loading, setLoading] = useState(true)
  const [resolviendo, setResolviendo] = useState<string | null>(null)
  const [nota, setNota] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    fetch('/api/logistica/alertas?resuelta=false')
      .then(r => r.json())
      .then(data => setAlertas(Array.isArray(data) ? data : []))
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
          <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>Cargando…</p>
        ) : alertas.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 0', color: 'rgba(255,255,255,0.3)' }}>
            <ShieldCheck size={30} style={{ marginBottom: 10, opacity: 0.4 }} />
            <p style={{ fontSize: 13 }}>Sin descuadres pendientes. Todo cuadra 🎉</p>
          </div>
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
                  {' '}Diferencia: <strong style={{ color: a.diferencia < 0 ? '#FF6666' : '#4ADE80' }}>{a.diferencia > 0 ? '+' : ''}{a.diferencia}</strong>
                </p>
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
