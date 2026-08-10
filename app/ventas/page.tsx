import { getServerUser } from '@/lib/auth'
import { provinciasDeRegion } from '@/lib/regiones'
import { VENDEDORES_CONTRATO_TERCERA } from '@/lib/comisionesVendedor'
import { getHoyData } from './hoyData'
import VentasHoyClient from './VentasHoyClient'

export const dynamic = 'force-dynamic'

const esFecha = (s: string | undefined): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s)

export default async function VentasHoyPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string }>
}) {
  const { desde, hasta } = await searchParams
  const appUser = await getServerUser()

  // Scope geográfico: las ventas están consolidadas por nombre de vendedor, así
  // que el recorte del vendedor se hace por PROVINCIA (su región). Admin ve todo.
  const scopeRegion = appUser?.isAdmin ? null : (appUser?.region ?? null)
  const provincias = provinciasDeRegion(scopeRegion)
  const provinciasScope = provincias.length ? provincias : null

  // Rango elegido a mano. Se ignora si viene mal formado o invertido, para que
  // una URL manipulada no rompa la vista.
  const custom = esFecha(desde) && esFecha(hasta) && desde <= hasta ? { desde, hasta } : null

  const data = await getHoyData(
    provinciasScope,
    appUser
      ? { nombre: appUser.nombre, iniciales: appUser.iniciales, avatarUrl: appUser.avatarUrl }
      : null,
    custom,
  )

  // Remuneración variable propia: sólo la ve quien tenga el permiso, no los
  // admins en general (ver app/api/ventas/comision/route.ts).
  const contratoTercera = (VENDEDORES_CONTRATO_TERCERA as readonly string[])
  const veComisionVendedor = !!appUser?.vendedoresErp.some(v => contratoTercera.includes(v))

  return (
    <VentasHoyClient
      data={data}
      veComision={!!appUser?.veComisionGerente}
      veComisionVendedor={veComisionVendedor}
    />
  )
}
