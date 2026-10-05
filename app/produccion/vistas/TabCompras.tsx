'use client'

import { Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart } from 'recharts'
import { Package, ShoppingCart, AlertTriangle, ChevronDown, Sigma, ArrowDown, CircleDollarSign } from 'lucide-react'
import { COLORS } from '../tema'
import { inicioDeCiclo, finDeCiclo } from '@/lib/produccion/reglas'
import { CATEGORIA_INSUMO, pl, fNum, fPesos, fPesosCorto, fCantidadInsumo, etiquetaMes, fCicloCorto } from '../compartido'
import { Seccion, Kpi, Franja } from './ui'
import type { Produccion } from '../useProduccion'

/** Compras: qué comprar, cuánto y cuánto cuesta. Junta lo que eran "Qué
 *  comprar" y "Presupuesto", y suma el envase (latas, etiquetas, tapas), que
 *  antes no estaba en ninguna cuenta. */
export default function TabCompras({ p }: { p: Produccion }) {
  const { stockInsumos, lotesSinReceta, busquedaInsumo, panelInsumosAbierto, setPanelInsumosAbierto, mrpHorizonteDias, setMrpHorizonteDias, planSugerido, LEAD_COMPRA_DIAS_HABILES, setTogglesPresupuesto, setPresupuestoDesde, setPresupuestoHasta, vistaPresupuesto, setVistaPresupuesto, descargando, mesesPlan, ventanaDesde, ventanaHasta, lotesEnVentana, presupuesto, descargarPresupuesto, stockInsumosVacio, stockInsumosFiltrado, mrpInsumos, mrpFiltrado, presupuestoInsumos, PRESUPUESTO_MESES, necesidadEnvase, planTrimestral, guardarEnvase, errorEnvase, setErrorEnvase } = p
  return (
            <div className="prod-enter flex flex-col gap-6">

              {/* ── Resumen de compra de los próximos ciclos ── */}
              <Franja>
                <Kpi
                  etiqueta={`Compra · ${PRESUPUESTO_MESES} ciclos`}
                  valor={planTrimestral.total > 0 ? fPesosCorto(planTrimestral.total) : '—'}
                  tono="accent"
                  detalle="Insumos de receta + envase, descontado lo que hay en bodega"
                />
                <Kpi
                  etiqueta="Insumos a comprar"
                  valor={mrpInsumos.conNecesidad}
                  detalle={`de ${stockInsumos.length} del catálogo, para lo proyectado hasta el ${mrpInsumos.hastaISO.slice(8, 10)}/${mrpInsumos.hastaISO.slice(5, 7)}`}
                />
                <Kpi
                  etiqueta="Latas a comprar"
                  valor={fNum(necesidadEnvase.items.filter(it => it.tipo === 'lata').reduce((s, it) => s + it.aComprar, 0))}
                  detalle={necesidadEnvase.latasPorMl.map(l => `${fNum(l.total)} de ${l.ml} ml`).join(' · ') || 'Sin venta en lata proyectada'}
                />
                <Kpi
                  etiqueta="Precios faltantes"
                  valor={planTrimestral.total > 0 || presupuestoInsumos.sinPrecio + necesidadEnvase.sinPrecio > 0 ? presupuestoInsumos.sinPrecio + necesidadEnvase.sinPrecio : '—'}
                  tono={planTrimestral.total <= 0 && presupuestoInsumos.sinPrecio + necesidadEnvase.sinPrecio === 0 ? 'normal' : presupuestoInsumos.sinPrecio + necesidadEnvase.sinPrecio > 0 ? 'warn' : 'ok'}
                  detalle={presupuestoInsumos.sinPrecio + necesidadEnvase.sinPrecio > 0 ? 'Sin precio no entran al total: cárgalos para un presupuesto completo' : planTrimestral.total > 0 ? 'Todo lo que se compra tiene precio' : 'Nada que comprar con el forecast actual'}
                />
              </Franja>

              {/* ── Plan trimestral: cocinar, insumos y envase por ciclo ── */}
              <Seccion
                icono={CircleDollarSign}
                titulo={`Plan de los próximos ${PRESUPUESTO_MESES} ciclos`}
                detalle="Cuántos litros se van a vender (forecast) y cuánto hay que comprar para producirlos: insumos por receta y latas, etiquetas y tapas para lo que se vende en lata. Valorizado al último precio de compra."
              >
                {planTrimestral.filas.length === 0 ? (
                  <p className="px-5 pb-5 text-sm text-(--p-text-3)">Todavía no hay forecast para proyectar. Se genera el día 2 de cada mes.</p>
                ) : (
                  <div className="grid gap-4 px-5 pb-5 xl:grid-cols-[1fr_minmax(320px,420px)]">
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[560px] text-sm">
                        <thead className="text-left text-[11px] uppercase tracking-wide text-(--p-text-3)">
                          <tr className="border-b border-(--p-line-2)">
                            <th className="py-2 pr-3">Ciclo</th>
                            <th className="px-3 py-2 text-right">Cerveza</th>
                            <th className="px-3 py-2 text-right">Kombucha</th>
                            <th className="px-3 py-2 text-right">Latas</th>
                            <th className="px-3 py-2 text-right">Insumos</th>
                            <th className="px-3 py-2 text-right">Envase</th>
                            <th className="py-2 pl-3 text-right">Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-(--p-line-2) tabular-nums">
                          {planTrimestral.filas.map(f => (
                            <tr key={f.mes}>
                              <td className="py-2.5 pr-3 font-semibold text-(--p-text)" title={`${fCicloCorto(inicioDeCiclo(f.mes))} – ${fCicloCorto(finDeCiclo(f.mes))}`}>{f.etiqueta}</td>
                              <td className="px-3 py-2.5 text-right text-(--p-text-2)">{fNum(f.litrosCerveza)} L</td>
                              <td className="px-3 py-2.5 text-right text-(--p-text-2)">{fNum(f.litrosKombucha)} L</td>
                              <td className="px-3 py-2.5 text-right text-(--p-text-2)">{fNum(f.latas)}</td>
                              <td className="px-3 py-2.5 text-right text-(--p-text-2)">{fPesos(f.insumos)}</td>
                              <td className="px-3 py-2.5 text-right text-(--p-text-2)">{f.envase > 0 ? fPesos(f.envase) : '—'}</td>
                              <td className="py-2.5 pl-3 text-right font-bold text-(--p-text)">{fPesos(f.total)}</td>
                            </tr>
                          ))}
                          <tr className="border-t border-(--p-line)">
                            <td className="py-2.5 pr-3 font-bold text-(--p-text)">Total</td>
                            <td className="px-3 py-2.5 text-right font-semibold text-(--p-text-2)">{fNum(planTrimestral.filas.reduce((s, f) => s + f.litrosCerveza, 0))} L</td>
                            <td className="px-3 py-2.5 text-right font-semibold text-(--p-text-2)">{fNum(planTrimestral.filas.reduce((s, f) => s + f.litrosKombucha, 0))} L</td>
                            <td className="px-3 py-2.5 text-right font-semibold text-(--p-text-2)">{fNum(planTrimestral.filas.reduce((s, f) => s + f.latas, 0))}</td>
                            <td className="px-3 py-2.5 text-right font-semibold text-(--p-text-2)">{fPesos(planTrimestral.filas.reduce((s, f) => s + f.insumos, 0))}</td>
                            <td className="px-3 py-2.5 text-right font-semibold text-(--p-text-2)">{fPesos(planTrimestral.filas.reduce((s, f) => s + f.envase, 0))}</td>
                            <td className="py-2.5 pl-3 text-right font-black text-(--p-accent)">{fPesos(planTrimestral.total)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    <div className="h-[220px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={presupuestoInsumos.filas.map((f, i) => ({ ...f, envase: planTrimestral.filas[i]?.envase ?? 0 }))} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={COLORS.rejilla} />
                          <XAxis dataKey="etiqueta" axisLine={false} tickLine={false} tick={{ fill: COLORS.eje, fontSize: 12, fontWeight: 600 }} />
                          <YAxis axisLine={false} tickLine={false} width={64} tick={{ fill: COLORS.eje, fontSize: 11 }} tickFormatter={(v: number) => fPesosCorto(v)} />
                          <Tooltip
                            cursor={{ fill: 'rgba(138,131,120,0.08)' }}
                            contentStyle={{ borderRadius: 10, border: '1px solid rgba(138,131,120,0.25)', background: 'var(--p-card)', color: 'var(--p-text)', fontSize: 12 }}
                            formatter={(value, name) => [fPesos(Number(value)), name]}
                          />
                          <Legend verticalAlign="top" height={28} wrapperStyle={{ fontSize: 12, fontWeight: 600 }} />
                          <Bar dataKey="cerveza" name="Insumos cerveza" stackId="a" fill={COLORS.primario} />
                          <Bar dataKey="kombucha" name="Insumos kombucha" stackId="a" fill={COLORS.kombucha} />
                          <Bar dataKey="envase" name="Envase" stackId="a" fill={COLORS.contraste} radius={[4, 4, 0, 0]} />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}
              </Seccion>

              {/* ── Envase: latas, etiquetas y tapas ── */}
              <Seccion
                icono={Package}
                titulo="Envase: latas, etiquetas y tapas"
                detalle="Las latas que se venden según el forecast de cada producto, con su tamaño real (473 ml cerveza, 354 ml kombucha, según el inventario). Una etiqueta y una tapa por lata. Escribe el precio y el stock: se guardan solos."
              >
                {errorEnvase && (
                  <p role="alert" className="mx-5 mb-3 rounded-lg bg-(--p-bad-soft) px-3 py-2 text-sm text-(--p-bad)">
                    {errorEnvase} <button type="button" className="ml-2 font-bold underline" onClick={() => setErrorEnvase(null)}>Cerrar</button>
                  </p>
                )}
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-sm">
                    <thead className="text-left text-[11px] uppercase tracking-wide text-(--p-text-3)">
                      <tr className="border-y border-(--p-line-2)">
                        <th className="px-5 py-2">Ítem</th>
                        {necesidadEnvase.meses.map(m => <th key={m} className="px-3 py-2 text-right">{etiquetaMes(m)}</th>)}
                        <th className="px-3 py-2 text-right">Stock</th>
                        <th className="px-3 py-2 text-right">A comprar</th>
                        <th className="px-3 py-2 text-right">Precio unitario</th>
                        <th className="px-5 py-2 text-right">Costo</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-(--p-line-2) tabular-nums">
                      {necesidadEnvase.items.map(it => (
                        <tr key={it.clave}>
                          <td className="px-5 py-2.5 font-semibold text-(--p-text)">{it.nombre}</td>
                          {it.porMes.map((n, i) => <td key={i} className="px-3 py-2.5 text-right text-(--p-text-2)">{fNum(n)}</td>)}
                          <td className="px-3 py-1.5 text-right">
                            <input
                              id={`envase-stock-${it.clave}`}
                              aria-label={`Stock de ${it.nombre}`}
                              type="number" min={0} inputMode="numeric" defaultValue={it.stockUnidades ?? ''} placeholder="0"
                              onBlur={e => { const v = e.target.value === '' ? null : Number(e.target.value); if (v !== it.stockUnidades) void guardarEnvase(it.clave, { stockUnidades: v }) }}
                              className="w-24 rounded-lg border border-(--p-line) bg-(--p-card-2) px-2 py-1 text-right text-(--p-text) focus:border-(--p-accent) focus:outline-none"
                            />
                          </td>
                          <td className="px-3 py-2.5 text-right font-bold text-(--p-text)">{fNum(it.aComprar)}</td>
                          <td className="px-3 py-1.5 text-right">
                            <input
                              id={`envase-precio-${it.clave}`}
                              aria-label={`Precio unitario de ${it.nombre}`}
                              type="number" min={0} step="0.1" inputMode="decimal" defaultValue={it.precioUnitario ?? ''} placeholder="Sin precio"
                              onBlur={e => { const v = e.target.value === '' ? null : Number(e.target.value); if (v !== it.precioUnitario) void guardarEnvase(it.clave, { precioUnitario: v }) }}
                              className={`w-28 rounded-lg border bg-(--p-card-2) px-2 py-1 text-right text-(--p-text) focus:border-(--p-accent) focus:outline-none ${it.precioUnitario == null ? 'border-(--p-warn-line)' : 'border-(--p-line)'}`}
                            />
                          </td>
                          <td className="px-5 py-2.5 text-right font-bold text-(--p-text)">{it.costo != null ? fPesos(it.costo) : <span className="font-semibold text-(--p-warn)">Falta precio</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="px-5 py-3 text-[12px] text-(--p-text-3)">
                  Total envase: <strong className="text-(--p-text)">{fPesos(necesidadEnvase.costoTotal)}</strong>
                  {necesidadEnvase.sinPrecio > 0 && ` · ${necesidadEnvase.sinPrecio} ${necesidadEnvase.sinPrecio === 1 ? 'ítem sin precio queda' : 'ítems sin precio quedan'} fuera del total.`}
                </p>
              </Seccion>
              {/* ══════════ PRESUPUESTO DE INSUMOS ══════════
                  Va pegado al calendario a propósito: es la traducción a
                  plata de las cocciones de arriba, y las dos vistas comparten
                  la selección. Lo que se marca allá es lo que se compra acá. */}
              {mesesPlan.length > 0 && (
                <div className="flex flex-col overflow-hidden rounded-xl border border-(--p-line) bg-(--p-card) shadow-sm">
                  <div className="border-b border-(--p-line-2) p-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <ShoppingCart size={18} style={{ color: COLORS.primario }} />
                        <h3 className="font-bold text-(--p-text)">Presupuesto de insumos del calendario</h3>
                        <span className="rounded-full bg-(--p-chip) px-2 py-0.5 text-[11px] font-bold text-(--p-text-2)">
                          {presupuesto.cocciones} de {lotesEnVentana.length} {pl(lotesEnVentana.length, 'cocción', 'cocciones')}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={descargarPresupuesto}
                        disabled={descargando || presupuesto.lineas.length === 0}
                        className="prod-press prod-primario flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <ArrowDown size={15} />
                        {descargando ? 'Generando…' : 'Descargar Excel'}
                      </button>
                    </div>
                    <p className="mt-2 text-sm text-(--p-text-3)">
                      Cada cocción del calendario se baja a insumos por su receta, escalada al volumen real del tanque
                      asignado, y se valoriza al último precio de compra. La fecha de compra es la cocción menos{' '}
                      {LEAD_COMPRA_DIAS_HABILES} días hábiles, para que el insumo esté en planta cuando se macera.
                      Haz clic en cualquier cocción del calendario de arriba para sacarla o incluirla.
                    </p>

                    {/* Ventana libre: mensual, trimestral, o lo que elija */}
                    <div className="mt-4 flex flex-wrap items-end gap-3">
                      <label className="flex flex-col gap-1">
                        <span className="text-[10px] font-bold uppercase tracking-wide text-(--p-text-3)">Desde</span>
                        <select
                          value={ventanaDesde}
                          onChange={e => setPresupuestoDesde(e.target.value)}
                          className="rounded-lg border border-(--p-line) bg-(--p-card) px-2.5 py-1.5 text-sm font-medium text-(--p-text-2)"
                        >
                          {mesesPlan.map(m => <option key={m} value={m}>{etiquetaMes(m + '-01')}</option>)}
                        </select>
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-[10px] font-bold uppercase tracking-wide text-(--p-text-3)">Hasta</span>
                        <select
                          value={ventanaHasta}
                          onChange={e => setPresupuestoHasta(e.target.value)}
                          className="rounded-lg border border-(--p-line) bg-(--p-card) px-2.5 py-1.5 text-sm font-medium text-(--p-text-2)"
                        >
                          {mesesPlan.map(m => <option key={m} value={m}>{etiquetaMes(m + '-01')}</option>)}
                        </select>
                      </label>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => { setPresupuestoDesde(mesesPlan[0]); setPresupuestoHasta(mesesPlan[0]) }}
                          className="prod-press rounded-lg border border-(--p-line) px-2.5 py-1.5 text-xs font-bold text-(--p-text-2) hover:bg-(--p-hover)"
                        >
                          Mensual
                        </button>
                        <button
                          type="button"
                          onClick={() => { setPresupuestoDesde(mesesPlan[0]); setPresupuestoHasta(mesesPlan[mesesPlan.length - 1]) }}
                          className="prod-press rounded-lg border border-(--p-line) px-2.5 py-1.5 text-xs font-bold text-(--p-text-2) hover:bg-(--p-hover)"
                        >
                          Todo el horizonte ({mesesPlan.length} {mesesPlan.length === 1 ? 'mes' : 'meses'})
                        </button>
                        <button
                          type="button"
                          onClick={() => setTogglesPresupuesto(new Set(planSugerido.lotes.filter(l => !l.enCurso).map(l => l.id)))}
                          className="prod-press rounded-lg border border-(--p-line) px-2.5 py-1.5 text-xs font-bold text-(--p-text-2) hover:bg-(--p-hover)"
                        >
                          Marcar todas
                        </button>
                        <button
                          type="button"
                          onClick={() => setTogglesPresupuesto(new Set())}
                          className="prod-press rounded-lg border border-(--p-line) px-2.5 py-1.5 text-xs font-bold text-(--p-text-2) hover:bg-(--p-hover)"
                        >
                          Desmarcar todas
                        </button>
                      </div>
                    </div>
                  </div>

                  {presupuesto.lineas.length === 0 ? (
                    <p className="p-5 text-sm text-(--p-text-3)">
                      No hay cocciones marcadas en esta ventana. Marca alguna en el calendario de arriba.
                    </p>
                  ) : (
                    <>
                      {/* Cifras de cabecera */}
                      <div className="grid gap-px border-b border-(--p-line-2) bg-(--p-chip) sm:grid-cols-2 lg:grid-cols-4">
                        <div className="bg-(--p-card) p-4">
                          <p className="text-[10px] font-bold uppercase tracking-wide text-(--p-text-3)">A comprar</p>
                          <p className="mt-1 text-2xl font-bold tabular-nums" style={{ color: COLORS.primario }}>
                            ${fNum(presupuesto.total)}
                          </p>
                          <p className="mt-0.5 text-[11px] text-(--p-text-3)">neto de lo que ya hay en bodega</p>
                        </div>
                        <div className="bg-(--p-card) p-4">
                          <p className="text-[10px] font-bold uppercase tracking-wide text-(--p-text-3)">Necesidad total</p>
                          <p className="mt-1 text-2xl font-bold tabular-nums text-(--p-text-2)">${fNum(presupuesto.totalBruto)}</p>
                          <p className="mt-0.5 text-[11px] text-(--p-text-3)">si no hubiera nada en bodega</p>
                        </div>
                        <div className="bg-(--p-card) p-4">
                          <p className="text-[10px] font-bold uppercase tracking-wide text-(--p-text-3)">Producción</p>
                          <p className="mt-1 text-2xl font-bold tabular-nums text-(--p-text-2)">{fNum(presupuesto.litros)} L</p>
                          <p className="mt-0.5 text-[11px] text-(--p-text-3)">
                            {presupuesto.cocciones} {presupuesto.cocciones === 1 ? 'cocción' : 'cocciones'} ·{' '}
                            {presupuesto.total > 0 && presupuesto.litros > 0
                              ? `$${fNum(presupuesto.total / presupuesto.litros)}/L`
                              : '—'}
                          </p>
                        </div>
                        <div className="bg-(--p-card) p-4">
                          <p className="text-[10px] font-bold uppercase tracking-wide text-(--p-text-3)">Insumos</p>
                          <p className="mt-1 text-2xl font-bold tabular-nums text-(--p-text-2)">
                            {presupuesto.lineas.filter(l => l.aComprar > 0).length}
                          </p>
                          <p className="mt-0.5 text-[11px] text-(--p-text-3)">
                            de {presupuesto.lineas.length} que pide la receta
                          </p>
                        </div>
                      </div>

                      {/* Un total al que le faltan insumos no se puede leer como
                          presupuesto completo — hay que decirlo, no omitirlo. */}
                      {(presupuesto.sinPrecio.length > 0 || presupuesto.sinReceta.length > 0) && (
                        <div className="flex items-start gap-2.5 border-b border-(--p-warn-line) bg-(--p-warn-soft) p-4 text-sm text-(--p-warn)">
                          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-(--p-warn)" />
                          <div>
                            {presupuesto.sinReceta.length > 0 && (
                              <p>
                                <strong>{presupuesto.sinReceta.length} producto{presupuesto.sinReceta.length === 1 ? '' : 's'} sin receta cargada</strong> —
                                sus cocciones están en el calendario pero NO en este total: {presupuesto.sinReceta.join(', ')}.
                              </p>
                            )}
                            {presupuesto.sinPrecio.length > 0 && (
                              <p className={presupuesto.sinReceta.length > 0 ? 'mt-1' : ''}>
                                <strong>{presupuesto.sinPrecio.length} insumo{presupuesto.sinPrecio.length === 1 ? '' : 's'} sin precio</strong> —
                                se piden igual pero no suman al presupuesto: {presupuesto.sinPrecio.join(', ')}.
                              </p>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Cuándo sale la plata */}
                      {presupuesto.porMesCompra.length > 1 && (
                        <div className="border-b border-(--p-line-2) px-5 py-4">
                          <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-(--p-text-3)">
                            Desembolso por mes de compra
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {presupuesto.porMesCompra.map(m => (
                              <div key={m.mes} className="rounded-lg border border-(--p-line) px-3 py-2">
                                <p className="text-xs font-bold capitalize text-(--p-text-2)">{etiquetaMes(m.mes + '-01')}</p>
                                <p className="text-sm font-bold tabular-nums" style={{ color: COLORS.primario }}>${fNum(m.costo)}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Lista de compra */}
                      <div className="flex items-center gap-2 border-b border-(--p-line-2) px-5 py-3">
                        {(['insumo', 'producto'] as const).map(v => (
                          <button
                            key={v}
                            type="button"
                            onClick={() => setVistaPresupuesto(v)}
                            className={`prod-press rounded-lg px-3 py-1.5 text-xs font-bold ${
                              vistaPresupuesto === v ? 'border border-(--p-accent-line) bg-(--p-accent-soft) text-(--p-accent)' : 'border border-(--p-line) text-(--p-text-2) hover:bg-(--p-hover)'
                            }`}
                          >
                            {v === 'insumo' ? 'Qué comprar' : 'Por receta de producto'}
                          </button>
                        ))}
                      </div>

                      {vistaPresupuesto === 'insumo' ? (
                        <div className="overflow-x-auto">
                          <table className="w-full min-w-[820px] text-sm">
                            <thead className="border-b border-(--p-line-2) bg-(--p-card-2)/60 text-[10px] uppercase tracking-wide text-(--p-text-3)">
                              <tr>
                                <th className="px-4 py-2.5 text-left font-bold">Comprar el</th>
                                <th className="px-4 py-2.5 text-left font-bold">Insumo</th>
                                <th className="px-4 py-2.5 text-right font-bold">Necesidad</th>
                                <th className="px-4 py-2.5 text-right font-bold">En bodega</th>
                                <th className="px-4 py-2.5 text-right font-bold">A comprar</th>
                                <th className="px-4 py-2.5 text-right font-bold">Precio</th>
                                <th className="px-4 py-2.5 text-right font-bold">Costo</th>
                                <th className="px-4 py-2.5 text-left font-bold">Para qué cocciones</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-(--p-line-2)">
                              {presupuesto.lineas.map(l => (
                                <tr key={l.insumo} className={`prod-hover-row ${l.aComprar === 0 ? 'text-(--p-text-3)' : ''}`}>
                                  <td className="whitespace-nowrap px-4 py-3 font-bold tabular-nums text-(--p-text-2)">
                                    {new Date(l.fechaCompra + 'T00:00:00Z').toLocaleDateString('es-CL', { day: '2-digit', month: 'short', timeZone: 'UTC' })}
                                  </td>
                                  <td className="px-4 py-3">
                                    <p className="font-bold text-(--p-text)">{l.insumo}</p>
                                    <p className="text-[11px] capitalize text-(--p-text-3)">{l.categoria}</p>
                                  </td>
                                  <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{fNum(l.cantidad)} {l.unidadBase}</td>
                                  <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-(--p-text-3)">
                                    {l.disponible != null ? `${fNum(l.disponible)} ${l.unidadBase}` : 'sin dato'}
                                  </td>
                                  <td className="whitespace-nowrap px-4 py-3 text-right font-bold tabular-nums text-(--p-text)">
                                    {l.aComprar > 0 ? `${fNum(l.aComprar)} ${l.unidadBase}` : '—'}
                                  </td>
                                  <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-(--p-text-3)">
                                    {l.precioUnitario != null ? `$${l.precioUnitario.toLocaleString('es-CL', { maximumFractionDigits: 2 })}` : '—'}
                                  </td>
                                  <td className="whitespace-nowrap px-4 py-3 text-right font-bold tabular-nums" style={{ color: l.costoAComprar ? COLORS.primario : undefined }}>
                                    {l.costoAComprar != null ? `$${fNum(l.costoAComprar)}` : 'sin precio'}
                                  </td>
                                  <td className="px-4 py-3 text-[11px] text-(--p-text-3)">
                                    {l.detalle.map(d => (
                                      <span key={d.producto + d.fechaCoccion} className="mr-2 inline-block whitespace-nowrap">
                                        {d.producto}{' '}
                                        <span className="text-(--p-text-3)">
                                          {new Date(d.fechaCoccion + 'T00:00:00Z').toLocaleDateString('es-CL', { day: '2-digit', month: 'short', timeZone: 'UTC' })}
                                          {' · '}{fNum(d.cantidad)} {l.unidadBase}
                                        </span>
                                      </span>
                                    ))}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot className="border-t border-(--p-line) bg-(--p-card-2)/60">
                              <tr>
                                <td colSpan={6} className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wide text-(--p-text-3)">Total a comprar</td>
                                <td className="px-4 py-3 text-right text-base font-bold tabular-nums" style={{ color: COLORS.primario }}>${fNum(presupuesto.total)}</td>
                                <td />
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      ) : (
                        <div className="divide-y divide-(--p-line-2)">
                          {presupuesto.porProducto.map(g => (
                            <div key={g.producto} className="p-5">
                              <div className="flex flex-wrap items-baseline justify-between gap-2">
                                <p className="font-bold text-(--p-text)">{g.producto}</p>
                                <p className="text-sm font-bold tabular-nums" style={{ color: COLORS.primario }}>
                                  {g.costo != null ? `$${fNum(g.costo)}` : 'sin costo'}
                                </p>
                              </div>
                              <p className="mt-0.5 text-xs text-(--p-text-3)">
                                {g.cocciones} {g.cocciones === 1 ? 'cocción' : 'cocciones'} · {fNum(g.litros)} L
                                {g.costo != null && g.litros > 0 && ` · $${fNum(g.costo / g.litros)}/L`}
                                {g.sinPrecio > 0 && ` · ${g.sinPrecio} línea${g.sinPrecio === 1 ? '' : 's'} sin precio`}
                              </p>
                              <div className="mt-3 overflow-x-auto">
                                <table className="w-full min-w-[420px] text-sm">
                                  <tbody className="divide-y divide-(--p-line-2)">
                                    {g.insumos.map(i => (
                                      <tr key={i.insumo} className="prod-hover-row">
                                        <td className="py-2 pr-3 text-(--p-text-2)">{i.insumo}</td>
                                        <td className="whitespace-nowrap py-2 px-3 text-right tabular-nums text-(--p-text-2)">{fNum(i.cantidad)} {i.unidadBase}</td>
                                        <td className="whitespace-nowrap py-2 pl-3 text-right font-bold tabular-nums text-(--p-text)">
                                          {i.costo != null ? `$${fNum(i.costo)}` : '—'}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      <p className="border-t border-(--p-line-2) p-4 text-xs text-(--p-text-3)">
                        La cantidad de cada insumo sale de la receta escalada al volumen de la cocción, no de un
                        promedio: una cocción de 3.000 L de un tanque grande pide exactamente cuatro veces lo de una
                        de 750 L. Cuando una receta usa el mismo insumo en dos momentos (el mismo lúpulo en whirlpool y
                        en dry hop, por ejemplo) acá se suman: para cocer son etapas distintas, para comprar es el
                        mismo saco. &quot;A comprar&quot; descuenta lo que ya hay en bodega según el último informe de stock de
                        insumos — ese descuento se aplica sobre el total de la ventana, no cocción por cocción, porque
                        el informe es una foto sin reservas por lote. El Excel trae tres hojas: la orden de compra, el
                        detalle de qué cocción pide cada insumo, y el resumen por mes y por producto.
                      </p>
                    </>
                  )}
                </div>
              )}


              {lotesSinReceta.length > 0 && (
                <div className="flex shrink-0 items-start gap-3 rounded-xl border border-(--p-warn-line) bg-(--p-warn-soft) p-4 text-sm text-(--p-warn)">
                  <AlertTriangle size={18} className="mt-0.5 shrink-0 text-(--p-warn)" />
                  <div>
                    <p className="font-bold">
                      {lotesSinReceta.length} {lotesSinReceta.length === 1 ? 'lote' : 'lotes'} del Plan Maestro sin receta cargada
                    </p>
                    <p className="mt-1 text-(--p-warn)">
                      No se puede calcular su necesidad de insumos: {lotesSinReceta.map(l => `${l.producto} (${fNum(l.litrosPlanificados)} L)`).join(', ')}.
                    </p>
                  </div>
                </div>
              )}

              {/* Las 3 tablas de abajo son un acordeón: sólo una se expande a la
                  vez, para que cuando el usuario la abre ocupe todo el alto
                  disponible en vez de competir por espacio con las otras dos
                  (que quedan colapsadas mostrando sólo su encabezado-resumen). */}

              {/* Stock ACTUAL del catálogo completo de insumos — independiente de si
                  hay o no lotes activos en el Plan Maestro pidiéndolos. Existe
                  aparte de "Necesidad de Insumos" de abajo porque esa tabla sólo
                  lista lo que algún lote activo necesita: con la cola vacía queda
                  vacía también, aunque el stock sí esté cargado. */}
              <div className={`flex shrink-0 flex-col overflow-hidden rounded-xl border bg-(--p-card) shadow-sm transition-shadow duration-300 ${panelInsumosAbierto === 'stock' ? 'border-(--p-warn-line) shadow-md' : 'border-(--p-line)'}`}>
                <button
                  type="button"
                  onClick={() => setPanelInsumosAbierto('stock')}
                  aria-expanded={panelInsumosAbierto === 'stock'}
                  className="prod-press flex w-full flex-wrap items-center justify-between gap-3 border-b border-(--p-line-2) bg-(--p-card-2)/50 p-4 text-left transition-colors hover:bg-(--p-warn-soft) sm:gap-4 sm:p-5"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-(--p-warn-soft) text-(--p-warn)">
                      <Package size={16} />
                    </span>
                    <div className="min-w-0">
                      <h3 className="font-bold text-(--p-text)">Stock de Insumos</h3>
                      <p className="mt-1 text-sm text-(--p-text-3)">
                        {stockInsumos.length} {pl(stockInsumos.length, 'insumo', 'insumos')} del catálogo{stockInsumosVacio ? ' — todavía no hay ningún inventario cargado.' : '.'}
                      </p>
                    </div>
                  </div>
                  <ChevronDown
                    size={20}
                    className={`shrink-0 text-(--p-text-3) transition-transform duration-300 ${panelInsumosAbierto === 'stock' ? 'rotate-180 text-(--p-warn)' : ''}`}
                  />
                </button>
                <div className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${panelInsumosAbierto === 'stock' ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                  <div className="overflow-hidden">
                    {/* overflow-x-auto (en vez de que la tabla se achique para caber en
                        pantalla) es a propósito: en celular, comprimir 4 columnas de
                        insumos las vuelve ilegibles. Con min-width la tabla mantiene
                        columnas de ancho usable y el usuario hace scroll horizontal —
                        mismo patrón en las 3 tablas de esta sección. */}
                    <div className="max-h-[65vh] overflow-auto">
                      <table className="w-full min-w-[560px] border-collapse text-left">
                        <thead className="sticky top-0 z-10 bg-(--p-chip) text-xs font-bold uppercase tracking-wider text-(--p-text-2) shadow-sm">
                          <tr>
                            <th className="whitespace-nowrap px-6 py-3 font-bold">Insumo</th>
                            <th className="whitespace-nowrap px-6 py-3 font-bold">Categoría</th>
                            <th className="whitespace-nowrap px-6 py-3 text-right font-bold">Disponible</th>
                            <th className="whitespace-nowrap px-6 py-3 text-right font-bold">Valorizado</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-(--p-line-2) text-sm">
                          {stockInsumosFiltrado.length === 0 && (
                            <tr><td colSpan={4} className="px-6 py-8 text-center text-(--p-text-3)">
                              {stockInsumos.length === 0
                                ? 'No hay insumos cargados en el catálogo todavía.'
                                : `Sin resultados para "${busquedaInsumo}".`}
                            </td></tr>
                          )}
                          {stockInsumosFiltrado.map(row => {
                            const cat = CATEGORIA_INSUMO[row.categoria] ?? CATEGORIA_INSUMO.otros
                            return (
                              <tr key={row.insumo} className="prod-hover-row transition-colors hover:bg-(--p-hover)">
                                <td className="px-6 py-2.5 font-semibold text-(--p-text)">{row.insumo}</td>
                                <td className="px-6 py-2.5">
                                  <span className={`inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-bold ${cat.badge}`}>{cat.label}</span>
                                </td>
                                <td className="whitespace-nowrap px-6 py-2.5 text-right tabular-nums text-(--p-text-2)">
                                  {row.disponible != null ? fCantidadInsumo(row.disponible, row.unidadBase) : <span className="text-(--p-text-4)">Sin dato</span>}
                                </td>
                                <td className="whitespace-nowrap px-6 py-2.5 text-right tabular-nums text-(--p-text-3)">
                                  {row.valorizado != null ? `$${fNum(row.valorizado)}` : <span title="Sin precio o sin stock cargado">—</span>}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>

              {/* MRP neto simple: la necesidad sale del FORECAST del modelo, no
                  de lo que ya esté en cola — a diferencia de "Necesidad de
                  Insumos" de abajo, que sólo mira los lotes activos del Plan
                  Maestro. Complementarias, no reemplazan una a la otra. */}
              {mrpInsumos.productosSinForecast.length > 0 && (
                <div className="flex shrink-0 items-start gap-3 rounded-xl border border-(--p-warn-line) bg-(--p-warn-soft) p-4 text-sm text-(--p-warn)">
                  <AlertTriangle size={18} className="mt-0.5 shrink-0 text-(--p-warn)" />
                  <div>
                    <p className="font-bold">
                      {mrpInsumos.productosSinForecast.length} {mrpInsumos.productosSinForecast.length === 1 ? 'producto con receta' : 'productos con receta'} sin forecast
                    </p>
                    <p className="mt-1 text-(--p-warn)">
                      No se pudo proyectar su demanda (sin historial de venta suficiente todavía): {mrpInsumos.productosSinForecast.join(', ')}.
                      No están sumados en el MRP de abajo.
                    </p>
                  </div>
                </div>
              )}

              <div className={`flex shrink-0 flex-col overflow-hidden rounded-xl border bg-(--p-card) shadow-sm transition-shadow duration-300 ${panelInsumosAbierto === 'mrp' ? 'border-(--p-info-line) shadow-md' : 'border-(--p-line)'}`}>
                <div
                  role="button" tabIndex={0}
                  onClick={() => setPanelInsumosAbierto('mrp')}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setPanelInsumosAbierto('mrp') } }}
                  aria-expanded={panelInsumosAbierto === 'mrp'}
                  className="prod-press flex w-full flex-wrap items-center justify-between gap-3 border-b border-(--p-line-2) bg-(--p-card-2)/50 p-4 text-left transition-colors hover:bg-(--p-info-soft) sm:gap-4 sm:p-5"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-(--p-info-soft) text-(--p-info)">
                      <Sigma size={16} />
                    </span>
                    <div className="min-w-0">
                      <h3 className="font-bold text-(--p-text)">MRP — Compra sugerida de insumos</h3>
                      <p className="mt-1 text-sm text-(--p-text-3)">
                        {mrpInsumos.conNecesidad} {pl(mrpInsumos.conNecesidad, 'insumo a comprar', 'insumos a comprar')}, según la demanda proyectada por el modelo hasta
                        el {mrpInsumos.hastaISO.slice(8, 10)}/{mrpInsumos.hastaISO.slice(5, 7)} —
                        no depende de que haya lotes ya planificados.
                      </p>
                      {/* Total valorizado del horizonte: la cifra de presupuesto.
                          Mientras falten precios se dice cuántos insumos quedaron
                          fuera, para no leer un total parcial como si fuera completo. */}
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {mrpInsumos.costoTotal > 0 ? (
                          <span className="rounded-md bg-(--p-info-soft) px-2.5 py-1 text-sm font-bold text-(--p-info)">
                            Presupuesto {mrpHorizonteDias} días: ${fNum(mrpInsumos.costoTotal)}
                          </span>
                        ) : (
                          <span className="rounded-md bg-(--p-chip) px-2.5 py-1 text-xs font-semibold text-(--p-text-3)">
                            Sin valorizar — falta cargar precios de insumos
                          </span>
                        )}
                        {mrpInsumos.sinPrecio > 0 && mrpInsumos.costoTotal > 0 && (
                          <span className="rounded-md bg-(--p-warn-soft) px-2 py-1 text-xs font-bold text-(--p-warn)">
                            Parcial: {mrpInsumos.sinPrecio} sin precio
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    {/* stopPropagation: el encabezado completo es el botón que abre
                        y cierra el panel; sin esto, elegir horizonte lo colapsaría. */}
                    <div
                      className="flex overflow-hidden rounded-lg border border-(--p-line)"
                      onClick={e => e.stopPropagation()}
                    >
                      {([30, 60, 90] as const).map(d => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => setMrpHorizonteDias(d)}
                          className={`prod-press px-2.5 py-1.5 text-xs font-bold transition-colors ${
                            mrpHorizonteDias === d ? 'bg-(--p-accent-soft) text-(--p-accent)' : 'bg-(--p-card) text-(--p-text-2) hover:bg-(--p-hover)'
                          }`}
                        >
                          {d}d
                        </button>
                      ))}
                    </div>
                    <ChevronDown
                      size={20}
                      className={`shrink-0 text-(--p-text-3) transition-transform duration-300 ${panelInsumosAbierto === 'mrp' ? 'rotate-180 text-(--p-info)' : ''}`}
                    />
                  </div>
                </div>
                <div className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${panelInsumosAbierto === 'mrp' ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                  <div className="overflow-hidden">
                    <div className="max-h-[65vh] overflow-auto">
                      <table className="w-full min-w-[900px] border-collapse text-left">
                        <thead className="sticky top-0 z-10 bg-(--p-chip) text-xs font-bold uppercase tracking-wider text-(--p-text-2) shadow-sm">
                          <tr>
                            <th className="whitespace-nowrap px-6 py-3 font-bold">Insumo</th>
                            <th className="whitespace-nowrap px-6 py-3 font-bold">Categoría</th>
                            <th className="whitespace-nowrap px-6 py-3 text-right font-bold">Necesidad Bruta</th>
                            <th className="whitespace-nowrap px-6 py-3 text-right font-bold">Disponible</th>
                            <th className="whitespace-nowrap px-6 py-3 text-right font-bold text-(--p-info)">Compra Sugerida</th>
                            <th className="whitespace-nowrap px-6 py-3 text-right font-bold">Costo Estimado</th>
                            <th className="whitespace-nowrap px-6 py-3 font-bold">Productos que lo piden</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-(--p-line-2) text-sm">
                          {mrpFiltrado.length === 0 && (
                            <tr><td colSpan={7} className="px-6 py-10 text-center text-(--p-text-3)">
                              {mrpInsumos.filas.length === 0
                                ? 'Ningún producto con receta tiene demanda proyectada positiva en el horizonte.'
                                : `Sin resultados para "${busquedaInsumo}".`}
                            </td></tr>
                          )}
                          {mrpFiltrado.map(row => {
                            const cat = CATEGORIA_INSUMO[row.categoria] ?? CATEGORIA_INSUMO.otros
                            return (
                              <tr key={row.insumo} className="prod-hover-row transition-colors hover:bg-(--p-hover)">
                                <td className="whitespace-nowrap px-6 py-3 font-semibold text-(--p-text)">{row.insumo}</td>
                                <td className="px-6 py-3">
                                  <span className={`inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-bold ${cat.badge}`}>{cat.label}</span>
                                </td>
                                <td className="whitespace-nowrap px-6 py-3 text-right tabular-nums text-(--p-text-2)">{fCantidadInsumo(row.necesidadBruta, row.unidadBase)}</td>
                                <td className="whitespace-nowrap px-6 py-3 text-right tabular-nums text-(--p-text-3)">
                                  {row.disponible != null ? fCantidadInsumo(row.disponible, row.unidadBase) : <span className="text-(--p-text-4)">Sin dato</span>}
                                </td>
                                <td className={`whitespace-nowrap px-6 py-3 text-right font-bold tabular-nums text-(--p-info) ${row.necesidadNeta > 0 ? 'bg-(--p-info-soft)' : ''}`}>
                                  {row.necesidadNeta > 0 ? fCantidadInsumo(row.necesidadNeta, row.unidadBase) : <span className="text-(--p-text-4)">—</span>}
                                </td>
                                <td className="whitespace-nowrap px-6 py-3 text-right tabular-nums text-(--p-text-3)">
                                  {row.costoCompra != null ? `$${fNum(row.costoCompra)}` : <span title="Sin precio cargado todavía">—</span>}
                                </td>
                                <td className="px-6 py-3 text-xs text-(--p-text-3)">
                                  {row.productos.map(p => p.producto).join(', ')}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>

            </div>
  )
}
