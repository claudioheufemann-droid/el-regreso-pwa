import { NextResponse } from 'next/server'
import { sendPushToUser } from '@/lib/push'

// Ruta temporal de un solo uso para verificar en vivo que el push le llega al
// celular real de Claudio tras el fix de push_subscriptions/RLS (2026-07-30).
// Se borra apenas se confirma — no dejar en el repo.
export async function GET() {
  await sendPushToUser('7c8f5399-4b32-42cf-9500-7473f9140a27', {
    title: '🔔 Prueba de notificación',
    body: 'Si ves esto en tu celular, el fix funcionó — llegó sin abrir la app.',
    url: '/',
    tag: 'test',
  })
  return NextResponse.json({ ok: true })
}
