/* Migration only: existing installations update to this worker and retire.
   New visitors never register it. No fetch handler or offline resources. */
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil((async () => {
  const keys = await caches.keys();
  await Promise.all(keys.filter(key => key.startsWith('airkeeper-base-') ||
    key === 'airkeeper-audio-v1').map(key => caches.delete(key)));
  await self.clients.claim();
  await self.registration.unregister();
})()));
