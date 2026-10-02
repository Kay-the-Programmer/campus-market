import { describe, expect, it } from 'vitest';
import { fitContain, fitCover } from './canvas';

/*
 * The poster used to fill its photo frame, which meant cropping: a frame is a
 * fixed shape and a listing photo is whatever shape the seller's phone
 * produced, so a tall photo lost its top and bottom - on a card whose entire
 * job is showing the thing being sold. These are the two sizing rules that
 * replaced it, and the first is the one with a promise attached: nothing is
 * cut off.
 */

const BOX = { w: 936, h: 520 };

/** Shapes a phone camera actually produces, plus the awkward ends. */
const PHOTOS: Array<[string, number, number]> = [
  ['square', 1000, 1000],
  ['portrait phone', 1080, 1920],
  ['landscape phone', 1920, 1080],
  ['tall screenshot', 828, 2400],
  ['wide panorama', 4000, 900],
  ['tiny thumbnail', 64, 48],
  ['exactly the frame', 936, 520],
];

describe('fitting a photo into a frame', () => {
  it.each(PHOTOS)('shows all of a %s', (_name, w, h) => {
    const fitted = fitContain(w, h, BOX.w, BOX.h);

    // Inside the frame on both axes: whatever is left over is background, not
    // a piece of the photo that got cut off.
    expect(fitted.w).toBeLessThanOrEqual(BOX.w + 0.001);
    expect(fitted.h).toBeLessThanOrEqual(BOX.h + 0.001);

    // Still the photo's own shape - a squashed product is worse than a cropped one.
    expect(fitted.w / fitted.h).toBeCloseTo(w / h, 5);

    // And as large as that allows: one axis has to touch the frame, or the
    // photo is needlessly small.
    const touches = Math.abs(fitted.w - BOX.w) < 0.001 || Math.abs(fitted.h - BOX.h) < 0.001;
    expect(touches).toBe(true);
  });

  it('leaves a photo of the frame’s own shape exactly filling it', () => {
    expect(fitContain(1872, 1040, BOX.w, BOX.h)).toEqual({ w: BOX.w, h: BOX.h });
  });

  /*
   * An <img> that failed to decode reports 0x0, and dividing by it would put
   * NaN into drawImage - which paints nothing at all, silently.
   */
  it.each([[0, 0], [0, 100], [100, 0], [Number.NaN, 10]])(
    'falls back to the frame for a %sx%s image',
    (w, h) => {
      expect(fitContain(w, h, BOX.w, BOX.h)).toEqual({ w: BOX.w, h: BOX.h });
      expect(fitCover(w, h, BOX.w, BOX.h)).toEqual({ w: BOX.w, h: BOX.h });
    },
  );
});

describe('the wash behind it', () => {
  it.each(PHOTOS)('covers the frame for a %s', (_name, w, h) => {
    const covered = fitCover(w, h, BOX.w, BOX.h);

    // The opposite promise, and why cover is only ever used for the blurred
    // backdrop: it reaches both edges, and overshoots one of them.
    expect(covered.w).toBeGreaterThanOrEqual(BOX.w - 0.001);
    expect(covered.h).toBeGreaterThanOrEqual(BOX.h - 0.001);
    expect(covered.w / covered.h).toBeCloseTo(w / h, 5);
  });

  it('never shows less of the photo than the fitted copy does', () => {
    PHOTOS.forEach(([, w, h]) => {
      const fitted = fitContain(w, h, BOX.w, BOX.h);
      const covered = fitCover(w, h, BOX.w, BOX.h);
      expect(covered.w).toBeGreaterThanOrEqual(fitted.w - 0.001);
      expect(covered.h).toBeGreaterThanOrEqual(fitted.h - 0.001);
    });
  });
});
