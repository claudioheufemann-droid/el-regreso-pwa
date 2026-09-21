'use client'

/**
 * Cola offline para el POST de llegada (foto+GPS) — es un multipart a un
 * API route, no un upsert de fila ni una subida directa a Storage, así que
 * ni lib/offlineQueue.ts ni lib/offlinePhotoQueue.ts le sirven tal cual.
 * Mismo principio: si la red falla o se agota el timeout, se guarda en
 * IndexedDB (por visita, sobrescribiendo cualquier intento previo de esa
 * misma visita) y se reintenta al volver la conexión o cada 20 s.
 *
 * Mientras está en cola, la visita se trata como 'captura_offline' en la
 * UI — el servidor es quien decide el estado_presencia final recién
 * cuando el POST llega de verdad (ver evaluarPresencia: offline siempre
 * cae a revisión, así que no hay nada que "adivinar" en el cliente).
 */

export interface LlegadaEnCola {
  visitaId: string
  blob: Blob
  lat: number | null
  lng: number | null
  precisionM: number | null
  timestampLecturaGps: string | null
  sesionCapturaId: string | null
  clienteErpId: number | null
  clienteTerrenoId: string | null
  createdAt: number
}

const DB_NAME = 'el-regreso-offline-llegadas'
const STORE = 'llegadas'
const DB_VERSION = 1

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'visitaId' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function withStore<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode)
    const req = fn(tx.objectStore(STORE))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

type Listener = (count: number) => void
const listeners = new Set<Listener>()
async function notify() {
  const all = await getAll()
  listeners.forEach(fn => fn(all.length))
}
export function onColaLlegadaChange(fn: Listener): () => void {
  listeners.add(fn)
  getAll().then(a => fn(a.length))
  return () => listeners.delete(fn)
}

async function getAll(): Promise<LlegadaEnCola[]> {
  if (typeof window === 'undefined' || !('indexedDB' in window)) return []
  try { return await withStore('readonly', s => s.getAll()) } catch { return [] }
}

export async function encolarLlegada(entrada: Omit<LlegadaEnCola, 'createdAt'>): Promise<void> {
  if (typeof window === 'undefined' || !('indexedDB' in window)) return
  try {
    await withStore('readwrite', s => s.put({ ...entrada, createdAt: Date.now() }))
    notify()
  } catch { /* IndexedDB no disponible — no hay más margen, el vendedor debe reintentar */ }
}

function construirFormData(item: LlegadaEnCola, capturaOffline: boolean): FormData {
  const fd = new FormData()
  fd.set('foto', item.blob, 'exterior.webp')
  if (item.lat != null) fd.set('lat', String(item.lat))
  if (item.lng != null) fd.set('lng', String(item.lng))
  if (item.precisionM != null) fd.set('precision', String(item.precisionM))
  if (item.timestampLecturaGps) fd.set('timestampLecturaGps', item.timestampLecturaGps)
  if (item.sesionCapturaId) fd.set('sesionCapturaId', item.sesionCapturaId)
  if (item.clienteErpId != null) fd.set('clienteErpId', String(item.clienteErpId))
  if (item.clienteTerrenoId) fd.set('clienteTerrenoId', item.clienteTerrenoId)
  fd.set('capturaOffline', capturaOffline ? '1' : '0')
  return fd
}

/** Reintenta todas las llegadas pendientes. Devuelve los ids de visita que sincronizaron con éxito. */
export async function flushColaLlegada(): Promise<string[]> {
  const pendientes = await getAll()
  if (pendientes.length === 0) return []
  const sincronizadas: string[] = []
  for (const item of pendientes) {
    try {
      const r = await fetch(`/api/terreno/visitas/${item.visitaId}/llegada`, { method: 'POST', body: construirFormData(item, true) })
      if (!r.ok && r.status !== 422) throw new Error('fallo')
      await withStore('readwrite', s => s.delete(item.visitaId))
      sincronizadas.push(item.visitaId)
    } catch { /* sigue en cola */ }
  }
  notify()
  return sincronizadas
}

let started = false
export function startColaLlegadaAutoFlush(): void {
  if (started || typeof window === 'undefined') return
  started = true
  window.addEventListener('online', () => flushColaLlegada())
  setInterval(() => { if (navigator.onLine) flushColaLlegada() }, 20000)
  if (navigator.onLine) flushColaLlegada()
}

/** Intenta el POST directo con timeout corto; si falla, encola. */
export async function enviarLlegadaConTimeout(
  entrada: Omit<LlegadaEnCola, 'createdAt'>,
  timeoutMs = 8000,
): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; encolada: true } | { ok: false; encolada: false; error: string }> {
  const fd = construirFormData({ ...entrada, createdAt: Date.now() }, false)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const r = await fetch(`/api/terreno/visitas/${entrada.visitaId}/llegada`, { method: 'POST', body: fd, signal: controller.signal })
    clearTimeout(timeout)
    const data = await r.json().catch(() => ({}))
    if (!r.ok) return { ok: false, encolada: false, error: (data as { error?: string }).error ?? 'No se pudo registrar la llegada.' }
    return { ok: true, data }
  } catch {
    clearTimeout(timeout)
    await encolarLlegada(entrada)
    return { ok: false, encolada: true }
  }
}
