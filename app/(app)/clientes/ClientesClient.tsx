'use client'

import { useState, useMemo } from 'react'
import { MessageCircle, Search, ChevronDown, ChevronUp, Clock, ShoppingBag, Droplets, DollarSign, MapPin, Check } from 'lucide-react'
import { useUser } from '@/lib/userContext'

interface Cliente {
  id: number
  nombre_fantasia: string | null
  razon_social: string | null
  categoria: string | null
  vendedor: string | null
  localidad: string | null
  localidad_entrega: string | null
  ruta_despacho: string | null
  telefono: string | null
  lat: number | null
  lng: number | null
  ultimoContacto: { fecha: string; tipo: string; vendedor: string } | null
  ultimoPedido: { ultimaFecha: string; litrosTotal: number; ventaTotal: number } | null
}

interface Props {
  clientes: Cliente[]
}

function diasDesde(fechaStr: string | null | undefined): number | null {
  if (!fechaStr) return null
  const diff = Date.now() - new Date(fechaStr).getTime()
  return Math.floor(diff / (1000 * 60 * 60 * 24))
}

function formatFecha(fechaStr: string | null | undefined) {
  if (!fechaStr) return '—'
  const d = new Date(fechaStr)
  const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
  return `${d.getDate()} ${meses[d.getMonth()]}`
}

function urgencyColor(dias: number | null) {
  if (dias === null) return '#555'
  if (dias <= 7) return '#34D399'
  if (dias <= 14) return '#F59E0B'
  return '#F87171'
}

function formatPeso(n: number) {
  return '$' + Math.round(n).toLocaleString('es-CL')
}

function ClienteCard({ cliente, isAdmin, userName }: { cliente: Cliente; isAdmin: boolean; userName: string }) {
  const [contacted, setContacted] = useState(false)
  const diasContacto = diasDesde(cliente.ultimoContacto?.fecha)
  const diasPedido = diasDesde(cliente.ultimoPedido?.ultimaFecha)

  async function handleWhatsApp() {
    if (!cliente.telefono) return

    // Log contacto en background
    fetch('/api/contactos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cliente_nombre_fantasia: cliente.nombre_fantasia,
        vendedor: userName,
        tipo: 'whatsapp',
      }),
    }).then(() => setContacted(true))

    // Abrir WhatsApp
    window.open(`https://wa.me/${cliente.telefono}`, '_blank')
  }

  return (
    <div style={{
      background: '#141414', border: '1px solid #222', borderRadius: 16,
      padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontWeight: 700, fontSize: 14, color: 'white', lineHeight: 1.2 }}>
            {cliente.nombre_fantasia}
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
            {cliente.categoria && (
              <span style={{
                fontSize: 10, padding: '1px 7px', borderRadius: 20, fontWeight: 600,
                background: '#222', color: '#888',
              }}>
                {cliente.categoria}
              </span>
            )}
            {cliente.vendedor && (
              <span style={{
                fontSize: 10, fontWeight: 600,
                color: cliente.vendedor === 'Javier Badilla' ? '#F59E0B' : '#60A5FA',
              }}>
                {cliente.vendedor === 'Javier Badilla' ? 'Javier' : 'Carlos'}
              </span>
            )}
          </div>
        </div>

        {/* Botón WhatsApp */}
        {cliente.telefono ? (
          <button
            onClick={handleWhatsApp}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 12px', borderRadius: 10, border: 'none',
              background: contacted ? '#003318' : '#0A3D2B',
              color: contacted ? '#34D399' : '#25D366',
              cursor: 'pointer', fontWeight: 700, fontSize: 12,
              flexShrink: 0, transition: 'all 0.2s',
            }}
          >
            {contacted ? <Check size={14} /> : <MessageCircle size={14} />}
            {contacted ? 'Enviado' : 'WhatsApp'}
          </button>
        ) : (
          <span style={{ fontSize: 11, color: '#444', flexShrink: 0 }}>Sin teléfono</span>
        )}
      </div>

      {/* Localidad */}
      {cliente.localidad_entrega && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <MapPin size={12} style={{ color: '#555', flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: '#666' }}>{cliente.localidad_entrega}</span>
        </div>
      )}

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        {/* Último contacto */}
        <div style={{ background: '#0D0D0D', borderRadius: 10, padding: '8px 10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
            <Clock size={11} style={{ color: '#555' }} />
            <span style={{ fontSize: 10, color: '#555', fontWeight: 600 }}>Último contacto</span>
          </div>
          {cliente.ultimoContacto ? (
            <div>
              <p style={{ fontSize: 13, fontWeight: 700, color: urgencyColor(diasContacto) }}>
                {diasContacto === 0 ? 'Hoy' : diasContacto === 1 ? 'Ayer' : `Hace ${diasContacto}d`}
              </p>
              <p style={{ fontSize: 10, color: '#555', marginTop: 1 }}>
                {formatFecha(cliente.ultimoContacto.fecha)} · {cliente.ultimoContacto.tipo}
              </p>
            </div>
          ) : (
            <p style={{ fontSize: 12, color: '#F87171', fontWeight: 600 }}>Sin contacto</p>
          )}
        </div>

        {/* Último pedido */}
        <div style={{ background: '#0D0D0D', borderRadius: 10, padding: '8px 10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
            <ShoppingBag size={11} style={{ color: '#555' }} />
            <span style={{ fontSize: 10, color: '#555', fontWeight: 600 }}>Último pedido</span>
          </div>
          {cliente.ultimoPedido ? (
            <div>
              <p style={{ fontSize: 13, fontWeight: 700, color: '#A78BFA' }}>
                {diasPedido === 0 ? 'Hoy' : diasPedido === 1 ? 'Ayer' : `Hace ${diasPedido}d`}
              </p>
              <p style={{ fontSize: 10, color: '#555', marginTop: 1 }}>
                {formatFecha(cliente.ultimoPedido.ultimaFecha)}
              </p>
            </div>
          ) : (
            <p style={{ fontSize: 12, color: '#555', fontWeight: 600 }}>Sin pedidos</p>
          )}
        </div>
      </div>

      {/* KPIs (solo admin) */}
      {isAdmin && cliente.ultimoPedido && (
        <div style={{ display: 'flex', gap: 12, paddingTop: 4, borderTop: '1px solid #1E1E1E' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <Droplets size={12} style={{ color: '#60A5FA' }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: 'white' }}>
              {cliente.ultimoPedido.litrosTotal.toFixed(1)} L
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <DollarSign size={12} style={{ color: '#34D399' }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: 'white' }}>
              {formatPeso(cliente.ultimoPedido.ventaTotal)}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

function RutaSection({ ruta, clientes, isAdmin, userName }: {
  ruta: string; clientes: Cliente[]; isAdmin: boolean; userName: string
}) {
  const [open, setOpen] = useState(true)
  const sinContactoReciente = clientes.filter(c => {
    const dias = diasDesde(c.ultimoContacto?.fecha)
    return dias === null || dias > 14
  }).length

  return (
    <div style={{ marginBottom: 16 }}>
      {/* Header de ruta */}
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 14px', borderRadius: 12, border: 'none', cursor: 'pointer',
          background: '#1A1A1A', marginBottom: open ? 10 : 0, transition: 'all 0.15s',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <MapPin size={14} style={{ color: '#F59E0B' }} />
          <span style={{ fontWeight: 700, fontSize: 14, color: 'white' }}>{ruta}</span>
          <span style={{
            fontSize: 11, padding: '1px 8px', borderRadius: 20, fontWeight: 700,
            background: '#2A2A2A', color: '#888',
          }}>
            {clientes.length}
          </span>
          {sinContactoReciente > 0 && (
            <span style={{
              fontSize: 10, padding: '1px 7px', borderRadius: 20, fontWeight: 700,
              background: 'rgba(248,113,113,0.15)', color: '#F87171',
            }}>
              {sinContactoReciente} sin contacto
            </span>
          )}
        </div>
        {open ? <ChevronUp size={16} style={{ color: '#555' }} /> : <ChevronDown size={16} style={{ color: '#555' }} />}
      </button>

      {open && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 8 }}>
          {clientes.map(c => (
            <ClienteCard key={c.id} cliente={c} isAdmin={isAdmin} userName={userName} />
          ))}
        </div>
      )}
    </div>
  )
}

export default function ClientesClient({ clientes }: Props) {
  const { user, isAdmin } = useUser()
  const [busqueda, setBusqueda] = useState('')
  const [vendedorFiltro, setVendedorFiltro] = useState<string>('all')

  // Si es vendedor, forzar filtro a sus propios clientes
  const vendedorEfectivo = isAdmin ? vendedorFiltro : (user?.nombre ?? '')

  const clientesFiltrados = useMemo(() => {
    return clientes.filter(c => {
      if (vendedorEfectivo !== 'all' && c.vendedor !== vendedorEfectivo) return false
      if (busqueda) {
        const b = busqueda.toLowerCase()
        return (
          c.nombre_fantasia?.toLowerCase().includes(b) ||
          c.localidad_entrega?.toLowerCase().includes(b) ||
          c.ruta_despacho?.toLowerCase().includes(b) ||
          c.categoria?.toLowerCase().includes(b)
        )
      }
      return true
    })
  }, [clientes, vendedorEfectivo, busqueda])

  // Agrupar por ruta
  const porRuta = useMemo(() => {
    const map = new Map<string, Cliente[]>()
    for (const c of clientesFiltrados) {
      const ruta = c.ruta_despacho ?? 'Sin ruta asignada'
      if (!map.has(ruta)) map.set(ruta, [])
      map.get(ruta)!.push(c)
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], 'es'))
  }, [clientesFiltrados])

  // Stats rápidas
  const sinContacto = clientesFiltrados.filter(c => !c.ultimoContacto).length
  const contactoReciente = clientesFiltrados.filter(c => {
    const dias = diasDesde(c.ultimoContacto?.fecha)
    return dias !== null && dias <= 7
  }).length

  return (
    <div style={{ padding: '24px 16px 40px', maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 28, fontWeight: 900, color: 'white', letterSpacing: '-0.5px' }}>
          Clientes
        </h1>
        <p style={{ fontSize: 13, color: '#888', marginTop: 4 }}>
          Cartera por ruta de despacho
        </p>
      </div>

      {/* Stats rápidas (solo admin) */}
      {isAdmin && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 20 }}>
          <div style={{ background: '#141414', border: '1px solid #222', borderRadius: 12, padding: '12px 14px' }}>
            <p style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>Total clientes</p>
            <p style={{ fontSize: 22, fontWeight: 800, color: 'white' }}>{clientesFiltrados.length}</p>
          </div>
          <div style={{ background: '#141414', border: '1px solid rgba(52,211,153,0.2)', borderRadius: 12, padding: '12px 14px' }}>
            <p style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>Contactados (7d)</p>
            <p style={{ fontSize: 22, fontWeight: 800, color: '#34D399' }}>{contactoReciente}</p>
          </div>
          <div style={{ background: '#141414', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 12, padding: '12px 14px' }}>
            <p style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>Sin contacto</p>
            <p style={{ fontSize: 22, fontWeight: 800, color: '#F87171' }}>{sinContacto}</p>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {/* Búsqueda */}
        <div style={{
          flex: 1, minWidth: 200, display: 'flex', alignItems: 'center', gap: 8,
          background: '#141414', border: '1px solid #222', borderRadius: 10, padding: '8px 12px',
        }}>
          <Search size={15} style={{ color: '#555', flexShrink: 0 }} />
          <input
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar cliente, ciudad, categoría..."
            style={{ background: 'none', border: 'none', outline: 'none', color: 'white', fontSize: 13, width: '100%' }}
          />
        </div>

        {/* Filtro vendedor (solo admin) */}
        {isAdmin && (
          <div style={{ display: 'flex', gap: 4 }}>
            {[
              { value: 'all', label: 'Todos' },
              { value: 'Javier Badilla', label: 'Javier' },
              { value: 'Carlos Urrejola', label: 'Carlos' },
            ].map(op => (
              <button
                key={op.value}
                onClick={() => setVendedorFiltro(op.value)}
                style={{
                  padding: '8px 14px', borderRadius: 10, fontSize: 12, fontWeight: 600,
                  border: 'none', cursor: 'pointer',
                  background: vendedorFiltro === op.value ? '#F59E0B' : '#1A1A1A',
                  color: vendedorFiltro === op.value ? '#000' : '#888',
                }}
              >
                {op.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Resultado */}
      <p style={{ fontSize: 12, color: '#555', marginBottom: 16 }}>
        {clientesFiltrados.length} clientes · {porRuta.length} rutas
      </p>

      {/* Rutas */}
      {porRuta.map(([ruta, clts]) => (
        <RutaSection
          key={ruta}
          ruta={ruta}
          clientes={clts}
          isAdmin={isAdmin}
          userName={user?.nombre ?? ''}
        />
      ))}

      {clientesFiltrados.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#555' }}>
          <p style={{ fontSize: 14 }}>No hay clientes con ese filtro</p>
        </div>
      )}
    </div>
  )
}
