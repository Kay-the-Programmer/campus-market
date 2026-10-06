/**
 * Classic: the house poster, and the default.
 *
 * <p>White page, navy ink, one orange rule under the masthead. It is the style
 * someone sends without opening the picker, so it is the one that has to look
 * like nothing in particular - no gradient to date it, no texture to fight the
 * photo, and the brand present only as the two colours it is drawn in.
 *
 * <p>This replaces the canvas port of design/listing_poster/code.html. That
 * poster put the photo in a 475px column beside the code, with a benefits grid
 * under both; the photo was the smallest thing on a page whose whole job is
 * showing it.
 */

import { ORANGE_DEEP, NAVY_DEEP, PAPER, SLATE_INK, HAIRLINE, MUTED } from '../card';
import { MARGIN } from '../layout';
import type { PosterSkin } from '../poster';

export const classicSkin: PosterSkin = {
  paint: (ctx, page) => {
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, page.w, page.h);

    /* One rule under the masthead, in the brand orange. The only ornament on
       the page, and it is there to separate the sender from the listing. */
    ctx.fillStyle = ORANGE_DEEP;
    ctx.fillRect(MARGIN, 128, 96, 6);

    /* A hairline border, because this is the style that gets printed: without
       it the page has no edge on white paper. */
    ctx.strokeStyle = HAIRLINE;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(0.75, 0.75, page.w - 1.5, page.h - 1.5);
  },
  ink: SLATE_INK,
  muted: MUTED,
  accent: NAVY_DEEP,
  brand: ORANGE_DEEP,
  surface: '#f1f4f8',
  hairline: HAIRLINE,
  pill: { bg: '#f1f4f9', fg: NAVY_DEEP },
  flag: { bg: ORANGE_DEEP, fg: PAPER },
  qr: { shape: 'square', ink: SLATE_INK, eye: NAVY_DEEP, quiet: 2 },
};
