import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supabase/config'
import { procesarFotoLlegada } from '@/lib/terreno/fotoServidor'
import { evaluarPresencia, PARAMS_VERIFICACION } from '@/lib/terreno/verificacion'
import { distanciaMetros } from '@/lib/geo'
import {
  CUOTA_MENSUAL_BYTES_VENDEDOR, CUOTA_ALERTA_UMBRALES,
  SESION_CAPTURA_MAX_MS, RELOJ_TOLERANCIA_FUTURO_MS, RELOJ_TOLERANCIA_PASADO_MS,
} from '@/lib/terreno/config'

export const runtime = 'nodejs' // sharp necesita el runtime de Node, no Edge

async function getSupabase() {
  const cookieStore = await cookies()
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (list) => { try { list.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } catch {} },
    },
  })
}

function getServiceSupabase() {
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!key) return null
  return createSupabaseClient(SUPABASE_URL, key)
}

interface Referencia {
  lat: number | null
  lng: number | null
  validada: boolean
  radioM: number
}

/**
 * POST /api/terreno/visitas/[id]/llegada — el único punto de entrada que
 * puede marcar una llegada como verificada. Recibe foto + GPS crudos,
 * decide el estado de presencia en SERVIDOR (nunca confía en un booleano
 * que mande el cliente) y deja todo lo demás (fotos_status, contacto,
 * objetivo, etc.) para el cierre de visita — este endpoint solo resuelve
 * el gate de "¿llegó de verdad?".
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await getSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const form = await req.formData()
  const foto = form.get('foto')
  if (!(foto instanceof File)) return NextResponse.json({ error: 'Falta la foto' }, { status: 400 })

  const lat = numOrNull(form.get('lat'))
  const lng = numOrNull(form.get('lng'))
  const precisionM = numOrNull(form.get('precision'))
  const timestampLecturaGps = strOrNull(form.get('timestampLecturaGps'))
  const sesionCapturaId = strOrNull(form.get('sesionCapturaId'))
  const capturaOffline = form.get('capturaOffline') === '1'
  const clienteErpId = numOrNull(form.get('clienteErpId'))
  const clienteTerrenoId = strOrNull(form.get('clienteTerrenoId'))
  const incidenciaDeclarada = form.get('incidenciaDeclarada') === '1'
  const notaIncidencia = strOrNull(form.get('notaIncidencia'))

  if (incidenciaDeclarada && !notaIncidencia) {
    return NextResponse.json({ error: 'Una incidencia declarada necesita nota obligatoria' }, { status: 400 })
  }

  const { data: visita } = await supabase
    .from('visitas_terreno')
    .select('id, vendedor_id, cliente_terreno_id, cliente_erp_id, sesion_captura_id, sesion_captura_iniciada_at, estado')
    .eq('id', id)
    .eq('vendedor_id', user.id)
    .maybeSingle()
  if (!visita) return NextResponse.json({ error: 'Visita no encontrada' }, { status: 404 })

  // Si el POST trae un id de cliente que la visita todavía no tenía (primer
  // enlace), se persiste acá — no hace falta un round-trip aparte para eso.
  const erpIdFinal = visita.cliente_erp_id ?? clienteErpId ?? null
  const terrenoIdFinal = visita.cliente_terreno_id ?? clienteTerrenoId ?? null

  const referencia = await resolverReferencia(supabase, erpIdFinal, terrenoIdFinal)

  const fotoBuffer = Buffer.from(await foto.arrayBuffer())
  const resultadoFoto = await procesarFotoLlegada(fotoBuffer)
  if (!resultadoFoto.ok) {
    return NextResponse.json({ error: resultadoFoto.error, requiereRepetirFoto: true }, { status: 422 })
  }
  const fotoValida = true

  const ahora = Date.now()
  const horaRecepcionServidor = new Date(ahora)

  let distanciaM: number | null = null
  if (lat != null && lng != null && referencia.lat != null && referencia.lng != null) {
    distanciaM = distanciaMetros(lat, lng, referencia.lat, referencia.lng)
  }

  let edadLecturaS: number | null = null
  let relojIncoherente = false
  if (timestampLecturaGps) {
    const t = new Date(timestampLecturaGps).getTime()
    if (!Number.isNaN(t)) {
      edadLecturaS = Math.max(0, (ahora - t) / 1000)
      if (t - ahora > RELOJ_TOLERANCIA_FUTURO_MS || ahora - t > RELOJ_TOLERANCIA_PASADO_MS) relojIncoherente = true
    }
  }

  const sesionValida = !capturaOffline
    && !!sesionCapturaId
    && sesionCapturaId === visita.sesion_captura_id
    && !!visita.sesion_captura_iniciada_at
    && (ahora - new Date(visita.sesion_captura_iniciada_at).getTime()) <= SESION_CAPTURA_MAX_MS

  const resultado = evaluarPresencia({
    referenciaValidada: referencia.validada,
    radioM: referencia.radioM,
    distanciaM,
    precisionM,
    edadLecturaS,
    sesionValida,
    capturaOffline,
    fotoValida,
    relojIncoherente,
    incidenciaDeclarada,
  })

  // Subida de la foto procesada — mismo bucket y convención de path que el resto de terreno-fotos.
  const path = `${id}/exterior.webp`
  const { error: errUpload } = await supabase.storage
    .from('terreno-fotos')
    .upload(path, resultadoFoto.foto.buffer, { upsert: true, contentType: 'image/webp' })
  if (errUpload) return NextResponse.json({ error: `No se pudo subir la foto: ${errUpload.message}` }, { status: 500 })

  const pathMini = `${id}/exterior-mini.webp`
  await supabase.storage.from('terreno-fotos').upload(pathMini, resultadoFoto.foto.miniatura, { upsert: true, contentType: 'image/webp' })

  const { data: { publicUrl } } = supabase.storage.from('terreno-fotos').getPublicUrl(path)

  const { error: errUpdate } = await supabase
    .from('visitas_terreno')
    .update({
      estado: 'en_progreso',
      lat, lng, precision_m: precisionM,
      distancia_cliente_m: distanciaM != null ? Math.round(distanciaM) : null,
      dentro_geofence: distanciaM != null ? distanciaM <= referencia.radioM : null,
      hora_dispositivo: timestampLecturaGps,
      hora_recepcion_servidor: horaRecepcionServidor.toISOString(),
      captura_offline: capturaOffline,
      foto_exterior: publicUrl,
      foto_exterior_hash: resultadoFoto.foto.hashSha256,
      foto_exterior_bytes: resultadoFoto.foto.bytes,
      foto_exterior_ancho: resultadoFoto.foto.ancho,
      foto_exterior_alto: resultadoFoto.foto.alto,
      estado_presencia: resultado.estado,
      motivo_revision: resultado.motivo,
      cliente_erp_id: erpIdFinal,
      cliente_terreno_id: terrenoIdFinal,
    })
    .eq('id', id)
  if (errUpdate) return NextResponse.json({ error: errUpdate.message }, { status: 500 })

  const cuota = await registrarUsoStorage(user.id, resultadoFoto.foto.bytes + resultadoFoto.foto.miniatura.length)

  // Duplicado exacto: misma foto (mismo hash) ya usada en otra visita — señal para revisión, no bloquea.
  const { data: duplicados } = await supabase
    .from('visitas_terreno')
    .select('id')
    .eq('foto_exterior_hash', resultadoFoto.foto.hashSha256)
    .neq('id', id)
    .limit(1)

  return NextResponse.json({
    ok: true,
    estadoPresencia: resultado.estado,
    motivoRevision: resultado.motivo,
    distanciaM: distanciaM != null ? Math.round(distanciaM) : null,
    precisionM,
    radioM: referencia.radioM,
    fotoUrl: publicUrl,
    fotoBytes: resultadoFoto.foto.bytes,
    horaRecepcionServidor: horaRecepcionServidor.toISOString(),
    fotoDuplicada: (duplicados?.length ?? 0) > 0,
    cuota,
  })
}

function numOrNull(v: FormDataEntryValue | null): number | null {
  if (v == null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
function strOrNull(v: FormDataEntryValue | null): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null
}

async function resolverReferencia(
  supabase: Awaited<ReturnType<typeof getSupabase>>,
  clienteErpId: number | null,
  clienteTerrenoId: string | null,
): Promise<Referencia> {
  if (clienteErpId != null) {
    const { data } = await supabase
      .from('clientes')
      .select('lat, lng, ubicacion_estado, ubicacion_radio_m')
      .eq('id', clienteErpId)
      .maybeSingle()
    if (data) {
      return {
        lat: data.lat ?? null, lng: data.lng ?? null,
        validada: data.ubicacion_estado === 'validada',
        radioM: data.ubicacion_radio_m ?? PARAMS_VERIFICACION.radioDefaultM,
      }
    }
  }
  if (clienteTerrenoId) {
    const { data } = await supabase
      .from('clientes_terreno')
      .select('lat, lng, ubicacion_estado, ubicacion_radio_m')
      .eq('id', clienteTerrenoId)
      .maybeSingle()
    if (data) {
      return {
        lat: data.lat != null ? Number(data.lat) : null,
        lng: data.lng != null ? Number(data.lng) : null,
        validada: data.ubicacion_estado === 'validada',
        radioM: data.ubicacion_radio_m ?? PARAMS_VERIFICACION.radioDefaultM,
      }
    }
  }
  return { lat: null, lng: null, validada: false, radioM: PARAMS_VERIFICACION.radioDefaultM }
}

async function registrarUsoStorage(vendedorId: string, bytes: number) {
  const admin = getServiceSupabase()
  if (!admin) return null
  const periodo = new Date().toISOString().slice(0, 7) // 'YYYY-MM'

  const { data: actual } = await admin
    .from('terreno_storage_uso')
    .select('bytes_totales')
    .eq('vendedor_id', vendedorId)
    .eq('periodo', periodo)
    .maybeSingle()

  const nuevoTotal = (actual?.bytes_totales ?? 0) + bytes
  await admin
    .from('terreno_storage_uso')
    .upsert({ vendedor_id: vendedorId, periodo, bytes_totales: nuevoTotal, updated_at: new Date().toISOString() }, { onConflict: 'vendedor_id,periodo' })

  const fraccion = nuevoTotal / CUOTA_MENSUAL_BYTES_VENDEDOR
  const umbralAlcanzado = [...CUOTA_ALERTA_UMBRALES].reverse().find(u => fraccion >= u) ?? null

  return { bytesTotales: nuevoTotal, cuotaBytes: CUOTA_MENSUAL_BYTES_VENDEDOR, fraccion, umbralAlcanzado, periodo }
}
