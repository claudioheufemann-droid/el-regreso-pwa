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

function formatLitros(n: number) { return n.toFixed(1) + ' L' }
function formatPeso(n: number) { return '$' + Math.round(n).toLocaleString('es-CL') }

function formatFecha(dateStr: string) {
  const [y, m, d] = dateStr.split('-')
  const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
  return `${parseInt(d)} ${meses[parseInt(m) - 1]} ${y}`
}

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
}

function StatBox({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  return (
    <div style={{
      background: 'var(--surface2)',
      borderRadius: 12,
      padding: '14px 16px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <span style={{ color }}>{icon}</span>
        <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>{label}</span>
      </div>
      <p style={{ fontSize: 20, fontWeight: 800, color: 'var(--cream)', letterSpacing: '-0.5px' }}>{value}</p>
    </div>
  )
}

function VendedorCard({ data }: { data: VendedorResumen }) {
  const [showClientes, setShowClientes] = useState(false)
  const [clienteAbierto, setClienteAbierto] = useState<string | null>(null)

  return (
    <div className="card-hover animate-fade-in" style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 20,
      overflow: 'hidden',
    }}>
      {/* Accent line */}
      <div style={{ height: 3, background: 'var(--gold)', borderRadius: '20px 20px 0 0' }} />

      {/* Header vendedor */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px 14px' }}>
        <div style={{
          width: 42, height: 42, borderRadius: '50%',
          background: 'var(--gold)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14, fontWeight: 800, color: '#080808', flexShrink: 0,
        }}>
          {getInitials(data.vendedor)}
        </div>
        <div>
          <h2 style={{ fontWeight: 800, color: 'var(--cream)', fontSize: 16, letterSpacing: '-0.3px' }}>{data.vendedor}</h2>
          <p style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>Vendedor Canal</p>
        </div>
      </div>

      {/* Stats hoy */}
      <div style={{ padding: '0 20px 16px' }}>
        <p style={{ fontSize: 9, fontWeight: 700, color: 'var(--gold)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 10 }}>
          Hoy
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <StatBox icon={<Droplets size={13} />} label="Litros" value={formatLitros(data.litrosHoy)} color="#60A5FA" />
          <StatBox icon={<DollarSign size={13} />} label="Venta s/imp" value={formatPeso(data.ventaHoy)} color="#4ADE80" />
          {data.latasCervezaHoy > 0 && (
            <StatBox icon={<Beer size={13} />} label="Latas cerveza" value={String(data.latasCervezaHoy)} color="var(--gold)" />
          )}
          {data.latasKombuchaHoy > 0 && (
            <StatBox icon={<Leaf size={13} />} label="Latas kombucha" value={String(data.latasKombuchaHoy)} color="#4ADE80" />
          )}
        </div>
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: 'var(--border-subtle)', margin: '0 20px' }} />

      {/* Stats período */}
      <div style={{ padding: '14px 20px 16px' }}>
        <p style={{ fontSize: 9, fontWeight: 700, color: '#A78BFA', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 10 }}>
          Período acumulado
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <StatBox icon={<Droplets size={13} />} label="Litros" value={formatLitros(data.litrosPeriodo)} color="#60A5FA" />
          <StatBox icon={<DollarSign size={13} />} label="Venta s/imp" value={formatPeso(data.ventaPeriodo)} color="#4ADE80" />
        </div>
      </div>

      {/* Clientes del día */}
      <div style={{ padding: '0 20px 20px' }}>
        <button
          onClick={() => setShowClientes(!showClientes)}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 14px', borderRadius: 12, background: 'var(--surface2)',
            border: 'none', cursor: 'pointer', transition: 'background 0.12s',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Users size={14} color="var(--gold)" />
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--cream)' }}>Clientes hoy</span>
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 100,
              background: 'rgba(212,175,55,0.15)', color: 'var(--gold)',
            }}>
              {data.clientesHoy.length}
            </span>
          </div>
          {showClientes
            ? <ChevronUp size={15} color="var(--muted)" />
            : <ChevronDown size={15} color="var(--muted)" />}
        </button>

        {showClientes && data.clientesHoy.length > 0 && (
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {data.clientesHoy.map((cliente) => (
              <div key={cliente.nombre}>
                <button
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '8px 12px', borderRadius: 10, background: 'var(--bg)',
                    border: 'none', cursor: 'pointer',
                  }}
                  onClick={() => setClienteAbierto(clienteAbierto === cliente.nombre ? null : cliente.nombre)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--gold)', flexShrink: 0 }} />
                    <span style={{ fontSize: 13, color: 'var(--cream)', textAlign: 'left' }}>{cliente.nombre}</span>
                  </div>
                  {cliente.productos.length > 0 && (
                    clienteAbierto === cliente.nombre
                      ? <ChevronUp size={13} color="var(--muted)" />
                      : <ChevronDown size={13} color="var(--muted)" />
                  )}
                </button>

                {clienteAbierto === cliente.nombre && cliente.productos.length > 0 && (
                  <div style={{
                    margin: '2px 8px 4px', borderRadius: 10, overflow: 'hidden',
                    background: 'var(--bg)', border: '1px solid var(--border-subtle)',
                  }}>
                    {cliente.productos.map((p, i) => (
                      <div key={i} style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '8px 14px',
                        borderBottom: i < cliente.productos.length - 1 ? '1px solid var(--row-sep)' : 'none',
                      }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: 12, color: 'var(--cream)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.producto}</p>
                          {p.envase && <p style={{ fontSize: 11, color: 'var(--muted)' }}>{p.envase}</p>}
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 700, marginLeft: 8, color: '#60A5FA', flexShrink: 0 }}>
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
          <p style={{ fontSize: 13, textAlign: 'center', padding: '12px 0', color: 'var(--muted)' }}>
            Sin ventas registradas hoy
          </p>
        )}
      </div>
    </div>
  )
}

export default function DashboardClient({ resumen, fechaHoy, periodo }: Props) {
  const totalHoy = resumen.reduce((s, v) => s + v.litrosHoy, 0)
  const totalPeriodo = resumen.reduce((s, v) => s + v.litrosPeriodo, 0)

  return (
    <div style={{ padding: 'var(--sp-3) var(--sp-3) 60px', maxWidth: 1100 }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 'var(--fs-title)', fontWeight: 900, color: 'var(--cream)', letterSpacing: '-1px', lineHeight: 1.1 }}>
          Ventas del Día
        </h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
          <Calendar size={13} color="var(--muted)" />
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>{formatFecha(fechaHoy)}</span>
          {periodo && (
            <>
              <span style={{ color: 'var(--border-subtle)' }}>·</span>
              <span style={{ fontSize: 13, color: 'var(--muted)', opacity: 0.7 }}>{periodo.nombre}</span>
            </>
          )}
        </div>
      </div>

      {/* KPI total */}
      <div style={{
        background: 'linear-gradient(135deg, #110D00 0%, #1C1500 100%)',
        border: '1px solid rgba(212,175,55,0.25)',
        borderRadius: 20,
        padding: '24px 32px',
        marginBottom: 32,
        display: 'flex',
        alignItems: 'center',
        gap: 48,
      }}>
        <div>
          <p style={{ fontSize: 9, fontWeight: 700, color: 'rgba(212,175,55,0.6)', letterSpacing: '1.8px', textTransform: 'uppercase', marginBottom: 8 }}>
            Total equipo hoy
          </p>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ fontSize: 48, fontWeight: 900, color: 'var(--gold)', letterSpacing: '-2px', lineHeight: 1 }}>
              {totalHoy.toFixed(1)}
            </span>
            <span style={{ fontSize: 20, fontWeight: 700, color: '#A8870F' }}>L</span>
          </div>
        </div>
        <div style={{ width: 1, height: 56, background: 'var(--border)', flexShrink: 0 }} />
        <div>
          <p style={{ fontSize: 9, fontWeight: 700, color: 'var(--muted)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 8 }}>
            Acum. período
          </p>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ fontSize: 32, fontWeight: 800, color: 'var(--cream)', letterSpacing: '-1px' }}>
              {totalPeriodo.toFixed(1)}
            </span>
            <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--muted)' }}>L</span>
          </div>
        </div>
        {resumen.map(v => (
          <div key={v.vendedor}>
            <p style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted)', marginBottom: 4 }}>
              {v.vendedor.split(' ')[0]}
            </p>
            <p style={{ fontSize: 18, fontWeight: 800, color: 'var(--cream)' }}>{v.litrosHoy.toFixed(1)} L</p>
          </div>
        ))}
      </div>

      {/* Cards vendedores — 2 columnas en escritorio */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 20 }}>
        {resumen.map(data => (
          <VendedorCard key={data.vendedor} data={data} />
        ))}
      </div>
    </div>
  )
}
