/* Only public static assets and the current profile's desk snapshot are stored. */
const BUILD = '__BUILD_ID__';
const STATIC = `lh-static-${BUILD}`;
const DATA = 'lh-today-v1';
const META = 'lh-profile-v1';
const profileKey = '/__offline/profile';
const epochKey = '/__offline/epoch';
let serial = Promise.resolve();
const locked = fn => { const next = serial.then(fn, fn); serial = next.catch(() => {}); return next; };
const profile = async () => (await (await caches.open(META)).match(profileKey))?.text() ?? '';
const epoch = async () => (await (await caches.open(META)).match(epochKey))?.text() ?? '';
const key = id => `/__offline/today:${encodeURIComponent(id)}`;
self.addEventListener('install', event => event.waitUntil(caches.open(STATIC).then(cache => cache.addAll(['/offline.html', '/offline.js', '/favicon.svg', '/manifest.webmanifest']))));
self.addEventListener('activate', event => event.waitUntil((async () => {
  for (const name of await caches.keys()) if (name.startsWith('lh-static-') && name !== STATIC) await caches.delete(name);
  await self.clients.claim();
})()));
self.addEventListener('message', event => {
  if (event.data?.type === 'activate') { self.skipWaiting(); return; }
  if (event.data?.type === 'profile') event.waitUntil(locked(async () => {
    const id = typeof event.data.id === 'string' ? event.data.id : '';
    const data = await caches.open(DATA);
    for (const request of await data.keys()) if (!id || new URL(request.url).pathname !== key(id)) await data.delete(request);
    const meta = await caches.open(META);
    await meta.put(profileKey, new Response(id));
    await meta.put(epochKey, new Response(crypto.randomUUID()));
    event.ports[0]?.postMessage({ ok: true });
  }));
  if (event.data?.type === 'clear') event.waitUntil(locked(async () => {
    await caches.delete(DATA);
    await caches.delete(STATIC);
    event.ports[0]?.postMessage({ ok: true });
  }));
  if (event.data?.type === 'today') event.waitUntil(locked(async () => {
    const id = await profile();
    const response = id && id === event.data.id && await (await caches.open(DATA)).match(key(id));
    event.ports[0]?.postMessage({ body: response ? await response.json() : null });
  }));
});
self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url);
  if (url.origin !== self.location.origin || request.method !== 'GET') return;
  if (/^\/(?:household|api\/household|api\/automation|mcp)(?:\/|$)/.test(url.pathname)) return;
  if (url.pathname === '/api/today' && !url.searchParams.has('learner')) {
    event.respondWith((async () => {
      const id = request.headers.get('X-LH-Profile') || '';
      const [before, generation] = await locked(async () => [await profile(), await epoch()]);
      try {
        const response = await fetch(request);
        if (response.ok && id && response.headers.get('X-LH-Profile') === id && before === id) await locked(async () => {
          if (await profile() === id && await epoch() === generation) await (await caches.open(DATA)).put(key(id), response.clone());
        });
        return response;
      } catch (error) {
        const cached = await locked(async () => id && before === id && await profile() === id && await epoch() === generation && (await caches.open(DATA)).match(key(id)));
        if (!cached) throw error;
        const headers = new Headers(cached.headers); headers.set('X-LH-Offline', '1');
        return new Response(cached.body, { status: cached.status, headers });
      }
    })());
    return;
  }
  if (url.pathname.startsWith('/api/')) return;
  if (request.mode === 'navigate') {
    const network = fetch(request);
    event.waitUntil(network.then(async response => {
      if (!response.ok) return;
      const cache = await caches.open(STATIC);
      if (!await cache.match('/offline.html')) await cache.addAll(['/offline.html', '/offline.js']);
    }).catch(() => {}));
    event.respondWith(network.catch(async () => {
      const fallback = await (await caches.open(STATIC)).match('/offline.html');
      return fallback ? new Response(fallback.body, { status: 200, headers: fallback.headers }) : Response.error();
    }));
    return;
  }
  if (/^\/(?:assets|_next\/static)\/(?:[^/]+\/)*(?:.*[-.])?[A-Za-z0-9_-]{8,}\.(?:js|css|woff2?|ttf|otf)$/.test(url.pathname) || ['/favicon.svg', '/manifest.webmanifest', '/offline.js'].includes(url.pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(STATIC), hit = await cache.match(request);
      if (hit) return hit;
      const response = await fetch(request);
      if (response.ok && response.type === 'basic') await cache.put(request, response.clone());
      return response;
    })());
  }
});
