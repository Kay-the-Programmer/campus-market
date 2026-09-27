import { firebaseConfig } from '../firebase';
import { isIos, isStandalone } from '../utils/platform';

/**
 * Installing CampusMarket as an app.
 *
 * <p>Two entirely separate mechanisms, because the platforms do not agree on
 * whether this is something a site may ask for:
 *
 * <ul>
 *   <li><b>Chrome, Edge and Android</b> fire {@code beforeinstallprompt} when
 *       the app meets the installability criteria. The event can be saved and
 *       replayed later from a real button, which is what this module exists to
 *       do - the browser's own mini-infobar is easy to miss and, on desktop,
 *       is a small icon in the address bar that nobody looks at.</li>
 *   <li><b>Safari</b>, on iOS and macOS, has no such event and no API. The
 *       only route is the user finding it in the Share menu, so all we can do
 *       is tell them where it is.</li>
 * </ul>
 *
 * <p>The listener is registered at module scope rather than in a component.
 * {@code beforeinstallprompt} fires as soon as the browser has assessed the
 * page, which is routinely before React has mounted - a listener added in an
 * effect misses it, and the event does not fire again on its own.
 */

/** The half of BeforeInstallPromptEvent we actually use; it is not in lib.dom. */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferredPrompt: InstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();

function announce(): void {
  listeners.forEach((fn) => fn());
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    // Without this the browser shows its own prompt and consumes the event,
    // leaving our button with nothing to replay.
    event.preventDefault();
    deferredPrompt = event as InstallPromptEvent;
    announce();
  });

  // Fired however it was installed - our button, the address-bar icon, or the
  // browser's own banner. All three should make the button disappear.
  window.addEventListener('appinstalled', () => {
    installed = true;
    deferredPrompt = null;
    announce();
  });
}

/** Subscribe to install-availability changes. Returns an unsubscribe. */
export function onInstallStateChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Already running as an installed app, or installed during this visit. */
export function isInstalled(): boolean {
  return installed || isStandalone();
}

/** A real install prompt is available to replay right now. */
export function canPromptInstall(): boolean {
  return deferredPrompt !== null && !isInstalled();
}

/**
 * Safari, where installing is possible but only by hand.
 *
 * <p>Covers iPhone and iPad, and macOS Safari 17+, which added "Add to Dock".
 * Neither exposes an API, so the UI shows directions instead of a button.
 */
export function needsManualInstall(): boolean {
  if (isInstalled() || canPromptInstall()) return false;
  if (isIos()) return true;
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /Safari/.test(ua) && !/Chrome|Chromium|Edg|OPR|Android/.test(ua);
}

/**
 * Show the browser's install dialog.
 *
 * @return the user's choice, or 'unavailable' when there was no saved event -
 *         which happens if they have already been asked and dismissed it in
 *         this browsing session.
 */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  const event = deferredPrompt;
  if (!event) return 'unavailable';
  // Single-use: the browser will not let the same event be replayed.
  deferredPrompt = null;
  announce();
  await event.prompt();
  const { outcome } = await event.userChoice;
  return outcome;
}

/**
 * Registers the service worker for everyone, at startup.
 *
 * <p>It used to be registered only by {@code enablePush}, which meant that for
 * anyone who had not turned notifications on there was no worker at all - no
 * offline page, and, because Chrome requires a worker with a fetch handler
 * before it will offer installation, no way to install the app either. The
 * push half of the worker still no-ops without Firebase config, so registering
 * it unconditionally costs nothing.
 *
 * <p>The URL carries the Firebase config and doubles as the registration's
 * identity, so it must stay byte-identical to the one push.ts uses or the
 * browser installs a second worker and they fight over the scope.
 */
export function serviceWorkerUrl(): string {
  const params = new URLSearchParams({
    apiKey: firebaseConfig.apiKey ?? '',
    authDomain: firebaseConfig.authDomain ?? '',
    projectId: firebaseConfig.projectId ?? '',
    messagingSenderId: firebaseConfig.messagingSenderId ?? '',
    appId: firebaseConfig.appId ?? '',
  });
  return `/firebase-messaging-sw.js?${params.toString()}`;
}

export function registerServiceWorkerAtStartup(): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  // After load: registering during startup competes with the bundle and the
  // first API calls for the same connection, on connections that cannot spare
  // it. Nothing here is needed in the first seconds of a visit.
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(serviceWorkerUrl(), { scope: '/' }).catch((err) => {
      // Not fatal: the app works without it, minus offline and installability.
      console.warn('Service worker registration failed:', err);
    });
  });
}
