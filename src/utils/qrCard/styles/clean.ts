/**
 * Clean: the poster for a printer and a noticeboard.
 *
 * <p>The reasoning is physical rather than aesthetic. This is the one someone
 * prints on a shared library printer and pins up by a lecture theatre, so it
 * spends as little ink as a page can - no fills, no panels, type in one colour
 * - and the code keeps square modules, which join into solid runs that survive
 * a cheap print and a phone camera held at an angle.
 */

import { HAIRLINE, INK, MUTED, NAVY, PAPER, PINK } from '../card';
import type { PosterSkin } from '../poster';

export const cleanSkin: PosterSkin = {
  paint: (ctx, page) => {
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, page.w, page.h);
    ctx.strokeStyle = HAIRLINE;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(0.75, 0.75, page.w - 1.5, page.h - 1.5);
  },
  ink: INK,
  muted: MUTED,
  accent: NAVY,
  brand: PINK,
  surface: '#f3f6fd',
  hairline: HAIRLINE,
  pill: { bg: '#eef3ff', fg: NAVY },
  flag: { bg: NAVY, fg: PAPER },
  qr: { shape: 'square', ink: INK, eye: NAVY, quiet: 2 },
  /* Larger than the rest: this is the one that goes on a wall, where the code
     is read from across a corridor rather than from arm's length. */
  qrBox: 300,
};
