// Pornește și fără semnal cu ultima versiune salvată; când e net, ia mereu versiunea nouă.
const CACHE = 'airon-v5';
const SHELL = ['./', './index.html', './app.js', './app.css', './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];
self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).pathname.startsWith('/api/')) return;
  e.respondWith(
    // no-cache: întreabă mereu serverul dacă fișierul s-a schimbat (nu folosi copia veche din browser).
    fetch(e.request, new URL(e.request.url).origin === location.origin ? { cache: 'no-cache' } : undefined)
      .then((r) => {
        if (r.ok && new URL(e.request.url).origin === location.origin) caches.open(CACHE).then((c) => c.put(e.request, r.clone()));
        return r;
      })
      .catch(() => caches.match(e.request).then((m) => m || caches.match('./index.html'))),
  );
});
