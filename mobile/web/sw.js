// Minimal service worker — just enough to make the panel installable
// ("app feel"). Never caches the live bridge endpoints.
var SHELL = 'pixel-shell-v1';
var ASSETS = ['/', '/index.html', '/manifest.webmanifest', '/icon.svg'];

self.addEventListener('install', function (e) {
  self.skipWaiting();
  e.waitUntil(caches.open(SHELL).then(function (c) { return c.addAll(ASSETS); }).catch(function () {}));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(self.clients.claim());
});
self.addEventListener('fetch', function (e) {
  var url = new URL(e.request.url);
  if (url.pathname === '/events' || url.pathname === '/cmd') return; // live, never intercept
  e.respondWith(
    fetch(e.request).catch(function () { return caches.match(e.request); })
  );
});
