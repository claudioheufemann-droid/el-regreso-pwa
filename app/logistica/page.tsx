import { getServerUser } from '@/lib/auth'
import { redirect } from 'next/navigation'

export default async function LogisticaIndexPage() {
  const user = await getServerUser()
  // Producción aterriza en su declaración; Logística/admin en Despachos (la ruta del día de Matías)
  if (user?.macroArea === 'produccion' && !user.isAdmin) redirect('/logistica/produccion/declarar')
  redirect('/logistica/despachos')
}
