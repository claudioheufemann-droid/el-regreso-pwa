'use client'

import { useMemo } from 'react'
import { TrendingUp, AlertCircle, CheckCircle2, Clock } from 'lucide-react'
import AppHeader from '@/components/ui/AppHeader'

interface Cliente { nombre_fantasia: string | null; vendedor: string | null }
interface Frequencia { nombre: string | null; segmento: string | null; alert_level: string | null; ciclo_promedio_dias: number | null; dias_sin_compra: number | null }
interface FollowUp { id: string; cliente_nombre_fantasia: string | null; estado: string; fecha_recordatorio: string; vendedor: string | null }
interface Visita { id: string; vendedor_id: string; tiene_venta: boolean | null; estado: string; iniciada_at: string }
interface Seguimiento { id: string; vendedor_id: string; tipo_accion: string; estado: string; fecha_hora_compromiso: string | null; visita_id: string | null }
interface VendedorUser { id: string; nombre: string }

export default function CRMMetricsClient({
  clientes, frequencias, followups, visitas = [], seguimientos = [], vendedores: vendedoresUsers = [],
}: {
  clientes: Cliente[]
  frequencias: Frequencia[]
  followups: FollowUp[]
  visitas?: Visita[]
  seguimientos?: Seguimiento[]
  vendedores?: VendedorUser[]
}) {
  const vendedorNombreMap = useMemo(() => Object.fromEntries(vendedoresUsers.map(v => [v.id, v.nombre])), [vendedoresUsers])

  // ── Efectividad de Visitas + Apertura/Contacto (últimos 30 días) ──
  const efectividad = useMemo(() => {
    const totalVisitas = visitas.length
    const conVenta = visitas.filter(v => v.tiene_venta === true).length
    const sinVentaConSeguimiento = visitas.filter(v => {
      if (v.tiene_venta === true) return false
      return seguimientos.some(s => s.visita_id === v.id && s.tipo_accion !== 'ninguna')
    }).length
    const efectividadPct = totalVisitas > 0 ? Math.round((conVenta / totalVisitas) * 100) : 0

    const porVendedor: Record<string, { total: number; conVenta: number }> = {}
    for (const v of visitas) {
      const key = v.vendedor_id
      if (!porVendedor[key]) porVendedor[key] = { total: 0, conVenta: 0 }
      porVendedor[key].total++
      if (v.tiene_venta === true) porVendedor[key].conVenta++
    }

    return { totalVisitas, conVenta, sinVentaConSeguimiento, efectividadPct, porVendedor }
  }, [visitas, seguimientos])

  // ── Control de agenda: pendientes/atrasados de hoy por vendedor ──
  const agendaHoy = useMemo(() => {
    const now = Date.now()
    const hoyStr = new Date().toDateString()
    const pendientesHoy = seguimientos.filter(s => s.estado === 'pendiente' && s.fecha_hora_compromiso && new Date(s.fecha_hora_compromiso).toDateString() === hoyStr)
    const atrasados = seguimientos.filter(s => s.estado === 'pendiente' && s.fecha_hora_compromiso && new Date(s.fecha_hora_compromiso).getTime() < now)

    const porVendedor: Record<string, { pendientesHoy: number; atrasados: number }> = {}
    for (const s of pendientesHoy) {
      if (!porVendedor[s.vendedor_id]) porVendedor[s.vendedor_id] = { pendientesHoy: 0, atrasados: 0 }
      porVendedor[s.vendedor_id].pendientesHoy++
    }
    for (const s of atrasados) {
      if (!porVendedor[s.vendedor_id]) porVendedor[s.vendedor_id] = { pendientesHoy: 0, atrasados: 0 }
      porVendedor[s.vendedor_id].atrasados++
    }
    return { totalAtrasados: atrasados.length, porVendedor }
  }, [seguimientos])

  // ── Metrics derivadas ────────────────────────────────────────────
  const metrics = useMemo(() => {
    const totalClientes = frequencias.length
    const segmentCounts = { A: 0, B: 0, C: 0, D: 0, E: 0 }
    const vendorFUCounts: Record<string, { total: number; completados: number }> = {}

    for (const f of frequencias) {
      const seg = f.segmento ?? 'E'
      if (seg in segmentCounts) (segmentCounts as Record<string, number>)[seg]++
    }

    for (const fu of followups) {
      const vendor = fu.vendedor ?? 'Sin asignar'
      if (!vendorFUCounts[vendor]) vendorFUCounts[vendor] = { total: 0, completados: 0 }
      vendorFUCounts[vendor].total++
      if (fu.estado === 'completado') vendorFUCounts[vendor].completados++
    }

    const totalFU = followups.length
    const completedFU = followups.filter(f => f.estado === 'completado').length
    const pendienteFU = totalFU - completedFU
    const avgSegment = frequencias.reduce((sum, f) => {
      const v = { A: 5, B: 4, C: 3, D: 2, E: 1 }[f.segmento ?? 'E'] ?? 1
      return sum + v
    }, 0) / (totalClientes || 1)

    return {
      totalClientes,
      segmentCounts,
      totalFU,
      completedFU,
      pendienteFU,
      fuCompletionRate: totalFU > 0 ? Math.round((completedFU / totalFU) * 100) : 0,
      avgSegment: avgSegment.toFixed(1),
      vendorFUCounts,
    }
  }, [frequencias, followups])

  return (
    <div style={{ minHeight: '100vh', background: '#090909', color: '#fff' }}>
      <div style={{ maxWidth: 1800, margin: '0 auto', padding: '16px 16px 60px' }}>
        <AppHeader title="CRM Metrics" />
        {/* KPI Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(240px, 100%), 1fr))', gap: 16, marginBottom: 32 }}>
          <KPICard icon={<TrendingUp size={20} />} label="Clientes" value={metrics.totalClientes} color="#D4AF37" />
          <KPICard icon={<CheckCircle2 size={20} />} label="Score promedio" value={`${metrics.avgSegment}/5`} color="#5A8A4A" />
          <KPICard icon={<Clock size={20} />} label="Follow-ups pendientes" value={metrics.pendienteFU} color="#D4AF37" highlight={metrics.pendienteFU > 10} />
          <KPICard icon={<AlertCircle size={20} />} label="Tasa completación" value={`${metrics.fuCompletionRate}%`} color="#D4AF37" />
        </div>

        {/* Efectividad de Visitas (últimos 30 días) */}
        <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 10 }}>Efectividad comercial · últimos 30 días</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(240px, 100%), 1fr))', gap: 16, marginBottom: 32 }}>
          <KPICard icon={<TrendingUp size={20} />} label="Efectividad de visitas" value={`${efectividad.efectividadPct}%`} color="#D4AF37" />
          <KPICard icon={<CheckCircle2 size={20} />} label="Visitas con venta" value={`${efectividad.conVenta} / ${efectividad.totalVisitas}`} color="#5A8A4A" />
          <KPICard icon={<Clock size={20} />} label="Apertura / Contacto" value={efectividad.sinVentaConSeguimiento} color="#60A5FA" />
          <KPICard icon={<AlertCircle size={20} />} label="Seguimientos atrasados" value={agendaHoy.totalAtrasados} color="#B5543E" highlight={agendaHoy.totalAtrasados > 0} />
        </div>

        {/* Control de agenda por vendedor */}
        {Object.keys(agendaHoy.porVendedor).length > 0 && (
          <div style={{ background: 'var(--surface2)', borderRadius: 14, padding: 20, marginBottom: 24, border: '1px solid var(--border)' }}>
            <p style={{ fontSize: 14, fontWeight: 700, marginBottom: 16, color: 'var(--cream)' }}>Control de agenda — hoy</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {Object.entries(agendaHoy.porVendedor).map(([vendedorId, c]) => (
                <div key={vendedorId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0' }}>
                  <p style={{ fontSize: 13, color: '#ccc', fontWeight: 600 }}>{vendedorNombreMap[vendedorId] ?? vendedorId}</p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#60A5FA', background: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.25)', padding: '3px 9px', borderRadius: 8 }}>{c.pendientesHoy} hoy</span>
                    {c.atrasados > 0 && (
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#B5543E', background: 'rgba(181,84,62,0.1)', border: '1px solid rgba(181,84,62,0.25)', padding: '3px 9px', borderRadius: 8 }}>{c.atrasados} atrasados</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Efectividad por vendedor */}
        {Object.keys(efectividad.porVendedor).length > 0 && (
          <div style={{ background: 'var(--surface2)', borderRadius: 14, padding: 20, marginBottom: 24, border: '1px solid var(--border)' }}>
            <p style={{ fontSize: 14, fontWeight: 700, marginBottom: 16, color: 'var(--cream)' }}>Efectividad de visitas por vendedor</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {Object.entries(efectividad.porVendedor).map(([vendedorId, c]) => {
                const pct = c.total > 0 ? Math.round((c.conVenta / c.total) * 100) : 0
                return (
                  <div key={vendedorId} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <p style={{ fontSize: 13, color: '#888', minWidth: 140 }}>{vendedorNombreMap[vendedorId] ?? vendedorId}</p>
                    <div style={{ flex: 1, background: 'rgba(255,255,255,0.04)', height: 24, borderRadius: 6, overflow: 'hidden' }}>
                      <div style={{ background: pct > 50 ? '#5A8A4A' : pct > 25 ? '#D4AF37' : '#B5543E', height: '100%', width: `${pct}%`, borderRadius: 6 }} />
                    </div>
                    <p style={{ fontSize: 12, fontWeight: 700, minWidth: 90, textAlign: 'right', color: '#888' }}>{c.conVenta}/{c.total} ({pct}%)</p>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Segmentation Distribution */}
        <div style={{ background: 'var(--surface2)', borderRadius: 14, padding: 20, marginBottom: 24, border: '1px solid var(--border)' }}>
          <p style={{ fontSize: 14, fontWeight: 700, marginBottom: 16, color: 'var(--cream)' }}>Distribución de segmentos</p>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
            {(['A', 'B', 'C', 'D', 'E'] as const).map(seg => {
              const count = metrics.segmentCounts[seg]
              const pct = metrics.totalClientes > 0 ? (count / metrics.totalClientes) * 100 : 0
              const colors: Record<string, string> = { A: '#D4AF37', B: '#5A8A4A', C: '#D4AF37', D: '#D4AF37', E: '#B5543E' }
              return (
                <div key={seg} style={{ flex: 1, textAlign: 'center' }}>
                  <div style={{ background: colors[seg], height: `${Math.max(20, pct * 2)}px`, borderRadius: 4, marginBottom: 8 }} />
                  <p style={{ fontSize: 12, fontWeight: 700, color: colors[seg] }}>{seg}</p>
                  <p style={{ fontSize: 11, color: '#555' }}>{count} ({pct.toFixed(0)}%)</p>
                </div>
              )
            })}
          </div>
        </div>

        {/* Follow-ups by Vendor */}
        <div style={{ background: 'var(--surface2)', borderRadius: 14, padding: 20, border: '1px solid var(--border)' }}>
          <p style={{ fontSize: 14, fontWeight: 700, marginBottom: 16, color: 'var(--cream)' }}>Follow-ups por vendedor</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {Object.entries(metrics.vendorFUCounts).map(([vendor, counts]) => {
              const completionRate = counts.total > 0 ? Math.round((counts.completados / counts.total) * 100) : 0
              return (
                <div key={vendor} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <p style={{ fontSize: 13, color: '#888', minWidth: 140 }}>{vendor}</p>
                  <div style={{ flex: 1, background: 'rgba(255,255,255,0.04)', height: 24, borderRadius: 6, overflow: 'hidden' }}>
                    <div style={{
                      background: completionRate > 80 ? '#5A8A4A' : completionRate > 50 ? '#D4AF37' : '#B5543E',
                      height: '100%', width: `${completionRate}%`, borderRadius: 6,
                    }} />
                  </div>
                  <p style={{ fontSize: 12, fontWeight: 700, minWidth: 80, textAlign: 'right', color: '#888' }}>
                    {counts.completados}/{counts.total} ({completionRate}%)
                  </p>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

function KPICard({ icon, label, value, color, highlight }: { icon: React.ReactNode; label: string; value: string | number; color: string; highlight?: boolean }) {
  return (
    <div style={{
      background: 'var(--surface2)', borderRadius: 14, padding: 20, border: `1px solid ${highlight ? color + '40' : 'var(--border)'}`,
      borderLeft: `3px solid ${color}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <div style={{ color }}>{icon}</div>
        <p style={{ fontSize: 12, color: '#666', fontWeight: 700 }}>{label}</p>
      </div>
      <p style={{ fontSize: 32, fontWeight: 900, color }}>{value}</p>
    </div>
  )
}
