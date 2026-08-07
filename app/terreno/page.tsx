import { createClient } from '@/lib/supabase/server'
import { getServerUser } from '@/lib/auth'
import TerrenoHubClient from './TerrenoHubClient'

export const dynamic = 'force-dynamic'

export default async function TerrenoPage() {
  const supabase = await createClient()
  const user = await getServerUser()
  if (!user) return null

  const hoy = new Date().toISOString().split('T')[0]

  const { data: visitas } = await supabase
    .from('visitas_terreno')
    .select('id, cliente_nombre, tiene_venta, motivo_sin_venta, total_pedido, estado, iniciada_at, completada_at')
    .eq('vendedor_id', user.id)
    .gte('iniciada_at', `${hoy}T00:00:00`)
    .order('iniciada_at', { ascending: false })

  // Cobranza: ventas a crédito de este vendedor que aún no se marcan como pagadas —
  // terreno es personal, cada vendedor solo ve (y cobra) las suyas.
  const { data: cobrosPendientes } = await supabase
    .from('visitas_terreno')
    .select('id, cliente_nombre, total_pedido, fecha_pago_estimada')
    .eq('vendedor_id', user.id)
    .eq('metodo_pago', 'credito')
    .eq('pagado', false)
    .not('fecha_pago_estimada', 'is', null)
    .order('fecha_pago_estimada', { ascending: true })

  // Canceladas quedan registradas en BD (auditoría) pero no cuentan como
  // "visita del día" — no se mostraron al cliente, no aportan a KPIs activos.
  const todasHoy   = visitas ?? []
  const lista      = todasHoy.filter(v => v.estado !== 'cancelada')
  const canceladas = todasHoy.filter(v => v.estado === 'cancelada').length
  const totalHoy   = lista.length
  const conVenta   = lista.filter(v => v.tiene_venta === true).length
  const sinVenta   = lista.filter(v => v.tiene_venta === false).length
  const enProgreso = lista.find(v => v.estado === 'en_progreso') ?? null

  return (
    <TerrenoHubClient
      vendedor={user}
      visitas={lista}
      kpis={{ totalHoy, conVenta, sinVenta, canceladas }}
      visitaEnProgreso={enProgreso}
      cobrosPendientes={cobrosPendientes ?? []}
    />
  )
}
