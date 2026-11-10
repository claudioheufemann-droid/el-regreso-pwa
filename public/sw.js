// El Regreso Control â€” Service Worker
// Maneja push notifications + cachÃ© offline + badge de Ã­cono con nÃºmero

const CACHE_NAME = 'el-regreso-v145'
const OFFLINE_URL = '/offline'

const STATIC_ASSETS = [
  '/',
  '/offline',
  '/logo.png',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
]

// Pantallas de terreno: se precachean best-effort (una por una, sin que el
// fallo de una tumbe a las demÃ¡s) para que un vendedor que ya abriÃ³ la app
// con seÃ±al pueda entrar a "Nueva visita" aunque despuÃ©s se quede sin
// cobertura por completo â€” no solo cuando ya tenÃ­a la pantalla en cachÃ© por
// haber navegado antes.
const TERRENO_ASSETS = [
  '/terreno',
  '/terreno/nueva-visita',
  '/terreno/historial',
  '/terreno/jornada',
  '/terreno/cercanos',
  '/terreno/ruta',
]

// â”€â”€ Install â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€ Activate â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  )
  self.clients.claim()
})

// â”€â”€ Fetch: network-first â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€ Helpers de badge â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€ Push: mostrar notificaciÃ³n + badge numÃ©rico en Ã­cono â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
    // 1. Mostrar la notificaciÃ³n
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
    // 2. DespuÃ©s de mostrarla, actualizar el badge con el total acumulado
    .then(() => actualizarBadge())
  )
})

// â”€â”€ Click en notificaciÃ³n â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  if (event.action === 'dismiss') {
    // Solo actualizar el badge (bajÃ³ en 1 al cerrar)
    event.waitUntil(actualizarBadge())
    return
  }

  const url = event.notification.data?.url ?? '/'

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Recalcular badge (la notif ya se cerrÃ³)
        actualizarBadge()

        // Si ya hay ventana abierta, navegar ahÃ­
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

// â”€â”€ Cuando la app se abre â†’ limpiar badge â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
self.addEventListener('message', (event) => {
  if (event.data?.type === 'CLEAR_BADGE') {
    if (self.navigator?.clearAppBadge) {
      self.navigator.clearAppBadge().catch(() => {})
    }
  }
  if (event.data?.type === 'APP_OPENED') {
    // El usuario abriÃ³ la app: limpiar badge y cerrar todas las notifs visibles
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
