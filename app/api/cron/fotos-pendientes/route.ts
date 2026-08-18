import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL } from '@/lib/supabase/config'
import { sendPushToUser } from '@/lib/push'
import { fotosCompletas } from '@/lib/fotosVisita'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Vercel Cron: corre cada hora (vercel.json, "0 * * * *"). Recuerda a cada
 * vendedor las visitas cerradas a las que les falta alguna de las 4 fotos
 * del local — pedido de Claudio 2026-08-07: nada bloquea el cierre de la
 * visita, pero el recordatorio no debe parar hasta que suba la última.
 *
 * Por qué service-role: `visitas_terreno` tiene RLS por dueño
 * (visitas_select_own/visitas_update_own), y un cron no tiene sesión de
 * usuario — con el cliente anon la consulta volvería vacía en silencio
 * (mismo bug de fondo que ya se documentó en lib/push.ts).
 *
 * Por qué NO confiar solo en `fotos_status`: esa columna es un resumen que
 * históricamente se marcó "COMPLETO" con solo subir UNA foto (bug
 * corregido en HistorialClient.tsx el mismo día); acá se revalida contra
 * las 4 columnas reales antes de mandar o callar un recordatorio.
 *
 * `recordatorio_fotos_last_at` evita mandar más de un push por hora por
 * visita aunque el cron se atrase o se re-ejecute — no depende de que
 * Vercel dispare exactamente en punto.
 */
export async function GET(req: Request) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Ventana de silencio: no despertar a nadie a las 3 AM por una foto.
  // Se calcula en hora de Chile (no en UTC del cron) para no depender de
  // ajustar el schedule cada vez que cambia el horario de verano.
  const horaChile = Number(
    new Intl.DateTimeFormat('en-US', { timeZone: 'America/Santiago', hour: 'numeric', hour12: false }).format(new Date())
  )
  if (horaChile < 8 || horaChile >= 21) {
    return NextResponse.json({ ok: true, skipped: 'fuera de horario (08:00–21:00 Chile)' })
  }

  const serviceKey = process.env.SUPABASE_SERVICE_KEY
  if (!serviceKey) return NextResponse.json({ error: 'Falta SUPABASE_SERVICE_KEY' }, { status: 500 })
  const supabase = createClient(SUPABASE_URL, serviceKey)

  // Columnas explícitas (no armadas dinámicamente desde SLOTS_FOTO): el
  // `.select()` de Supabase tipa su resultado a partir del string literal
  // que recibe — un template string con variable rompe esa inferencia.
  const { data: visitas, error } = await supabase
    .from('visitas_terreno')
    .select('id, cliente_nombre, vendedor_id, recordatorio_fotos_last_at, foto_exterior, foto_interior, foto_exhibicion, foto_competencia')
    .eq('estado', 'completada')
    .eq('fotos_status', 'PENDIENTE')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const ahora = Date.now()
  const UNA_HORA_MS = 60 * 60 * 1000
  const pendientes = (visitas ?? []).filter(v =>
    !fotosCompletas(v) &&
    (!v.recordatorio_fotos_last_at || ahora - new Date(v.recordatorio_fotos_last_at).getTime() >= UNA_HORA_MS)
  )

  let enviados = 0
  for (const v of pendientes) {
    await sendPushToUser(v.vendedor_id, {
      title: '📸 Fotos pendientes',
      body: `Te faltan fotos de la visita a ${v.cliente_nombre}. Complétalas cuando puedas desde el Historial.`,
      url: '/terreno/historial',
      tag: `fotos-pendientes-${v.id}`,
    })
    await supabase.from('visitas_terreno').update({ recordatorio_fotos_last_at: new Date().toISOString() }).eq('id', v.id)
    enviados++
  }

  return NextResponse.json({ ok: true, revisadas: visitas?.length ?? 0, enviados })
}
