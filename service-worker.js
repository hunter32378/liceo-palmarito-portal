// Define the cache name
const CACHE_NAME = 'portal-educativo-cache-v1';

// Files to cache
const urlsToCache = [
  '/',
  '/index.html',
  '/src/assets'
];

// Install the service worker
self.addEventListener('install', (event: any) => {
  // Perform install steps
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache: any) => {
        return cache.addAll(urlsToCache);
      })
  );
});

// Cache and return requests
self.addEventListener('fetch', (event: any) => {
  event.respondWith(
    (async () => {
      try {
        const response = await fetch(event.request);
        return response;
      } catch (error) {
        // If the request fails, try to retrieve from cache
        const cacheResponse = await caches.match(event.request);
        return cacheResponse || fetch(event.request);
      }
    })()
  );
});

export default null;