/**
 * Backtest walk-forward de la Caja real cobrada (lib/administracion/cajaCobrada.ts).
 *
 * Para cada mes M (por defecto los 3 últimos cerrados) se para el 1.º de M con lo que se
 * sabía ese día —perfiles de pago medidos SÓLO con pagos anteriores, facturas emitidas e
 * impagas a esa fecha— y se proyecta cuánto se cobraría a crédito en M. Las facturas que se
 * emiten durante M entran con su fecha real: así se mide el modelo de PAGO, no el forecast
 * de venta (ese tiene su propio backtest en forecast_finanzas_validacion).
 *
 * Real de M = todos los pagos de clientes a crédito en cobros_erp con fecha en M (con o sin
 * factura imputada): lo que de verdad entró al banco por venta a crédito.
 *
 * Moroso al 1.º de M = tenía una factura impaga ya vencida según su plazo pactado (el
 * historial de Deudores sólo existe desde el 3-sep-2026, así que no se puede usar).
 *
 * Uso:  npx tsx --env-file=.env.local scripts/analisis/backtest-caja-cobrada.ts [2026-07 2026-08 2026-09]
 */
import { createClient } from '@supabase/supabase-js'
import { esClienteCredito, fechaCobroEsperada, perfilesPago, sumarDias, PARAMETROS_CAJA } from '../../lib/administracion/cajaCobrada'
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

const finDeMes = (m: string) => sumarDias(sumarDias(`${m}-01`, 32).slice(0, 7) + '-01', -1)

async function main() {
  const meses = process.argv.slice(2).length ? process.argv.slice(2) : ['2026-07', '2026-08', '2026-09']
  const desdeTodo = sumarDias(`${meses[0]}-01`, -200)
  const hastaTodo = finDeMes(meses[meses.length - 1])

  const [ventas, cobros, clientes] = await Promise.all([
    todas<FilaVentaFinanzas & { numero_factura: string | null }>((a, b) => admin.from('ventas')
      .select('nombre_fantasia, producto, categoria_producto, envase, litros, total_sin_impuesto, fecha_pedido, fecha_entrega, entregado, numero_factura')
      .gte('fecha_entrega', desdeTodo).lte('fecha_entrega', hastaTodo).not('numero_factura', 'is', null).order('id').range(a, b)),
    todas<{ fecha: string; cliente: string; monto: number; factura: string | null }>((a, b) => admin.from('cobros_erp')
      .select('fecha, cliente, monto, factura').gte('fecha', desdeTodo).lte('fecha', hastaTodo).order('id').range(a, b)),
    todas<{ nombre_fantasia: string; dias_pago: number | null }>((a, b) => admin.from('clientes').select('nombre_fantasia, dias_pago').order('id').range(a, b)),
  ])

  const pactado = new Map<string, number>()
  const ps: number[] = []
  for (const c of clientes) if (c.dias_pago != null) { pactado.set(normalizarNombreCliente(c.nombre_fantasia), c.dias_pago); ps.push(c.dias_pago) }
  ps.sort((a, b) => a - b)
  const pactadoPorDefecto = ps[Math.floor(ps.length / 2)] ?? 15

  // Facturas a crédito agrupadas, con su primer pago imputado.
  const facturas = new Map<string, { cliente: string; emision: string; bruto: number }>()
  for (const v of ventas) {
    if (!v.fecha_entrega || !v.numero_factura || !esIngresoReal(v) || !esClienteCredito(v.nombre_fantasia)) continue
    const b = brutoDeFila(v)
    if (b <= 0) continue
    const f = facturas.get(v.numero_factura) ?? { cliente: v.nombre_fantasia!, emision: v.fecha_entrega, bruto: 0 }
    f.bruto += b
    if (v.fecha_entrega > f.emision) f.emision = v.fecha_entrega
    facturas.set(v.numero_factura, f)
  }
  const primerPago = new Map<string, string>()
  for (const c of cobros) if (c.factura && (!primerPago.has(c.factura) || c.fecha < primerPago.get(c.factura)!)) primerPago.set(c.factura, c.fecha)

  console.log('mes      | real cobrado  | modelo        | error   | solo plazo pactado | error')
  const filas: string[] = []
  const diagnostico: string[] = []
  const residuo = new Map<string, number>() // recupero de atrasadas + pagos sin factura/fuera de ventana
  const resultados: { m: string; real: number; modelo: number; soloPactado: number }[] = []
  for (const m of meses) {
    const S = `${m}-01`, E = finDeMes(m)
    const pagos = (await admin.rpc('comportamiento_pago_ponderado', { p_desde: sumarDias(S, -PARAMETROS_CAJA.ventanaDias), p_hasta: S })).data as { cliente: string; pagos: number; monto: number; dias_ponderado: number }[]

    const universo = [...facturas.entries()].filter(([n, f]) => {
      if (f.emision > E || f.emision < sumarDias(S, -180)) return false
      const pago = primerPago.get(n)
      return !(f.emision < S && pago && pago < S) // emitida antes de S y ya pagada → fuera
    })
    const morosos = new Set<string>()
    for (const [, f] of universo) {
      const k = normalizarNombreCliente(f.cliente)
      if (f.emision < S && sumarDias(f.emision, pactado.get(k) ?? pactadoPorDefecto) < S) morosos.add(k)
    }
    const perfiles = perfilesPago({
      pagos: (pagos ?? []).map(p => ({ cliente: p.cliente, pagos: Number(p.pagos), monto: Number(p.monto), diasPonderado: Number(p.dias_ponderado) })),
      pactadoPorCliente: pactado, morosos, pactadoPorDefecto,
    })

    let modelo = 0, soloPactado = 0
    for (const [, f] of universo) {
      const p = perfiles.perfilDe(f.cliente)
      const { cobro } = fechaCobroEsperada(f.emision, p)
      if (cobro >= S && cobro <= E) modelo += f.bruto
      const { cobro: cobroPactado } = fechaCobroEsperada(f.emision, { pactado: p.pactado, desvio: 0 })
      if (cobroPactado >= S && cobroPactado <= E) soloPactado += f.bruto
    }
    const real = cobros.filter(c => c.fecha >= S && c.fecha <= E && esClienteCredito(c.cliente) && Number(c.monto) > 0)
      .reduce((s, c) => s + Number(c.monto), 0)
    // Diagnóstico: de dónde salió la plata real del mes.
    const enUniverso = new Set(universo.map(([n]) => n))
    const atrasadasEnS = new Set(universo.filter(([, f]) => f.emision < S && fechaCobroEsperada(f.emision, perfiles.perfilDe(f.cliente)).cobro < S).map(([n]) => n))
    const atrasadoS = universo.filter(([n]) => atrasadasEnS.has(n)).reduce((s, [, f]) => s + f.bruto, 0)
    let deAtrasadas = 0, deUniverso = 0, otros = 0
    for (const c of cobros) {
      if (c.fecha < S || c.fecha > E || !esClienteCredito(c.cliente) || Number(c.monto) <= 0) continue
      if (c.factura && atrasadasEnS.has(c.factura)) deAtrasadas += Number(c.monto)
      else if (c.factura && enUniverso.has(c.factura)) deUniverso += Number(c.monto)
      else otros += Number(c.monto)
    }
    residuo.set(m, deAtrasadas + otros)
    diagnostico.push(`${m}: atrasado al 1.º $${Math.round(atrasadoS / 1e6 * 10) / 10}M → se recuperó en el mes $${Math.round(deAtrasadas / 1e6 * 10) / 10}M (${Math.round(deAtrasadas / (atrasadoS || 1) * 100)}%) · pagos de facturas del universo no atrasadas $${Math.round(deUniverso / 1e6 * 10) / 10}M · sin factura o fuera de ventana $${Math.round(otros / 1e6 * 10) / 10}M`)
    const err = (x: number) => `${((x - real) / real * 100).toFixed(1)}%`
    const M = (x: number) => ('$' + Math.round(x).toLocaleString('es-CL')).padStart(13)
    const fila = `${m}  | ${M(real)} | ${M(modelo)} | ${err(modelo).padStart(7)} | ${M(soloPactado)}      | ${err(soloPactado)}`
    console.log(fila)
    resultados.push({ m, real, modelo, soloPactado })
    filas.push(JSON.stringify({ mes: m, real: Math.round(real), modelo: Math.round(modelo), soloPactado: Math.round(soloPactado) }))
  }
  console.log('\n' + diagnostico.join('\n'))
  // Variante: modelo + promedio de los 3 meses ANTERIORES del residuo no rastreable por factura.
  console.log('\nmodelo + cobros no rastreables (promedio 3 meses previos):')
  const aps: number[] = [], apsBase: number[] = [], apsPact: number[] = []
  for (const r of resultados) {
    const previos = [...residuo.entries()].filter(([mm]) => mm < r.m).slice(-3).map(([, v]) => v)
    if (previos.length < 3) continue
    const extra = previos.reduce((a, b) => a + b, 0) / previos.length
    const ape = Math.abs(r.modelo + extra - r.real) / r.real * 100
    aps.push(ape); apsBase.push(Math.abs(r.modelo - r.real) / r.real * 100); apsPact.push(Math.abs(r.soloPactado - r.real) / r.real * 100)
    console.log(`${r.m}: modelo+residuo $${Math.round(r.modelo + extra).toLocaleString('es-CL')} vs real $${Math.round(r.real).toLocaleString('es-CL')} → error ${ape.toFixed(1)}% (residuo estimado $${Math.round(extra).toLocaleString('es-CL')})`)
  }
  const prom = (xs: number[]) => (xs.reduce((a, b) => a + b, 0) / (xs.length || 1)).toFixed(1)
  console.log(`MAPE: modelo ${prom(apsBase)}% · modelo+residuo ${prom(aps)}% · sólo pactado ${prom(apsPact)}%`)
  console.log('\nJSON (para BACKTEST_CAJA en cajaCobrada.ts):')
  console.log(filas.join(',\n'))
}
main()
