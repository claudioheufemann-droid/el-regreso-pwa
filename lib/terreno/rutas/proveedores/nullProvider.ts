import type { RouteProvider } from '../RouteProvider'

/**
 * Proveedor nulo: siempre "disponible" como último recurso del factory, pero
 * calcularRuta() SIEMPRE lanza — nunca devuelve una distancia inventada o en línea
 * recta. El llamador debe capturar el error y dejar la parada/día en
 * estado_calculo_ruta='pendiente_de_calculo', nunca convertir el fallo en un 0 o en un
 * cálculo aproximado silencioso.
 */
export const nullProvider: RouteProvider = {
  nombre: 'ninguno',
  disponible: () => true,
  async calcularRuta() {
    throw new Error(
      'No hay proveedor de rutas configurado (falta MAPBOX_ACCESS_TOKEN). ' +
      'El km de este día queda pendiente de cálculo hasta que se configure uno.',
    )
  },
}
