import { getServerUser } from '@/lib/auth'
import { redirect } from 'next/navigation'

export default async function LogisticaIndexPage() {
  const user = await getServerUser()
  // Producción aterriza en su declaración; Logística/admin en recepción (el paso que le corresponde a Matías)
  if (user?.macroArea === 'produccion' && !user.isAdmin) redirect('/logistica/produccion/declarar')
  redirect('/logistica/recepcion')
}
