import { redirect } from 'next/navigation'
import { getServerUser } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { construirCajaCobrada, construirEscenarios } from '@/lib/administracion/cajaCobradaDatos'
import { PARAMETROS_CAJA } from '@/lib/administracion/cajaCobrada'
import { cicloEnCursoISO, inicioDeCiclo, finDeCiclo } from '@/lib/produccion/reglas'
import { armarDatosCalendario, type DatosCalendario } from '@/lib/administracion/calendarioEntradas'
import { resumenMensualForecast, type MesForecast } from '@/lib/administracion/forecastMensual'
import {
  esIngresoReal, normalizarNombreCliente, brutoDeFila, lunesDe,
  categoriaNormalizada, BANCOS, type FilaVentaFinanzas, type BancoId,
} from '@/lib/administracion/finanzas'
import { semanasRodantes, calcularDiasPagoProveedores, type EntradaCompra } from '@/lib/administracion/flujoSemanal'
import { proyectarCobros, type ProyeccionCobros, type PlazoCliente } from '@/lib/administracion/proyeccionCobros'
import { vendedorCanonico, grupoCarteraDe, CLIENTES_FORECAST_INDIVIDUAL, NOMBRE_RESTAURANTE_FORECAST, NOMBRE_COMPRAS_TOTAL } from '@/lib/types'
import { maquilaVencidaDe, type FilaVenta } from '@/lib/cobranza'
import { barrilesFueraPorCartera } from '@/lib/barrilesFuera'
import AdministracionClient from './AdministracionClient'
import type { FrescuraDato } from './CajaSection'

export const dynamic = 'force-dynamic'

/** Un punto de la serie de ingresos: histórico real o proyección del modelo. */
export interface PuntoFinanzas {
  mes: string
  tipo: 'historico' | 'forecast'
  monto: number
  montoMin: number | null
  montoMax: number | null
  tendencia: number | null
  estacionalidad: number | null
}

export interface SerieFinanzas {
  id: string
  nivel: 'general' | 'categoria' | 'cliente' | 'restaurante' | 'compra'
  clave: string | null
  puntos: PuntoFinanzas[]
  /** Error del backtest walk-forward a 1 mes, en %. null = no alcanzó el
   *  historial para validar. */
  mape: number | null
  mesesHistorial: number | null
  /** Venta neta del ciclo EN CURSO, calculada en vivo — el modelo excluye el
   *  ciclo abierto a propósito, así que este número no sale de él. */
  montoCicloEnCurso: number
}

/** Una semana de la pestaña Forecast, para UN cliente. `real` es venta ya
 *  ocurrida (fecha de pedido dentro de esa semana); `proyectado*` sale de
 *  repartir el forecast MENSUAL de Prophet (por ciclo interno) en días
 *  dentro de ese ciclo y agruparlos por semana — no es un modelo semanal
 *  propio, es el mismo forecast mensual visto a otra escala. */
export interface SemanaForecastCliente {
  /** yyyy-mm-dd del lunes ISO de la semana. */
  inicio: string
  real: number | null
  proyectado: number | null
  proyectadoMin: number | null
  proyectadoMax: number | null
}

export interface ForecastCliente {
  nombre: string
  mape: number | null
  mesesHistorial: number | null
  semanas: SemanaForecastCliente[]
  /** 'neto' (sin IVA): clientes de `ventas` y compras. 'bruto': el restaurante, que viene de boletas con IVA incluido. */
  unidad: 'neto' | 'bruto'
  /** Proyección por ciclo (24→23) con su rango y el mismo ciclo del año anterior. */
  meses: MesForecast[]
}

export interface AvanceCiclo {
  ciclo: string
  diaActual: number
  diasEnCiclo: number
  diasHabilesTranscurridos: number
  diasHabilesEnCiclo: number
}

export interface ResumenDeuda {
  /** Dato duro del informe de Deudores del ERP: plata que ya venció y no
   *  entró. No sale de nuestra proyección. */
  vencida: number
  clientes: number
  ultimaCarga: string | null
}

/** Saldo de un banco a una fecha — ver BancoId/BANCOS en finanzas.ts. */
export interface SaldoBanco {
  banco: BancoId
  fecha: string
  saldo: number
}


/** Una semana de plata que EFECTIVAMENTE entró (tabla `cobros_erp`). */
export interface SemanaCobro {
  /** Lunes de la semana, yyyy-mm-dd. */
  semana: string
  total: number
  /** metodo → monto. Los métodos vienen normalizados por el parser. */
  porMetodo: Record<string, number>
  movimientos: number
}

/** Cómo paga UN cliente, medido contra sus pagos reales cruzados con la guía. */
export interface ComportamientoPago {
  cliente: string
  /** Pagos cruzados con su guía. Menos de 3 y la mediana es ruido. */
  muestras: number
  /** Días de pago: mediana (lo que se le muestra a una persona), percentil 25
   *  para el escenario optimista y 75/90 para el malo, y el promedio, que es
   *  el que mejor proyecta plata según el backtest — ver BACKTEST_MAE_SEMANAL. */
  p25: number
  p50: number
  p75: number
  p90: number
  promedio: number
  montoCruzado: number
  ultimoPago: string
  /** Plazo declarado en el maestro de clientes — null si la ficha no lo trae. */
  declarado: number | null
}

/**
 * Ingreso real de caja y comportamiento de pago, ambos derivados de
 * `cobros_erp` (informe "Movimientos Cta. Cte." del ERP). Es lo único que
 * responde "cuánta plata entró de verdad" — el resto del módulo trabaja con
 * ventas despachadas y deuda, que son promesas, no caja.
 */
export interface DatosCobros {
  hayDatos: boolean
  semanas: SemanaCobro[]
  comportamiento: ComportamientoPago[]
  /** Últimas 4 semanas cerradas vs. las 4 anteriores, para la variación. */
  totalUltimas4: number
  totalPrevias4: number
  promedioSemanal: number
  /** Mediana de días de pago de toda la cartera, ponderada por cliente. */
  medianaGlobal: number | null
  /** Mediana del plazo DECLARADO, para contrastar con el real. */
  declaradaGlobal: number | null
  ultimaFecha: string | null
  /** Cuánto debería entrar las próximas semanas, cruzando lo impago con el
   *  comportamiento de pago real de cada cliente. */
  proyeccion: ProyeccionCobros
  /** Plata YA cobrada esta semana (lunes a hoy), de `semanasCobro` — a
   *  diferencia de `totalUltimas4`, que a propósito excluye la semana en
   *  curso por estar a medias, esto SÍ la incluye: es justo lo que hace
   *  falta para responder "¿cuánto entra esta semana?" sumando lo ya
   *  cobrado más lo que `proyeccion.semanas[0]` todavía espera para el
   *  resto de la semana. */
  confirmadoEstaSemana: number
  /** Datos para el calendario de entradas día por día (CalendarioSemana). */
  calendario: DatosCalendario
}

const MS_POR_DIA = 86_400_000

function esFinDeSemanaISO(iso: string): boolean {
  const dow = new Date(`${iso}T00:00:00Z`).getUTCDay()
  return dow === 0 || dow === 6
}

/** Corre una fecha ISO `n` días corridos. Pura a propósito (no lee el reloj):
 *  todo el módulo parte de `hoyISO`, que se calcula una sola vez. */
function correrDias(iso: string, n: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + n * MS_POR_DIA).toISOString().slice(0, 10)
}

function contarDiasHabilesISO(desdeISO: string, hastaISO: string): number {
  let n = 0
  for (let t = Date.parse(`${desdeISO}T00:00:00Z`); t <= Date.parse(`${hastaISO}T00:00:00Z`); t += MS_POR_DIA) {
    if (!esFinDeSemanaISO(new Date(t).toISOString().slice(0, 10))) n++
  }
  return n
}

/**
 * Módulo Administración y Finanzas — página "Finanzas". Solo administradores.
 *
 * Responde dos preguntas que el resto de la app no responde:
 *   · ¿Cuánta PLATA vamos a facturar? (mismo modelo Prophet que Producción,
 *     pero la unidad es la venta neta en $, no litros.)
 *   · ¿CUÁNDO entra esa plata a la caja? (días de pago del cliente aplicados
 *     sobre la fecha de entrega.)
 */
export default async function AdministracionPage() {
  const user = await getServerUser()
  if (!user) redirect('/login')
  if (!user.isAdmin) redirect('/')

  const admin = createAdminClient()
  const PAGE = 1000

  // ── Ciclo en curso (24 → 23), igual que Producción y la tabla de períodos ──
  const ciclo = cicloEnCursoISO()
  const inicioCiclo = inicioDeCiclo(ciclo)
  const finCiclo = finDeCiclo(ciclo)
  const hoyISO = new Date().toISOString().slice(0, 10)
  const diaActual = Math.floor((Date.parse(`${hoyISO}T00:00:00Z`) - Date.parse(`${inicioCiclo}T00:00:00Z`)) / MS_POR_DIA) + 1
  const diasEnCiclo = Math.floor((Date.parse(`${finCiclo}T00:00:00Z`) - Date.parse(`${inicioCiclo}T00:00:00Z`)) / MS_POR_DIA) + 1
  const avance: AvanceCiclo = {
    ciclo, diaActual, diasEnCiclo,
    diasHabilesTranscurridos: contarDiasHabilesISO(inicioCiclo, hoyISO),
    diasHabilesEnCiclo: contarDiasHabilesISO(inicioCiclo, finCiclo),
  }

  // Ventana de ventas a traer: cubre el ciclo en curso (para el MTD) y, hacia
  // atrás, el plazo de pago más largo del maestro de clientes (90 días) más un
  // margen — una entrega de hace 90 días con 90 de plazo recién vence hoy.
  const desdeVentana = new Date(Date.now() - 120 * MS_POR_DIA).toISOString().slice(0, 10)
  const desdeVentas = desdeVentana < inicioCiclo ? desdeVentana : inicioCiclo

  const [
    forecastRaw, validacionRaw, forecastLitrosRaw, ventasRaw, clientesRaw, deudoresRaw, ultimaCorridaRaw,
    saldosRaw, comprasRaw, ventasRestauranteRaw, comprasHistoricoRaw,
  ] = await Promise.all([
    (async () => {
      const filas: Record<string, unknown>[] = []
      for (let offset = 0; ; offset += PAGE) {
        const { data } = await admin.from('forecast_finanzas')
          .select('nivel, clave, mes, tipo, monto, monto_min, monto_max, tendencia, estacionalidad')
          .order('mes', { ascending: true }).range(offset, offset + PAGE - 1)
        if (!data || data.length === 0) break
        filas.push(...data)
        if (data.length < PAGE) break
      }
      return filas
    })(),
    admin.from('forecast_finanzas_validacion').select('nivel, clave, mape, meses_historial').then(r => r.data ?? []),
    // Forecast general de Producción en litros: la Caja valoriza la venta futura con él.
    admin.from('forecast_produccion').select('mes, tipo, litros').eq('nivel', 'general')
      .then(r => ((r.data ?? []) as { mes: string; tipo: string; litros: number }[])
        .map(f => ({ mes: String(f.mes).slice(0, 10), tipo: String(f.tipo), litros: Number(f.litros) || 0 }))),
    // La ventana de 120 días son ~17k filas y PostgREST corta en 1000: en
    // serie eso son 17 viajes encadenados (varios segundos de carga). Con el
    // count primero, las páginas se piden todas a la vez y el costo pasa a ser
    // el de la más lenta.
    (async () => {
      const { count } = await admin.from('ventas')
        .select('id', { count: 'exact', head: true })
        .gte('fecha_pedido', desdeVentas)
      const paginas = Math.ceil((count ?? 0) / PAGE)
      const lotes = await Promise.all(
        Array.from({ length: paginas }, (_, i) =>
          admin.from('ventas')
            .select('nombre_fantasia, producto, categoria_producto, envase, litros, total_sin_impuesto, fecha_pedido, fecha_entrega, entregado, numero_factura, fecha_entrega_estimada')
            .gte('fecha_pedido', desdeVentas)
            .order('id', { ascending: true })
            .range(i * PAGE, i * PAGE + PAGE - 1)
            .then(r => (r.data ?? []) as FilaVentaFinanzas[])
        )
      )
      return lotes.flat()
    })(),
    (async () => {
      const filas: { nombre_fantasia: string | null; dias_pago: number | null; dias_pago_real_mediana: number | null; dias_pago_real_muestras: number | null }[] = []
      for (let offset = 0; ; offset += PAGE) {
        const { data } = await admin.from('clientes')
          .select('nombre_fantasia, dias_pago, dias_pago_real_mediana, dias_pago_real_muestras')
          .order('id', { ascending: true }).range(offset, offset + PAGE - 1)
        if (!data || data.length === 0) break
        filas.push(...data)
        if (data.length < PAGE) break
      }
      return filas
    })(),
    admin.from('deudores').select('nombre_fantasia, vendedor, deuda_vencida, saldo_total, updated_at, ultimo_pago, deuda_menor_14_dias, deuda_entre_15_29_dias, deuda_entre_30_44_dias, deuda_entre_45_59_dias, deuda_entre_60_89_dias, deuda_mas_90_dias').then(r => r.data ?? []),
    admin.from('erp_sync_log').select('creado_at').eq('fuente', 'forecast_finanzas').eq('ok', true)
      .order('creado_at', { ascending: false }).limit(1).maybeSingle().then(r => r.data),
    // Sin límite: son 3 cuentas con carga manual/semanal, nunca va a ser una
    // tabla grande, y hace falta más de 2 filas totales para poder sacar
    // "el más reciente" Y "el anterior" de CADA banco por separado.
    admin.from('caja_saldos').select('fecha, saldo, banco')
      .order('fecha', { ascending: false }).then(r => r.data ?? []),
    admin.from('compras_comprometidas').select('monto, fecha_pago, fecha_documento, estado')
      .then(r => r.data ?? []),
    // Venta diaria del restaurante de BaseCamp (POS Toteat, cargada a mano —
    // ver ventas_restaurante) para el forecast individual y su MTD en vivo.
    // Misma ventana de 120 días que ventasRaw: alcanza y sobra para las 8
    // semanas hacia atrás que muestra la pestaña Forecast.
    admin.from('ventas_restaurante').select('fecha, monto')
      .gte('fecha', desdeVentas)
      .then(r => (r.data ?? []) as { fecha: string; monto: number }[]),
    // Compras por proveedor (compras_historico, cargada a mano) para el
    // forecast de Compras — misma ventana que ventasRaw.
    admin.from('compras_historico').select('fecha, proveedor, monto')
      .gte('fecha', desdeVentas)
      .then(r => (r.data ?? []) as { fecha: string; proveedor: string; monto: number }[]),
  ])

  // ── Deuda actual por cliente (antes /administracion/cobranza, absorbida acá
  // adentro de la pestaña Cobranza y Deuda — decisión del usuario, 15-sep-2026) ──
  const [{ data: deudoresDetalle }, { data: clientesVendedorRaw }, barrilesFuera] = await Promise.all([
    admin.from('deudores').select('*').order('deuda_vencida', { ascending: false }),
    admin.from('clientes').select('vendedor'),
    barrilesFueraPorCartera(admin),
  ])
  const maquilaPorCliente = await calcularMaquila(admin, deudoresDetalle ?? [])
  const clientesPorVendedor: Record<string, number> = {}
  for (const c of clientesVendedorRaw ?? []) {
    const key = vendedorCanonico(c.vendedor) || '__sin_vendedor__'
    clientesPorVendedor[key] = (clientesPorVendedor[key] ?? 0) + 1
  }

  /* ── Ingreso REAL de caja y comportamiento de pago ────────────────────────
     Sale de `cobros_erp` (informe "Movimientos Cta. Cte.", cargado desde
     /administracion/cargar-cobros). Se agrega en la base con dos RPCs en vez
     de traer las ~19 mil filas de pagos al servidor de Next: el detalle por
     pago no se muestra en ninguna pantalla, sólo el semanal y el resumen por
     cliente. */
  const desdeCobros = correrDias(hoyISO, -182)
  const [cobrosSemanaRaw, comportamientoRaw, impagasRaw, mostradorRaw, cobrosPorDiaRaw, pagosPonderadosRaw, cobradoMesRaw, cobrosMensualesRaw] = await Promise.all([
    admin.rpc('cobros_por_semana', { p_desde: desdeCobros })
      .then(r => (r.data ?? []) as { semana: string; metodo: string; monto: number; movimientos: number }[]),
    admin.rpc('comportamiento_pago_clientes', { p_min_muestras: 3 })
      .then(r => (r.data ?? []) as {
        cliente: string; muestras: number; p25: number; p50: number; p75: number; p90: number
        promedio: number; monto_cruzado: number; ultimo_pago: string
      }[]),
    // Facturas despachadas que todavía no aparecen pagadas — la misma ventana
    // de 120 días que `ventasRaw`, porque la proyección se arma con esas filas.
    admin.rpc('facturas_impagas', { p_desde: desdeVentas })
      .then(r => (r.data ?? []) as { numero_factura: string }[]),
    admin.rpc('cobro_mostrador_semanal', { p_semanas: 12 }).then(r => Number(r.data) || 0),
    // Pagos por DÍA (16 semanas): lo que ya entró en los días pasados de la semana y el
    // patrón por día de la semana del mostrador, para el calendario de entradas.
    admin.rpc('cobros_por_dia', { p_desde: correrDias(hoyISO, -112) })
      .then(r => ((r.data ?? []) as { fecha: string; tipo: string; monto: number }[])
        .map(f => ({ fecha: String(f.fecha).slice(0, 10), tipo: f.tipo, monto: Number(f.monto) || 0 }))),
    // Caja real cobrada: comportamiento de pago ponderado por monto (12 meses) y lo
    // cobrado por cliente en el mes calendario en curso.
    admin.rpc('comportamiento_pago_ponderado', { p_desde: correrDias(hoyISO, -PARAMETROS_CAJA.ventanaDias) })
      .then(r => ((r.data ?? []) as { cliente: string; pagos: number; monto: number; dias_ponderado: number }[])
        .map(p => ({ cliente: p.cliente, pagos: Number(p.pagos), monto: Number(p.monto), diasPonderado: Number(p.dias_ponderado) }))),
    admin.rpc('cobros_por_cliente', { p_desde: `${hoyISO.slice(0, 7)}-01` })
      .then(r => ((r.data ?? []) as { cliente: string; monto: number }[]).map(c => ({ cliente: c.cliente, monto: Number(c.monto) || 0 }))),
    // Escenarios: cobros por mes y cliente desde el mismo mes del año anterior (ritmo de EWU y comparación interanual).
    // ~300 clientes × 13 meses pasa las 1000 filas que corta PostgREST: se pide por páginas.
    (async () => {
      const filas: { mes: string; cliente: string; monto: number }[] = []
      for (let offset = 0; ; offset += PAGE) {
        const { data } = await admin.rpc('cobros_mensuales_por_cliente', { p_desde: `${Number(hoyISO.slice(0, 4)) - 1}-${hoyISO.slice(5, 7)}-01` })
          .order('mes').order('cliente').range(offset, offset + PAGE - 1)
        const lote = (data ?? []) as { mes: string; cliente: string; monto: number }[]
        filas.push(...lote.map(c => ({ mes: String(c.mes).slice(0, 10), cliente: c.cliente, monto: Number(c.monto) || 0 })))
        if (lote.length < PAGE) break
      }
      return filas
    })(),
  ])

  const semanasCobroMap = new Map<string, SemanaCobro>()
  for (const f of cobrosSemanaRaw) {
    const semana = String(f.semana).slice(0, 10)
    const acc = semanasCobroMap.get(semana) ?? { semana, total: 0, porMetodo: {}, movimientos: 0 }
    const monto = Number(f.monto) || 0
    acc.total += monto
    acc.porMetodo[f.metodo] = (acc.porMetodo[f.metodo] ?? 0) + monto
    acc.movimientos += Number(f.movimientos) || 0
    semanasCobroMap.set(semana, acc)
  }
  const semanasCobro = [...semanasCobroMap.values()].sort((a, b) => a.semana.localeCompare(b.semana))

  // El plazo declarado se saca del mismo maestro que ya está cargado arriba,
  // para poder mostrar lado a lado "lo que dice la ficha" contra "lo que pasa
  // en la realidad" — la brecha entre ambos es el hallazgo que justifica todo
  // este informe (declarado ~9 días vs. real ~13).
  const declaradoPorCliente = new Map<string, number | null>()
  for (const c of clientesRaw) {
    const k = normalizarNombreCliente(c.nombre_fantasia)
    if (k && !declaradoPorCliente.has(k)) declaradoPorCliente.set(k, c.dias_pago)
  }

  const comportamiento: ComportamientoPago[] = comportamientoRaw.map(c => ({
    cliente: c.cliente,
    muestras: Number(c.muestras),
    p25: Math.round(Number(c.p25)),
    p50: Math.round(Number(c.p50)),
    p75: Math.round(Number(c.p75)),
    p90: Math.round(Number(c.p90)),
    promedio: Math.round(Number(c.promedio)),
    montoCruzado: Number(c.monto_cruzado) || 0,
    ultimoPago: String(c.ultimo_pago).slice(0, 10),
    declarado: declaradoPorCliente.get(normalizarNombreCliente(c.cliente)) ?? null,
  }))

  const medianaDe = (xs: number[]): number | null => {
    if (xs.length === 0) return null
    const s = [...xs].sort((a, b) => a - b)
    const m = Math.floor(s.length / 2)
    return Math.round(s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2)
  }
  // Se excluye PDV del resumen de plazos: cobra al contado por definición, y
  // mezclarlo tira la mediana de toda la cartera a cero.
  const comportamientoCredito = comportamiento.filter(c => !/pdv/i.test(c.cliente))

  // "Últimas 4 semanas" toma sólo semanas CERRADAS: la semana en curso está a
  // medias y compararla contra semanas completas siempre muestra una caída
  // que no existe.
  const lunesEstaSemana = lunesDe(hoyISO)
  const semanasCerradas = semanasCobro.filter(s => s.semana < lunesEstaSemana)
  const ult4 = semanasCerradas.slice(-4)
  const prev4 = semanasCerradas.slice(-8, -4)

  // Mediana del plazo PACTADO de toda la cartera con ficha (excluyendo PDV,
  // que cobra al contado por definición) — fallback para `pactado` cuando un
  // cliente no tiene dias_pago cargado en su propia ficha. Eje DISTINTO de
  // `medianaCartera` (abajo): ese es sobre comportamiento MEDIDO (p50 de
  // cobros_erp); éste es sobre lo DECLARADO (clientes.dias_pago) — un
  // cliente puede tener uno sin el otro.
  const medianaPactadaCartera = medianaDe(
    clientesRaw
      .filter(c => !/pdv/i.test(c.nombre_fantasia ?? ''))
      .map(c => c.dias_pago)
      .filter((d): d is number => d != null)
  ) ?? 15

  /* Plazo por cliente para proyectar: manda el MEDIDO (mediana de sus pagos
     reales) y, si no lo hay, el declarado en la ficha. Para el escenario
     lento se usa su p75 y para el optimista su p25; cuando sólo hay plazo
     declarado no existen esos percentiles, así que se les aplica un margen
     proporcional (30% más lento / 30% más rápido) en vez de inventar una
     dispersión que no se midió.

     `pactado` es un eje aparte: siempre el declarado de la ficha
     (`declaradoPorCliente`), exista o no comportamiento medido para este
     cliente — un cliente puede tener plazo pactado sin historial de pagos
     todavía (cliente nuevo) o historial sin ficha con plazo cargado. */
  const plazoPorCliente = new Map<string, PlazoCliente>()
  for (const c of comportamiento) {
    const k = normalizarNombreCliente(c.cliente)
    const pactado = declaradoPorCliente.get(k) ?? medianaPactadaCartera
    plazoPorCliente.set(k, { promedio: c.promedio, p25: c.p25, p75: c.p75, pactado, fuente: 'medido' })
  }
  for (const c of clientesRaw) {
    const k = normalizarNombreCliente(c.nombre_fantasia)
    if (!k || plazoPorCliente.has(k) || c.dias_pago == null) continue
    plazoPorCliente.set(k, {
      promedio: c.dias_pago,
      p25: Math.max(1, Math.round(c.dias_pago * 0.7)),
      p75: Math.round(c.dias_pago * 1.3),
      pactado: c.dias_pago,
      fuente: 'declarado',
    })
  }

  // Saldo por cliente del informe Deudores: descarta las facturas sin pago
  // cruzado que el ERP ya da por pagadas (ver recortarContraSaldoErp).
  const saldosErp = new Map<string, number>()
  let cargaDeudores = ''
  for (const d of deudoresRaw) {
    const k = normalizarNombreCliente(d.nombre_fantasia)
    if (k) saldosErp.set(k, (saldosErp.get(k) ?? 0) + (Number(d.saldo_total) || 0))
    const carga = String(d.updated_at ?? '').slice(0, 10)
    if (carga > cargaDeudores) cargaDeudores = carga
  }

  const medianaCartera = medianaDe(comportamientoCredito.map(c => c.p50)) ?? 15
  const proyeccion = proyectarCobros({
    ventas: ventasRaw,
    facturasImpagas: new Set(impagasRaw.map(f => f.numero_factura)),
    saldoErp: saldosErp.size > 0 && cargaDeudores ? { saldos: saldosErp, cargadoISO: cargaDeudores } : null,
    plazoPorCliente,
    plazoPorDefecto: medianaCartera,
    hoyISO,
    mostradorSemanal: mostradorRaw,
  })

  // Sin `calendario` todavía: necesita el forecast del restaurante, que se arma más abajo.
  const cobros: Omit<DatosCobros, 'calendario'> = {
    hayDatos: semanasCobro.length > 0,
    proyeccion,
    semanas: semanasCobro,
    comportamiento,
    totalUltimas4: ult4.reduce((s, x) => s + x.total, 0),
    totalPrevias4: prev4.reduce((s, x) => s + x.total, 0),
    promedioSemanal: semanasCerradas.length > 0
      ? semanasCerradas.slice(-12).reduce((s, x) => s + x.total, 0) / Math.min(12, semanasCerradas.length)
      : 0,
    medianaGlobal: medianaDe(comportamientoCredito.map(c => c.p50)),
    declaradaGlobal: medianaDe(
      comportamientoCredito.map(c => c.declarado).filter((d): d is number => d != null)
    ),
    ultimaFecha: semanasCobro.length > 0 ? semanasCobro[semanasCobro.length - 1].semana : null,
    confirmadoEstaSemana: semanasCobro.find(s => s.semana === lunesEstaSemana)?.total ?? 0,
  }

  // ── Series del modelo ──────────────────────────────────────────────────────
  const mapeaPunto = (f: Record<string, unknown>): PuntoFinanzas => ({
    mes: String(f.mes).slice(0, 10),
    tipo: f.tipo as 'historico' | 'forecast',
    monto: Number(f.monto),
    montoMin: f.monto_min != null ? Number(f.monto_min) : null,
    montoMax: f.monto_max != null ? Number(f.monto_max) : null,
    tendencia: f.tendencia != null ? Number(f.tendencia) : null,
    estacionalidad: f.estacionalidad != null ? Number(f.estacionalidad) : null,
  })

  const porSerie = new Map<string, PuntoFinanzas[]>()
  for (const f of forecastRaw) {
    const clave = `${f.nivel}::${f.clave ?? ''}`
    if (!porSerie.has(clave)) porSerie.set(clave, [])
    porSerie.get(clave)!.push(mapeaPunto(f))
  }

  const validacionPorSerie = new Map(
    validacionRaw.map(v => [`${v.nivel}::${v.clave ?? ''}`, v])
  )

  // Venta neta del ciclo en curso, por serie — en vivo, por fecha de PEDIDO
  // (mismo criterio que la serie histórica que alimenta el modelo).
  const mtdGeneral = { neto: 0, bruto: 0 }
  const mtdPorCategoria = new Map<string, number>()
  // Igual que mtdPorCategoria pero por CLIENTE exacto — sólo para los de
  // CLIENTES_FORECAST_INDIVIDUAL (hoy Cliente PDV). No pasa por esIngresoReal
  // otra vez: ya se evaluó arriba: si el cliente está en la lista y llegó
  // hasta acá, ya sabemos que cuenta como ingreso.
  const mtdPorCliente = new Map<string, number>()
  for (const v of ventasRaw) {
    if (!v.fecha_pedido || v.fecha_pedido < inicioCiclo || v.fecha_pedido > finCiclo) continue
    if (!esIngresoReal(v)) continue
    const neto = Number(v.total_sin_impuesto) || 0
    if (neto === 0) continue
    mtdGeneral.neto += neto
    mtdGeneral.bruto += brutoDeFila(v)
    const cat = categoriaNormalizada(v.producto, v.categoria_producto)
    mtdPorCategoria.set(cat, (mtdPorCategoria.get(cat) ?? 0) + neto)
    if (v.nombre_fantasia && CLIENTES_FORECAST_INDIVIDUAL.includes(v.nombre_fantasia)) {
      mtdPorCliente.set(v.nombre_fantasia, (mtdPorCliente.get(v.nombre_fantasia) ?? 0) + neto)
    }
  }

  // Venta del restaurante en lo que va del ciclo — de ventas_restaurante, no
  // de ventasRaw (otra tabla). El monto ya es bruto (boleta), no neto como
  // el resto de estos MTD, pero montoCicloEnCurso sólo se usa para compararlo
  // contra el forecast de LA MISMA serie, que también corrió sobre este
  // monto bruto — no hace falta que las unidades calcen entre series.
  let mtdRestaurante = 0
  for (const r of ventasRestauranteRaw) {
    if (r.fecha < inicioCiclo || r.fecha > finCiclo) continue
    mtdRestaurante += Number(r.monto) || 0
  }

  // Compra del ciclo en curso, general y por proveedor.
  const mtdComprasPorProveedor = new Map<string, number>()
  let mtdComprasGeneral = 0
  for (const c of comprasHistoricoRaw) {
    if (c.fecha < inicioCiclo || c.fecha > finCiclo) continue
    const monto = Number(c.monto) || 0
    mtdComprasGeneral += monto
    mtdComprasPorProveedor.set(c.proveedor, (mtdComprasPorProveedor.get(c.proveedor) ?? 0) + monto)
  }

  const series: SerieFinanzas[] = [...porSerie.entries()].map(([id, puntos]) => {
    const [nivel, claveRaw] = id.split('::')
    const clave = claveRaw || null
    const val = validacionPorSerie.get(id)
    const montoCicloEnCurso = nivel === 'general' ? mtdGeneral.neto
      : nivel === 'cliente' ? (mtdPorCliente.get(clave ?? '') ?? 0)
      : nivel === 'restaurante' ? mtdRestaurante
      : nivel === 'compra' ? (clave === NOMBRE_COMPRAS_TOTAL ? mtdComprasGeneral : (mtdComprasPorProveedor.get(clave ?? '') ?? 0))
      : (mtdPorCategoria.get(clave ?? '') ?? 0)
    return {
      id, nivel: nivel as 'general' | 'categoria' | 'cliente' | 'restaurante' | 'compra', clave,
      puntos: puntos.sort((a, b) => a.mes.localeCompare(b.mes)),
      mape: val?.mape != null ? Number(val.mape) : null,
      mesesHistorial: val?.meses_historial != null ? Number(val.meses_historial) : null,
      montoCicloEnCurso,
    }
  })

  // Sólo la cartera de venta (las 4 carteras + la de Claudio), mismo universo que
  // DeudaClienteSection: el informe Deudores trae además cuentas internas
  // (vendedor CERVECERÍA: Marketing, PDV, BaseCamp, Feria, mermas) e incobrables.
  // Sumándolas, esta tarjeta mostraba $91,4 M de vencido contra $30,4 M reales
  // (auditoría del 2-oct-2026).
  const deudoresCartera = deudoresRaw.filter(d => grupoCarteraDe(d.vendedor) === 'vendedor')
  const deuda: ResumenDeuda = {
    vencida: deudoresCartera.reduce((s, d) => s + (Number(d.deuda_vencida) || 0), 0),
    clientes: deudoresCartera.filter(d => (Number(d.deuda_vencida) || 0) > 0).length,
    ultimaCarga: deudoresRaw.reduce<string | null>((max, d) => {
      const u = d.updated_at as string | null
      return u && (!max || u > max) ? u : max
    }, null),
  }

  const lunesDeFecha = (iso: string) => {
    const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
    const dt = new Date(Date.UTC(y, m - 1, d))
    const dow = dt.getUTCDay()
    return new Date(dt.getTime() + (dow === 0 ? -6 : 1 - dow) * MS_POR_DIA).toISOString().slice(0, 10)
  }

  const compras = comprasRaw as unknown as EntradaCompra[]

  // saldosRaw ya viene ordenado por fecha desc (ver la query arriba). Agrupar
  // por banco y tomar las 2 primeras filas de cada uno da "el más reciente" y
  // "el anterior" SIN asumir que los 3 bancos se cargan el mismo día — cada
  // cuenta puede tener su propia fecha de última carga.
  const filasPorBanco = new Map<BancoId, { fecha: string; saldo: number }[]>()
  for (const s of saldosRaw as { fecha: string; saldo: number; banco: string }[]) {
    if (!BANCOS.includes(s.banco as BancoId)) continue
    const arr = filasPorBanco.get(s.banco as BancoId) ?? []
    arr.push({ fecha: String(s.fecha), saldo: Number(s.saldo) })
    filasPorBanco.set(s.banco as BancoId, arr)
  }

  const masRecientePorBanco: SaldoBanco[] = []
  let totalActual = 0
  let fechaMasVieja: string | null = null
  for (const banco of BANCOS) {
    const fila = filasPorBanco.get(banco)?.[0]
    if (!fila) continue
    masRecientePorBanco.push({ banco, fecha: fila.fecha, saldo: fila.saldo })
    totalActual += fila.saldo
    if (fechaMasVieja == null || fila.fecha < fechaMasVieja) fechaMasVieja = fila.fecha
  }
  const saldoActual = masRecientePorBanco.length > 0
    ? { fecha: fechaMasVieja!, total: totalActual, porBanco: masRecientePorBanco }
    : null

  // ── Forecast individual (pestaña "Forecast") ────────────────────────────────
  // 8 semanas atrás (venta real, para ver la tendencia) + 16 adelante
  // (proyección repartida desde el forecast mensual de Prophet). Mismo
  // reparto de mes→semana para cualquier serie forecasteada, sea cliente de
  // `ventas` (PDV) o el restaurante (ventas_restaurante) — sólo cambia de
  // dónde sale el mapa de `reales`.
  //
  // 16 semanas adelante (antes 8, que cortaban a fines de noviembre): pedido el
  // 2-oct-2026 poder ver al menos diciembre 2026 de Cliente PDV y BaseCamp.
  // El modelo ya proyecta 8 meses (hasta may-2027), así que el límite era sólo
  // esta ventana; 16 semanas desde hoy cubren todo diciembre con margen y se
  // corren solas con el tiempo. Más allá de eso el gráfico semanal no aporta:
  // dentro de un ciclo las semanas valen casi lo mismo (ver `meses`).
  const semanasForecastCliente = semanasRodantes(hoyISO, 8, 16)

  function repartirForecastEnSemanas(puntos: PuntoFinanzas[]): Map<string, { monto: number; min: number; max: number }> {
    const proyectados = new Map<string, { monto: number; min: number; max: number }>()
    for (const p of puntos) {
      if (p.tipo !== 'forecast') continue
      const inicioC = inicioDeCiclo(p.mes)
      const finC = finDeCiclo(p.mes)
      const diasC = Math.floor((Date.parse(`${finC}T00:00:00Z`) - Date.parse(`${inicioC}T00:00:00Z`)) / MS_POR_DIA) + 1
      if (diasC <= 0) continue
      const porDia = p.monto / diasC
      const porDiaMin = p.montoMin != null ? p.montoMin / diasC : porDia
      const porDiaMax = p.montoMax != null ? p.montoMax / diasC : porDia
      for (let d = 0; d < diasC; d++) {
        const dia = correrDias(inicioC, d)
        if (dia < hoyISO) continue
        const lunes = lunesDeFecha(dia)
        const acc = proyectados.get(lunes) ?? { monto: 0, min: 0, max: 0 }
        acc.monto += porDia
        acc.min += porDiaMin
        acc.max += porDiaMax
        proyectados.set(lunes, acc)
      }
    }
    return proyectados
  }

  function armarForecastCliente(nombre: string, serie: SerieFinanzas | undefined, reales: Map<string, number>, unidad: 'neto' | 'bruto' = 'neto'): ForecastCliente {
    const proyectados = repartirForecastEnSemanas(serie?.puntos ?? [])
    const semanas: SemanaForecastCliente[] = semanasForecastCliente.map(inicio => {
      const proy = proyectados.get(inicio)
      return {
        inicio,
        real: reales.has(inicio) ? Math.round(reales.get(inicio)!) : null,
        proyectado: proy ? Math.round(proy.monto) : null,
        proyectadoMin: proy ? Math.round(proy.min) : null,
        proyectadoMax: proy ? Math.round(proy.max) : null,
      }
    })
    return {
      nombre, mape: serie?.mape ?? null, mesesHistorial: serie?.mesesHistorial ?? null, semanas, unidad,
      meses: resumenMensualForecast(serie?.puntos ?? []),
    }
  }

  const forecastClientes: ForecastCliente[] = CLIENTES_FORECAST_INDIVIDUAL.map(nombre => {
    const reales = new Map<string, number>()
    for (const v of ventasRaw) {
      if (v.nombre_fantasia !== nombre) continue
      if (!esIngresoReal(v)) continue
      if (!v.fecha_pedido) continue
      const neto = Number(v.total_sin_impuesto) || 0
      if (neto === 0) continue
      const lunes = lunesDeFecha(v.fecha_pedido)
      reales.set(lunes, (reales.get(lunes) ?? 0) + neto)
    }
    return armarForecastCliente(nombre, series.find(s => s.nivel === 'cliente' && s.clave === nombre), reales)
  })

  // Restaurante de BaseCamp — misma mecánica, real desde ventas_restaurante.
  const realesRestaurante = new Map<string, number>()
  for (const r of ventasRestauranteRaw) {
    const lunes = lunesDeFecha(r.fecha)
    realesRestaurante.set(lunes, (realesRestaurante.get(lunes) ?? 0) + (Number(r.monto) || 0))
  }
  forecastClientes.push(armarForecastCliente(
    NOMBRE_RESTAURANTE_FORECAST,
    series.find(s => s.nivel === 'restaurante' && s.clave === NOMBRE_RESTAURANTE_FORECAST),
    realesRestaurante,
    // La boleta del Toteat ya trae IVA: el restaurante es la única serie en BRUTO.
    'bruto',
  ))

  // Calendario de entradas de la semana (CalendarioSemana): facturas por día esperado, mostrador
  // y BaseCamp repartidos con su patrón real por día de la semana.
  const calendario = armarDatosCalendario({
    hoyISO,
    cobrosPorDia: cobrosPorDiaRaw,
    ventasRestaurante: ventasRestauranteRaw.map(r => ({ fecha: String(r.fecha).slice(0, 10), monto: Number(r.monto) || 0 })),
    mostradorSemanal: mostradorRaw,
    forecastRestaurante: series.find(s => s.nivel === 'restaurante' && s.clave === NOMBRE_RESTAURANTE_FORECAST)?.puntos ?? [],
    inicioCiclo: inicioDeCiclo,
    finCiclo: finDeCiclo,
  })

  // Compras por proveedor — plata que SALE, no que entra. [0] = "Total
  // compras" (agregado real de TODOS los proveedores, no sólo los que
  // tienen modelo propio); el resto son las series con nivel='compra' que
  // el endpoint ya filtró a proveedores con presencia recurrente.
  const realesComprasTotal = new Map<string, number>()
  const realesComprasPorProveedor = new Map<string, Map<string, number>>()
  for (const c of comprasHistoricoRaw) {
    const lunes = lunesDeFecha(c.fecha)
    const monto = Number(c.monto) || 0
    realesComprasTotal.set(lunes, (realesComprasTotal.get(lunes) ?? 0) + monto)
    const acc = realesComprasPorProveedor.get(c.proveedor) ?? new Map<string, number>()
    acc.set(lunes, (acc.get(lunes) ?? 0) + monto)
    realesComprasPorProveedor.set(c.proveedor, acc)
  }
  const forecastCompras: ForecastCliente[] = [
    armarForecastCliente(NOMBRE_COMPRAS_TOTAL, series.find(s => s.nivel === 'compra' && s.clave === NOMBRE_COMPRAS_TOTAL), realesComprasTotal),
    ...series
      .filter(s => s.nivel === 'compra' && s.clave !== NOMBRE_COMPRAS_TOTAL)
      .sort((a, b) => {
        const totalA = a.puntos.filter(p => p.tipo === 'historico').reduce((s, p) => s + p.monto, 0)
        const totalB = b.puntos.filter(p => p.tipo === 'historico').reduce((s, p) => s + p.monto, 0)
        return totalB - totalA
      })
      .map(s => armarForecastCliente(s.clave!, s, realesComprasPorProveedor.get(s.clave!) ?? new Map())),
  ]

  // ── Caja real cobrada (pestaña Caja) ──
  const entradaCaja: Parameters<typeof construirCajaCobrada>[0] = {
    hoyISO,
    hastaISO: `${hoyISO.slice(0, 4)}-12-31`,
    ventas: ventasRaw,
    facturasImpagas: new Set(impagasRaw.map(f => f.numero_factura)),
    saldoErp: saldosErp.size > 0 && cargaDeudores ? { saldos: saldosErp, cargadoISO: cargaDeudores } : null,
    pagos: pagosPonderadosRaw,
    clientes: clientesRaw,
    deudores: deudoresRaw,
    pactadoPorDefecto: medianaPactadaCartera,
    // Un solo pronóstico de demanda: litros de Producción × precio real por litro (2-oct-2026).
    forecastLitros: forecastLitrosRaw,
    forecastGeneral: forecastRaw.filter(f => f.nivel === 'general')
      .map(f => ({ mes: String(f.mes).slice(0, 10), tipo: String(f.tipo), monto: Number(f.monto) || 0 })),
    inicioDeCiclo,
    finDeCiclo,
    comprasProyectadasSemana: new Map((forecastCompras[0]?.semanas ?? [])
      .filter(s => s.proyectado != null).map(s => [s.inicio, s.proyectado!] as [string, number])),
    comprasComprometidas: compras.map(c => ({ monto: Number(c.monto) || 0, fecha_pago: c.fecha_pago, estado: c.estado })),
    diasPagoProveedores: calcularDiasPagoProveedores(compras),
    mostradorSemanal: mostradorRaw,
    ventasRestaurante: ventasRestauranteRaw.map(r => ({ fecha: String(r.fecha).slice(0, 10), monto: Number(r.monto) || 0 })),
    saldoBanco: saldoActual?.total ?? null,
    cobradoMesPorCliente: cobradoMesRaw,
  }
  const cajaCobrada = construirCajaCobrada(entradaCaja)
  // Escenarios mensuales: base calibrado ± error medido del backtest.
  const escenariosCaja = construirEscenarios(cajaCobrada, cobrosMensualesRaw, hoyISO)

  // ── Datos al día (pestaña Caja): de qué fecha es cada fuente. Lo que se carga a
  // mano envejece sin aviso; acá se ve y se enlaza a donde se carga. ──
  const maxFecha = (xs: (string | null | undefined)[]) => xs.reduce<string | null>((m, x) => (x && (!m || x > m) ? String(x).slice(0, 10) : m), null)
  const diasDesde = (f: string | null) => (f ? Math.round((Date.parse(`${hoyISO}T00:00:00Z`) - Date.parse(`${f}T00:00:00Z`)) / MS_POR_DIA) : Infinity)
  const estadoPor = (f: string | null, maxDias: number): FrescuraDato['estado'] => (f == null ? 'vacio' : diasDesde(f) > maxDias ? 'viejo' : 'ok')
  const fechaPagosFuturos = maxFecha(compras.filter(c => c.fecha_pago >= hoyISO && c.estado !== 'pagada').map(c => c.fecha_pago))
  const fVentas = maxFecha(ventasRaw.map(v => v.fecha_pedido))
  const fCobros = maxFecha(cobrosPorDiaRaw.map(c => c.fecha))
  const fRest = maxFecha(ventasRestauranteRaw.map(r => String(r.fecha)))
  const fCompras = maxFecha(comprasHistoricoRaw.map(c => String(c.fecha)))
  const fForecast = ultimaCorridaRaw?.creado_at ? String(ultimaCorridaRaw.creado_at).slice(0, 10) : null
  const frescura: FrescuraDato[] = [
    { nombre: 'Bancos', fecha: saldoActual?.fecha ?? null, estado: estadoPor(saldoActual?.fecha ?? null, 7), detalle: 'Saldo de las 3 cuentas, cargado a mano al pie de esta pestaña.', href: '#carga-datos' },
    { nombre: 'Pagos a proveedores', fecha: fechaPagosFuturos, estado: fechaPagosFuturos ? 'ok' : 'vacio', detalle: fechaPagosFuturos ? 'Pagos cargados con fecha futura.' : 'No hay pagos a proveedores con fecha futura: las salidas son sólo una estimación del forecast de compras.', href: '#carga-datos' },
    { nombre: 'Ventas ERP', fecha: fVentas, estado: estadoPor(fVentas, 3), detalle: 'Sync automático del ERP.' },
    { nombre: 'Pagos de clientes', fecha: fCobros, estado: estadoPor(fCobros, 4), detalle: 'Informe Movimientos Cta. Cte.', href: '/administracion/cargar-cobros' },
    { nombre: 'Deudores', fecha: cargaDeudores || null, estado: estadoPor(cargaDeudores || null, 2), detalle: 'Informe Deudores del ERP (sync cada hora).' },
    { nombre: 'BaseCamp (Toteat)', fecha: fRest, estado: estadoPor(fRest, 9), detalle: 'Ventas del restaurante, se suben a mano cada semana.', href: '/administracion/forecast/cargar-restaurante' },
    { nombre: 'Compras de insumos', fecha: fCompras, estado: estadoPor(fCompras, 14), detalle: 'Informe Compras detalladas del ERP, se sube a mano.', href: '/administracion/forecast/cargar-compras' },
    { nombre: 'Forecast', fecha: fForecast, estado: estadoPor(fForecast, 35), detalle: 'Última corrida del modelo de venta (Prophet).' },
  ]

  return (
    <AdministracionClient
      cajaCobrada={cajaCobrada}
      escenariosCaja={escenariosCaja}
      series={series}
      avance={avance}
      mtd={mtdGeneral}
      deuda={deuda}
      ultimaCorrida={ultimaCorridaRaw?.creado_at ?? null}
      saldoActual={saldoActual}
      hayCompras={compras.length > 0}
      frescura={frescura}
      hoyISO={hoyISO}
      deudoresDetalle={deudoresDetalle ?? []}
      clientesPorVendedor={clientesPorVendedor}
      maquilaPorCliente={maquilaPorCliente}
      barrilesFuera={barrilesFuera}
      forecastClientes={forecastClientes}
      forecastCompras={forecastCompras}
      cobros={{ ...cobros, calendario }}
    />
  )
}

type DeudorRow = { nombre_fantasia: string; deuda_vencida: number | null }

/** { nombre_fantasia → plata vencida que es maquila }. Mismo cálculo que
 *  app/ventas/deudores/page.tsx — ver ese archivo para el porqué. */
async function calcularMaquila(
  supabase: ReturnType<typeof createAdminClient>,
  deudores: DeudorRow[],
): Promise<Record<string, number>> {
  const conDeuda = deudores.filter(d => (Number(d.deuda_vencida) || 0) > 0)
  if (conDeuda.length === 0) return {}

  const { data: filasMaquila } = await supabase
    .from('ventas')
    .select('nombre_fantasia')
    .or('producto.ilike.%maquila%,producto.ilike.%latas finales%')
    .in('nombre_fantasia', conDeuda.map(d => d.nombre_fantasia))

  const clientes = [...new Set((filasMaquila ?? []).map(f => f.nombre_fantasia as string))]
  if (clientes.length === 0) return {}

  const { data: ventasMaquila } = await supabase
    .from('ventas')
    .select('nombre_fantasia, pedido, fecha_pedido, producto, envase, categoria_producto, litros, total_sin_impuesto')
    .in('nombre_fantasia', clientes)

  const porCliente = new Map<string, FilaVenta[]>()
  for (const v of (ventasMaquila ?? []) as (FilaVenta & { nombre_fantasia: string })[]) {
    const arr = porCliente.get(v.nombre_fantasia)
    if (arr) arr.push(v)
    else porCliente.set(v.nombre_fantasia, [v])
  }

  const out: Record<string, number> = {}
  for (const d of conDeuda) {
    if (!porCliente.has(d.nombre_fantasia)) continue
    const monto = maquilaVencidaDe(
      d as Parameters<typeof maquilaVencidaDe>[0],
      porCliente.get(d.nombre_fantasia) ?? [],
    )
    if (monto > 0) out[d.nombre_fantasia] = monto
  }
  return out
}
