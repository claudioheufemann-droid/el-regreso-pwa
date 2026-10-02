import { type Consulta, entero, texto } from './_base'

/**
 * Lectura libre de la base. El agente NO recibe la llave maestra: la consulta
 * se ejecuta dentro de Postgres (función `agente_consultar`) con un rol de sólo
 * lectura que únicamente ve las tablas/columnas permitidas, en una transacción
 * de lectura, con tiempo máximo y tope de filas, y tras una guardia de texto
 * (una sentencia, sólo SELECT, lista blanca de funciones). Ver
 * supabase/migrations/agente_lector_solo_lectura.sql y lib/agente/README.md.
 * Si se crea una tabla nueva hay que correr `select agente_refrescar_permisos()`.
 */

function pista(mensaje: string): string {
  if (/permission denied for (table|schema)/i.test(mensaje))
    return 'Esa tabla/columna está bloqueada por privacidad, o usaste SELECT *: lista columnas explícitas (describir_esquema con la tabla muestra las permitidas).'
  if (/statement timeout/i.test(mensaje)) return 'Demasiado pesada: filtra por fecha o agrega para devolver menos filas.'
  if (/does not exist/i.test(mensaje)) return 'Revisa los nombres con mapa_datos (área) o describir_esquema (tabla).'
  return ''
}

export const consultarSql: Consulta = {
  nombre: 'consultar_sql',
  descripcion:
    'Ejecuta UNA consulta SELECT (o WITH...SELECT) de PostgreSQL, solo lectura, sobre cualquier tabla permitida de la base: úsala cuando ninguna herramienta específica cubre la pregunta ' +
    '(cruces entre tablas, rankings por localidad/producto/vendedor, comparaciones, historiales). Máx. 200 filas y 10 s: agrega y filtra en SQL. ' +
    'Columnas siempre explícitas (no SELECT *). Para ventas reales usa "not _excluir_cliente_finanzas(nombre_fantasia) and not _excluir_producto(producto)". ' +
    'Datos personales (rut, correo, teléfono, dirección) y costos/márgenes están bloqueados. Si dudas de las columnas, llama antes a mapa_datos con el área.',
  parametros: [
    { nombre: 'consulta', tipo: 'string', requerido: true, descripcion: 'Una sola sentencia SELECT o WITH...SELECT. Sin comentarios ni punto y coma intermedio.' },
    { nombre: 'max_filas', tipo: 'integer', descripcion: 'Filas máximas a devolver (1-200). Por defecto 100.' },
  ],
  async ejecutar(args, ctx) {
    const consulta = texto(args.consulta)
    if (!consulta) return { error: 'Falta la consulta.' }
    const { data, error } = await ctx.admin.rpc('agente_consultar', { p_sql: consulta, p_max: entero(args.max_filas, 100, 1, 200) })
    if (error) {
      const msg = String(error.message ?? '').split('\n')[0].slice(0, 140)
      throw new Error([msg, pista(msg)].filter(Boolean).join(' — '))
    }
    return data
  },
}

const NOTA_MAX = 140

export const describirEsquema: Consulta = {
  nombre: 'describir_esquema',
  descripcion:
    'Muestra qué hay en la base. Sin `tabla`: lista las tablas legibles con filas aproximadas y su descripción. Con `tabla`: sus columnas (solo las permitidas) y tipos. ' +
    'Usarla sólo si mapa_datos no trae la tabla o columna que necesitas (tablas raras o casi vacías).',
  parametros: [
    { nombre: 'tabla', tipo: 'string', descripcion: 'Nombre exacto de la tabla. Omitir para listar todas.' },
  ],
  async ejecutar(args, ctx) {
    const tabla = texto(args.tabla)
    const { data, error } = await ctx.admin.rpc('agente_esquema', { p_tabla: tabla })
    if (error) throw new Error(String(error.message ?? '').slice(0, 140))
    if (!tabla) {
      // Texto compacto en vez de JSON: son ~70 tablas y cada token cuenta.
      const filas = (data ?? []) as { tabla: string; filas_aprox: number; nota: string | null }[]
      return {
        tablas: filas.map(f => `${f.tabla} (~${f.filas_aprox})${f.nota ? `: ${f.nota.replace(/\s+/g, ' ').slice(0, NOTA_MAX)}` : ''}`).join('\n'),
        aviso: 'Las tablas de respaldo (_backup_), las del propio agente, usuarios, costos, notificaciones y los datos personales no aparecen: están bloqueados.',
      }
    }
    const cols = (data ?? []) as { columna: string; tipo: string; nota: string | null }[]
    if (cols.length === 0) return { error: `La tabla "${tabla}" no existe o no es legible.` }
    return { tabla, columnas: cols.map(c => `${c.columna} ${c.tipo}${c.nota ? ` (${c.nota.slice(0, 80)})` : ''}`).join('; ') }
  },
}
