import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { calcularRango, hoySantiagoISO, type TipoPeriodo } from '@/lib/terreno/tiempoChile'
import RutaVendedorClient, { type ParadaDetalle } from './RutaVendedorClient'

export const dynamic = 'force-dynamic'

interface SearchParams { tipo?: string; fecha?: string }

export default async function RutaVendedorPage({
  params, searchParams,
}: {
  params: Promise<{ vendedorId: string }>
  searchParams: Promise<SearchParams>
}) {
  const { vendedorId } = await params
  const sp = await searchParams
  const tipo: TipoPeriodo = sp.tipo === 'semana' || sp.tipo === 'mes' ? sp.tipo : 'dia'
  const fecha = sp.fecha ?? hoySantiagoISO()
  const rango = calcularRango(tipo, fecha)

  const supabase = await createClient()

  const [{ data: vendedor }, { data: todosVendedores }, { data: visitas }] = await Promise.all([
    supabase.from('users').select('id, nombre, region').eq('id', vendedorId).maybeSingle(),
    supabase.from('users').select('id, nombre').ilike('rol', '%vendedor%').order('nombre'),
    supabase
      .from('visitas_terreno')
      .select(`
        id, cliente_nombre, cliente_erp_id, cliente_terreno_id, lat, lng,
        iniciada_at, completada_at, estado, estado_presencia, motivo_revision,
        distancia_cliente_m, precision_m, foto_exterior, foto_exterior_bytes,
        contacto, resultado_visita, proximo_paso, proximo_paso_fecha
      `)
      .eq('vendedor_id', vendedorId)
      .neq('estado', 'borrador')
      .gte('iniciada_at', rango.desde.toISOString())
      .lt('iniciada_at', rango.hasta.toISOString())
      .order('iniciada_at', { ascending: true }),
  ])

  if (!vendedor) notFound()

  const clienteIdsErp = [...new Set((visitas ?? []).map(v => v.cliente_erp_id).filter((x): x is number => x != null))]
  const { data: direccionesErp } = clienteIdsErp.length > 0
    ? await supabase.from('clientes').select('id, direccion, localidad').in('id', clienteIdsErp)
    : { data: [] as { id: number; direccion: string | null; localidad: string | null }[] }
  const dirPorId = new Map((direccionesErp ?? []).map(d => [d.id, d]))

  const paradas: ParadaDetalle[] = (visitas ?? []).map(v => ({
    id: v.id,
    clienteNombre: v.cliente_nombre,
    direccion: v.cliente_erp_id != null ? dirPorId.get(v.cliente_erp_id)?.direccion ?? null : null,
    localidad: v.cliente_erp_id != null ? dirPorId.get(v.cliente_erp_id)?.localidad ?? null : null,
    lat: v.lat != null ? Number(v.lat) : null,
    lng: v.lng != null ? Number(v.lng) : null,
    iniciadaAt: v.iniciada_at,
    completadaAt: v.completada_at,
    estado: v.estado,
    estadoPresencia: v.estado_presencia,
    motivoRevision: v.motivo_revision,
    distanciaM: v.distancia_cliente_m != null ? Number(v.distancia_cliente_m) : null,
    precisionM: v.precision_m != null ? Number(v.precision_m) : null,
    fotoUrl: v.foto_exterior,
    fotoBytes: v.foto_exterior_bytes,
    contacto: v.contacto,
    resultadoVisita: v.resultado_visita,
    proximoPaso: v.proximo_paso,
    proximoPasoFecha: v.proximo_paso_fecha,
  }))

  return (
    <RutaVendedorClient
      vendedorId={vendedorId}
      vendedorNombre={vendedor.nombre}
      vendedorRegion={vendedor.region}
      todosVendedores={todosVendedores ?? []}
      tipo={tipo} fecha={fecha}
      rangoTexto={`${rango.desdeFechaISO}${rango.desdeFechaISO !== rango.hastaFechaISO ? ` — ${rango.hastaFechaISO}` : ''}`}
      paradas={paradas}
    />
  )
}
