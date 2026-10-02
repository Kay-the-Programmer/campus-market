import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { importChunk, isStaleChunkError, reloadForNewBuild } from './lazyChunk';

/*
 * The real-world messages, verbatim. The engines agree on nothing here, and
 * the one the user reported - the MIME type complaint - is the one that does
 * not mention modules or importing at all, so a check written from memory
 * against "failed to fetch dynamically imported module" would miss exactly the
 * case that prompted this.
 */
describe('isStaleChunkError', () => {
  it.each([
    "'text/html' is not a valid JavaScript MIME type.",
    'Failed to fetch dynamically imported module: https://x/assets/qrCard-BRKdBQ23.js',
    'error loading dynamically imported module',
    'Importing a module script failed.',
    "Unexpected token '<'",
  ])('recognises %j', (message) => {
    expect(isStaleChunkError(new Error(message))).toBe(true);
  });

  it('leaves genuine failures alone, so they are not hidden by a reload', () => {
    expect(isStaleChunkError(new Error('Cannot read properties of null'))).toBe(false);
    expect(isStaleChunkError(new Error('This browser cannot generate the QR card.'))).toBe(false);
    expect(isStaleChunkError(null)).toBe(false);
    expect(isStaleChunkError(undefined)).toBe(false);
  });
});

describe('reloadForNewBuild', () => {
  const reload = vi.fn();

  beforeEach(() => {
    sessionStorage.clear();
    reload.mockClear();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, reload },
    });
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it('reloads once', () => {
    expect(reloadForNewBuild()).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  /* The important one. A reload that does not fix the problem - a chunk really
     missing from the current build, say - would otherwise reload forever, which
     is worse than the error it replaced. */
  it('refuses a second reload inside the cooldown, so it cannot loop', () => {
    reloadForNewBuild();
    expect(reloadForNewBuild()).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});

describe('importChunk', () => {
  beforeEach(() => {
    sessionStorage.clear();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, reload: vi.fn() },
    });
  });

  it('returns the module when all is well', async () => {
    await expect(importChunk(async () => ({ ok: true }))).resolves.toEqual({ ok: true });
  });

  it('rethrows an error that is not about a missing chunk', async () => {
    const boom = new Error('something else went wrong');
    await expect(importChunk(async () => { throw boom; })).rejects.toThrow(boom);
    expect(window.location.reload).not.toHaveBeenCalled();
  });

  it('rethrows rather than hanging when the reload is on cooldown', async () => {
    reloadForNewBuild(); // burn the one allowed reload
    const stale = new Error("'text/html' is not a valid JavaScript MIME type.");
    await expect(importChunk(async () => { throw stale; })).rejects.toThrow(stale);
  });
});
