/*
 * Keeps the web app's own files so that it starts without a connection.
 * Only requests for this site's files are handled; requests to the cloud
 * services never pass through the cache.
 *
 * The page itself is fetched fresh whenever there is a connection, so a new
 * version is picked up on the next start. Everything else is named after its
 * content by the build, so a stored copy never goes stale.
 */
const CACHE = 'avanevis-files-v1'

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(names.filter((name) => name !== CACHE).map((name) => caches.delete(name))),
      )
      .then(() => self.clients.claim()),
  )
})

async function keep(request, response) {
  if (response.ok && response.type === 'basic') {
    const cache = await caches.open(CACHE)
    await cache.put(request, response.clone())
  }
  return response
}

async function freshFirst(request) {
  try {
    return await keep('/', await fetch(request))
  } catch {
    return (await caches.match('/')) ?? Response.error()
  }
}

async function storedFirst(request) {
  return (await caches.match(request)) ?? keep(request, await fetch(request))
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return
  event.respondWith(request.mode === 'navigate' ? freshFirst(request) : storedFirst(request))
})
