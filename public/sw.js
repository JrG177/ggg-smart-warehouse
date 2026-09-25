const CACHE_NAME = 'ggg-inventory-shell-v1'

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then((names) =>
        Promise.all(
          names
            .filter((name) =>
              name.startsWith('ggg-inventory-shell-') &&
              name !== CACHE_NAME,
            )
            .map((name) => caches.delete(name)),
        ),
      ),
    ]),
  )
})

// Keep Supabase and application data online-first. The worker exists to make
// the site installable without serving stale operational records.
self.addEventListener('fetch', (event) => {
  if (
    event.request.method !== 'GET' ||
    new URL(event.request.url).origin !== self.location.origin
  ) {
    return
  }

  event.respondWith(fetch(event.request))
})
