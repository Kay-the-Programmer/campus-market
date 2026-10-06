/**
 * Night: the poster for a feed that is already dark.
 *
 * <p>Near-black, with a single violet glow behind the masthead so the page has
 * a light source rather than being flat. Everything else is the same poster.
 *
 * <p>The one thing that cannot go dark is the code: a QR needs a light field
 * and a quiet border, so it keeps its white plate here rather than being
 * inverted. Inverted codes do scan on some phones, which is exactly the
 * problem - "some".
 */

import { ABYSS, INK, MINT, PAPER, SLATE, VIOLET } from '../card';
import type { PosterSkin } from '../poster';

export const nightSkin: PosterSkin = {
  paint: (ctx, page) => {
    ctx.fillStyle = ABYSS;
    ctx.fillRect(0, 0, page.w, page.h);

    const glow = ctx.createRadialGradient(page.w, 0, 0, page.w, 0, page.w * 0.9);
    glow.addColorStop(0, VIOLET);
    glow.addColorStop(1, 'rgba(7,11,28,0)');
    ctx.save();
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, page.w, page.h);
    ctx.restore();
  },
  ink: PAPER,
  muted: 'rgba(233,238,255,0.64)',
  accent: MINT,
  brand: MINT,
  surface: SLATE,
  hairline: 'rgba(255,255,255,0.14)',
  pill: { bg: 'rgba(255,255,255,0.12)', fg: PAPER },
  flag: { bg: MINT, fg: INK },
  qr: {
    shape: 'dot',
    ink: INK,
    eye: VIOLET,
    quiet: 2,
    plate: { fill: PAPER, radius: 28, pad: 22 },
  },
};
