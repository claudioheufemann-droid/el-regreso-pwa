/**
 * POST /api/push/notify
 * Endpoint central de notificaciones. Recibe un evento y envía push
 * a los usuarios correctos según el tipo.
 *
 * Body: { event: string, data?: Record<string, unknown> }
 *
 * Eventos soportados:
 *   venta_cargada       → admins
 *   visita_completada   → admins
 *   visita_sin_venta    → admins
 *   camion_salida       → todos
 *   camion_llegada      → todos
 *   tarea_asignada      → usuario asignado (data.userId requerido)
 *   mision_pedido       → admins
 *   alerta_deuda        → admins
 *   test                → caller
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supabase/config'
import {
  sendPushToAll,
  sendPushToAllAdmins,
  sendPushToUser,
  type PushPayload,
} from '@/lib/push'

export const runtime = 'nodejs'

// Configuración por evento: quién recibe, ícono, URL destino
const EVENT_CONFIG: Record<string, {
  audience: 'all' | 'admins' | 'user'
  icon?: string
  defaultUrl: string
}> = {
  venta_cargada:      { audience: 'admins', defaultUrl: '/ventas' },
  visita_completada:  { audience: 'admins', defaultUrl: '/terreno/historial' },
  visita_sin_venta:   { audience: 'admins', defaultUrl: '/terreno/historial' },
  camion_salida:      { audience: 'all',    defaultUrl: '/flota' },
  camion_llegada:     { audience: 'all',    defaultUrl: '/flota' },
  tarea_asignada:     { audience: 'user',   defaultUrl: '/gestion' },
  mision_pedido:      { audience: 'admins', defaultUrl: '/ventas/misiones' },
  alerta_deuda:       { audience: 'admins', defaultUrl: '/ventas/clientes' },
  test:               { audience: 'admins', defaultUrl: '/' },
}

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} },
    })

    // Verificar autenticación
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const body = await req.json() as {
      event: string
      title?: string
      body?: string
      url?: string
      userId?: string
      data?: Record<string, unknown>
    }

    const { event, title, body: msgBody, url, userId } = body
    const cfg = EVENT_CONFIG[event]
    if (!cfg) return NextResponse.json({ error: `Evento desconocido: ${event}` }, { status: 400 })

    const payload: PushPayload = {
      title: title ?? 'El Regreso Control',
      body:  msgBody ?? 'Nueva actividad en la app',
      url:   url ?? cfg.defaultUrl,
      tag:   event,
      requireInteraction: false,
    }

    if (cfg.audience === 'all') {
      await sendPushToAll(payload)
    } else if (cfg.audience === 'admins') {
      await sendPushToAllAdmins(payload)
    } else if (cfg.audience === 'user' && userId) {
      await sendPushToUser(userId, payload)
    }

    return NextResponse.json({ ok: true, event, audience: cfg.audience })
  } catch (e) {
    console.error('Notify error:', e)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
