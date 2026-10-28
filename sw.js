// The locked Training Log offline and quick to open again. Only this site's own files are kept; the store's requests
// are never cached.
// - app.bin?v=<hash>: a build's (encrypted) app never changes under its own address, so a copy kept here is used
//   straight away, with no download; a new build has a new address and replaces it. GitHub Pages ignores the ?v=
//   and sends whatever app is newest, so a copy is kept only when its SHA-256 starts with its ?v=.
// - everything else (the page itself): from the network, so a new build shows at once, unless the network takes
//   longer than WAIT ms; then the kept copy opens the log and the network's answer is kept for next time. A page
//   asked for with ?fresh=... (the page found its kept copy out of date) waits for the network.
const CACHE = "pitchside-v2", WAIT = 3000;
const hex = b => Array.from(new Uint8Array(b), x => x.toString(16).padStart(2, "0")).join("");
self.addEventListener("install", e => { self.skipWaiting(); });
self.addEventListener("activate", e => {
  // pitchside-v1 could hold an app under another build's address
  e.waitUntil((async () => { for (const n of await caches.keys()) if (n !== CACHE) await caches.delete(n); await self.clients.claim(); })());
});
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== self.location.origin) return;
  const isApp = u.pathname.endsWith("/app.bin");
  e.respondWith(isApp ? app(e, u) : page(e, u));
});
async function app(e, u) {
  const c = await caches.open(CACHE), v = (u.searchParams.get("v") || "").toLowerCase();
  if (v) { const hit = await c.match(e.request); if (hit) return hit; }
  let r;
  try { r = await fetch(e.request, { cache: "no-cache" }); }
  catch (err) { const hit = await c.match(e.request); if (hit) return hit; throw err; }
  if (!r.ok || !v || !r.body) return r;
  // The bytes pass straight through (the page's bar moves) and are checked at the end. Another build's app is never
  // kept. A page that checks it itself (the X-Pitchside-Check header) gets it as it is and fetches itself again; a
  // page from before that check gets a failed download instead (it says so and tries again, keeping its key), as
  // trying its key on another build's app would make it drop the key.
  const own = e.request.headers.get("X-Pitchside-Check") === "1", parts = [];
  let done;
  e.waitUntil(new Promise(ok => { done = ok; }));
  const body = r.body.pipeThrough(new TransformStream({
    transform(chunk, ctl) { parts.push(chunk); ctl.enqueue(chunk); },
    async flush(ctl) {
      try {
        const buf = await new Blob(parts).arrayBuffer();
        if (!hex(await crypto.subtle.digest("SHA-256", buf)).startsWith(v)) { if (!own) ctl.error(new Error("another build's app")); return; }
        // one copy of the app at a time: a new build replaces the old one
        for (const k of await c.keys()) if (new URL(k.url).pathname === u.pathname && k.url !== e.request.url) await c.delete(k);
        await c.put(e.request, new Response(buf, { status: r.status, statusText: r.statusText, headers: r.headers }));
      } catch (err) {} finally { done(); }
    }
  }));
  return new Response(body, { status: r.status, statusText: r.statusText, headers: r.headers });
}
async function page(e, u) {
  const c = await caches.open(CACHE);
  // a page is kept once, under its path alone (an address with ?... or #... is the same page)
  const key = u.origin + u.pathname;
  const kept = async () => (await c.match(key)) || c.match(e.request, { ignoreSearch: true });
  const net = (async () => {
    const r = await fetch(e.request, { cache: "no-cache" });
    if (r.ok) await c.put(key, r.clone());
    return r;
  })();
  if (!u.searchParams.has("fresh")) {
    const hit = await kept();
    if (hit) {
      e.waitUntil(net.catch(() => {}));
      const slow = new Promise(ok => setTimeout(() => ok(null), WAIT));
      const first = await Promise.race([net.catch(() => null), slow]);
      return first && first.ok ? first : hit;
    }
  }
  try { return await net; }
  catch (err) { const hit = await kept(); if (hit) return hit; throw err; }
}
