'use client'

import { useState, useMemo } from 'react'
import { useUser } from '@/lib/userContext'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { Shield, Clock, MessageCircle, ShoppingBag, Search } from 'lucide-react'
import { useIsDesktop } from '@/lib/useIsDesktop'

interface RowReporte {
  nombre_fantasia: string | null
  vendedor: string | null
  ruta_despacho: string | null
  categoria: string | null
  telefono: string | null
  contactos90d: number
  ultimoContacto: string | null
  diasSinContacto: number | null
  tiposContacto: Record<string, number>
  ultimoPedido: string | null
}

interface Props {
  reporte: RowReporte[]
}

function formatFecha(s: string | null) {
  if (!s) return '—'
  const d = new Date(s)
  const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
  return `${d.getDate()} ${meses[d.getMonth()]}`
}

function diasColor(dias: number | null) {
  if (dias === null) return '#F87171'
  if (dias <= 7) return '#34D399'
  if (dias <= 14) return '#F59E0B'
  return '#F87171'
}

function diasLabel(dias: number | null) {
  if (dias === null) return 'Sin contacto'
  if (dias === 0) return 'Hoy'
  if (dias === 1) return 'Ayer'
  return `${dias}d`
}

export default function ReportesClient({ reporte }: Props) {
  const { isAdmin } = useUser()
  const router = useRouter()
  const isDesktop = useIsDesktop()
  const [busqueda, setBusqueda] = useState('')
  const [vendedorFiltro, setVendedorFiltro] = useState('all')
  const [tab, setTab] = useState<'todos' | 'criticos' | 'ok'>('todos')

  useEffect(() => {
    if (!isAdmin) router.replace('/')
  }, [isAdmin, router])

  const filtrados = useMemo(() => {
    return reporte.filter(r => {
      if (vendedorFiltro !== 'all' && r.vendedor !== vendedorFiltro) return false
      if (tab === 'criticos' && !(r.diasSinContacto === null || r.diasSinContacto > 14)) return false
      if (tab === 'ok' && !(r.diasSinContacto !== null && r.diasSinContacto <= 7)) return false
      if (busqueda) {
        const b = busqueda.toLowerCase()
        return r.nombre_fantasia?.toLowerCase().includes(b) ||
          r.vendedor?.toLowerCase().includes(b) ||
          r.ruta_despacho?.toLowerCase().includes(b)
      }
      return true
    })
  }, [reporte, vendedorFiltro, tab, busqueda])

  const criticos = reporte.filter(r => r.diasSinContacto === null || r.diasSinContacto > 14).length
  const aTiempo = reporte.filter(r => r.diasSinContacto !== null && r.diasSinContacto <= 7).length
  const totalContactos = reporte.reduce((s, r) => s + r.contactos90d, 0)

  if (!isAdmin) return null

  return (
    <div style={{ padding: '24px 16px 60px', maxWidth: 1000, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
        <Shield size={20} style={{ color: '#A78BFA' }} />
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 900, color: 'white', letterSpacing: '-0.5px' }}>
            Reporte de Comunicación
          </h1>
          <p style={{ fontSize: 13, color: '#888', marginTop: 2 }}>
            Periodicidad de contacto con clientes · últimos 90 días
          </p>
        </div>
      </div>

      {/* KPIs */}
      <div className="kpi-grid-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 20 }}>
        {[
          { label: 'Total clientes', val: reporte.length, color: 'white' },
          { label: 'Críticos (+14d)', val: criticos, color: '#F87171' },
          { label: 'Al día (≤7d)', val: aTiempo, color: '#34D399' },
          { label: 'Contactos (90d)', val: totalContactos, color: '#A78BFA' },
        ].map(k => (
          <div key={k.label} style={{ background: '#141414', border: '1px solid #222', borderRadius: 12, padding: '12px 14px' }}>
            <p style={{ fontSize: 10, color: '#888', marginBottom: 4, fontWeight: 600, letterSpacing: '0.03em' }}>
              {k.label.toUpperCase()}
            </p>
            <p style={{ fontSize: 22, fontWeight: 800, color: k.color }}>{k.val}</p>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, background: '#141414', borderRadius: 10, padding: 4, border: '1px solid #222' }}>
          {([
            { key: 'todos', label: 'Todos' },
            { key: 'criticos', label: '🔴 Críticos' },
            { key: 'ok', label: '🟢 Al día' },
          ] as const).map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                padding: '5px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                border: 'none', cursor: 'pointer',
                background: tab === t.key ? '#F59E0B' : 'transparent',
                color: tab === t.key ? '#000' : '#888',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Vendedor */}
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
                padding: '8px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                border: 'none', cursor: 'pointer',
                background: vendedorFiltro === op.value ? '#1E1E1E' : 'transparent',
                color: vendedorFiltro === op.value ? 'white' : '#888',
              }}
            >
              {op.label}
            </button>
          ))}
        </div>

        {/* Búsqueda */}
        <div style={{
          flex: 1, minWidth: 160, display: 'flex', alignItems: 'center', gap: 8,
          background: '#141414', border: '1px solid #222', borderRadius: 10, padding: '7px 12px',
        }}>
          <Search size={13} style={{ color: '#555', flexShrink: 0 }} />
          <input
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar cliente..."
            style={{ background: 'none', border: 'none', outline: 'none', color: 'white', fontSize: 12, width: '100%' }}
          />
        </div>
      </div>

      {/* Tabla desktop / Cards mobile */}
      {isDesktop ? (
        <div style={{ background: '#141414', border: '1px solid #222', borderRadius: 16, overflow: 'hidden' }}>
          {/* Encabezado */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '2fr 1fr 1fr 80px 80px 80px',
            padding: '10px 16px',
            borderBottom: '1px solid #1E1E1E',
            fontSize: 10, fontWeight: 700, color: '#555', letterSpacing: '0.05em',
          }}>
            <span>CLIENTE</span>
            <span>RUTA</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Clock size={10} />SIN CONTACTO</span>
            <span style={{ textAlign: 'center' }}>CONTACTOS</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><ShoppingBag size={10} />PEDIDO</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><MessageCircle size={10} />WA</span>
          </div>
          {filtrados.slice(0, 200).map((r, i) => (
            <div key={`${r.nombre_fantasia}-${i}`} style={{
              display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 80px 80px 80px',
              padding: '10px 16px', borderBottom: i < filtrados.length - 1 ? '1px solid #1A1A1A' : 'none', alignItems: 'center',
            }}>
              <div>
                <p style={{ fontSize: 13, fontWeight: 600, color: 'white', lineHeight: 1.2 }}>{r.nombre_fantasia}</p>
                <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
                  <span style={{ fontSize: 10, color: r.vendedor === 'Javier Badilla' ? '#F59E0B' : '#60A5FA', fontWeight: 600 }}>
                    {r.vendedor === 'Javier Badilla' ? 'Javier' : 'Carlos'}
                  </span>
                  {r.categoria && <span style={{ fontSize: 10, color: '#555' }}>{r.categoria}</span>}
                </div>
              </div>
              <span style={{ fontSize: 11, color: '#666' }}>{r.ruta_despacho ?? '—'}</span>
              <div>
                <span style={{ fontSize: 13, fontWeight: 700, color: diasColor(r.diasSinContacto) }}>{diasLabel(r.diasSinContacto)}</span>
                {r.ultimoContacto && <p style={{ fontSize: 10, color: '#555', marginTop: 1 }}>{formatFecha(r.ultimoContacto)}</p>}
              </div>
              <div style={{ textAlign: 'center' }}>
                <span style={{ fontSize: 14, fontWeight: 800, color: r.contactos90d === 0 ? '#444' : r.contactos90d < 3 ? '#F59E0B' : '#34D399' }}>{r.contactos90d}</span>
              </div>
              <span style={{ fontSize: 12, color: '#888' }}>{formatFecha(r.ultimoPedido)}</span>
              <div>
                {r.telefono ? (
                  <a href={`https://wa.me/${r.telefono}`} target="_blank" rel="noreferrer"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 8, textDecoration: 'none', background: '#0A3D2B', color: '#25D366', fontSize: 11, fontWeight: 600 }}>
                    <MessageCircle size={11} />Chat
                  </a>
                ) : <span style={{ fontSize: 11, color: '#333' }}>—</span>}
              </div>
            </div>
          ))}
          {filtrados.length === 0 && (
            <div style={{ padding: '40px 0', textAlign: 'center', color: '#555', fontSize: 13 }}>Sin resultados</div>
          )}
        </div>
      ) : (
        /* Cards mobile */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtrados.length === 0 && (
            <div style={{ padding: '40px 0', textAlign: 'center', color: '#555', fontSize: 13 }}>Sin resultados</div>
          )}
          {filtrados.slice(0, 200).map((r, i) => (
            <div key={`${r.nombre_fantasia}-${i}`} style={{ background: '#141414', border: '1px solid #222', borderRadius: 14, padding: '14px 16px' }}>
              {/* Header card */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 14, fontWeight: 700, color: 'white', lineHeight: 1.3, marginBottom: 3 }}>{r.nombre_fantasia}</p>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 10, color: r.vendedor === 'Javier Badilla' ? '#F59E0B' : '#60A5FA', fontWeight: 600 }}>
                      {r.vendedor === 'Javier Badilla' ? 'Javier' : 'Carlos'}
                    </span>
                    {r.categoria && <span style={{ fontSize: 10, color: '#555' }}>{r.categoria}</span>}
                    {r.ruta_despacho && <span style={{ fontSize: 10, color: '#555' }}>Ruta: {r.ruta_despacho}</span>}
                  </div>
                </div>
                <span style={{ fontSize: 16, fontWeight: 800, color: diasColor(r.diasSinContacto), flexShrink: 0, marginLeft: 12 }}>
                  {diasLabel(r.diasSinContacto)}
                </span>
              </div>
              {/* Stats row */}
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Clock size={10} color="#555" />
                  <span style={{ fontSize: 11, color: '#666' }}>{r.ultimoContacto ? formatFecha(r.ultimoContacto) : 'Sin contacto'}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <MessageCircle size={10} color="#555" />
                  <span style={{ fontSize: 11, fontWeight: 700, color: r.contactos90d === 0 ? '#444' : r.contactos90d < 3 ? '#F59E0B' : '#34D399' }}>{r.contactos90d}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <ShoppingBag size={10} color="#555" />
                  <span style={{ fontSize: 11, color: '#666' }}>{formatFecha(r.ultimoPedido)}</span>
                </div>
                {r.telefono && (
                  <a href={`https://wa.me/${r.telefono}`} target="_blank" rel="noreferrer"
                    style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 12px', borderRadius: 8, textDecoration: 'none', background: '#0A3D2B', color: '#25D366', fontSize: 12, fontWeight: 600 }}>
                    <MessageCircle size={12} />WA
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {filtrados.length > 200 && (
        <p style={{ fontSize: 12, color: '#555', textAlign: 'center', marginTop: 12 }}>
          Mostrando 200 de {filtrados.length} clientes
        </p>
      )}
    </div>
  )
}
