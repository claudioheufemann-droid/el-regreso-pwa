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

  const lista = visitas ?? []
  const totalHoy   = lista.length
  const conVenta   = lista.filter(v => v.tiene_venta === true).length
  const sinVenta   = lista.filter(v => v.tiene_venta === false).length
  const enProgreso = lista.find(v => v.estado === 'en_progreso') ?? null

  return (
    <TerrenoHubClient
      vendedor={user}
      visitas={lista}
      kpis={{ totalHoy, conVenta, sinVenta }}
      visitaEnProgreso={enProgreso}
    />
  )
}
