// Service Worker for AI Video Script Studio v2
const CACHE_NAME = 'ai-video-studio-v2';
const STATIC_ASSETS = [
  './manifest.webmanifest',
  './pwa-192x192.png',
  './pwa-512x512.png',
  './apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch(() => {});
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Always bypass cache for non-GET, API routes, and Hugging Face / Gradio endpoints
  if (
    event.request.method !== 'GET' ||
    event.request.url.includes('/api/') ||
    event.request.url.includes('hf.space') ||
    event.request.url.includes('gradio') ||
    event.request.url.includes('huggingface.co')
  ) {
    return;
  }

  // Network-first strategy for HTML pages and script bundles to prevent stale deployment locks
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // Fallback to cache if offline
        return caches.match(event.request).then((cached) => {
          return cached || caches.match('./') || Promise.reject('offline');
        });
      })
  );
});

