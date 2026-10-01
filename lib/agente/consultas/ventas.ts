import { categoriaNormalizada, esIngresoReal } from '@/lib/administracion/finanzas'
import { PARAMETROS } from '../sistema'
import {
  type Consulta, type ContextoConsulta, enLotes, entero, rango, redondear, terminoSeguro, texto,
} from './_base'

export interface FilaVenta {
  id: number
  fecha_pedido: string
  nombre_fantasia: string | null
  vendedor_actual: string | null
  localidad: string | null
  producto: string | null
  categoria_producto: string | null
  litros: number | null
  total_sin_impuesto: number | null
  pedido: string | null
}

const COLUMNAS = 'id, fecha_pedido, nombre_fantasia, vendedor_actual, localidad, producto, categoria_producto, litros, total_sin_impuesto, pedido'

/** Ventas del rango, ya filtradas con el mismo criterio de ingreso real que
 *  usa Administración (sin mermas/muestras/tours/clientes internos). */
export async function traerVentas(ctx: ContextoConsulta, desde: string, hasta: string, filtro: { cliente?: string; vendedor?: string } = {}) {
  const base = (columnas: string, opciones?: { count: 'exact'; head: true }) => {
    let q = ctx.admin.from('ventas').select(columnas, opciones)
      .gte('fecha_pedido', desde).lte('fecha_pedido', hasta)
    if (filtro.cliente) q = q.ilike('nombre_fantasia', `%${filtro.cliente}%`)
    if (filtro.vendedor) q = q.ilike('vendedor_actual', `%${filtro.vendedor}%`)
    return q
  }
  // Con el conteo primero las páginas se piden todas a la vez (en serie, 16 mil
  // filas eran ~12 s): el costo pasa a ser el de la página más lenta.
  const { count, error: errCount } = await base('id', { count: 'exact', head: true })
  if (errCount) throw new Error(errCount.message)
  const total = count ?? 0
  const paginas = Math.min(Math.ceil(total / 1000), Math.ceil(PARAMETROS.maxFilasEscaneadas / 1000))
  const lotes = await enLotes(paginas, 8, async i => {
    const { data, error } = await base(COLUMNAS).order('id', { ascending: true }).range(i * 1000, i * 1000 + 999)
    if (error) throw new Error(error.message)
    return (data ?? []) as unknown as FilaVenta[]
  })
  const filas = lotes.flat().filter(esIngresoReal)
  return { filas, truncado: total > PARAMETROS.maxFilasEscaneadas }
}

export const neto = (f: FilaVenta) => Number(f.total_sin_impuesto) || 0
export const litros = (f: FilaVenta) => Number(f.litros) || 0

export const comprasCliente: Consulta = {
  nombre: 'compras_cliente',
  descripcion:
    'Lo que ha comprado un cliente: neto CLP, litros, pedidos, productos favoritos, últimos pedidos y evolución mensual. Si el texto coincide con varios clientes, los separa.',
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

    const porCliente = new Map<string, FilaVenta[]>()
    for (const f of filas) {
      const k = f.nombre_fantasia ?? '(sin nombre)'
      if (!porCliente.has(k)) porCliente.set(k, [])
      porCliente.get(k)!.push(f)
    }

    const clientes = [...porCliente.entries()].map(([nombre, fs]) => {
      const pedidos = new Map<string, { fecha: string; neto: number; litros: number }>()
      const productos = new Map<string, { neto: number; litros: number }>()
      const meses = new Map<string, number>()
      for (const f of fs) {
        const pk = f.pedido ?? `${f.fecha_pedido}#${f.id}`
        const p = pedidos.get(pk) ?? { fecha: f.fecha_pedido, neto: 0, litros: 0 }
        p.neto += neto(f); p.litros += litros(f)
        pedidos.set(pk, p)
        const prod = productos.get(f.producto ?? '(sin producto)') ?? { neto: 0, litros: 0 }
        prod.neto += neto(f); prod.litros += litros(f)
        productos.set(f.producto ?? '(sin producto)', prod)
        const mes = f.fecha_pedido.slice(0, 7)
        meses.set(mes, (meses.get(mes) ?? 0) + neto(f))
      }
      const ultimos = [...pedidos.values()].sort((a, b) => b.fecha.localeCompare(a.fecha))
      return {
        cliente: nombre,
        neto_total: redondear(fs.reduce((s, f) => s + neto(f), 0)),
        litros_total: redondear(fs.reduce((s, f) => s + litros(f), 0)),
        pedidos: pedidos.size,
        primer_pedido: ultimos[ultimos.length - 1]?.fecha ?? null,
        ultimo_pedido: ultimos[0]?.fecha ?? null,
        ticket_promedio_neto: pedidos.size ? redondear(fs.reduce((s, f) => s + neto(f), 0) / pedidos.size) : 0,
        top_productos: [...productos.entries()]
          .sort((a, b) => b[1].neto - a[1].neto).slice(0, 5)
          .map(([producto, v]) => ({ producto, neto: redondear(v.neto), litros: redondear(v.litros) })),
        ultimos_pedidos: ultimos.slice(0, 5).map(p => ({ fecha: p.fecha, neto: redondear(p.neto), litros: redondear(p.litros) })),
        neto_por_mes: [...meses.entries()].sort((a, b) => a[0].localeCompare(b[0]))
          .map(([mes, v]) => ({ mes, neto: redondear(v) })),
      }
    }).sort((a, b) => b.neto_total - a.neto_total).slice(0, 5)

    return {
      rango: { desde, hasta },
      clientes_encontrados: clientes.length,
      clientes,
      ...(clientes.length === 0 ? { nota: 'Sin ventas de ese cliente en el rango (o el nombre no coincide).' } : {}),
      ...(truncado ? { advertencia: 'Se alcanzó el tope de filas: el resultado es parcial.' } : {}),
    }
  },
}

export const topClientes: Consulta = {
  nombre: 'top_clientes',
  descripcion:
    'Ranking de clientes que más compran en un período, por neto CLP o litros; opcionalmente de un vendedor.',
  parametros: [
    { nombre: 'desde', tipo: 'string', descripcion: 'Fecha inicial YYYY-MM-DD. Por defecto 90 días atrás.' },
    { nombre: 'hasta', tipo: 'string', descripcion: 'Fecha final YYYY-MM-DD. Por defecto hoy.' },
    { nombre: 'limite', tipo: 'integer', descripcion: 'Cuántos clientes devolver (1-30). Por defecto 10.' },
    { nombre: 'ordenar_por', tipo: 'string', enum: ['neto', 'litros'], descripcion: 'Criterio del ranking. Por defecto neto.' },
    { nombre: 'vendedor', tipo: 'string', descripcion: 'Limita el ranking a las ventas de un vendedor (nombre o parte). Omitir para todos.' },
  ],
  async ejecutar(args, ctx) {
    const { desde, hasta } = rango(args, ctx.hoyISO, 90)
    const limite = entero(args.limite, 10, 1, 30)
    const porLitros = args.ordenar_por === 'litros'
    const vendedor = texto(args.vendedor) ? terminoSeguro(texto(args.vendedor)!) : undefined
    const { filas, truncado } = await traerVentas(ctx, desde, hasta, { vendedor })

    const acc = new Map<string, { neto: number; litros: number; pedidos: Set<string> }>()
    for (const f of filas) {
      const k = f.nombre_fantasia ?? '(sin nombre)'
      const a = acc.get(k) ?? { neto: 0, litros: 0, pedidos: new Set<string>() }
      a.neto += neto(f); a.litros += litros(f); a.pedidos.add(f.pedido ?? `${f.fecha_pedido}#${f.id}`)
      acc.set(k, a)
    }
    const totalNeto = filas.reduce((s, f) => s + neto(f), 0)
    const ranking = [...acc.entries()]
      .sort((a, b) => porLitros ? b[1].litros - a[1].litros : b[1].neto - a[1].neto)
      .slice(0, limite)
      .map(([cliente, v], i) => ({
        puesto: i + 1, cliente, neto: redondear(v.neto), litros: redondear(v.litros), pedidos: v.pedidos.size,
        participacion_neto_pct: totalNeto > 0 ? Math.round((v.neto / totalNeto) * 1000) / 10 : 0,
      }))
    return {
      rango: { desde, hasta }, ordenado_por: porLitros ? 'litros' : 'neto', ...(vendedor ? { vendedor_filtrado: vendedor } : {}),
      clientes_totales_en_rango: acc.size, neto_total_rango: redondear(totalNeto), ranking,
      ...(truncado ? { advertencia: 'Se alcanzó el tope de filas: el ranking es parcial.' } : {}),
    }
  },
}

export const ventasResumen: Consulta = {
  nombre: 'ventas_resumen',
  descripcion:
    'Ventas NETAS CLP y litros de un período, agrupadas por mes, producto, categoría, vendedor o localidad; opcionalmente de un vendedor. Incluye clientes_distintos y pedidos_distintos.',
  parametros: [
    { nombre: 'desde', tipo: 'string', descripcion: 'Fecha inicial YYYY-MM-DD. Por defecto 90 días atrás.' },
    { nombre: 'hasta', tipo: 'string', descripcion: 'Fecha final YYYY-MM-DD. Por defecto hoy.' },
    {
      nombre: 'agrupar_por', tipo: 'string', enum: ['mes', 'producto', 'categoria', 'vendedor', 'localidad'],
      descripcion: 'Dimensión de agrupación. Por defecto mes.',
    },
    { nombre: 'vendedor', tipo: 'string', descripcion: 'Limita el resumen a las ventas de un vendedor (nombre o parte). Omitir para todos.' },
  ],
  async ejecutar(args, ctx) {
    const { desde, hasta } = rango(args, ctx.hoyISO, 90)
    const dim = ['mes', 'producto', 'categoria', 'vendedor', 'localidad'].includes(String(args.agrupar_por))
      ? String(args.agrupar_por) : 'mes'
    const vendedor = texto(args.vendedor) ? terminoSeguro(texto(args.vendedor)!) : undefined
    const { filas, truncado } = await traerVentas(ctx, desde, hasta, { vendedor })

    const clave = (f: FilaVenta): string => {
      if (dim === 'mes') return f.fecha_pedido.slice(0, 7)
      if (dim === 'producto') return f.producto ?? '(sin producto)'
      if (dim === 'categoria') return categoriaNormalizada(f.producto, f.categoria_producto)
      if (dim === 'vendedor') return f.vendedor_actual ?? '(sin vendedor)'
      return f.localidad ?? '(sin localidad)'
    }
    const acc = new Map<string, { neto: number; litros: number }>()
    for (const f of filas) {
      const k = clave(f)
      const a = acc.get(k) ?? { neto: 0, litros: 0 }
      a.neto += neto(f); a.litros += litros(f)
      acc.set(k, a)
    }
    const filasOut = [...acc.entries()]
      .sort((a, b) => dim === 'mes' ? a[0].localeCompare(b[0]) : b[1].neto - a[1].neto)
      .slice(0, 40)
      .map(([k, v]) => ({ [dim]: k, neto: redondear(v.neto), litros: redondear(v.litros) }))
    return {
      rango: { desde, hasta }, agrupado_por: dim, ...(vendedor ? { vendedor_filtrado: vendedor } : {}),
      clientes_distintos: new Set(filas.map(f => f.nombre_fantasia)).size,
      pedidos_distintos: new Set(filas.map(f => f.pedido ?? `${f.fecha_pedido}#${f.id}`)).size,
      neto_total: redondear(filas.reduce((s, f) => s + neto(f), 0)),
      litros_total: redondear(filas.reduce((s, f) => s + litros(f), 0)),
      filas: filasOut,
      ...(acc.size > 40 ? { nota: `Se muestran las 40 primeras de ${acc.size} filas.` } : {}),
      ...(truncado ? { advertencia: 'Se alcanzó el tope de filas: el resultado es parcial.' } : {}),
    }
  },
}
