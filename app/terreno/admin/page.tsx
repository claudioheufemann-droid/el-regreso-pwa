import { createClient } from '@/lib/supabase/server'
import { calcularRango, hoySantiagoISO, type TipoPeriodo } from '@/lib/terreno/tiempoChile'
import { firmarFotoTerreno } from '@/lib/terreno/fotosFirmadas'
import ResumenClient, { type FilaVendedor, type VisitaResumen } from './ResumenClient'

export const dynamic = 'force-dynamic'

interface SearchParams {
  tipo?: string
  fecha?: string
  vendedorId?: string
}

export default async function ResumenAdminPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams
  const tipo: TipoPeriodo = sp.tipo === 'semana' || sp.tipo === 'mes' ? sp.tipo : 'dia'
  const fecha = sp.fecha ?? hoySantiagoISO()
  const rango = calcularRango(tipo, fecha)

  const supabase = await createClient()

  const [{ data: vendedores }, { data: visitas }, { data: seguimientos }] = await Promise.all([
    supabase.from('users').select('id, nombre, region').ilike('rol', '%vendedor%').order('nombre'),
    supabase
      .from('visitas_terreno')
      .select('id, vendedor_id, cliente_nombre, cliente_erp_id, cliente_terreno_id, lat, lng, iniciada_at, estado, estado_presencia, foto_exterior')
      .gte('iniciada_at', rango.desde.toISOString())
      .lt('iniciada_at', rango.hasta.toISOString())
      .neq('estado', 'borrador')
      .order('iniciada_at', { ascending: false }),
    supabase
      .from('seguimientos')
      .select('vendedor_id, estado, fecha_hora_compromiso, realizado_at')
      .gte('fecha_hora_compromiso', rango.desde.toISOString())
      .lt('fecha_hora_compromiso', rango.hasta.toISOString()),
  ])

  const listaVendedores = vendedores ?? []
  const listaVisitas = visitas ?? []
  const listaSeguimientos = seguimientos ?? []

  const filas: FilaVendedor[] = listaVendedores.map(v => {
    const propias = listaVisitas.filter(x => x.vendedor_id === v.id)
    const verificadas = propias.filter(x => x.estado_presencia === 'verificada_auto' || x.estado_presencia === 'aprobada_manual').length
    const clientesUnicos = new Set(propias.map(x => x.cliente_erp_id ?? x.cliente_terreno_id ?? x.cliente_nombre)).size
    const porCerrar = propias.filter(x => x.estado === 'en_progreso').length
    const segVendedor = listaSeguimientos.filter(s => s.vendedor_id === v.id)
    const segCumplidos = segVendedor.filter(s => s.estado === 'realizado' && s.realizado_at && s.realizado_at <= s.fecha_hora_compromiso).length
    return {
      id: v.id, nombre: v.nombre, region: v.region,
      verificadas, clientesUnicos, porCerrar,
      seguimientosCumplidos: segCumplidos, seguimientosTotal: segVendedor.length,
    }
  })

  const kpis = {
    llegadasVerificadas: listaVisitas.filter(v => v.estado_presencia === 'verificada_auto' || v.estado_presencia === 'aprobada_manual').length,
    clientesUnicos: new Set(listaVisitas.map(v => v.cliente_erp_id ?? v.cliente_terreno_id ?? v.cliente_nombre)).size,
    porRevisar: listaVisitas.filter(v => v.estado_presencia === 'pendiente_revision').length,
    finalizadas: listaVisitas.filter(v => v.estado === 'completada').length,
  }

  const vendedorSeleccionadoId = sp.vendedorId
    ?? filas.slice().sort((a, b) => b.verificadas - a.verificadas)[0]?.id
    ?? null

  const paradasVendedor: VisitaResumen[] = await Promise.all(
    listaVisitas
      .filter(v => v.vendedor_id === vendedorSeleccionadoId && v.lat != null && v.lng != null)
      .slice()
      .sort((a, b) => a.iniciada_at.localeCompare(b.iniciada_at))
      .map(async v => ({
        id: v.id, clienteNombre: v.cliente_nombre, lat: Number(v.lat), lng: Number(v.lng),
        iniciadaAt: v.iniciada_at, estadoPresencia: v.estado_presencia, fotoUrl: await firmarFotoTerreno(supabase, v.foto_exterior),
      }))
  )

  const ultimasVisitas: (VisitaResumen & { vendedorNombre: string })[] = await Promise.all(
    listaVisitas.slice(0, 8).map(async v => ({
      id: v.id, clienteNombre: v.cliente_nombre, lat: v.lat != null ? Number(v.lat) : 0, lng: v.lng != null ? Number(v.lng) : 0,
      iniciadaAt: v.iniciada_at, estadoPresencia: v.estado_presencia, fotoUrl: await firmarFotoTerreno(supabase, v.foto_exterior),
      vendedorNombre: listaVendedores.find(x => x.id === v.vendedor_id)?.nombre ?? '—',
    }))
  )

  return (
    <ResumenClient
      tipo={tipo} fecha={fecha}
      rangoTexto={`${rango.desdeFechaISO}${rango.desdeFechaISO !== rango.hastaFechaISO ? ` — ${rango.hastaFechaISO}` : ''}`}
      kpis={kpis}
      vendedores={filas}
      vendedorSeleccionadoId={vendedorSeleccionadoId}
      vendedorSeleccionadoNombre={listaVendedores.find(v => v.id === vendedorSeleccionadoId)?.nombre ?? null}
      paradasVendedor={paradasVendedor}
      ultimasVisitas={ultimasVisitas}
    />
  )
}
