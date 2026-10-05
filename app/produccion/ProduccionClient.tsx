'use client'

import dynamic from 'next/dynamic'
import { useEffect, useRef, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { Plus, ChevronLeft, Info, Move, X, RefreshCw } from 'lucide-react'
import { navItems } from './navegacion'
import { useEstadoArrastre, transformFantasma, type StoreArrastre } from './useArrastreCalendario'

const ConfigProductosGantt = dynamic(() => import('./ConfigProductosGantt'), { ssr: false })
const ModalAgregarProducto = dynamic(() => import('./ModalAgregarProducto'), { ssr: false })
const PopoverEditarTanque = dynamic(() => import('./PopoverEditarTanque'), { ssr: false })
const ModalCerrarLote = dynamic(() => import('./ModalCerrarLote'), { ssr: false })
import { fNum, fMinutosDesde, ModalConfirmarLoteGrupo } from './compartido'
import { useProduccion, type ProduccionProps } from './useProduccion'
import TabHoy from './vistas/TabHoy'
import TabDemanda from './vistas/TabDemanda'
import TabPlan from './vistas/TabPlan'
import TabPlanta from './vistas/TabPlanta'
import TabCompras from './vistas/TabCompras'

/**
 * Cascarón del módulo Producción: encabezado, las cinco pestañas y los modales
 * que se abren desde más de una pestaña. El estado y todos los cálculos viven
 * en useProduccion; cada pestaña es un archivo en vistas/.
 *
 * Rediseño 4-oct-2026: paleta de Ventas (carbón + dorado, con modo claro) y
 * pestañas arriba en vez del menú lateral propio — igual que Administración,
 * que también es una página con pestañas.
 */
export default function ProduccionClient(props: ProduccionProps) {
  const p = useProduccion(props)
  const { arrastreStore, fantasmaRef, deshacer, deshacerQuitar, cerrarDeshacer, recetaInsumos, ultimaCorrida, minutosDesdeSyncStock, activeTab, setActiveTab, guardandoPlan, errorPlan, setErrorPlan, setMostrarFormLote, sugerenciaModal, setSugerenciaModal, guardarAjusteTanque, restablecerAjusteTanque, agregarLote, configGantt, setConfigGantt, configAbierta, setConfigAbierta, agregarProductoAbierto, setAgregarProductoAbierto, ajustesTanque, editarTanqueAbierto, setEditarTanqueAbierto, guardandoAjusteTanque, errorAjusteTanque, alertasPorTab, cierreLote, setCierreLote, cambiarEstadoLote } = p
  const actual = navItems.find(i => i.id === activeTab) ?? navItems[0]
  // Cada pestaña abre desde arriba: el contenedor de scroll es uno solo y, sin
  // esto, al cambiar de pestaña se quedaba a la altura de la anterior.
  const contenidoRef = useRef<HTMLElement>(null)
  useEffect(() => { contenidoRef.current?.scrollTo({ top: 0 }) }, [activeTab])

  return (
    // prod-root: excluye a este módulo del reset global `* { padding: 0 }` de
    // globals.css y define la paleta --p-* (ver globals.css).
    <div className="prod-root flex h-[100dvh] w-full flex-col overflow-hidden bg-(--p-bg) font-sans">

      {/* ── Encabezado ── */}
      <header className="mobile-safe-top shrink-0 border-b border-(--p-line) bg-(--p-card)">
        <div className="flex items-center justify-between gap-3 px-4 pt-3 lg:px-8">
          <div className="flex min-w-0 items-center gap-2.5">
            <Link
              href="/"
              aria-label="Volver al inicio"
              className="prod-press flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-(--p-line) text-(--p-text-3) hover:bg-(--p-hover) hover:text-(--p-text)"
            >
              <ChevronLeft size={18} />
            </Link>
            <div className="min-w-0">
              <p className="prod-eyebrow text-(--p-accent)!">Producción</p>
              <h1 className="line-clamp-2 text-[15px] font-bold leading-snug tracking-[-0.015em] text-(--p-text) [text-wrap:balance] lg:text-lg">{actual.pregunta}</h1>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {/* Qué tan frescos están los datos: inventario (cada sync del ERP)
                y forecast (corre el día 2 de cada mes). */}
            <div className="hidden items-center gap-3 rounded-xl border border-(--p-line) px-3 py-1.5 text-[12px] text-(--p-text-3) xl:flex">
              <span className="flex items-center gap-1.5" title="Última sincronización del inventario del ERP">
                <span className={`h-1.5 w-1.5 rounded-full ${minutosDesdeSyncStock != null && minutosDesdeSyncStock < 180 ? 'bg-(--p-ok)' : 'bg-(--p-text-4)'}`} />
                Stock {minutosDesdeSyncStock != null ? fMinutosDesde(minutosDesdeSyncStock) : 'sin sincronizar'}
              </span>
              <span className="h-3 w-px bg-(--p-line)" />
              <span className="flex items-center gap-1.5" title="Última corrida del modelo de forecast">
                <RefreshCw size={12} />
                Forecast {ultimaCorrida ? ultimaCorrida.slice(0, 10) : 'sin corrida'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => { setActiveTab('planta'); setMostrarFormLote(true) }}
              className="prod-press prod-primario flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-extrabold lg:px-4"
            >
              <Plus size={17} />
              <span className="hidden sm:inline">Nueva cocción</span>
            </button>
          </div>
        </div>

        {/* ── Pestañas ── */}
        <nav aria-label="Secciones de Producción" className="mt-2 flex gap-1 overflow-x-auto px-2 lg:px-6">
          {navItems.map(item => {
            const activo = activeTab === item.id
            const alertas = alertasPorTab[item.id] ?? 0
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                aria-current={activo ? 'page' : undefined}
                className={`prod-press relative flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-3 pb-2.5 pt-1.5 text-[13px] font-bold transition-colors ${
                  activo ? 'border-(--p-accent) text-(--p-accent)' : 'border-transparent text-(--p-text-3) hover:text-(--p-text)'
                }`}
              >
                <item.icon size={15} />
                {item.label}
                {alertas > 0 && (
                  <span className="rounded-full bg-(--p-bad-soft) px-1.5 text-[10px] font-black tabular-nums text-(--p-bad)">{alertas}</span>
                )}
              </button>
            )
          })}
        </nav>
      </header>

      {errorPlan && (
        <div role="alert" className="flex shrink-0 items-start gap-2 border-b border-(--p-bad-line) bg-(--p-bad-soft) px-4 py-2.5 text-sm text-(--p-bad) lg:px-8">
          <Info size={16} className="mt-0.5 shrink-0" />
          <span>{errorPlan}</span>
          <button type="button" onClick={() => setErrorPlan(null)} aria-label="Cerrar aviso" className="ml-auto shrink-0 rounded p-0.5 hover:bg-(--p-hover)"><X size={15} /></button>
        </div>
      )}

      {/* ── Contenido ── */}
      <main ref={contenidoRef} data-autoscroll="y" className="flex-1 overflow-auto overscroll-contain bg-(--p-bg) px-4 pt-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] lg:px-8 lg:pt-7 lg:pb-7">
        {activeTab === 'hoy' && <TabHoy p={p} />}
        {activeTab === 'demanda' && <TabDemanda p={p} />}
        {activeTab === 'plan' && <TabPlan p={p} />}
        {activeTab === 'planta' && <TabPlanta p={p} />}
        {activeTab === 'compras' && <TabCompras p={p} />}

        {/* Modales que se abren desde más de una pestaña: viven acá para que
            rendericen sin importar desde dónde se abrieron. */}
        <ConfigProductosGantt
          abierto={configAbierta}
          config={configGantt}
          onCerrar={() => setConfigAbierta(false)}
          onGuardado={fila => setConfigGantt(c => c.map(x => x.producto === fila.producto ? fila : x))}
        />

        <ModalAgregarProducto
          abierto={agregarProductoAbierto}
          config={configGantt}
          guardando={guardandoPlan}
          error={errorPlan}
          onGuardar={datos => void agregarLote(datos)}
          onCerrar={() => setAgregarProductoAbierto(false)}
        />

        {editarTanqueAbierto && (
          <PopoverEditarTanque
            datos={editarTanqueAbierto}
            tieneAjuste={ajustesTanque.some(a => a.tanque === editarTanqueAbierto.tanque && a.codigoLote === editarTanqueAbierto.codigoLote)}
            guardando={guardandoAjusteTanque}
            error={errorAjusteTanque}
            onGuardar={guardarAjusteTanque}
            onRestablecer={restablecerAjusteTanque}
            onCerrar={() => setEditarTanqueAbierto(null)}
          />
        )}

        {/* "Programar cocción": se abre desde Hoy, Plan y Planta. */}
        {sugerenciaModal && (
          <ModalConfirmarLoteGrupo
            grupo={sugerenciaModal}
            guardando={guardandoPlan}
            recetaInsumos={recetaInsumos}
            onCancelar={() => setSugerenciaModal(null)}
            onConfirmar={({ litrosPlanificados, fechaPlanificada, necesidadCubrir, cubreHasta, motivo }) => agregarLote({
              producto: sugerenciaModal.producto,
              categoria: sugerenciaModal.categoria,
              litrosPlanificados,
              fechaPlanificada,
              origen: 'sugerido',
              motivo,
              necesidadCubrir,
              cubreHasta,
            })}
          />
        )}

        {/* Cerrar un lote: cuántos litros salieron de verdad. */}
        {cierreLote && (
          <ModalCerrarLote
            lote={cierreLote}
            guardando={guardandoPlan}
            onCancelar={() => setCierreLote(null)}
            onConfirmar={async datos => {
              await cambiarEstadoLote(cierreLote.id, 'completado', datos)
              setCierreLote(null)
            }}
          />
        )}

        {/* Fantasma del arrastre: lee el almacén del arrastre por su cuenta y
            se mueve por referencia (ver FantasmaArrastre). */}
        <FantasmaArrastre store={arrastreStore} fantasmaRef={fantasmaRef} />

        {/* "Deshacer" tras quitar un bloque del Gantt: perdonar el error en vez
            de pedir confirmación antes. Queda 6 segundos. */}
        {deshacer && (
          <div role="status" className="prod-aviso fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] left-1/2 z-[9000] flex -translate-x-1/2 items-center gap-3 rounded-xl border border-(--p-line) bg-[#1C1C1C] py-2 pl-4 pr-2 text-sm text-white shadow-2xl">
            <span><strong>{deshacer.lote.producto}</strong> quitado del plan</span>
            <button type="button" onClick={() => void deshacerQuitar()} className="prod-press rounded-lg px-2.5 py-1 font-bold text-[#E5C45A] hover:bg-white/10">Deshacer</button>
            <button type="button" onClick={cerrarDeshacer} aria-label="Cerrar aviso" className="rounded-lg p-1 text-white/60 hover:bg-white/10 hover:text-white"><X size={15} /></button>
          </div>
        )}
      </main>
    </div>
  )
}

/** El bloque que sigue al puntero durante un arrastre en el Gantt. Se suscribe
 *  solo al almacén del arrastre (no al módulo) y su posición la escribe el hook
 *  directo en `transform` en cada movimiento: React sólo lo redibuja cuando
 *  cambia la celda destino. */
function FantasmaArrastre({ store, fantasmaRef }: { store: StoreArrastre; fantasmaRef: RefObject<HTMLDivElement | null> }) {
  const arrastre = useEstadoArrastre(store)
  if (!arrastre || typeof document === 'undefined') return null
  return createPortal(
    <div
      ref={fantasmaRef}
      className="prod-root pointer-events-none fixed left-0 top-0 z-[10000] will-change-transform"
      style={{ transform: transformFantasma(arrastre.x, arrastre.y) }}
    >
      <div className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-bold shadow-xl ring-1 ${
        arrastre.destino ? 'prod-primario ring-black/10' : 'bg-(--p-card) text-(--p-text-3) ring-(--p-line)'
      }`}>
        <Move size={12} className="shrink-0" />
        <span className="max-w-[170px] truncate">{arrastre.carga.producto}</span>
        <span className="opacity-60">{fNum(arrastre.carga.litros)} L</span>
      </div>
      <p className="mt-1 text-center text-[10px] font-bold text-(--p-accent)">
        {arrastre.destino
          ? `${new Date(arrastre.destino.fecha + 'T00:00:00Z').toLocaleDateString('es-CL', { weekday: 'short', day: '2-digit', month: 'short', timeZone: 'UTC' })}${arrastre.destino.fermentador ? ` · ${arrastre.destino.fermentador}` : ''}`
          : 'Suelta sobre un día de un tanque'}
      </p>
    </div>,
    document.body,
  )
}
