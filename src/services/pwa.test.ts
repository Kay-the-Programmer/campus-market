import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * pwa.ts reads Firebase config for the service-worker URL and nothing else,
 * so it is stubbed rather than initialised.
 */
vi.mock('../firebase', () => ({
  firebaseConfig: { apiKey: 'k', authDomain: 'd', projectId: 'p', messagingSenderId: 's', appId: 'a' },
}));

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
const MAC_SAFARI = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15';
const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Mobile Safari/537.36';

function device(ua: string, opts: { platform?: string; touch?: number; standalone?: boolean } = {}) {
  vi.stubGlobal('navigator', {
    userAgent: ua,
    platform: opts.platform ?? 'Win32',
    maxTouchPoints: opts.touch ?? 0,
    standalone: opts.standalone,
    serviceWorker: { register: vi.fn().mockResolvedValue({}) },
  });
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
}

/** A stand-in for the event Chrome fires; it is not in lib.dom. */
function fireInstallPrompt(outcome: 'accepted' | 'dismissed' = 'accepted') {
  const event = new Event('beforeinstallprompt') as Event & Record<string, unknown>;
  const prompt = vi.fn().mockResolvedValue(undefined);
  event.prompt = prompt;
  event.userChoice = Promise.resolve({ outcome });
  window.dispatchEvent(event);
  return { prompt };
}

// Module-level state (the saved event) has to be fresh per test.
async function loadPwa() {
  vi.resetModules();
  return import('./pwa');
}

beforeEach(() => device(CHROME));
afterEach(() => vi.unstubAllGlobals());

describe('install prompt, where the browser offers one', () => {
  it('has nothing to offer until the browser says so', async () => {
    const pwa = await loadPwa();
    expect(pwa.canPromptInstall()).toBe(false);
  });

  it('captures beforeinstallprompt and offers a button', async () => {
    const pwa = await loadPwa();
    fireInstallPrompt();
    expect(pwa.canPromptInstall()).toBe(true);
    // Chrome's own mini-infobar is suppressed so ours can replay the event.
    expect(pwa.needsManualInstall()).toBe(false);
  });

  it('notifies subscribers, since the event can land after React mounts', async () => {
    const pwa = await loadPwa();
    const seen = vi.fn();
    pwa.onInstallStateChange(seen);
    fireInstallPrompt();
    expect(seen).toHaveBeenCalled();
  });

  it('replays the saved event and reports the outcome', async () => {
    const pwa = await loadPwa();
    const { prompt } = fireInstallPrompt('accepted');
    await expect(pwa.promptInstall()).resolves.toBe('accepted');
    expect(prompt).toHaveBeenCalledOnce();
  });

  it('reports unavailable on a second attempt - the event is single-use', async () => {
    const pwa = await loadPwa();
    fireInstallPrompt();
    await pwa.promptInstall();
    expect(pwa.canPromptInstall()).toBe(false);
    await expect(pwa.promptInstall()).resolves.toBe('unavailable');
  });

  it('stops offering once the app reports itself installed', async () => {
    const pwa = await loadPwa();
    fireInstallPrompt();
    window.dispatchEvent(new Event('appinstalled'));
    expect(pwa.isInstalled()).toBe(true);
    expect(pwa.canPromptInstall()).toBe(false);
  });
});

describe('install directions, where the browser offers no prompt', () => {
  it('shows directions on iPhone', async () => {
    device(IPHONE, { platform: 'iPhone', touch: 5, standalone: false });
    const pwa = await loadPwa();
    expect(pwa.needsManualInstall()).toBe(true);
    expect(pwa.canPromptInstall()).toBe(false);
  });

  it('shows directions in Safari on a Mac - "Add to Dock"', async () => {
    device(MAC_SAFARI, { platform: 'MacIntel', touch: 0 });
    const pwa = await loadPwa();
    expect(pwa.needsManualInstall()).toBe(true);
  });

  it('does not show directions in Chrome, which has a real prompt', async () => {
    const pwa = await loadPwa();
    expect(pwa.needsManualInstall()).toBe(false);
  });

  it('does not show directions in Chrome on Android, whose UA also says Safari', async () => {
    // Every Chromium UA contains "Safari". Matching on that alone would put
    // iOS-style directions in front of an Android user who has a button.
    device(ANDROID, { platform: 'Linux armv8l', touch: 5 });
    const pwa = await loadPwa();
    expect(pwa.needsManualInstall()).toBe(false);
  });

  it('says nothing at all once running as an installed app', async () => {
    device(IPHONE, { platform: 'iPhone', touch: 5, standalone: true });
    const pwa = await loadPwa();
    expect(pwa.isInstalled()).toBe(true);
    expect(pwa.needsManualInstall()).toBe(false);
  });
});

describe('service worker URL', () => {
  it('is identical to the one push.ts registers, or they fight over the scope', async () => {
    const pwa = await loadPwa();
    const url = pwa.serviceWorkerUrl();
    expect(url.startsWith('/firebase-messaging-sw.js?')).toBe(true);
    expect(url).toContain('apiKey=k');
    expect(url).toContain('projectId=p');
  });
});
