/* ============================================================
   SERVICE WORKER  --  Training Tracker
   Strategy:
     App shell (HTML/CSS/JS/icons) -- cache-first, background update
     Google Fonts                   -- network-first, cache fallback
     Everything else                -- network-first, cache fallback
   Bump CACHE_VERSION when deploying a new build to force refresh.
   ============================================================ */

const CACHE_VERSION = 'tt-v2';
const FONT_CACHE    = 'tt-fonts-v1';

const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/config.js',
  './js/data.js',
  './js/app.js',
  './js/score.js',
  './js/today.js',
  './js/sleep.js',
  './js/week.js',
  './js/history.js',
  './js/settings.js',
  './js/sample.js',
  './icons/icon.svg',
  './icons/icon-maskable.svg',
];

/* ----------------------------------------------------------
   Install: pre-cache the app shell
   ---------------------------------------------------------- */
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => cache.addAll(APP_SHELL))
      .catch(err => console.warn('[SW] Pre-cache failed:', err))
  );
});

/* ----------------------------------------------------------
   Activate: delete old caches
   ---------------------------------------------------------- */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_VERSION && k !== FONT_CACHE)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

/* ----------------------------------------------------------
   Fetch: route requests to appropriate strategy
   ---------------------------------------------------------- */
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  /* Google Fonts -- network-first, long-lived font cache */
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(networkFirstFont(event.request));
    return;
  }

  /* Same-origin app files -- cache-first, revalidate in background */
  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirstWithUpdate(event.request));
    return;
  }

  /* Everything else -- network-first */
  event.respondWith(networkFirst(event.request));
});

/* ----------------------------------------------------------
   Strategies
   ---------------------------------------------------------- */

/* Return cached copy immediately; fetch update silently for next load */
async function cacheFirstWithUpdate(request) {
  const cached = await caches.match(request);
  const fetchPromise = fetch(request).then(async response => {
    if (response && response.ok) {
      const cache = await caches.open(CACHE_VERSION);
      cache.put(request, response.clone());
    }
    return response;
  }).catch(() => null);

  return cached || (await fetchPromise) || new Response('Offline', { status: 503 });
}

/* Try network; fall back to cache (good for frequently-changing resources) */
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const cache = await caches.open(CACHE_VERSION);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return caches.match(request) || new Response('Offline', { status: 503 });
  }
}

/* Font-specific: network-first into the font cache */
async function networkFirstFont(request) {
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const cache = await caches.open(FONT_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return caches.match(request) || new Response('', { status: 503 });
  }
}
