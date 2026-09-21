import { createClient } from '@/lib/supabase/server'
import { calcularRango, hoySantiagoISO, type TipoPeriodo } from '@/lib/terreno/tiempoChile'
import VisitasAdminClient, { type FilaVisita } from './VisitasAdminClient'

export const dynamic = 'force-dynamic'

interface SearchParams { tipo?: string; fecha?: string }

export default async function VisitasAdminPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams
  const tipo: TipoPeriodo = sp.tipo === 'semana' || sp.tipo === 'mes' ? sp.tipo : 'dia'
  const fecha = sp.fecha ?? hoySantiagoISO()
  const rango = calcularRango(tipo, fecha)

  const supabase = await createClient()
  const { data: visitas } = await supabase
    .from('visitas_terreno')
    .select('id, vendedor_id, cliente_nombre, iniciada_at, estado, estado_presencia, contacto, resultado_visita, total_pedido')
    .neq('estado', 'borrador')
    .gte('iniciada_at', rango.desde.toISOString())
    .lt('iniciada_at', rango.hasta.toISOString())
    .order('iniciada_at', { ascending: false })
    .limit(300)

  const vendedorIds = [...new Set((visitas ?? []).map(v => v.vendedor_id))]
  const { data: vendedores } = vendedorIds.length > 0
    ? await supabase.from('users').select('id, nombre').in('id', vendedorIds)
    : { data: [] as { id: string; nombre: string }[] }
  const nombrePorId = new Map((vendedores ?? []).map(v => [v.id, v.nombre]))

  const filas: FilaVisita[] = (visitas ?? []).map(v => ({
    id: v.id, vendedorId: v.vendedor_id, vendedorNombre: nombrePorId.get(v.vendedor_id) ?? '—',
    clienteNombre: v.cliente_nombre, iniciadaAt: v.iniciada_at, estado: v.estado,
    estadoPresencia: v.estado_presencia, contacto: v.contacto, resultadoVisita: v.resultado_visita,
    totalPedido: v.total_pedido != null ? Number(v.total_pedido) : null,
  }))

  return (
    <VisitasAdminClient
      tipo={tipo} fecha={fecha}
      rangoTexto={`${rango.desdeFechaISO}${rango.desdeFechaISO !== rango.hastaFechaISO ? ` — ${rango.hastaFechaISO}` : ''}`}
      filas={filas}
    />
  )
}
