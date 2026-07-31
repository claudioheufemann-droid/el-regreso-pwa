// El Regreso Control — Service Worker
// Maneja push notifications + caché offline + badge de ícono con número

const CACHE_NAME = 'el-regreso-v77'
const OFFLINE_URL = '/offline'

const STATIC_ASSETS = [
  '/',
  '/offline',
  '/logo.png',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
]

// Pantallas de terreno: se precachean best-effort (una por una, sin que el
// fallo de una tumbe a las demás) para que un vendedor que ya abrió la app
// con señal pueda entrar a "Nueva visita" aunque después se quede sin
// cobertura por completo — no solo cuando ya tenía la pantalla en caché por
// haber navegado antes.
const TERRENO_ASSETS = [
  '/terreno',
  '/terreno/nueva-visita',
  '/terreno/historial',
  '/terreno/jornada',
  '/terreno/cercanos',
]

// ── Install ────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.allSettled([
        cache.addAll(STATIC_ASSETS),
        ...TERRENO_ASSETS.map((url) => cache.add(url).catch(() => {})),
      ])
    )
  )
  self.skipWaiting()
})

// ── Activate ───────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  )
  self.clients.claim()
})

// ── Fetch: network-first ───────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return
  const url = new URL(event.request.url)
  if (url.origin !== location.origin) return
  if (url.pathname.startsWith('/api/')) return

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone))
        }
        return response
      })
      .catch(() => {
        return caches.match(event.request).then((cached) => {
          if (cached) return cached
          if (event.request.headers.get('accept')?.includes('text/html')) {
            return caches.match(OFFLINE_URL)
          }
        })
      })
  )
})

// ── Helpers de badge ──────────────────────────────────────────────────
async function actualizarBadge() {
  try {
    const notifs = await self.registration.getNotifications()
    const count = notifs.length
    if (self.navigator?.setAppBadge) {
      if (count > 0) {
        await self.navigator.setAppBadge(count)
      } else {
        await self.navigator.clearAppBadge().catch(() => {})
      }
    }
  } catch {}
}

// ── Push: mostrar notificación + badge numérico en ícono ──────────────
self.addEventListener('push', (event) => {
  let data = {
    title: 'El Regreso Control',
    body: 'Nueva actividad en la app',
    url: '/',
    tag: 'default',
    taskId: null,
    requireInteraction: false,
  }

  if (event.data) {
    try { data = { ...data, ...event.data.json() } }
    catch { data.body = event.data.text() }
  }

  const targetUrl = data.taskId
    ? `/gestion?task=${data.taskId}`
    : (data.url || '/')

  event.waitUntil(
    // 1. Mostrar la notificación
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-72x72.png',
      tag: data.tag,
      data: { url: targetUrl, taskId: data.taskId },
      requireInteraction: data.requireInteraction ?? false,
      vibrate: [150, 80, 150],
      actions: data.taskId ? [
        { action: 'open',    title: 'Ver' },
        { action: 'dismiss', title: 'Ignorar' },
      ] : [],
    })
    // 2. Después de mostrarla, actualizar el badge con el total acumulado
    .then(() => actualizarBadge())
  )
})

// ── Click en notificación ──────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  if (event.action === 'dismiss') {
    // Solo actualizar el badge (bajó en 1 al cerrar)
    event.waitUntil(actualizarBadge())
    return
  }

  const url = event.notification.data?.url ?? '/'

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Recalcular badge (la notif ya se cerró)
        actualizarBadge()

        // Si ya hay ventana abierta, navegar ahí
        for (const client of clientList) {
          if (client.url.includes(location.origin) && 'focus' in client) {
            client.navigate(url)
            client.focus()
            return
          }
        }
        // Si no hay ventana, abrir una nueva
        if (clients.openWindow) return clients.openWindow(url)
      })
  )
})

// ── Cuando la app se abre → limpiar badge ─────────────────────────────
self.addEventListener('message', (event) => {
  if (event.data?.type === 'CLEAR_BADGE') {
    if (self.navigator?.clearAppBadge) {
      self.navigator.clearAppBadge().catch(() => {})
    }
  }
  if (event.data?.type === 'APP_OPENED') {
    // El usuario abrió la app: limpiar badge y cerrar todas las notifs visibles
    event.waitUntil(
      self.registration.getNotifications().then(notifs => {
        notifs.forEach(n => n.close())
        if (self.navigator?.clearAppBadge) {
          self.navigator.clearAppBadge().catch(() => {})
        }
      })
    )
  }
})
