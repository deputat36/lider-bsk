/* Push-only service worker: no CRM responses, tokens or customer data are cached. */
const ROOT = '/crm/v4/';
function identity(value) {
  return new Promise((resolve, reject) => {
    const opening = indexedDB.open('leader-crm-push-v1', 1);
    opening.onupgradeneeded = () => opening.result.createObjectStore('identity');
    opening.onerror = () => reject(Error('identity_unavailable'));
    opening.onsuccess = () => {
      const db = opening.result, tx = db.transaction('identity', value === undefined ? 'readonly' : 'readwrite');
      const request = value === undefined ? tx.objectStore('identity').get('actor') : tx.objectStore('identity').put(value, 'actor');
      tx.oncomplete = () => { const result = request.result; db.close(); resolve(result); };
      tx.onerror = () => { db.close(); reject(Error('identity_unavailable')); };
    };
  });
}
function crmUrl(value) {
  try { const url = new URL(value, self.location.origin); if (url.origin === self.location.origin && url.pathname.startsWith(ROOT)) return url.href; } catch (_) {}
  return self.location.origin + ROOT;
}
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('message', event => {
  try { if (!new URL(event.source.url).pathname.startsWith(ROOT)) return; } catch (_) { return; }
  if (event.data?.type !== 'leader:set-actor') return;
  const actor = typeof event.data.actor === 'string' ? event.data.actor : null;
  event.waitUntil((async () => {
    await identity(actor);
    for (const notification of await self.registration.getNotifications()) if (notification.data?.actor_id !== actor) notification.close();
  })());
});
self.addEventListener('push', event => event.waitUntil((async () => {
  try {
    const data = event.data?.json(), actor = await identity();
    if (!data || !actor || data.actor_id !== actor) return;
    await self.registration.showNotification(String(data.title || 'Новая заявка в CRM «Лидер»').slice(0, 120), {
      body: String(data.body || 'Откройте CRM, чтобы посмотреть обращение.').slice(0, 180),
      icon: '/assets/brand/logo-lider-mark.svg', tag: String(data.tag || 'leader-new-lead').slice(0, 120),
      data: { url: crmUrl(data.url), actor_id: actor }, renotify: false,
    });
  } catch (_) { /* Invalid payload/identity never opens another account's card. */ }
})()));
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    if (!event.notification.data?.actor_id || await identity() !== event.notification.data.actor_id) return;
    const url = crmUrl(event.notification.data.url);
    for (const client of await self.clients.matchAll({ type: 'window', includeUncontrolled: true })) {
      if (new URL(client.url).pathname.startsWith(ROOT)) { await client.navigate(url); await client.focus(); return; }
    }
    await self.clients.openWindow(url);
  })());
});
