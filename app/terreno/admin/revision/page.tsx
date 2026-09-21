import { createClient } from '@/lib/supabase/server'
import RevisionClient, { type ItemRevision } from './RevisionClient'

export const dynamic = 'force-dynamic'

export default async function RevisionAdminPage() {
  const supabase = await createClient()

  const { data: visitas } = await supabase
    .from('visitas_terreno')
    .select(`
      id, cliente_nombre, vendedor_id, lat, lng, iniciada_at,
      distancia_cliente_m, precision_m, foto_exterior, foto_exterior_bytes,
      motivo_revision, captura_offline
    `)
    .eq('estado_presencia', 'pendiente_revision')
    .order('iniciada_at', { ascending: false })
    .limit(100)

  const vendedorIds = [...new Set((visitas ?? []).map(v => v.vendedor_id))]
  const { data: vendedores } = vendedorIds.length > 0
    ? await supabase.from('users').select('id, nombre').in('id', vendedorIds)
    : { data: [] as { id: string; nombre: string }[] }
  const nombrePorId = new Map((vendedores ?? []).map(v => [v.id, v.nombre]))

  const items: ItemRevision[] = (visitas ?? []).map(v => ({
    id: v.id,
    clienteNombre: v.cliente_nombre,
    vendedorNombre: nombrePorId.get(v.vendedor_id) ?? '—',
    iniciadaAt: v.iniciada_at,
    distanciaM: v.distancia_cliente_m != null ? Number(v.distancia_cliente_m) : null,
    precisionM: v.precision_m != null ? Number(v.precision_m) : null,
    fotoUrl: v.foto_exterior,
    fotoBytes: v.foto_exterior_bytes,
    motivoRevision: v.motivo_revision,
    capturaOffline: v.captura_offline,
  }))

  return <RevisionClient items={items} />
}
