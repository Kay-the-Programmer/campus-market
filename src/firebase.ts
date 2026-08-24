import { initializeApp, getApps, type FirebaseOptions } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';

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
 * Opens the Google account picker and returns a Firebase ID token.
 *
 * The token is the only thing sent to the backend (POST /api/auth/google),
 * which verifies it itself - the client's job is only to prove the sign-in
 * happened, not to assert who the user is.
 */
export async function signInWithGoogle(): Promise<string> {
  if (!app) {
    throw new Error('Google sign-in is not configured for this app.');
  }
  const auth = getAuth(app);
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });

  const credential = await signInWithPopup(auth, provider);
  return credential.user.getIdToken();
}
