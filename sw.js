// The locked Training Log offline and quick to open again. Only this site's own files are kept; the store's requests
// are never cached.
// - app.bin?v=<hash>: a build's (encrypted) app never changes under its own address, so a copy kept here is used
//   straight away, with no download; a new build has a new address and replaces it.
// - everything else (the page itself): from the network, so a new build shows at once, unless the network takes
//   longer than WAIT ms; then the kept copy opens the log and the network's answer is kept for next time.
const CACHE = "pitchside-v1", WAIT = 3000;
self.addEventListener("install", e => { self.skipWaiting(); });
self.addEventListener("activate", e => { e.waitUntil(self.clients.claim()); });
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== self.location.origin) return;
  const isApp = u.pathname.endsWith("/app.bin");
  // a page is kept once, under its path alone (an address with ?... or #... is the same page)
  const key = isApp ? e.request : u.origin + u.pathname;
  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    const kept = async () => (await c.match(key)) || c.match(e.request, { ignoreSearch: !isApp });
    if (isApp && u.searchParams.get("v")) { const hit = await c.match(e.request); if (hit) return hit; }
    const net = (async () => {
      const r = await fetch(e.request, { cache: "no-cache" });
      if (r.ok) {
        // one copy of the app at a time: a new build replaces the old one
        if (isApp) for (const k of await c.keys()) if (new URL(k.url).pathname === u.pathname && k.url !== e.request.url) await c.delete(k);
        await c.put(key, r.clone());
        // copies kept by an earlier version under a full address go
        if (!isApp) for (const k of await c.keys()) { const ku = new URL(k.url); if (ku.pathname === u.pathname && ku.href !== key) await c.delete(k); }
      }
      return r;
    })();
    if (!isApp) {
      const hit = await kept();
      if (hit) {
        e.waitUntil(net.catch(() => {}));
        const slow = new Promise(ok => setTimeout(() => ok(null), WAIT));
        const first = await Promise.race([net.catch(() => null), slow]);
        return first && first.ok ? first : hit;
      }
    }
    try { return await net; }
    catch (err) {
      const hit = await kept();
      if (hit) return hit;
      if (isApp) { for (const k of await c.keys()) if (new URL(k.url).pathname === u.pathname) return c.match(k); }
      throw err;
    }
  })());
});
