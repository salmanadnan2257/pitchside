// The locked Training Log offline: the page and the (encrypted) app come from the network when there is one, and from
// this cache when there is not. Only this site's own files are kept; the store's requests are never cached.
const CACHE = "pitchside-v1";
self.addEventListener("install", e => { self.skipWaiting(); });
self.addEventListener("activate", e => { e.waitUntil(self.clients.claim()); });
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== self.location.origin) return;
  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    try {
      const r = await fetch(e.request, { cache: "no-cache" });
      if (r.ok) {
        // one copy of the app at a time: a new build replaces the old one
        if (u.pathname.endsWith("/app.bin")) for (const k of await c.keys()) if (new URL(k.url).pathname === u.pathname && k.url !== e.request.url) await c.delete(k);
        await c.put(e.request, r.clone());
      }
      return r;
    } catch (err) {
      const hit = await c.match(e.request, { ignoreSearch: u.pathname.endsWith("/") || u.pathname.endsWith("/index.html") });
      if (hit) return hit;
      if (u.pathname.endsWith("/app.bin")) { for (const k of await c.keys()) if (new URL(k.url).pathname === u.pathname) return c.match(k); }
      throw err;
    }
  })());
});
