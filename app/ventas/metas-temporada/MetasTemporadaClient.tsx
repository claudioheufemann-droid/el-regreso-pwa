'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw } from 'lucide-react'
import AppHeader from '@/components/ui/AppHeader'
import { type FilaMeta } from './tipos'
import VistaVendedor from './VistaVendedor'
import VistaEquipo, { type VendedorPlan } from './VistaEquipo'

const EQUIPO = '__equipo__'

export default function MetasTemporadaClient({
  filas, esAdmin, hoy, error,
}: {
  filas: FilaMeta[]; esAdmin: boolean; hoy: string; error: string | null
}) {
  const router = useRouter()
  const [elegido, setElegido] = useState<string>(EQUIPO)

  const vendedores: VendedorPlan[] = useMemo(() => {
    const porUsuario = new Map<string, VendedorPlan>()
    for (const f of filas) {
      const v = porUsuario.get(f.userId) ?? { userId: f.userId, vendedor: f.vendedor, territorio: f.territorio, filas: [] }
      v.filas.push(f)
      porUsuario.set(f.userId, v)
    }
    return [...porUsuario.values()].sort((a, b) => a.vendedor.localeCompare(b.vendedor, 'es'))
  }, [filas])

  const seleccionado = vendedores.find(v => v.userId === elegido) ?? null

  const elegir = (id: string) => {
    setElegido(id)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  let contenido: React.ReactNode
  if (error) {
    contenido = (
      <div className="flex flex-col items-center rounded-[18px] border border-[var(--border)] bg-[var(--surface)] px-6 py-10 text-center">
        <p className="text-[15px] font-bold text-[var(--cream)]">No se pudieron cargar las metas</p>
        <p className="mt-1 text-[12px] text-[var(--muted)]">{error}</p>
        <button
          type="button"
          onClick={() => router.refresh()}
          className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-full bg-[var(--gold)] px-5 text-[13px] font-bold text-[#0A0A0A]"
        >
          <RefreshCw size={15} /> Reintentar
        </button>
      </div>
    )
  } else if (!esAdmin) {
    contenido = <VistaVendedor filas={filas} hoy={hoy} />
  } else {
    contenido = (
      <>
        <div role="tablist" aria-label="Ver metas de" className="mb-3 flex flex-wrap gap-1.5">
          <Chip activo={!seleccionado} onClick={() => elegir(EQUIPO)}>Equipo</Chip>
          {vendedores.map(v => (
            <Chip key={v.userId} activo={seleccionado?.userId === v.userId} onClick={() => elegir(v.userId)}>
              {v.vendedor.split(' ')[0]}
            </Chip>
          ))}
        </div>
        {seleccionado ? (
          <>
            <p className="mb-2 px-1 text-[12px] text-[var(--muted)]">
              Viendo lo mismo que ve <strong className="text-[var(--cream)]">{seleccionado.vendedor}</strong> · {seleccionado.territorio}
            </p>
            <VistaVendedor key={seleccionado.userId} filas={seleccionado.filas} hoy={hoy} />
          </>
        ) : vendedores.length ? (
          <VistaEquipo vendedores={vendedores} onElegir={elegir} />
        ) : (
          <VistaVendedor filas={[]} hoy={hoy} />
        )}
      </>
    )
  }

  return (
    <div className="tw-spacing mx-auto w-full max-w-[1100px] px-4 pt-1 lg:px-6 lg:pt-4">
      <AppHeader eyebrow="Ventas · temporada 2026–27" title="Metas" />
      {contenido}
    </div>
  )
}

function Chip({ activo, onClick, children }: { activo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={activo}
      onClick={onClick}
      className="min-h-[40px] rounded-full border px-4 text-[13px] font-semibold transition-colors"
      style={{
        background: activo ? 'var(--gold-dim)' : 'var(--surface)',
        borderColor: activo ? 'rgba(212,175,55,0.35)' : 'var(--border)',
        color: activo ? 'var(--gold)' : 'var(--cream)',
      }}
    >
      {children}
    </button>
  )
}
