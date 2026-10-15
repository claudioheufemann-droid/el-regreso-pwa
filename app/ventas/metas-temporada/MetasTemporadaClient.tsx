'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, RefreshCw } from 'lucide-react'
import { type FilaMeta } from './tipos'
import VistaVendedor, { SinMetas } from './VistaVendedor'
import VistaEquipo, { type VendedorPlan } from './VistaEquipo'

const EQUIPO = '__equipo__'

/**
 * Metas · temporada oct 2026 – mar 2027. Pantalla CLARA (pedido explícito,
 * mockup de referencia): reutiliza los tokens --cc-* de Control Comercial
 * (.cc-root[data-theme="light"]) y .tw-spacing para que funcione el spacing
 * de Tailwind (ver globals.css). El resto de Ventas sigue oscuro.
 */
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

  const seleccionado = esAdmin ? vendedores.find(v => v.userId === elegido) ?? null : vendedores[0] ?? null

  const elegir = (id: string) => {
    setElegido(id)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  let contexto: React.ReactNode = null
  if (esAdmin && seleccionado) {
    contexto = <>Viendo lo mismo que ve <strong className="font-semibold text-[var(--cc-ink)]">{seleccionado.vendedor}</strong> · {seleccionado.territorio}</>
  } else if (esAdmin && vendedores.length) {
    contexto = <>Vista del equipo · {vendedores.length} vendedores</>
  } else if (seleccionado) {
    contexto = <><strong className="font-semibold text-[var(--cc-ink)]">{seleccionado.vendedor}</strong> · {seleccionado.territorio}</>
  }

  let contenido: React.ReactNode
  if (error) {
    contenido = (
      <div className="flex flex-col items-center px-6 py-14 text-center">
        <p className="text-[15px] font-semibold text-[var(--cc-ink)]">No se pudieron cargar las metas</p>
        <p className="mt-1 text-[12px] text-[var(--cc-ink-2)]">{error}</p>
        <button
          type="button"
          onClick={() => router.refresh()}
          className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-[10px] bg-[var(--cc-gold)] px-5 text-[13px] font-semibold text-white"
        >
          <RefreshCw size={15} /> Reintentar
        </button>
      </div>
    )
  } else if (!esAdmin) {
    contenido = <VistaVendedor filas={filas} hoy={hoy} />
  } else if (seleccionado) {
    contenido = <VistaVendedor key={seleccionado.userId} filas={seleccionado.filas} hoy={hoy} />
  } else if (vendedores.length) {
    contenido = <VistaEquipo vendedores={vendedores} hoy={hoy} onElegir={elegir} />
  } else {
    contenido = <SinMetas />
  }

  return (
    <div className="cc-root tw-spacing metas-claro w-full px-4 pt-1 md:px-6 lg:px-8 lg:pt-4" data-theme="light">
      <div className="mx-auto w-full max-w-[1400px]">
        <header className="pb-4">
          <button
            type="button"
            onClick={() => router.push('/')}
            className="-ml-1 inline-flex min-h-[36px] items-center gap-1.5 px-1 text-[13px] text-[var(--cc-ink-2)] hover:text-[var(--cc-ink)]"
          >
            <ArrowLeft size={15} /> Volver
          </button>

          <div className="mt-1 flex flex-col gap-3 md:flex-row md:items-end md:justify-between md:gap-6">
            <h1 className="flex min-w-0 items-baseline gap-3">
              <span className="text-[30px] font-bold leading-none tracking-[-0.03em] text-[var(--cc-ink)] md:text-[32px]">Metas</span>
              <span className="truncate text-[15px] text-[var(--cc-ink-2)]">Temporada 2026–27</span>
            </h1>

            <div className="min-w-0 md:text-right">
              {esAdmin && vendedores.length > 0 && (
                <div
                  role="tablist"
                  aria-label="Ver metas de"
                  className="flex flex-wrap justify-between border-b border-[var(--cc-line)] md:justify-end md:gap-2 md:border-b-0"
                >
                  <Pestana activa={!seleccionado} onClick={() => elegir(EQUIPO)}>Equipo</Pestana>
                  {vendedores.map(v => (
                    <Pestana key={v.userId} activa={seleccionado?.userId === v.userId} onClick={() => elegir(v.userId)}>
                      {v.vendedor.split(' ')[0]}
                    </Pestana>
                  ))}
                </div>
              )}
              {contexto && <p className="mt-2 truncate text-[12px] text-[var(--cc-ink-2)]">{contexto}</p>}
            </div>
          </div>
        </header>

        <div className="border-t border-[var(--cc-line)] pt-5">{contenido}</div>
      </div>
    </div>
  )
}

function Pestana({ activa, onClick, children }: { activa: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={activa}
      onClick={onClick}
      className="-mb-px min-h-[40px] border-b-2 px-2 text-[13px] transition-colors md:px-3"
      style={{
        borderColor: activa ? 'var(--cc-gold)' : 'transparent',
        color: activa ? 'var(--cc-gold-deep)' : 'var(--cc-ink-2)',
        fontWeight: activa ? 600 : 400,
      }}
    >
      {children}
    </button>
  )
}
