'use client'

import { useState } from 'react'
import { Target, Droplets } from 'lucide-react'
import { Meta, Periodo } from '@/lib/types'

interface Props {
  metas: Meta[]
  acumulado: Record<string, Record<string, number>>
  acumuladoHoy: Record<string, Record<string, number>>
  periodo: Periodo | null
  vendedores: string[]
}

const COLORES: Record<string, string> = {
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
  'Total': '#F59E0B',
  'Otros': '#6B7280',
}

function BarraMeta({
  meta,
  litrosAcum,
  litrosHoy,
}: {
  meta: Meta
  litrosAcum: number
  litrosHoy: number
}) {
  const pctAcum = meta.meta_litros > 0 ? Math.min(100, (litrosAcum / meta.meta_litros) * 100) : 0
  const pctHoy = meta.meta_litros > 0 ? Math.min(100 - pctAcum, (litrosHoy / meta.meta_litros) * 100) : 0
  const falta = Math.max(0, meta.meta_litros - litrosAcum)
  const color = COLORES[meta.categoria_negocio] ?? '#F59E0B'
  const superada = litrosAcum >= meta.meta_litros

  return (
    <div
      className="rounded-xl p-4"
      style={{ background: '#242424', border: superada ? `1px solid ${color}40` : '1px solid transparent' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
          <span className="text-sm font-semibold text-white">{meta.categoria_negocio}</span>
          {superada && (
            <span className="text-xs px-1.5 py-0.5 rounded-full font-bold" style={{ background: `${color}20`, color }}>
              ✓ Meta
            </span>
          )}
        </div>
        <span className="text-xs font-medium" style={{ color: '#888' }}>Meta: {meta.meta_litros.toFixed(0)} L</span>
      </div>

      {/* Barra de progreso */}
      <div className="h-5 rounded-full overflow-hidden relative mb-2" style={{ background: '#1A1A1A' }}>
        {/* Acumulado anterior al día */}
        <div
          className="absolute top-0 left-0 h-full rounded-full transition-all"
          style={{ width: `${pctAcum - pctHoy}%`, background: `${color}88` }}
        />
        {/* Aporte de hoy (se suma encima) */}
        {pctHoy > 0 && (
          <div
            className="absolute top-0 h-full rounded-full transition-all"
            style={{ left: `${pctAcum - pctHoy}%`, width: `${pctHoy}%`, background: color }}
          />
        )}
        {/* Porcentaje dentro de la barra */}
        <div className="absolute inset-0 flex items-center px-2">
          <span className="text-xs font-bold" style={{ color: pctAcum > 15 ? '#000' : '#fff' }}>
            {pctAcum.toFixed(0)}%
          </span>
        </div>
      </div>

      {/* Leyenda */}
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-sm" style={{ background: `${color}88` }} />
            <span style={{ color: '#888' }}>Acum: <span className="text-white font-medium">{litrosAcum.toFixed(1)} L</span></span>
          </div>
          {litrosHoy > 0 && (
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-sm" style={{ background: color }} />
              <span style={{ color: '#888' }}>Hoy: <span style={{ color }} className="font-medium">+{litrosHoy.toFixed(1)} L</span></span>
            </div>
          )}
        </div>
        {!superada && (
          <span style={{ color: '#888' }}>Falta: <span className="text-white font-medium">{falta.toFixed(1)} L</span></span>
        )}
      </div>
    </div>
  )
}

function VendedorMetas({
  vendedor,
  metas,
  acumulado,
  acumuladoHoy,
  tipoVista,
}: {
  vendedor: string
  metas: Meta[]
  acumulado: Record<string, number>
  acumuladoHoy: Record<string, number>
  tipoVista: 'mensual' | 'semanal'
}) {
  const metasFiltradas = metas.filter(m => m.vendedor === vendedor && m.tipo === tipoVista)

  if (metasFiltradas.length === 0) {
    return (
      <div className="rounded-2xl p-6 text-center" style={{ background: '#1A1A1A', border: '1px solid #2A2A2A' }}>
        <Target size={32} className="mx-auto mb-2" style={{ color: '#444' }} />
        <p className="text-sm" style={{ color: '#666' }}>Sin metas {tipoVista}es definidas</p>
        <p className="text-xs mt-1" style={{ color: '#444' }}>Un admin puede agregarlas desde "Cargar"</p>
      </div>
    )
  }

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: '#1A1A1A', border: '1px solid #2A2A2A' }}>
      <div className="px-4 pt-4 pb-3" style={{ borderBottom: '1px solid #242424' }}>
        <h3 className="font-bold text-white">{vendedor}</h3>
      </div>
      <div className="px-4 py-4 space-y-3">
        {metasFiltradas.map(meta => (
          <BarraMeta
            key={meta.id}
            meta={meta}
            litrosAcum={acumulado[meta.categoria_negocio] ?? 0}
            litrosHoy={acumuladoHoy[meta.categoria_negocio] ?? 0}
          />
        ))}
      </div>
    </div>
  )
}

export default function MetasClient({ metas, acumulado, acumuladoHoy, periodo, vendedores }: Props) {
  const [tipoVista, setTipoVista] = useState<'mensual' | 'semanal'>('mensual')

  return (
    <div className="px-4 pt-6 pb-4 max-w-lg mx-auto">
      <div className="mb-5">
        <h1 className="text-2xl font-black text-white">Metas</h1>
        {periodo && (
          <p className="text-sm mt-1" style={{ color: '#888' }}>{periodo.nombre}</p>
        )}
      </div>

      {/* Tabs mensual / semanal */}
      <div className="flex rounded-xl p-1 mb-5" style={{ background: '#1A1A1A' }}>
        {[
          { key: 'mensual', label: 'Mensual' },
          { key: 'semanal', label: 'Semanal' },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setTipoVista(tab.key as 'mensual' | 'semanal')}
            className="flex-1 py-2 rounded-lg text-sm font-medium transition-all"
            style={{
              background: tipoVista === tab.key ? '#F59E0B' : 'transparent',
              color: tipoVista === tab.key ? '#000' : '#888',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Leyenda */}
      <div className="flex items-center gap-4 mb-4 px-1">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm" style={{ background: '#F59E0B88' }} />
          <span className="text-xs" style={{ color: '#888' }}>Acumulado período</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm" style={{ background: '#F59E0B' }} />
          <span className="text-xs" style={{ color: '#888' }}>Aporte de hoy</span>
        </div>
      </div>

      <div className="space-y-4">
        {vendedores.map(vendedor => (
          <VendedorMetas
            key={vendedor}
            vendedor={vendedor}
            metas={metas}
            acumulado={acumulado[vendedor] ?? {}}
            acumuladoHoy={acumuladoHoy[vendedor] ?? {}}
            tipoVista={tipoVista}
          />
        ))}
      </div>
    </div>
  )
}
