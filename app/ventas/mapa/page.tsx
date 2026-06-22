import { createClient } from '@/lib/supabase/server'
import MapaClient from './MapaClient'

export default async function MapaPage() {
  const supabase = await createClient()

  // Fechas únicas con ventas — vía RPC con DISTINCT (1 round-trip en vez de
  // paginar manualmente sobre toda la tabla solo para deduplicar fechas).
  const { data: fechasRows } = await supabase.rpc('fechas_ventas_disponibles')
  const fechasUnicas = (fechasRows ?? []).map((r: { fecha_pedido: string }) => r.fecha_pedido)
  const fechaDefault = fechasUnicas[0] ?? new Date().toISOString().split('T')[0]

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', minHeight: '100vh' }}>
      <MapaClient fechasDisponibles={fechasUnicas} fechaDefault={fechaDefault} />
    </div>
  )
}
