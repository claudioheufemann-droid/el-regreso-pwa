'use client'

import { useMemo } from 'react'
import { ArrowLeft, TrendingUp, AlertCircle, CheckCircle2, Clock } from 'lucide-react'
import { useRouter } from 'next/navigation'

interface Cliente { nombre_fantasia: string | null; vendedor: string | null }
interface Frequencia { nombre: string | null; segmento: string | null; alert_level: string | null; ciclo_promedio_dias: number | null; dias_sin_compra: number | null }
interface FollowUp { id: string; cliente_nombre_fantasia: string | null; estado: string; fecha_recordatorio: string; vendedor: string | null }

export default function CRMMetricsClient({
  clientes, frequencias, followups,
}: {
  clientes: Cliente[]
  frequencias: Frequencia[]
  followups: FollowUp[]
}) {
  const router = useRouter()

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
      {/* Header */}
      <div style={{ padding: '20px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
        <button onClick={() => router.back()} style={{
          background: 'none', border: 'none', cursor: 'pointer', color: '#666', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, marginBottom: 12,
        }}>
          <ArrowLeft size={16} /> Volver
        </button>
        <h1 style={{ fontSize: 28, fontWeight: 900, marginBottom: 2 }}>CRM Metrics</h1>
        <p style={{ fontSize: 13, color: '#666' }}>Overview de scores, follow-ups y vendedores</p>
      </div>

      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '24px' }}>
        {/* KPI Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16, marginBottom: 32 }}>
          <KPICard icon={<TrendingUp size={20} />} label="Clientes" value={metrics.totalClientes} color="#D4AF37" />
          <KPICard icon={<CheckCircle2 size={20} />} label="Score promedio" value={`${metrics.avgSegment}/5`} color="#34D399" />
          <KPICard icon={<Clock size={20} />} label="Follow-ups pendientes" value={metrics.pendienteFU} color="#F59E0B" highlight={metrics.pendienteFU > 10} />
          <KPICard icon={<AlertCircle size={20} />} label="Tasa completación" value={`${metrics.fuCompletionRate}%`} color="#60A5FA" />
        </div>

        {/* Segmentation Distribution */}
        <div style={{ background: 'var(--surface2)', borderRadius: 14, padding: 20, marginBottom: 24, border: '1px solid var(--border)' }}>
          <p style={{ fontSize: 14, fontWeight: 700, marginBottom: 16, color: 'var(--cream)' }}>Distribución de segmentos</p>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
            {(['A', 'B', 'C', 'D', 'E'] as const).map(seg => {
              const count = metrics.segmentCounts[seg]
              const pct = (count / metrics.totalClientes) * 100
              const colors: Record<string, string> = { A: '#D4AF37', B: '#34D399', C: '#60A5FA', D: '#F59E0B', E: '#F87171' }
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
                      background: completionRate > 80 ? '#34D399' : completionRate > 50 ? '#F59E0B' : '#F87171',
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
