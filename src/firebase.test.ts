import { afterEach, describe, expect, it, vi } from 'vitest';
import { authDomainWarning, completeGoogleRedirect, isGoogleRedirectPending } from './firebase';

/*
 * The redirect flow unloads the page, so "a sign-in is in progress" has to be
 * remembered in session storage rather than in React state. Firebase itself is
 * mocked here: what is being checked is the marker's lifecycle, which is what
 * decides whether the return leg shows progress or a silent, signed-out page.
 */
vi.mock('firebase/auth', async () => ({
  getAuth: vi.fn(() => ({})),
  getRedirectResult: vi.fn(async () => null),
  GoogleAuthProvider: class { setCustomParameters() {} },
  signInWithPopup: vi.fn(),
  signInWithRedirect: vi.fn(),
}));

const MARKER = 'cm.google-redirect-pending';

describe('the Google redirect marker', () => {
  afterEach(() => {
    window.sessionStorage.removeItem(MARKER);
  });

  it('is absent on an ordinary page load', () => {
    expect(isGoogleRedirectPending()).toBe(false);
  });

  it('reports a sign-in that left this tab for Google', () => {
    window.sessionStorage.setItem(MARKER, '1');
    expect(isGoogleRedirectPending()).toBe(true);
  });

  it('is cleared by the return leg even when it brings nothing back', async () => {
    /*
     * The empty-result case is the one that matters: someone who pressed Back
     * at Google's account picker returns with no credential at all. Left
     * behind, the marker would put every later load of this tab into
     * "finishing sign-in" - a spinner with nothing coming.
     *
     * Note this asserts the behaviour of the unconfigured build too, where
     * completeGoogleRedirect returns early - a build with no Firebase config
     * can never have set the marker in the first place.
     */
    window.sessionStorage.setItem(MARKER, '1');
    await completeGoogleRedirect();
    expect(isGoogleRedirectPending()).toBe(false);
  });
});

/*
 * This check exists because of a live failure that was invisible to the person
 * who shipped it.
 *
 * vercel.json rewrites /__/auth/* to Firebase so the OAuth handler is served by
 * the app's own domain and Firebase's auth storage stays first-party. With
 * VITE_FIREBASE_AUTH_DOMAIN pointed at <project>.firebaseapp.com instead, that
 * storage is third-party - which a plain Chrome window allows and Safari's ITP
 * and Edge's Tracking Prevention block. Sign-in therefore passes the smoke test
 * and fails for a large share of real users, logging only that the browser
 * blocked some storage, which names the symptom and not the setting.
 */
describe('authDomainWarning', () => {
  it('warns when the auth handler would be fetched from another origin', () => {
    const warning = authDomainWarning(
      'www.campusmarketmulungushi.online',
      'campusmarket-815cb.firebaseapp.com',
    );

    expect(warning).toContain('campusmarket-815cb.firebaseapp.com');
    // Names the value to set, so the fix does not need the docs.
    expect(warning).toContain('www.campusmarketmulungushi.online');
  });

  it('gives the whole fix, not just the variable to change', () => {
    // Changing the variable alone is a trap: Google rejects any redirect_uri it
    // was not told about, so sign-in then dies on redirect_uri_mismatch. A
    // warning that stops at "set it to X" sends the reader into exactly that.
    const warning = authDomainWarning('shop.example.com', 'demo.firebaseapp.com');

    expect(warning).toContain('https://shop.example.com/__/auth/handler');
    expect(warning).toContain('redirect_uri_mismatch');
  });

  it('stays quiet when the auth domain is the app\'s own host', () => {
    expect(authDomainWarning('www.example.com', 'www.example.com')).toBeNull();
  });

  it('treats www and the bare domain as different hosts', () => {
    // They are different origins to a browser, and the rewrite only exists on
    // whichever one actually serves the app.
    expect(authDomainWarning('www.example.com', 'example.com')).not.toBeNull();
  });

  it('stays quiet on localhost, which has no rewrite in front of it', () => {
    expect(authDomainWarning('localhost', 'demo.firebaseapp.com')).toBeNull();
    expect(authDomainWarning('127.0.0.1', 'demo.firebaseapp.com')).toBeNull();
  });

  it('stays quiet when Google sign-in is not configured at all', () => {
    // Nothing to misconfigure, and the button is hidden anyway.
    expect(authDomainWarning('www.example.com', undefined)).toBeNull();
  });
});
