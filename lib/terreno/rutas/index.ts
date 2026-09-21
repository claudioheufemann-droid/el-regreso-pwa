import 'server-only'
import type { RouteProvider } from './RouteProvider'
import { mapboxDirectionsProvider } from './proveedores/mapboxDirections'
import { nullProvider } from './proveedores/nullProvider'

const PROVEEDORES: RouteProvider[] = [mapboxDirectionsProvider]

/** Primer proveedor disponible (con credencial configurada), o el nulo si ninguno lo está. */
export function getRouteProvider(): RouteProvider {
  return PROVEEDORES.find(p => p.disponible()) ?? nullProvider
}

export function hayProveedorDeRutasConfigurado(): boolean {
  return PROVEEDORES.some(p => p.disponible())
}

export type { LatLng, RouteProvider, RouteProviderResult, TramoRuta } from './RouteProvider'
