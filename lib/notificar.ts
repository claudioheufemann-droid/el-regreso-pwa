/**
 * notificar() — helper cliente para disparar push notifications
 * desde cualquier componente React sin acceso directo a lib/push.ts
 *
 * Llama a POST /api/push/notify de forma silenciosa (fire-and-forget).
 * No bloquea el flujo principal si falla.
 */

type NotifyEvent =
  | 'venta_cargada'
  | 'visita_completada'
  | 'visita_sin_venta'
  | 'camion_salida'
  | 'camion_llegada'
  | 'pedido_entregado'
  | 'tarea_asignada'
  | 'mision_pedido'
  | 'alerta_deuda'
  | 'test'

interface NotifyOptions {
  event: NotifyEvent
  title?: string
  body?: string
  url?: string
  userId?: string      // para tarea_asignada
}

export function notificar(opts: NotifyOptions): void {
  fetch('/api/push/notify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(opts),
  }).catch(() => {
    // Silencioso — no interrumpir el flujo del usuario
  })
}
