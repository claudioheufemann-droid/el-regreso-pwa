'use client'

/**
 * Cola de sincronización offline — para terreno con mala señal.
 *
 * Patrón: cada escritura es un UPSERT con un id generado en el cliente
 * (crypto.randomUUID()), nunca un INSERT puro. Esto hace que reintentar
 * la misma operación sea seguro (idempotente) sin duplicar filas, sin
 * importar cuántas veces se reintente ni en qué orden lleguen.
 *
 * Si la escritura falla por red, se guarda en localStorage y se reintenta:
 *  - al recuperar conexión (evento 'online')
 *  - cada 20s mientras haya pendientes (por si 'online' no dispara fiable)
 */
import type { SupabaseClient } from '@supabase/supabase-js'

interface QueuedOp {
  qid: string          // id interno de la cola (no de la fila)
  table: string
  payload: Record<string, unknown>
  onConflict: string
  createdAt: number
  intentos?: number    // reintentos fallidos acumulados
}

const KEY = 'el-regreso-offline-queue-v1'
/** Operaciones que se dieron por perdidas (no se borran: quedan para revisar). */
const KEY_MUERTOS = 'el-regreso-offline-queue-fallidos-v1'

/**
 * Tras estos reintentos se deja de insistir. El flush corre cada 20 s, así que
 * son ~10 min: si en ese lapso no entró, no es un problema de red pasajero sino
 * algo permanente (payload inválido, RLS, constraint). Antes se reintentaba para
 * siempre y el badge quedaba pegado en "Sincronizando N pendientes…".
 */
const MAX_INTENTOS = 30

function readQueue(): QueuedOp[] {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]') } catch { return [] }
}

function writeQueue(q: QueuedOp[]) {
  try { localStorage.setItem(KEY, JSON.stringify(q)) } catch {}
  notify()
}

type Listener = (count: number) => void
const listeners = new Set<Listener>()

export function onQueueChange(fn: Listener): () => void {
  listeners.add(fn)
  fn(readQueue().length)
  return () => listeners.delete(fn)
}

function notify() {
  const n = readQueue().length
  listeners.forEach(fn => fn(n))
}

export function queuedCount(): number {
  return readQueue().length
}

/**
 * El vendedor pasa horas en terreno con la pantalla apagada o la pestaña en
 * segundo plano entre visita y visita. Los navegadores móviles pausan los
 * timers en background, así que el refresh automático del token de sesión
 * (programado por supabase-js) muchas veces no llega a dispararse solo. Si
 * no se fuerza acá, el upsert sale con un access_token vencido: Postgres lo
 * trata como no-autenticado y el RLS (`vendedor_id = auth.uid()`) rechaza la
 * fila con 403 — indistinguible de un error de red, así que quedaba
 * reintentándose cada 20s hasta descartarse silenciosamente a los ~10min,
 * perdiendo el pedido/jornada sin avisar. getSession() refresca sola si el
 * token está vencido o a punto de vencer.
 *
 * Hallazgo 2026-09-21: cuando el refresh token queda invalidado (uso
 * concurrente entre pestañas/PWA reabierta, revocación, etc.), supabase-js
 * no reintenta — BORRA la sesión local por completo (`_removeSession`).
 * Desde ahí, TODO upsert sale con auth.uid()=null: RLS lo rechaza siempre,
 * nunca por azar de red, así que reintentar cada 20s es inútil — y como
 * upsertOrQueue trataba ese rechazo igual que un corte de señal, se
 * encolaba y se perdía en silencio a los ~10min sin avisar al vendedor.
 * Por eso acá se intenta un refreshSession() explícito como último recurso
 * y se devuelve si quedó una sesión utilizable, para que el llamador pueda
 * distinguir "sin señal, se sincroniza solo" de "sesión muerta, hay que
 * volver a iniciar sesión".
 */
export async function ensureFreshSession(supabase: SupabaseClient): Promise<boolean> {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (session) return true
    const { data } = await supabase.auth.refreshSession()
    return !!data.session
  } catch {
    return false
  }
}

type SesionListener = (perdida: boolean) => void
const sesionListeners = new Set<SesionListener>()

/** Avisa a la UI (ver OfflineBadge) que la sesión murió y hay que re-loguearse. */
function notificarSesionPerdida(perdida: boolean) {
  sesionListeners.forEach(fn => fn(perdida))
}

export function onSesionPerdida(fn: SesionListener): () => void {
  sesionListeners.add(fn)
  return () => sesionListeners.delete(fn)
}

/**
 * Intenta escribir de inmediato. Si falla por red, encola para reintento
 * automático y no lanza — el flujo de la UI sigue sin bloquearse.
 *
 * `sesionPerdida: true` en el resultado significa que reintentar es inútil
 * sin volver a iniciar sesión (ver ensureFreshSession) — el llamador debe
 * avisarle al vendedor en vez de asumir que "ya se va a sincronizar sola".
 */
export async function upsertOrQueue(
  supabase: SupabaseClient,
  table: string,
  payload: Record<string, unknown>,
  onConflict = 'id',
): Promise<{ ok: boolean; queued: boolean; sesionPerdida?: boolean }> {
  const haySesion = await ensureFreshSession(supabase)
  if (!haySesion) {
    const queue = readQueue()
    queue.push({ qid: crypto.randomUUID(), table, payload, onConflict, createdAt: Date.now() })
    writeQueue(queue)
    notificarSesionPerdida(true)
    return { ok: false, queued: true, sesionPerdida: true }
  }
  try {
    const { error } = await supabase.from(table).upsert(payload, { onConflict })
    if (error) throw error
    notificarSesionPerdida(false)
    return { ok: true, queued: false }
  } catch {
    const queue = readQueue()
    queue.push({ qid: crypto.randomUUID(), table, payload, onConflict, createdAt: Date.now() })
    writeQueue(queue)
    return { ok: false, queued: true }
  }
}

/**
 * Reintenta las operaciones pendientes.
 *
 * Las que fallan vuelven a la cola con un intento más. Al superar MAX_INTENTOS
 * se mueven a la cola de fallidos: dejan de reintentarse y de contarse como
 * "pendientes", pero NO se borran — quedan en localStorage por si hay que
 * recuperarlas a mano. Sin esto, un item con un error permanente se reintentaba
 * indefinidamente y el aviso de sincronización no se iba nunca.
 */
export async function flushQueue(supabase: SupabaseClient): Promise<void> {
  const queue = readQueue()
  if (queue.length === 0) return
  const haySesion = await ensureFreshSession(supabase)
  notificarSesionPerdida(!haySesion)
  // Sin sesión, cada intento va a fallar por RLS sin importar cuántas veces
  // se reintente — no tiene sentido gastar el cupo de MAX_INTENTOS de cada
  // ítem en algo que solo se arregla volviendo a iniciar sesión. Se deja la
  // cola intacta (nada se pierde) y se reintenta solo cuando haya sesión.
  if (!haySesion) return
  const remaining: QueuedOp[] = []
  const muertos: QueuedOp[] = []
  for (const op of queue) {
    try {
      const { error } = await supabase.from(op.table).upsert(op.payload, { onConflict: op.onConflict })
      if (error) throw error
    } catch {
      const intentos = (op.intentos ?? 0) + 1
      if (intentos >= MAX_INTENTOS) {
        muertos.push({ ...op, intentos })
        console.error(
          `[offlineQueue] descartada tras ${intentos} intentos: ${op.table}`,
          op.payload,
        )
      } else {
        remaining.push({ ...op, intentos })
      }
    }
  }
  if (muertos.length) {
    try {
      const previos: QueuedOp[] = JSON.parse(localStorage.getItem(KEY_MUERTOS) ?? '[]')
      localStorage.setItem(KEY_MUERTOS, JSON.stringify([...previos, ...muertos]))
    } catch {}
  }
  writeQueue(remaining)
}

/** Operaciones que se dieron por perdidas, para diagnóstico. */
export function fallidosCount(): number {
  if (typeof window === 'undefined') return 0
  try { return (JSON.parse(localStorage.getItem(KEY_MUERTOS) ?? '[]') as unknown[]).length } catch { return 0 }
}

let started = false

/** Arranca el reintento automático global. Llamar una sola vez (en Providers). */
export function startAutoFlush(supabase: SupabaseClient): void {
  if (started || typeof window === 'undefined') return
  started = true
  window.addEventListener('online', () => flushQueue(supabase))
  setInterval(() => {
    if (navigator.onLine) flushQueue(supabase)
  }, 20000)
  // Intento inicial al cargar (por si quedaron pendientes de la sesión anterior)
  if (navigator.onLine) flushQueue(supabase)
}
