import 'server-only'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { SUPABASE_URL } from '@/lib/supabase/config'
import { emailPlanificacionPorAprobar } from '@/lib/email'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://control.elregresobeer.com'
const MAX_INTENTOS = 5
const LOTE_DEFECTO = 25

function supabaseAdmin(): SupabaseClient | null {
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!key) return null
  return createClient(SUPABASE_URL, key)
}

/**
 * Procesa correo_outbox_terreno en estado pendiente/fallido y envía lo que corresponda
 * por Resend. Se llama desde DOS lugares a propósito:
 *   1. El cron diario (app/api/cron/terreno-planificacion-outbox) — red de seguridad,
 *      Vercel Hobby sólo permite cron con granularidad diaria (no cada N minutos).
 *   2. `enviar a aprobación` (fire-and-forget, sin esperar el resultado) — para que el
 *      correo salga casi al instante en el caso común, en vez de esperar hasta el
 *      próximo cron diario.
 * Ambos caminos son seguros de superponer: cada fila sólo se toma una vez por estado
 * (pendiente/fallido → enviado), así que llamarlo dos veces seguidas no duplica nada.
 */
export async function procesarOutboxPendiente(lote: number = LOTE_DEFECTO): Promise<{ procesados: number; enviados: number; fallidos: number } | { error: string }> {
  const supabase = supabaseAdmin()
  if (!supabase) return { error: 'Falta SUPABASE_SERVICE_KEY' }

  const { data: pendientes, error } = await supabase
    .from('correo_outbox_terreno')
    .select('*')
    .in('estado', ['pendiente', 'fallido'])
    .lt('intento_count', MAX_INTENTOS)
    .order('encolado_at', { ascending: true })
    .limit(lote)
  if (error) return { error: error.message }

  let enviados = 0
  let fallidos = 0

  for (const item of pendientes ?? []) {
    try {
      if (item.tipo_evento === 'plan_enviado_a_aprobacion') {
        const payload = item.payload as {
          vendedorId: string; semanaLunes: string; version: number
          montoSolicitadoTotal: number; montoAlojamientoEstimado: number
          tardia: boolean; algunDiaPendienteDeCalculo: boolean
        }
        const { data: vendedor } = await supabase.from('users').select('nombre').eq('id', payload.vendedorId).maybeSingle()

        const result = await emailPlanificacionPorAprobar({
          toEmail: item.destinatario_email,
          vendedorNombre: vendedor?.nombre ?? 'Vendedor',
          semanaLunes: payload.semanaLunes,
          version: payload.version,
          montoSolicitadoTotal: payload.montoSolicitadoTotal,
          montoAlojamientoEstimado: payload.montoAlojamientoEstimado,
          tardia: payload.tardia,
          algunDiaPendienteDeCalculo: payload.algunDiaPendienteDeCalculo,
          enlace: `${APP_URL}/terreno/admin/planificacion?semana=${payload.semanaLunes}&vendedor=${payload.vendedorId}`,
        })
        if (result.error) throw new Error(result.error.message)
      } else {
        throw new Error(`tipo_evento desconocido: ${item.tipo_evento}`)
      }

      await supabase.from('correo_outbox_terreno')
        .update({ estado: 'enviado', enviado_at: new Date().toISOString() })
        .eq('id', item.id)
      enviados++
    } catch (err) {
      await supabase.from('correo_outbox_terreno')
        .update({
          estado: 'fallido',
          intento_count: item.intento_count + 1,
          ultimo_error: err instanceof Error ? err.message : String(err),
        })
        .eq('id', item.id)
      fallidos++
    }
  }

  return { procesados: (pendientes ?? []).length, enviados, fallidos }
}
