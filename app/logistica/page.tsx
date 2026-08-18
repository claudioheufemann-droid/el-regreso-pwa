import { getServerUser } from '@/lib/auth'
import { redirect } from 'next/navigation'

export default async function LogisticaIndexPage() {
  const user = await getServerUser()
  // Logística (Matías) aterriza en Recepción (check-in de bodega); todos los demás
  // (Producción, admin) van directo a Declarar, la acción más frecuente.
  if (user?.macroArea === 'logistica' && !user.isAdmin) redirect('/logistica/recepcion')
  redirect('/logistica/produccion/declarar')
}
