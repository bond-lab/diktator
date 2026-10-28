// Diktátor service worker: precache the app shell and data, serve cache-first.
// Large optional media (letter/number clips, the built-in voice and its runtime) are
// cached on first use in a separate cache that survives app updates.
const VERSION = '__BUILD__';
const CACHE = `diktator-${VERSION}`;
const MEDIA_CACHE = 'diktator-media';
const ASSETS = [
  './', './index.html', './app.js', './piper.js', './style.css', './manifest.webmanifest',
  './data/words.json', './data/sentences.json', './audio/manifest.json',
  './icons/icon-192.png', './icons/icon-512.png',
];
const MEDIA_PREFIXES = [
  'https://cdn.jsdelivr.net/npm/onnxruntime-web@',
  'https://cdn.jsdelivr.net/npm/@diffusionstudio/piper-wasm@',
  'https://huggingface.co/rhasspy/piper-voices/',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== MEDIA_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function cacheFirst(cacheName, request) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request, { ignoreSearch: true });
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone());
  return res;
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  const sameOrigin = url.origin === location.origin;
  const isMedia = sameOrigin ? /\/audio\/.+\.mp3$/.test(url.pathname) : MEDIA_PREFIXES.some((p) => url.href.startsWith(p));
  if (isMedia) { event.respondWith(cacheFirst(MEDIA_CACHE, event.request)); return; }
  if (!sameOrigin) return; // Commons audio etc. go straight to the network
  event.respondWith(cacheFirst(CACHE, event.request));
});
