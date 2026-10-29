/* Bridgewright offline shell. Network-first: a saved build is served only when the server cannot be
 * reached, so a live edit (or a new prompt icon) is never hidden behind an old cache. Bump the
 * version whenever the shell list changes. */
const CACHE = 'bridgewright-v8-1';
const ASSETS = [
  './', './index.html', './manifest.json',
  './vendor/matter.js', './arcade-input.js',
  './js/levels.js', './js/physics.js', './js/render.js', './js/ui.js', './js/audio.js', './js/game.js',
  './js/controls.js',
  './prompts/xbox_button_back.png', './prompts/xbox_button_a.png', './prompts/xbox_button_x.png',
  './prompts/xbox_button_y.png', './prompts/xbox_stick_l.png', './prompts/xbox_rt.png',
  './prompts/xbox_button_start.png', './prompts/keyboard_enter.png', './prompts/keyboard_escape.png',
  './prompts/keyboard_arrows.png', './prompts/keyboard_space.png', './prompts/mouse_left.png',
  './prompts/touch_hand_open.png', './prompts/touch_tap.png',
  './icons/icon-180.png', './icons/icon-192.png', './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const same = new URL(e.request.url).origin === location.origin;
  if (!same) return;
  e.respondWith(
    fetch(e.request).then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
      }
      return res;
    }).catch(() => caches.match(e.request).then((hit) => hit || caches.match('./index.html')))
  );
});
