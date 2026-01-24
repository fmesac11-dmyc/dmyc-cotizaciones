const CACHE = "dmyc-cotizaciones-v1";

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll([
      "./",
      "./index.html",
      "./app.js",
      "./db.js",
      "./drive.js",
      "./manifest.webmanifest"
    ]))
  );
});

self.addEventListener("fetch", (e) => {
  e.respondWith((async() => {
    const cached = await caches.match(e.request, { ignoreSearch: true });
    if (cached) return cached;
    try {
      const res = await fetch(e.request);
      const cache = await caches.open(CACHE);
      cache.put(e.request, res.clone());
      return res;
    } catch {
      return cached || new Response("Offline", { status: 503 });
    }
  })());
});
