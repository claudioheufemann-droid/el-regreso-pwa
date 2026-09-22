import { NextResponse } from 'next/server'
import { procesarOutboxPendiente } from '@/lib/terreno/planificacion/procesarOutbox'

export const runtime = 'nodejs'

/**
 * Cron diario de respaldo del outbox de planificación de terreno (ver vercel.json —
 * Vercel Hobby sólo permite cron con granularidad diaria, no cada N minutos). El envío
 * normal ocurre al instante desde POST /enviar (fire-and-forget); esto es la red de
 * seguridad para lo que haya fallado (ej. Resend caído un momento) y quedó en estado
 * 'fallido' con reintentos disponibles.
 */
export async function GET(req: Request) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const resultado = await procesarOutboxPendiente()
  if ('error' in resultado) return NextResponse.json(resultado, { status: 500 })
  return NextResponse.json(resultado)
}
