/* Service worker Thrifty : rend le site installable et utilisable avec une connexion faible.
   - Pages : réseau d'abord ; hors ligne, dernière version connue ou page « hors ligne ».
   - Polices, images du site et photos d'annonces : cache d'abord (elles ne changent jamais d'adresse).
   - Scripts et styles : réseau d'abord (jamais de version périmée après une mise à jour).
   - API : jamais mise en cache (données personnelles, commandes). */
const V = 'thrifty-v8';
const SHELL = ['/', '/app.css', '/shared.js', '/core.js', '/views1.js', '/views2.js', '/views3.js', '/views4.js', '/views5.js', '/fx.js', '/boot.js', '/assets/logo.png', '/assets/logo-white.png', '/assets/icon.png'];
const OFFLINE = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Hors ligne · Thrifty</title><body style="font-family:system-ui;background:#121317;color:#f1efe8;display:grid;place-items:center;min-height:100vh;margin:0;text-align:center;padding:24px"><div><h1>Pas de connexion</h1><p>Vérifiez votre réseau, puis réessayez.</p><p><a href="/" style="color:#8fa2ff">Réessayer</a></p></div>';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(V).then((c) => c.addAll(SHELL)).catch(() => {}).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== V).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
const put = (req, res) => { if (res && res.ok && res.type === 'basic') { const copy = res.clone(); caches.open(V).then((c) => c.put(req, copy)).catch(() => {}); } return res; };

self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/admin')) return;
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((r) => put(req, r)).catch(() => caches.match(req).then((r) => r || caches.match('/')).then((r) => r || new Response(OFFLINE, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }))));
    return;
  }
  if (/^\/(uploads|fonts|assets)\//.test(url.pathname)) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((r) => put(req, r))));
    return;
  }
  if (/\.(js|css)$/.test(url.pathname)) e.respondWith(fetch(req).then((r) => put(req, r)).catch(() => caches.match(req)));
});
