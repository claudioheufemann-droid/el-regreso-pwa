'use client'

import ProductImage from '@/components/ui/ProductImage'
import { AlertTriangle, Beaker, CalendarDays, CalendarPlus, CheckCircle2, ChevronRight, ClipboardCheck, Gauge, Play, RotateCcw, ShoppingCart, ShieldAlert, TrendingUp, Info } from 'lucide-react'
import { FAMILIA_LABEL } from '@/lib/produccion/reglas'
import { fNum, fPesosCorto, pl } from '../compartido'
import { Seccion, Kpi, Franja, ChipEstado, BarraCobertura, ComoSeCalcula, fFecha, fDiaSemana } from './ui'
import type { Produccion } from '../useProduccion'

/**
 * Hoy: la pantalla de entrada. Responde dos preguntas, en este orden:
 *   1. ¿Qué hay que hacer? — una lista de acciones con su botón, no datos sueltos.
 *   2. ¿Cómo estamos? — semáforo de las líneas fijas, la semana en planta, cómo
 *      va la venta del ciclo y si el plan se está cumpliendo.
 * Antes el Resumen contaba como "productos en riesgo" los forecasts poco
 * confiables (no los que se iban a quedar sin stock), y la mitad de la
 * pantalla era un botón que llevaba al Gantt.
 */
export default function TabHoy({ p }: { p: Produccion }) {
  const { coberturaProductos, conteoCobertura, seguimientoLotes, ocupacionPlanta, serieGeneral, avanceMes, quiebresLineasFijas, calidad, setActiveTab, programarDesdeCobertura, cambiarEstadoLote, setCierreLote, planTrimestral, guardandoPlan } = p
  const hoy = seguimientoLotes.hoy
  // Sin colchón calculado no se puede afirmar que algo esté bien: se dice que faltan datos.
  const hayDatos = coberturaProductos.length > 0
  const fijas = coberturaProductos.filter(x => x.lineaFija)
  const enRiesgo = fijas.filter(x => x.estado === 'urgente' || x.estado === 'reponer')

  // Venta del ciclo en curso (todos los productos).
  const vendido = serieGeneral?.litrosMesEnCurso ?? 0
  const proyeccionCiclo = avanceMes.diasHabilesTranscurridos > 0 ? (vendido / avanceMes.diasHabilesTranscurridos) * avanceMes.diasHabilesEnCiclo : null
  const objetivo = serieGeneral?.puntos.find(pt => pt.mes === avanceMes.mes && pt.tipo === 'forecast')?.litros ?? null
  const vsObjetivo = proyeccionCiclo != null && objetivo ? proyeccionCiclo / objetivo : null

  // Acciones, de lo más urgente a lo menos.
  const pedirInsumos = coberturaProductos
    .filter(x => x.fechaLimiteInsumos != null && x.fechaLimiteInsumos <= sumarDias(hoy, 10) && x.aProducirLitros > 0)
    .sort((a, b) => (a.fechaLimiteInsumos ?? '').localeCompare(b.fechaLimiteInsumos ?? ''))
  const urgentes = coberturaProductos.filter(x => x.estado === 'urgente').slice(0, 6)
  const totalAcciones = seguimientoLotes.vencidos.length + seguimientoLotes.enCurso.length + urgentes.length + (pedirInsumos.length > 0 ? 1 : 0)

  const s = seguimientoLotes
  const litrosSemana = s.estaSemana.reduce((acc, l) => acc + l.litrosPlanificados, 0)

  return (
            <div className="prod-enter flex flex-col gap-6">
              {/* ── Cifras de la cabecera ── */}
              <Franja>
                <Kpi
                  icono={ShieldAlert}
                  etiqueta="Líneas fijas en riesgo"
                  valor={hayDatos ? enRiesgo.length : '—'}
                  unidad={hayDatos ? `de ${fijas.length}` : undefined}
                  tono={!hayDatos ? 'normal' : conteoCobertura.urgenteFija > 0 ? 'bad' : enRiesgo.length > 0 ? 'warn' : 'ok'}
                  detalle={!hayDatos ? 'Sin stock ni forecast cargados todavía' : conteoCobertura.urgenteFija > 0 ? `${conteoCobertura.urgenteFija} ${pl(conteoCobertura.urgenteFija, 'urgente', 'urgentes')}: hay que cocinar ya` : enRiesgo.length > 0 ? 'Hay que reponer pronto' : 'Todo el catálogo estable cubierto'}
                  onClick={() => setActiveTab('plan')}
                />
                <Kpi
                  icono={CalendarDays}
                  etiqueta="Cocciones esta semana"
                  valor={s.estaSemana.length}
                  detalle={s.estaSemana.length > 0 ? `${fNum(litrosSemana)} L hasta el ${fFecha(s.domingo)}` : 'Nada agendado hasta el domingo'}
                  onClick={() => setActiveTab('planta')}
                />
                <Kpi
                  icono={Beaker}
                  etiqueta="En fermentación"
                  valor={fNum(ocupacionPlanta.litrosEnFermentacion)}
                  unidad="L"
                  tono={ocupacionPlanta.porcentajeOcupacion != null && ocupacionPlanta.porcentajeOcupacion >= 85 ? 'warn' : 'normal'}
                  detalle={ocupacionPlanta.porcentajeOcupacion != null
                    ? `${ocupacionPlanta.fermentadoresOcupados} tanques · ${ocupacionPlanta.porcentajeOcupacion}% de la planta ocupada`
                    : `${ocupacionPlanta.fermentadoresOcupados} tanques ocupados`}
                />
                <Kpi
                  icono={TrendingUp}
                  etiqueta="Venta del ciclo"
                  valor={serieGeneral ? fNum(vendido) : '—'}
                  unidad={serieGeneral ? 'L' : undefined}
                  tono={vsObjetivo == null ? 'normal' : vsObjetivo >= 0.95 ? 'ok' : 'warn'}
                  detalle={!serieGeneral ? 'Sin ventas cargadas' : proyeccionCiclo != null
                    ? `A este ritmo cierra en ${fNum(proyeccionCiclo)} L${objetivo ? ` (${Math.round((vsObjetivo ?? 0) * 100)}% del forecast)` : ''} · día hábil ${avanceMes.diasHabilesTranscurridos} de ${avanceMes.diasHabilesEnCiclo}`
                    : 'El ciclo recién empieza'}
                  onClick={() => setActiveTab('demanda')}
                />
              </Franja>

              <div className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
                {/* ── Qué hacer ahora ── */}
                <Seccion
                  icono={ClipboardCheck}
                  titulo="Qué hacer ahora"
                  detalle={totalAcciones === 0 ? undefined : 'Ordenado por urgencia. Cada acción tiene su botón.'}
                >
                  {totalAcciones === 0 && !hayDatos ? (
                    <p className="mx-5 mb-5 rounded-xl bg-(--p-chip) px-4 py-3 text-sm text-(--p-text-3)">
                      No hay datos para decidir. Falta el stock del ERP y el forecast (el forecast se genera el día 2 de cada mes).
                    </p>
                  ) : totalAcciones === 0 ? (
                    <div className="mx-5 mb-5 flex items-center gap-2.5 rounded-xl bg-(--p-ok-soft) px-4 py-3 text-sm font-semibold text-(--p-ok)">
                      <CheckCircle2 size={18} />
                      Nada pendiente: el stock alcanza, los lotes están al día y no hay insumos por pedir esta semana.
                    </div>
                  ) : (
                    <ul className="divide-y divide-(--p-line-2) border-t border-(--p-line-2)">
                      {s.vencidos.map(l => (
                        <li key={`v-${l.id}`} className="flex flex-wrap items-center gap-3 px-5 py-3">
                          <span className="h-2 w-2 shrink-0 rounded-full bg-(--p-bad)" aria-hidden />
                          <ProductImage nombre={l.producto} categoria={l.categoria} size={30} radius={7} />
                          <div className="min-w-[180px] flex-1">
                            <p className="text-sm font-bold text-(--p-text)">¿Se cocinó {l.producto}?</p>
                            <p className="text-xs text-(--p-text-3)">{fNum(l.litrosPlanificados)} L estaban para el {fFecha(l.fechaPlanificada)} y el lote sigue como planificado.</p>
                          </div>
                          <div className="flex gap-1.5">
                            <button type="button" disabled={guardandoPlan} onClick={() => cambiarEstadoLote(l.id, 'en_curso', { fechaInicioReal: l.fechaPlanificada })} className="prod-press flex items-center gap-1 rounded-lg bg-(--p-ok-soft) px-2.5 py-1.5 text-xs font-bold text-(--p-ok)"><Play size={13} />Sí</button>
                            <button type="button" disabled={guardandoPlan} onClick={() => cambiarEstadoLote(l.id, 'planificado', { fechaPlanificada: hoy })} className="prod-press flex items-center gap-1 rounded-lg bg-(--p-chip) px-2.5 py-1.5 text-xs font-bold text-(--p-text-2)"><RotateCcw size={13} />Pasar a hoy</button>
                          </div>
                        </li>
                      ))}

                      {urgentes.map(x => {
                        const peor = x.familias.reduce((a, b) => ((a.diasCobertura ?? 1e9) <= (b.diasCobertura ?? 1e9) ? a : b))
                        return (
                          <li key={`u-${x.producto}`} className="flex flex-wrap items-center gap-3 px-5 py-3">
                            <span className="h-2 w-2 shrink-0 rounded-full bg-(--p-bad)" aria-hidden />
                            <ProductImage nombre={x.producto} categoria={x.categoria} size={30} radius={7} />
                            <div className="min-w-[180px] flex-1">
                              <p className="text-sm font-bold text-(--p-text)">Cocinar {x.producto}{x.aProducirLitros > 0 ? ` · ${fNum(x.aProducirLitros)} L` : ''}</p>
                              <p className="text-xs text-(--p-text-3)">
                                {peor.diasCobertura != null ? `El ${FAMILIA_LABEL[peor.familia].toLowerCase()} alcanza ${fNum(peor.diasCobertura)} días hábiles` : 'Bajo el colchón de seguridad'}
                                {x.fechaLimiteCocer ? ` · había que cocinar antes del ${fFecha(x.fechaLimiteCocer)}` : ''}
                              </p>
                            </div>
                            <button type="button" disabled={guardandoPlan} onClick={() => programarDesdeCobertura(x)} className="prod-press prod-accion flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold"><CalendarPlus size={14} />Programar</button>
                          </li>
                        )
                      })}

                      {pedirInsumos.length > 0 && (
                        <li className="flex flex-wrap items-center gap-3 px-5 py-3">
                          <span className="h-2 w-2 shrink-0 rounded-full bg-(--p-warn)" aria-hidden />
                          <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[7px] bg-(--p-warn-soft) text-(--p-warn)"><ShoppingCart size={15} /></span>
                          <div className="min-w-[180px] flex-1">
                            <p className="text-sm font-bold text-(--p-text)">Pedir insumos para {pedirInsumos.length === 1 ? pedirInsumos[0].producto : `${pedirInsumos.length} productos`}</p>
                            <p className="text-xs text-(--p-text-3)">
                              {pedirInsumos.slice(0, 4).map(x => `${x.producto} antes del ${fFecha(x.fechaLimiteInsumos)}`).join(' · ')}{pedirInsumos.length > 4 ? '…' : ''}
                            </p>
                          </div>
                          <button type="button" onClick={() => setActiveTab('compras')} className="prod-press flex items-center gap-1 rounded-lg border border-(--p-line) px-3 py-1.5 text-xs font-bold text-(--p-text-2) hover:bg-(--p-hover)">Ver compras<ChevronRight size={14} /></button>
                        </li>
                      )}

                      {s.enCurso.map(l => (
                        <li key={`c-${l.id}`} className="flex flex-wrap items-center gap-3 px-5 py-3">
                          <span className="h-2 w-2 shrink-0 rounded-full bg-(--p-info)" aria-hidden />
                          <ProductImage nombre={l.producto} categoria={l.categoria} size={30} radius={7} />
                          <div className="min-w-[180px] flex-1">
                            <p className="text-sm font-bold text-(--p-text)">{l.producto} fermentando</p>
                            <p className="text-xs text-(--p-text-3)">{fNum(l.litrosPlanificados)} L{l.fechaInicioReal ? ` desde el ${fFecha(l.fechaInicioReal)}` : ''}{l.fermentador ? ` · ${l.fermentador}` : ''}. Al envasar, registra cuánto salió.</p>
                          </div>
                          <button type="button" onClick={() => setCierreLote(l)} className="prod-press flex items-center gap-1 rounded-lg border border-(--p-line) px-3 py-1.5 text-xs font-bold text-(--p-text-2) hover:bg-(--p-hover)"><CheckCircle2 size={14} />Terminar</button>
                        </li>
                      ))}
                    </ul>
                  )}
                </Seccion>

                {/* ── La semana en planta ── */}
                <Seccion
                  icono={CalendarDays}
                  titulo="Esta semana en planta"
                  detalle={`Del ${fFecha(s.lunes)} al ${fFecha(s.domingo)}`}
                  accion={<button type="button" onClick={() => setActiveTab('planta')} className="flex items-center gap-1 text-xs font-bold text-(--p-accent) hover:underline">Abrir el Gantt<ChevronRight size={14} /></button>}
                >
                  <div className="flex flex-col gap-4 px-5 pb-5">
                    {s.estaSemana.length === 0 ? (
                      <p className="rounded-xl bg-(--p-chip) px-4 py-3 text-sm text-(--p-text-3)">No hay cocciones agendadas para lo que queda de la semana.</p>
                    ) : (
                      <ul className="flex flex-col gap-2">
                        {s.estaSemana.map(l => (
                          <li key={l.id} className="flex items-center gap-3 rounded-xl border border-(--p-line-2) px-3 py-2">
                            <span className="w-12 shrink-0 text-xs font-bold uppercase text-(--p-accent)">{fDiaSemana(l.fechaPlanificada)}</span>
                            <ProductImage nombre={l.producto} categoria={l.categoria} size={26} radius={6} />
                            <span className="min-w-0 flex-1 line-clamp-2 break-words leading-tight text-sm font-semibold text-(--p-text)" title={l.producto}>{l.producto}</span>
                            <span className="text-xs tabular-nums text-(--p-text-3)">{fNum(l.litrosPlanificados)} L{l.fermentador ? ` · ${l.fermentador}` : ''}</span>
                          </li>
                        ))}
                      </ul>
                    )}

                    {/* Ocupación de tanques: barra por línea */}
                    {(['cerveza', 'kombucha'] as const).map(cat => {
                      const tanques = ocupacionPlanta.tanques.filter(t => t.categoria === cat)
                      if (tanques.length === 0) return null
                      const cap = tanques.reduce((a, t) => a + t.capacidadLitros, 0)
                      const lit = tanques.reduce((a, t) => a + t.litros, 0)
                      const ocupados = tanques.filter(t => t.litros > 0).length
                      return (
                        <div key={cat}>
                          <div className="mb-1.5 flex items-baseline justify-between text-xs">
                            <span className="font-bold text-(--p-text-2)">Tanques de {cat}</span>
                            <span className="tabular-nums text-(--p-text-3)">{ocupados} de {tanques.length} ocupados · {fNum(lit)} / {fNum(cap)} L</span>
                          </div>
                          <div className="flex gap-1" aria-label={`${ocupados} de ${tanques.length} tanques de ${cat} ocupados`}>
                            {tanques.map(t => (
                              <span
                                key={t.tanque}
                                title={`${t.tanque}: ${fNum(t.litros)} / ${fNum(t.capacidadLitros)} L`}
                                className="h-6 flex-1 overflow-hidden rounded-[4px] bg-(--p-chip)"
                              >
                                <span className="block h-full w-full origin-bottom bg-(--p-accent)" style={{ transform: `scaleY(${t.capacidadLitros > 0 ? Math.min(1, t.litros / t.capacidadLitros) : 0})` }} />
                              </span>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </Seccion>
              </div>

              {/* ── Semáforo de las líneas fijas ── */}
              <Seccion
                icono={Gauge}
                titulo="Líneas fijas: cuánto alcanza el stock"
                detalle="El catálogo estable no puede quebrar. Días hábiles que alcanza cada formato al ritmo esperado; la rayita marca el tiempo de cocción (si la barra no llega, ya no da el tiempo)."
                accion={<button type="button" onClick={() => setActiveTab('plan')} className="flex items-center gap-1 text-xs font-bold text-(--p-accent) hover:underline">Ver el plan completo<ChevronRight size={14} /></button>}
              >
                {fijas.length === 0 ? (
                  <p className="px-5 pb-5 text-sm text-(--p-text-3)">Todavía no hay colchón calculado: se genera junto con el forecast, el día 2 de cada mes.</p>
                ) : (
                  <div className="grid gap-3 px-5 pb-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                    {fijas.map(x => (
                      <button
                        key={x.producto}
                        type="button"
                        onClick={() => setActiveTab('plan')}
                        className="prod-press prod-hover-card flex flex-col gap-2.5 rounded-xl border border-(--p-line-2) bg-(--p-card-2) p-3 text-left"
                      >
                        <span className="flex items-center gap-2.5">
                          <ProductImage nombre={x.producto} categoria={x.categoria} size={30} radius={7} />
                          <span className="min-w-0 flex-1 line-clamp-2 break-words leading-tight text-sm font-bold text-(--p-text)" title={x.producto}>{x.producto}</span>
                          <ChipEstado estado={x.estado} compacto />
                        </span>
                        {x.familias.map(f => (
                          <span key={f.familia} className="flex flex-col gap-1">
                            <span className="flex items-baseline justify-between text-[11.5px]">
                              <span className="text-(--p-text-3)">{FAMILIA_LABEL[f.familia]}</span>
                              <span className="font-bold tabular-nums text-(--p-text-2)">{f.diasCobertura != null ? `${fNum(f.diasCobertura)} días` : f.disponibleLitros == null ? 'sin stock cargado' : 'sin venta'}</span>
                            </span>
                            <BarraCobertura dias={f.diasCobertura} leadDias={f.leadTimeSemanas * 5} estado={f.estado} />
                          </span>
                        ))}
                      </button>
                    ))}
                  </div>
                )}
              </Seccion>

              <div className="grid gap-6 lg:grid-cols-2">
                {/* ── ¿Se cumple el plan? ── */}
                <Seccion
                  icono={CheckCircle2}
                  titulo="¿Se cumple el plan?"
                  detalle="Lotes cerrados en las últimas 8 semanas: cuántos se cocinaron a tiempo y cuánto salió contra lo planificado."
                >
                  <div className="grid grid-cols-3 gap-px border-t border-(--p-line-2) bg-(--p-line-2)">
                    <div className="bg-(--p-card) px-4 py-3">
                      <p className="prod-eyebrow">Terminados</p>
                      <p className="mt-1 text-2xl font-black tabular-nums text-(--p-text)">{s.completados.length}</p>
                      <p className="text-[11px] text-(--p-text-3)">{s.cancelados.length} cancelados</p>
                    </div>
                    <div className="bg-(--p-card) px-4 py-3">
                      <p className="prod-eyebrow">A tiempo</p>
                      <p className="mt-1 text-2xl font-black tabular-nums text-(--p-text)">{s.conFecha > 0 ? `${Math.round((s.aTiempo / s.conFecha) * 100)}%` : '—'}</p>
                      <p className="text-[11px] text-(--p-text-3)">cocinados ±2 días de lo planificado</p>
                    </div>
                    <div className="bg-(--p-card) px-4 py-3">
                      <p className="prod-eyebrow">Rendimiento</p>
                      <p className={`mt-1 text-2xl font-black tabular-nums ${s.rendimiento != null && s.rendimiento < 0.95 ? 'text-(--p-warn)' : 'text-(--p-text)'}`}>{s.rendimiento != null ? `${Math.round(s.rendimiento * 100)}%` : '—'}</p>
                      <p className="text-[11px] text-(--p-text-3)">litros reales ÷ planificados</p>
                    </div>
                  </div>
                  {s.completados.length === 0 && (
                    <p className="flex items-start gap-2 px-5 py-3 text-xs text-(--p-text-3)">
                      <Info size={14} className="mt-0.5 shrink-0" />
                      Se empieza a medir al marcar los lotes como iniciados y terminados (en Planta o en &quot;Qué hacer ahora&quot;).
                    </p>
                  )}
                </Seccion>

                {/* ── Días sin stock ── */}
                <Seccion
                  icono={AlertTriangle}
                  titulo="Días sin stock en líneas fijas"
                  detalle={quiebresLineasFijas.desde
                    ? `Desde el ${fFecha(quiebresLineasFijas.desde)} (${quiebresLineasFijas.dias} ${quiebresLineasFijas.dias === 1 ? 'foto diaria' : 'fotos diarias'} del inventario).`
                    : 'El historial diario de stock empieza a guardarse con la próxima carga del inventario.'}
                >
                  {(() => {
                    const conQuiebre = quiebresLineasFijas.productos.filter(q => q.diasSinBarril + q.diasSinLata > 0)
                      .sort((a, b) => (b.diasSinBarril + b.diasSinLata) - (a.diasSinBarril + a.diasSinLata))
                    if (quiebresLineasFijas.dias === 0) return <p className="px-5 pb-5 text-sm text-(--p-text-3)">Sin historial todavía.</p>
                    if (conQuiebre.length === 0) return (
                      <p className="mx-5 mb-5 flex items-center gap-2 rounded-xl bg-(--p-ok-soft) px-4 py-3 text-sm font-semibold text-(--p-ok)"><CheckCircle2 size={16} />Ninguna línea fija quedó sin stock en este período.</p>
                    )
                    return (
                      <ul className="divide-y divide-(--p-line-2) border-t border-(--p-line-2)">
                        {conQuiebre.slice(0, 8).map(q => (
                          <li key={q.producto} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                            <span className="min-w-0 flex-1 line-clamp-2 break-words leading-tight font-semibold text-(--p-text)" title={q.producto}>{q.producto}</span>
                            {q.diasSinBarril > 0 && <span className="rounded-full bg-(--p-bad-soft) px-2 py-0.5 text-[11px] font-bold text-(--p-bad)">Barril {q.diasSinBarril} d</span>}
                            {q.diasSinLata > 0 && <span className="rounded-full bg-(--p-bad-soft) px-2 py-0.5 text-[11px] font-bold text-(--p-bad)">Lata {q.diasSinLata} d</span>}
                          </li>
                        ))}
                      </ul>
                    )
                  })()}
                </Seccion>
              </div>

              {/* ── Compra proyectada + avisos del modelo ── */}
              <div className="grid gap-6 lg:grid-cols-2">
                <Kpi
                  icono={ShoppingCart}
                  etiqueta={`Compra proyectada · ${planTrimestral.filas.length} ciclos`}
                  valor={planTrimestral.total > 0 ? fPesosCorto(planTrimestral.total) : '—'}
                  tono="accent"
                  detalle={planTrimestral.filas.map(f => `${f.etiqueta}: ${fPesosCorto(f.total)}`).join(' · ') || 'Sin forecast para proyectar'}
                  onClick={() => setActiveTab('compras')}
                />
                <section className="prod-card p-4">
                  <ComoSeCalcula titulo={`Avisos del modelo de forecast (${calidad.length})`}>
                    {calidad.length === 0 ? <p>Sin avisos: el modelo no encontró problemas en los datos.</p> : calidad.map((a, i) => (
                      <p key={i} className={a.severidad === 'advertencia' ? 'text-(--p-warn)' : undefined}>{a.detalle}</p>
                    ))}
                  </ComoSeCalcula>
                </section>
              </div>
            </div>
  )
}

function sumarDias(iso: string, dias: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + dias * 86_400_000).toISOString().slice(0, 10)
}
