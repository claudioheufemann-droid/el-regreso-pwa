'use client'

/**
 * Cola de fotos offline — para terreno con mala señal.
 *
 * Las fotos de check-in (exterior/exhibición/competencia) son binarios y no
 * caben en la cola de texto de lib/offlineQueue.ts (localStorage). Se
 * guardan en IndexedDB como Blob y se reintenta subirlas cuando vuelve la
 * conexión, igual que la cola de filas: al recuperar conexión ('online') y
 * cada 20s mientras haya pendientes.
 *
 * Al subir con éxito, se hace un upsert parcial de la fila visitas_terreno
 * con solo esa columna de foto — seguro aunque hayan pasado horas y el
 * componente de la visita ya no exista en memoria.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { upsertOrQueue } from './offlineQueue'

interface QueuedPhoto {
  id: string          // `${visitaId}:${key}`
  visitaId: string
  key: string          // 'exterior' | 'exhibicion' | 'competencia'
  campo: string         // columna destino en visitas_terreno
  blob: Blob
  contentType: string
  createdAt: number
}

const DB_NAME = 'el-regreso-offline-photos'
const STORE = 'photos'
const DB_VERSION = 1

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function withStore<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode)
    const req = fn(tx.objectStore(STORE))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function getAllPhotos(): Promise<QueuedPhoto[]> {
  if (typeof window === 'undefined' || !('indexedDB' in window)) return []
  try { return await withStore('readonly', s => s.getAll()) } catch { return [] }
}

type Listener = (count: number) => void
const listeners = new Set<Listener>()

async function notify() {
  const n = (await getAllPhotos()).length
  listeners.forEach(fn => fn(n))
}

export function onPhotoQueueChange(fn: Listener): () => void {
  listeners.add(fn)
  getAllPhotos().then(p => fn(p.length))
  return () => listeners.delete(fn)
}

export async function photoQueueCount(): Promise<number> {
  return (await getAllPhotos()).length
}

/** Guarda una foto de check-in que no se pudo subir por falta de conexión. */
export async function queuePhoto(visitaId: string, key: string, campo: string, file: File | Blob): Promise<void> {
  if (typeof window === 'undefined' || !('indexedDB' in window)) return
  const record: QueuedPhoto = {
    id: `${visitaId}:${key}`,
    visitaId, key, campo,
    blob: file,
    contentType: file.type || 'image/jpeg',
    createdAt: Date.now(),
  }
  try {
    await withStore('readwrite', s => s.put(record))
    notify()
  } catch { /* IndexedDB no disponible — la foto se pierde, no hay más margen */ }
}

/** Reintenta subir todas las fotos pendientes. Las que sigan fallando se mantienen en cola. */
export async function flushPhotoQueue(supabase: SupabaseClient): Promise<void> {
  const pending = await getAllPhotos()
  if (pending.length === 0) return

  for (const p of pending) {
    try {
      const path = `${p.visitaId}/${p.key}.jpg`
      const { error } = await supabase.storage
        .from('terreno-fotos')
        .upload(path, p.blob, { upsert: true, contentType: p.contentType })
      if (error) throw error

      const { data: { publicUrl } } = supabase.storage
        .from('terreno-fotos')
        .getPublicUrl(path)

      await upsertOrQueue(supabase, 'visitas_terreno', { id: p.visitaId, [p.campo]: publicUrl })
      await withStore('readwrite', s => s.delete(p.id))
    } catch {
      // sigue en cola, se reintenta en el próximo flush
    }
  }
  notify()
}

let started = false

/** Arranca el reintento automático global de fotos. Llamar una sola vez (en Providers). */
export function startPhotoAutoFlush(supabase: SupabaseClient): void {
  if (started || typeof window === 'undefined') return
  started = true
  window.addEventListener('online', () => flushPhotoQueue(supabase))
  setInterval(() => {
    if (navigator.onLine) flushPhotoQueue(supabase)
  }, 20000)
  if (navigator.onLine) flushPhotoQueue(supabase)
}

/** Sube una foto con un timeout corto — en vez de colgarse minutos sin señal, falla rápido y se encola. */
export async function uploadConTimeout(
  supabase: SupabaseClient,
  visitaId: string,
  key: string,
  campo: string,
  file: File,
  timeoutMs = 7000,
): Promise<string | null> {
  const path = `${visitaId}/${key}.jpg`
  const upload = supabase.storage
    .from('terreno-fotos')
    .upload(path, file, { upsert: true, contentType: file.type || 'image/jpeg' })
    .then(({ error }) => {
      if (error) throw error
      const { data: { publicUrl } } = supabase.storage.from('terreno-fotos').getPublicUrl(path)
      return publicUrl
    })

  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('timeout')), timeoutMs)
  })

  try {
    return await Promise.race([upload, timeout])
  } catch {
    await queuePhoto(visitaId, key, campo, file)
    return null
  }
}
