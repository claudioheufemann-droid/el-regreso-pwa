'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { CalendarClock } from 'lucide-react'
import Logo from '@/components/ui/Logo'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States'

interface Jornada {
  id: string
  fecha: string
  km_declarados: number | null
  km_gps: number | null
  diferencia_pct: number | null
  requiere_revision: boolean | null
  monto_reembolso: number | null
  estado: string
  iniciada_at: string
  finalizada_at: string | null
  vendedor: { nombre: string; iniciales: string } | null
}

const ESTADO_INFO: Record<string, { label: string; color: string }> = {
  abierta:   { label: 'En curso',            color: '#5B8AA8' },
  cerrada:   { label: 'Pendiente de revisión', color: '#D4AF37' },
  aprobada:  { label: 'Aprobada',            color: '#22C55E' },
  rechazada: { label: 'Rechazada',           color: '#FF4444' },
}

export default function JornadasAdminPage() {
  const [jornadas, setJornadas] = useState<Jornada[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<'todas' | 'revision' | 'pendientes'>('revision')

  // Antes un fallo de red se veía idéntico a "no hay jornadas": la lista
  // quedaba vacía y el mensaje decía "Sin jornadas en este filtro", que es
  // mentira y hace tomar decisiones sobre datos que nunca llegaron.
  const cargar = useCallback(() => {
    setLoading(true)
    setError(null)
    fetch('/api/admin/jornadas')
      .then(async r => {
        if (!r.ok) throw new Error(`La API respondió ${r.status}`)
        return r.json()
      })
      .then(data => setJornadas(Array.isArray(data) ? data : []))
      .catch(err => setError(err instanceof Error ? err.message : 'Error desconocido'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { cargar() }, [cargar])

  const filtradas = jornadas.filter(j => {
    if (filtro === 'revision') return j.requiere_revision && j.estado === 'cerrada'
    if (filtro === 'pendientes') return j.estado === 'cerrada'
    return true
  })

  const stats = {
    total: jornadas.length,
    revision: jornadas.filter(j => j.requiere_revision && j.estado === 'cerrada').length,
    pendientes: jornadas.filter(j => j.estado === 'cerrada').length,
    reembolsoTotal: jornadas.filter(j => j.estado === 'aprobada').reduce((s, j) => s + (j.monto_reembolso ?? 0), 0),
  }

  return (
    <div style={{ minHeight: '100vh', background: '#07070D', color: '#F4EEDF' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 28px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(15,15,24,0.95)', backdropFilter: 'blur(10px)', position: 'sticky', top: 0, zIndex: 10 }}>
        <Logo size={28} />
        <a href="/gestion" style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>
          Volver
        </a>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#F4EEDF' }}>Kilometraje y combustible</div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>Auditoría de terreno · El Regreso</div>
        </div>
        <a href="/admin/usuarios" style={{ fontSize: 11, color: '#D4AF37', textDecoration: 'none' }}>Usuarios →</a>
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', padding: '4px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
          ★ Solo admins
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px' }}>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 28 }}>
          {[
            { label: 'Jornadas registradas', value: stats.total,       color: '#5B8AA8' },
            { label: 'Pendientes de revisión', value: stats.pendientes, color: '#D4AF37' },
            { label: 'Con descuadre',         value: stats.revision,   color: '#FF4444' },
            { label: 'Reembolsado (aprobado)', value: `$${stats.reembolsoTotal.toLocaleString('es-CL')}`, color: '#22C55E' },
          ].map(k => (
            <div key={k.label} style={{ background: `${k.color}08`, border: `1px solid ${k.color}22`, borderRadius: 16, padding: '18px 20px' }}>
              <div style={{ fontSize: 26, fontWeight: 900, color: k.color, lineHeight: 1, marginBottom: 4 }}>{k.value}</div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8 }}>{k.label}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 6, marginBottom: 18 }}>
          {([
            { key: 'revision',   label: 'Con descuadre' },
            { key: 'pendientes', label: 'Pendientes de revisión' },
            { key: 'todas',      label: 'Todas' },
          ] as { key: typeof filtro; label: string }[]).map(f => (
            <button key={f.key} onClick={() => setFiltro(f.key)}
              style={{ padding: '8px 14px', borderRadius: 9, border: `1px solid ${filtro === f.key ? '#D4AF3760' : 'rgba(255,255,255,0.08)'}`, background: filtro === f.key ? 'rgba(212,175,55,0.12)' : 'transparent', fontSize: 12, color: filtro === f.key ? '#D4AF37' : 'rgba(255,255,255,0.4)', cursor: 'pointer', fontWeight: filtro === f.key ? 700 : 500 }}>
              {f.label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {loading && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[0, 1, 2, 3].map(i => <Skeleton key={i} height={62} radius={14} />)}
            </div>
          )}
          {!loading && error && (
            <ErrorState
              title="No pudimos cargar las jornadas"
              hint="Revisa tu conexión y vuelve a intentar."
              detail={error}
              showDetail
              onRetry={cargar}
            />
          )}
          {!loading && !error && filtradas.length === 0 && (
            <EmptyState
              icon={CalendarClock}
              title="Sin jornadas en este filtro"
              hint="Cambia el filtro de arriba o espera a que un vendedor cierre su jornada."
            />
          )}
          {filtradas.map(j => {
            const info = ESTADO_INFO[j.estado] ?? { label: j.estado, color: 'rgba(255,255,255,0.4)' }
            return (
              <Link key={j.id} href={`/admin/jornadas/${j.id}`} style={{ textDecoration: 'none' }}>
                <div style={{
                  display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 1fr 1fr 1fr', gap: 10, alignItems: 'center',
                  padding: '14px 18px', borderRadius: 14, cursor: 'pointer',
                  background: j.requiere_revision && j.estado === 'cerrada' ? 'rgba(255,68,68,0.05)' : 'rgba(255,255,255,0.02)',
                  border: `1px solid ${j.requiere_revision && j.estado === 'cerrada' ? 'rgba(255,68,68,0.25)' : 'rgba(255,255,255,0.06)'}`,
                }}>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 800, color: '#F4EEDF' }}>{j.vendedor?.nombre ?? '—'}</p>
                    <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>{new Date(j.fecha).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                  </div>
                  <div>
                    <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase' }}>Declarado</p>
                    <p style={{ fontSize: 13, fontWeight: 700, color: '#F4EEDF' }}>{j.km_declarados != null ? `${j.km_declarados} km` : '—'}</p>
                  </div>
                  <div>
                    <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase' }}>GPS real</p>
                    <p style={{ fontSize: 13, fontWeight: 700, color: '#F4EEDF' }}>{j.km_gps != null ? `${j.km_gps.toFixed(1)} km` : '—'}</p>
                  </div>
                  <div>
                    <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase' }}>Diferencia</p>
                    <p style={{ fontSize: 13, fontWeight: 900, color: j.requiere_revision ? '#FF4444' : '#22C55E' }}>{j.diferencia_pct != null ? `${j.diferencia_pct.toFixed(0)}%` : '—'}</p>
                  </div>
                  <div>
                    <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase' }}>Reembolso</p>
                    <p style={{ fontSize: 13, fontWeight: 700, color: '#D4AF37' }}>{j.monto_reembolso != null ? `$${j.monto_reembolso.toLocaleString('es-CL')}` : '—'}</p>
                  </div>
                  <div>
                    <span style={{ padding: '4px 9px', borderRadius: 8, fontSize: 10, fontWeight: 800, color: info.color, background: `${info.color}18`, border: `1px solid ${info.color}40` }}>
                      {info.label}
                    </span>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}
