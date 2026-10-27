// Diktátor service worker: precache the app shell and data, serve cache-first.
const VERSION = '__BUILD__';
const CACHE = `diktator-${VERSION}`;
const ASSETS = [
  './', './index.html', './app.js', './style.css', './manifest.webmanifest',
  './data/words.json', './data/sentences.json',
  './icons/icon-192.png', './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return; // Commons audio etc. go straight to the network
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((hit) => hit || fetch(event.request)),
  );
});
