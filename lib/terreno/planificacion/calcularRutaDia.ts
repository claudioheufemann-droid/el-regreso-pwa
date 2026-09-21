import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getRouteProvider } from '@/lib/terreno/rutas'
import { hashSecuenciaRuta } from '@/lib/terreno/rutas/hashParadas'
import type { LatLng } from '@/lib/terreno/rutas'

export type ResultadoCalculoRutaDia =
  | { ok: true; distanciaTotalM: number; duracionTotalS: number; deCache: boolean }
  | { ok: false; motivo: string }

async function resolverCoordsParada(
  supabase: SupabaseClient,
  parada: { cliente_id: number | null; cliente_terreno_id: string | null },
): Promise<LatLng | null> {
  if (parada.cliente_id != null) {
    const { data } = await supabase.from('clientes').select('lat, lng').eq('id', parada.cliente_id).maybeSingle()
    if (data?.lat == null || data?.lng == null) return null
    return { lat: Number(data.lat), lng: Number(data.lng) }
  }
  if (parada.cliente_terreno_id != null) {
    const { data } = await supabase
      .from('clientes_terreno')
      .select('lat, lng')
      .eq('id', parada.cliente_terreno_id)
      .maybeSingle()
    if (data?.lat == null || data?.lng == null) return null
    return { lat: Number(data.lat), lng: Number(data.lng) }
  }
  return null
}

/**
 * Calcula (o reutiliza del cache) la ruta real de un día planificado y actualiza
 * plan_paradas_terreno.estado_calculo_ruta/distancia_estimada_m. Nunca marca un día como
 * 'calculado' sin una respuesta real del proveedor — si no hay proveedor configurado o
 * falla la llamada, las paradas quedan en 'pendiente_de_calculo' y se devuelve ok:false,
 * que el llamador (endpoint) debe respetar sin fijar km_pagable.
 */
export async function calcularYCachearRutaDia(
  supabase: SupabaseClient,
  planDiaId: string,
): Promise<ResultadoCalculoRutaDia> {
  const { data: dia, error: diaError } = await supabase
    .from('plan_dias_terreno')
    .select('id, origen_lat, origen_lng, destino_lat, destino_lng, regreso_mismo_dia')
    .eq('id', planDiaId)
    .single()
  if (diaError || !dia) return { ok: false, motivo: 'Día de plan no encontrado' }
  if (dia.origen_lat == null || dia.origen_lng == null) {
    return { ok: false, motivo: 'Falta el origen del día (casa autorizada/bodega/alojamiento)' }
  }

  const { data: paradas, error: paradasError } = await supabase
    .from('plan_paradas_terreno')
    .select('id, orden, cliente_id, cliente_terreno_id')
    .eq('plan_dia_id', planDiaId)
    .order('orden', { ascending: true })
  if (paradasError) return { ok: false, motivo: paradasError.message }
  if (!paradas || paradas.length === 0) return { ok: false, motivo: 'El día no tiene paradas' }

  const origen: LatLng = { lat: Number(dia.origen_lat), lng: Number(dia.origen_lng) }
  const coordsParadas: LatLng[] = []
  for (const parada of paradas) {
    const coords = await resolverCoordsParada(supabase, parada)
    if (!coords) {
      return { ok: false, motivo: `La parada ${parada.orden + 1} no tiene ubicación validada` }
    }
    coordsParadas.push(coords)
  }

  const destino: LatLng | undefined = dia.regreso_mismo_dia
    ? origen
    : dia.destino_lat != null && dia.destino_lng != null
      ? { lat: Number(dia.destino_lat), lng: Number(dia.destino_lng) }
      : undefined

  const provider = getRouteProvider()
  const hash = hashSecuenciaRuta(origen, coordsParadas, destino)

  const { data: cacheado } = await supabase
    .from('plan_ruta_calculos_terreno')
    .select('*')
    .eq('plan_dia_id', planDiaId)
    .eq('proveedor', provider.nombre)
    .eq('parametros_hash', hash)
    .eq('vigente', true)
    .maybeSingle()

  if (cacheado) {
    await aplicarResultadoAParadas(supabase, paradas, cacheado.respuesta_cruda?.tramos ?? null)
    return { ok: true, distanciaTotalM: cacheado.distancia_total_m, duracionTotalS: cacheado.duracion_total_s ?? 0, deCache: true }
  }

  if (!provider.disponible()) {
    return { ok: false, motivo: 'No hay proveedor de rutas configurado (falta MAPBOX_ACCESS_TOKEN)' }
  }

  try {
    const resultado = await provider.calcularRuta(origen, coordsParadas, destino)

    await supabase
      .from('plan_ruta_calculos_terreno')
      .update({ vigente: false })
      .eq('plan_dia_id', planDiaId)
      .eq('proveedor', provider.nombre)

    await supabase.from('plan_ruta_calculos_terreno').insert({
      plan_dia_id: planDiaId,
      proveedor: provider.nombre,
      parametros_hash: hash,
      distancia_total_m: resultado.distanciaTotalM,
      duracion_total_s: resultado.duracionTotalS,
      km_pagable: Math.round(resultado.distanciaTotalM / 1000),
      respuesta_cruda: resultado,
      vigente: true,
    })

    await aplicarResultadoAParadas(supabase, paradas, resultado.tramos)

    return { ok: true, distanciaTotalM: resultado.distanciaTotalM, duracionTotalS: resultado.duracionTotalS, deCache: false }
  } catch (err) {
    return { ok: false, motivo: err instanceof Error ? err.message : 'Error calculando la ruta' }
  }
}

async function aplicarResultadoAParadas(
  supabase: SupabaseClient,
  paradas: { id: string; orden: number }[],
  tramos: { desdeIndice: number; hastaIndice: number; distanciaM: number }[] | null,
) {
  if (!tramos) return
  // tramos[i] es el tramo que TERMINA en la parada i (origen->parada0 es tramos[0], etc).
  for (let i = 0; i < paradas.length; i++) {
    const tramo = tramos[i]
    if (!tramo) continue
    await supabase
      .from('plan_paradas_terreno')
      .update({ estado_calculo_ruta: 'calculado', distancia_estimada_m: tramo.distanciaM })
      .eq('id', paradas[i].id)
  }
}
