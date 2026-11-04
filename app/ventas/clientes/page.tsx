import { getServerUser } from '@/lib/auth'
import CarteraClient from './CarteraClient'
import { CARTERAS } from './carteraTipos'
import { getCartera, miCarteraDe } from './carteraData'

export const dynamic = 'force-dynamic'

export default async function ClientesPage() {
  // Si la carga falla se avisa en pantalla con "Reintentar" en vez de
  // mostrar una cartera vacía o con todos inactivos.
  const [appUser, carga] = await Promise.all([
    getServerUser(),
    getCartera().then(lista => ({ lista, error: false }), () => ({ lista: [], error: true })),
  ])
  const clientes = carga.lista
  const errorCarga = carga.error

  // Admin ve toda la empresa. Un vendedor ve SÓLO los clientes de su región
  // (pedido de Claudio, 30-oct-2026): la zona sale de users.region y, si no
  // tiene, de su nombre en el ERP. El filtro va acá, en el servidor, así que
  // al celular del vendedor nunca llegan clientes de otra zona.
  // "Ver como vendedor" del admin entra por la misma rama (isAdmin = false).
  const miCartera = appUser?.isAdmin ? null : miCarteraDe(appUser)
  const visibles = appUser?.isAdmin ? clientes : miCartera ? clientes.filter(c => c.cartera === miCartera) : []

  return (
    <CarteraClient
      clientes={visibles}
      carterasVisibles={appUser?.isAdmin ? [...CARTERAS.map(c => c.key), 'otros'] : miCartera ? [miCartera] : []}
      hoyISO={new Date().toISOString().slice(0, 10)}
      errorCarga={errorCarga}
    />
  )
}
