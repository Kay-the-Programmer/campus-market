import { afterEach, describe, expect, it, vi } from 'vitest';

/*
 * push.ts pulls in the Firebase SDK and reads build-time config. Neither is
 * relevant to the three pure predicates under test, and isPushConfigured is
 * false without env vars - which would make needsHomeScreenInstall trivially
 * false and the tests vacuous. Both are stubbed so the logic is what is
 * actually being exercised.
 */
vi.mock('../firebase', () => ({
  firebaseConfig: { apiKey: 'k', projectId: 'p', messagingSenderId: 's', appId: 'a' },
  getFirebaseApp: () => null,
  isPushConfigured: true,
  pushVapidKey: 'vapid',
}));
vi.mock('firebase/messaging', () => ({
  getMessaging: () => null, getToken: async () => '', deleteToken: async () => true, onMessage: () => () => {},
}));

const { isIos, isStandalone, needsHomeScreenInstall } = await import('./push');

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
const IPAD_13 = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Mobile Safari/537.36';

/** @param opts.pushApis whether the Notification/Push APIs are exposed at all. */
function device(opts: {
  ua: string; platform?: string; touch?: number; standaloneFlag?: boolean;
  displayMode?: boolean; pushApis?: boolean;
}) {
  const nav: Record<string, unknown> = {
    userAgent: opts.ua,
    platform: opts.platform ?? 'iPhone',
    maxTouchPoints: opts.touch ?? 5,
  };
  if (opts.standaloneFlag !== undefined) nav.standalone = opts.standaloneFlag;
  // Apple exposes serviceWorker in a tab but not Notification/PushManager.
  if (opts.pushApis) nav.serviceWorker = {};
  vi.stubGlobal('navigator', nav);
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: !!opts.displayMode && q.includes('standalone') }));
  if (opts.pushApis) {
    vi.stubGlobal('Notification', function () {} as unknown);
    vi.stubGlobal('PushManager', function () {} as unknown);
  }
}

afterEach(() => vi.unstubAllGlobals());

describe('isIos', () => {
  it('recognises an iPhone', () => {
    device({ ua: IPHONE });
    expect(isIos()).toBe(true);
  });

  it('recognises an iPad, which reports itself as a Mac since iPadOS 13', () => {
    // The only thing separating it from a desktop Mac is the touch points.
    // Without this clause every iPad is treated as a desktop, told nothing,
    // and silently gets no notifications.
    device({ ua: IPAD_13, platform: 'MacIntel', touch: 5 });
    expect(isIos()).toBe(true);
  });

  it('does not mistake a real Mac for an iPad', () => {
    device({ ua: IPAD_13, platform: 'MacIntel', touch: 0 });
    expect(isIos()).toBe(false);
  });

  it('is false on Android', () => {
    device({ ua: ANDROID, platform: 'Linux armv8l', touch: 5 });
    expect(isIos()).toBe(false);
  });
});

describe('isStandalone', () => {
  it("honours Apple's own navigator.standalone", () => {
    device({ ua: IPHONE, standaloneFlag: true });
    expect(isStandalone()).toBe(true);
  });

  it('honours the display-mode media query', () => {
    device({ ua: ANDROID, platform: 'Linux', displayMode: true });
    expect(isStandalone()).toBe(true);
  });

  it('is false in an ordinary tab', () => {
    device({ ua: IPHONE, standaloneFlag: false });
    expect(isStandalone()).toBe(false);
  });
});

describe('needsHomeScreenInstall', () => {
  it('is true for an iPhone in a Safari tab - the case that was silently excluded', () => {
    // Apple exposes neither Notification nor PushManager here, so every other
    // check in the app returns "unsupported" and the opt-in banner hides
    // itself. This is what lets the UI say "install it" instead.
    device({ ua: IPHONE, standaloneFlag: false, pushApis: false });
    expect(needsHomeScreenInstall()).toBe(true);
  });

  it('is false once the app is on the Home Screen', () => {
    device({ ua: IPHONE, standaloneFlag: true, pushApis: true });
    expect(needsHomeScreenInstall()).toBe(false);
  });

  it('is false on Android, where a tab can receive push perfectly well', () => {
    device({ ua: ANDROID, platform: 'Linux armv8l', standaloneFlag: false, pushApis: true });
    expect(needsHomeScreenInstall()).toBe(false);
  });

  it('is false on a desktop browser with push support', () => {
    device({ ua: IPAD_13, platform: 'MacIntel', touch: 0, pushApis: true });
    expect(needsHomeScreenInstall()).toBe(false);
  });
});
