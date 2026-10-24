// Keeps YoomiRead working offline. On the first visit every file of the app is saved on the phone,
// so reading and importing work with no internet from then on.
// The build fills in BUILD_FILES and VERSION (see vite.config.ts).
const FILES = self.BUILD_FILES;
const CACHE = `yoomiread-${self.VERSION}`;
const FONT_CSS =
  'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500&family=Inter:wght@400;500;600&family=Literata:ital,opsz,wght@0,7..72,400;0,7..72,600;1,7..72,400&family=Noto+Serif+SC:wght@400;600&display=swap';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then(async (c) => {
      await c.addAll(['/', '/manifest.webmanifest', '/favicon-64.png', '/icon-180.png', '/icon-192.png', '/icon-512.png', ...FILES]);
      // Fonts are a bonus: without them the phone's own serif fonts are used.
      await c.add(new Request(FONT_CSS, { mode: 'cors' })).catch(() => {});
    }),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // The page itself: try the network for updates, fall back to the saved copy.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('/', copy));
          return res;
        })
        .catch(() => caches.match('/')),
    );
    return;
  }

  // Built files have a hash in their name and never change; fonts and dictionaries barely do. Saved copy first.
  const fonts = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if ((url.origin === self.location.origin && (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/dict/'))) || fonts) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok || res.type === 'opaque') {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
  }
});
