// Service worker: оболонка застосунку доступна офлайн; дані — завжди з мережі.
const CACHE = 'kmd-shell-v1';
const SHELL = ['./', 'index.html', 'css/app.css', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png',
  'js/main.js', 'js/core.js', 'js/asvvo.js', 'js/ext.js', 'js/v-auth.js', 'js/v-home.js', 'js/v-services.js', 'js/v-medical.js', 'js/v-parking.js', 'js/v-account.js', 'js/v-emulator.js',
  'data/shelters.json', 'data/toilets.json', 'data/facilities.json'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // сторонні API не кешуємо
  // спершу мережа (щоб оновлення доходили одразу), офлайн — з кешу
  e.respondWith(fetch(e.request).then(r => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); } return r; }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html'))));
});
self.addEventListener('notificationclick', e => { e.notification.close(); e.waitUntil(self.clients.matchAll({ type: 'window' }).then(cs => cs[0] ? cs[0].focus() : self.clients.openWindow('./#/home'))); });
