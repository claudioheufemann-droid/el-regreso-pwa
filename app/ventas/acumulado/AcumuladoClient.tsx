'use client'

import { useState } from 'react'
import { Droplets, TrendingUp } from 'lucide-react'
import { Periodo } from '@/lib/types'

interface Props {
  resumen: Record<string, Record<string, { litros: number; venta: number }>>
  porFecha: Record<string, Record<string, number>>
  periodo: Periodo | null
  vendedores: string[]
}

const COLORES_CATEGORIA: Record<string, string> = {
  'Bar': '#D4AF37',
  'Minimarket': '#60A5FA',
  'Cafetería': '#4ADE80',
  'Botillería': '#A78BFA',
  'Almacén': '#FB923C',
  'Restaurante': '#F472B6',
  'Supermercado': '#38BDF8',
  'Distribuidor': '#86EFAC',
  'Actividades Turísticas': '#FCD34D',
  'Cliente Directo': '#E879F9',
  'Otros': '#6B7280',
}

function formatLitros(n: number) { return n.toFixed(1) }
function formatPeso(n: number) { return '$' + Math.round(n).toLocaleString('es-CL') }

function CategoriaBar({ categoria, litros, total, color }: { categoria: string; litros: number; total: number; color: string }) {
  const pct = total > 0 ? Math.min(100, (litros / total) * 100) : 0
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />
          <span style={{ fontSize: 13, color: 'var(--cream)' }}>{categoria}</span>
        </div>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--cream)' }}>{formatLitros(litros)} L</span>
      </div>
      <div style={{ height: 6, borderRadius: 6, overflow: 'hidden', background: 'rgba(255,255,255,0.06)' }}>
        <div className="animate-progress" style={{ height: '100%', borderRadius: 6, width: `${pct}%`, background: color }} />
      </div>
      <p style={{ fontSize: 11, textAlign: 'right', color: 'var(--muted)' }}>{pct.toFixed(1)}%</p>
    </div>
  )
}

function VendedorAcumulado({ vendedor, categorias }: { vendedor: string; categorias: Record<string, { litros: number; venta: number }> }) {
  const total = Object.values(categorias).reduce((s, c) => s + c.litros, 0)
  const totalVenta = Object.values(categorias).reduce((s, c) => s + c.venta, 0)
  const sorted = Object.entries(categorias).sort((a, b) => b[1].litros - a[1].litros)

  return (
    <div className="card-hover animate-fade-in" style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 20,
      overflow: 'hidden',
    }}>
      <div style={{ height: 3, background: 'var(--gold)' }} />
      <div style={{
        padding: '16px 20px 14px',
        borderBottom: '1px solid var(--border-subtle)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <h3 style={{ fontWeight: 800, color: 'var(--cream)', fontSize: 16, letterSpacing: '-0.3px' }}>{vendedor}</h3>
        <div style={{ textAlign: 'right' }}>
          <p style={{ fontSize: 22, fontWeight: 900, color: 'var(--gold)', letterSpacing: '-0.8px' }}>{formatLitros(total)} L</p>
          <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>{formatPeso(totalVenta)}</p>
        </div>
      </div>
      <div style={{ padding: '16px 20px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {sorted.map(([cat, data]) => (
          <CategoriaBar
            key={cat}
            categoria={cat}
            litros={data.litros}
            total={total}
            color={COLORES_CATEGORIA[cat] ?? '#6B7280'}
          />
        ))}
      </div>
    </div>
  )
}

function HistorialFechas({ porFecha, vendedores }: { porFecha: Record<string, Record<string, number>>; vendedores: string[] }) {
  const fechas = Object.keys(porFecha).sort((a, b) => b.localeCompare(a)).slice(0, 14)
  const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

  function formatFecha(d: string) {
    const [, m, day] = d.split('-')
    return `${parseInt(day)} ${meses[parseInt(m) - 1]}`
  }

  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 20,
      overflow: 'hidden',
    }}>
      <div style={{ height: 3, background: 'var(--gold)' }} />
      <div style={{ padding: '16px 20px 14px', borderBottom: '1px solid var(--border-subtle)' }}>
        <h3 style={{ fontWeight: 800, color: 'var(--cream)', fontSize: 16 }}>Historial de ventas</h3>
        <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>Últimos días del período</p>
      </div>
      <div>
        {fechas.map((fecha, idx) => {
          const totales = vendedores.map(v => ({ vendedor: v, litros: porFecha[fecha]?.[v] ?? 0 }))
          const totalDia = totales.reduce((s, t) => s + t.litros, 0)
          return (
            <div key={fecha} style={{
              padding: '14px 20px',
              borderBottom: idx < fechas.length - 1 ? '1px solid var(--row-sep)' : 'none',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--cream)' }}>{formatFecha(fecha)}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--gold)' }}>{totalDia.toFixed(1)} L total</span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {totales.map(({ vendedor, litros }) => (
                  <div key={vendedor} style={{
                    flex: 1, borderRadius: 10, padding: '8px 12px', background: 'var(--surface2)',
                  }}>
                    <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 2 }}>{vendedor.split(' ')[0]}</p>
                    <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--cream)' }}>{litros.toFixed(1)} L</p>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function AcumuladoClient({ resumen, porFecha, periodo, vendedores }: Props) {
  const [vista, setVista] = useState<'categoria' | 'historial'>('categoria')

  const totalGeneral = vendedores.reduce((s, v) => {
    return s + Object.values(resumen[v] ?? {}).reduce((ss, c) => ss + c.litros, 0)
  }, 0)

  return (
    <div style={{ padding: 'var(--sp-3) var(--sp-3) 60px', maxWidth: 1100 }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 'var(--fs-title)', fontWeight: 900, color: 'var(--cream)', letterSpacing: '-1px', lineHeight: 1.1 }}>
          Período Acumulado
        </h1>
        {periodo && (
          <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 6 }}>{periodo.nombre}</p>
        )}
      </div>

      {/* KPI total */}
      <div style={{
        background: 'linear-gradient(135deg, #110D00 0%, #1C1500 100%)',
        border: '1px solid rgba(212,175,55,0.25)',
        borderRadius: 20,
        padding: '24px 32px',
        marginBottom: 28,
        display: 'flex',
        alignItems: 'center',
        gap: 48,
        flexWrap: 'wrap',
      }}>
        <div>
          <p style={{ fontSize: 9, fontWeight: 700, color: 'rgba(212,175,55,0.6)', letterSpacing: '1.8px', textTransform: 'uppercase', marginBottom: 8 }}>
            Total período
          </p>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ fontSize: 48, fontWeight: 900, color: 'var(--gold)', letterSpacing: '-2px', lineHeight: 1 }}>
              {totalGeneral.toFixed(1)}
            </span>
            <span style={{ fontSize: 20, fontWeight: 700, color: '#A8870F' }}>L</span>
          </div>
        </div>
        <div style={{ width: 1, height: 56, background: 'var(--border)', flexShrink: 0 }} />
        {vendedores.map(v => {
          const lt = Object.values(resumen[v] ?? {}).reduce((s, c) => s + c.litros, 0)
          return (
            <div key={v}>
              <p style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted)', marginBottom: 4 }}>{v.split(' ')[0]}</p>
              <p style={{ fontSize: 22, fontWeight: 800, color: 'var(--cream)', letterSpacing: '-0.5px' }}>{lt.toFixed(1)} L</p>
            </div>
          )
        })}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderRadius: 12, padding: 4, background: 'var(--surface)', marginBottom: 24, width: 'fit-content' }}>
        {[
          { key: 'categoria', label: 'Por Categoría', icon: <TrendingUp size={13} /> },
          { key: 'historial', label: 'Historial',     icon: <Droplets size={13} /> },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setVista(tab.key as 'categoria' | 'historial')}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 18px', borderRadius: 9,
              fontSize: 13, fontWeight: 600,
              border: 'none', cursor: 'pointer',
              background: vista === tab.key ? 'var(--gold)' : 'transparent',
              color: vista === tab.key ? '#080808' : 'var(--muted)',
              transition: 'all 0.15s',
            }}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {vista === 'categoria' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 20 }}>
          {vendedores.map(v => resumen[v] && (
            <VendedorAcumulado key={v} vendedor={v} categorias={resumen[v]} />
          ))}
        </div>
      )}

      {vista === 'historial' && (
        <div style={{ maxWidth: 760 }}>
          <HistorialFechas porFecha={porFecha} vendedores={vendedores} />
        </div>
      )}
    </div>
  )
}
