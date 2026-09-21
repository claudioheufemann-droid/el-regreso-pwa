import { createClient } from '@/lib/supabase/server'
import { calcularRango, hoySantiagoISO, type TipoPeriodo } from '@/lib/terreno/tiempoChile'
import ReportesClient, { type FilaReporte } from './ReportesClient'

export const dynamic = 'force-dynamic'

interface SearchParams { tipo?: string; fecha?: string }

export default async function ReportesAdminPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams
  const tipo: TipoPeriodo = sp.tipo === 'semana' || sp.tipo === 'mes' ? sp.tipo : 'mes'
  const fecha = sp.fecha ?? hoySantiagoISO()
  const rango = calcularRango(tipo, fecha)

  const supabase = await createClient()
  const { data: visitas } = await supabase
    .from('visitas_terreno')
    .select(`
      id, vendedor_id, cliente_nombre, cliente_erp_id, iniciada_at, completada_at,
      estado, estado_presencia, distancia_cliente_m, precision_m,
      contacto, objetivo_visita, resultado_visita, proximo_paso, proximo_paso_fecha, total_pedido
    `)
    .neq('estado', 'borrador')
    .gte('iniciada_at', rango.desde.toISOString())
    .lt('iniciada_at', rango.hasta.toISOString())
    .order('iniciada_at', { ascending: true })
    .limit(2000)

  const vendedorIds = [...new Set((visitas ?? []).map(v => v.vendedor_id))]
  const clienteIds = [...new Set((visitas ?? []).map(v => v.cliente_erp_id).filter((x): x is number => x != null))]

  const [{ data: vendedores }, { data: clientesDir }] = await Promise.all([
    vendedorIds.length > 0 ? supabase.from('users').select('id, nombre').in('id', vendedorIds) : Promise.resolve({ data: [] as { id: string; nombre: string }[] }),
    clienteIds.length > 0 ? supabase.from('clientes').select('id, direccion, localidad').in('id', clienteIds) : Promise.resolve({ data: [] as { id: number; direccion: string | null; localidad: string | null }[] }),
  ])
  const nombrePorId = new Map((vendedores ?? []).map(v => [v.id, v.nombre]))
  const dirPorId = new Map((clientesDir ?? []).map(c => [c.id, c]))

  const filas: FilaReporte[] = (visitas ?? []).map(v => ({
    id: v.id,
    vendedor: nombrePorId.get(v.vendedor_id) ?? v.vendedor_id,
    cliente: v.cliente_nombre,
    direccion: v.cliente_erp_id != null ? dirPorId.get(v.cliente_erp_id)?.direccion ?? '' : '',
    comuna: v.cliente_erp_id != null ? dirPorId.get(v.cliente_erp_id)?.localidad ?? '' : '',
    llegada: v.iniciada_at,
    cierre: v.completada_at,
    presencia: v.estado_presencia,
    distanciaM: v.distancia_cliente_m != null ? Number(v.distancia_cliente_m) : null,
    precisionM: v.precision_m != null ? Number(v.precision_m) : null,
    contacto: v.contacto,
    objetivo: v.objetivo_visita,
    resultado: v.resultado_visita,
    proximoPaso: v.proximo_paso,
    proximoPasoFecha: v.proximo_paso_fecha,
    totalPedido: v.total_pedido != null ? Number(v.total_pedido) : 0,
  }))

  return (
    <ReportesClient
      tipo={tipo} fecha={fecha}
      rangoTexto={`${rango.desdeFechaISO}${rango.desdeFechaISO !== rango.hastaFechaISO ? ` — ${rango.hastaFechaISO}` : ''}`}
      filas={filas}
    />
  )
}
