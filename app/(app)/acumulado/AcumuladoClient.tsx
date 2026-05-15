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
  'Bar': '#F59E0B',
  'Minimarket': '#60A5FA',
  'Cafetería': '#34D399',
  'Botillería': '#A78BFA',
  'Almacén': '#FB923C',
  'Restaurante': '#F472B6',
  'Supermercado': '#38BDF8',
  'Distribuidor': '#4ADE80',
  'Actividades Turísticas': '#FACC15',
  'Cliente Directo': '#E879F9',
  'Otros': '#6B7280',
}

function formatLitros(n: number) { return n.toFixed(1) }
function formatPeso(n: number) { return '$' + Math.round(n).toLocaleString('es-CL') }

function CategoriaBar({ categoria, litros, total, color }: { categoria: string; litros: number; total: number; color: string }) {
  const pct = total > 0 ? Math.min(100, (litros / total) * 100) : 0
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
          <span className="text-sm text-white">{categoria}</span>
        </div>
        <span className="text-sm font-bold text-white">{formatLitros(litros)} L</span>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ background: '#2A2A2A' }}>
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <p className="text-xs text-right" style={{ color: '#666' }}>{pct.toFixed(1)}%</p>
    </div>
  )
}

function VendedorAcumulado({ vendedor, categorias }: { vendedor: string; categorias: Record<string, { litros: number; venta: number }> }) {
  const total = Object.values(categorias).reduce((s, c) => s + c.litros, 0)
  const totalVenta = Object.values(categorias).reduce((s, c) => s + c.venta, 0)
  const sorted = Object.entries(categorias).sort((a, b) => b[1].litros - a[1].litros)
  const firstName = vendedor.split(' ')[0]

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: '#1A1A1A', border: '1px solid #2A2A2A' }}>
      <div className="px-4 pt-4 pb-3" style={{ borderBottom: '1px solid #242424' }}>
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-white text-base">{vendedor}</h3>
          <div className="text-right">
            <p className="text-xl font-black" style={{ color: '#F59E0B' }}>{formatLitros(total)} L</p>
            <p className="text-xs" style={{ color: '#888' }}>{formatPeso(totalVenta)}</p>
          </div>
        </div>
      </div>
      <div className="px-4 py-4 space-y-4">
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
    const [y, m, day] = d.split('-')
    return `${parseInt(day)} ${meses[parseInt(m) - 1]}`
  }

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: '#1A1A1A', border: '1px solid #2A2A2A' }}>
      <div className="px-4 pt-4 pb-3" style={{ borderBottom: '1px solid #242424' }}>
        <h3 className="font-bold text-white">Historial de ventas</h3>
        <p className="text-xs mt-0.5" style={{ color: '#888' }}>Últimos días del período</p>
      </div>
      <div className="divide-y" style={{ borderColor: '#242424' }}>
        {fechas.map(fecha => {
          const totales = vendedores.map(v => ({ vendedor: v, litros: porFecha[fecha]?.[v] ?? 0 }))
          const totalDia = totales.reduce((s, t) => s + t.litros, 0)
          return (
            <div key={fecha} className="px-4 py-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-white">{formatFecha(fecha)}</span>
                <span className="text-sm font-bold" style={{ color: '#F59E0B' }}>{totalDia.toFixed(1)} L total</span>
              </div>
              <div className="flex gap-3">
                {totales.map(({ vendedor, litros }) => (
                  <div key={vendedor} className="flex-1 rounded-lg px-3 py-2" style={{ background: '#242424' }}>
                    <p className="text-xs mb-0.5" style={{ color: '#888' }}>{vendedor.split(' ')[0]}</p>
                    <p className="text-sm font-bold text-white">{litros.toFixed(1)} L</p>
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
    <div className="px-4 pt-6 pb-4 max-w-5xl mx-auto">
      <div className="mb-5">
        <h1 className="text-2xl font-black text-white">Período Acumulado</h1>
        {periodo && (
          <p className="text-sm mt-1" style={{ color: '#888' }}>{periodo.nombre}</p>
        )}
      </div>

      {/* Total general del período */}
      <div
        className="rounded-2xl p-4 mb-5"
        style={{ background: 'linear-gradient(135deg, #1C1600 0%, #2A1F00 100%)', border: '1px solid #3D2E00' }}
      >
        <p className="text-xs font-semibold mb-2 tracking-wider" style={{ color: '#F59E0B99' }}>TOTAL PERÍODO</p>
        <div className="flex items-end gap-4">
          <div>
            <span className="text-4xl font-black" style={{ color: '#F59E0B' }}>{totalGeneral.toFixed(1)}</span>
            <span className="text-lg font-bold ml-1" style={{ color: '#D97706' }}>L</span>
          </div>
          <div className="mb-1 flex gap-4">
            {vendedores.map(v => {
              const lt = Object.values(resumen[v] ?? {}).reduce((s, c) => s + c.litros, 0)
              return (
                <div key={v}>
                  <p className="text-xs" style={{ color: '#888' }}>{v.split(' ')[0]}</p>
                  <p className="text-base font-bold text-white">{lt.toFixed(1)} L</p>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex rounded-xl p-1 mb-5" style={{ background: '#1A1A1A' }}>
        {[
          { key: 'categoria', label: 'Por Categoría', icon: <TrendingUp size={14} /> },
          { key: 'historial', label: 'Historial', icon: <Droplets size={14} /> },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setVista(tab.key as 'categoria' | 'historial')}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-all"
            style={{
              background: vista === tab.key ? '#F59E0B' : 'transparent',
              color: vista === tab.key ? '#000' : '#888',
            }}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {vista === 'categoria' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {vendedores.map(v => resumen[v] && (
            <VendedorAcumulado key={v} vendedor={v} categorias={resumen[v]} />
          ))}
        </div>
      )}

      {vista === 'historial' && (
        <HistorialFechas porFecha={porFecha} vendedores={vendedores} />
      )}
    </div>
  )
}
