// Simple service worker for AutoTools Hub
// Caches core assets for offline use and serves from cache when offline.

const CACHE_NAME = 'autotools-cache-v1';
// Precache these files on install. Add all pages and assets you want offline.
const OFFLINE_FILES = [
  '/autotools-hub/',
  '/autotools-hub/index.html',
  '/autotools-hub/styles.css',
  '/autotools-hub/script.js',
  '/autotools-hub/manifest.json',
  '/autotools-hub/icons/icon-192.png',
  '/autotools-hub/icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(OFFLINE_FILES))
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});