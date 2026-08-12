/*
 * Service worker kill switch.
 *
 * This file used to be a real offline-first worker. Its registrar component is
 * gone with the single-page redesign — but *removing the file would not have
 * removed the worker*. Every browser that visited the old site still has it
 * installed, and an installed worker keeps serving its own cache: those
 * visitors would go on seeing the old multi-page site indefinitely, and a
 * 404 on this path is not enough to dislodge it.
 *
 * So this stays, deliberately, as a worker whose only job is to uninstall
 * itself: drop every cache it ever created, unregister, and reload the pages
 * it controls once so they come back from the network.
 *
 * Safe to delete only once it is certain no client still has the old worker
 * registered — realistically, leave it.
 */

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
      await self.registration.unregister();
      const clients = await self.clients.matchAll({ type: 'window' });
      for (const client of clients) {
        client.navigate(client.url);
      }
    })(),
  );
});

// No fetch handler on purpose: with none registered, every request goes
// straight to the network even before the unregister above lands.
