import { notFound } from 'next/navigation'
import AdministracionClient from '@/app/administracion/AdministracionClient'
import { cargarDatosAdministracion } from '@/app/administracion/cargarDatos'

/**
 * Banco de pruebas de Administración y Finanzas: el módulo con los datos de
 * verdad, sin pasar por el login, para revisar el diseño en local.
 *
 * Sólo existe en desarrollo (proxy.ts bloquea /dev fuera de desarrollo y este
 * notFound es la segunda capa). A diferencia de /dev/produccion, muestra datos
 * reales: corre en el equipo de quien desarrolla y nunca se publica.
 */
export const dynamic = 'force-dynamic'

export default async function DevAdministracionPage() {
  if (process.env.NODE_ENV !== 'development') notFound()
  return <AdministracionClient {...await cargarDatosAdministracion()} />
}
