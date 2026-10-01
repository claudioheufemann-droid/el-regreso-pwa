import {
  type Consulta, entero, mediana, rango, redondear, sumarDiasISO, terminoSeguro, texto,
} from './_base'
import { esClienteExcluido } from '@/lib/types'
import { neto, traerVentas } from './ventas'

/** Cuentas internas ("Cliente PDV/Feria/Marketing…", BaseCamp): nunca son un cliente a reactivar. */
const esCuentaInterna = (n: string) => esClienteExcluido(n) || /^cliente\s/i.test(n.trim()) || /basecamp/i.test(n)

const diasEntre = (a: string, b: string) =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)

export const frecuenciaCompraCliente: Consulta = {
  nombre: 'frecuencia_compra_cliente',
  descripcion:
    'Cada cuánto compra un cliente y de cuánto es cada compra: días entre compras (promedio y mediana), última compra, días desde la última, ' +
    'fecha esperada de la próxima y montos NETOS por compra (promedio, mediana, mínimo, máximo). ' +
    'Usar para "¿cada cuánto compra X?", "¿de cuánto suelen ser sus pedidos?", "¿ya le toca comprar?".',
  parametros: [
    { nombre: 'cliente', tipo: 'string', requerido: true, descripcion: 'Nombre (o parte del nombre) del cliente.' },
    { nombre: 'desde', tipo: 'string', descripcion: 'Fecha inicial YYYY-MM-DD. Por defecto 12 meses atrás.' },
    { nombre: 'hasta', tipo: 'string', descripcion: 'Fecha final YYYY-MM-DD. Por defecto hoy.' },
  ],
  async ejecutar(args, ctx) {
    const cliente = texto(args.cliente) && terminoSeguro(texto(args.cliente)!)
    if (!cliente) return { error: 'Falta el nombre del cliente.' }
    const { desde, hasta } = rango(args, ctx.hoyISO, 365)
    const { filas, truncado } = await traerVentas(ctx, desde, hasta, { cliente })

    // Una "compra" = un día con venta al cliente (varias líneas/pedidos el mismo día cuentan una vez).
    const porCliente = new Map<string, Map<string, number>>()
    for (const f of filas) {
      const k = f.nombre_fantasia ?? '(sin nombre)'
      const dias = porCliente.get(k) ?? new Map<string, number>()
      dias.set(f.fecha_pedido, (dias.get(f.fecha_pedido) ?? 0) + neto(f))
      porCliente.set(k, dias)
    }

    const clientes = [...porCliente.entries()].map(([nombre, dias]) => {
      const fechas = [...dias.keys()].sort()
      const montos = fechas.map(d => dias.get(d)!)
      const intervalos = fechas.slice(1).map((d, i) => diasEntre(fechas[i], d))
      const med = mediana(intervalos)
      const ultima = fechas[fechas.length - 1]
      return {
        cliente: nombre,
        dias_con_compra: fechas.length,
        primera_compra: fechas[0],
        ultima_compra: ultima,
        dias_desde_ultima_compra: diasEntre(ultima, ctx.hoyISO),
        dias_entre_compras_promedio: intervalos.length ? Math.round((intervalos.reduce((a, b) => a + b, 0) / intervalos.length) * 10) / 10 : null,
        dias_entre_compras_mediana: med,
        proxima_compra_esperada: med != null ? sumarDiasISO(ultima, Math.round(med)) : null,
        monto_neto_por_compra: {
          promedio: redondear(montos.reduce((a, b) => a + b, 0) / montos.length),
          mediana: redondear(mediana(montos) ?? 0),
          minimo: redondear(Math.min(...montos)),
          maximo: redondear(Math.max(...montos)),
        },
        neto_total: redondear(montos.reduce((a, b) => a + b, 0)),
        ultimas_compras: fechas.slice(-8).reverse().map(d => ({ fecha: d, neto: redondear(dias.get(d)!) })),
      }
    }).sort((a, b) => b.neto_total - a.neto_total).slice(0, 3)

    return {
      rango: { desde, hasta }, clientes_encontrados: clientes.length, clientes,
      ...(clientes.length === 0 ? { nota: 'Sin ventas de ese cliente en el rango (o el nombre no coincide).' } : {}),
      ...(clientes.some(c => c.dias_con_compra < 3) ? { nota_confiabilidad: 'Con menos de 3 días de compra la frecuencia no es confiable.' } : {}),
      ...(truncado ? { advertencia: 'Se alcanzó el tope de filas: el resultado es parcial.' } : {}),
    }
  },
}

export const clientesInactivos: Consulta = {
  nombre: 'clientes_inactivos',
  descripcion:
    'Clientes que compraban y dejaron de comprar: sin compras hace N días o más, ordenados por cuánto valían (neto histórico). Excluye cuentas internas (Cliente PDV/Feria/Marketing, BaseCamp). ' +
    'Usar para "¿qué clientes dejaron de comprar?", "¿a quién hay que reactivar?", "¿quién no compra hace 2 meses?".',
  parametros: [
    { nombre: 'dias_sin_comprar', tipo: 'integer', descripcion: 'Mínimo de días sin comprar (7-365). Por defecto 60.' },
    { nombre: 'ventana_dias', tipo: 'integer', descripcion: 'Cuántos días atrás mirar el historial (60-365). Por defecto 365.' },
    { nombre: 'min_compras', tipo: 'integer', descripcion: 'Mínimo de días con compra en la ventana para ser cliente habitual (1-20). Por defecto 3.' },
    { nombre: 'limite', tipo: 'integer', descripcion: 'Cuántos devolver (1-30). Por defecto 15.' },
  ],
  async ejecutar(args, ctx) {
    const dias = entero(args.dias_sin_comprar, 60, 7, 365)
    const ventana = entero(args.ventana_dias, 365, 60, 365)
    const minCompras = entero(args.min_compras, 3, 1, 20)
    const limite = entero(args.limite, 15, 1, 30)
    const desde = sumarDiasISO(ctx.hoyISO, -ventana)
    const corte = sumarDiasISO(ctx.hoyISO, -dias)
    const { filas, truncado } = await traerVentas(ctx, desde, ctx.hoyISO)

    const acc = new Map<string, { fechas: Set<string>; neto: number; vendedor: string | null; fechaVendedor: string }>()
    for (const f of filas) {
      const k = f.nombre_fantasia ?? '(sin nombre)'
      const a = acc.get(k) ?? { fechas: new Set<string>(), neto: 0, vendedor: null, fechaVendedor: '' }
      a.fechas.add(f.fecha_pedido); a.neto += neto(f)
      if (f.fecha_pedido >= a.fechaVendedor) { a.vendedor = f.vendedor_actual; a.fechaVendedor = f.fecha_pedido }
      acc.set(k, a)
    }
    const inactivos = [...acc.entries()].flatMap(([cliente, a]) => {
      const fechas = [...a.fechas].sort()
      const ultima = fechas[fechas.length - 1]
      if (ultima > corte || fechas.length < minCompras || esCuentaInterna(cliente)) return []
      const med = mediana(fechas.slice(1).map((d, i) => diasEntre(fechas[i], d)))
      return [{
        cliente, vendedor: a.vendedor, ultima_compra: ultima, dias_sin_comprar: diasEntre(ultima, ctx.hoyISO),
        compras_en_ventana: fechas.length, neto_en_ventana: redondear(a.neto),
        frecuencia_habitual_dias: med != null ? Math.round(med) : null,
      }]
    }).sort((a, b) => b.neto_en_ventana - a.neto_en_ventana)

    return {
      criterio: `sin compras desde ${corte} (${dias}+ días), con ${minCompras}+ días de compra entre ${desde} y hoy`,
      total_inactivos: inactivos.length, clientes: inactivos.slice(0, limite),
      ...(truncado ? { advertencia: 'Se alcanzó el tope de filas: el resultado es parcial.' } : {}),
    }
  },
}
