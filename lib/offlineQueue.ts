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
}

const KEY = 'el-regreso-offline-queue-v1'

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
 * Intenta escribir de inmediato. Si falla por red, encola para reintento
 * automático y no lanza — el flujo de la UI sigue sin bloquearse.
 */
export async function upsertOrQueue(
  supabase: SupabaseClient,
  table: string,
  payload: Record<string, unknown>,
  onConflict = 'id',
): Promise<{ ok: boolean; queued: boolean }> {
  try {
    const { error } = await supabase.from(table).upsert(payload, { onConflict })
    if (error) throw error
    return { ok: true, queued: false }
  } catch {
    const queue = readQueue()
    queue.push({ qid: crypto.randomUUID(), table, payload, onConflict, createdAt: Date.now() })
    writeQueue(queue)
    return { ok: false, queued: true }
  }
}

/** Reintenta todas las operaciones pendientes. Las que sigan fallando se mantienen en cola. */
export async function flushQueue(supabase: SupabaseClient): Promise<void> {
  const queue = readQueue()
  if (queue.length === 0) return
  const remaining: QueuedOp[] = []
  for (const op of queue) {
    try {
      const { error } = await supabase.from(op.table).upsert(op.payload, { onConflict: op.onConflict })
      if (error) throw error
    } catch {
      remaining.push(op)
    }
  }
  writeQueue(remaining)
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
