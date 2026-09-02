'use client'

import { useState, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Upload, Users, AlertCircle, Target, BarChart3, UserPlus, TrendingUp, DollarSign, FileText, Route, Package } from 'lucide-react'
import AppHeader from '@/components/ui/AppHeader'
import CargarClient from './cargar/CargarClient'
import ClientesUploadClient from './clientes-upload/ClientesUploadClient'
import DeudoresClient from './deudores/DeudoresClient'
import MetasAdminClient from './metas/MetasAdminClient'
import { Periodo } from '@/lib/types'

interface Props {
  periodos: Periodo[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metas: any[]
  vendedores: string[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  deudores: any[]
  huerfanos: { tabla: string; huerfanos: number }[]
}

const NOMBRE_TABLA: Record<string, string> = {
  ventas: 'Ventas',
  misiones: 'Misiones',
  predicciones_compra: 'Predicción de compra',
}

const TABS = [
  { id: 'ventas',    label: 'Cargar Ventas',    icon: Upload      },
  { id: 'clientes',  label: 'Importar Clientes', icon: Users       },
  { id: 'deudores',  label: 'Deudores',          icon: AlertCircle },
  { id: 'metas',     label: 'Metas',             icon: Target      },
]

export default function AdminHubClient({ periodos, metas, vendedores, deudores, huerfanos }: Props) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') ?? 'ventas')

  useEffect(() => {
    const tab = searchParams.get('tab')
    if (tab) setActiveTab(tab)
  }, [searchParams])

  function selectTab(id: string) {
    setActiveTab(id)
    router.replace(`/ventas/admin?tab=${id}`, { scroll: false })
  }

  return (
    <div className="admin-pad" style={{ padding: '12px 16px 60px' }}>
      <AppHeader
        title="Admin"
        extraAction={
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => router.push('/ventas/admin/vendedores')} style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 10,
              background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.3)',
              color: '#4ADE80', fontSize: 12, fontWeight: 700, cursor: 'pointer',
            }}>
              <UserPlus size={14} /> Vendedores
            </button>
            <button onClick={() => router.push('/ventas/historico')} style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 10,
              background: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.3)',
              color: '#60A5FA', fontSize: 12, fontWeight: 700, cursor: 'pointer',
            }}>
              <TrendingUp size={14} /> Histórico
            </button>
            <button onClick={() => router.push('/ventas/margen')} style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 10,
              background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.3)',
              color: '#4ADE80', fontSize: 12, fontWeight: 700, cursor: 'pointer',
            }}>
              <DollarSign size={14} /> Margen
            </button>
            <button onClick={() => router.push('/ventas/admin/crm-metrics')} style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 10,
              background: 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.3)',
              color: '#D4AF37', fontSize: 12, fontWeight: 700, cursor: 'pointer',
            }}>
              <BarChart3 size={14} /> Métricas
            </button>
            <button onClick={() => router.push('/ventas/admin/reportes')} style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 10,
              background: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.3)',
              color: '#60A5FA', fontSize: 12, fontWeight: 700, cursor: 'pointer',
            }}>
              <FileText size={14} /> Reportes
            </button>
            <button onClick={() => router.push('/ventas/admin/rutas-clientes')} style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 10,
              background: 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.3)',
              color: '#D4AF37', fontSize: 12, fontWeight: 700, cursor: 'pointer',
            }}>
              <Route size={14} /> Rutas
            </button>
            <button onClick={() => router.push('/ventas/admin/stock')} style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 10,
              background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.3)',
              color: '#A855F7', fontSize: 12, fontWeight: 700, cursor: 'pointer',
            }}>
              <Package size={14} /> Stock
            </button>
          </div>
        }
      />

      {/* Salud de datos: cuántas filas de ventas/misiones/predicciones no
          calzan con ningún cliente actual — alerta temprana de que un sync
          del ERP renombró o perdió un cliente. */}
      {(() => {
        const conProblemas = huerfanos.filter(h => h.huerfanos > 0)
        const total = huerfanos.reduce((s, h) => s + h.huerfanos, 0)
        return (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
            padding: '10px 14px', borderRadius: 10, marginBottom: 20,
            background: conProblemas.length ? 'rgba(251,191,36,0.08)' : 'rgba(74,222,128,0.06)',
            border: `1px solid ${conProblemas.length ? 'rgba(251,191,36,0.25)' : 'rgba(74,222,128,0.2)'}`,
          }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: conProblemas.length ? '#F0B429' : '#4ADE80' }}>
              {conProblemas.length ? `⚠ Salud de datos: ${total} clientes sin calzar` : '✓ Salud de datos: todo calza'}
            </span>
            {conProblemas.map(h => (
              <span key={h.tabla} style={{
                fontSize: 11.5, fontWeight: 600, color: 'var(--muted)',
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 999, padding: '3px 10px',
              }}>
                {NOMBRE_TABLA[h.tabla] ?? h.tabla}: {h.huerfanos}
              </span>
            ))}
          </div>
        )
      })()}

      {/* Tab Bar */}
      <div className="scroll-x-mobile" style={{
        display: 'flex', gap: 2, marginBottom: 32,
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: 4,
        width: 'fit-content',
      }}>
        {TABS.map(({ id, label, icon: Icon }) => {
          const active = activeTab === id
          return (
            <button
              key={id}
              onClick={() => selectTab(id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 7,
                padding: '8px 18px', borderRadius: 9,
                border: 'none', cursor: 'pointer',
                fontWeight: 600, fontSize: 13,
                background: active ? 'var(--gold)' : 'transparent',
                color: active ? '#1a1200' : 'var(--muted)',
                transition: 'all 0.15s',
                flexShrink: 0, whiteSpace: 'nowrap',
              }}
            >
              <Icon size={14} />
              {label}
            </button>
          )
        })}
      </div>

      {/* Tab Content */}
      {activeTab === 'ventas'   && <CargarClient periodos={periodos} />}
      {activeTab === 'clientes' && <ClientesUploadClient />}
      {activeTab === 'deudores' && <DeudoresClient initialDeudores={deudores} />}
      {activeTab === 'metas'    && (
        <MetasAdminClient
          periodos={periodos}
          metas={metas}
          vendedores={vendedores}
        />
      )}
    </div>
  )
}
