'use client'

import dynamic from 'next/dynamic'
import React from 'react'
import ProductImage from '@/components/ui/ProductImage'
import { ShoppingCart, AlertTriangle, Calendar as CalendarIcon, CalendarDays, TrendingUp, ChevronDown, Info, Beaker, ArrowUp, ArrowDown, CheckCircle2, Trash2, X, Plus, Play, RotateCcw, History } from 'lucide-react'
import { ENVASE_LABEL } from '@/lib/produccion/reglas'
import { COLORS } from '../tema'

const GanttProduccion = dynamic(() => import('../GanttProduccion'), {
  loading: () => <div className="flex h-64 items-center justify-center text-sm text-(--p-text-3)">Cargando el Gantt de fermentadores…</div>,
  ssr: false,
})
const PopoverCoccion = dynamic(() => import('../PopoverCoccion'), { ssr: false })
import { guardarProyeccionAbierta, fNum, sumarDiasCalISO, COLOR_ENVASE, hoyLocalISO, fMinutosDesde, FormNuevoLote } from '../compartido'
import { Seccion, fFecha } from './ui'
import type { Produccion } from '../useProduccion'

/** Planta: qué hay en cada tanque, qué se cocina y en qué orden, y qué se
 *  cocinó de verdad. Junta lo que antes eran "3 · Cuándo y dónde" (Gantt) y
 *  "Plan Maestro" (cola + split de envasado). */
export default function TabPlanta({ p }: { p: Produccion }) {
  const { ocupacionPlanta, setActiveTab, plan, guardandoPlan, cambiarEstadoLote, agregarLote, horizontePlanMeses, setHorizontePlanMeses, horizontePlanMax, anclasCoccion, detalleCoccion, cancelarCierrePreview, programarCierrePreview, fijarDetalle, cerrarDetalle, anclarCoccion, anclasTanque, anclarTanque, limpiarAnclas, configGantt, setConfigAbierta, proyeccionCargaAbierta, setAgregarProductoAbierto, setEditarTanqueAbierto, setErrorAjusteTanque, bloqueRecienMovido, arrastreStore, propsOrigenGantt, quitarBloqueGantt, planSugerido, resumenCargaMeses, bloquesGantt, coberturaGantt, necesidadGantt, ultimoMesForecast, fermentadoresGantt, calendarioCobertura, estaSeleccionado, alternarLote, presupuesto, splitFermentadores, minutosDesdeSyncStock, mostrarFormLote, setMostrarFormLote, moverLote, seguimientoLotes, setCierreLote, lotesCerrados } = p
  return (
            <div className="prod-enter flex flex-col gap-6 pb-4">
              {/* ── Lotes cuya fecha pasó sin que nadie dijera si se cocinaron ── */}
              {seguimientoLotes.vencidos.length > 0 && (
                <div className="prod-card border-(--p-bad-line)! p-4">
                  <div className="flex items-center gap-2">
                    <AlertTriangle size={17} className="text-(--p-bad)" />
                    <h3 className="font-bold text-(--p-text)">{seguimientoLotes.vencidos.length === 1 ? 'Un lote' : `${seguimientoLotes.vencidos.length} lotes`} con la fecha vencida</h3>
                  </div>
                  <p className="mt-1 text-sm text-(--p-text-3)">¿Se cocinaron? Márcalos para que el plan y el Gantt reflejen lo que de verdad pasó.</p>
                  <div className="mt-3 flex flex-col divide-y divide-(--p-line-2)">
                    {seguimientoLotes.vencidos.map(l => (
                      <div key={l.id} className="flex flex-wrap items-center gap-3 py-2.5">
                        <ProductImage nombre={l.producto} categoria={l.categoria} size={30} radius={7} />
                        <div className="min-w-[180px] flex-1">
                          <p className="font-semibold text-(--p-text)">{l.producto} · {fNum(l.litrosPlanificados)} L</p>
                          <p className="text-xs text-(--p-bad)">Estaba para el {fFecha(l.fechaPlanificada)}</p>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          <button type="button" onClick={() => cambiarEstadoLote(l.id, 'en_curso', { fechaInicioReal: l.fechaPlanificada })} className="prod-press flex items-center gap-1 rounded-lg bg-(--p-ok-soft) px-2.5 py-1.5 text-xs font-bold text-(--p-ok)"><Play size={13} />Sí, se cocinó</button>
                          <button type="button" onClick={() => cambiarEstadoLote(l.id, 'planificado', { fechaPlanificada: hoyLocalISO() })} className="prod-press flex items-center gap-1 rounded-lg bg-(--p-chip) px-2.5 py-1.5 text-xs font-bold text-(--p-text-2)"><RotateCcw size={13} />Pasar a hoy</button>
                          <button type="button" onClick={() => cambiarEstadoLote(l.id, 'cancelado')} className="prod-press flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold text-(--p-bad) hover:bg-(--p-bad-soft)"><Trash2 size={13} />No se hará</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ══════════ PROYECCIÓN DE CARGA ══════════
                  Antes se llamaba "Plan de Cobertura" y sólo contaba la
                  SIMULACIÓN (planSugerido) — con lotes ya confirmados en la
                  cola real, esta tarjeta podía decir "0 cocciones" para un
                  mes que el propio Gantt de abajo mostraba lleno. Cierto en
                  su propio término (no había nada SUGERIDO pendiente ahí)
                  pero leído como "no hay nada agendado", que es lo contrario
                  de lo que pasaba — dos resúmenes del mismo módulo
                  contradiciéndose (encontrado 22-sep-2026, con 13 lotes
                  confirmados y la tarjeta en cero).

                  Ahora cada mes muestra CONFIRMADO (de `plan`, la cola real)
                  y PROPUESTO (de planSugerido, lo que el modelo sugeriría si
                  nada más se confirma) por separado — sin sumarlos en un
                  solo total, para no perder la distinción de qué es una
                  decisión ya tomada y qué es una propuesta. Ver
                  resumenCargaMeses arriba. */}
              {planSugerido.porMes.length > 0 && (
                <div className={`rounded-xl border bg-(--p-card) shadow-sm transition-shadow duration-300 ${proyeccionCargaAbierta ? 'border-(--p-ok-line) shadow-md' : 'border-(--p-line)'}`}>
                  <button
                    type="button"
                    onClick={() => guardarProyeccionAbierta(!proyeccionCargaAbierta)}
                    aria-expanded={proyeccionCargaAbierta}
                    className="prod-press flex w-full flex-wrap items-center justify-between gap-3 p-5 text-left transition-colors hover:bg-(--p-hover)"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <CalendarIcon size={18} style={{ color: COLORS.primario }} />
                      <h3 className="font-bold text-(--p-text)">Proyección de carga — {horizontePlanMeses} {horizontePlanMeses === 1 ? 'mes' : 'meses'}</h3>
                      {/* Confirmadas: ya están en la cola real (plan_produccion).
                          Propuestas: el modelo las sugeriría si no se confirma nada
                          más — no son una decisión tomada, por eso van aparte. */}
                      <span className="rounded-full bg-(--p-ok-soft) px-2 py-0.5 text-[11px] font-bold text-(--p-ok)">
                        {resumenCargaMeses.reduce((s, f) => s + f.lotesCervezaConfirmado + f.lotesKombuchaConfirmado, 0)} confirmadas
                      </span>
                      <span className="rounded-full bg-(--p-chip) px-2 py-0.5 text-[11px] font-bold text-(--p-text-2)">
                        {planSugerido.lotes.filter(l => !l.enCurso).length} {planSugerido.lotes.filter(l => !l.enCurso).length === 1 ? 'propuesta' : 'propuestas'}
                      </span>
                      {/* El plan arranca de la planta real: lo que hoy está en los
                          tanques no se vuelve a cocer, y esos fermentadores no se
                          pueden usar hasta que se embarrilen. */}
                      {planSugerido.lotes.some(l => l.enCurso) && (
                        <span className="rounded-full bg-(--p-info-soft) px-2 py-0.5 text-[11px] font-bold text-(--p-info)">
                          + {fNum(planSugerido.lotes.filter(l => l.enCurso).reduce((a, l) => a + l.litros, 0))} L ya fermentando
                          en {planSugerido.lotes.filter(l => l.enCurso).length} {planSugerido.lotes.filter(l => l.enCurso).length === 1 ? 'tanque' : 'tanques'}
                        </span>
                      )}
                      {/* Visible aunque la tarjeta esté plegada: un volumen sin
                          dónde ponerlo es un problema real, y plegar la sección
                          no debería poder esconderlo sin dejar rastro. */}
                      {planSugerido.sinTanque.length > 0 && (
                        <span className="rounded-full bg-(--p-bad-soft) px-2 py-0.5 text-[11px] font-bold text-(--p-bad)">
                          {planSugerido.sinTanque.length} sin tanque
                        </span>
                      )}
                    </div>
                    <ChevronDown
                      size={20}
                      className={`shrink-0 text-(--p-text-3) transition-transform duration-300 ${proyeccionCargaAbierta ? 'rotate-180 text-(--p-ok)' : ''}`}
                    />
                  </button>
                  <div className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${proyeccionCargaAbierta ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                  <div className="overflow-hidden">
                  <div className="px-5 pb-5">
                    {/* Cuánto simula el motor hacia adelante. Tope real: no hay
                        forecast más allá de horizontePlanMax, así que no tiene
                        sentido ofrecer más — sería un horizonte vacío. */}
                    <div className="mb-3 flex flex-wrap items-center gap-1.5">
                      {[3, 6, 9, 12]
                        .filter(n => n <= horizontePlanMax)
                        .map(n => (
                          <button
                            key={n}
                            type="button"
                            onClick={() => setHorizontePlanMeses(n)}
                            className={`prod-press rounded-full px-2.5 py-1 text-xs font-bold ${
                              horizontePlanMeses === n ? 'border border-(--p-accent-line) bg-(--p-accent-soft) text-(--p-accent)' : 'border border-(--p-line) text-(--p-text-3) hover:bg-(--p-hover)'
                            }`}
                          >
                            {n} {n === 1 ? 'mes' : 'meses'}
                          </button>
                        ))}
                      {horizontePlanMax > 3 && (
                        <button
                          type="button"
                          onClick={() => setHorizontePlanMeses(horizontePlanMax)}
                          className={`prod-press rounded-full px-2.5 py-1 text-xs font-bold ${
                            horizontePlanMeses === horizontePlanMax ? 'border border-(--p-accent-line) bg-(--p-accent-soft) text-(--p-accent)' : 'border border-(--p-line) text-(--p-text-3) hover:bg-(--p-hover)'
                          }`}
                        >
                          Hasta fin del forecast
                        </button>
                      )}
                    </div>
                  <p className="mb-3 flex items-start gap-1.5 rounded-lg bg-(--p-warn-soft) px-3 py-2 text-xs text-(--p-warn)">
                    <Info size={13} className="mt-0.5 shrink-0" />
                    Todas las cocciones sugeridas —de este mes o de más adelante— entran{' '}
                    <strong className="mx-1">desmarcadas</strong> del presupuesto: son propuestas del modelo, no algo
                    ya decidido, así que hay que activarlas a mano (clic en la tarjeta) antes de que sumen a la compra.
                    Lo que ya está fermentando no necesita esto — sus insumos ya se compraron.
                  </p>
                  <p className="mb-4 text-sm text-(--p-text-3)">
                    Cada mes cruza dos números: lo <strong>confirmado</strong> (la cola real de cocciones, la misma
                    que ejecuta el Gantt de abajo) y lo <strong>propuesto</strong> — una simulación día a día del
                    inventario de cada producto que agrega una cocción cada vez que el stock tocaría su punto de
                    reorden, si nada más se confirma primero. Cada propuesta se acota al tamaño de un tanque que
                    existe de verdad. Parte de la planta como está hoy: lo que ya se está fermentando no se vuelve a
                    cocer, suma a stock recién el día que se embarrila, y mantiene su tanque ocupado hasta entonces.
                  </p>

                  {planSugerido.sinTanque.length > 0 && (
                    <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-(--p-bad-line) bg-(--p-bad-soft) p-3 text-sm text-(--p-bad)">
                      <AlertTriangle size={16} className="mt-0.5 shrink-0 text-(--p-bad)" />
                      <div>
                        <p className="font-bold">
                          {planSugerido.sinTanque.length} {planSugerido.sinTanque.length === 1 ? 'volumen sin tanque' : 'volúmenes sin tanque'} donde ponerlo
                        </p>
                        <p className="mt-0.5 text-(--p-bad)">
                          {planSugerido.sinTanque.map(s => `${s.producto} (${fNum(s.litros)} L)`).join(', ')} — no alcanzan
                          los fermentadores de esa línea dentro del horizonte. Hay que sumar capacidad, correr la
                          proyección, o aceptar el quiebre.
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="overflow-x-auto">
                    <div className="flex min-w-max gap-3 pb-1">
                      {resumenCargaMeses.map(f => (
                        <div
                          key={f.mes}
                          className={`prod-hover-card w-64 shrink-0 rounded-lg border p-3 ${
                            f.severidad === 'critico' ? 'border-(--p-bad-line) bg-(--p-bad-soft)'
                              : f.severidad === 'ajustado' ? 'border-(--p-warn-line) bg-(--p-warn-soft)'
                              : 'border-(--p-ok-line) bg-(--p-ok-soft)'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-bold capitalize text-(--p-text)">{f.etiqueta}</span>
                            <span
                              className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                                f.severidad === 'critico' ? 'bg-red-500' : f.severidad === 'ajustado' ? 'bg-amber-500' : 'bg-emerald-500'
                              }`}
                              title={
                                f.severidad === 'critico' ? 'Hay propuestas que no alcanzan a estar listas antes de que el producto se agote.'
                                  : f.severidad === 'ajustado' ? 'Alguna propuesta tuvo que correrse de su fecha ideal por falta de tanque libre.'
                                  : 'Todo entra en fecha con los tanques disponibles.'
                              }
                            />
                          </div>

                          {/* Cervecería: confirmado (cola real) y propuesto
                              (simulación) lado a lado — nunca sumados en un
                              solo número, para no borrar la diferencia entre
                              "ya decidido" y "el modelo lo sugeriría". */}
                          <div className="mt-2.5 border-t border-(--p-line) pt-2">
                            <span className="text-[10px] font-bold uppercase tracking-wide text-(--p-text-3)">Cervecería (T)</span>
                            <div className="mt-1 flex items-center justify-between">
                              <span className="text-[11px] text-(--p-ok)">Confirmado</span>
                              <span className="text-xs font-bold tabular-nums text-(--p-text)">{fNum(f.litrosCervezaConfirmado)} L</span>
                            </div>
                            <p className="text-[10.5px] text-(--p-text-3)">
                              {f.lotesCervezaConfirmado === 0 ? 'Ninguna en la cola' : `${f.lotesCervezaConfirmado} en la cola`}
                            </p>
                            <div className="mt-1 flex items-center justify-between">
                              <span className="text-[11px] text-(--p-text-3)">Propuesto</span>
                              <span className="text-xs font-bold tabular-nums text-(--p-text-2)">{fNum(f.litrosCerveza)} L</span>
                            </div>
                            <p className="text-[10.5px] text-(--p-text-3)">
                              {f.lotesCerveza === 0 ? 'Sin propuestas' : `${f.lotesCerveza} ${f.lotesCerveza === 1 ? 'propuesta' : 'propuestas'}`}
                            </p>
                          </div>

                          <div className="mt-2 border-t border-(--p-line) pt-2">
                            <span className="text-[10px] font-bold uppercase tracking-wide text-(--p-text-3)">Kombuchería (K)</span>
                            <div className="mt-1 flex items-center justify-between">
                              <span className="text-[11px] text-(--p-ok)">Confirmado</span>
                              <span className="text-xs font-bold tabular-nums text-(--p-text)">{fNum(f.litrosKombuchaConfirmado)} L</span>
                            </div>
                            <p className="text-[10.5px] text-(--p-text-3)">
                              {f.lotesKombuchaConfirmado === 0 ? 'Ninguna en la cola' : `${f.lotesKombuchaConfirmado} en la cola`}
                            </p>
                            <div className="mt-1 flex items-center justify-between">
                              <span className="text-[11px] text-(--p-text-3)">Propuesto</span>
                              <span className="text-xs font-bold tabular-nums text-(--p-text-2)">{fNum(f.litrosKombucha)} L</span>
                            </div>
                            <p className="text-[10.5px] text-(--p-text-3)">
                              {f.lotesKombucha === 0 ? 'Sin propuestas' : `${f.lotesKombucha} ${f.lotesKombucha === 1 ? 'propuesta' : 'propuestas'}`}
                            </p>
                          </div>

                          {f.lotesTarde > 0 ? (
                            <p className="mt-2.5 border-t border-(--p-line) pt-2 text-[11px] font-bold text-(--p-bad)">
                              {f.lotesTarde} {f.lotesTarde === 1 ? 'propuesta no llega' : 'propuestas no llegan'} antes de que se agote el producto.
                            </p>
                          ) : f.lotesCerveza + f.lotesKombucha + f.lotesCervezaConfirmado + f.lotesKombuchaConfirmado === 0 ? (
                            <p className="mt-2.5 border-t border-(--p-line) pt-2 text-[11px] text-(--p-ok)">
                              Cubierto con stock + colchón, sin cocer nada nuevo.
                            </p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                  </div>
                  </div>
                  </div>
                </div>
              )}

              {/* Carta Gantt de ocupación de fermentadores — reemplaza a las
                  dos grillas de calendario que había antes (ésta, con las
                  sugerencias, y el Cronograma de Cocciones de Resumen, con lo
                  confirmado). Eran la misma planta contada dos veces: había
                  que mirar las dos para saber si quedaba un tanque libre.

                  Acá filas = tanques y columnas = días CORRIDOS. Lo confirmado
                  va sólido y lo sugerido punteado; arrastrar un bloque cambia
                  su día y su tanque, y eso se guarda en base. */}
              <GanttProduccion
                fermentadores={fermentadoresGantt}
                bloques={bloquesGantt}
                config={configGantt}
                arrastreStore={arrastreStore}
                propsOrigen={propsOrigenGantt}
                cobertura={coberturaGantt}
                necesidad={necesidadGantt}
                hastaMes={ultimoMesForecast}
                bloqueRecienMovido={bloqueRecienMovido}
                anclasEnSesion={anclasCoccion.size + anclasTanque.size}
                onLimpiarAnclas={limpiarAnclas}
                onAbrirConfig={() => setConfigAbierta(true)}
                onAgregarProducto={() => setAgregarProductoAbierto(true)}
                onAbrirBloque={(b, rect) => {
                  if (!rect) return
                  // Detectado en el ERP: no hay lote de plan detrás, así que
                  // no hay un popover de cocción que abrir — se abre el editor
                  // de fechas, que es la única acción que tiene sentido acá.
                  if (b.tipo === 'en_tanque') {
                    if (!b.codigoLote || !b.fermentador) return
                    setErrorAjusteTanque(null)
                    setEditarTanqueAbierto({
                      tanque: b.fermentador, codigoLote: b.codigoLote,
                      producto: b.producto, categoria: b.categoria,
                      inicioISO: b.inicioISO,
                      embarrilladoISO: sumarDiasCalISO(b.inicioISO, b.dias),
                      rect,
                    })
                    return
                  }
                  // El popover trabaja sobre la simulación de planSugerido
                  // (litros, tanque, cuándo queda listo, hasta cuándo alcanza),
                  // así que sólo se abre para bloques sugeridos: un lote ya
                  // confirmado no tiene esa proyección detrás.
                  const lote = planSugerido.lotes.find(l => `sug:${l.id}` === b.id)
                  if (lote) fijarDetalle(lote, rect)
                }}
                onQuitarBloque={quitarBloqueGantt}
              />

              {/* Tarjetas de cocciones sugeridas — quedan como estaban: el
                  Gantt responde "cuándo y en qué tanque", y estas tarjetas
                  "por qué y con qué litraje", que es donde se confirman. */}
              <div className="flex flex-col overflow-hidden rounded-xl border border-(--p-line) bg-(--p-card) shadow-sm">
                <div className="hidden overflow-auto p-4 sm:block">

                {/* Detalle de la cocción: preview al pasar el cursor, panel
                    fijado al hacer clic. Vive en un portal a document.body
                    (dentro del componente) para que ninguna celda con scroll
                    lo recorte, sin importar en qué borde de la grilla esté. */}
                {detalleCoccion && (
                  <PopoverCoccion
                    lote={detalleCoccion.lote}
                    rect={detalleCoccion.rect}
                    modo={detalleCoccion.modo}
                    hoyISO={calendarioCobertura.hoyISO}
                    marcado={!detalleCoccion.lote.enCurso && estaSeleccionado(detalleCoccion.lote)}
                    tanques={ocupacionPlanta.tanques}
                    fNum={fNum}
                    onAlternar={() => alternarLote(detalleCoccion.lote)}
                    onAnclarTanque={t => anclarTanque(detalleCoccion.lote.producto, detalleCoccion.lote.loteNro, t)}
                    onMoverFecha={f => {
                      anclarCoccion(detalleCoccion.lote.producto, detalleCoccion.lote.loteNro, f)
                      cerrarDetalle()
                    }}
                    /* Confirmar la sugerencia tal como está. Antes la única
                       forma era arrastrarla al Gantt, lo que obligaba a
                       reubicarla para aceptarla: si el modelo ya la puso donde
                       corresponde, mover es ruido. Los lotes sin tanque
                       (`—`, los que nunca encontraron fermentador) se
                       confirman igual pero sin asignar, para que queden
                       visibles en la fila "sin asignar" en vez de perderse. */
                    onConfirmar={detalleCoccion.lote.enCurso ? undefined : () => {
                      const l = detalleCoccion.lote
                      void agregarLote({
                        producto: l.producto,
                        categoria: l.categoria,
                        litrosPlanificados: l.litros,
                        fechaPlanificada: l.fechaInicio,
                        motivo: l.conAlarma
                          ? `Confirmado desde el Gantt — alarma de quiebre, cubre hasta el ${l.cubreHasta}`
                          : `Confirmado desde el Gantt — punto de reorden, cubre hasta el ${l.cubreHasta}`,
                        origen: 'sugerido',
                        cubreHasta: l.cubreHasta,
                        fermentador: l.tanque === '—' ? null : l.tanque,
                      })
                      cerrarDetalle()
                    }}
                    confirmando={guardandoPlan}
                    onCerrar={cerrarDetalle}
                    onMouseEnter={detalleCoccion.modo === 'preview' ? cancelarCierrePreview : undefined}
                    onMouseLeave={detalleCoccion.modo === 'preview' ? programarCierrePreview : undefined}
                  />
                )}

                </div>
              </div>

              {/* Puente al presupuesto: lo que se marca acá es lo que se
                  compra allá. Sin esta tira el usuario no ve que su selección
                  tuvo efecto, porque el presupuesto vive en otra pestaña. */}
              {presupuesto.cocciones > 0 && (
                <button
                  type="button"
                  onClick={() => setActiveTab('compras')}
                  className="prod-press prod-hover-card flex flex-wrap items-center justify-between gap-3 rounded-xl border border-(--p-line) bg-(--p-card) p-4 text-left shadow-sm"
                >
                  <div className="flex items-center gap-3">
                    <ShoppingCart size={18} style={{ color: COLORS.primario }} />
                    <div>
                      <p className="text-sm font-bold text-(--p-text)">
                        {presupuesto.cocciones} {presupuesto.cocciones === 1 ? 'cocción marcada' : 'cocciones marcadas'} · {fNum(presupuesto.litros)} L
                      </p>
                      <p className="text-xs text-(--p-text-3)">Insumos para cocerlas, con su fecha de compra</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold tabular-nums" style={{ color: COLORS.primario }}>
                      ${fNum(presupuesto.total)}
                    </span>
                    <span className="text-xs font-bold text-(--p-text-3)">Ver presupuesto</span>
                  </div>
                </button>
              )}
              {/* ── Split de Envasado ──────────────────────────────────────
                  Lo que está en el fermentador es líquido a granel, sin
                  envase todavía. Esto responde la pregunta de quien va a
                  envasar: de estos N litros, ¿cuánto va a cada formato? El
                  reparto sale de la NECESIDAD de cada formato según el
                  forecast (qué tan lejos está de su punto de reorden), no de
                  un porcentaje fijo. */}
              {splitFermentadores.length > 0 && (
                <div className="rounded-xl border border-(--p-info-line) bg-(--p-info-soft) p-5">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <Beaker size={18} className="text-(--p-info)" />
                    <h3 className="font-bold text-(--p-info)">Split de Envasado</h3>
                    <span className="rounded-full bg-(--p-info-soft) px-2 py-0.5 text-xs font-bold text-(--p-info)">
                      {fNum(splitFermentadores.reduce((a, s) => a + s.litrosEnFermentador, 0))} L en fermentadores
                    </span>
                  </div>
                  <p className="mb-2 text-sm text-(--p-info)">
                    Lo que está fermentando todavía no tiene envase. Cada lote se reparte entre formatos y, dentro de
                    eso, cumple tres funciones: <strong>reponer el colchón</strong> de stock de seguridad,{' '}
                    <strong>cubrir la venta</strong> mientras llega la próxima cocción, y el <strong>excedente</strong>,
                    que estira la cobertura hacia adelante.
                  </p>
                  {/* Un lote pasa 3+ semanas en el tanque: el reparto no es una
                      decisión de una sola vez, se recalcula con cada sync. */}
                  <p className="mb-4 flex flex-wrap items-center gap-1.5 text-xs text-(--p-info)">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                    El reparto se recalcula con cada entrada de ventas — si un formato se acelera, el split se corrige
                    solo, sin esperar la corrida mensual del forecast.
                    {minutosDesdeSyncStock != null && <span>· Inventario {fMinutosDesde(minutosDesdeSyncStock)}</span>}
                  </p>

                  <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                    {splitFermentadores.map(s => (
                      <div key={s.producto} className="rounded-lg border border-(--p-info-line) bg-(--p-card) p-4">
                        <div className="flex items-center gap-2.5">
                          <ProductImage nombre={s.producto} categoria={s.categoria} size={30} radius={7} />
                          <div className="flex flex-col">
                            <span className="font-semibold leading-tight text-(--p-text)">{s.producto}</span>
                            <span className="text-[11px] text-(--p-text-3)">
                              {s.tanques.length > 0
                                ? s.tanques.map(t => t.nombre).join(' · ')
                                : 'Sin tanque identificado'}
                            </span>
                          </div>
                          <span className="ml-auto text-right">
                            <span className="block text-lg font-black tabular-nums text-(--p-info)">{fNum(s.litrosEnFermentador)} L</span>
                            <span className="block text-[10px] font-bold uppercase tracking-wide text-(--p-text-3)">a granel</span>
                          </span>
                        </div>

                        {/* Fecha embarrilado ESTIMADA (la calcula el enólogo,
                            no un hecho ya ocurrido) — es lo que conecta este
                            panel con el Plan Maestro: hasta que no llega esta
                            fecha, el lote no existe como producto envasado
                            que se pueda vender. */}
                        {s.fechaDisponibleEstimada && (() => {
                          const hoyISO = hoyLocalISO()
                          const atrasado = s.fechaDisponibleEstimada < hoyISO
                          const fechaFmt = new Date(s.fechaDisponibleEstimada + 'T00:00:00Z')
                            .toLocaleDateString('es-CL', { day: '2-digit', month: 'short', timeZone: 'UTC' })
                          return (
                            <p className={`mt-2 flex items-center gap-1.5 text-[11px] font-semibold ${atrasado ? 'text-(--p-warn)' : 'text-(--p-info)'}`}>
                              <CalendarDays size={12} />
                              {atrasado
                                ? `Debería haber salido del fermentador el ${fechaFmt} — revisar atraso`
                                : `Sale del fermentador ≈ ${fechaFmt}${s.tanques.length > 1 ? ' (todos los tanques)' : ''}`}
                            </p>
                          )
                        })()}

                        {/* Lote sin forecast por formato: se muestra igual —
                            hay que envasarlo — pero sin inventar un reparto. */}
                        {s.reparto.length === 0 ? (
                          <div className="mt-3 rounded-lg bg-(--p-card-2) p-3 text-xs text-(--p-text-3)">
                            Sin forecast por formato para este producto todavía, así que no hay con qué calcular el
                            reparto. El lote igual hay que envasarlo: defínelo a mano al sacarlo del tanque.
                          </div>
                        ) : (
                        <>
                        {/* Barra apilada: el reparto de un vistazo. */}
                        <div className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-(--p-chip)">
                          {s.reparto.map(r => (
                            <div
                              key={r.envase}
                              title={`${ENVASE_LABEL[r.envase] ?? r.envase}: ${r.porcentaje}%`}
                              style={{ width: `${r.porcentaje}%`, backgroundColor: COLOR_ENVASE[r.envase] }}
                            />
                          ))}
                        </div>

                        <div className="mt-3 flex flex-col gap-1.5">
                          {s.reparto.map(r => (
                            <div key={r.envase} className="flex items-center gap-2 text-sm">
                              <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: COLOR_ENVASE[r.envase] }} />
                              <span className="w-24 shrink-0 text-xs font-bold uppercase tracking-wide text-(--p-text-3)">
                                {ENVASE_LABEL[r.envase] ?? r.envase}
                              </span>
                              <span className="w-12 shrink-0 text-right text-sm font-black tabular-nums text-(--p-text)">{r.porcentaje}%</span>
                              <span className="w-20 shrink-0 text-right text-sm font-bold tabular-nums text-(--p-info)">{fNum(r.litros)} L</span>
                              {/* Los tres destinos, para que el número no sea mágico. */}
                              <span className="ml-auto text-right text-[11px] text-(--p-text-3)">
                                {[
                                  r.litrosColchon > 0 ? `${fNum(r.litrosColchon)} colchón` : null,
                                  r.litrosVentanaReposicion > 0 ? `${fNum(r.litrosVentanaReposicion)} venta` : null,
                                  r.litrosExcedente > 0 ? `${fNum(r.litrosExcedente)} excedente` : null,
                                ].filter(Boolean).join(' + ')} L
                              </span>
                            </div>
                          ))}
                        </div>

                        {/* ── Destino del lote: para qué sirve, no sólo en qué
                            envase queda. El colchón no se vende (está para
                            absorber variabilidad); lo demás sí. ── */}
                        <div className="mt-3 grid grid-cols-2 gap-2 border-t border-(--p-line-2) pt-3 sm:grid-cols-3">
                          <div>
                            <p className="text-[10px] font-bold uppercase leading-none tracking-wide text-(--p-text-3)">Colchón</p>
                            <p className="mt-1 text-sm font-bold tabular-nums text-(--p-text-2)">{fNum(s.litrosColchon)} L</p>
                            <p className="text-[10px] text-(--p-text-3)">repone stock de seguridad</p>
                          </div>
                          <div>
                            <p className="text-[10px] font-bold uppercase leading-none tracking-wide text-(--p-text-3)">Venta reposición</p>
                            <p className="mt-1 text-sm font-bold tabular-nums text-(--p-text-2)">{fNum(s.litrosVentanaReposicion)} L</p>
                            <p className="text-[10px] text-(--p-text-3)">hasta la próxima cocción</p>
                          </div>
                          <div>
                            <p className="text-[10px] font-bold uppercase leading-none tracking-wide text-(--p-info)">Excedente</p>
                            <p className="mt-1 text-sm font-bold tabular-nums text-(--p-info)">{fNum(s.excedente)} L</p>
                            <p className="text-[10px] text-(--p-text-3)">
                              {s.semanasExcedente != null && s.excedente > 0
                                ? `≈ ${s.semanasExcedente.toLocaleString('es-CL')} semanas más`
                                : 'sin excedente'}
                            </p>
                          </div>
                        </div>

                        {!s.cubreTodaLaNecesidad ? (
                          <p className="mt-2.5 text-[11px] font-semibold text-(--p-warn)">
                            El lote no alcanza a cubrir la necesidad de todos los formatos — se reparte a prorrata de ella.
                          </p>
                        ) : s.cubreVentaHasta && s.semanasVentaTotal != null && (
                          <p className="mt-2.5 text-[11px] text-(--p-text-3)">
                            Con este lote la venta queda cubierta <strong>≈ {s.semanasVentaTotal.toLocaleString('es-CL')} semanas</strong>,
                            hasta cerca del{' '}
                            {new Date(s.cubreVentaHasta + 'T00:00:00Z').toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })}
                            {' '}(estimado con la demanda proyectada
                            {s.fechaDisponibleEstimada && s.fechaDisponibleEstimada > hoyLocalISO()
                              ? ', contado desde que salga del fermentador'
                              : ''}
                            ).
                          </p>
                        )}

                        {s.ajustadoPorVentas && (
                          <p className="mt-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-(--p-ok)">
                            <TrendingUp size={11} />
                            Reparto ya corregido: algún formato se está vendiendo más rápido de lo que proyectaba el forecast.
                          </p>
                        )}
                        </>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex h-full flex-col overflow-hidden rounded-xl border border-(--p-line) bg-(--p-card) shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-(--p-line-2) bg-(--p-card-2)/50 p-5">
                  <div>
                    <h3 className="font-bold text-(--p-text)">Plan Maestro de Producción</h3>
                    <p className="text-xs text-(--p-text-3)">
                      Cola priorizada — la fila de arriba es la próxima cocción. Usa las flechas para reordenar.
                    </p>
                  </div>
                  <button
                    onClick={() => setMostrarFormLote(v => !v)}
                    className="flex items-center gap-2 rounded-lg prod-primario px-4 py-2 text-sm font-bold "
                  >
                    {mostrarFormLote ? <X size={16} /> : <Plus size={16} />}
                    {mostrarFormLote ? 'Cerrar' : 'Agregar lote'}
                  </button>
                </div>

                {mostrarFormLote && (
                  <FormNuevoLote guardando={guardandoPlan} onCancelar={() => setMostrarFormLote(false)} onGuardar={agregarLote} />
                )}

                <div className="flex-1 overflow-auto">
                  {plan.length === 0 ? (
                    <div className="flex h-full flex-col items-center justify-center gap-3 p-10 text-center text-(--p-text-3)">
                      <CalendarIcon size={40} className="opacity-50" />
                      <p className="text-sm">
                        Todavía no hay lotes en el plan. Agrega uno manual o confirma alguna sugerencia de arriba.
                      </p>
                    </div>
                  ) : (
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-(--p-card-2) text-xs uppercase tracking-wide text-(--p-text-3)">
                        <tr>
                          <th className="w-16 px-4 py-2.5 text-left">Orden</th>
                          <th className="px-4 py-2.5 text-left">Producto</th>
                          <th className="px-4 py-2.5 text-right">Litros</th>
                          <th className="px-4 py-2.5 text-left">Fecha planificada</th>
                          <th className="px-4 py-2.5 text-left">Origen</th>
                          <th className="px-4 py-2.5 text-left">Estado</th>
                          <th className="px-4 py-2.5 text-right">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-(--p-line-2)">
                        {plan.map((lote, idx) => {
                          const atrasado = lote.estado === 'planificado' && lote.fechaPlanificada < hoyLocalISO()
                          return (
                            <tr key={lote.id} className={atrasado ? 'bg-(--p-bad-soft)' : undefined}>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-1">
                                  <span className="w-5 text-center font-bold tabular-nums text-(--p-text-3)">{idx + 1}</span>
                                  <div className="flex flex-col">
                                    <button
                                      disabled={idx === 0}
                                      onClick={() => moverLote(lote.id, -1)}
                                      className="rounded text-(--p-text-3) hover:bg-(--p-hover) hover:text-(--p-text-2) disabled:opacity-20"
                                      title="Subir prioridad"
                                    >
                                      <ArrowUp size={14} />
                                    </button>
                                    <button
                                      disabled={idx === plan.length - 1}
                                      onClick={() => moverLote(lote.id, 1)}
                                      className="rounded text-(--p-text-3) hover:bg-(--p-hover) hover:text-(--p-text-2) disabled:opacity-20"
                                      title="Bajar prioridad"
                                    >
                                      <ArrowDown size={14} />
                                    </button>
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2.5">
                                  <ProductImage nombre={lote.producto} categoria={lote.categoria} size={30} radius={7} />
                                  <div className="flex flex-col">
                                    <span className="font-semibold text-(--p-text)">{lote.producto}</span>
                                    {lote.motivo && <span className="text-xs text-(--p-text-3)">{lote.motivo}</span>}
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-right tabular-nums font-semibold text-(--p-text-2)">
                                {fNum(lote.litrosPlanificados)} L
                              </td>
                              <td className="px-4 py-3">
                                <span className={atrasado ? 'font-semibold text-(--p-bad)' : 'text-(--p-text-2)'}>
                                  {new Date(lote.fechaPlanificada + 'T00:00:00').toLocaleDateString('es-CL', { day: '2-digit', month: 'short' })}
                                  {atrasado && ' · atrasado'}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                                  lote.origen === 'sugerido' ? 'bg-(--p-warn-soft) text-(--p-warn)' : 'bg-(--p-chip) text-(--p-text-2)'
                                }`}>
                                  {lote.origen === 'sugerido' ? 'Sugerido' : 'Manual'}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                                  lote.estado === 'en_curso' ? 'bg-(--p-info-soft) text-(--p-info)' : 'bg-(--p-chip) text-(--p-text-2)'
                                }`}>
                                  {lote.estado === 'en_curso' ? `Fermentando${lote.fechaInicioReal ? ` desde ${fFecha(lote.fechaInicioReal)}` : ''}` : 'Planificado'}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center justify-end gap-1.5">
                                  {lote.estado === 'planificado' && (
                                    <button
                                      onClick={() => cambiarEstadoLote(lote.id, 'en_curso')}
                                      className="rounded-lg px-2 py-1 text-xs font-bold text-(--p-info) hover:bg-(--p-info-soft)"
                                      title="Se empezó a cocinar: queda en fermentación desde hoy"
                                    >
                                      Iniciar
                                    </button>
                                  )}
                                  {lote.estado === 'en_curso' && (
                                    <button
                                      type="button"
                                      onClick={() => setCierreLote(lote)}
                                      className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold text-(--p-ok) hover:bg-(--p-ok-soft)"
                                      title="Registrar cuántos litros salieron y cerrar el lote"
                                    >
                                      <CheckCircle2 size={14} />
                                      Terminar
                                    </button>
                                  )}
                                  <button
                                    onClick={() => cambiarEstadoLote(lote.id, 'cancelado')}
                                    className="rounded-lg p-1.5 text-(--p-bad) hover:bg-(--p-bad-soft)"
                                    title="Cancelar lote"
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

              {/* ── Plan vs. real: lotes cerrados de las últimas 8 semanas ── */}
              <Seccion
                icono={History}
                titulo="Lotes cerrados — plan vs. real"
                detalle="Lo que se planificó contra lo que de verdad se cocinó, de las últimas 8 semanas. Se llena al marcar cada lote como terminado."
              >
                {lotesCerrados.length === 0 ? (
                  <p className="px-5 pb-5 text-sm text-(--p-text-3)">Todavía no hay lotes cerrados. Al terminar una cocción, márcala con <strong className="text-(--p-text-2)">Terminar</strong> en la cola de arriba.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[640px] text-sm">
                      <thead className="text-left text-[11px] uppercase tracking-wide text-(--p-text-3)">
                        <tr className="border-y border-(--p-line-2)">
                          <th className="px-5 py-2">Producto</th>
                          <th className="px-3 py-2">Planificado</th>
                          <th className="px-3 py-2">Se cocinó</th>
                          <th className="px-3 py-2 text-right">Litros plan</th>
                          <th className="px-3 py-2 text-right">Litros reales</th>
                          <th className="px-5 py-2 text-right">Diferencia</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-(--p-line-2)">
                        {lotesCerrados.map(l => {
                          const dif = l.litrosReales != null && l.litrosPlanificados > 0 ? (l.litrosReales - l.litrosPlanificados) / l.litrosPlanificados : null
                          return (
                            <tr key={l.id} className={l.estado === 'cancelado' ? 'opacity-55' : undefined}>
                              <td className="px-5 py-2.5 font-semibold text-(--p-text)">{l.producto}{l.estado === 'cancelado' && <span className="ml-2 rounded-full bg-(--p-chip) px-2 py-0.5 text-[10px] font-bold text-(--p-text-3)">Cancelado</span>}</td>
                              <td className="px-3 py-2.5 text-(--p-text-2)">{fFecha(l.fechaPlanificada)}</td>
                              <td className="px-3 py-2.5 text-(--p-text-2)">{l.fechaInicioReal ? fFecha(l.fechaInicioReal) : '—'}</td>
                              <td className="px-3 py-2.5 text-right tabular-nums text-(--p-text-2)">{fNum(l.litrosPlanificados)}</td>
                              <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-(--p-text)">{l.litrosReales != null ? fNum(l.litrosReales) : '—'}</td>
                              <td className={`px-5 py-2.5 text-right tabular-nums font-bold ${dif == null ? 'text-(--p-text-4)' : dif < -0.05 ? 'text-(--p-warn)' : 'text-(--p-ok)'}`}>
                                {dif == null ? '—' : `${dif >= 0 ? '+' : '−'}${Math.abs(dif * 100).toFixed(0)}%`}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </Seccion>

            </div>
  )
}
