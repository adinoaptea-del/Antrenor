// Pornește și fără semnal cu ultima versiune salvată; când e net, ia mereu versiunea nouă.
// Fișierele aplicației (assets/index-<hash>.js/.css) se salvează la prima folosire; navigarea cade pe index.html
// doar offline. Datele (/api) nu trec niciodată prin cache.
const CACHE = 'airon-v70';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-maskable-512.png', './apple-touch-icon.png'];
self.addEventListener('install', (e) => {
  self.skipWaiting();
  // Fiecare fișier separat: unul lipsă nu strică instalarea.
  e.waitUntil(caches.open(CACHE).then((c) => Promise.all(SHELL.map((u) => c.add(u).catch(() => undefined)))));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('airon-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  const nav = e.request.mode === 'navigate';
  e.respondWith(
    // no-cache: întreabă mereu serverul dacă fișierul s-a schimbat (nu folosi copia veche din browser).
    fetch(e.request, { cache: 'no-cache' })
      .then((r) => {
        const html = (r.headers.get('content-type') || '').includes('text/html');
        // Un fișier JS/CSS cerut și primit ca HTML (pagina de rezervă) nu se salvează.
        if (r.ok && (nav || !html)) {
          const copy = r.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return r;
      })
      .catch(() => caches.match(e.request).then((m) => m || (nav ? caches.match('./index.html') : Response.error()))),
  );
});
