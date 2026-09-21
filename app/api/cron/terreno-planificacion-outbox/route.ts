import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL } from '@/lib/supabase/config'
import { emailPlanificacionPorAprobar } from '@/lib/email'

export const runtime = 'nodejs'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://control.elregresobeer.com'
const MAX_INTENTOS = 5
const LOTE = 25

/**
 * Worker del outbox de planificación de terreno (Vercel Cron, ver vercel.json). Procesa
 * correo_outbox_terreno en estado pendiente/fallido — la tabla sólo la puede tocar el
 * service-role (RLS sin policies para authenticated/anon a propósito), por eso este
 * worker es la ÚNICA vía por la que esos correos salen de verdad; encolar (POST /enviar)
 * y enviar (acá) están deliberadamente separados para que una falla de Resend nunca
 * pierda la solicitud ya guardada.
 */
export async function GET(req: Request) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const key = process.env.SUPABASE_SERVICE_KEY
  if (!key) return NextResponse.json({ error: 'Falta SUPABASE_SERVICE_KEY' }, { status: 500 })
  const supabase = createClient(SUPABASE_URL, key)

  const { data: pendientes, error } = await supabase
    .from('correo_outbox_terreno')
    .select('*')
    .in('estado', ['pendiente', 'fallido'])
    .lt('intento_count', MAX_INTENTOS)
    .order('encolado_at', { ascending: true })
    .limit(LOTE)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

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

  return NextResponse.json({ procesados: (pendientes ?? []).length, enviados, fallidos })
}
