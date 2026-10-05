import { type Consulta, entero, redondear, sumarDiasISO, terminoSeguro, texto } from './_base'
import { esClienteExcluido } from '@/lib/types'
import { normalizarProducto } from '@/lib/produccion/reglas'
import { nombresDeVendedores } from '../correos'
import { filtroVendedor, notaAlcance } from '../alcance'
import { stockActual } from './stock'

/**
 * HERRAMIENTAS COMERCIALES (5-oct-2026): lo que un vendedor necesita para su
 * cartera. Todas filtran con `filtroVendedor` (modo vendedor = sólo su cartera),
 * devuelven el vendedor con su nombre en la app (nunca un correo) y NUNCA
 * pasan teléfonos al modelo aunque la función SQL los traiga.
 */

/** Carteras que no son un vendedor (mismas que clientes_proximos_a_pedir). */
const CARTERA_SIN_VENDEDOR = /^(inactivo|no indica|incobrable|transici|equipo ventas|cervecer|online$)/i
const esCarteraReal = (v: string | null) => !CARTERA_SIN_VENDEDOR.test((v ?? '').trim())
const coincideCliente = (nombre: string, buscado: string | null) => !buscado || nombre.toLowerCase().includes(buscado.toLowerCase())

/* ── 1. Pedido sugerido ─────────────────────────────────────────────────── */

export const pedidoSugeridoCliente: Consulta = {
  nombre: 'pedido_sugerido_cliente',
  descripcion:
    'Qué ofrecerle a un cliente: sus productos y formatos habituales con los litros que suele pedir de cada uno (historial de pedidos). Para uno o varios clientes de un vendedor. Útil para armar el correo de "clientes por pedir".',
  parametros: [
    { nombre: 'cliente', tipo: 'string', descripcion: 'Cliente (o parte del nombre). Si se omite, trae los clientes del vendedor.' },
    { nombre: 'vendedor', tipo: 'string', descripcion: 'Vendedor (opcional).' },
    { nombre: 'productos_por_cliente', tipo: 'integer', descripcion: 'Cuántos productos por cliente (1-5). Por defecto 3.' },
  ],
  async ejecutar(args, ctx) {
    const cliente = texto(args.cliente) && terminoSeguro(texto(args.cliente)!)
    const vendedorPedido = texto(args.vendedor)
    if (!cliente && !vendedorPedido && !ctx.alcance) return { error: 'Indica un cliente o un vendedor.' }
    const top = entero(args.productos_por_cliente, 3, 1, 5)
    const [{ data, error }, nombreVendedor] = await Promise.all([
      ctx.admin.rpc('get_pedido_sugerido', { p_vendedor: null }),
      nombresDeVendedores(ctx.admin),
    ])
    if (error) throw new Error(error.message)
    // get_pedido_sugerido no trae el vendedor: se toma de los scores del cliente.
    const { data: scores } = await ctx.admin.rpc('get_client_scores', { p_vendedor: null })
    const vendedorDe = new Map<string, string | null>()
    for (const s of (scores ?? []) as { nombre_fantasia: string; vendedor_actual: string | null }[]) vendedorDe.set(s.nombre_fantasia, s.vendedor_actual)

    const filtro = filtroVendedor(ctx, vendedorPedido)
    const porCliente = new Map<string, { producto: string; envase: string | null; litros_tipicos: number; veces: number }[]>()
    for (const f of (data ?? []) as { nombre_fantasia: string; producto: string; envase: string | null; litros_tipico: number; frecuencia: number; rank: number }[]) {
      if (f.rank > top || esClienteExcluido(f.nombre_fantasia) || !coincideCliente(f.nombre_fantasia, cliente)) continue
      const erp = vendedorDe.get(f.nombre_fantasia) ?? null
      if (!filtro(erp, nombreVendedor(erp))) continue
      const lista = porCliente.get(f.nombre_fantasia) ?? []
      lista.push({ producto: f.producto, envase: f.envase, litros_tipicos: Number(f.litros_tipico), veces: Number(f.frecuencia) })
      porCliente.set(f.nombre_fantasia, lista)
    }
    const clientes = [...porCliente.entries()].slice(0, 40).map(([c, productos]) => ({
      cliente: c, vendedor: nombreVendedor(vendedorDe.get(c) ?? null), productos,
    }))
    return {
      clientes,
      ...(porCliente.size > clientes.length ? { advertencia: `Se muestran 40 de ${porCliente.size} clientes; filtra por cliente.` } : {}),
      ...(clientes.length === 0 ? { nota: 'Sin historial suficiente para sugerir (o el cliente no está en esa cartera).' } : {}),
      ...notaAlcance(ctx),
    }
  },
}

/* ── 2. Cobranza por vendedor ───────────────────────────────────────────── */

export const cobranzaVendedor: Consulta = {
  nombre: 'cobranza_vendedor',
  descripcion:
    'Facturas impagas con su vencimiento (entrega + plazo de la ficha), por vendedor y cliente: cuánto está vencido y hace cuántos días. Para "¿qué tiene que cobrar X?" y antes de un correo de cobranza al vendedor. Montos NETOS.',
  parametros: [
    { nombre: 'vendedor', tipo: 'string', descripcion: 'Vendedor (opcional; sin él, resumen de todos).' },
    { nombre: 'solo_vencidas', tipo: 'string', enum: ['si', 'no'], descripcion: 'Por defecto "si": sólo lo ya vencido.' },
    { nombre: 'meses', tipo: 'integer', descripcion: 'Antigüedad máxima de las entregas (1-12 meses). Por defecto 6.' },
  ],
  async ejecutar(args, ctx) {
    const soloVencidas = texto(args.solo_vencidas) !== 'no'
    const meses = entero(args.meses, 6, 1, 12)
    const [{ data, error }, nombreVendedor] = await Promise.all([
      ctx.admin.rpc('cobranza_facturas_impagas', { p_desde: sumarDiasISO(ctx.hoyISO, -meses * 31) }),
      nombresDeVendedores(ctx.admin),
    ])
    if (error) throw new Error(error.message)
    const filtro = filtroVendedor(ctx, texto(args.vendedor))
    type F = { numero_factura: string; cliente: string; vendedor: string; fecha_entrega: string; neto: number; litros: number; dias_pago: number | null; vence: string | null; dias_vencida: number | null }
    const facturas = ((data ?? []) as F[])
      .filter(f => !esClienteExcluido(f.cliente) && filtro(f.vendedor, nombreVendedor(f.vendedor)))
      .filter(f => !soloVencidas || (f.dias_vencida ?? 0) > 0)

    const porVendedor = new Map<string, { facturas: number; neto: number; clientes: Set<string> }>()
    const porCliente = new Map<string, { vendedor: string | null; facturas: number; neto: number; litros: number; max_dias_vencida: number; sin_plazo: boolean }>()
    for (const f of facturas) {
      const v = nombreVendedor(f.vendedor) ?? 'Sin vendedor'
      const pv = porVendedor.get(v) ?? { facturas: 0, neto: 0, clientes: new Set<string>() }
      pv.facturas++; pv.neto += Number(f.neto); pv.clientes.add(f.cliente); porVendedor.set(v, pv)
      const pc = porCliente.get(f.cliente) ?? { vendedor: v, facturas: 0, neto: 0, litros: 0, max_dias_vencida: 0, sin_plazo: false }
      pc.facturas++; pc.neto += Number(f.neto); pc.litros += Number(f.litros)
      pc.max_dias_vencida = Math.max(pc.max_dias_vencida, f.dias_vencida ?? 0); pc.sin_plazo ||= f.dias_pago == null
      porCliente.set(f.cliente, pc)
    }
    const clientes = [...porCliente.entries()].sort((a, b) => b[1].neto - a[1].neto).slice(0, 40)
      .map(([cliente, c]) => ({ cliente, ...c, neto: redondear(c.neto), litros: redondear(c.litros) }))
    return {
      criterio: soloVencidas ? 'Sólo facturas vencidas' : 'Todas las facturas impagas',
      total_neto: redondear(facturas.reduce((s, f) => s + Number(f.neto), 0)),
      facturas: facturas.length,
      por_vendedor: Object.fromEntries([...porVendedor].sort((a, b) => b[1].neto - a[1].neto)
        .map(([v, x]) => [v, { facturas: x.facturas, clientes: x.clientes.size, neto: redondear(x.neto) }])),
      clientes,
      nota: 'Neto sin IVA. Pagada = la factura tiene algún pago en el ERP. Vencida = entrega + plazo de la ficha ya pasó.',
      ...notaAlcance(ctx),
    }
  },
}

/* ── 3. Clientes con volumen en baja ────────────────────────────────────── */

export const clientesVolumenBaja: Consulta = {
  nombre: 'clientes_volumen_baja',
  descripcion:
    'Clientes activos que están comprando menos que antes: litros de sus últimos 3 pedidos vs. su promedio histórico, con % de caída y días sin compra. Detecta clientes en riesgo antes de que dejen de comprar.',
  parametros: [
    { nombre: 'vendedor', tipo: 'string', descripcion: 'Vendedor (opcional).' },
    { nombre: 'caida_minima_pct', tipo: 'integer', descripcion: 'Caída mínima en % (10-90). Por defecto 25.' },
  ],
  async ejecutar(args, ctx) {
    const umbral = entero(args.caida_minima_pct, 25, 10, 90) / 100
    const [{ data, error }, nombreVendedor] = await Promise.all([
      ctx.admin.rpc('get_clientes_volumen_baja', { p_vendedor: null, p_umbral: umbral }),
      nombresDeVendedores(ctx.admin),
    ])
    if (error) throw new Error(error.message)
    const filtro = filtroVendedor(ctx, texto(args.vendedor))
    const vistos = new Set<string>()
    const clientes = ((data ?? []) as { nombre_fantasia: string; vendedor_actual: string | null; segmento: string | null; litros_reciente: number; litros_baseline: number; caida_pct: number; pedidos_totales: number; dias_sin_compra: number }[])
      .filter(f => esCarteraReal(f.vendedor_actual) && filtro(f.vendedor_actual, nombreVendedor(f.vendedor_actual)))
      .filter(f => (vistos.has(f.nombre_fantasia) ? false : (vistos.add(f.nombre_fantasia), true)))
      .slice(0, 40)
      .map(f => ({
        cliente: f.nombre_fantasia, vendedor: nombreVendedor(f.vendedor_actual), segmento: f.segmento,
        litros_por_pedido_reciente: Number(f.litros_reciente), litros_por_pedido_historico: Number(f.litros_baseline),
        caida_pct: Number(f.caida_pct), pedidos: Number(f.pedidos_totales), dias_sin_compra: f.dias_sin_compra,
      }))
    return { umbral_pct: umbral * 100, clientes, nota: 'Reciente = promedio de los últimos 3 pedidos; histórico = los anteriores. Sólo clientes activos con 5+ pedidos.', ...notaAlcance(ctx) }
  },
}

/* ── 4. Venta cruzada ───────────────────────────────────────────────────── */

export const ventaCruzada: Consulta = {
  nombre: 'venta_cruzada',
  descripcion:
    'Oportunidades de venta cruzada: clientes que no compran una categoría (Cerveza/Kombucha) que sí compra la mayoría de los clientes de su mismo rubro (ej. botillerías que no llevan kombucha), con el % de pares que la compran.',
  parametros: [
    { nombre: 'vendedor', tipo: 'string', descripcion: 'Vendedor (opcional).' },
    { nombre: 'categoria', tipo: 'string', enum: ['Cerveza', 'Kombucha'], descripcion: 'Categoría a ofrecer (opcional).' },
  ],
  async ejecutar(args, ctx) {
    const [{ data, error }, nombreVendedor] = await Promise.all([
      ctx.admin.rpc('get_cross_sell', { p_vendedor: null, p_min_penetracion: 0.4 }),
      nombresDeVendedores(ctx.admin),
    ])
    if (error) throw new Error(error.message)
    const filtro = filtroVendedor(ctx, texto(args.vendedor))
    const cat = texto(args.categoria)
    const filas = ((data ?? []) as { nombre_fantasia: string; vendedor_actual: string | null; categoria_negocio: string | null; categoria_sugerida: string; peers_pct: number }[])
      .filter(f => esCarteraReal(f.vendedor_actual) && filtro(f.vendedor_actual, nombreVendedor(f.vendedor_actual)))
      .filter(f => !cat || f.categoria_sugerida === cat)
      .sort((a, b) => Number(b.peers_pct) - Number(a.peers_pct))
    return {
      total: filas.length,
      oportunidades: filas.slice(0, 40).map(f => ({
        cliente: f.nombre_fantasia, vendedor: nombreVendedor(f.vendedor_actual), rubro: f.categoria_negocio,
        ofrecer: f.categoria_sugerida, pct_de_su_rubro_que_la_compra: Number(f.peers_pct),
      })),
      ...notaAlcance(ctx),
    }
  },
}

/* ── 5. Avance del período ──────────────────────────────────────────────── */

export const avanceMetas: Consulta = {
  nombre: 'avance_metas',
  descripcion:
    'Avance del período comercial en curso (tabla periodos, ej. "Octubre 2026" del 24 al 23): litros ENTREGADOS por vendedor hasta hoy vs. los mismos días del período anterior, y la meta cargada si existe.',
  parametros: [{ nombre: 'vendedor', tipo: 'string', descripcion: 'Vendedor (opcional).' }],
  async ejecutar(args, ctx) {
    // El período que contiene HOY y el anterior (la tabla ya trae períodos futuros cargados).
    const { data: periodos, error: ep } = await ctx.admin.from('periodos').select('id, nombre, fecha_inicio, fecha_fin')
      .lte('fecha_inicio', ctx.hoyISO).order('fecha_inicio', { ascending: false }).limit(2)
    if (ep) throw new Error(ep.message)
    const activo = (periodos ?? [])[0]
    if (!activo) return { nota: 'No hay períodos cargados.' }
    const anterior = (periodos ?? [])[1]
    const transcurridos = Math.max(1, Math.round((Date.parse(`${ctx.hoyISO}T00:00:00Z`) - Date.parse(`${activo.fecha_inicio}T00:00:00Z`)) / 86_400_000) + 1)
    const hastaActual = ctx.hoyISO < activo.fecha_fin ? ctx.hoyISO : activo.fecha_fin
    const hastaAnterior = anterior ? sumarDiasISO(anterior.fecha_inicio, transcurridos - 1) : null

    const litrosPorVendedor = async (desde: string, hasta: string) => {
      const acc = new Map<string, number>()
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await ctx.admin.from('ventas').select('vendedor_actual, litros')
          .gte('fecha_entrega', desde).lte('fecha_entrega', hasta).eq('entrega_informada', true)
          .eq('cliente_excluido', false).eq('producto_excluido', false)
          .range(offset, offset + 999)
        if (error) throw new Error(error.message)
        for (const f of data ?? []) acc.set(f.vendedor_actual ?? 'Sin vendedor', (acc.get(f.vendedor_actual ?? 'Sin vendedor') ?? 0) + (Number(f.litros) || 0))
        if (!data || data.length < 1000) break
      }
      return acc
    }
    const [actual, previo, nombreVendedor, metasRes] = await Promise.all([
      litrosPorVendedor(activo.fecha_inicio, hastaActual),
      anterior && hastaAnterior ? litrosPorVendedor(anterior.fecha_inicio, hastaAnterior) : Promise.resolve(new Map<string, number>()),
      nombresDeVendedores(ctx.admin),
      ctx.admin.from('metas').select('vendedor, categoria_negocio, meta_litros').eq('tipo', 'mensual').lte('fecha_inicio', ctx.hoyISO).gte('fecha_fin', ctx.hoyISO),
    ])
    const filtro = filtroVendedor(ctx, texto(args.vendedor))
    const juntar = (m: Map<string, number>) => {
      const r = new Map<string, number>()
      for (const [erp, l] of m) if (esCarteraReal(erp) && filtro(erp, nombreVendedor(erp))) r.set(nombreVendedor(erp) ?? erp, (r.get(nombreVendedor(erp) ?? erp) ?? 0) + l)
      return r
    }
    const a = juntar(actual), p = juntar(previo)
    const vendedores = [...new Set([...a.keys(), ...p.keys()])]
      .map(v => ({ vendedor: v, litros_periodo: redondear(a.get(v) ?? 0), litros_mismos_dias_anterior: redondear(p.get(v) ?? 0),
        variacion_pct: (p.get(v) ?? 0) > 0 ? Math.round((((a.get(v) ?? 0) / p.get(v)!) - 1) * 100) : null }))
      .sort((x, y) => y.litros_periodo - x.litros_periodo)
    const metas = metasRes.data ?? []
    return {
      periodo: { nombre: activo.nombre, desde: activo.fecha_inicio, hasta: activo.fecha_fin, dias_transcurridos: transcurridos },
      comparado_con: anterior ? { nombre: anterior.nombre, desde: anterior.fecha_inicio, hasta: hastaAnterior } : null,
      vendedores,
      metas: metas.length
        ? metas.map(m => ({ responsable: m.vendedor, canal: m.categoria_negocio, meta_litros: Number(m.meta_litros) }))
        : 'No hay metas cargadas para este período (las últimas son de julio 2026 y por canal, no por vendedor). Dilo y muestra el avance real.',
      nota: 'Litros entregados (fecha de entrega), sin cuentas internas.',
      ...notaAlcance(ctx),
    }
  },
}

/* ── 6. Barriles en clientes ────────────────────────────────────────────── */

export const barrilesEnClientes: Consulta = {
  nombre: 'barriles_en_clientes',
  descripcion:
    'Barriles retornables (activos de la empresa) que están en clientes, con hace cuántos días se entregaron. Para "¿quién tiene barriles hace mucho?" y pedir su retiro al vendedor.',
  parametros: [
    { nombre: 'vendedor', tipo: 'string', descripcion: 'Vendedor (opcional).' },
    { nombre: 'min_dias', tipo: 'integer', descripcion: 'Sólo barriles entregados hace al menos N días (0-365). Por defecto 60.' },
  ],
  async ejecutar(args, ctx) {
    const minDias = entero(args.min_dias, 60, 0, 365)
    const [{ data, error }, nombreVendedor] = await Promise.all([
      ctx.admin.from('barriles_clientes').select('nombre_fantasia, producto, litros, vendedor, fecha_entrega').limit(1000),
      nombresDeVendedores(ctx.admin),
    ])
    if (error) throw new Error(error.message)
    const filtro = filtroVendedor(ctx, texto(args.vendedor))
    const hoy = Date.parse(`${ctx.hoyISO}T00:00:00Z`)
    const filas = (data ?? [])
      .map(b => ({ ...b, dias: b.fecha_entrega ? Math.floor((hoy - Date.parse(b.fecha_entrega)) / 86_400_000) : null }))
      .filter(b => (b.dias ?? 0) >= minDias && filtro(b.vendedor, nombreVendedor(b.vendedor)))
    const porCliente = new Map<string, { vendedor: string | null; barriles: number; litros: number; mas_antiguo_dias: number; productos: Set<string> }>()
    for (const b of filas) {
      const c = porCliente.get(b.nombre_fantasia) ?? { vendedor: nombreVendedor(b.vendedor), barriles: 0, litros: 0, mas_antiguo_dias: 0, productos: new Set<string>() }
      c.barriles++; c.litros += Number(b.litros) || 0; c.mas_antiguo_dias = Math.max(c.mas_antiguo_dias, b.dias ?? 0)
      if (b.producto) c.productos.add(b.producto)
      porCliente.set(b.nombre_fantasia, c)
    }
    const clientes = [...porCliente.entries()].sort((a, b) => b[1].mas_antiguo_dias - a[1].mas_antiguo_dias).slice(0, 40)
      .map(([cliente, c]) => ({ cliente, vendedor: c.vendedor, barriles: c.barriles, litros: redondear(c.litros), mas_antiguo_dias: c.mas_antiguo_dias, productos: [...c.productos].slice(0, 4) }))
    return { min_dias: minDias, total_barriles: filas.length, clientes, ...notaAlcance(ctx) }
  },
}

/* ── 7. Quiebre de stock próximo ────────────────────────────────────────── */

export const quiebreStock: Consulta = {
  nombre: 'quiebre_stock',
  descripcion:
    'Qué productos se acaban ANTES de que llegue su próximo lote: fecha estimada de quiebre (stock ÷ demanda del ciclo) vs. el próximo lote del plan de producción. Para no prometer algo que no habrá.',
  parametros: [{ nombre: 'dias', tipo: 'integer', descripcion: 'Horizonte en días (7-90). Por defecto 30.' }],
  async ejecutar(args, ctx) {
    const horizonte = entero(args.dias, 30, 7, 90)
    const stock = await stockActual.ejecutar({}, ctx) as { fecha_informe?: string; productos?: { producto: string; litros_disponibles: number; dias_cobertura: number | null; demanda_ciclo_litros: number | null }[]; nota?: string }
    if (!stock.productos) return stock
    const { data: plan, error } = await ctx.admin.from('plan_produccion')
      .select('producto, litros_planificados, fecha_planificada, dias_ocupacion, estado')
      .gte('fecha_planificada', sumarDiasISO(ctx.hoyISO, -30))
      .in('estado', ['planificado', 'en_curso'])
      .order('fecha_planificada')
    if (error) throw new Error(error.message)
    // Un lote está disponible cuando termina su ocupación de tanque (cocción + fermentación + maduración).
    const proximo = new Map<string, { llega: string; litros: number }>()
    for (const l of plan ?? []) {
      const p = normalizarProducto(l.producto ?? '')
      const llega = sumarDiasISO(l.fecha_planificada, Number(l.dias_ocupacion) || 21)
      if (llega < ctx.hoyISO) continue
      if (!proximo.has(p)) proximo.set(p, { llega, litros: Number(l.litros_planificados) || 0 })
    }
    const riesgos = stock.productos
      .filter(p => p.dias_cobertura != null && p.dias_cobertura <= horizonte)
      .map(p => {
        const quiebre = sumarDiasISO(ctx.hoyISO, p.dias_cobertura!)
        const lote = proximo.get(normalizarProducto(p.producto)) ?? null
        return {
          producto: p.producto, litros_disponibles: p.litros_disponibles, dias_cobertura: p.dias_cobertura,
          se_acaba_aprox: quiebre, proximo_lote: lote ? { disponible_aprox: lote.llega, litros: lote.litros } : null,
          quiebra_antes_del_lote: !lote || lote.llega > quiebre,
        }
      })
      .sort((a, b) => Number(b.quiebra_antes_del_lote) - Number(a.quiebra_antes_del_lote) || a.dias_cobertura! - b.dias_cobertura!)
    return {
      fecha_informe_stock: stock.fecha_informe, horizonte_dias: horizonte, productos: riesgos,
      nota: 'Estimación: cobertura con la demanda proyectada del ciclo; el lote se da por disponible al terminar su ocupación de tanque (21 días si el plan no la trae).',
    }
  },
}
