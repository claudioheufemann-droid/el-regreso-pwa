import { createClient } from '@/lib/supabase/server'
import { getServerUser } from '@/lib/auth'
import { vendedorCanonico, VENDEDORES_CARTERA_ACTIVAS } from '@/lib/types'
import ForecastClient from './ForecastClient'

export const dynamic = 'force-dynamic'

export interface FilaVentaMensual {
  cliente: string
  region: string
  mes: string // 'YYYY-MM-DD', primer día del mes
  litros: number
  monto: number
}

/**
 * Forecast de crecimiento por CLIENTE y por VENDEDOR/REGIÓN — distinto del
 * forecast de Producción (ese es por producto, para planificar planta; este
 * es cartera comercial: cuánto va a crecer un cliente o una región). No usa
 * Prophet: con 858 clientes y combinaciones arbitrarias del multi-select no
 * se puede precalcular un modelo por combinación, así que la tendencia y
 * proyección se calculan al vuelo en el cliente (ver ForecastClient.tsx) a
 * partir de este agregado mensual liviano (~6k filas).
 */
export default async function VentasForecastPage() {
  const supabase = await createClient()
  const user = await getServerUser()

  const { data: filasRaw } = await supabase.rpc('ventas_mensual_cliente_vendedor')

  const filasTodas: FilaVentaMensual[] = (filasRaw ?? []).map((f: { nombre_fantasia: string; vendedor_actual: string | null; mes: string; litros: number; monto: number }) => ({
    cliente: f.nombre_fantasia,
    region: vendedorCanonico(f.vendedor_actual ?? '') || 'Sin asignar',
    mes: f.mes,
    litros: Number(f.litros) || 0,
    monto: Number(f.monto) || 0,
  }))

  // Un vendedor regional no-admin sólo puede ver su propia cartera — el
  // filtrado es acá, en el servidor, no en el cliente (no se le manda al
  // browser data fuera de su scope).
  const filas = user?.isAdmin ? filasTodas : filasTodas.filter(f => f.region === user?.region)

  const clientesDisponibles = [...new Set(filas.map(f => f.cliente))].sort((a, b) => a.localeCompare(b))
  const regionesDisponibles = user?.isAdmin
    ? VENDEDORES_CARTERA_ACTIVAS.filter(r => filasTodas.some(f => f.region === r))
    : (user?.region ? [user.region] : [])

  return (
    <ForecastClient
      filas={filas}
      clientesDisponibles={clientesDisponibles}
      regionesDisponibles={regionesDisponibles}
      isAdmin={user?.isAdmin ?? false}
      miRegion={user?.region ?? null}
    />
  )
}
