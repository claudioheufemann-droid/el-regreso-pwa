/**
 * Backtest walk-forward de los ESCENARIOS de cobro (mayoristas + enlatado móvil) que muestra
 * la pestaña Caja (construirEscenarios en lib/administracion/cajaCobradaDatos.ts).
 *
 * Para cada mes de partida S (1.º de mes) se usa SÓLO lo que se sabía ese día y se proyectan
 * los meses S, S+1 y S+2 (horizontes 1-3, igual que la proyección oct-dic), componente por
 * componente, contra lo que de verdad entró (cobros_erp):
 *
 *   1. Facturas al día   : facturas impagas en S cuyo cobro esperado (vencimiento + desvío del
 *                          cliente medido con pagos ANTERIORES a S) cae en el mes.
 *   2. Atrasadas          : facturas impagas en S cuyo cobro esperado ya había pasado. Se mide
 *                          qué % se recuperó cada mes y se compara con 4% / 6% / 13%.
 *   3. Venta futura       : (a) "ritmo": venta a crédito promedio de los 3 meses previos a S
 *                          (escenario conservador, 100% walk-forward); (b) "venta real": la venta
 *                          que de verdad ocurrió, cobrada con el perfil de cada cliente — mide el
 *                          modelo de cobro del escenario base aislando el error del forecast, que
 *                          tiene su propio backtest (forecast_finanzas_validacion).
 *   4. EWU               : mínimo / promedio / máximo de sus pagos de los 3 meses previos.
 *
 * Limitaciones (se informan en el Excel): sin historial del informe Deudores antes del
 * 3-sep-2026 no se puede recortar contra el saldo del ERP, así que el universo "atrasado" del
 * backtest incluye facturas que en realidad se pagaron con depósitos sin factura imputada.
 *
 * Uso: npx tsx --env-file=.env.local scripts/analisis/backtest-escenarios-caja.ts <salida.json>
 */
import { writeFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'
import {
  esClienteCredito, fechaCobroEsperada, perfilesPago, sumarDias, PARAMETROS_CAJA, mixDePlazos, repartirEnDias,
} from '../../lib/administracion/cajaCobrada'
import { siguienteHabil } from '../../lib/administracion/calendarioEntradas'
import { esEnlatado, RECUPERO_ATRASADO } from '../../lib/administracion/cajaCobradaDatos'
import { brutoDeFila, esIngresoReal, normalizarNombreCliente, type FilaVentaFinanzas } from '../../lib/administracion/finanzas'

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!, { auth: { persistSession: false } })

async function todas<T>(q: (a: number, b: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const out: T[] = []
  for (let o = 0; ; o += 1000) {
    const { data, error } = await q(o, o + 999)
    if (error) throw error
    if (!data?.length) break
    out.push(...data)
    if (data.length < 1000) break
  }
  return out
}

const mesSig = (m: string) => sumarDias(`${m}-01`, 32).slice(0, 7)
const mesAnt = (m: string) => sumarDias(`${m}-01`, -1).slice(0, 7)
const finDeMes = (m: string) => sumarDias(`${mesSig(m)}-01`, -1)
const esEwu = (c: string | null | undefined) => /ewu ginger beer/i.test(c ?? '')

async function main() {
  const salida = process.argv[2] ?? 'backtest-escenarios.json'
  const starts = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09']
  const ultimoMesReal = '2026-09'

  const [ventas, cobros, clientes] = await Promise.all([
    todas<FilaVentaFinanzas & { numero_factura: string | null }>((a, b) => admin.from('ventas')
      .select('nombre_fantasia, producto, categoria_producto, envase, litros, total_sin_impuesto, fecha_pedido, fecha_entrega, entregado, numero_factura')
      .gte('fecha_pedido', '2025-06-01').lte('fecha_pedido', finDeMes(ultimoMesReal)).order('id').range(a, b)),
    todas<{ fecha: string; cliente: string; monto: number; factura: string | null }>((a, b) => admin.from('cobros_erp')
      .select('fecha, cliente, monto, factura').lte('fecha', finDeMes(ultimoMesReal)).order('id').range(a, b)),
    todas<{ nombre_fantasia: string; dias_pago: number | null }>((a, b) => admin.from('clientes').select('nombre_fantasia, dias_pago').order('id').range(a, b)),
  ])
  console.log(`ventas ${ventas.length} · cobros ${cobros.length} · clientes ${clientes.length}`)

  const pactado = new Map<string, number>()
  const ps: number[] = []
  for (const c of clientes) if (c.dias_pago != null) { pactado.set(normalizarNombreCliente(c.nombre_fantasia), c.dias_pago); ps.push(c.dias_pago) }
  ps.sort((a, b) => a - b)
  const pactadoPorDefecto = ps[Math.floor(ps.length / 2)] ?? 7

  // Facturas a crédito (sin EWU: se modela por su ritmo), agrupadas, y venta a crédito por pedido.
  const facturas = new Map<string, { cliente: string; emision: string; bruto: number }>()
  const ventaCreditoPorMes = new Map<string, number>()
  const patronPorMes = new Map<string, number[]>()
  for (const v of ventas) {
    if (!esIngresoReal(v) || !esClienteCredito(v.nombre_fantasia) || esEwu(v.nombre_fantasia)) continue
    const b = brutoDeFila(v)
    if (!b) continue
    if (v.fecha_pedido && b > 0) {
      const m = v.fecha_pedido.slice(0, 7)
      ventaCreditoPorMes.set(m, (ventaCreditoPorMes.get(m) ?? 0) + b)
      const pat = patronPorMes.get(m) ?? [0, 0, 0, 0, 0, 0, 0]
      pat[(new Date(`${v.fecha_pedido}T00:00:00Z`).getUTCDay() + 6) % 7] += b
      patronPorMes.set(m, pat)
    }
    if (!v.fecha_entrega || !v.numero_factura || b <= 0) continue
    const f = facturas.get(v.numero_factura) ?? { cliente: v.nombre_fantasia!, emision: v.fecha_entrega, bruto: 0 }
    f.bruto += b
    if (v.fecha_entrega > f.emision) f.emision = v.fecha_entrega
    facturas.set(v.numero_factura, f)
  }
  const pagosPorFactura = new Map<string, { fecha: string; monto: number }[]>()
  for (const c of cobros) if (c.factura && Number(c.monto) > 0) {
    const l = pagosPorFactura.get(c.factura) ?? []
    l.push({ fecha: c.fecha, monto: Number(c.monto) })
    pagosPorFactura.set(c.factura, l)
  }
  const primerPago = (n: string) => (pagosPorFactura.get(n) ?? []).reduce<string | null>((m, p) => (!m || p.fecha < m ? p.fecha : m), null)
  const pagadoEnMes = (n: string, m: string) => (pagosPorFactura.get(n) ?? []).filter(p => p.fecha.slice(0, 7) === m).reduce((s, p) => s + p.monto, 0)

  const cobradoCreditoMes = new Map<string, number>()
  const cobradoEwuMes = new Map<string, number>()
  for (const c of cobros) {
    if (Number(c.monto) <= 0 || !esClienteCredito(c.cliente)) continue
    const m = c.fecha.slice(0, 7)
    cobradoCreditoMes.set(m, (cobradoCreditoMes.get(m) ?? 0) + Number(c.monto))
    if (esEwu(c.cliente)) cobradoEwuMes.set(m, (cobradoEwuMes.get(m) ?? 0) + Number(c.monto))
  }

  const filas: Record<string, string | number | null>[] = []
  for (const S of starts) {
    const dS = `${S}-01`
    const pagos = (await admin.rpc('comportamiento_pago_ponderado', { p_desde: sumarDias(dS, -PARAMETROS_CAJA.ventanaDias), p_hasta: dS })).data as { cliente: string; pagos: number; monto: number; dias_ponderado: number }[]

    // Universo en S: facturas emitidas en los 180 días previos, impagas al 1.º.
    const universo = [...facturas.entries()].filter(([n, f]) => f.emision < dS && f.emision >= sumarDias(dS, -180) && !((primerPago(n) ?? '9999') < dS))
    const morosos = new Set<string>()
    for (const [, f] of universo) {
      const k = normalizarNombreCliente(f.cliente)
      if (sumarDias(f.emision, pactado.get(k) ?? pactadoPorDefecto) < dS) morosos.add(k)
    }
    const perfiles = perfilesPago({
      pagos: (pagos ?? []).map(p => ({ cliente: p.cliente, pagos: Number(p.pagos), monto: Number(p.monto), diasPonderado: Number(p.dias_ponderado) })),
      pactadoPorCliente: pactado, morosos, pactadoPorDefecto,
    })
    const alDia: { n: string; bruto: number; cobro: string }[] = []
    const atrasadas: { n: string; bruto: number }[] = []
    for (const [n, f] of universo) {
      const { cobro } = fechaCobroEsperada(f.emision, perfiles.perfilDe(f.cliente))
      if (cobro < dS) atrasadas.push({ n, bruto: f.bruto })
      else alDia.push({ n, bruto: f.bruto, cobro })
    }
    const A = atrasadas.reduce((s, x) => s + x.bruto, 0)

    // Ritmo (conservador): venta a crédito promedio de los 3 meses previos, patrón semanal y mix de plazos de esos meses.
    const previos = [mesAnt(S), mesAnt(mesAnt(S)), mesAnt(mesAnt(mesAnt(S)))]
    const ritmo = previos.reduce((s, m) => s + (ventaCreditoPorMes.get(m) ?? 0), 0) / 3
    const patron = previos.reduce((acc, m) => acc.map((x, i) => x + (patronPorMes.get(m)?.[i] ?? 0)), [0, 0, 0, 0, 0, 0, 0])
    const ventasPrevPorCliente = new Map<string, number>()
    for (const [, f] of facturas) if (previos.includes(f.emision.slice(0, 7))) ventasPrevPorCliente.set(f.cliente, (ventasPrevPorCliente.get(f.cliente) ?? 0) + f.bruto)
    const mix = mixDePlazos([...ventasPrevPorCliente.entries()].map(([cliente, bruto]) => ({ cliente, bruto })), perfiles)
    const ewuPrev = previos.map(m => cobradoEwuMes.get(m) ?? 0)

    // Cobros por mes del "ritmo": emisiones día a día desde S durante 3 meses, cobradas con el mix.
    const ritmoPorMes = new Map<string, number>()
    for (let h = 0, m = S; h < 3; h++, m = mesSig(m)) {
      for (const d of repartirEnDias(`${m}-01`, finDeMes(m), ritmo, patron, dS)) {
        for (const t of mix) {
          const c = siguienteHabil(sumarDias(d.fecha, Math.round(t.diasMedios))).slice(0, 7)
          ritmoPorMes.set(c, (ritmoPorMes.get(c) ?? 0) + d.monto * t.participacion)
        }
      }
    }
    // Venta real emitida desde S, cobrada con el perfil de su cliente.
    const nuevas = [...facturas.entries()].filter(([, f]) => f.emision >= dS && f.emision <= finDeMes(mesSig(mesSig(S))))

    let recuperadoAcum = 0
    for (let h = 1, M = S; h <= 3 && M <= ultimoMesReal; h++, M = mesSig(M)) {
      const predFact = alDia.filter(x => x.cobro.slice(0, 7) === M).reduce((s, x) => s + x.bruto, 0)
      const realFact = alDia.reduce((s, x) => s + pagadoEnMes(x.n, M), 0)
      const realAtras = atrasadas.reduce((s, x) => s + pagadoEnMes(x.n, M), 0)
      const pendienteInicioMes = A - recuperadoAcum
      recuperadoAcum += realAtras
      const predVentaReal = nuevas.filter(([, f]) => f.emision <= finDeMes(M) && fechaCobroEsperada(f.emision, perfiles.perfilDe(f.cliente)).cobro.slice(0, 7) === M).reduce((s, [, f]) => s + f.bruto, 0)
      const realVenta = nuevas.reduce((s, [n]) => s + pagadoEnMes(n, M), 0)
      const predRitmo = ritmoPorMes.get(M) ?? 0
      const realEwu = cobradoEwuMes.get(M) ?? 0
      const realTotal = cobradoCreditoMes.get(M) ?? 0
      const sinRastreo = realTotal - realFact - realAtras - realVenta - realEwu
      const atr = (r: number) => A * r * Math.pow(1 - r, h - 1)
      const ewuMin = Math.min(...ewuPrev), ewuProm = ewuPrev.reduce((a, b) => a + b, 0) / 3, ewuMax = Math.max(...ewuPrev)
      filas.push({
        partida: S, mes: M, horizonte: h,
        facturas_al_dia_proy: Math.round(predFact), facturas_al_dia_real: Math.round(realFact),
        atrasado_inicial: Math.round(A), atrasado_pendiente_inicio_mes: Math.round(pendienteInicioMes), atrasado_recuperado_real: Math.round(realAtras),
        tasa_recupero_real: pendienteInicioMes > 0 ? realAtras / pendienteInicioMes : null,
        venta_ritmo_proy: Math.round(predRitmo), venta_real_cobro_proy: Math.round(predVentaReal), venta_cobrada_real: Math.round(realVenta),
        ewu_min: Math.round(ewuMin), ewu_prom: Math.round(ewuProm), ewu_max: Math.round(ewuMax), ewu_real: Math.round(realEwu),
        cobros_sin_rastreo_real: Math.round(sinRastreo),
        total_real: Math.round(realTotal),
        total_conservador: Math.round(predFact + atr(RECUPERO_ATRASADO.conservador) + predRitmo + ewuMin),
        total_base_venta_real: Math.round(predFact + atr(RECUPERO_ATRASADO.base) + predVentaReal + ewuProm),
        total_optimista_venta_real: Math.round(predFact + atr(RECUPERO_ATRASADO.optimista) + predVentaReal + ewuMax),
      })
    }
  }

  const M = (n: unknown) => `${(Number(n) / 1e6).toFixed(1)}`.padStart(6)
  console.log('partida mes     h | real  | conserv | base* | optim* | fact p/r     | atras% | ritmo | venta* p/r  | sinRastreo')
  for (const f of filas) {
    console.log(`${f.partida} ${f.mes} ${f.horizonte} |${M(f.total_real)} |${M(f.total_conservador)}  |${M(f.total_base_venta_real)} |${M(f.total_optimista_venta_real)}  |${M(f.facturas_al_dia_proy)}/${M(f.facturas_al_dia_real)} | ${f.tasa_recupero_real != null ? (Number(f.tasa_recupero_real) * 100).toFixed(1).padStart(5) : '  —  '} |${M(f.venta_ritmo_proy)} |${M(f.venta_real_cobro_proy)}/${M(f.venta_cobrada_real)} |${M(f.cobros_sin_rastreo_real)}`)
  }
  const { data: val } = await admin.from('forecast_finanzas_validacion').select('nivel, clave, mape, mae, meses_evaluados, metodo')
  writeFileSync(salida, JSON.stringify({ generado: new Date().toISOString(), filas, validacionForecast: val ?? [], recupero: RECUPERO_ATRASADO }, null, 1))
  console.log(`\n→ ${salida}`)
}
main()
