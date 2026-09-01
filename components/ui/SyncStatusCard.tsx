'use client'

import { useEffect, useState } from 'react'
import { CheckCircle, XCircle, RefreshCw, Clock } from 'lucide-react'

interface CorridaLog {
  ok: boolean; origen: 'automatico' | 'manual'; mensaje: string | null
  total: number | null; insertados: number | null; actualizados: number | null; eliminados: number | null
  creado_at: string
}
interface EstadoFuente { ultimaCorrida: CorridaLog | null; total: number }
interface EstadoSync { clientes: EstadoFuente; deudores: EstadoFuente; stock: EstadoFuente; barriles: EstadoFuente }

function hace(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const min = Math.floor(ms / 60000)
  if (min < 1) return 'recién'
  if (min < 60) return `hace ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `hace ${h} h`
  const d = Math.floor(h / 24)
  return `hace ${d} d`
}

/** Panel de estado de la sincronización automática ERP → PWA (Clientes o
 *  Deudores), para que el admin vea si sigue corriendo sola sin ir a GitHub
 *  Actions. `fuente` decide qué mitad de /api/erp-sync-status mostrar. */
export default function SyncStatusCard({ fuente }: { fuente: 'clientes' | 'deudores' | 'stock' | 'barriles' }) {
  const [estado, setEstado] = useState<EstadoFuente | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelado = false
    async function cargar() {
      try {
        const res = await fetch('/api/erp-sync-status')
        const data: EstadoSync = await res.json()
        if (!cancelado) setEstado(data[fuente])
      } catch {
        // Si falla la consulta de estado, simplemente no se muestra el panel.
      } finally {
        if (!cancelado) setLoading(false)
      }
    }
    cargar()
    return () => { cancelado = true }
  }, [fuente])

  if (loading) {
    return (
      <div style={{ borderRadius: 16, padding: '16px 20px', marginBottom: 16, background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <p style={{ fontSize: 12, color: 'var(--muted)' }}>Cargando estado de sincronización…</p>
      </div>
    )
  }

  const corrida = estado?.ultimaCorrida ?? null
  const ok = corrida?.ok ?? null

  return (
    <div style={{
      borderRadius: 16, padding: '16px 20px', marginBottom: 16,
      background: ok === false ? 'rgba(248,113,113,0.05)' : 'var(--surface)',
      border: `1px solid ${ok === false ? 'rgba(248,113,113,0.25)' : 'var(--border)'}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <RefreshCw size={15} style={{ color: '#D4AF37' }} />
        <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--cream)' }}>Sincronización automática con el ERP</p>
      </div>

      {!corrida ? (
        <p style={{ fontSize: 12, color: 'var(--muted)' }}>
          Todavía no hay corridas registradas. El workflow de GitHub sincroniza {fuente} cada hora.
        </p>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            {corrida.ok
              ? <CheckCircle size={15} style={{ color: '#5A8A4A' }} />
              : <XCircle size={15} style={{ color: '#B5543E' }} />}
            <span style={{ fontSize: 13, fontWeight: 700, color: corrida.ok ? '#5A8A4A' : '#B5543E' }}>
              {corrida.ok ? 'Última corrida OK' : 'La última corrida falló'}
            </span>
            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: 'var(--surface2)', color: 'var(--muted)' }}>
              {corrida.origen === 'automatico' ? 'Automática' : 'Manual'}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: corrida.ok ? 8 : 4 }}>
            <Clock size={12} style={{ color: 'var(--muted)' }} />
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>{hace(corrida.creado_at)}</span>
          </div>

          {corrida.ok ? (
            <p style={{ fontSize: 12, color: 'var(--muted)' }}>
              {fuente === 'stock' || fuente === 'barriles'
                ? `${corrida.total ?? 0} ${fuente === 'barriles' ? 'barriles' : 'productos'} (foto reemplazada completa)`
                : `${corrida.total ?? 0} procesados`}
              {fuente !== 'stock' && fuente !== 'barriles' && corrida.insertados != null && ` · ${corrida.insertados} nuevos`}
              {corrida.actualizados != null && corrida.actualizados > 0 && ` · ${corrida.actualizados} actualizados`}
              {corrida.eliminados != null && corrida.eliminados > 0 && ` · ${corrida.eliminados} eliminados`}
              {' · '}{estado?.total ?? 0} en total hoy
            </p>
          ) : (
            <p style={{ fontSize: 12, color: '#B5543E' }}>{corrida.mensaje ?? 'Error sin detalle'}</p>
          )}
        </>
      )}
    </div>
  )
}
