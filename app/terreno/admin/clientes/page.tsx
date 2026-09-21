import { createClient } from '@/lib/supabase/server'
import ClientesAdminClient, { type PuntoPendiente } from './ClientesAdminClient'

export const dynamic = 'force-dynamic'

export default async function ClientesAdminPage() {
  const supabase = await createClient()

  const [{ data: prospectos }, { data: clientesPendientes }] = await Promise.all([
    supabase
      .from('clientes_terreno')
      .select('id, nombre_fantasia, direccion, lat, lng, canal, ubicacion_estado, ubicacion_radio_m, created_at')
      .eq('ubicacion_estado', 'pendiente')
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('clientes')
      .select('id, nombre_fantasia, direccion, localidad, lat, lng, ubicacion_estado, ubicacion_radio_m')
      .eq('ubicacion_estado', 'pendiente')
      .not('lat', 'is', null)
      .order('nombre_fantasia')
      .limit(50),
  ])

  const pendientes: PuntoPendiente[] = [
    ...(prospectos ?? []).map(p => ({
      entidad: 'cliente_terreno' as const, id: p.id, nombre: p.nombre_fantasia,
      direccion: p.direccion, localidad: p.canal,
      lat: p.lat != null ? Number(p.lat) : null, lng: p.lng != null ? Number(p.lng) : null,
      radioM: p.ubicacion_radio_m ?? 100, esProspecto: true,
    })),
    ...(clientesPendientes ?? []).map(c => ({
      entidad: 'cliente' as const, id: c.id, nombre: c.nombre_fantasia ?? '(sin nombre)',
      direccion: c.direccion, localidad: c.localidad,
      lat: c.lat != null ? Number(c.lat) : null, lng: c.lng != null ? Number(c.lng) : null,
      radioM: c.ubicacion_radio_m ?? 100, esProspecto: false,
    })),
  ]

  return <ClientesAdminClient pendientes={pendientes} />
}
