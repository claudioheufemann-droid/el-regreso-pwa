import { createClient } from '@/lib/supabase/server'
import MapaClient from './MapaClient'

export default async function MapaPage() {
  const supabase = await createClient()

  // Obtener fechas disponibles con paginación (puede superar 1000 días con historial largo)
  const fechasSet = new Set<string>()
  let offset = 0
  while (true) {
    const { data: page } = await supabase
      .from('ventas')
      .select('fecha_pedido')
      .order('fecha_pedido', { ascending: false })
      .range(offset, offset + 999)
    if (!page || page.length === 0) break
    page.forEach(f => fechasSet.add(f.fecha_pedido))
    if (page.length < 1000) break
    offset += 1000
  }
  const fechasUnicas = [...fechasSet].sort().reverse()
  const fechaDefault = fechasUnicas[0] ?? new Date().toISOString().split('T')[0]

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', minHeight: '100vh' }}>
      <MapaClient fechasDisponibles={fechasUnicas} fechaDefault={fechaDefault} />
    </div>
  )
}
