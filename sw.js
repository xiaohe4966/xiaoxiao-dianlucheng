/* 小小电路城 —— 离线缓存 */
'use strict';

/* ASSET_VERSION 要和 index.html 里 JS / CSS 的 ?v= 保持一致 */
var ASSET_VERSION = '8.30';
var CACHE = 'xiaoxiao-dianlucheng-v' + ASSET_VERSION + '.0';
var ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/style.css?v=' + ASSET_VERSION,
  './assets/voice.js?v=' + ASSET_VERSION,
  './assets/sim.js?v=' + ASSET_VERSION,
  './assets/parts.js?v=' + ASSET_VERSION,
  './assets/ui.js?v=' + ASSET_VERSION,
  './assets/interact.js?v=' + ASSET_VERSION,
  './assets/app.js?v=' + ASSET_VERSION,
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/components/breadboard.svg',
  './assets/components/resistor.svg',
  './assets/components/led-red.svg',
  './assets/components/led-green.svg',
  './assets/components/led-blue.svg',
  './assets/components/led-yellow.svg',
  './assets/components/led-white.svg'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE)
      .then(function (c) { return c.addAll(ASSETS); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.map(function (k) {
          return k === CACHE ? null : caches.delete(k);
        }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).catch(function () {
        return caches.match('./index.html', { ignoreSearch: true });
      })
    );
    return;
  }

  e.respondWith(
    caches.match(req).then(function (hit) {
      if (hit) return hit;
      return fetch(req).then(function (res) {
        if (res && res.ok) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      });
    })
  );
});
