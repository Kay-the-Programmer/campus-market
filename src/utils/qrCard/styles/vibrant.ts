/**
 * Vibrant: the poster for a status or a story.
 *
 * <p>It has to win a scroll, so it is the one page that is not white - but the
 * colour is spent on the paper and nowhere else. The photo sits on it
 * untouched, the type stays white, and the code goes on its own white plate
 * with a full quiet zone, because a code that needs two attempts has cost more
 * than the colour won.
 *
 * <p>A wash from the brand's orange through pink into violet, top-left to
 * bottom-right. Fixed stops, no texture: the same listing always renders the
 * same poster, and the photo is the only thing on the page with detail in it.
 */

import { INK, ORANGE, PAPER, PINK, VIOLET, YELLOW } from '../card';
import type { PosterSkin } from '../poster';

export const vibrantSkin: PosterSkin = {
  paint: (ctx, page) => {
    const wash = ctx.createLinearGradient(0, 0, page.w, page.h);
    wash.addColorStop(0, ORANGE);
    wash.addColorStop(0.45, PINK);
    wash.addColorStop(1, VIOLET);
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, page.w, page.h);
  },
  ink: PAPER,
  muted: 'rgba(255,255,255,0.78)',
  accent: PAPER,
  brand: YELLOW,
  surface: 'rgba(255,255,255,0.14)',
  hairline: 'rgba(255,255,255,0.32)',
  pill: { bg: 'rgba(255,255,255,0.9)', fg: INK },
  flag: { bg: YELLOW, fg: INK },
  /* The plate is not decoration: on a saturated page it is the quiet zone, and
     without it the code has no light field to be read against. */
  qr: {
    shape: 'dot',
    ink: INK,
    eye: VIOLET,
    quiet: 2,
    plate: { fill: PAPER, radius: 28, pad: 22 },
  },
};
