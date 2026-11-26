// Service worker SÓ do shell (página e arquivos estáticos do próprio site). Nunca guarda resposta de cálculo:
// qualquer pedido para outro domínio (Supabase, OSRM...) ou que não seja GET passa direto pela rede.
const SHELL = 'calc-rbr-shell-v1'
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(['/', '/manifest.webmanifest', '/logo-rbr-cargo-192.png'])).then(() => self.skipWaiting()))
})
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== SHELL).map((k) => caches.delete(k)))).then(() => self.clients.claim()))
})
self.addEventListener('fetch', (e) => {
  const req = e.request
  const url = new URL(req.url)
  if (req.method !== 'GET' || url.origin !== self.location.origin) return
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) { const copia = res.clone(); caches.open(SHELL).then((c) => c.put(req, copia)) }
        return res
      })
      .catch(() => caches.match(req).then((r) => r || caches.match('/'))),
  )
})
