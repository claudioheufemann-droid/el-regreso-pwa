import { type Consulta, entero, redondear, sumarDiasISO, texto } from './_base'
import { esClienteExcluido } from '@/lib/types'
import { LIMITES_CORREO, nombresDeVendedores, resolverVendedor } from '../correos'

/** Carteras que no son un vendedor al que avisar. */
const CARTERA_SIN_VENDEDOR = /^(inactivo|no indica|incobrable|transici|equipo ventas|cervecer|online$)/i

const diasEntre = (a: string, b: string) =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)

interface FilaScore {
  nombre_fantasia: string
  vendedor_actual: string | null
  ciclo_promedio_dias: number | null
  siguiente_compra_estimada: string | null
  ultima_compra: string | null
  litros_totales: number | null
  revenue_total: number | null
  total_pedidos: number | null
  confianza_score: string | null
  es_estacional: boolean | null
  temporada_baja: boolean | null
}

export const clientesProximosAPedir: Consulta = {
  nombre: 'clientes_proximos_a_pedir',
  descripcion:
    'Clientes que según su ciclo de compra deberían pedir pronto (próxima compra estimada en los próximos N días) o que ya se atrasaron. Trae vendedor asignado, fecha estimada, ciclo y pedido típico. Úsala para "quiénes están por pedir" y antes de preparar un correo a un vendedor.',
  parametros: [
    { nombre: 'dias', tipo: 'integer', descripcion: 'Ventana hacia adelante en días (1-30). Por defecto 7.' },
    { nombre: 'vendedor', tipo: 'string', descripcion: 'Filtra por vendedor (nombre o parte). Opcional.' },
    { nombre: 'atrasados_dias', tipo: 'integer', descripcion: 'Incluye también a los que debían pedir hasta N días atrás y no han pedido (0-30). Por defecto 0.' },
  ],
  async ejecutar(args, ctx) {
    const dias = entero(args.dias, 7, 1, 30)
    const atrasados = entero(args.atrasados_dias, 0, 0, 30)
    const filtroVendedor = texto(args.vendedor)?.toLowerCase() ?? null
    const desde = sumarDiasISO(ctx.hoyISO, -atrasados)
    const hasta = sumarDiasISO(ctx.hoyISO, dias)

    const [{ data, error }, nombreVendedor] = await Promise.all([
      ctx.admin.rpc('get_client_scores', { p_vendedor: null }),
      nombresDeVendedores(ctx.admin),
    ])
    if (error) throw new Error(error.message)

    const filas = ((data ?? []) as FilaScore[])
      .filter(f => f.siguiente_compra_estimada && f.siguiente_compra_estimada >= desde && f.siguiente_compra_estimada <= hasta)
      .filter(f => !esClienteExcluido(f.nombre_fantasia) && !CARTERA_SIN_VENDEDOR.test((f.vendedor_actual ?? '').trim()))
      // Vendedor como se llama en la app (une "nicol.delgado@…" con "Nicol Delgado"); se filtra por ambos nombres.
      .map(f => ({ ...f, vendedor: nombreVendedor(f.vendedor_actual) ?? 'Sin vendedor' }))
      .filter(f => !filtroVendedor || f.vendedor.toLowerCase().includes(filtroVendedor) || (f.vendedor_actual ?? '').toLowerCase().includes(filtroVendedor))
      .sort((a, b) => a.siguiente_compra_estimada!.localeCompare(b.siguiente_compra_estimada!))

    const clientes = filas.slice(0, 60).map(f => {
      const pedidos = Number(f.total_pedidos) || 0
      const enDias = diasEntre(ctx.hoyISO, f.siguiente_compra_estimada!)
      return {
        cliente: f.nombre_fantasia,
        vendedor: f.vendedor,
        proxima_compra_estimada: f.siguiente_compra_estimada,
        en_dias: enDias,
        atrasado: enDias < 0,
        ultima_compra: f.ultima_compra,
        ciclo_promedio_dias: f.ciclo_promedio_dias,
        litros_por_pedido: pedidos ? Math.round(((Number(f.litros_totales) || 0) / pedidos) * 10) / 10 : null,
        neto_por_pedido: pedidos ? redondear((Number(f.revenue_total) || 0) / pedidos) : null,
        confianza: f.confianza_score,
        ...(f.temporada_baja ? { nota: 'temporada baja para este cliente' } : {}),
      }
    })

    const porVendedor = new Map<string, number>()
    for (const f of filas) porVendedor.set(f.vendedor, (porVendedor.get(f.vendedor) ?? 0) + 1)

    return {
      ventana: { desde, hasta },
      total: filas.length,
      por_vendedor: Object.fromEntries([...porVendedor].sort((a, b) => b[1] - a[1])),
      clientes,
      ...(filas.length > clientes.length ? { advertencia: `Se muestran ${clientes.length} de ${filas.length}; filtra por vendedor para ver el resto.` } : {}),
      nota: 'Estimación según el ciclo de compra histórico de cada cliente (no es un pedido confirmado). Sin cuentas internas.',
    }
  },
}

export const prepararCorreoVendedor: Consulta = {
  nombre: 'preparar_correo_vendedor',
  descripcion:
    'Deja un BORRADOR de correo para un vendedor de la empresa (ej. avisarle qué clientes están por pedir). NO envía: el usuario lo revisa y aprieta "Enviar" en el chat. Úsala sólo si el usuario pide escribir/enviar un correo. Un borrador por vendedor.',
  parametros: [
    { nombre: 'vendedor', tipo: 'string', requerido: true, descripcion: 'Vendedor destinatario tal como lo entregó clientes_proximos_a_pedir u otra herramienta (ej. "Marcelo D.").' },
    { nombre: 'asunto', tipo: 'string', requerido: true, descripcion: 'Asunto corto y concreto.' },
    { nombre: 'cuerpo', tipo: 'string', requerido: true, descripcion: 'Texto del correo en español, tuteo, cordial y breve: saludo, la lista de clientes con su fecha estimada y pedido típico, y una acción concreta. Sin HTML ni markdown.' },
  ],
  async ejecutar(args, ctx) {
    const vendedor = texto(args.vendedor)
    const asunto = texto(args.asunto)?.slice(0, LIMITES_CORREO.asunto)
    const cuerpo = texto(args.cuerpo)?.slice(0, LIMITES_CORREO.cuerpo)
    if (!vendedor || !asunto || !cuerpo) return { error: 'Faltan vendedor, asunto o cuerpo.' }
    if (!ctx.conversacionId) return { error: 'No hay una conversación activa para dejar el borrador.' }

    const r = await resolverVendedor(ctx.admin, vendedor)
    if (!r.ok) return { error: r.motivo, ...(r.opciones ? { vendedores_disponibles: r.opciones } : {}) }

    const { count } = await ctx.admin.from('agente_correos')
      .select('id', { count: 'exact', head: true })
      .eq('conversacion_id', ctx.conversacionId).eq('estado', 'pendiente')
    if ((count ?? 0) >= LIMITES_CORREO.pendientesPorConversacion) {
      return { error: `Ya hay ${count} borradores sin revisar en esta conversación: que el usuario envíe o descarte alguno primero.` }
    }

    const { data, error } = await ctx.admin.from('agente_correos').insert({
      conversacion_id: ctx.conversacionId,
      creado_por: ctx.usuarioId,
      destinatario_id: r.usuario.id,
      destinatario_nombre: r.usuario.nombre,
      asunto, cuerpo,
    }).select('id').single()
    if (error) throw new Error(error.message)

    return {
      borrador_id: data.id,
      destinatario: r.usuario.nombre,
      estado: 'borrador pendiente de revisión',
      instruccion: 'Dile al usuario que el borrador quedó abajo en el chat para revisarlo y que se envía con el botón "Enviar". NO digas que ya se envió.',
    }
  },
}
