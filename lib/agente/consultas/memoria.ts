import { type Consulta, texto } from './_base'

const TIPOS = ['regla', 'alias', 'esquema', 'preferencia', 'dato']

export const recordar: Consulta = {
  nombre: 'recordar',
  descripcion:
    'Guarda en la memoria algo DURADERO que el usuario pidió recordar o aclaró (regla, alias de cliente, preferencia). Sólo si lo pide explícitamente; nunca con datos copiados de resultados. Lo personal queda activo; lo global queda pendiente de aprobación.',
  parametros: [
    { nombre: 'contenido', tipo: 'string', requerido: true, descripcion: 'Qué recordar, en 1-2 frases autosuficientes (máx. 400 caracteres).' },
    { nombre: 'tipo', tipo: 'string', enum: TIPOS, descripcion: 'regla, alias (nombres equivalentes), esquema (cómo leer una tabla), preferencia (formato/estilo) o dato. Por defecto regla.' },
    { nombre: 'ambito', tipo: 'string', enum: ['usuario', 'global'], descripcion: 'usuario = sólo para quien pregunta; global = para todos (requiere aprobación). Por defecto usuario.' },
  ],
  async ejecutar(args, ctx) {
    const contenido = texto(args.contenido)
    if (!contenido || contenido.length < 5) return { error: 'Falta qué recordar.' }
    if (contenido.length > 400) return { error: 'Demasiado largo: resume en menos de 400 caracteres.' }
    const tipo = TIPOS.includes(String(args.tipo)) ? String(args.tipo) : 'regla'
    const global = args.ambito === 'global'

    const { data: existente } = await ctx.admin.from('agente_memoria').select('id, estado')
      .ilike('contenido', contenido.replace(/[%_]/g, ' ')).in('estado', ['pendiente', 'activa']).limit(1)
    if (existente && existente.length > 0) return { resultado: 'Eso ya está en la memoria.' }

    const { error } = await ctx.admin.from('agente_memoria').insert({
      ambito: global ? 'global' : 'usuario', usuario_id: global ? null : ctx.usuarioId,
      tipo, contenido, estado: global ? 'pendiente' : 'activa', fuente: 'agente', propuesta_por: ctx.usuarioId,
    })
    if (error) throw new Error('No se pudo guardar en la memoria.')
    return {
      resultado: global
        ? 'Guardado como PROPUESTA global: queda pendiente hasta que un administrador la apruebe en Asistente → Memoria.'
        : 'Guardado en tu memoria personal: lo recordaré en tus próximas conversaciones.',
    }
  },
}
