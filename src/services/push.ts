import { deleteToken, getMessaging, getToken, onMessage, type Messaging } from 'firebase/messaging';
import { firebaseConfig, getFirebaseApp, isPushConfigured, pushVapidKey } from '../firebase';
import type { NotificationPreferences } from '../types';
import { api } from './api';
import { readStored, removeStored, writeStored } from '../utils/storage';

/**
 * Web Push client.
 *
 * Three things have to agree before a notification can arrive: the browser has
 * to support the APIs, the user has to have granted permission, and the server
 * has to be holding a current FCM token for this device. This module owns all
 * three, so the screens only ever ask "is push on?" and "turn it on".
 *
 * The last-registered token is mirrored into localStorage because unregistering
 * needs it after the messaging instance is gone - on logout, the point at which
 * removing it matters most.
 */

const TOKEN_KEY = 'cm_push_token';
const SW_URL = '/firebase-messaging-sw.js';

export type { NotificationPreferences };

export type PushPermission = 'granted' | 'denied' | 'default' | 'unsupported';

/**
 * Safari before 16.4, Firefox in private mode and every browser served over
 * plain HTTP land here. localhost is exempt from the HTTPS rule, which is what
 * makes this testable in development.
 */
export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'Notification' in window
    && 'PushManager' in window
  );
}

/** True only when push could actually work end to end, so the UI can stay quiet otherwise. */
export function isPushAvailable(): boolean {
  return isPushConfigured && isPushSupported();
}

export function getPushPermission(): PushPermission {
  if (!isPushSupported()) return 'unsupported';
  return Notification.permission as PushPermission;
}

export function getStoredPushToken(): string | null {
  return readStored(TOKEN_KEY);
}

let messagingInstance: Messaging | null = null;

function messaging(): Messaging | null {
  if (messagingInstance) return messagingInstance;
  const app = getFirebaseApp();
  if (!app) return null;
  messagingInstance = getMessaging(app);
  return messagingInstance;
}

/**
 * Registers the worker with the Firebase config on the query string - a service
 * worker has no access to the bundle's env vars, so this is how it gets them.
 *
 * The URL doubles as the registration's identity: keeping it byte-identical
 * across calls means the browser reuses one worker instead of installing a new
 * one on every login.
 */
async function registerServiceWorker(): Promise<ServiceWorkerRegistration> {
  const params = new URLSearchParams({
    apiKey: firebaseConfig.apiKey ?? '',
    authDomain: firebaseConfig.authDomain ?? '',
    projectId: firebaseConfig.projectId ?? '',
    messagingSenderId: firebaseConfig.messagingSenderId ?? '',
    appId: firebaseConfig.appId ?? '',
  });
  return navigator.serviceWorker.register(`${SW_URL}?${params.toString()}`, { scope: '/' });
}

export interface EnablePushResult {
  ok: boolean;
  permission: PushPermission;
  error?: string;
}

/**
 * The opt-in. Must be called from a click: browsers ignore - and Chrome
 * permanently blocks - permission prompts that were not user-initiated.
 */
export async function enablePush(): Promise<EnablePushResult> {
  if (!isPushSupported()) {
    return { ok: false, permission: 'unsupported', error: 'This browser cannot receive push notifications.' };
  }
  if (!isPushConfigured) {
    return { ok: false, permission: getPushPermission(), error: 'Push notifications are not configured for this app.' };
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return {
      ok: false,
      permission: permission as PushPermission,
      error: permission === 'denied'
        // Once denied, requestPermission resolves instantly forever - only the
        // browser's own site settings can undo it, so say so instead of retrying.
        ? 'Notifications are blocked for this site. Allow them in your browser settings to turn them back on.'
        : 'Notification permission was dismissed.',
    };
  }

  const token = await refreshToken();
  if (!token) {
    return { ok: false, permission: 'granted', error: 'Could not register this device for notifications.' };
  }
  return { ok: true, permission: 'granted' };
}

/**
 * Fetches the current FCM token and hands it to the API.
 *
 * Safe to call on every login and page load: FCM returns the same token until
 * it decides to rotate one, and the endpoint is idempotent.
 */
export async function refreshToken(): Promise<string | null> {
  if (!isPushAvailable() || getPushPermission() !== 'granted') {
    return null;
  }
  try {
    const registration = await registerServiceWorker();
    const instance = messaging();
    if (!instance) return null;

    const token = await getToken(instance, {
      vapidKey: pushVapidKey,
      serviceWorkerRegistration: registration,
    });
    if (!token) return null;

    const res = await api.notifications.registerDevice(token, navigator.userAgent);
    if (!res.success) return null;

    writeStored(TOKEN_KEY, token);
    return token;
  } catch (e) {
    // A failed registration must never break sign-in or page load; the user
    // keeps in-app notifications and can retry from the notifications screen.
    console.warn('Push registration failed', e);
    return null;
  }
}

/**
 * Turns push off for this device: the server stops sending, and the token
 * itself is destroyed so nothing can be delivered even if a row survives.
 *
 * Called both from the settings toggle and from logout - which is why it never
 * throws. A device that keeps buzzing after someone signs out on a shared
 * laptop is worse than a failed unsubscribe.
 */
export async function disablePush(): Promise<void> {
  const token = getStoredPushToken();
  removeStored(TOKEN_KEY);
  if (!token) return;

  try {
    await api.notifications.unregisterDevice(token);
  } catch {
    // Ignored on purpose: see above.
  }
  try {
    const instance = messaging();
    if (instance) await deleteToken(instance);
  } catch {
    // Ignored on purpose: see above.
  }
}

/** True when this device is registered and allowed to receive notifications. */
export function isPushEnabledHere(): boolean {
  return getPushPermission() === 'granted' && !!getStoredPushToken();
}

export interface ForegroundPush {
  type: string;
  title: string;
  body: string;
  link: string;
  /**
   * Id of the stored notification this push mirrors, when the server sent one.
   * Lets a client that also polls recognise a notification it has already
   * shown, so the two delivery paths cannot toast the same thing twice.
   */
  notificationId?: string;
}

/**
 * Foreground messages. The service worker only handles pushes that arrive while
 * the tab is in the background; when the app is open, FCM delivers here instead
 * and it is the app's job to show something - an OS notification over a window
 * the user is already looking at is noise.
 */
export function onForegroundPush(handler: (push: ForegroundPush) => void): () => void {
  if (!isPushAvailable()) return () => {};
  const instance = messaging();
  if (!instance) return () => {};

  return onMessage(instance, (payload) => {
    const data = (payload.data ?? {}) as Record<string, string>;
    handler({
      type: data.type ?? 'SYSTEM',
      title: data.title ?? 'CampusMarket',
      body: data.body ?? '',
      link: data.link ?? '/notifications',
      notificationId: data.notificationId,
    });
  });
}

/**
 * Deep links from a background notification click. The worker posts the target
 * to whichever tab it focused rather than navigating it, so the client-side
 * router handles it without a reload.
 */
export function onNotificationClick(handler: (link: string) => void): () => void {
  if (!isPushSupported()) return () => {};
  const listener = (event: MessageEvent) => {
    if (event.data?.type === 'CAMPUSMARKET_NOTIFICATION_CLICK' && event.data.link) {
      handler(event.data.link as string);
    }
  };
  navigator.serviceWorker.addEventListener('message', listener);
  return () => navigator.serviceWorker.removeEventListener('message', listener);
}
