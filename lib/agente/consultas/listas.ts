import { type Consulta, sumarDiasISO, terminoSeguro, texto, fecha } from './_base'
import { nombresDeVendedores } from '../correos'

/**
 * LISTAS DE CHEQUEO (5-oct-2026): el asistente arma una lista y la persona la
 * marca en el chat (tarjeta con casillas, guardada en agente_listas).
 *
 * `lista_pedidos_por_despachar` arma los ítems EN EL SERVIDOR desde los pedidos
 * reales (informados al ERP y aún no entregados), así el modelo no puede
 * inventar ni olvidar pedidos. `crear_lista` deja una lista libre con lo que
 * pida el usuario. Ninguna tiene efectos fuera del chat: no piden confirmación.
 */

const MAX_ITEMS = 80

/** Unidades legibles desde litros + envase ("Lata (354 ml)" → latas; barril → de 30 L). */
function unidades(envase: string | null, litros: number): string {
  const ml = envase?.match(/(\d+)\s*ml/i)?.[1]
  if (ml) return `${Math.round(litros / (Number(ml) / 1000))} latas ${ml} ml`
  if (envase && /barril/i.test(envase)) {
    const n30 = litros / 30, n50 = litros / 50
    if (Number.isInteger(n30)) return `${n30} barril${n30 === 1 ? '' : 'es'} 30 L`
    if (Number.isInteger(n50)) return `${n50} barril${n50 === 1 ? '' : 'es'} 50 L`
    return `${Math.round(litros)} L en barril`
  }
  return `${Math.round(litros)} L`
}

async function guardarLista(ctx: Parameters<Consulta['ejecutar']>[1], titulo: string, items: { texto: string; detalle?: string }[]) {
  if (!ctx.conversacionId) return { error: 'No hay una conversación activa.' }
  const { data, error } = await ctx.admin.from('agente_listas').insert({
    conversacion_id: ctx.conversacionId, creado_por: ctx.usuarioId, titulo: titulo.slice(0, 200),
    items: items.slice(0, MAX_ITEMS).map((it, i) => ({ id: String(i + 1), texto: it.texto.slice(0, 300), detalle: it.detalle?.slice(0, 500) ?? null, hecho: false })),
  }).select('id').single()
  if (error) throw new Error(error.message)
  return { lista_id: data.id }
}

export const listaPedidosPorDespachar: Consulta = {
  nombre: 'lista_pedidos_por_despachar',
  descripcion:
    'Crea en el chat una LISTA PARA MARCAR (checklist) con los pedidos por despachar: informados al ERP y aún no entregados, uno por ítem con cliente, localidad y qué llevar (latas/barriles por producto). Para "lista de lo que va en el camión", "checklist de carga". Se puede filtrar por fecha estimada de entrega, localidad o vendedor.',
  parametros: [
    { nombre: 'hasta', tipo: 'string', descripcion: 'Incluir entregas estimadas hasta esta fecha YYYY-MM-DD. Por defecto mañana. Las atrasadas siempre entran.' },
    { nombre: 'localidad', tipo: 'string', descripcion: 'Filtra por localidad/ciudad (ej. "Valdivia"). Opcional.' },
    { nombre: 'vendedor', tipo: 'string', descripcion: 'Filtra por vendedor. Opcional.' },
    { nombre: 'titulo', tipo: 'string', descripcion: 'Título de la lista. Por defecto "Carga del camión".' },
  ],
  async ejecutar(args, ctx) {
    const hasta = fecha(args.hasta) ?? sumarDiasISO(ctx.hoyISO, 1)
    const localidad = texto(args.localidad) && terminoSeguro(texto(args.localidad)!).toLowerCase()
    const vendedor = texto(args.vendedor)?.toLowerCase() ?? null
    const [{ data, error }, nombreVendedor] = await Promise.all([
      ctx.admin.from('ventas')
        .select('pedido, nombre_fantasia, localidad, vendedor_actual, producto, envase, litros, fecha_entrega_estimada')
        .eq('entrega_informada', true).eq('entregado', false).eq('cliente_excluido', false).eq('producto_excluido', false)
        .gte('fecha_pedido', sumarDiasISO(ctx.hoyISO, -60))
        .or(`fecha_entrega_estimada.lte.${hasta},fecha_entrega_estimada.is.null`)
        .gt('litros', 0)
        .order('fecha_entrega_estimada').order('pedido')
        .limit(2000),
      nombresDeVendedores(ctx.admin),
    ])
    if (error) throw new Error(error.message)

    const pedidos = new Map<string, { cliente: string; localidad: string | null; vendedor: string | null; fecha: string | null; lineas: Map<string, { envase: string | null; litros: number }> }>()
    for (const f of data ?? []) {
      if (localidad && !(f.localidad ?? '').toLowerCase().includes(localidad)) continue
      const v = nombreVendedor(f.vendedor_actual)
      if (vendedor && !(v ?? '').toLowerCase().includes(vendedor) && !(f.vendedor_actual ?? '').toLowerCase().includes(vendedor)) continue
      const clave = f.pedido ?? `${f.nombre_fantasia}-${f.fecha_entrega_estimada}`
      const p = pedidos.get(clave) ?? { cliente: f.nombre_fantasia, localidad: f.localidad, vendedor: v, fecha: f.fecha_entrega_estimada, lineas: new Map() }
      const k = `${f.producto}|${f.envase ?? ''}`
      const l = p.lineas.get(k) ?? { envase: f.envase, litros: 0 }
      l.litros += Number(f.litros) || 0
      p.lineas.set(k, l)
      pedidos.set(clave, p)
    }
    if (pedidos.size === 0) return { nota: `No hay pedidos por despachar con entrega estimada hasta ${hasta}${localidad ? ` en ${args.localidad}` : ''}.` }

    const items = [...pedidos.entries()].map(([pedido, p]) => ({
      texto: `${p.cliente}${p.localidad ? ` (${p.localidad})` : ''} · pedido ${pedido}`,
      detalle: [...p.lineas.entries()].map(([k, l]) => `${k.split('|')[0].replace(/\s+/g, ' ').trim()}: ${unidades(l.envase, l.litros)}`).join(' · ')
        + (p.fecha && p.fecha < ctx.hoyISO ? ` · ATRASADO (estimado ${p.fecha})` : p.fecha ? ` · entrega ${p.fecha}` : ''),
    }))
    const titulo = texto(args.titulo) ?? `Carga del camión (${items.length} pedidos)`
    const r = await guardarLista(ctx, titulo, items)
    if ('error' in r) return r
    const litros = [...pedidos.values()].reduce((s, p) => s + [...p.lineas.values()].reduce((a, l) => a + l.litros, 0), 0)
    return {
      ...r, titulo, pedidos: items.length, litros_totales: Math.round(litros),
      ...(pedidos.size > MAX_ITEMS ? { advertencia: `Había ${pedidos.size} pedidos; la lista trae los primeros ${MAX_ITEMS}. Filtra por localidad o fecha.` } : {}),
      instruccion: 'La lista ya aparece en el chat con casillas para marcar. Resume en 1-2 líneas (cuántos pedidos y litros); NO repitas la lista.',
    }
  },
}

export const crearLista: Consulta = {
  nombre: 'crear_lista',
  descripcion:
    'Crea en el chat una lista para marcar (checklist) con los ítems que indique el usuario o que salgan de otra herramienta (ej. "clientes a visitar hoy", "pendientes del cierre"). Para pedidos por despachar usa lista_pedidos_por_despachar.',
  parametros: [
    { nombre: 'titulo', tipo: 'string', requerido: true, descripcion: 'Título de la lista.' },
    { nombre: 'items', tipo: 'string', requerido: true, descripcion: 'Un ítem por línea. Opcional: detalle después de " | " (ej. "Teja Market | 2 barriles").' },
  ],
  async ejecutar(args, ctx) {
    const titulo = texto(args.titulo)
    const items = (texto(args.items) ?? '').split('\n').map(l => l.replace(/^\s*[-*•\d.)]+\s*/, '').trim()).filter(Boolean)
      .map(l => { const [t, ...d] = l.split(' | '); return { texto: t.trim(), detalle: d.join(' | ').trim() || undefined } })
    if (!titulo || items.length === 0) return { error: 'Faltan el título o los ítems (uno por línea).' }
    const r = await guardarLista(ctx, titulo, items)
    if ('error' in r) return r
    return { ...r, titulo, items: Math.min(items.length, MAX_ITEMS), instruccion: 'La lista ya aparece en el chat para marcar. No la repitas.' }
  },
}
