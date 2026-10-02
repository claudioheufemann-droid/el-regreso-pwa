import { type Consulta, texto } from './_base'
import { IDS_AREAS, textoArea } from '../mapa'

/**
 * Detalle de un área del mapa de la base (lib/agente/mapa.ts): tablas, columnas
 * clave, cómo se cruzan y trampas. No toca la base: es conocimiento fijo, así que
 * no gasta una consulta ni arriesga errores de columnas.
 */
export const mapaDatos: Consulta = {
  nombre: 'mapa_datos',
  descripcion:
    'Devuelve el mapa de UN área de la base (ver índice del sistema): tablas con columnas clave, cómo se cruzan y errores a evitar. ' +
    'Llamarla ANTES de consultar_sql cuando la pregunta cae en un área cuyas tablas/columnas no conoces. Más barata que describir_esquema.',
  parametros: [
    { nombre: 'area', tipo: 'string', requerido: true, enum: IDS_AREAS, descripcion: 'Área del índice.' },
  ],
  async ejecutar(args) {
    const area = texto(args.area)
    const detalle = area ? textoArea(area) : null
    if (!detalle) return { error: `Área desconocida. Opciones: ${IDS_AREAS.join(', ')}.` }
    return { mapa: detalle }
  },
}
