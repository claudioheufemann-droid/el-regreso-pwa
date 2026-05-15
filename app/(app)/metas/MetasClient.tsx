'use client'

import { useState } from 'react'
import { Target } from 'lucide-react'
import { Meta, Periodo } from '@/lib/types'

interface Props {
  metas: Meta[]
  acumulado: Record<string, Record<string, number>>
  acumuladoHoy: Record<string, Record<string, number>>
  periodo: Periodo | null
  vendedores: string[]
}

const COLORES: Record<string, string> = {
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
  'Total': '#D4AF37',
  'Otros': '#6B7280',
}

function BarraMeta({ meta, litrosAcum, litrosHoy }: { meta: Meta; litrosAcum: number; litrosHoy: number }) {
  const pctTotal = meta.meta_litros > 0 ? Math.min(100, (litrosAcum / meta.meta_litros) * 100) : 0
  const pctHoy = meta.meta_litros > 0 ? Math.min(100 - pctTotal + (litrosHoy / meta.meta_litros * 100 > 0 ? litrosHoy / meta.meta_litros * 100 : 0), (litrosHoy / meta.meta_litros) * 100) : 0
  const pctAcumSinHoy = Math.max(0, pctTotal - pctHoy)
  const falta = Math.max(0, meta.meta_litros - litrosAcum)
  const color = COLORES[meta.categoria_negocio] ?? '#D4AF37'
  const superada = litrosAcum >= meta.meta_litros

  const barColor = pctTotal >= 80 ? '#4A7A3A' : pctTotal >= 50 ? color : color

  return (
    <div style={{
      background: 'var(--surface2)',
      border: superada ? `1px solid ${color}40` : '1px solid transparent',
      borderRadius: 14,
      padding: '14px 16px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--cream)' }}>{meta.categoria_negocio}</span>
          {superada && (
            <span style={{
              fontSize: 9, fontWeight: 700, padding: '3px 8px', borderRadius: 100,
              background: `${color}20`, color, border: `1px solid ${color}40`,
              letterSpacing: '0.3px',
            }}>✓ META</span>
          )}
        </div>
        <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>Meta: {meta.meta_litros.toFixed(0)} L</span>
      </div>

      {/* Barra */}
      <div style={{ height: 8, borderRadius: 8, overflow: 'hidden', background: 'rgba(255,255,255,0.06)', position: 'relative', marginBottom: 8 }}>
        <div className="animate-progress" style={{
          position: 'absolute', top: 0, left: 0, height: '100%', borderRadius: 8,
          width: `${pctAcumSinHoy}%`, background: `${barColor}88`,
        }} />
        {pctHoy > 0 && (
          <div className="animate-progress" style={{
            position: 'absolute', top: 0, left: `${pctAcumSinHoy}%`, height: '100%', borderRadius: 8,
            width: `${pctHoy}%`, background: barColor,
          }} />
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>
            Acum: <span style={{ color: 'var(--cream)', fontWeight: 700 }}>{litrosAcum.toFixed(1)} L</span>
          </span>
          {litrosHoy > 0 && (
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>
              Hoy: <span style={{ color, fontWeight: 700 }}>+{litrosHoy.toFixed(1)} L</span>
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 800, color: superada ? '#4A7A3A' : 'var(--muted)' }}>
            {pctTotal.toFixed(0)}%
          </span>
          {!superada && (
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>
              Falta: <span style={{ color: 'var(--cream)', fontWeight: 700 }}>{falta.toFixed(1)} L</span>
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

function VendedorMetas({
  vendedor, metas, acumulado, acumuladoHoy, tipoVista,
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
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20,
        padding: '32px 24px', textAlign: 'center',
      }}>
        <Target size={30} style={{ color: 'var(--muted)', margin: '0 auto 10px' }} />
        <p style={{ fontSize: 13, color: 'var(--muted)' }}>Sin metas {tipoVista}es definidas</p>
        <p style={{ fontSize: 11, color: '#3A3530', marginTop: 4 }}>Un admin puede agregarlas desde "Cargar"</p>
      </div>
    )
  }

  return (
    <div className="card-hover animate-fade-in" style={{
      background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, overflow: 'hidden',
    }}>
      <div style={{ height: 3, background: 'var(--gold)' }} />
      <div style={{ padding: '16px 20px 14px', borderBottom: '1px solid var(--border-subtle)' }}>
        <h3 style={{ fontWeight: 800, color: 'var(--cream)', fontSize: 16, letterSpacing: '-0.3px' }}>{vendedor}</h3>
      </div>
      <div style={{ padding: '16px 20px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
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
    <div style={{ padding: '40px 48px 60px' }} className="px-4 pt-8 lg:px-12 lg:pt-10">
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 32, fontWeight: 900, color: 'var(--cream)', letterSpacing: '-1px', lineHeight: 1.1 }}>
          Metas
        </h1>
        {periodo && (
          <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 6 }}>{periodo.nombre}</p>
        )}
      </div>

      {/* Controles */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28, flexWrap: 'wrap', gap: 16 }}>
        {/* Tabs */}
        <div style={{ display: 'flex', borderRadius: 12, padding: 4, background: 'var(--surface)' }}>
          {[
            { key: 'mensual', label: 'Mensual' },
            { key: 'semanal', label: 'Semanal' },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setTipoVista(tab.key as 'mensual' | 'semanal')}
              style={{
                padding: '8px 20px', borderRadius: 9, fontSize: 13, fontWeight: 600,
                border: 'none', cursor: 'pointer',
                background: tipoVista === tab.key ? 'var(--gold)' : 'transparent',
                color: tipoVista === tab.key ? '#080808' : 'var(--muted)',
                transition: 'all 0.15s',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Leyenda */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 12, height: 12, borderRadius: 4, background: 'rgba(212,175,55,0.5)' }} />
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>Acumulado período</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 12, height: 12, borderRadius: 4, background: 'var(--gold)' }} />
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>Aporte de hoy</span>
          </div>
        </div>
      </div>

      {/* Grid vendedores */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 20 }}>
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
