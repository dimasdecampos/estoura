/* Service worker do Estoura.
   - Páginas: rede primeiro (sempre a versão mais nova); sem rede, usa a última cópia.
   - Ícones: cache com atualização em segundo plano.
   - Nunca mexe em /config.js, /auth, /api e chamadas ao Supabase (login e dados sempre ao vivo).
   - Notificações push: mostra o aviso quando o app não está na tela e abre a conversa ao tocar. */
const CACHE = "estoura-v4";
// o app em si (CSS e JS separados do HTML): rede primeiro, cópia pra quando estiver sem internet
const APP = ["/estoura.css", "/js/dados.js", "/js/estado.js", "/js/ui.js", "/js/globo.js", "/js/flutuantes.js", "/js/pessoas.js", "/js/conta.js"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(["/", ...APP])).then(() => self.skipWaiting()));
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
  if (url.pathname === "/config.js" || url.pathname.startsWith("/auth/") || url.pathname.startsWith("/api/")) return;

  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok && url.pathname === "/") { const copy = res.clone(); caches.open(CACHE).then((c) => c.put("/", copy)); }
          return res;
        })
        .catch(() => caches.match("/", { ignoreSearch: true }).then((hit) => hit || Response.error())),
    );
    return;
  }

  if (APP.includes(url.pathname)) {
    e.respondWith(
      fetch(req)
        .then((res) => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(url.pathname, copy)); } return res; })
        .catch(() => caches.match(url.pathname).then((hit) => hit || Response.error())),
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

// ---------- notificações push ----------
self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data ? e.data.text() : "" }; }
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    if (wins.some((w) => w.visibilityState === "visible")) return; // app aberto na tela: ele mesmo avisa
    await self.registration.showNotification(d.title || "Estoura", {
      body: d.body || "",
      tag: d.tag || undefined,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: d.url || "/" },
    });
  })());
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "/";
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const win = wins.find((w) => new URL(w.url).origin === location.origin);
    if (win) { await win.focus(); win.postMessage({ type: "open", url }); return; }
    await self.clients.openWindow(url);
  })());
});
