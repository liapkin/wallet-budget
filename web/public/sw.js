self.addEventListener('push', (e) => {
  const { title, body, tag, url } = e.data?.json() ?? {};
  e.waitUntil(self.registration.showNotification(title ?? 'Reminder', { body, tag, data: { url: url ?? '/habits' } }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = e.notification.data?.url ?? '/habits';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const open = list.find((c) => 'focus' in c);
      return open ? open.focus() : self.clients.openWindow(url);
    }),
  );
});

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

const HASHED_ASSET = /-[A-Z0-9]{8}\.(js|css)$/;
const PASS_THROUGH = ['/api/', '/cdn-cgi/', '/__cloud/'];

self.addEventListener('fetch', (e) => {
  const { request } = e;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (PASS_THROUGH.some((p) => url.pathname.startsWith(p))) return;
  if (request.mode === 'navigate') e.respondWith(navigate(request));
  else if (HASHED_ASSET.test(url.pathname)) e.respondWith(asset(request));
});

async function navigate(request) {
  const cache = await caches.open('shell-v1');
  try {
    const r = await fetch(request);
    if (r.ok && r.type === 'basic' && !r.redirected) await cache.put('/', r.clone());
    return r;
  } catch {
    return (await cache.match('/')) ?? Response.error();
  }
}

async function asset(request) {
  const cache = await caches.open('assets-v1');
  const hit = await cache.match(request);
  if (hit) return hit;
  const r = await fetch(request);
  if (r.ok && r.type === 'basic') {
    await cache.put(request, r.clone());
    const keys = await cache.keys();
    // ponytail: crude cap, old deploy chunks age out
    for (const k of keys.slice(0, Math.max(0, keys.length - 60))) await cache.delete(k);
  }
  return r;
}
