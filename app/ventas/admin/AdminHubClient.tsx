'use client'

import { useState, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Upload, Users, AlertCircle, Target, BarChart3 } from 'lucide-react'
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
}

const TABS = [
  { id: 'ventas',    label: 'Cargar Ventas',    icon: Upload      },
  { id: 'clientes',  label: 'Importar Clientes', icon: Users       },
  { id: 'deudores',  label: 'Deudores',          icon: AlertCircle },
  { id: 'metas',     label: 'Metas',             icon: Target      },
]

export default function AdminHubClient({ periodos, metas, vendedores, deudores }: Props) {
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
    <div className="admin-pad" style={{ padding: '32px 40px 60px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 900, color: 'var(--cream)', letterSpacing: '-0.8px', lineHeight: 1.1 }}>
            Administración
          </h1>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 5 }}>
            Cargas de datos y configuración
          </p>
        </div>
        <button onClick={() => router.push('/ventas/admin/crm-metrics')} style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', borderRadius: 12,
          background: 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.3)',
          color: '#D4AF37', fontSize: 13, fontWeight: 700, cursor: 'pointer',
        }}>
          <BarChart3 size={16} /> Métricas CRM
        </button>
      </div>

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
