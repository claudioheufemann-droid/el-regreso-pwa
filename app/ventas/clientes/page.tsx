import { getServerUser } from '@/lib/auth'
import { vendedorCanonico } from '@/lib/types'
import CarteraClient from './CarteraClient'
import { CARTERAS } from './carteraTipos'
import { getCartera, CARTERA_DE_VENDEDOR } from './carteraData'

export const dynamic = 'force-dynamic'

export default async function ClientesPage() {
  const [appUser, clientes] = await Promise.all([getServerUser(), getCartera()])

  // Admin ve toda la empresa; un vendedor sólo su cartera (misma regla que
  // tenía esta pantalla antes y que aplica la ficha /ventas/clientes/[id]).
  const miCartera = appUser?.vendedoresErp?.length
    ? CARTERA_DE_VENDEDOR.get(vendedorCanonico(appUser.vendedoresErp[0])) ?? null
    : null
  const visibles = appUser?.isAdmin ? clientes : clientes.filter(c => c.cartera === miCartera)

  return (
    <CarteraClient
      clientes={visibles}
      carterasVisibles={appUser?.isAdmin ? [...CARTERAS.map(c => c.key), 'otros'] : miCartera ? [miCartera] : []}
      hoyISO={new Date().toISOString().slice(0, 10)}
    />
  )
}
