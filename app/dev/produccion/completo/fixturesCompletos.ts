import type { ProduccionProps } from '@/app/produccion/useProduccion'
import type { SerieForecast, StockSeguridadItem, LotePlan, LoteCerrado, RecetaInsumoLinea } from '@/app/produccion/page'
import { cicloEnCursoISO, inicioDeCiclo, esDiaHabilISO } from '@/lib/produccion/reglas'
import { CONFIG, FERMENTADORES, PLAN } from '../fixtures'

/* Datos inventados para ver el módulo entero en el banco de pruebas. Los
   productos y tanques son los reales (el layout depende de sus nombres); los
   números son de mentira, elegidos para que aparezcan los tres estados del
   semáforo (urgente, reponer, cubierto) y un lote vencido. */

const DIA = 86_400_000
const isoDe = (ms: number) => new Date(ms).toISOString().slice(0, 10)
const sumarMeses = (mesISO: string, n: number) => {
  const [y, m] = mesISO.split('-').map(Number)
  return isoDe(Date.UTC(y, m - 1 + n, 1))
}

export type ModoDatos = 'normal' | 'peor' | 'vacio' | 'uno'

/** Datos del banco de pruebas en cuatro versiones (break-ui):
 *  - normal: lo de siempre.
 *  - peor: nombres largos REALES (la receta "Kombucha Experimental Piña Albahaca"
 *    existe; el resto sigue el mismo patrón de colaboraciones y ediciones),
 *    un tanque con la descripción completa del ERP, motivos largos y más lotes.
 *  - vacio: sin forecast, plan, stock ni historial.
 *  - uno: un solo producto, un solo lote (pluralizaciones y listas de un elemento). */
export function propsCompletos(modo: ModoDatos = 'normal'): ProduccionProps {
  const base = propsNormales()
  if (modo === 'normal') return base
  if (modo === 'vacio') {
    return { ...base, series: [], calidad: [], planProduccion: [], configProductos: [], stock: [], stockSeguridad: [], stockInsumos: [], recetaInsumos: [], lotesCerrados: [], historialStock: [], envase: base.envase.map(e => ({ ...e, precioUnitario: null, stockUnidades: null })), ultimaCorrida: null, minutosDesdeSyncStock: null }
  }
  if (modo === 'uno') {
    const prod = 'Mocho English'
    return {
      ...base,
      series: base.series.filter(x => x.nivel === 'general' || x.producto === prod),
      configProductos: base.configProductos.filter(c => c.producto === prod),
      planProduccion: base.planProduccion.filter(l => l.producto === prod).slice(0, 1),
      stockSeguridad: base.stockSeguridad.filter(x => x.producto === prod),
      stock: base.stock.filter(x => x.producto === prod),
      lotesCerrados: base.lotesCerrados.slice(0, 1),
      historialStock: base.historialStock.filter(h => h.producto === prod),
      recetaInsumos: base.recetaInsumos.filter(r => r.producto === prod),
    }
  }
  // peor caso: se renombra en todo el árbol de props de una vez
  const nombres: [string, string][] = [
    ['Mocho English', 'Mocho English Strong Ale Edición Barrica Aniversario'],
    ['Kombucha Maracuyá Cardamomo', 'Kombucha Experimental Piña Albahaca y Maracuyá'],
    ['Red IPA', 'Doble Hazy IPA Colaboración Maestranza Sur'],
    ['Fermentador T13', 'Fermentador Inox T13 (Unitank Cónico 1700 L)'],
  ]
  let json = JSON.stringify(base)
  for (const [a, b] of nombres) json = json.split(`"${a}"`).join(`"${b}"`).split(a).join(b)
  const out = JSON.parse(json) as ProduccionProps
  out.planProduccion = [
    ...out.planProduccion.map(l => ({ ...l, motivo: l.motivo ?? 'Confirmado desde la necesidad mensual de 2026-11 para cubrir la temporada alta y el evento corporativo de fin de año' })),
    ...Array.from({ length: 8 }, (_, i): LotePlan => ({
      id: `x${i}`, producto: i % 2 ? 'La Barra APA' : 'Kombucha Berry Menta', categoria: i % 2 ? 'cerveza' : 'kombucha',
      litrosPlanificados: 1200 + i * 130, fechaPlanificada: isoDe(Date.parse(`${isoDe(Date.now())}T00:00:00Z`) + (i + 1) * 3 * DIA), prioridad: 10 + i,
      estado: 'planificado', origen: i % 3 ? 'sugerido' : 'manual', motivo: null, observaciones: null, fermentador: null, diasOcupacion: null,
      fechaInicioReal: null, fechaFinReal: null, litrosReales: null,
    })),
  ]
  // un producto con volumen alto (12.000 L/mes ya es el techo realista de la planta)
  out.series = out.series.map(x => (x.producto === 'Mocho English Strong Ale Edición Barrica Aniversario' && x.nivel === 'producto'
    ? { ...x, puntos: x.puntos.map(pt => ({ ...pt, litros: pt.litros * 6, litrosMin: pt.litrosMin == null ? null : pt.litrosMin * 6, litrosMax: pt.litrosMax == null ? null : pt.litrosMax * 6 })) } : x))
  return out
}

function propsNormales(): ProduccionProps {
  const hoy = new Date()
  const hoyISO = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`
  const ciclo = cicloEnCursoISO()
  let transcurridos = 0, total = 0
  for (let t = Date.parse(`${inicioDeCiclo(ciclo)}T00:00:00Z`), i = 0; i < 31; i++, t += DIA) {
    const d = isoDe(t)
    if (!esDiaHabilISO(d)) continue
    total++
    if (d <= hoyISO) transcurridos++
  }
  const historico = Array.from({ length: 12 }, (_, i) => sumarMeses(ciclo, i - 12))
  const futuros = Array.from({ length: 6 }, (_, i) => sumarMeses(ciclo, i + 1))

  const estacional = (mes: string) => [1.35, 1.3, 1.1, 0.95, 0.85, 0.8, 0.8, 0.85, 0.9, 1, 1.1, 1.3][Number(mes.slice(5, 7)) - 1]
  const serie = (id: string, nivel: SerieForecast['nivel'], producto: string | null, envase: string | null, categoria: string | null, base: number, mape: number): SerieForecast => ({
    id, nivel, clave: producto && envase ? `${producto}::${envase}` : producto, label: [producto ?? 'Consolidado', envase].filter(Boolean).join(' — '),
    producto, envaseBucket: envase, categoria,
    puntos: [
      ...historico.map(mes => ({ mes, tipo: 'historico' as const, litros: Math.round(base * estacional(mes) * (0.9 + ((mes.charCodeAt(6) % 5) / 25))), litrosMin: null, litrosMax: null, tendencia: base, estacionalidad: base * (estacional(mes) - 1) })),
      ...futuros.map(mes => {
        const litros = Math.round(base * estacional(mes))
        return { mes, tipo: 'forecast' as const, litros, litrosMin: Math.round(litros * 0.78), litrosMax: Math.round(litros * 1.24), tendencia: base, estacionalidad: base * (estacional(mes) - 1) }
      }),
    ],
    mae: base * 0.15, mape, mesesHistorial: 30, metodo: 'propio',
    litrosMesEnCurso: Math.round((base / total) * transcurridos * 1.05),
    precioNetoLitro: categoria === 'kombucha' ? 2600 : 3800, precioFuente: 'propio',
  })

  const series: SerieForecast[] = []
  const stockSeguridad: StockSeguridadItem[] = []
  // stock (litros) por producto: barril, lata — para forzar estados distintos
  const stockDe: Record<string, [number, number]> = {
    'Mocho English': [90, 300], 'Red IPA': [1400, 900], 'Ámbar Lager': [600, 0], 'Aguas Blancas': [380, 140],
    'La Barra APA': [1800, 700], 'Kombucha Berry Menta': [120, 260], 'Kombucha Detox': [700, 500], 'Kombucha Maracuyá Cardamomo': [260, 90],
  }
  let total1 = 0
  CONFIG.forEach((c, i) => {
    const base = 700 + i * 180
    total1 += base
    series.push(serie(`p-${i}`, 'producto', c.producto, null, c.categoria, base, 15 + i * 4))
    const envases: [string, number][] = [['barril_30', 0.55], ['lata', 0.45]]
    envases.forEach(([env, frac], j) => {
      series.push(serie(`pe-${i}-${j}`, 'producto_envase', c.producto, env, c.categoria, base * frac, 18 + i * 4))
      const stock = stockDe[c.producto]?.[j] ?? 300
      const ml = c.categoria === 'kombucha' ? 0.354 : 0.473
      for (const [k, mes] of [ciclo, ...futuros.slice(0, 3)].entries()) {
        stockSeguridad.push({
          nivel: 'producto_envase', producto: c.producto, envase: env, categoria: c.categoria, mes,
          leadTimeSemanas: c.categoria === 'cerveza' ? 4 : 3, periodoRevisionSemanas: 4.35,
          demandaMensualProyectada: base * frac, demandaEnVentana: base * frac * 2, sigmaSemanal: 30,
          stockSeguridadLitros: Math.round(base * frac * 0.35), puntoReordenLitros: Math.round(base * frac * 1.6),
          confianza: 'media', mapeBacktest: 20, mesesHistorial: 30, metodo: 'propio',
          stockActualLitros: k === 0 ? stock : null, stockActualUnidades: k === 0 ? Math.round(stock / (env === 'lata' ? ml : 30)) : null,
          litrosEnProduccion: k === 0 && c.producto === 'Red IPA' && env === 'barril_30' ? 600 : 0,
        })
      }
    })
  })
  series.unshift(serie('general', 'general', null, null, null, total1, 14))

  const plan: LotePlan[] = [
    ...PLAN,
    { id: 'p3', producto: 'Kombucha Lemon', categoria: 'kombucha', litrosPlanificados: 2000, fechaPlanificada: isoDe(Date.parse(`${hoyISO}T00:00:00Z`) - 9 * DIA), prioridad: 2, estado: 'planificado', origen: 'sugerido', motivo: null, observaciones: null, fermentador: 'Fermentador K-3', diasOcupacion: 12, fechaInicioReal: null, fechaFinReal: null, litrosReales: null },
    { id: 'p4', producto: 'Aguas Blancas', categoria: 'cerveza', litrosPlanificados: 1700, fechaPlanificada: isoDe(Date.parse(`${hoyISO}T00:00:00Z`) - 6 * DIA), prioridad: 3, estado: 'en_curso', origen: 'manual', motivo: null, observaciones: null, fermentador: 'Fermentador T13', diasOcupacion: 21, fechaInicioReal: isoDe(Date.parse(`${hoyISO}T00:00:00Z`) - 6 * DIA), fechaFinReal: null, litrosReales: null },
  ]
  const lotesCerrados: LoteCerrado[] = [
    { id: 'c1', producto: 'Mocho English', categoria: 'cerveza', estado: 'completado', litrosPlanificados: 1500, litrosReales: 1420, fechaPlanificada: isoDe(Date.parse(`${hoyISO}T00:00:00Z`) - 30 * DIA), fechaInicioReal: isoDe(Date.parse(`${hoyISO}T00:00:00Z`) - 29 * DIA), fechaFinReal: isoDe(Date.parse(`${hoyISO}T00:00:00Z`) - 5 * DIA), actualizadoAt: hoyISO },
    { id: 'c2', producto: 'Kombucha Detox', categoria: 'kombucha', estado: 'cancelado', litrosPlanificados: 1200, litrosReales: null, fechaPlanificada: isoDe(Date.parse(`${hoyISO}T00:00:00Z`) - 20 * DIA), fechaInicioReal: null, fechaFinReal: null, actualizadoAt: hoyISO },
  ]

  const tanques = FERMENTADORES.map(f => ({ tanque: f.nombre, tipo: f.tipo, categoria: f.categoria, capacidadLitros: f.capacidadLitros, litros: f.litrosActuales, libreLitros: f.capacidadLitros - f.litrosActuales }))
  const cap = tanques.reduce((s, t) => s + t.capacidadLitros, 0)
  const lit = tanques.reduce((s, t) => s + t.litros, 0)

  return {
    series,
    calidad: [
      { tipo: 'respaldo', clave: 'Kombucha Detox', detalle: '"Kombucha Detox": el modelo erraba 132% en el backtest; se proyecta el promedio de los últimos 3 meses.', severidad: 'advertencia' },
      { tipo: 'ciclo', clave: null, detalle: 'Los "meses" del forecast son ciclos internos (24 al 23).', severidad: 'info' },
    ],
    planProduccion: plan,
    configProductos: CONFIG.map(c => ({ producto: c.producto, categoria: c.categoria, diasFermentacion: c.diasFermentacion, litrosObjetivo: c.litrosObjetivo, color: c.color })),
    sugerenciasPlan: [],
    splitFermentadores: [],
    ritmoRealPorProducto: {},
    ajustesTanque: [],
    ocupacionPlanta: { litrosEnFermentacion: lit, fermentadoresOcupados: tanques.filter(t => t.litros > 0).length, capacidadTotalLitros: cap, litrosLibres: cap - lit, porcentajeOcupacion: Math.round((lit / cap) * 1000) / 10, tanques },
    necesidadInsumos: [],
    stockInsumos: [
      { insumo: 'Malta Pale Ale', categoria: 'malta', unidadBase: 'gr', disponible: 250000, precioUnitario: 1.1, valorizado: 275000 },
      { insumo: 'Lúpulo Citra', categoria: 'lupulo', unidadBase: 'gr', disponible: 2000, precioUnitario: 45, valorizado: 90000 },
      { insumo: 'Té negro', categoria: 'otros', unidadBase: 'gr', disponible: 8000, precioUnitario: 12, valorizado: 96000 },
    ],
    recetaInsumos: CONFIG.flatMap((c): RecetaInsumoLinea[] => c.categoria === 'cerveza'
      ? [
        { producto: c.producto, litrosBase: 1000, insumo: 'Malta Pale Ale', categoria: 'malta' as const, unidadBase: 'gr' as const, cantidadPorLote: 180000, precioUnitario: 1.1 },
        { producto: c.producto, litrosBase: 1000, insumo: 'Lúpulo Citra', categoria: 'lupulo' as const, unidadBase: 'gr' as const, cantidadPorLote: 3000, precioUnitario: 45 },
      ]
      : [{ producto: c.producto, litrosBase: 1000, insumo: 'Té negro', categoria: 'otros' as const, unidadBase: 'gr' as const, cantidadPorLote: 6000, precioUnitario: 12 }]),
    lotesSinReceta: [],
    stock: [
      { producto: 'Red IPA', categoria: 'cerveza', envaseBucket: 'barril_30', camara: 'Frío Planta (Frío)', cantidad: 47, litros: 1400 },
      { producto: 'Mocho English', categoria: 'cerveza', envaseBucket: 'lata', camara: 'Latas FIFO', cantidad: 634, litros: 300 },
    ],
    stockSeguridad,
    ultimaCorrida: `${hoyISO}T08:00:00Z`,
    minutosDesdeSyncStock: 42,
    avanceMes: { mes: ciclo, diaActual: 10, diasEnMes: 30, diasHabilesTranscurridos: transcurridos, diasHabilesEnCiclo: total },
    lotesCerrados,
    envase: [
      { clave: 'etiqueta_354', nombre: 'Etiqueta lata 354 ml', tipo: 'etiqueta', ml: 354, porLata: 1, precioUnitario: null, stockUnidades: null },
      { clave: 'etiqueta_473', nombre: 'Etiqueta lata 473 ml', tipo: 'etiqueta', ml: 473, porLata: 1, precioUnitario: 38, stockUnidades: 4000 },
      { clave: 'lata_354', nombre: 'Lata 354 ml', tipo: 'lata', ml: 354, porLata: 1, precioUnitario: 160, stockUnidades: 2000 },
      { clave: 'lata_473', nombre: 'Lata 473 ml', tipo: 'lata', ml: 473, porLata: 1, precioUnitario: 185, stockUnidades: 6000 },
      { clave: 'tapa', nombre: 'Tapa de lata', tipo: 'tapa', ml: null, porLata: 1, precioUnitario: 22, stockUnidades: 5000 },
    ],
    historialStock: [
      { fecha: isoDe(Date.parse(`${hoyISO}T00:00:00Z`) - DIA), producto: 'Mocho English', barrilLitros: 0, lataLitros: 320 },
      { fecha: hoyISO, producto: 'Mocho English', barrilLitros: 90, lataLitros: 300 },
      { fecha: hoyISO, producto: 'Aguas Blancas', barrilLitros: 380, lataLitros: 140 },
    ],
    mlLataPorProducto: {},
    esAdmin: true,
    nombreUsuario: 'Banco de pruebas',
    inicialesUsuario: 'BP',
  }
}
