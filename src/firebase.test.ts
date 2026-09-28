import { describe, expect, it } from 'vitest';
import { authDomainWarning } from './firebase';

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
