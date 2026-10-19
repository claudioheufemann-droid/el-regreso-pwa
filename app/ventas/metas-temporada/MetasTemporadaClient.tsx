'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, RefreshCw } from 'lucide-react'
import { type FilaMeta, type Escala, semanaInicial } from './tipos'
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
  filas, periodos, esAdmin, hoy, error,
}: {
  filas: FilaMeta[]; periodos: FilaMeta[]; esAdmin: boolean; hoy: string; error: string | null
}) {
  const router = useRouter()
  const [elegido, setElegido] = useState<string>(EQUIPO)
  // Escala (semana / período 24→23) y lo elegido en cada una. Vive acá (no en
  // cada vista) para que al pasar de "Equipo" a un vendedor se siga mirando lo mismo.
  const [escala, setEscala] = useState<Escala>('semana')
  const [elegidaPor, setElegidaPor] = useState<Record<Escala, number>>(() => ({
    semana: semanaInicial(filas),
    periodo: semanaInicial(periodos),
  }))
  const corte = {
    escala,
    onEscala: setEscala,
    valor: elegidaPor[escala],
    onValor: (n: number) => setElegidaPor(prev => ({ ...prev, [escala]: n })),
  }

  const vendedores: VendedorPlan[] = useMemo(() => {
    const porUsuario = new Map<string, VendedorPlan>()
    for (const f of filas) {
      const v = porUsuario.get(f.userId) ?? { userId: f.userId, vendedor: f.vendedor, territorio: f.territorio, filas: [], periodos: [] }
      v.filas.push(f)
      porUsuario.set(f.userId, v)
    }
    for (const p of periodos) porUsuario.get(p.userId)?.periodos.push(p)
    return [...porUsuario.values()].sort((a, b) => a.vendedor.localeCompare(b.vendedor, 'es'))
  }, [filas, periodos])

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
    contenido = <VistaVendedor filas={filas} periodos={periodos} hoy={hoy} corte={corte} />
  } else if (seleccionado) {
    contenido = <VistaVendedor key={seleccionado.userId} filas={seleccionado.filas} periodos={seleccionado.periodos} hoy={hoy} corte={corte} />
  } else if (vendedores.length) {
    contenido = <VistaEquipo vendedores={vendedores} hoy={hoy} corte={corte} onElegir={elegir} />
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
            className="-ml-1 inline-flex min-h-[40px] items-center gap-1.5 px-1 text-[14px] font-semibold text-[var(--cc-ink-2)] hover:text-[var(--cc-ink)]"
          >
            <ArrowLeft size={15} /> Volver
          </button>

          <h1 className="mt-1 flex min-w-0 items-baseline gap-3">
            <span className="text-[30px] font-bold leading-none tracking-[-0.03em] text-[var(--cc-ink)] md:text-[34px]">Metas</span>
            <span className="truncate text-[16px] font-medium text-[var(--cc-ink-2)]">Temporada 2026–27</span>
          </h1>

          {/* Selector centrado y protagonista (pedido: arriba a la derecha quedaba escondido) */}
          {esAdmin && vendedores.length > 0 && (
            <div className="mt-5 flex justify-center">
              <div
                role="tablist"
                aria-label="Ver metas de"
                className="flex w-full gap-0.5 rounded-[14px] bg-[#EEEAE2] p-1 md:w-auto md:gap-1"
              >
                <Pestana activa={!seleccionado} onClick={() => elegir(EQUIPO)}>Equipo</Pestana>
                {vendedores.map(v => (
                  <Pestana key={v.userId} activa={seleccionado?.userId === v.userId} onClick={() => elegir(v.userId)}>
                    {v.vendedor.split(' ')[0]}
                  </Pestana>
                ))}
              </div>
            </div>
          )}
          {contexto && (
            <p className={`mt-3 truncate text-[14px] font-medium text-[var(--cc-ink-2)] ${esAdmin ? 'text-center' : ''}`}>{contexto}</p>
          )}
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
      // Colores por clase, no inline: las reglas de contraste de [data-theme="light"]
      // (globals.css) reescriben cualquier `color:#FFFFFF` inline y el texto activo
      // quedaba oscuro sobre fondo oscuro.
      className={`min-h-[44px] min-w-0 flex-1 truncate rounded-[10px] px-1 text-[13px] font-bold tracking-[-0.01em] sm:px-3 sm:text-[14px] md:min-w-[112px] md:flex-none md:px-5 md:text-[16px] ${
        activa
          ? 'bg-[var(--cc-ink)] text-[var(--cc-on-gold)] shadow-[0_1px_3px_rgba(17,13,9,0.25)]'
          : 'text-[var(--cc-ink-2)] hover:bg-white/60 hover:text-[var(--cc-ink)]'
      }`}
    >
      {children}
    </button>
  )
}
