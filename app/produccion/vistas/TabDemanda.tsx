'use client'

import React from 'react'
import ProductImage from '@/components/ui/ProductImage'
import { Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceArea, ResponsiveContainer, ComposedChart, Line, Area } from 'recharts'
import { Filter, Info, Sigma } from 'lucide-react'
import { COLORS } from '../tema'
import { ENVASE_LABEL, inicioDeCiclo, finDeCiclo, type EnvaseBucket } from '@/lib/produccion/reglas'
import { fNum, fPesos, fPesosCorto, etiquetaMes, fCicloCorto, ChipDesviacion } from '../compartido'
import type { Produccion } from '../useProduccion'

/** Demanda: cuánto vamos a vender, por producto y formato (forecast mensual
 *  por ciclo 24→23). La calculadora de cobertura que vivía acá pasó a Plan,
 *  donde ahora hay un solo cálculo de cuánto producir. */
export default function TabDemanda({ p }: { p: Produccion }) {
  const { avanceMes, filtroCategoria, setFiltroCategoria, filtroEnvase, setFiltroEnvase, verModelo, setVerModelo, filtroCategoriaForecast, filtroEnvaseForecast, setFiltroEnvaseForecast, filtroProductoForecast, setFiltroProductoForecast, productosForecastDisponibles, envasesForecastDisponibles, serieActual, cambiarCategoriaForecast, mtdLitros, ritmoProyectado, monedaForecast, setMonedaForecast, precioNeto, verNeto, kMoneda, fUnidad, valorSerie, unidadEnvaseSerieActual, chartData, hayDescomposicion, descomposicionProximo, curvaEstacional, ecuacionModelo, tramosTemporadaAlta, precisionSerie, envasesDisponibles, filasTablaDetalle } = p
  return (
            // h-full (no min-h-full) forzaba esta columna a la altura exacta
            // del viewport: con sólo filtros+gráfico entraba justo, pero al
            // agregar la tabla de detalle abajo, flexbox la comprimía a 0px
            // en vez de dejar crecer la columna y que el contenedor de más
            // arriba (flex-1 overflow-auto) scrolleara — confirmado con el
            // computed height de la tarjeta de la tabla: 35px de alto,
            // wrapper interno en 0px pese a tener 94 filas en el DOM.
            <div className="prod-enter flex min-h-full flex-col gap-6">


              {/* Filtros — pastillas conectadas en vez de un <select> único con
                  ~90 combinaciones (producto × envase), donde buscar un
                  producto puntual era tedioso. Categoría acota qué productos y
                  envases se ofrecen; Producto y Envase se combinan entre sí
                  para llegar a la serie exacta (ver la resolución de
                  serieActual más arriba). */}
              <div className="flex flex-col gap-3 rounded-xl border border-(--p-line) bg-(--p-card) p-4 shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="w-20 shrink-0 text-xs font-bold uppercase tracking-wider text-(--p-text-3)">Categoría</span>
                  <div className="flex flex-wrap gap-1.5">
                    {(['todas', 'cerveza', 'kombucha'] as const).map(c => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => cambiarCategoriaForecast(c)}
                        className={`prod-press rounded-full px-3 py-1.5 text-xs font-bold capitalize ${
                          filtroCategoriaForecast === c ? 'border border-(--p-accent-line) bg-(--p-accent-soft) text-(--p-accent)' : 'border border-(--p-line) text-(--p-text-3) hover:bg-(--p-hover)'
                        }`}
                      >
                        {c === 'todas' ? 'Todas' : c}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className="w-20 shrink-0 text-xs font-bold uppercase tracking-wider text-(--p-text-3)">Formato</span>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => setFiltroEnvaseForecast('todos')}
                      className={`prod-press rounded-full px-3 py-1.5 text-xs font-bold ${
                        filtroEnvaseForecast === 'todos' ? 'border border-(--p-accent-line) bg-(--p-accent-soft) text-(--p-accent)' : 'border border-(--p-line) text-(--p-text-3) hover:bg-(--p-hover)'
                      }`}
                    >
                      Todos los formatos
                    </button>
                    {envasesForecastDisponibles.map(b => (
                      <button
                        key={b}
                        type="button"
                        onClick={() => setFiltroEnvaseForecast(b)}
                        className={`prod-press rounded-full px-3 py-1.5 text-xs font-bold ${
                          filtroEnvaseForecast === b ? 'border border-(--p-accent-line) bg-(--p-accent-soft) text-(--p-accent)' : 'border border-(--p-line) text-(--p-text-3) hover:bg-(--p-hover)'
                        }`}
                      >
                        {ENVASE_LABEL[b]}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-wrap items-start gap-2">
                  <span className="w-20 shrink-0 pt-1.5 text-xs font-bold uppercase tracking-wider text-(--p-text-3)">Producto</span>
                  <div className="flex max-h-36 flex-wrap gap-1.5 overflow-y-auto">
                    <button
                      type="button"
                      onClick={() => setFiltroProductoForecast(null)}
                      className={`prod-press rounded-full px-3 py-1.5 text-xs font-bold ${
                        !filtroProductoForecast ? 'border border-(--p-accent-line) bg-(--p-accent-soft) text-(--p-accent)' : 'border border-(--p-line) text-(--p-text-3) hover:bg-(--p-hover)'
                      }`}
                    >
                      Todos (consolidado)
                    </button>
                    {productosForecastDisponibles.map(p => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setFiltroProductoForecast(p)}
                        className={`prod-press rounded-full px-3 py-1.5 text-xs font-bold ${
                          filtroProductoForecast === p ? 'border border-(--p-accent-line) bg-(--p-accent-soft) text-(--p-accent)' : 'border border-(--p-line) text-(--p-text-3) hover:bg-(--p-hover)'
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                    {productosForecastDisponibles.length === 0 && (
                      <span className="py-1.5 text-xs text-(--p-text-3)">Ningún producto tiene ese formato en esta categoría.</span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 border-t border-(--p-line-2) pt-3 text-xs text-(--p-text-3)">
                  <Filter size={14} className="shrink-0 text-(--p-text-3)" />
                  <span className="font-semibold text-(--p-text-2)">{serieActual?.label ?? 'Consolidado'}</span>
                  <span className="text-(--p-text-4)">·</span>
                  <span>
                    {serieActual?.mesesHistorial != null
                      ? `${serieActual.mesesHistorial} meses de ventas reales`
                      : `${chartData.filter(d => d.ventaReal != null).length} meses de ventas reales`}
                  </span>
                </div>
              </div>

              {/* Gráfico */}
              <div className="flex flex-col rounded-xl border border-(--p-line) bg-(--p-card) p-4 shadow-sm lg:p-6">
                <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-lg font-bold text-(--p-text)">
                      Proyección de Demanda ({verNeto ? 'Neto $' : 'Litros'}) vs. Venta Real
                    </h3>
                    <p className="mt-1 text-sm text-(--p-text-3)">
                      {serieActual?.label ?? '—'} · la franja sombreada marca la temporada alta (Dic–Feb).
                    </p>
                    {/* La conversión a unidades sólo aparece cuando la serie elegida
                        es un producto×envase concreto (no "todos los formatos" ni un
                        consolidado) — ahí sí hay un tamaño de envase único con el que
                        convertir litros a barriles/latas. Se aclara la base acá para
                        que el número de la tabla/tooltip no parezca sacado de la nada. */}
                    {monedaForecast === 'neto' && precioNeto == null && (
                      <p className="mt-0.5 text-xs font-semibold text-(--p-bad)">
                        No hay ventas recientes con las que valorizar esta serie: se muestra en litros.
                      </p>
                    )}
                    {verNeto && serieActual && (
                      <p className="mt-0.5 text-xs font-semibold text-(--p-text-3)">
                        Neto (sin IVA) a precio de hoy: <span className="text-(--p-text-2)">{fPesos(precioNeto!)} por litro</span>
                        {' '}— promedio ponderado de las ventas de los últimos 90 días
                        {serieActual.precioFuente === 'producto' ? ', del producto (este formato casi no vendió)' : serieActual.precioFuente === 'general' ? ', del consolidado (esta serie casi no vendió)' : serieActual.nivel === 'general' ? ' (incluye la mezcla de productos)' : ''}.
                        {' '}El historial usa ese mismo precio, para que se compare el volumen y no cambios de precio.
                      </p>
                    )}
                    {unidadEnvaseSerieActual && (
                      <p className="mt-0.5 text-xs font-semibold text-(--p-text-3)">
                        pasa el mouse por el gráfico para ver también la cantidad de {unidadEnvaseSerieActual.nombre} pronosticadas
                        {unidadEnvaseSerieActual.nombre === 'latas'
                          ? ` (≈${Math.round(unidadEnvaseSerieActual.litrosPorUnidad * 1000)} ml/lata, estimado del inventario físico)`
                          : ` (${unidadEnvaseSerieActual.litrosPorUnidad} L/barril)`}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Litros ⇄ dinero neto: sólo cambia lo que se muestra (ver monedaForecast). */}
                    <div className="flex gap-0.5 rounded-lg border border-(--p-line) bg-(--p-card-2) p-0.5" role="group" aria-label="Unidad del pronóstico">
                      {([['litros', 'Litros'], ['neto', '$ Neto']] as const).map(([id, texto]) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => setMonedaForecast(id)}
                          aria-pressed={monedaForecast === id}
                          title={id === 'neto' ? 'Ver la proyección en dinero neto (sin IVA) a precio de hoy' : 'Ver la proyección en litros'}
                          className={`rounded-md px-3 py-1 text-sm font-bold transition-colors ${monedaForecast === id ? 'bg-(--p-card) text-(--p-text) shadow-sm' : 'text-(--p-text-3) hover:text-(--p-text-2)'}`}
                        >
                          {texto}
                        </button>
                      ))}
                    </div>
                    {/* Interruptor de la descomposición: por defecto apagado
                        para no sobrecargar la lectura rápida, pero a un clic
                        de mostrar de qué está hecha la proyección. */}
                    {hayDescomposicion && (
                      <button
                        onClick={() => setVerModelo(v => !v)}
                        aria-pressed={verModelo}
                        className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-bold transition-colors ${
                          verModelo ? 'border border-(--p-accent-line) bg-(--p-accent-soft) text-(--p-accent)' : 'border-(--p-line) bg-(--p-card) text-(--p-text-2) hover:bg-(--p-hover)'
                        }`}
                      >
                        <Sigma size={15} />
                        Ver el modelo
                      </button>
                    )}
                    {precisionSerie != null && (
                      <div className={`rounded-lg border px-3 py-1.5 text-sm font-bold ${
                        precisionSerie >= 85 ? 'border-(--p-ok-line) bg-(--p-ok-soft) text-(--p-ok)'
                          : precisionSerie >= 70 ? 'border-(--p-warn-line) bg-(--p-warn-soft) text-(--p-warn)'
                            : 'border-(--p-bad-line) bg-(--p-bad-soft) text-(--p-bad)'
                      }`}>
                        Precisión Histórica: {precisionSerie.toFixed(0)}%
                      </div>
                    )}
                  </div>
                </div>

                {/* Función matemática del modelo, con las constantes de ESTA
                    corrida — para que quede claro que la proyección sale de
                    una función real, no de una regla de tres, y que esa
                    función cambia sola cuando el modelo se reentrena. */}
                {verModelo && ecuacionModelo && (
                  <div className="mb-4 rounded-xl border border-(--p-line) bg-(--p-card) p-4 shadow-sm">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-(--p-text-3)">
                      Función del modelo
                    </p>
                    <p className="mt-1.5 overflow-x-auto whitespace-nowrap font-mono text-base font-bold text-(--p-text) sm:text-lg">
                      y(t) = g(t) + s(t) + ε<sub>t</sub>
                    </p>
                    <div className="mt-3 flex flex-col gap-1.5 border-t border-(--p-line-2) pt-3 font-mono text-sm text-(--p-text-2)">
                      <p className="overflow-x-auto whitespace-nowrap">
                        g(t) = {fNum(ecuacionModelo.m)} {ecuacionModelo.k >= 0 ? '+' : '−'} {Math.abs(ecuacionModelo.k).toFixed(1)}·t
                      </p>
                      <p className="overflow-x-auto whitespace-nowrap">
                        s(t) ≈ {fNum(ecuacionModelo.A)}·sin(2π·t/12 {ecuacionModelo.fase >= 0 ? '+' : '−'} {Math.abs(ecuacionModelo.fase).toFixed(2)})
                      </p>
                    </div>
                    <p className="mt-3 text-xs leading-snug text-(--p-text-3)">
                      t = meses desde {etiquetaMes(ecuacionModelo.t0mes)} (t=0). g(t) es la tendencia exacta que usa
                      el modelo para proyectar — sale del tramo lineal posterior al último <em>changepoint</em>, no de
                      un ajuste a mano. s(t) es una aproximación de un solo armónico a la estacionalidad de Fourier
                      real de Prophet, para que la fórmula sea legible. Sin componente de feriados (h(t)): este
                      modelo no los usa. Las constantes se recalculan solas en cada corrida del modelo.
                      {verNeto && ' La función está en litros: el modelo trabaja en litros y el dinero es litros × precio neto por litro.'}
                    </p>
                  </div>
                )}

                {/* Ecuación del modelo, con los números del mes proyectado.
                    Es la parte que hace evidente que la línea verde no es una
                    regla de tres: sale de dos componentes que Prophet estima
                    por separado sobre el historial y después suma. */}
                {verModelo && descomposicionProximo && (
                  <div className="mb-5 flex flex-wrap items-stretch gap-3 rounded-xl border border-(--p-line) bg-(--p-card-2)/70 p-4">
                    <div className="min-w-[190px] flex-1">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-(--p-text-3)">Tendencia</p>
                      <p className="text-xl font-black tabular-nums" style={{ color: COLORS.primarioSuave }}>
                        {fUnidad(descomposicionProximo.tendencia)}
                      </p>
                      <p className="mt-0.5 text-xs leading-snug text-(--p-text-3)">
                        Hacia dónde va el negocio, sin el efecto del mes. Se ajusta con
                        <em> changepoints</em>: quiebres de pendiente detectados en los datos.
                      </p>
                    </div>
                    <div className="flex items-center text-2xl font-light text-(--p-text-4)">+</div>
                    <div className="min-w-[190px] flex-1">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-(--p-text-3)">Estacionalidad de {etiquetaMes(descomposicionProximo.mesIso)}</p>
                      <p className="text-xl font-black tabular-nums" style={{ color: descomposicionProximo.estacionalidad >= 0 ? COLORS.contraste : COLORS.bad }}>
                        {descomposicionProximo.estacionalidad >= 0 ? '+' : '−'}{fUnidad(Math.abs(descomposicionProximo.estacionalidad))}
                      </p>
                      <p className="mt-0.5 text-xs leading-snug text-(--p-text-3)">
                        Cuánto se aparta ese mes del año respecto de la tendencia. Curva de Fourier
                        ajustada sobre {serieActual?.mesesHistorial ?? chartData.filter(d => d.ventaReal != null).length} meses.
                      </p>
                    </div>
                    <div className="flex items-center text-2xl font-light text-(--p-text-4)">=</div>
                    <div className="min-w-[150px] flex-1">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-(--p-text-3)">Proyección</p>
                      <p className="text-xl font-black tabular-nums" style={{ color: COLORS.primario }}>
                        {fUnidad(descomposicionProximo.tendencia + descomposicionProximo.estacionalidad)}
                      </p>
                      <p className="mt-0.5 text-xs leading-snug text-(--p-text-3)">
                        El rango sombreado es el intervalo de predicción al 80%: 4 de cada 5 meses
                        deberían caer dentro.
                      </p>
                    </div>
                  </div>
                )}

                {/* Altura fija en vez de heredada por flex/min-height: Recharts
                    necesita que ALGÚN ancestro tenga una altura resuelta en
                    píxeles para poder calcular su height="100%" — una cadena
                    de flex-1/min-height no se lo garantiza (se rompió al
                    cambiar el wrapper de la pestaña de h-full a min-h-full
                    para la tabla de abajo: el SVG dejó de dibujarse, 0px). */}
                <div className="relative h-[360px] w-full">
                  {chartData.length === 0 ? (
                    <div className="flex h-full items-center justify-center text-sm text-(--p-text-3)">
                      Todavía no hay una corrida del modelo. Se genera automáticamente el día 2 de cada mes.
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={chartData} margin={{ top: 20, right: 20, left: 10, bottom: 5 }}>
                        <defs>
                          {/* El intervalo se desvanece hacia abajo en vez de
                              ser un bloque plano: se lee como incertidumbre,
                              no como una segunda serie de datos. */}
                          <linearGradient id="gradRango" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={COLORS.primario} stopOpacity={0.22} />
                            <stop offset="100%" stopColor={COLORS.primario} stopOpacity={0.04} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={COLORS.rejilla} />
                        <XAxis
                          dataKey="month" axisLine={false} tickLine={false} minTickGap={24}
                          tick={{ fill: COLORS.eje, fontSize: 12, fontWeight: 600 }} dy={10}
                        />
                        <YAxis
                          axisLine={false} tickLine={false} tick={{ fill: COLORS.eje, fontSize: 12 }} dx={-6}
                          width={verNeto ? 72 : undefined}
                          tickFormatter={(v: number) => (verNeto ? fPesosCorto(v) : v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
                        />
                        {/* Tooltip a medida: en el mes ancla (el último real,
                            donde arranca la línea de proyección) "Venta Real",
                            "Venta Proyectada" y "Ritmo proyectado" quedan con
                            el MISMO número a propósito, sólo para que esas
                            tres líneas conecten visualmente ahí — mostrar los
                            tres en el tooltip como si fueran datos distintos
                            confunde (se ve como si el modelo hubiera
                            "proyectado" un mes que ya cerró). Se ocultan las
                            dos entradas redundantes en ese punto puntual. */}
                        {/* La etiqueta "Ago '26" es el mes Y AÑO (Agosto,
                            2026) — el '26 es el año abreviado, no un día del
                            mes. Como el ciclo real corre 24→23 y no calendario
                            (ver lib/produccion/reglas.ts), eso generó
                            confusión real ("¿por qué a veces aparece 25 o 26
                            del mes?", cuando en realidad eran años distintos
                            en distintos puntos del historial). Se agrega el
                            rango de fechas exacto del ciclo debajo del mes
                            para que no quede ambigüedad. */}
                        <Tooltip
                          content={({ active, payload, label }) => {
                            if (!active || !payload || payload.length === 0) return null
                            const fila = payload[0]?.payload as (typeof chartData)[number] | undefined
                            const esAncla = !!fila && fila.ventaReal != null && fila.ventaProyectada != null && fila.mesIso !== avanceMes.mes
                            const visibles = payload.filter(entrada => {
                              if (entrada.value == null) return false
                              if (esAncla && (entrada.dataKey === 'ventaProyectada' || entrada.dataKey === 'ritmo')) return false
                              return true
                            })
                            if (visibles.length === 0) return null
                            return (
                              <div className="rounded-lg bg-(--p-card) px-3.5 py-2.5 text-xs shadow-lg">
                                <p className="font-bold text-(--p-text-2)">{label}</p>
                                {fila && (
                                  <p className="mb-1.5 text-[11px] text-(--p-text-3)">
                                    {fCicloCorto(inicioDeCiclo(fila.mesIso))} – {fCicloCorto(finDeCiclo(fila.mesIso))}
                                  </p>
                                )}
                                {visibles.map(entrada => {
                                  const valor = entrada.value
                                  const texto = Array.isArray(valor)
                                    ? `${verNeto ? fPesos(Number(valor[0])) : fNum(Number(valor[0]))} – ${verNeto ? fPesos(Number(valor[1])) : fNum(Number(valor[1]))}${verNeto ? '' : ' L'}`
                                    : verNeto ? fPesos(Number(valor)) : `${fNum(Number(valor))} L`
                                  // Además de litros, cuántos envases son — sólo tiene sentido
                                  // para las series de demanda (no para tendencia/estacionalidad,
                                  // que son componentes del modelo, no litros vendibles) y sólo
                                  // cuando la serie elegida es un producto×envase con conversión
                                  // conocida (ver unidadEnvaseSerieActual).
                                  const mostrarUnidades = unidadEnvaseSerieActual != null &&
                                    ['ventaProyectada', 'ventaReal', 'ritmo', 'rango'].includes(String(entrada.dataKey))
                                  const unidadesTexto = mostrarUnidades
                                    ? Array.isArray(valor)
                                      ? `${fNum(Math.round(Number(valor[0]) / kMoneda / unidadEnvaseSerieActual!.litrosPorUnidad))} – ${fNum(Math.round(Number(valor[1]) / kMoneda / unidadEnvaseSerieActual!.litrosPorUnidad))} ${unidadEnvaseSerieActual!.nombre}`
                                      : `≈ ${fNum(Math.round(Number(valor) / kMoneda / unidadEnvaseSerieActual!.litrosPorUnidad))} ${unidadEnvaseSerieActual!.nombre}`
                                    : null
                                  return (
                                    <p key={String(entrada.dataKey)} style={{ color: entrada.color }} className="font-semibold">
                                      {entrada.name}: {texto}
                                      {unidadesTexto && <span className="ml-1 font-normal text-(--p-text-3)">({unidadesTexto})</span>}
                                    </p>
                                  )
                                })}
                              </div>
                            )
                          }}
                        />
                        <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: '12px', fontWeight: 600, color: COLORS.eje }} />

                        {tramosTemporadaAlta.map((t, i) => (
                          <ReferenceArea key={i} x1={t.x1} x2={t.x2} fill={COLORS.temporada} fillOpacity={0.4} />
                        ))}

                        <Area
                          dataKey="rango" name="Rango estimado (80%)" stroke="none"
                          fill="url(#gradRango)" connectNulls
                        />
                        {/* Tendencia del modelo sobre TODA la serie, historial
                            incluido: ahí se ve que está ajustada a los datos
                            reales y no dibujada sólo hacia el futuro. */}
                        {verModelo && (
                          <Line
                            type="monotone" dataKey="tendencia" name="Tendencia (sin estacionalidad)"
                            stroke={COLORS.primarioSuave} strokeWidth={2} strokeDasharray="6 4"
                            dot={false} activeDot={false} connectNulls isAnimationActive={false}
                          />
                        )}
                        <Line
                          type="monotone" dataKey="ventaProyectada" name="Venta Proyectada"
                          stroke={COLORS.primario} strokeWidth={3} connectNulls
                          dot={{ r: 3, fill: COLORS.primario, strokeWidth: 0 }} activeDot={{ r: 6 }}
                        />
                        <Line
                          type="monotone" dataKey="ventaReal" name="Venta Real"
                          stroke={COLORS.contraste} strokeWidth={3} strokeDasharray="5 5" connectNulls={false}
                          dot={false} activeDot={{ r: 6 }}
                        />
                        {/* Ritmo proyectado: arranca del mismo último mes real
                            que la línea verde (no del dato crudo del mes a
                            medias, que comparado contra meses completos se
                            veía como una caída al vacío) y corre AL LADO de
                            la proyección del modelo hasta el mes en curso —
                            así se compara directo: ¿vendiendo al ritmo de
                            estos días, cerramos arriba o abajo de lo que el
                            modelo esperaba? */}
                        <Line
                          type="monotone" dataKey="ritmo" name="Ritmo proyectado a fin de mes"
                          stroke={COLORS.contraste} strokeWidth={2.5} strokeDasharray="2 3" connectNulls
                          dot={(props: { cx?: number; cy?: number; index?: number; payload?: { mesIso?: string } }) => {
                            const { cx, cy, index, payload } = props
                            // Sólo un punto visible, en el mes en curso — el
                            // ancla (último mes real) ya tiene su propio dot
                            // de "Venta Proyectada"/"Venta Real" ahí mismo.
                            if (payload?.mesIso !== avanceMes.mes || cx == null || cy == null) return <React.Fragment key={index} />
                            return <circle key={index} cx={cx} cy={cy} r={5} fill="#fff" stroke={COLORS.contraste} strokeWidth={2.5} />
                          }}
                          isAnimationActive={false}
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              {/* ── Curva estacional aprendida por el modelo ── */}
              {verModelo && curvaEstacional.length > 0 && (
                <div className="flex flex-col rounded-xl border border-(--p-line) bg-(--p-card) p-4 shadow-sm lg:p-6">
                  <div className="mb-4">
                    <h3 className="text-lg font-bold text-(--p-text)">Estacionalidad aprendida por el modelo</h3>
                    <p className="mt-1 text-sm text-(--p-text-3)">
                      Litros que cada mes del año suma o resta respecto de la tendencia. No es una regla
                      escrita a mano: es la curva de Fourier que Prophet ajustó sobre el historial de esta serie.
                    </p>
                  </div>
                  <div className="h-[200px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={curvaEstacional} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={COLORS.rejilla} />
                        <XAxis dataKey="mes" axisLine={false} tickLine={false} tick={{ fill: COLORS.eje, fontSize: 12, fontWeight: 600 }} dy={8} />
                        <YAxis
                          axisLine={false} tickLine={false} tick={{ fill: COLORS.eje, fontSize: 12 }} dx={-6}
                          tickFormatter={(v: number) => (Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : String(Math.round(v)))}
                        />
                        <Tooltip
                          contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                          formatter={(value) => {
                            const n = Number(value)
                            return [`${n >= 0 ? '+' : '−'}${fNum(Math.abs(n))} L`, n >= 0 ? 'Sobre la tendencia' : 'Bajo la tendencia']
                          }}
                        />
                        {/* Una barra por mes, verde arriba de la tendencia y
                            ámbar abajo — el signo se lee sin mirar el eje. */}
                        <Bar dataKey="efecto" name="Efecto del mes" radius={[3, 3, 3, 3]} isAnimationActive={false}>
                          {curvaEstacional.map(d => (
                            <Cell key={d.mes} fill={d.efecto >= 0 ? COLORS.primarioSuave : COLORS.contraste} />
                          ))}
                        </Bar>
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* ¿Vamos a cumplir lo proyectado? — comparación simple del mes en curso */}
              {mtdLitros > 0 && (() => {
                const objetivo = chartData.find(f => f.mesIso === avanceMes.mes)?.ventaProyectada ?? null
                const pct = objetivo != null && objetivo > 0 ? ((ritmoProyectado * kMoneda) / objetivo) * 100 : null
                const cumple = pct != null && pct >= 95
                const avancePct = Math.min(100, (avanceMes.diaActual / avanceMes.diasEnMes) * 100)
                return (
                  <div className="overflow-hidden rounded-xl border border-(--p-line) bg-(--p-card) shadow-sm">
                    <div className="grid gap-px bg-(--p-line) sm:grid-cols-3">
                      <div className="bg-(--p-card) p-5">
                        <p
                          className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-(--p-text-3)"
                          title="Cuenta por fecha de pedido, no de entrega — a diferencia de Ventas, que sólo suma lo ya despachado. Producción necesita la señal apenas se toma el pedido, no cuando se despacha."
                        >
                          Vendido este mes
                          <Info size={11} className="text-(--p-text-4)" />
                        </p>
                        <p className="mt-1 text-3xl font-black tabular-nums text-(--p-text)">{fUnidad(mtdLitros * kMoneda)}</p>
                        <p className="text-[10px] text-(--p-text-3)">por fecha de pedido, no de entrega</p>
                        {/* Barra de avance del mes: el número solo no dice si
                            vamos temprano o tarde en el período. */}
                        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-(--p-chip)">
                          <div className="h-full rounded-full" style={{ width: `${avancePct}%`, backgroundColor: COLORS.neutro }} />
                        </div>
                        <p className="mt-1.5 text-xs text-(--p-text-3)">día {avanceMes.diaActual} de {avanceMes.diasEnMes}</p>
                      </div>

                      <div className="bg-(--p-card) p-5">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-(--p-text-3)">A este ritmo cerrarías con</p>
                        <p className="mt-1 text-3xl font-black tabular-nums" style={{ color: COLORS.contraste }}>{fUnidad(ritmoProyectado * kMoneda)}</p>
                        <p className="mt-[14px] text-xs text-(--p-text-3)">extrapolación lineal de lo vendido</p>
                      </div>

                      {objetivo != null && pct != null && (
                        <div className="bg-(--p-card) p-5">
                          <p className="text-[11px] font-bold uppercase tracking-wider text-(--p-text-3)">El modelo proyectó</p>
                          <p className="mt-1 text-3xl font-black tabular-nums" style={{ color: COLORS.primario }}>{fUnidad(objetivo)}</p>
                          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-(--p-chip)">
                            <div
                              className="h-full rounded-full"
                              style={{ width: `${Math.min(100, pct)}%`, backgroundColor: cumple ? COLORS.ok : COLORS.bad }}
                            />
                          </div>
                          <p className={`mt-1.5 text-xs font-bold ${cumple ? 'text-(--p-ok)' : 'text-(--p-bad)'}`}>
                            {cumple ? '✓' : '⚠'} vas al {pct.toFixed(0)}% de lo proyectado
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })()}

              {/* ── Detalle por producto y envase ── */}
              <div className="flex flex-col overflow-hidden rounded-xl border border-(--p-line) bg-(--p-card) shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-(--p-line-2) bg-(--p-card-2)/50 p-5">
                  <div>
                    <h3 className="font-bold text-(--p-text)">Detalle por producto y envase</h3>
                    <p className="mt-1 text-sm text-(--p-text-3)">
                      {filasTablaDetalle.length} combinaciones · {monedaForecast === 'neto' ? 'neto vendido (a precio de hoy) en lo que va del mes y proyección del próximo mes cerrado' : 'litros vendidos en lo que va del mes y proyección del próximo mes cerrado'}.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(['todas', 'cerveza', 'kombucha'] as const).map(c => (
                      <button
                        key={c}
                        onClick={() => setFiltroCategoria(c)}
                        className={`rounded-full border px-3 py-1.5 text-xs font-bold capitalize transition-colors ${
                          filtroCategoria === c
                            ? 'border-(--p-accent-line) bg-(--p-accent-soft) text-(--p-accent)'
                            : 'border-(--p-line) bg-(--p-card) text-(--p-text-3) hover:bg-(--p-hover)'
                        }`}
                      >
                        {c === 'todas' ? 'Todas' : c}
                      </button>
                    ))}
                    <span className="mx-1 self-center text-(--p-text-4)">|</span>
                    <select
                      value={filtroEnvase}
                      onChange={e => setFiltroEnvase(e.target.value)}
                      className="rounded-full border border-(--p-line) bg-(--p-card) px-3 py-1.5 text-xs font-bold text-(--p-text-2) focus:outline-none focus:ring-2 focus:ring-amber-500"
                    >
                      <option value="todos">Todos los envases</option>
                      {envasesDisponibles.map(b => <option key={b} value={b}>{ENVASE_LABEL[b as EnvaseBucket] ?? b}</option>)}
                    </select>
                  </div>
                </div>

                <div className="max-h-[520px] overflow-auto">
                  <table className="w-full border-collapse text-left">
                    <thead className="sticky top-0 z-10 bg-(--p-chip) text-xs font-bold uppercase tracking-wider text-(--p-text-2) shadow-sm">
                      <tr>
                        <th className="px-6 py-3 font-bold">Producto</th>
                        <th className="px-4 py-3 font-bold">Envase</th>
                        <th className="px-4 py-3 font-bold">Categoría</th>
                        <th className="px-4 py-3 text-right font-bold">Vendido este mes</th>
                        <th className="px-4 py-3 text-right font-bold text-(--p-warn)">Próximo mes (proy.)</th>
                        <th className="px-6 py-3 text-center font-bold" title="Error del backtest (MAPE) — más alto es peor, no una confiabilidad de 0-100%.">Desviación</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-(--p-line-2) text-sm">
                      {filasTablaDetalle.length === 0 && (
                        <tr><td colSpan={6} className="px-6 py-10 text-center text-(--p-text-3)">Sin combinaciones para este filtro.</td></tr>
                      )}
                      {filasTablaDetalle.map(({ serie, proximo }, i) => {
                        const productoRepetido = i > 0 && filasTablaDetalle[i - 1].serie.producto === serie.producto
                        return (
                          <tr key={serie.id} className="prod-hover-row transition-colors hover:bg-(--p-hover)">
                            <td className="px-6 py-2.5 font-semibold text-(--p-text)">
                              {productoRepetido ? (
                                <span className="pl-[42px] text-(--p-text-4)">″</span>
                              ) : (
                                <span className="inline-flex items-center gap-2.5">
                                  <ProductImage
                                    nombre={serie.producto} categoria={serie.categoria}
                                    esBarril={serie.envaseBucket === 'barril_30' || serie.envaseBucket === 'barril_50'}
                                    size={32} radius={8}
                                  />
                                  {serie.producto}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-(--p-text-2)">
                              <span className="inline-flex items-center gap-2">
                                {ENVASE_LABEL[(serie.envaseBucket ?? 'otros') as EnvaseBucket] ?? serie.envaseBucket}
                                {serie.metodo === 'derivado' && (
                                  <span
                                    className="inline-block rounded-full border border-(--p-info-line) bg-(--p-info-soft) px-1.5 py-0.5 text-[10px] font-bold text-(--p-info)"
                                    title="Muy poca historia propia para confiar en un modelo entrenado sólo sobre este formato — se repartió el forecast del producto según qué % de él fue este formato recientemente."
                                  >
                                    derivado
                                  </span>
                                )}
                              </span>
                            </td>
                            <td className="px-4 py-2.5">
                              {serie.categoria && (
                                <span className={`rounded-full border px-2 py-0.5 text-xs font-bold capitalize ${
                                  serie.categoria === 'cerveza' ? 'border-(--p-ok-line) bg-(--p-ok-soft) text-(--p-ok)' : 'border-(--p-warn-line) bg-(--p-warn-soft) text-(--p-warn)'
                                }`}>
                                  {serie.categoria}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-right tabular-nums text-(--p-text-2)">
                              {serie.litrosMesEnCurso > 0 ? valorSerie(serie, serie.litrosMesEnCurso) : <span className="text-(--p-text-4)">—</span>}
                            </td>
                            <td className="px-4 py-2.5 text-right font-bold tabular-nums text-(--p-text)">
                              {proximo ? valorSerie(serie, proximo.litros) : <span className="text-(--p-text-4)">sin datos</span>}
                            </td>
                            <td className="px-6 py-2.5 text-center">
                              <ChipDesviacion mape={serie.mape} derivado={serie.metodo === 'derivado'} />
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
  )
}
