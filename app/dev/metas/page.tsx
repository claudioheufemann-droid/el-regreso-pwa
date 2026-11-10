import { notFound } from 'next/navigation'
import DevMetasClient from './DevMetasClient'

/**
 * Banco de pruebas de Metas de temporada (vista Equipo + Colchón Retail) con
 * datos inventados, sin pasar por el login, para revisar el diseño en local
 * (sobre todo en ancho de teléfono).
 *
 * Sólo existe en desarrollo (proxy.ts bloquea /dev fuera de desarrollo y este
 * notFound es la segunda capa).
 */
export default function DevMetasPage() {
  if (process.env.NODE_ENV !== 'development') notFound()
  return <DevMetasClient />
}
