import { type Consulta, texto } from './_base'
import { IDS_AREAS, IDS_MODULOS, textoArea, textoModulo } from '../mapa'

/**
 * Mapa de la base y de la app (lib/agente/mapa.ts). No toca la base: es
 * conocimiento fijo, así que no gasta una consulta ni arriesga errores de columnas.
 *   · area   → tablas, columnas clave, cruces y trampas de un área de datos.
 *   · modulo → pestañas/secciones de un módulo de la app tal como se ven en pantalla.
 */
export const mapaDatos: Consulta = {
  nombre: 'mapa_datos',
  descripcion:
    'Mapa fijo, sin consultar la base. Con `modulo`: las pestañas y secciones de un módulo de la app con su nombre en pantalla y qué muestra cada una ' +
    '(para "¿qué sale en Producción?", "¿dónde veo X?"). Con `area`: tablas con columnas clave, cómo se cruzan y errores a evitar; llamarla ANTES de ' +
    'consultar_sql si no conoces las columnas. Se pueden pedir ambos. Más barata que describir_esquema.',
  parametros: [
    { nombre: 'modulo', tipo: 'string', enum: IDS_MODULOS, descripcion: 'Módulo de la app.' },
    { nombre: 'area', tipo: 'string', enum: IDS_AREAS, descripcion: 'Área de datos.' },
  ],
  async ejecutar(args) {
    const modulo = texto(args.modulo)
    const area = texto(args.area)
    if (!modulo && !area) return { error: `Indica modulo (${IDS_MODULOS.join(', ')}) o area (${IDS_AREAS.join(', ')}).` }
    const out: Record<string, string> = {}
    if (modulo) out.modulo = textoModulo(modulo) ?? `Módulo desconocido. Opciones: ${IDS_MODULOS.join(', ')}.`
    if (area) out.mapa = textoArea(area) ?? `Área desconocida. Opciones: ${IDS_AREAS.join(', ')}.`
    return out
  },
}
