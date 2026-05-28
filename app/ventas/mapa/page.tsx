import { createClient } from '@/lib/supabase/server'
import MapaClient from './MapaClient'

export default async function MapaPage() {
  const supabase = await createClient()

  // Obtener fechas disponibles — pedimos muchas filas para cubrir todos los días
  const { data: fechas } = await supabase
    .from('ventas')
    .select('fecha_pedido')
    .order('fecha_pedido', { ascending: false })
    .limit(10000)

  const fechasUnicas = [...new Set((fechas ?? []).map(f => f.fecha_pedido))].sort().reverse()
  const fechaDefault = fechasUnicas[0] ?? new Date().toISOString().split('T')[0]

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', minHeight: '100vh' }}>
      <MapaClient fechasDisponibles={fechasUnicas} fechaDefault={fechaDefault} />
    </div>
  )
}
