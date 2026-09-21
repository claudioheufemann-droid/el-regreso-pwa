import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supabase/config'

async function getSupabase() {
  const cookieStore = await cookies()
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (list) => { try { list.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } catch {} },
    },
  })
}

type Entidad = 'cliente' | 'cliente_terreno'
const TABLA: Record<Entidad, string> = { cliente: 'clientes', cliente_terreno: 'clientes_terreno' }

/**
 * POST /api/terreno/ubicacion/validar — único punto donde un pin de cliente
 * pasa de 'pendiente' a 'validada'. Sin esto, ninguna llegada verifica
 * automático (verificacion.ts exige referenciaValidada=true) — el sistema
 * completo depende de que un admin haya mirado el punto al menos una vez.
 * Corregir coordenadas suma versión (ubicacion_version) para dejar rastro
 * de cuántas veces cambió el punto de referencia; nunca se reescribe la
 * evidencia de visitas ya capturadas contra la versión anterior.
 */
export async function POST(req: Request) {
  const supabase = await getSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data: perfil } = await supabase.from('users').select('is_admin').eq('id', user.id).maybeSingle()
  if (!perfil?.is_admin) return NextResponse.json({ error: 'Solo un administrador puede validar ubicaciones' }, { status: 403 })

  const body = await req.json().catch(() => ({})) as {
    entidad?: Entidad; id?: string | number; lat?: number; lng?: number; radioM?: number
  }
  if (!body.entidad || !TABLA[body.entidad] || body.id == null) {
    return NextResponse.json({ error: 'entidad e id son obligatorios' }, { status: 400 })
  }
  const tabla = TABLA[body.entidad]
  const corrigeCoordenadas = body.lat != null && body.lng != null

  const { data: previa } = await supabase
    .from(tabla)
    .select('lat, lng, ubicacion_estado, ubicacion_version, ubicacion_radio_m')
    .eq('id', body.id)
    .maybeSingle()
  if (!previa) return NextResponse.json({ error: 'No existe ese registro' }, { status: 404 })

  const patch: Record<string, unknown> = {
    ubicacion_estado: 'validada',
    ubicacion_validado_por: user.id,
    ubicacion_validado_at: new Date().toISOString(),
  }
  if (corrigeCoordenadas) {
    patch.lat = body.lat
    patch.lng = body.lng
    patch.ubicacion_fuente = 'admin_manual'
    patch.ubicacion_version = (previa.ubicacion_version ?? 1) + 1
  }
  if (body.radioM != null && body.radioM > 0) patch.ubicacion_radio_m = body.radioM

  const { data: actualizada, error } = await supabase
    .from(tabla)
    .update(patch)
    .eq('id', body.id)
    .select('id, lat, lng, ubicacion_estado, ubicacion_version, ubicacion_radio_m')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await supabase.from('terreno_auditoria').insert({
    entidad: body.entidad,
    entidad_id: String(body.id),
    accion: corrigeCoordenadas ? 'corregida_ubicacion_referencia' : 'validada',
    admin_id: user.id,
    motivo: null,
    datos_previos: previa,
    datos_nuevos: actualizada,
  })

  return NextResponse.json(actualizada)
}
