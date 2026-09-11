import { redirect } from 'next/navigation'
import { getServerUser } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { cicloEnCursoISO, inicioDeCiclo, finDeCiclo } from '@/lib/produccion/reglas'
import {
  proyectarCaja, esIngresoReal, normalizarNombreCliente, brutoDeFila,
  categoriaNormalizada, calcularPrecisionCobro, type FilaVentaFinanzas, type ProyeccionCaja, type PrecisionCobro,
} from '@/lib/administracion/finanzas'
import {
  construirFlujoSemanal, semanasRodantes, calcularAging, semaforoClientes,
  cicloConversionEfectivo, calcularDiasPagoProveedores,
  type SemanaFlujo, type EntradaCompra, type FilaDeudorAging, type TramoAging,
  type ClienteRiesgo, type CicloConversion,
} from '@/lib/administracion/flujoSemanal'
import { esCamaraProduccion } from '@/lib/camaras'
import AdministracionClient from './AdministracionClient'

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
  nivel: 'general' | 'categoria'
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

/** Todo lo que consume el dashboard de flujo de caja semanal. */
export interface DatosFlujo {
  semanas: SemanaFlujo[]
  /** Saldo bancario cargado a mano (null = todavía no se carga ninguno). */
  saldoActual: { fecha: string; saldo: number } | null
  /** El anterior, para la variación % de la tarjeta. */
  saldoPrevio: { fecha: string; saldo: number } | null
  aging: { tramos: TramoAging[]; total: number }
  riesgo: ClienteRiesgo[]
  ciclo: CicloConversion
  /** Clientes que aparecen en la proyección, para el filtro. */
  clientesFiltro: string[]
  /** `${lunes}|${cliente}` → bruto. Permite filtrar por cliente en el
   *  navegador sin volver al servidor. Sólo cubre la parte ATRIBUIBLE a un
   *  cliente: lo confirmado (venta despachada) y el backlog. El forecast del
   *  modelo es agregado y no se puede repartir por cliente, así que al filtrar
   *  por uno se excluye — la UI lo dice explícitamente. */
  confirmadoPorClienteSemana: Record<string, number>
  backlogPorClienteSemana: Record<string, number>
  hayCompras: boolean
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
    forecastRaw, validacionRaw, ventasRaw, clientesRaw, deudoresRaw, ultimaCorridaRaw,
    saldosRaw, comprasRaw, stockRaw,
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
            .select('nombre_fantasia, producto, categoria_producto, envase, litros, total_sin_impuesto, fecha_pedido, fecha_entrega, entregado')
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
    admin.from('deudores').select('nombre_fantasia, deuda_vencida, saldo_total, updated_at, ultimo_pago, deuda_menor_14_dias, deuda_entre_15_29_dias, deuda_entre_30_44_dias, deuda_entre_45_59_dias, deuda_entre_60_89_dias, deuda_mas_90_dias').then(r => r.data ?? []),
    admin.from('erp_sync_log').select('creado_at').eq('fuente', 'forecast_finanzas').eq('ok', true)
      .order('creado_at', { ascending: false }).limit(1).maybeSingle().then(r => r.data),
    admin.from('caja_saldos').select('fecha, saldo')
      .order('fecha', { ascending: false }).limit(2).then(r => r.data ?? []),
    admin.from('compras_comprometidas').select('monto, fecha_pago, fecha_documento, estado')
      .then(r => r.data ?? []),
    // Litros de producto terminado propio, para los días de inventario del
    // ciclo de conversión. Mismo criterio de cámaras que usa Producción.
    admin.from('stock_productos').select('camara, litros, tipo')
      .then(r => r.data ?? []),
  ])

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
  for (const v of ventasRaw) {
    if (!v.fecha_pedido || v.fecha_pedido < inicioCiclo || v.fecha_pedido > finCiclo) continue
    if (!esIngresoReal(v)) continue
    const neto = Number(v.total_sin_impuesto) || 0
    if (neto === 0) continue
    mtdGeneral.neto += neto
    mtdGeneral.bruto += brutoDeFila(v)
    const cat = categoriaNormalizada(v.producto, v.categoria_producto)
    mtdPorCategoria.set(cat, (mtdPorCategoria.get(cat) ?? 0) + neto)
  }

  const series: SerieFinanzas[] = [...porSerie.entries()].map(([id, puntos]) => {
    const [nivel, claveRaw] = id.split('::')
    const clave = claveRaw || null
    const val = validacionPorSerie.get(id)
    return {
      id, nivel: nivel as 'general' | 'categoria', clave,
      puntos: puntos.sort((a, b) => a.mes.localeCompare(b.mes)),
      mape: val?.mape != null ? Number(val.mape) : null,
      mesesHistorial: val?.meses_historial != null ? Number(val.meses_historial) : null,
      montoCicloEnCurso: nivel === 'general' ? mtdGeneral.neto : (mtdPorCategoria.get(clave ?? '') ?? 0),
    }
  })

  // ── Proyección de cobranza ─────────────────────────────────────────────────
  // El maestro puede traer el mismo nombre más de una vez; gana el que tenga
  // plazo cargado, para no perder el dato por culpa de una ficha duplicada
  // incompleta.
  //
  // Prioridad: plazo REAL observado (mediana de días entre remito y pago,
  // calculado desde "Movimientos Cta. Cte." del ERP — 10-sep-2026) por sobre
  // el plazo DECLARADO en el ERP, cuando hay al menos 3 facturas matcheadas
  // para confiar en la mediana. La brecha entre ambos es real: mediana
  // declarada global 7 días vs. mediana real observada 13-14 — los clientes
  // en promedio pagan más lento de lo que el ERP dice que deberían.
  const diasPagoPorCliente = new Map<string, number | null>()
  for (const c of clientesRaw) {
    const k = normalizarNombreCliente(c.nombre_fantasia)
    if (!k) continue
    const previo = diasPagoPorCliente.get(k)
    const dias = c.dias_pago_real_muestras != null && c.dias_pago_real_muestras >= 3
      ? c.dias_pago_real_mediana
      : c.dias_pago
    if (previo == null) diasPagoPorCliente.set(k, dias)
  }

  // Se descartan los cobros esperados de hace más de 14 días: `ventas` no dice
  // qué está pagado, así que más atrás la proyección dejaría de ser "lo que
  // falta cobrar". Esa mora vieja la mide el informe de Deudores del ERP.
  const desdeCobro = new Date(Date.now() - 14 * MS_POR_DIA).toISOString().slice(0, 10)
  const caja: ProyeccionCaja = proyectarCaja(ventasRaw, diasPagoPorCliente, hoyISO, desdeCobro)

  const deuda: ResumenDeuda = {
    vencida: deudoresRaw.reduce((s, d) => s + (Number(d.deuda_vencida) || 0), 0),
    clientes: deudoresRaw.filter(d => (Number(d.deuda_vencida) || 0) > 0).length,
    ultimaCarga: deudoresRaw.reduce<string | null>((max, d) => {
      const u = d.updated_at as string | null
      return u && (!max || u > max) ? u : max
    }, null),
  }

  // ── Precisión de cobro ──────────────────────────────────────────────────────
  // Cruza lo que ESTE módulo esperaba cobrar en los últimos 60 días contra el
  // dato duro del ERP (Deudores): ¿el cliente sigue con deuda vencida, o no?
  // Es la única forma de calibrar la proyección sin una tabla de pagos real —
  // ver el comentario extenso en calcularPrecisionCobro().
  const deudaVencidaPorCliente = new Map<string, number>()
  for (const d of deudoresRaw) {
    const k = normalizarNombreCliente(d.nombre_fantasia as string | null)
    if (!k) continue
    deudaVencidaPorCliente.set(k, (deudaVencidaPorCliente.get(k) ?? 0) + (Number(d.deuda_vencida) || 0))
  }
  const ventana60d = new Date(Date.now() - 60 * MS_POR_DIA).toISOString().slice(0, 10)
  const precisionCobro: PrecisionCobro = calcularPrecisionCobro(
    ventasRaw, diasPagoPorCliente, deudaVencidaPorCliente, hoyISO, ventana60d
  )

  // ── Dashboard de flujo de caja semanal ──────────────────────────────────────
  // 13 semanas hacia adelante (el horizonte que pidió el usuario) más 4 hacia
  // atrás, para que el gráfico muestre de dónde viene la curva y no arranque
  // en el aire.
  const semanas = semanasRodantes(hoyISO, 4, 12)

  // Factor neto→bruto real del período: el forecast del modelo está en NETO y
  // todo el resto del dashboard va en BRUTO (la plata que llega a la cuenta).
  let netoPeriodo = 0
  let brutoPeriodo = 0
  const ventaNetaPorMes = new Map<string, number>()
  let litrosUltimos28 = 0
  const hace28 = correrDias(hoyISO, -28)
  for (const v of ventasRaw) {
    if (!esIngresoReal(v)) continue
    const neto = Number(v.total_sin_impuesto) || 0
    if (neto === 0) continue
    netoPeriodo += neto
    brutoPeriodo += brutoDeFila(v)
    if (v.fecha_pedido) {
      const mes = `${v.fecha_pedido.slice(0, 7)}-01`
      ventaNetaPorMes.set(mes, (ventaNetaPorMes.get(mes) ?? 0) + neto)
      if (v.fecha_pedido.slice(0, 10) >= hace28) litrosUltimos28 += Number(v.litros) || 0
    }
  }
  const factorBruto = netoPeriodo > 0 ? brutoPeriodo / netoPeriodo : 1.19

  // Plazo de cobro típico: mediana de los plazos efectivamente en uso (que ya
  // son el real observado cuando existe — ver el bloque de arriba).
  const plazos = [...diasPagoPorCliente.values()].filter((d): d is number => d != null).sort((a, b) => a - b)
  const diasCobroPromedio = plazos.length > 0 ? plazos[Math.floor(plazos.length / 2)] : 14

  // Backlog: vendido y sin despachar, por cliente (el plazo recién arranca
  // cuando salga, así que va del lado proyectado, nunca del confirmado).
  const backlogPorCliente = new Map<string, { bruto: number; diasPago: number | null }>()
  for (const v of ventasRaw) {
    if (!esIngresoReal(v)) continue
    if (v.fecha_entrega) continue
    const neto = Number(v.total_sin_impuesto) || 0
    if (neto === 0) continue
    const nombre = v.nombre_fantasia ?? '(sin nombre)'
    const acc = backlogPorCliente.get(nombre)
      ?? { bruto: 0, diasPago: diasPagoPorCliente.get(normalizarNombreCliente(v.nombre_fantasia)) ?? null }
    acc.bruto += brutoDeFila(v)
    backlogPorCliente.set(nombre, acc)
  }

  // Desglose por cliente y semana, para el filtro por cliente del dashboard.
  const confirmadoPorClienteSemana: Record<string, number> = {}
  const backlogPorClienteSemana: Record<string, number> = {}
  const lunesDeFecha = (iso: string) => {
    const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
    const dt = new Date(Date.UTC(y, m - 1, d))
    const dow = dt.getUTCDay()
    return new Date(dt.getTime() + (dow === 0 ? -6 : 1 - dow) * MS_POR_DIA).toISOString().slice(0, 10)
  }
  for (const v of ventasRaw) {
    if (!esIngresoReal(v) || !v.fecha_entrega) continue
    const neto = Number(v.total_sin_impuesto) || 0
    if (neto === 0) continue
    const dias = diasPagoPorCliente.get(normalizarNombreCliente(v.nombre_fantasia))
    if (dias == null) continue
    const fechaCobro = new Date(
      Date.parse(`${v.fecha_entrega.slice(0, 10)}T00:00:00Z`) + dias * MS_POR_DIA
    ).toISOString().slice(0, 10)
    if (fechaCobro < desdeCobro) continue
    const clave = `${lunesDeFecha(fechaCobro)}|${v.nombre_fantasia ?? '(sin nombre)'}`
    confirmadoPorClienteSemana[clave] = (confirmadoPorClienteSemana[clave] ?? 0) + brutoDeFila(v)
  }
  const entregaSupuesta = correrDias(hoyISO, 7)
  for (const [nombre, b] of backlogPorCliente) {
    const dias = b.diasPago ?? diasCobroPromedio
    const cobro = new Date(Date.parse(`${entregaSupuesta}T00:00:00Z`) + dias * MS_POR_DIA).toISOString().slice(0, 10)
    const clave = `${lunesDeFecha(cobro)}|${nombre}`
    backlogPorClienteSemana[clave] = (backlogPorClienteSemana[clave] ?? 0) + b.bruto
  }

  const compras = comprasRaw as unknown as EntradaCompra[]
  const saldoActual = saldosRaw[0] ? { fecha: String(saldosRaw[0].fecha), saldo: Number(saldosRaw[0].saldo) } : null
  const saldoPrevio = saldosRaw[1] ? { fecha: String(saldosRaw[1].fecha), saldo: Number(saldosRaw[1].saldo) } : null

  // Promedio semanal de gasto real de los últimos 90 días — sirve de estimado
  // por defecto para semanas futuras sin ningún pago cargado a mano (ver
  // construirFlujoSemanal). Se excluyen los montos negativos (notas de
  // crédito/ajustes contables): son correcciones puntuales, no gasto
  // recurrente, y promediarlas de vuelta subestimaría el gasto típico.
  const hace90 = correrDias(hoyISO, -90)
  const gastoUltimos90 = compras
    .filter(c => c.estado !== 'estimada' && c.fecha_pago >= hace90 && c.fecha_pago <= hoyISO && Number(c.monto) > 0)
    .reduce((s, c) => s + Number(c.monto), 0)
  const promedioSemanalHistorico = gastoUltimos90 > 0 ? (gastoUltimos90 / 90) * 7 : null

  const semanasFlujo = construirFlujoSemanal({
    cobrosConfirmados: caja.periodos.map(p => ({ inicio: p.inicio, bruto: p.bruto })),
    backlog: [...backlogPorCliente.values()],
    forecastMensual: forecastRaw
      .filter(f => f.nivel === 'general' && f.tipo === 'forecast')
      .map(f => ({ mes: String(f.mes).slice(0, 10), monto: Number(f.monto) })),
    ventaRegistradaPorMes: ventaNetaPorMes,
    factorBruto,
    compras,
    promedioSemanalHistorico,
    saldoInicial: saldoActual?.saldo ?? null,
    diasCobroPromedio,
    hoyISO,
    semanas,
  })

  // Aging y semáforo: sólo clientes reales (los internos tipo PDV/BaseCamp
  // arrastran saldos artificiales de millones que distorsionarían todo).
  const deudoresReales = (deudoresRaw as unknown as FilaDeudorAging[])
    .filter(d => esIngresoReal({ nombre_fantasia: d.nombre_fantasia, producto: null }))

  const plazosPorCliente = new Map<string, { real: number | null; declarado: number | null }>()
  for (const c of clientesRaw) {
    const k = normalizarNombreCliente(c.nombre_fantasia)
    if (!k || plazosPorCliente.has(k)) continue
    plazosPorCliente.set(k, {
      real: c.dias_pago_real_muestras != null && c.dias_pago_real_muestras >= 3 ? c.dias_pago_real_mediana : null,
      declarado: c.dias_pago,
    })
  }

  // Días de inventario: litros de producto terminado propio dividido por los
  // litros que salen al día (venta real de las últimas 4 semanas).
  const litrosStock = (stockRaw as { camara: string | null; litros: number | null; tipo: string | null }[])
    .filter(s => s.tipo !== 'tanque' && esCamaraProduccion(s.camara))
    .reduce((s, r) => s + (Number(r.litros) || 0), 0)
  const litrosPorDia = litrosUltimos28 / 28
  const diasInventario = litrosPorDia > 0 && litrosStock > 0 ? Math.round(litrosStock / litrosPorDia) : null

  const datosFlujo: DatosFlujo = {
    semanas: semanasFlujo,
    saldoActual,
    saldoPrevio,
    aging: calcularAging(deudoresReales),
    riesgo: semaforoClientes(deudoresReales, plazosPorCliente, normalizarNombreCliente),
    ciclo: cicloConversionEfectivo(
      diasInventario,
      plazos.length > 0 ? diasCobroPromedio : null,
      calcularDiasPagoProveedores(compras),
    ),
    clientesFiltro: [...new Set([
      ...Object.keys(confirmadoPorClienteSemana).map(k => k.split('|')[1]),
      ...Object.keys(backlogPorClienteSemana).map(k => k.split('|')[1]),
    ])].sort((a, b) => a.localeCompare(b)),
    confirmadoPorClienteSemana,
    backlogPorClienteSemana,
    hayCompras: compras.length > 0,
  }

  return (
    <AdministracionClient
      series={series}
      avance={avance}
      mtd={mtdGeneral}
      caja={caja}
      deuda={deuda}
      precisionCobro={precisionCobro}
      flujo={datosFlujo}
      ultimaCorrida={ultimaCorridaRaw?.creado_at ?? null}
      clientesSinPlazo={[...diasPagoPorCliente.values()].filter(v => v == null).length}
      hoyISO={hoyISO}
    />
  )
}
