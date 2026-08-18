import { redirect } from 'next/navigation'
import { getServerUser } from '@/lib/auth'
import { puedeVerComisionGerenteEquipo } from '@/lib/comisiones'
import { periodoActual } from '@/lib/periodos'
import ComisionesClient from './ComisionesClient'

export const dynamic = 'force-dynamic'

export default async function ComisionesPage() {
  const user = await getServerUser()
  if (!user) redirect('/login')
  // Mismo permiso que Rentabilidad (Claudio/Benja/Douglas) — es remuneración
  // de personas, no un KPI del equipo. Si no tiene el permiso, ni siquiera
  // debe saber que esta ruta existe, así que se manda directo al Hub.
  if (!user.puedeVerMargenes) redirect('/ventas')

  const periodo = periodoActual()

  return (
    <ComisionesClient
      user={user}
      periodo={{ desde: periodo.inicio, hasta: periodo.fin, nombre: periodo.nombre }}
      veTarjetaClaudio={puedeVerComisionGerenteEquipo(user)}
    />
  )
}
