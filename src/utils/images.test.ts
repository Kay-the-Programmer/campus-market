import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  thumbnailUrl, smallUrl, tinyUrl, SMALL_W, THUMB_W, TINY_W,
  __drawToBlobForTests, __resetWebpSupportForTests,
} from './images';

/**
 * The thumbnail is derived from the full image's URL by convention, on both
 * sides of the API. If this derivation drifts from the backend's naming
 * (ImageStorageService.THUMB_SUFFIX), every card silently falls back to the
 * full image and the whole optimisation evaporates without an error - so the
 * exact string shape is worth pinning.
 */
describe('thumbnailUrl', () => {
  it('inserts .thumb before the extension of a stored image', () => {
    expect(thumbnailUrl('/api/uploads/abc-123.webp')).toBe('/api/uploads/abc-123.thumb.webp');
  });

  it('works on the absolute form the API boundary produces', () => {
    expect(thumbnailUrl('https://api.example.test/api/uploads/abc.jpg'))
      .toBe('https://api.example.test/api/uploads/abc.thumb.jpg');
  });

  it('returns null for images the API did not store - nothing to derive', () => {
    expect(thumbnailUrl('https://lh3.googleusercontent.com/photo.jpg')).toBeNull();
    expect(thumbnailUrl('https://images.unsplash.com/photo-1.jpg?w=800')).toBeNull();
    expect(thumbnailUrl('data:image/png;base64,AAAA')).toBeNull();
  });

  it('returns null for empty input', () => {
    expect(thumbnailUrl('')).toBeNull();
    expect(thumbnailUrl(undefined)).toBeNull();
    expect(thumbnailUrl(null)).toBeNull();
  });

  it('does not stack the suffix on a URL that is already a thumbnail', () => {
    const thumb = '/api/uploads/abc.thumb.webp';
    expect(thumbnailUrl(thumb)).toBe(thumb);
  });

  it('is unfazed by a dot in the id', () => {
    // UUIDs have none, but the rule should key off the LAST dot regardless.
    expect(thumbnailUrl('/api/uploads/a.b.c.png')).toBe('/api/uploads/a.b.c.thumb.png');
  });
});

/**
 * The encoder must never produce PNG.
 *
 * <p>This is a regression test for a bug that reached production silently and
 * cost every user on a weak connection dearly. `canvas.toBlob` does not throw
 * when it cannot encode the type you asked for - the spec has it fall back to
 * `image/png` and ignore the quality argument, because PNG is lossless. So a
 * browser without WebP encoding turned a request for a 40KB lossy thumbnail
 * into a full-quality PNG of a photograph. Measured on the live site: a 457KB
 * "thumbnail" and a 2.1MB "full", about ten times what they should be, on a
 * grid that loads two dozen of them.
 *
 * <p>Nothing errored, nothing logged, and the only symptom was that the app
 * was slow - which is why the check belongs in a test rather than in a code
 * review.
 */
describe('image encoding never falls back to PNG', () => {
  /** A canvas stub that mimics a browser with, or without, WebP encoding. */
  function stubCanvas(opts: { webp: boolean }) {
    const calls: string[] = [];
    const ctx = {
      imageSmoothingEnabled: false,
      imageSmoothingQuality: '',
      fillStyle: '',
      fillRect: () => {},
      drawImage: () => {},
    };
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ctx,
      // The spec behaviour: an unsupported type silently becomes PNG.
      toDataURL: (type: string) =>
        opts.webp && type === 'image/webp' ? 'data:image/webp;base64,AA' : 'data:image/png;base64,AA',
      toBlob: (cb: (b: Blob | null) => void, type: string) => {
        const actual = opts.webp || type === 'image/jpeg' ? type : 'image/png';
        calls.push(actual);
        cb(new Blob(['x'], { type: actual }));
      },
    };
    vi.spyOn(document, 'createElement').mockImplementation(((tag: string) =>
      tag === 'canvas' ? canvas : realCreateElement.call(document, tag)) as typeof document.createElement);
    return { calls };
  }

  const realCreateElement = document.createElement;
  const fakeImage = { width: 2000, height: 1500 } as HTMLImageElement;

  afterEach(() => {
    vi.restoreAllMocks();
    __resetWebpSupportForTests();
  });

  it('uses WebP when the browser can encode it', async () => {
    const { calls } = stubCanvas({ webp: true });
    const blob = await __drawToBlobForTests(fakeImage, 640, 0.7);
    expect(blob.type).toBe('image/webp');
    expect(calls).toEqual(['image/webp']);
  });

  it('falls back to JPEG - not PNG - when WebP cannot be encoded', async () => {
    const { calls } = stubCanvas({ webp: false });
    const blob = await __drawToBlobForTests(fakeImage, 640, 0.7);
    expect(blob.type).toBe('image/jpeg');
    expect(blob.type).not.toBe('image/png');
    // Asked for JPEG directly rather than asking for WebP and hoping.
    expect(calls).toEqual(['image/jpeg']);
  });

  it('re-encodes as JPEG if the browser substitutes a format anyway', async () => {
    // Claims WebP support on the probe, then hands back PNG from toBlob -
    // the belt-and-braces path. Whatever happens, the upload is not a PNG.
    const calls: string[] = [];
    const ctx = {
      imageSmoothingEnabled: false, imageSmoothingQuality: '', fillStyle: '',
      fillRect: () => {}, drawImage: () => {},
    };
    const canvas = {
      width: 0, height: 0, getContext: () => ctx,
      toDataURL: () => 'data:image/webp;base64,AA',
      toBlob: (cb: (b: Blob | null) => void, type: string) => {
        const actual = type === 'image/jpeg' ? 'image/jpeg' : 'image/png';
        calls.push(actual);
        cb(new Blob(['x'], { type: actual }));
      },
    };
    vi.spyOn(document, 'createElement').mockImplementation(((tag: string) =>
      tag === 'canvas' ? canvas : realCreateElement.call(document, tag)) as typeof document.createElement);

    const blob = await __drawToBlobForTests(fakeImage, 640, 0.7);
    expect(blob.type).toBe('image/jpeg');
    expect(calls).toEqual(['image/png', 'image/jpeg']);
  });
});

/**
 * The phone-size rendition, derived the same way and with the same hazard:
 * the URL is computed, not looked up, so it can name a file that was never
 * written. ListingImage's staged fallback is what covers that; this pins the
 * shape so the two sides of the convention stay in step.
 */
describe('smallUrl', () => {
  it('inserts .small before the extension of a stored image', () => {
    expect(smallUrl('/api/uploads/abc-123.webp')).toBe('/api/uploads/abc-123.small.webp');
  });

  it('returns null for images the API did not store', () => {
    expect(smallUrl('https://lh3.googleusercontent.com/photo.jpg')).toBeNull();
    expect(smallUrl(undefined)).toBeNull();
  });

  it('does not stack the suffix on a URL that is already small', () => {
    expect(smallUrl('/api/uploads/abc.small.webp')).toBe('/api/uploads/abc.small.webp');
  });

  it('refuses to derive one variant from another', () => {
    // "abc.thumb.small.webp" is not a file anyone ever wrote. Returning null
    // makes the caller skip the candidate rather than request a certain 404.
    expect(smallUrl('/api/uploads/abc.thumb.webp')).toBeNull();
    expect(thumbnailUrl('/api/uploads/abc.small.webp')).toBeNull();
  });

  it('advertises the widths the encoder actually produces', () => {
    // A srcset that lies makes the browser choose badly in whichever
    // direction the lie points.
    expect(TINY_W).toBe(160);
    expect(SMALL_W).toBe(400);
    expect(THUMB_W).toBe(640);
  });
});
