import { getServerUser } from '@/lib/auth'
import { provinciasDeRegion } from '@/lib/regiones'
import { getHoyData } from './hoyData'
import VentasHoyClient from './VentasHoyClient'

export const dynamic = 'force-dynamic'

export default async function VentasHoyPage() {
  const appUser = await getServerUser()

  // Scope geográfico: las ventas están consolidadas por nombre de vendedor, así
  // que el recorte del vendedor se hace por PROVINCIA (su región). Admin ve todo.
  const scopeRegion = appUser?.isAdmin ? null : (appUser?.region ?? null)
  const provincias = provinciasDeRegion(scopeRegion)
  const provinciasScope = provincias.length ? provincias : null

  const data = await getHoyData(
    provinciasScope,
    appUser
      ? { nombre: appUser.nombre, iniciales: appUser.iniciales, avatarUrl: appUser.avatarUrl }
      : null,
  )

  return <VentasHoyClient data={data} />
}
