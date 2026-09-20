import { initializeApp, getApps, type FirebaseOptions } from 'firebase/app';
import {
  getAuth, getRedirectResult, GoogleAuthProvider, signInWithPopup, signInWithRedirect,
} from 'firebase/auth';

/**
 * Client-side Firebase config for "Continue with Google".
 *
 * These VITE_FIREBASE_* values are public by design - a Firebase web API key
 * isn't a secret, it just identifies which project a request belongs to;
 * access is controlled by Firebase Auth and the backend, not by hiding this.
 * Get them from Firebase Console > Project settings > General > Your apps.
 */
export const firebaseConfig: FirebaseOptions = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

/** Lets the UI hide the Google button entirely rather than show one that always fails. */
export const isGoogleSignInConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);

/**
 * Web Push needs two things Google sign-in does not: a sender id to route
 * through, and the project's public VAPID key to sign the subscription with.
 * Missing either, the app keeps in-app notifications and hides the push opt-in.
 */
export const pushVapidKey: string | undefined = import.meta.env.VITE_FIREBASE_VAPID_KEY;

export const isPushConfigured = Boolean(
  firebaseConfig.apiKey
    && firebaseConfig.projectId
    && firebaseConfig.messagingSenderId
    && pushVapidKey,
);

/**
 * Shared by "Continue with Google" and push - one app instance, initialised
 * when either feature is configured.
 */
export function getFirebaseApp() {
  if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
    return null;
  }
  return getApps()[0] ?? initializeApp(firebaseConfig);
}

const app = isGoogleSignInConfigured ? getFirebaseApp() : null;

/**
 * Error codes that mean the popup cannot be used here at all, as opposed to
 * the user having closed it. Every one of these calls for the redirect flow
 * instead: a blocked window blocks again on retry, and an environment that
 * does not support popups never will.
 */
const POPUP_UNAVAILABLE = new Set([
  'auth/popup-blocked',
  'auth/operation-not-supported-in-this-environment',
]);

function googleProvider(): GoogleAuthProvider {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  return provider;
}

/**
 * Opens the Google account picker and returns a Firebase ID token - or
 * `null` when the page is navigating away to do it by redirect instead.
 *
 * The token is the only thing sent to the backend (POST /api/auth/google),
 * which verifies it itself - the client's job is only to prove the sign-in
 * happened, not to assert who the user is.
 *
 * Popup first, because it keeps the app on screen and is what desktop
 * browsers do best. Redirect as the fallback rather than the default, because
 * mobile browsers and in-app webviews (a link opened from WhatsApp or
 * Instagram lands in one) block `window.open` outright, and Google-only
 * sign-in means a blocked popup was a locked door. The caller sees `null`,
 * says so, and leaves the page to Firebase; `completeGoogleRedirect` picks
 * the result up when the browser comes back.
 */
export async function signInWithGoogle(): Promise<string | null> {
  if (!app) {
    throw new Error('Google sign-in is not configured for this app.');
  }
  const auth = getAuth(app);
  const provider = googleProvider();

  try {
    const credential = await signInWithPopup(auth, provider);
    return credential.user.getIdToken();
  } catch (err: any) {
    if (!POPUP_UNAVAILABLE.has(err?.code)) {
      throw err;
    }
    // Navigates away. If it throws instead (unauthorized domain, say) the
    // caller reports that - it is a configuration problem, not a popup one.
    await signInWithRedirect(auth, provider);
    return null;
  }
}

/**
 * The second half of the redirect flow, called once on every page load.
 *
 * Returns the ID token when this load is the return leg of a redirect sign-in
 * and `null` in the overwhelmingly common case that it is not. Cheap in that
 * case - Firebase answers from local state without a network call.
 */
export async function completeGoogleRedirect(): Promise<string | null> {
  if (!app) {
    return null;
  }
  const result = await getRedirectResult(getAuth(app));
  return result ? result.user.getIdToken() : null;
}
