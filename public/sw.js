// El Regreso Control — Service Worker
// Maneja push notifications + caché offline + badge de ícono

const CACHE_NAME = 'el-regreso-v16'
const OFFLINE_URL = '/offline'

const STATIC_ASSETS = [
  '/',
  '/offline',
  '/logo.png',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
]

// ── Install ────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS).catch(() => {}))
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

// ── Push: mostrar notificación + badge en ícono ────────────────────────
self.addEventListener('push', (event) => {
  let data = {
    title: 'El Regreso Control',
    body: 'Tienes una nueva notificación',
    url: '/gestion',
    tag: 'default',
    taskId: null,
    requireInteraction: false,
  }

  if (event.data) {
    try { data = { ...data, ...event.data.json() } }
    catch { data.body = event.data.text() }
  }

  // URL de destino — si viene taskId, navegar directo a la tarea
  const targetUrl = data.taskId
    ? `/gestion?task=${data.taskId}`
    : (data.url || '/gestion')

  event.waitUntil(
    Promise.all([
      // Mostrar la notificación
      self.registration.showNotification(data.title, {
        body: data.body,
        icon: '/icons/icon-192x192.png',
        badge: '/icons/icon-72x72.png',
        tag: data.tag,
        data: { url: targetUrl, taskId: data.taskId },
        requireInteraction: data.requireInteraction,
        vibrate: [200, 100, 200],
        actions: data.taskId ? [
          { action: 'open', title: 'Ver tarea' },
          { action: 'dismiss', title: 'Ignorar' },
        ] : [],
      }),
      // Incrementar badge en el ícono de la app
      self.navigator?.setAppBadge
        ? self.navigator.setAppBadge().catch(() => {})
        : Promise.resolve(),
    ])
  )
})

// ── Click en notificación ──────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  // Si el usuario tocó "Ignorar", no hacer nada
  if (event.action === 'dismiss') return

  const url = event.notification.data?.url ?? '/gestion'

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Limpiar badge al abrir
      if (self.navigator?.clearAppBadge) {
        self.navigator.clearAppBadge().catch(() => {})
      }

      // Si ya hay una ventana de la app abierta, navegar ahí
      for (const client of clientList) {
        if (client.url.includes(location.origin) && 'focus' in client) {
          client.navigate(url)
          client.focus()
          return
        }
      }
      // Si no hay ventana, abrir una nueva con la URL de la tarea
      if (clients.openWindow) return clients.openWindow(url)
    })
  )
})

// ── Cuando la app se abre, limpiar badge ───────────────────────────────
self.addEventListener('message', (event) => {
  if (event.data?.type === 'CLEAR_BADGE') {
    if (self.navigator?.clearAppBadge) {
      self.navigator.clearAppBadge().catch(() => {})
    }
  }
})
