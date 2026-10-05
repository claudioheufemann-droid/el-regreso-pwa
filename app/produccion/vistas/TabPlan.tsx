'use client'

import dynamic from 'next/dynamic'
import React, { useState } from 'react'
import ProductImage from '@/components/ui/ProductImage'
import { ClipboardList, ChevronDown, TrendingUp, Warehouse, CalendarPlus } from 'lucide-react'
import { ENVASE_LABEL, FAMILIA_LABEL, LEAD_TIME_INSUMOS_SEMANAS } from '@/lib/produccion/reglas'
import type { CoberturaFamilia, EstadoCobertura } from '@/lib/produccion/cobertura'
import { fNum, nombreCamaraCorto, pl } from '../compartido'
import { Seccion, ChipEstado, BarraCobertura, Pastillas, ComoSeCalcula, fFecha } from './ui'
import type { Produccion } from '../useProduccion'

const NecesidadMensual = dynamic(() => import('../NecesidadMensual'), {
  loading: () => <div className="flex h-48 items-center justify-center text-sm text-(--p-text-3)">Cargando la necesidad mensual…</div>,
  ssr: false,
})

/** "312 L · 10 barriles" / "1.240 latas · 520 L" */
function textoDisponible(f: CoberturaFamilia): string {
  if (f.disponibleLitros == null) return 'Sin stock cargado'
  if (f.familia === 'barril') return `${fNum(f.disponibleLitros)} L · ${fNum(f.disponibleLitros / 30)} barr.`
  return f.disponibleUnidades != null ? `${fNum(f.disponibleUnidades)} latas · ${fNum(f.disponibleLitros)} L` : `${fNum(f.disponibleLitros)} L`
}

/**
 * Plan: cuánto y cuándo producir de cada producto. UNA tabla que sale del motor
 * único (lib/produccion/cobertura.ts) y reemplaza a la Calculadora de
 * cobertura, la Necesidad anticipada, la tabla de Stock de seguridad y las
 * Alarmas de quiebre, que antes contestaban lo mismo con cuentas distintas.
 */
export default function TabPlan({ p }: { p: Produccion }) {
  const { coberturaProductos, conteoCobertura, opcionesHorizontePlan, hastaPlanActivo, setHastaPlan, programarDesdeCobertura, series, stockSeguridad, plan, ocupacionPlanta, confirmarNecesidad, inventarioAgrupado, stock, guardandoPlan, seguimientoLotes } = p
  const [filtroEstado, setFiltroEstado] = useState<'todos' | EstadoCobertura>('todos')
  const [filtroCat, setFiltroCat] = useState<'todas' | 'cerveza' | 'kombucha'>('todas')
  const [soloFijas, setSoloFijas] = useState(false)
  const [abierto, setAbierto] = useState<string | null>(null)
  const [verInventario, setVerInventario] = useState(false)

  const filas = coberturaProductos.filter(x =>
    (filtroEstado === 'todos' || x.estado === filtroEstado)
    && (filtroCat === 'todas' || x.categoria === filtroCat)
    && (!soloFijas || x.lineaFija))
  const totalAProducir = filas.reduce((s, x) => s + x.aProducirLitros, 0)

  return (
            <div className="prod-enter flex flex-col gap-6">
              <Seccion
                icono={ClipboardList}
                titulo="Cobertura y producción por producto"
                detalle={<>Cuánto alcanza el stock de cada producto, cuánto hay que producir para llegar cubierto al <strong className="text-(--p-text-2)">{fFecha(hastaPlanActivo)}</strong> y hasta cuándo se puede esperar para cocinar. Barril y lata van por separado: un pedido de lata no se cubre con barril.</>}
                accion={
                  <label className="flex items-center gap-2 text-xs font-semibold text-(--p-text-3)">
                    Cubrir hasta
                    <select
                      id="plan-horizonte"
                      value={hastaPlanActivo}
                      onChange={e => setHastaPlan(e.target.value)}
                      className="rounded-lg border border-(--p-line) bg-(--p-card-2) px-2.5 py-1.5 text-sm font-bold text-(--p-text) focus:border-(--p-accent) focus:outline-none"
                    >
                      {opcionesHorizontePlan.map(o => <option key={o.fecha} value={o.fecha}>{o.label} · {fFecha(o.fecha)}</option>)}
                    </select>
                  </label>
                }
              >
                {/* Filtros */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-y border-(--p-line-2) px-5 py-3">
                  <Pastillas
                    etiqueta="Estado"
                    valor={filtroEstado}
                    onCambiar={setFiltroEstado}
                    opciones={[
                      { id: 'todos', label: 'Todos', cuenta: coberturaProductos.length },
                      { id: 'urgente', label: 'Urgente', cuenta: conteoCobertura.urgente },
                      { id: 'reponer', label: 'Reponer pronto', cuenta: conteoCobertura.reponer },
                      { id: 'ok', label: 'Cubierto', cuenta: conteoCobertura.ok },
                      ...(conteoCobertura.sin_dato > 0 ? [{ id: 'sin_dato' as const, label: 'Sin stock', cuenta: conteoCobertura.sin_dato }] : []),
                    ]}
                  />
                  <span className="hidden h-5 w-px bg-(--p-line) sm:block" />
                  <Pastillas
                    etiqueta="Categoría"
                    valor={filtroCat}
                    onCambiar={setFiltroCat}
                    opciones={[{ id: 'todas', label: 'Todas' }, { id: 'cerveza', label: 'Cerveza' }, { id: 'kombucha', label: 'Kombucha' }]}
                  />
                  <label className="flex cursor-pointer items-center gap-2 text-xs font-bold text-(--p-text-3)">
                    <input id="plan-solo-fijas" type="checkbox" checked={soloFijas} onChange={e => setSoloFijas(e.target.checked)} className="h-4 w-4 accent-[#D4AF37]" />
                    Sólo líneas fijas
                  </label>
                  <span className="ml-auto text-xs text-(--p-text-3)">
                    A producir en total: <strong className="tabular-nums text-(--p-accent)">{fNum(totalAProducir)} L</strong>
                  </span>
                </div>

                {/* Encabezado (escritorio) */}
                <div className="hidden grid-cols-[minmax(210px,1.7fr)_118px_minmax(150px,1fr)_minmax(170px,1.2fr)_104px_112px_112px_118px] gap-3 px-5 py-2 text-[11px] font-bold uppercase tracking-wide text-(--p-text-3) xl:grid">
                  <span>Producto</span><span>Estado</span><span>Alcanza</span><span>Disponible</span>
                  <span className="text-right">A producir</span><span>Cocinar antes</span><span>Pedir insumos</span><span />
                </div>

                {filas.length === 0 ? (
                  <p className="px-5 py-8 text-center text-sm text-(--p-text-3)">
                    {coberturaProductos.length === 0
                      ? 'Todavía no hay colchón calculado: se genera junto con el forecast, el día 2 de cada mes.'
                      : 'Ningún producto con esos filtros.'}
                  </p>
                ) : (
                  <ul className="divide-y divide-(--p-line-2) border-t border-(--p-line-2) xl:border-t-0">
                    {filas.map(x => {
                      const exp = abierto === x.producto
                      const lead = Math.max(...x.familias.map(f => f.leadTimeSemanas)) * 5
                      const peor = x.familias.reduce((a, b) => ((a.diasCobertura ?? 1e9) <= (b.diasCobertura ?? 1e9) ? a : b))
                      const vencidoCocer = x.fechaLimiteCocer != null && x.estado === 'urgente'
                      return (
                        <li key={x.producto}>
                          <div className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-2 px-5 py-3 xl:grid-cols-[minmax(210px,1.7fr)_118px_minmax(150px,1fr)_minmax(170px,1.2fr)_104px_112px_112px_118px]">
                            {/* Producto */}
                            <button type="button" onClick={() => setAbierto(exp ? null : x.producto)} aria-expanded={exp} className="flex min-w-0 items-center gap-2.5 text-left">
                              <ProductImage nombre={x.producto} categoria={x.categoria} size={34} radius={8} />
                              <span className="min-w-0">
                                <span className="flex items-center gap-1.5">
                                  <span className="line-clamp-2 break-words font-bold leading-tight text-(--p-text)" title={x.producto}>{x.producto}</span>
                                  <ChevronDown size={14} className={`shrink-0 text-(--p-text-3) transition-transform ${exp ? 'rotate-180' : ''}`} />
                                </span>
                                <span className="flex flex-wrap gap-1 pt-0.5">
                                  {x.lineaFija && <span className="text-[11px] font-semibold text-(--p-text-3)">Línea fija</span>}
                                  {x.altaDemanda && <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-(--p-text-3)" title="El modelo espera un empuje estacional fuerte en el período"><TrendingUp size={11} />Temporada alta</span>}
                                </span>
                              </span>
                            </button>
                            <div className="justify-self-end xl:justify-self-start"><ChipEstado estado={x.estado} /></div>

                            {/* Alcanza */}
                            <div className="col-span-2 xl:col-span-1">
                              <div className="flex items-baseline justify-between gap-2 text-sm">
                                <span className="font-bold tabular-nums text-(--p-text)">{x.diasCobertura != null ? `${fNum(x.diasCobertura)} días` : '—'}</span>
                                <span className="text-[11px] text-(--p-text-3)">{FAMILIA_LABEL[peor.familia]}</span>
                              </div>
                              <BarraCobertura dias={x.diasCobertura} leadDias={lead} estado={x.estado} />
                            </div>

                            {/* Disponible */}
                            <div className="col-span-2 flex flex-col text-[12.5px] text-(--p-text-2) xl:col-span-1">
                              {x.familias.map(f => (
                                <span key={f.familia} className="tabular-nums"><span className="text-(--p-text-3)">{FAMILIA_LABEL[f.familia]}:</span> {textoDisponible(f)}</span>
                              ))}
                            </div>

                            {/* A producir + fechas: en el teléfono van juntas en una fila de tres */}
                            <div className="col-span-2 grid grid-cols-3 gap-3 xl:contents">
                            <div className="text-left xl:text-right">
                              <span className="prod-eyebrow block xl:hidden">A producir</span>
                              <span className={`text-base font-black tabular-nums ${x.aProducirLitros > 0 ? 'text-(--p-text)' : 'text-(--p-text-4)'}`}>{fNum(x.aProducirLitros)} L</span>
                            </div>

                            {/* Fechas */}
                            <div className="text-[12.5px]">
                              <span className="prod-eyebrow block xl:hidden">Cocinar antes</span>
                              <span className={`font-semibold tabular-nums ${vencidoCocer ? 'text-(--p-bad)' : 'text-(--p-text-2)'}`}>
                                {x.fechaLimiteCocer ? (vencidoCocer && x.fechaLimiteCocer <= seguimientoLotes.hoy ? `Atrasado (${fFecha(x.fechaLimiteCocer)})` : fFecha(x.fechaLimiteCocer)) : '—'}
                              </span>
                            </div>
                            <div className="text-[12.5px]">
                              <span className="prod-eyebrow block xl:hidden">Pedir insumos</span>
                              <span className={`font-semibold tabular-nums ${x.fechaLimiteInsumos != null && x.fechaLimiteInsumos <= seguimientoLotes.hoy && x.aProducirLitros > 0 ? 'text-(--p-bad)' : 'text-(--p-text-2)'}`}>{x.fechaLimiteInsumos != null && x.fechaLimiteInsumos <= seguimientoLotes.hoy && x.aProducirLitros > 0 ? `Atrasado (${fFecha(x.fechaLimiteInsumos)})` : fFecha(x.fechaLimiteInsumos)}</span>
                            </div>
                            </div>

                            {/* Acción */}
                            <div className="col-span-2 xl:col-span-1 xl:justify-self-end">
                              {x.aProducirLitros > 0 || x.estado === 'urgente' || x.estado === 'reponer' ? (
                                <button
                                  type="button"
                                  disabled={guardandoPlan}
                                  onClick={() => programarDesdeCobertura(x)}
                                  className={`prod-press flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold xl:w-auto ${
 x.estado === 'urgente' || x.estado === 'reponer' ? 'prod-accion' : 'border border-(--p-line) text-(--p-text-3) hover:text-(--p-text)'
 }`}
                                >
                                  <CalendarPlus size={14} />
                                  Programar
                                </button>
                              ) : (
                                <span className="text-xs text-(--p-text-4)">Nada que cocinar</span>
                              )}
                            </div>
                          </div>

                          {/* Detalle por formato */}
                          <div className="prod-pliegue" data-abierto={String(exp)} aria-hidden={!exp} inert={!exp}>
                            <div>
                            <div className="bg-(--p-card-2) px-5 py-3">
                              <div className="overflow-x-auto">
                                <table className="w-full min-w-[720px] text-[12.5px]">
                                  <thead className="text-left text-[10.5px] uppercase tracking-wide text-(--p-text-3)">
                                    <tr>
                                      <th className="py-1.5 pr-3">Formato</th>
                                      <th className="px-3 py-1.5 text-right">Disponible</th>
                                      <th className="px-3 py-1.5 text-right" title="Lo mínimo que tiene que haber siempre (95% de nivel de servicio)">Colchón</th>
                                      <th className="px-3 py-1.5 text-right" title="Bajo este nivel hay que reponer: ya suma el tiempo de cocción y de pedir insumos">Reponer bajo</th>
                                      <th className="px-3 py-1.5 text-right">Venta / día hábil</th>
                                      <th className="px-3 py-1.5 text-right">Alcanza</th>
                                      <th className="px-3 py-1.5 text-right">Venta hasta {fFecha(hastaPlanActivo)}</th>
                                      <th className="py-1.5 pl-3 text-right">A producir</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-(--p-line-2) tabular-nums text-(--p-text-2)">
                                    {x.familias.map(f => (
                                      <tr key={f.familia} title={f.motivo}>
                                        <td className="py-2 pr-3"><span className="flex items-center gap-2 font-semibold text-(--p-text)"><ChipEstado estado={f.estado} compacto />{FAMILIA_LABEL[f.familia]}</span></td>
                                        <td className="px-3 py-2 text-right">{f.disponibleLitros != null ? `${fNum(f.disponibleLitros)} L` : '—'}</td>
                                        <td className="px-3 py-2 text-right">{fNum(f.stockSeguridadLitros)} L</td>
                                        <td className="px-3 py-2 text-right">{fNum(f.puntoReordenLitros)} L</td>
                                        <td className="px-3 py-2 text-right">{f.ritmoDiario.toLocaleString('es-CL')} L</td>
                                        <td className="px-3 py-2 text-right">{f.diasCobertura != null ? `${fNum(f.diasCobertura)} días` : '—'}</td>
                                        <td className="px-3 py-2 text-right">{fNum(f.demandaHorizonte)} L</td>
                                        <td className="py-2 pl-3 text-right font-bold text-(--p-text)">{fNum(f.aProducirLitros)} L</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                              <p className="mt-2 text-xs leading-relaxed text-(--p-text-3)">{x.familias.map(f => `${FAMILIA_LABEL[f.familia]}: ${f.motivo}`).join(' · ')}</p>
                            </div>
                            </div>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )}

                <div className="border-t border-(--p-line-2) px-5 py-3">
                  <ComoSeCalcula>
                    <p><strong className="text-(--p-text-2)">Disponible</strong> = stock en las cámaras de Producción + lo que ya está fermentando y va a llegar a bodega.</p>
                    <p><strong className="text-(--p-text-2)">Alcanza</strong> = disponible ÷ venta esperada por día hábil (las próximas 4 semanas: ritmo real del ciclo en curso y forecast de los siguientes). Se cuenta en días hábiles.</p>
                    <p><strong className="text-(--p-text-2)">Colchón</strong> (stock de seguridad) = Z · √(ventana · σ² + demanda² · σ<sub>LT</sub>²), con 95% de nivel de servicio, calculado del mismo forecast. <strong className="text-(--p-text-2)">Reponer bajo</strong> suma la venta del tiempo de cocción (4 semanas cerveza, 3 kombucha) y {LEAD_TIME_INSUMOS_SEMANAS} semanas para pedir insumos.</p>
                    <p><strong className="text-(--p-text-2)">A producir</strong> = venta proyectada hasta la fecha elegida + colchón al final − disponible.</p>
                    <p><strong className="text-(--p-text-2)">Cocinar antes</strong> = día en que se acaba el stock − tiempo de cocción. <strong className="text-(--p-text-2)">Pedir insumos</strong> = lo mismo, restando además {LEAD_TIME_INSUMOS_SEMANAS} semanas de gestión con el proveedor.</p>
                    <p><strong className="text-(--p-bad)">Urgente</strong>: hay menos que el colchón, o la fecha para cocinar ya pasó. <strong className="text-(--p-warn)">Reponer pronto</strong>: bajo el nivel de reposición, o hay que cocinar en los próximos 10 días hábiles. El barril de 50 L se cuenta junto al de 30 L (se cubren entre sí); la lata va aparte.</p>
                  </ComoSeCalcula>
                </div>
              </Seccion>

              {/* Litros por mes para confirmar al plan (paso que antes se hacía a ojo). */}
              <NecesidadMensual
                series={series}
                stockSeguridad={stockSeguridad}
                plan={plan}
                tanques={ocupacionPlanta.tanques.map(t => ({
                  tanque: t.tanque,
                  categoria: t.categoria as 'cerveza' | 'kombucha',
                  capacidadLitros: t.capacidadLitros,
                }))}
                onConfirmar={confirmarNecesidad}
              />

              {/* Inventario por cámara: el detalle de dónde está cada litro. */}
              <section className="prod-card overflow-hidden">
                <button
                  type="button"
                  onClick={() => setVerInventario(v => !v)}
                  aria-expanded={verInventario}
                  className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left hover:bg-(--p-hover)"
                >
                  <span className="flex items-center gap-2">
                    <Warehouse size={17} className="text-(--p-accent)" />
                    <span className="text-[15px] font-extrabold text-(--p-text)">Inventario por cámara</span>
                    <span className="text-xs text-(--p-text-3)">{inventarioAgrupado.length} {pl(inventarioAgrupado.length, 'producto', 'productos')} · {stock.length} {pl(stock.length, 'línea', 'líneas')} del último informe del ERP</span>
                  </span>
                  <ChevronDown size={18} className={`shrink-0 text-(--p-text-3) transition-transform ${verInventario ? 'rotate-180' : ''}`} />
                </button>
                {verInventario && (
                <div className="max-h-[560px] overflow-auto">
                  <table className="w-full border-collapse text-left">
                    <thead className="sticky top-0 z-10 bg-(--p-chip) text-xs font-bold uppercase tracking-wider text-(--p-text-2) shadow-sm">
                      <tr>
                        <th className="px-6 py-3 font-bold">Producto</th>
                        <th className="px-4 py-3 font-bold">Categoría</th>
                        <th className="px-4 py-3 font-bold">Formato</th>
                        <th className="px-4 py-3 font-bold">Cámara</th>
                        <th className="px-4 py-3 text-right font-bold">Cantidad</th>
                        <th className="px-6 py-3 text-right font-bold">Litros</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-(--p-line-2) text-sm">
                      {inventarioAgrupado.length === 0 && (
                        <tr><td colSpan={6} className="px-6 py-10 text-center text-(--p-text-3)">Sin informe de stock cargado.</td></tr>
                      )}
                      {inventarioAgrupado.map(grupo => {
                        const filasCamara = grupo.formatos.reduce((n, f) => n + f.camaras.length, 0)
                        let primeraFilaProducto = true
                        return (
                          <React.Fragment key={grupo.producto}>
                            {grupo.formatos.map(formato => {
                              let primeraFilaFormato = true
                              return formato.camaras.map(fc => {
                                const fila = (
                                  <tr key={`${grupo.producto}::${formato.bucket}::${fc.camara}`} className="prod-hover-row transition-colors hover:bg-(--p-hover)">
                                    {primeraFilaProducto && (
                                      <td rowSpan={filasCamara} className="border-r border-(--p-line-2) px-6 py-2.5 align-top font-semibold text-(--p-text)">
                                        <span className="inline-flex items-center gap-2.5">
                                          <ProductImage nombre={grupo.producto} categoria={grupo.categoria} size={32} radius={8} />
                                          {grupo.producto}
                                        </span>
                                      </td>
                                    )}
                                    {primeraFilaProducto && (
                                      <td rowSpan={filasCamara} className="border-r border-(--p-line-2) px-4 py-2.5 align-top">
                                        {grupo.categoria && (
                                          <span className={`rounded-full border px-2 py-0.5 text-xs font-bold capitalize ${
                                            grupo.categoria === 'cerveza' ? 'border-(--p-ok-line) bg-(--p-ok-soft) text-(--p-ok)' : 'border-(--p-warn-line) bg-(--p-warn-soft) text-(--p-warn)'
                                          }`}>
                                            {grupo.categoria}
                                          </span>
                                        )}
                                      </td>
                                    )}
                                    {primeraFilaFormato && (
                                      <td rowSpan={formato.camaras.length} className="border-r border-(--p-line-2) px-4 py-2.5 align-top font-semibold text-(--p-text-2)">
                                        {ENVASE_LABEL[formato.bucket]}
                                      </td>
                                    )}
                                    <td className="px-4 py-2.5 text-(--p-text-2)">{nombreCamaraCorto(fc.camara)}</td>
                                    <td className="px-4 py-2.5 text-right tabular-nums text-(--p-text-2)">{fNum(fc.cantidad)}</td>
                                    <td className="px-6 py-2.5 text-right tabular-nums text-(--p-text-2)">{fc.litros != null ? `${fNum(fc.litros)} L` : '—'}</td>
                                  </tr>
                                )
                                primeraFilaProducto = false
                                primeraFilaFormato = false
                                return fila
                              })
                            })}
                            {/* Subtotal del producto: lo que pide la vista agrupada —
                                cuánto hay en total, sin tener que sumar a mano las
                                filas de formato×cámara de arriba. */}
                            <tr className="bg-(--p-card-2)/70 font-bold text-(--p-text-2)">
                              <td colSpan={4} className="px-6 py-2 text-right text-xs uppercase tracking-wide text-(--p-text-3)">
                                Total {grupo.producto}
                              </td>
                              <td className="px-4 py-2 text-right tabular-nums">{fNum(grupo.cantidad)}</td>
                              <td className="px-6 py-2 text-right tabular-nums">{grupo.litros != null ? `${fNum(grupo.litros)} L` : '—'}</td>
                            </tr>
                          </React.Fragment>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                )}
              </section>
            </div>
  )
}
