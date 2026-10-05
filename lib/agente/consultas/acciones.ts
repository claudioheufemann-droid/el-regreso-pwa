import { type Consulta, entero, fecha, sumarDiasISO, texto } from './_base'
import { resolverVendedor } from '../correos'

/**
 * ACCIONES PROPUESTAS (5-oct-2026): tareas y avisos programados.
 * Igual que los correos: la herramienta sólo deja una fila 'pendiente' en
 * agente_acciones; se ejecuta cuando el admin aprieta "Confirmar" en el chat
 * (POST /api/agente/acciones/[id]). Nunca disponibles en modo vendedor.
 */

const DIAS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'] as const
const LIMITE_PENDIENTES = 10

async function hayCupo(ctx: Parameters<Consulta['ejecutar']>[1]): Promise<string | null> {
  if (!ctx.conversacionId) return 'No hay una conversación activa.'
  const { count } = await ctx.admin.from('agente_acciones').select('id', { count: 'exact', head: true })
    .eq('conversacion_id', ctx.conversacionId).eq('estado', 'pendiente')
  return (count ?? 0) >= LIMITE_PENDIENTES ? `Ya hay ${count} acciones sin confirmar en esta conversación: que el usuario confirme o descarte alguna.` : null
}

export const prepararTareaVendedor: Consulta = {
  nombre: 'preparar_tarea_vendedor',
  descripcion:
    'Propone crear una TAREA en Gestión para un vendedor (ej. "visitar a Teja Market el jueves", "cobrar facturas vencidas de X"). NO la crea: el usuario la confirma en el chat. Úsala sólo si el usuario lo pide.',
  parametros: [
    { nombre: 'vendedor', tipo: 'string', requerido: true, descripcion: 'Vendedor responsable (ej. "Marcelo D.").' },
    { nombre: 'titulo', tipo: 'string', requerido: true, descripcion: 'Título corto y accionable.' },
    { nombre: 'descripcion', tipo: 'string', descripcion: 'Detalle: clientes, montos, contexto. Texto plano.' },
    { nombre: 'plazo', tipo: 'string', descripcion: 'Fecha límite YYYY-MM-DD. Por defecto en 3 días.' },
  ],
  async ejecutar(args, ctx) {
    const vendedor = texto(args.vendedor)
    const titulo = texto(args.titulo)?.slice(0, 200)
    if (!vendedor || !titulo) return { error: 'Faltan vendedor o título.' }
    const plazo = fecha(args.plazo) ?? sumarDiasISO(ctx.hoyISO, 3)
    if (plazo < ctx.hoyISO) return { error: 'El plazo no puede ser una fecha pasada.' }
    const sinCupo = await hayCupo(ctx); if (sinCupo) return { error: sinCupo }
    const r = await resolverVendedor(ctx.admin, vendedor)
    if (!r.ok) return { error: r.motivo, ...(r.opciones ? { vendedores_disponibles: r.opciones } : {}) }

    const { data, error } = await ctx.admin.from('agente_acciones').insert({
      conversacion_id: ctx.conversacionId, creado_por: ctx.usuarioId, tipo: 'tarea', titulo,
      datos: { responsable_id: r.usuario.id, responsable: r.usuario.nombre, descripcion: texto(args.descripcion)?.slice(0, 2000) ?? '', plazo, area: 'Ventas' },
    }).select('id').single()
    if (error) throw new Error(error.message)
    return { accion_id: data.id, tarea: titulo, responsable: r.usuario.nombre, plazo, estado: 'pendiente de confirmación',
      instruccion: 'Dile al usuario que la tarea quedó abajo para confirmarla con el botón "Crear tarea". NO digas que ya se creó.' }
  },
}

export const gestionarAviso: Consulta = {
  nombre: 'gestionar_aviso',
  descripcion:
    'Avisos semanales automáticos: "listar" los del usuario, o proponer "crear" uno (ej. "todos los lunes prepárame los correos de clientes por pedir para cada vendedor") o "cancelar" uno. El aviso deja BORRADORES para revisar, nunca envía solo. Crear/cancelar requiere que el usuario confirme en el chat.',
  parametros: [
    { nombre: 'accion', tipo: 'string', requerido: true, enum: ['listar', 'crear', 'cancelar'], descripcion: 'Qué hacer.' },
    { nombre: 'dia_semana', tipo: 'string', enum: [...DIAS], descripcion: 'Para crear: día de la semana. Por defecto lunes.' },
    { nombre: 'dias_ventana', tipo: 'integer', descripcion: 'Para crear: clientes por pedir en los próximos N días (1-30). Por defecto 7.' },
    { nombre: 'canal', tipo: 'string', enum: ['correo', 'push', 'ambos'], descripcion: 'Para crear: canal de los borradores. Por defecto correo.' },
    { nombre: 'aviso_id', tipo: 'string', descripcion: 'Para cancelar: id del aviso (sale de listar).' },
  ],
  async ejecutar(args, ctx) {
    const accion = texto(args.accion)
    if (accion === 'listar') {
      const { data, error } = await ctx.admin.from('agente_avisos').select('id, tipo, dia_semana, dias_ventana, canal, activo, ultima_ejecucion')
        .eq('usuario_id', ctx.usuarioId).eq('activo', true).order('created_at')
      if (error) throw new Error(error.message)
      return { avisos: (data ?? []).map(a => ({ aviso_id: a.id, que: 'clientes por pedir, un borrador por vendedor', dia: DIAS[a.dia_semana - 1], proximos_dias: a.dias_ventana, canal: a.canal, ultima_vez: a.ultima_ejecucion })) }
    }
    const sinCupo = await hayCupo(ctx); if (sinCupo) return { error: sinCupo }

    if (accion === 'crear') {
      const dia = (texto(args.dia_semana) ?? 'lunes').toLowerCase()
      const idx = DIAS.findIndex(d => d === dia || d.normalize('NFD').replace(/[̀-ͯ]/g, '') === dia)
      const diaSemana = idx >= 0 ? idx + 1 : 1
      const diasVentana = entero(args.dias_ventana, 7, 1, 30)
      const canal = ['correo', 'push', 'ambos'].includes(texto(args.canal) ?? '') ? texto(args.canal)! : 'correo'
      const titulo = `Cada ${DIAS[diaSemana - 1]}: borradores de clientes por pedir (próximos ${diasVentana} días) para cada vendedor`
      const { data, error } = await ctx.admin.from('agente_acciones').insert({
        conversacion_id: ctx.conversacionId, creado_por: ctx.usuarioId, tipo: 'aviso_crear', titulo,
        datos: { dia_semana: diaSemana, dias_ventana: diasVentana, canal },
      }).select('id').single()
      if (error) throw new Error(error.message)
      return { accion_id: data.id, aviso: titulo, estado: 'pendiente de confirmación',
        instruccion: 'Dile que el aviso quedó abajo para confirmarlo. Aclara que cada semana le dejará borradores para revisar y le avisará; no envía nada solo.' }
    }

    if (accion === 'cancelar') {
      const id = texto(args.aviso_id)
      if (!id) return { error: 'Falta aviso_id: usa primero accion=listar.' }
      const { data: aviso } = await ctx.admin.from('agente_avisos').select('id, dia_semana').eq('id', id).eq('usuario_id', ctx.usuarioId).eq('activo', true).maybeSingle()
      if (!aviso) return { error: 'No encontré ese aviso activo entre los tuyos.' }
      const titulo = `Cancelar el aviso de los ${DIAS[aviso.dia_semana - 1]}`
      const { data, error } = await ctx.admin.from('agente_acciones').insert({
        conversacion_id: ctx.conversacionId, creado_por: ctx.usuarioId, tipo: 'aviso_cancelar', titulo, datos: { aviso_id: aviso.id },
      }).select('id').single()
      if (error) throw new Error(error.message)
      return { accion_id: data.id, estado: 'pendiente de confirmación', instruccion: 'Dile que confirme la cancelación abajo.' }
    }
    return { error: 'accion debe ser listar, crear o cancelar.' }
  },
}
