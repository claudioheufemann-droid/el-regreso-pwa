import 'server-only'
import { createHash } from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL } from '@/lib/supabase/config'

/**
 * Cliente service-role, NO el de sesión del vendedor que envía el plan.
 *
 * correo_outbox_terreno se diseñó a propósito SIN policies de INSERT/SELECT para
 * `authenticated` (ver migración terreno_planificacion_vinculo_ventas_y_outbox): sólo el
 * servidor debe poder encolar o leer correos, nunca el cliente. Si esta función usara el
 * cliente de sesión de quien envía el plan, el insert siempre fallaría por RLS — mismo
 * error de fondo ya documentado en lib/push.ts (código real: pasó exactamente esto la
 * primera vez, "enviar a aprobación" devolvía 500 aunque el plan sí había quedado
 * guardado como enviado).
 */
function supabaseAdmin() {
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!key) throw new Error('encolarCorreo: falta SUPABASE_SERVICE_KEY en el entorno')
  return createClient(SUPABASE_URL, key)
}

/**
 * Encola un correo en correo_outbox_terreno. Idempotente por diseño: la clave se deriva
 * de tipo_evento+entidad_id+entidad_version+destinatario, así que un reenvío del mismo
 * evento (doble clic, retry del cliente) no inserta una fila nueva ni duplica el correo
 * — el conflicto de UNIQUE se ignora silenciosamente.
 */
export async function encolarCorreo(
  params: {
    tipoEvento: string
    entidad?: string
    entidadId: string
    entidadVersion: number
    destinatarioEmail: string
    payload: Record<string, unknown>
  },
) {
  const claveIdempotencia = createHash('sha1')
    .update(`${params.tipoEvento}:${params.entidadId}:${params.entidadVersion}:${params.destinatarioEmail}`)
    .digest('hex')

  const { error } = await supabaseAdmin().from('correo_outbox_terreno').insert({
    tipo_evento: params.tipoEvento,
    entidad: params.entidad ?? 'plan_semanal_terreno',
    entidad_id: params.entidadId,
    entidad_version: params.entidadVersion,
    destinatario_email: params.destinatarioEmail,
    clave_idempotencia: claveIdempotencia,
    payload: params.payload,
  })

  // 23505 = unique_violation: ya estaba encolado este evento+versión+destinatario, es
  // el comportamiento esperado de la idempotencia, no un error a propagar.
  if (error && error.code !== '23505') throw new Error(`No se pudo encolar el correo: ${error.message}`)
}
