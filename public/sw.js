const CACHE_NAME = '__BUILD_HASH__'
// Served from the root at gimme.gg since June 2026. The old GitHub Pages
// subpath entries hit the SPA rewrite and precached index.html three times over.
const SHELL_URLS = [
  '/',
  '/index.html',
  '/offline.html',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS))
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))
      )
    )
  )
  self.clients.claim()
})

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting()
})

// ── Web Push (groundwork) ─────────────────────────────────────────────────────
// Displays a notification from a pushed payload and routes the click. Inert until
// the server actually sends pushes (needs VAPID keys + the Edge Function sender);
// harmless to ship early. Expected payload: { title, body, url, tag, data }.
self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch (e) {
    payload = { title: 'Gimme', body: event.data ? event.data.text() : '' }
  }
  const title = payload.title || 'Gimme'
  const options = {
    body: payload.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: payload.tag,
    data: { url: payload.url || '/', ...(payload.data || {}) },
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Focus an existing tab if one is open, otherwise open a new one.
      for (const client of clientList) {
        if ('focus' in client) {
          if ('navigate' in client) client.navigate(targetUrl)
          return client.focus()
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl)
    })
  )
})

self.addEventListener('fetch', (event) => {
  // Skip non-GET and Supabase API calls
  if (event.request.method !== 'GET') return
  if (event.request.url.includes('supabase')) return

  const url = new URL(event.request.url)

  // Vite hashed assets are immutable, so cache-first. Vite names them
  // name-H4sHh4sh.ext with an eight character base64url hash after a dash,
  // e.g. /assets/index-B67ftZRr.js. The earlier pattern expected a dot and a
  // hex hash and never matched, so every chunk was fetched network-first.
  const isHashedAsset = /^\/assets\/.+-[A-Za-z0-9_-]{8}\.(js|css|woff2?|png|jpg|svg)$/.test(url.pathname)

  if (isHashedAsset) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached
        return fetch(event.request).then((response) => {
          if (response.ok) {
            const clone = response.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone))
          }
          return response
        })
      })
    )
    return
  }

  // Everything else — network-first with offline fallback
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone))
        }
        return response
      })
      .catch(() =>
        caches.match(event.request).then((cached) => {
          if (cached) return cached
          // For navigation requests, show offline page
          if (event.request.mode === 'navigate') {
            return caches.match('/offline.html')
          }
          return new Response('', { status: 503 })
        })
      )
  )
})
