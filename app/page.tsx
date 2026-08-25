import { redirect } from 'next/navigation'
import { getServerUser } from '@/lib/auth'
import HubClient from '@/components/ui/HubClient'

export const dynamic = 'force-dynamic'

export default async function HubPage() {
  // getServerUser() (no una consulta de auth propia acá): ya trae el
  // reintento ante blips de red y el fallback por email para Google — antes
  // esta página duplicaba la lógica sin ninguno de los dos, era otro punto
  // donde un usuario real podía terminar rebotado a /login.
  const user = await getServerUser()
  if (!user) redirect('/login')

  return <HubClient isAdmin={user.isAdmin} nombre={user.nombre} macroArea={user.macroArea} />
}
