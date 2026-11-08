const CACHE = 'studyboard-app-v2';
const FILES = ['./', './index.html', './manifest.webmanifest', './icon.svg', './design.css?v=2'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('studyboard-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin || !url.pathname.startsWith(new URL(self.registration.scope).pathname)) return;
  e.respondWith(fetch(e.request).then(resp => { if (resp.ok) { const clone=resp.clone(); caches.open(CACHE).then(c => c.put(e.request,clone)); } return resp; }).catch(() => caches.match(e.request).then(cached => cached || caches.match('./index.html'))));
});
