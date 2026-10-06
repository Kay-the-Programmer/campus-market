import { describe, expect, it } from 'vitest';
import { fitContain } from './canvas';

/*
 * The poster used to fill its photo frame, which meant cropping: a frame is a
 * fixed shape and a listing photo is whatever shape the seller's phone
 * produced, so a tall photo lost its top and bottom - on a card whose entire
 * job is showing the thing being sold. This is the sizing rule that replaced
 * it, and it has a promise attached: nothing is cut off.
 *
 * It now runs twice per poster. Once to size the frame from the photo's own
 * aspect - layout.ts fits the aspect itself into the page's budget - and once
 * to place the photo in the frame that produced. That is what removed the
 * letterboxing too: a frame that came from the photo is a frame the photo
 * reaches the edges of.
 */

const BOX = { w: 936, h: 1040 };

/** Shapes a phone camera actually produces, plus the awkward ends. */
const PHOTOS: Array<[string, number, number]> = [
  ['square', 1000, 1000],
  ['portrait phone', 1080, 1920],
  ['landscape phone', 1920, 1080],
  ['tall screenshot', 828, 2400],
  ['wide panorama', 4000, 900],
  ['tiny thumbnail', 64, 48],
  ['exactly the frame', 936, 1040],
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
    expect(fitContain(1872, 2080, BOX.w, BOX.h)).toEqual({ w: BOX.w, h: BOX.h });
  });

  /*
   * An <img> that failed to decode reports 0x0, and dividing by it would put
   * NaN into drawImage - which paints nothing at all, silently.
   */
  it.each([[0, 0], [0, 100], [100, 0], [Number.NaN, 10]])(
    'falls back to the frame for a %sx%s image',
    (w, h) => {
      expect(fitContain(w, h, BOX.w, BOX.h)).toEqual({ w: BOX.w, h: BOX.h });
    },
  );
});
