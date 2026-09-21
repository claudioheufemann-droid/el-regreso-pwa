export interface LatLng {
  lat: number
  lng: number
}

export interface TramoRuta {
  /** Índice del punto de origen y destino de este tramo dentro del arreglo [origen, ...paradas, destino]. */
  desdeIndice: number
  hastaIndice: number
  distanciaM: number
  duracionS: number
}

export interface RouteProviderResult {
  distanciaTotalM: number
  duracionTotalS: number
  tramos: TramoRuta[]
}

/**
 * Adaptador intercambiable de cálculo de rutas por red vial real. NUNCA se usa línea
 * recta (Haversine) como km pagable — eso lo prohíbe explícitamente la política de
 * gastos. Si ningún proveedor está `disponible()`, el llamador debe dejar el estado en
 * 'pendiente_de_calculo' (ver plan_paradas_terreno.estado_calculo_ruta) y no autorizar
 * presupuesto de km automático para ese día.
 */
export interface RouteProvider {
  nombre: string
  /** true sólo si la credencial/config necesaria existe. No hace ninguna llamada de red. */
  disponible(): boolean
  /** origen -> paradas en orden -> destino (si difiere del origen). */
  calcularRuta(origen: LatLng, paradas: LatLng[], destino?: LatLng): Promise<RouteProviderResult>
}
