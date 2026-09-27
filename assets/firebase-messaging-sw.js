/* eslint-env serviceworker */
/**
 * Background push handler.
 *
 * A service worker cannot see Vite's import.meta.env, so the Firebase config it
 * needs is passed on the registration URL by src/services/push.ts and read back
 * out of self.location here. These values are public identifiers, not secrets -
 * the same ones already shipped in the client bundle.
 *
 * The backend sends data-only messages on purpose (see PushNotificationService),
 * so nothing is displayed unless this file displays it. That is what makes the
 * copy, the grouping and the click behaviour below the single source of truth.
 */

importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

const params = new URLSearchParams(self.location.search);
const firebaseConfig = {
  apiKey: params.get('apiKey'),
  authDomain: params.get('authDomain'),
  projectId: params.get('projectId'),
  messagingSenderId: params.get('messagingSenderId'),
  appId: params.get('appId'),
};

const ICON = '/images/logo.png';

/** Notifications about the same thread or order replace each other instead of stacking. */
function tagFor(data) {
  if (data.link) return `cm:${data.link}`;
  return `cm:${data.type || 'general'}`;
}

if (firebaseConfig.apiKey && firebaseConfig.projectId) {
  firebase.initializeApp(firebaseConfig);
  const messaging = firebase.messaging();

  messaging.onBackgroundMessage((payload) => {
    const data = payload.data || {};
    self.registration.showNotification(data.title || 'CampusMarket', {
      body: data.body || '',
      icon: ICON,
      badge: ICON,
      tag: tagFor(data),
      // Replacing a notification should not re-buzz the phone for the same thread.
      renotify: false,
      data: {
        link: data.link || '/notifications',
        notificationId: data.notificationId || null,
      },
    });
  });
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || '/notifications';

  // Prefer an already-open tab: opening a second CampusMarket window every time
  // someone taps a notification is its own kind of annoying.
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (new URL(client.url).origin === self.location.origin && 'focus' in client) {
          // The app is a client-side router, so tell it where to go rather than
          // navigating the tab and forcing a full reload.
          client.postMessage({ type: 'CAMPUSMARKET_NOTIFICATION_CLICK', link });
          return client.focus();
        }
      }
      return self.clients.openWindow(link);
    }),
  );
});

/* ───────────────────────── Offline + installability ─────────────────────
 *
 * A fetch handler is not optional decoration here: Chrome and Edge will not
 * fire `beforeinstallprompt` - so the app cannot be installed at all - unless
 * the service worker has one. That is why this file had push handlers and no
 * install button anywhere in the app.
 *
 * Deliberately minimal. Navigations fall back to a cached offline page when
 * the network is unreachable, and everything else goes straight through.
 */

const SHELL_CACHE = 'cm-shell-v1';
const OFFLINE_URL = '/offline.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.add(new Request(OFFLINE_URL, { cache: 'reload' })))
      // A failed precache must not abort the install: without the worker there
      // is no push either, and push is the more important of the two.
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  /*
   * Navigations only.
   *
   * The bundle's JS and CSS are content-hashed and the API's images are
   * served immutable, so the browser's own HTTP cache already handles them
   * better than this could. Caching the app shell here would be actively
   * harmful: a stale index.html names script hashes that no longer exist on
   * the server, which is a white screen that survives a reload.
   */
  if (event.request.mode !== 'navigate') return;

  event.respondWith(
    fetch(event.request).catch(async () => {
      const cached = await caches.match(OFFLINE_URL);
      return cached || new Response('You are offline.', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }),
  );
});
