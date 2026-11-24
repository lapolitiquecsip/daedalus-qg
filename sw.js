// Service worker minimal : rend le QG installable et garde l'interface en cache
// (les données, elles, viennent toujours de la base en direct).
const CACHE = "qg-v1";
const FICHIERS = ["./", "index.html", "style.css", "app.js", "config.js", "manifest.webmanifest", "icones/icone.svg"];

self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FICHIERS))); self.skipWaiting(); });
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((k) => Promise.all(k.filter((n) => n !== CACHE).map((n) => caches.delete(n)))));
  self.clients.claim();
});
// Réseau d'abord pour l'interface (toujours la dernière version), cache en secours hors ligne.
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then((r) => {
    const copie = r.clone();
    caches.open(CACHE).then((c) => c.put(e.request, copie));
    return r;
  }).catch(() => caches.match(e.request)));
});
