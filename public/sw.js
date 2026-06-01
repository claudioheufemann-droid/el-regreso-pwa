// El Regreso Control — Service Worker
// Maneja push notifications + caché offline básico

const CACHE_NAME = 'el-regreso-v1'
const OFFLINE_URL = '/offline'

// Recursos a cachear para uso offline
const STATIC_ASSETS = [
  '/',
  '/offline',
  '/logo.png',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
]

// ── Install: pre-cachear recursos estáticos ────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch(() => {})
    })
  )
  self.skipWaiting()
})

// ── Activate: limpiar cachés viejos ───────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  )
  self.clients.claim()
})

// ── Fetch: network-first, caché como fallback ──────────────────────────
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return
  const url = new URL(event.request.url)

  // Solo interceptar mismas origen + no APIs
  if (url.origin !== location.origin) return
  if (url.pathname.startsWith('/api/')) return

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cachear respuestas válidas (no errores)
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone))
        }
        return response
      })
      .catch(() => {
        // Sin red: intentar caché
        return caches.match(event.request).then((cached) => {
          if (cached) return cached
          // Fallback para navegación
          if (event.request.headers.get('accept')?.includes('text/html')) {
            return caches.match(OFFLINE_URL)
          }
        })
      })
  )
})

// ── Push notifications ─────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  let data = { title: 'El Regreso Control', body: 'Tienes una nueva notificación', url: '/', tag: 'default' }

  if (event.data) {
    try { data = { ...data, ...event.data.json() } }
    catch { data.body = event.data.text() }
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-72x72.png',
      tag: data.tag,
      data: { url: data.url },
      requireInteraction: data.requireInteraction ?? false,
      vibrate: [200, 100, 200],
    })
  )
})

// ── Click en notificación ──────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url ?? '/'

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Si ya hay una ventana abierta, enfocarla
      for (const client of clientList) {
        if (client.url.includes(location.origin) && 'focus' in client) {
          client.focus()
          client.navigate(url)
          return
        }
      }
      // Si no, abrir nueva ventana
      if (clients.openWindow) return clients.openWindow(url)
    })
  )
})
