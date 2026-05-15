'use client'

import { useState } from 'react'
import { Droplets, DollarSign, Users, ChevronDown, ChevronUp, Calendar, Beer, Leaf } from 'lucide-react'
import { Periodo } from '@/lib/types'

interface ProductoDetalle {
  producto: string
  envase: string | null
  litros: number
}

interface ClienteDetalle {
  nombre: string
  productos: ProductoDetalle[]
}

interface VendedorResumen {
  vendedor: string
  litrosHoy: number
  ventaHoy: number
  litrosPeriodo: number
  ventaPeriodo: number
  clientesHoy: ClienteDetalle[]
  latasCervezaHoy: number
  latasKombuchaHoy: number
}

interface Props {
  resumen: VendedorResumen[]
  fechaHoy: string
  periodo: Periodo | null
}

function formatLitros(n: number) {
  return n.toFixed(1) + ' L'
}

function formatPeso(n: number) {
  return '$' + Math.round(n).toLocaleString('es-CL')
}

function formatFecha(dateStr: string) {
  const [y, m, d] = dateStr.split('-')
  const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
  return `${parseInt(d)} ${meses[parseInt(m) - 1]} ${y}`
}

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
}

function VendedorCard({ data }: { data: VendedorResumen }) {
  const [showClientes, setShowClientes] = useState(false)
  const [clienteAbierto, setClienteAbierto] = useState<string | null>(null)

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: '#1A1A1A', border: '1px solid #2A2A2A' }}>
      {/* Header vendedor */}
      <div className="flex items-center gap-3 px-4 pt-4 pb-3">
        <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-black flex-shrink-0" style={{ background: '#F59E0B' }}>
          {getInitials(data.vendedor)}
        </div>
        <div>
          <h2 className="font-bold text-white text-base leading-tight">{data.vendedor}</h2>
          <p className="text-xs" style={{ color: '#888' }}>Vendedor Canal</p>
        </div>
      </div>

      {/* Stats hoy */}
      <div className="px-4 pb-3">
        <p className="text-xs font-medium mb-2" style={{ color: '#F59E0B' }}>HOY</p>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl p-3" style={{ background: '#242424' }}>
            <div className="flex items-center gap-1.5 mb-1">
              <Droplets size={14} style={{ color: '#60A5FA' }} />
              <span className="text-xs" style={{ color: '#888' }}>Litros</span>
            </div>
            <p className="text-xl font-bold text-white">{formatLitros(data.litrosHoy)}</p>
          </div>
          <div className="rounded-xl p-3" style={{ background: '#242424' }}>
            <div className="flex items-center gap-1.5 mb-1">
              <DollarSign size={14} style={{ color: '#34D399' }} />
              <span className="text-xs" style={{ color: '#888' }}>Venta s/imp</span>
            </div>
            <p className="text-lg font-bold text-white">{formatPeso(data.ventaHoy)}</p>
          </div>
        </div>

        {/* Latas */}
        {(data.latasCervezaHoy > 0 || data.latasKombuchaHoy > 0) && (
          <div className="grid grid-cols-2 gap-2 mt-2">
            {data.latasCervezaHoy > 0 && (
              <div className="rounded-xl p-3" style={{ background: '#242424' }}>
                <div className="flex items-center gap-1.5 mb-1">
                  <Beer size={14} style={{ color: '#F59E0B' }} />
                  <span className="text-xs" style={{ color: '#888' }}>Latas cerveza</span>
                </div>
                <p className="text-xl font-bold text-white">{data.latasCervezaHoy}</p>
              </div>
            )}
            {data.latasKombuchaHoy > 0 && (
              <div className="rounded-xl p-3" style={{ background: '#242424' }}>
                <div className="flex items-center gap-1.5 mb-1">
                  <Leaf size={14} style={{ color: '#34D399' }} />
                  <span className="text-xs" style={{ color: '#888' }}>Latas kombucha</span>
                </div>
                <p className="text-xl font-bold text-white">{data.latasKombuchaHoy}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Stats período */}
      <div className="px-4 pb-3">
        <p className="text-xs font-medium mb-2" style={{ color: '#A78BFA' }}>PERÍODO ACUMULADO</p>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl p-3" style={{ background: '#242424' }}>
            <div className="flex items-center gap-1.5 mb-1">
              <Droplets size={14} style={{ color: '#60A5FA' }} />
              <span className="text-xs" style={{ color: '#888' }}>Litros</span>
            </div>
            <p className="text-xl font-bold text-white">{formatLitros(data.litrosPeriodo)}</p>
          </div>
          <div className="rounded-xl p-3" style={{ background: '#242424' }}>
            <div className="flex items-center gap-1.5 mb-1">
              <DollarSign size={14} style={{ color: '#34D399' }} />
              <span className="text-xs" style={{ color: '#888' }}>Venta s/imp</span>
            </div>
            <p className="text-lg font-bold text-white">{formatPeso(data.ventaPeriodo)}</p>
          </div>
        </div>
      </div>

      {/* Clientes del día */}
      <div className="px-4 pb-4">
        <button
          onClick={() => setShowClientes(!showClientes)}
          className="w-full flex items-center justify-between py-2.5 px-3 rounded-xl transition-colors"
          style={{ background: '#242424' }}
        >
          <div className="flex items-center gap-2">
            <Users size={15} style={{ color: '#F59E0B' }} />
            <span className="text-sm font-medium text-white">Clientes hoy</span>
            <span className="text-xs px-1.5 py-0.5 rounded-full font-bold" style={{ background: '#F59E0B20', color: '#F59E0B' }}>
              {data.clientesHoy.length}
            </span>
          </div>
          {showClientes ? <ChevronUp size={16} style={{ color: '#666' }} /> : <ChevronDown size={16} style={{ color: '#666' }} />}
        </button>

        {showClientes && data.clientesHoy.length > 0 && (
          <div className="mt-2 space-y-1">
            {data.clientesHoy.map((cliente) => (
              <div key={cliente.nombre}>
                <button
                  className="w-full flex items-center justify-between py-2 px-3 rounded-lg"
                  style={{ background: '#1E1E1E' }}
                  onClick={() => setClienteAbierto(clienteAbierto === cliente.nombre ? null : cliente.nombre)}
                >
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#F59E0B' }} />
                    <span className="text-sm text-white text-left">{cliente.nombre}</span>
                  </div>
                  {cliente.productos.length > 0 && (
                    clienteAbierto === cliente.nombre
                      ? <ChevronUp size={14} style={{ color: '#555' }} />
                      : <ChevronDown size={14} style={{ color: '#555' }} />
                  )}
                </button>

                {clienteAbierto === cliente.nombre && cliente.productos.length > 0 && (
                  <div className="mx-2 mb-1 rounded-lg overflow-hidden" style={{ background: '#161616', border: '1px solid #2A2A2A' }}>
                    {cliente.productos.map((p, i) => (
                      <div key={i} className="flex items-center justify-between px-3 py-2" style={{ borderBottom: i < cliente.productos.length - 1 ? '1px solid #222' : 'none' }}>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-white truncate">{p.producto}</p>
                          {p.envase && <p className="text-xs" style={{ color: '#555' }}>{p.envase}</p>}
                        </div>
                        <span className="text-xs font-semibold ml-2 flex-shrink-0" style={{ color: '#60A5FA' }}>
                          {p.litros.toFixed(2)} L
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {showClientes && data.clientesHoy.length === 0 && (
          <p className="text-sm text-center py-3" style={{ color: '#666' }}>Sin ventas registradas hoy</p>
        )}
      </div>
    </div>
  )
}

export default function DashboardClient({ resumen, fechaHoy, periodo }: Props) {
  const totalHoy = resumen.reduce((s, v) => s + v.litrosHoy, 0)
  const totalPeriodo = resumen.reduce((s, v) => s + v.litrosPeriodo, 0)

  return (
    <div className="px-4 pt-6 pb-4 max-w-lg mx-auto">
      {/* Header */}
      <div className="mb-5">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-2xl font-black text-white">Ventas del Día</h1>
        </div>
        <div className="flex items-center gap-1.5">
          <Calendar size={13} style={{ color: '#888' }} />
          <span className="text-sm" style={{ color: '#888' }}>{formatFecha(fechaHoy)}</span>
          {periodo && (
            <>
              <span style={{ color: '#444' }}>·</span>
              <span className="text-sm" style={{ color: '#666' }}>{periodo.nombre}</span>
            </>
          )}
        </div>
      </div>

      {/* Total del día */}
      <div className="rounded-2xl p-4 mb-5" style={{ background: 'linear-gradient(135deg, #1C1600 0%, #2A1F00 100%)', border: '1px solid #3D2E00' }}>
        <p className="text-xs font-semibold mb-2 tracking-wider" style={{ color: '#F59E0B99' }}>TOTAL EQUIPO HOY</p>
        <div className="flex items-end gap-4">
          <div>
            <span className="text-4xl font-black" style={{ color: '#F59E0B' }}>{totalHoy.toFixed(1)}</span>
            <span className="text-lg font-bold ml-1" style={{ color: '#D97706' }}>L</span>
          </div>
          <div className="mb-1">
            <p className="text-sm" style={{ color: '#888' }}>Acum. período</p>
            <p className="text-lg font-bold text-white">{totalPeriodo.toFixed(1)} L</p>
          </div>
        </div>
      </div>

      {/* Cards por vendedor */}
      <div className="space-y-4">
        {resumen.map(data => (
          <VendedorCard key={data.vendedor} data={data} />
        ))}
      </div>
    </div>
  )
}
