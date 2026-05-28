'use client'

import { useState, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Upload, Users, AlertCircle, Target } from 'lucide-react'
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
    <div style={{ padding: '32px 40px 60px' }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 28, fontWeight: 900, color: 'var(--cream)', letterSpacing: '-0.8px', lineHeight: 1.1 }}>
          Administración
        </h1>
        <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 5 }}>
          Cargas de datos y configuración
        </p>
      </div>

      {/* Tab Bar */}
      <div style={{
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
