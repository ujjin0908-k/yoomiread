// Keeps YoomiRead working offline. On the first visit every file of the app is saved on the phone,
// so reading and importing work with no internet from then on.
// The build fills in BUILD_FILES and VERSION (see vite.config.ts).
const FILES = self.BUILD_FILES;
const WIZARD = ['happy', 'idle', 'sad', 'smoking', 'angry'].map((m) => `/wizard/wizard_${m}.png`);
const CACHE = `yoomiread-${self.VERSION}`;
const FONT_CSS =
  'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500..800&family=Instrument+Serif:ital@0;1&family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500&family=EB+Garamond:ital,wght@0,400;0,600;1,400&family=IM+Fell+English:ital@0;1&family=Libre+Caslon+Text:ital,wght@0,400;0,700;1,400&family=Old+Standard+TT:ital,wght@0,400;0,700;1,400&family=Inter:wght@400;500;600;700&family=Literata:ital,opsz,wght@0,7..72,400;0,7..72,600;1,7..72,400&family=Noto+Serif+SC:wght@400;600&display=swap';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then(async (c) => {
      // Files in public/ are not part of the build list, so they are named here.
      await c.addAll(['/', '/manifest.webmanifest', '/favicon-64.png', '/icon-180.png', '/icon-192.png', '/icon-512.png', '/welcome.jpg', ...WIZARD, ...FILES]);
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

  // Every file of the app (icons, pictures, dictionaries, fonts, built code) is answered from the saved copy first,
  // so the first screen works with no connection. The API routes and the worker itself always go to the network.
  const sameSite = url.origin === self.location.origin && !url.pathname.startsWith('/api/') && url.pathname !== '/sw.js';
  const fonts = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (sameSite || fonts) {
    event.respondWith(
      // ignoreVary: the saved copy was made without the page's Origin header, which would otherwise hide it offline.
      caches.match(req, { ignoreVary: true }).then(
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
