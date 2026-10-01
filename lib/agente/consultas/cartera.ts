import { esClienteExcluido } from '@/lib/types'
import { type Consulta, entero, rango, redondear, terminoSeguro, texto } from './_base'

export const buscarCliente: Consulta = {
  nombre: 'buscar_cliente',
  descripcion:
    'Busca clientes por nombre y devuelve su ficha: razón social, vendedor, localidad, categoría y plazo de pago pactado. ' +
    'Usar primero cuando el nombre del cliente es ambiguo o para confirmar cómo se escribe exactamente.',
  parametros: [
    { nombre: 'texto', tipo: 'string', requerido: true, descripcion: 'Parte del nombre del cliente.' },
  ],
  async ejecutar(args, ctx) {
    const t = texto(args.texto) && terminoSeguro(texto(args.texto)!)
    if (!t) return { error: 'Falta el texto a buscar.' }
    const { data, error } = await ctx.admin.from('clientes')
      .select('nombre_fantasia, razon_social, vendedor, localidad, provincia, categoria, tipo, dias_pago, limite_cta_cte')
      .or(`nombre_fantasia.ilike.%${t}%,razon_social.ilike.%${t}%`)
      .order('nombre_fantasia').limit(10)
    if (error) throw new Error(error.message)
    return { coincidencias: data?.length ?? 0, clientes: data ?? [] }
  },
}

export const deudaClientes: Consulta = {
  nombre: 'deuda_clientes',
  descripcion:
    'Deuda por cobrar (cuenta corriente) en CLP: saldo total, deuda vencida y su antigüedad por tramos. ' +
    'Con `cliente` devuelve ese cliente; sin él, el ranking de mayores deudores vencidos. ' +
    'Sin `cliente` también devuelve el total adeudado de todos los deudores. Se puede filtrar por `vendedor`. ' +
    'Usar para "¿cuánto nos debe X?", "¿quiénes son los clientes que nos deben?", "¿cuánto nos deben en total?", "¿qué deben los clientes de Claudio?". ' +
    'Es el informe Deudores del ERP (foto actual).',
  parametros: [
    { nombre: 'cliente', tipo: 'string', descripcion: 'Nombre (o parte) del cliente. Omitir para el ranking general.' },
    { nombre: 'vendedor', tipo: 'string', descripcion: 'Filtra el ranking por vendedor (nombre o parte). Omitir para todos.' },
    { nombre: 'solo_vencida', tipo: 'string', enum: ['si', 'no'], descripcion: 'Con "si" (por defecto) solo cuentas con deuda vencida; con "no" también las que están al día.' },
    { nombre: 'limite', tipo: 'integer', descripcion: 'Cuántos devolver en el ranking (1-50). Por defecto 10.' },
  ],
  async ejecutar(args, ctx) {
    const cliente = texto(args.cliente) && terminoSeguro(texto(args.cliente)!)
    const vendedor = texto(args.vendedor) && terminoSeguro(texto(args.vendedor)!)
    const soloVencida = args.solo_vencida !== 'no'
    let q = ctx.admin.from('deudores').select(
      'nombre_fantasia, vendedor, saldo_total, deuda_vencida, deuda_menor_14_dias, deuda_entre_15_29_dias, ' +
      'deuda_entre_30_44_dias, deuda_entre_45_59_dias, deuda_entre_60_89_dias, deuda_mas_90_dias, ultimo_pago, limite_cta_cte, updated_at'
    )
    if (cliente) q = q.ilike('nombre_fantasia', `%${cliente}%`)
    if (vendedor) q = q.ilike('vendedor', `%${vendedor}%`)
    // La tabla entera son ~400 filas (< 1000): se trae completa para poder totalizar sobre TODOS los deudores y no sólo el top.
    const { data, error } = await q.order('deuda_vencida', { ascending: false }).limit(1000)
    if (error) throw new Error(error.message)
    type Fila = Record<string, number | string | null>
    let filas = (data ?? []) as unknown as Fila[]
    // Sin cliente puntual, el ranking omite cuentas internas (marketing, ferias, personal) y, por defecto, las que no tienen deuda vencida.
    if (!cliente) {
      filas = filas.filter(f => !esClienteExcluido(String(f.nombre_fantasia ?? '')) && (!soloVencida || (Number(f.deuda_vencida) || 0) > 0))
    }
    const n = (v: unknown) => redondear(Number(v) || 0)
    const totales = {
      cuentas: filas.length,
      saldo_total: filas.reduce((s, f) => s + n(f.saldo_total), 0),
      deuda_vencida: filas.reduce((s, f) => s + n(f.deuda_vencida), 0),
    }
    filas = filas.slice(0, cliente ? 10 : entero(args.limite, 10, 1, 50))
    return {
      informe_actualizado: filas.map(f => String(f.updated_at ?? '')).sort().pop()?.slice(0, 10) ?? null,
      ...(cliente ? {} : { totales_del_criterio: totales }),
      deudores: filas.map(f => ({
        cliente: f.nombre_fantasia, vendedor: f.vendedor,
        saldo_total: n(f.saldo_total), deuda_vencida: n(f.deuda_vencida),
        tramos: {
          hasta_14_dias: n(f.deuda_menor_14_dias), de_15_a_29: n(f.deuda_entre_15_29_dias),
          de_30_a_44: n(f.deuda_entre_30_44_dias), de_45_a_59: n(f.deuda_entre_45_59_dias),
          de_60_a_89: n(f.deuda_entre_60_89_dias), mas_de_90: n(f.deuda_mas_90_dias),
        },
        ultimo_pago: f.ultimo_pago ? String(f.ultimo_pago).slice(0, 10) : null,
        limite_credito: f.limite_cta_cte != null ? n(f.limite_cta_cte) : null,
      })),
      ...(filas.length === 0 ? { nota: 'Sin deuda registrada para ese criterio.' } : {}),
    }
  },
}

export const comportamientoPagoCliente: Consulta = {
  nombre: 'comportamiento_pago_cliente',
  descripcion:
    'Cómo paga un cliente: plazo PACTADO en su ficha vs. días reales que se demora (mediana medida sobre sus pagos) y sus últimos pagos. ' +
    'Usar para "¿paga a tiempo X?", "¿en cuántos días nos paga?".',
  parametros: [
    { nombre: 'cliente', tipo: 'string', requerido: true, descripcion: 'Nombre (o parte) del cliente.' },
  ],
  async ejecutar(args, ctx) {
    const cliente = texto(args.cliente) && terminoSeguro(texto(args.cliente)!)
    if (!cliente) return { error: 'Falta el nombre del cliente.' }
    const [{ data: fichas, error: e1 }, { data: pagos, error: e2 }] = await Promise.all([
      ctx.admin.from('clientes')
        .select('nombre_fantasia, dias_pago, dias_pago_real_mediana, dias_pago_real_muestras')
        .ilike('nombre_fantasia', `%${cliente}%`).limit(5),
      ctx.admin.from('cobros_erp')
        .select('fecha, cliente, monto, metodo, dias_pago')
        .ilike('cliente', `%${cliente}%`).order('fecha', { ascending: false }).limit(10),
    ])
    if (e1) throw new Error(e1.message)
    if (e2) throw new Error(e2.message)
    return {
      fichas: (fichas ?? []).map(f => ({
        cliente: f.nombre_fantasia,
        plazo_pactado_dias: f.dias_pago,
        dias_reales_mediana: f.dias_pago_real_mediana,
        pagos_medidos: f.dias_pago_real_muestras,
      })),
      ultimos_pagos: (pagos ?? []).map(p => ({
        fecha: p.fecha, cliente: p.cliente, monto: redondear(Number(p.monto) || 0), metodo: p.metodo, dias_hasta_pago: p.dias_pago,
      })),
    }
  },
}

export const cobrosResumen: Consulta = {
  nombre: 'cobros_resumen',
  descripcion:
    'Plata que ENTRÓ de verdad (pagos recibidos, informe Movimientos Cta. Cte. del ERP) por semana y por medio de pago, en CLP. ' +
    'Usar para "¿cuánto entró esta semana/este mes?", "¿cuánto cobramos por semana?", "¿cómo nos pagan (transferencia, tarjeta...)?". ' +
    'No es lo vendido ni lo que se debe: es dinero ya recibido.',
  parametros: [
    { nombre: 'desde', tipo: 'string', descripcion: 'Fecha inicial YYYY-MM-DD. Por defecto 8 semanas atrás.' },
    { nombre: 'hasta', tipo: 'string', descripcion: 'Fecha final YYYY-MM-DD. Por defecto hoy.' },
  ],
  async ejecutar(args, ctx) {
    const { desde, hasta } = rango(args, ctx.hoyISO, 56)
    // La RPC agrega por semana (lunes) y medio de pago en la base: no trae las ~19 mil filas de pagos.
    const { data, error } = await ctx.admin.rpc('cobros_por_semana', { p_desde: desde })
    if (error) throw new Error(error.message)
    const filas = ((data ?? []) as { semana: string; metodo: string; monto: number }[])
      .map(f => ({ semana: String(f.semana).slice(0, 10), metodo: f.metodo, monto: Number(f.monto) || 0 }))
      .filter(f => f.semana <= hasta)
    const porSemana = new Map<string, number>()
    const porMetodo = new Map<string, number>()
    for (const f of filas) {
      porSemana.set(f.semana, (porSemana.get(f.semana) ?? 0) + f.monto)
      porMetodo.set(f.metodo, (porMetodo.get(f.metodo) ?? 0) + f.monto)
    }
    const ultimoPago = filas.map(f => f.semana).sort().pop() ?? null
    return {
      rango: { desde, hasta },
      total_cobrado: redondear([...porSemana.values()].reduce((a, b) => a + b, 0)),
      por_semana: [...porSemana.entries()].sort((a, b) => a[0].localeCompare(b[0]))
        .map(([semana_lunes, monto]) => ({ semana_lunes, monto: redondear(monto) })),
      por_medio_de_pago: [...porMetodo.entries()].sort((a, b) => b[1] - a[1])
        .map(([metodo, monto]) => ({ metodo, monto: redondear(monto) })),
      ultima_semana_con_pagos: ultimoPago,
      nota: 'Los pagos se cargan desde el ERP cada 6 horas; la semana en curso puede estar incompleta. La primera semana puede incluir días anteriores a "desde".',
    }
  },
}
