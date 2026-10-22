/* Service worker do Estoura.
   - Páginas: rede primeiro (sempre a versão mais nova); sem rede, usa a última cópia.
   - Ícones: cache com atualização em segundo plano.
   - Nunca mexe em /config.js, /auth e chamadas ao Supabase (login e dados sempre ao vivo). */
const CACHE = "estoura-v1";

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.add("/")).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;
  if (url.pathname === "/config.js" || url.pathname.startsWith("/auth/")) return;

  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok && url.pathname === "/") { const copy = res.clone(); caches.open(CACHE).then((c) => c.put("/", copy)); }
          return res;
        })
        .catch(() => caches.match("/").then((hit) => hit || Response.error())),
    );
    return;
  }

  if (url.pathname.startsWith("/icons/")) {
    e.respondWith(
      caches.open(CACHE).then(async (c) => {
        const hit = await c.match(req);
        const fresh = fetch(req).then((res) => { if (res.ok) c.put(req, res.clone()); return res; }).catch(() => hit);
        return hit || fresh;
      }),
    );
  }
});
