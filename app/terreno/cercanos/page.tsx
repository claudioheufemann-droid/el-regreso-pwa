import { getServerUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import CercanosClient from './CercanosClient'

export const dynamic = 'force-dynamic'

/**
 * Antes esta página mandaba TODOS los clientes con coordenadas (~600) al
 * navegador para que CercanosClient calculara la distancia en memoria —
 * la pantalla siempre pedía el GPS antes de mostrar nada, así que ese
 * envío inicial se pagaba entero sin usarse hasta que el vendedor tocaba
 * "Ver quién tienes cerca". Ahora la página no trae nada: el cálculo se
 * resuelve server-side en /api/clientes/cercanos (mismo endpoint que ya
 * usa "Cerca de mí" en Nueva Visita) recién cuando hay una ubicación real.
 */
export default async function CercanosPage() {
  const user = await getServerUser()
  if (!user) redirect('/login')

  return <CercanosClient />
}
