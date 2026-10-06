/**
 * The poster itself, drawn once and painted four ways.
 *
 * <p>Every style used to own its own layout - four files of hand-placed
 * baselines, each with its own ideas about where a price goes - which is why
 * they drifted apart and why the photo ended up small in all of them. There is
 * one arrangement here, and a style supplies only colour: what the page is
 * painted with, what the ink is, how the code is drawn.
 *
 * <p>The arrangement, top to bottom: who this is from, the thing being sold,
 * what it is called, what it costs, and how to get it. Nothing else. Each piece
 * is dropped rather than replaced when a listing does not have it, so a poster
 * for a title and a price alone is a shorter poster rather than one with holes
 * in it.
 */

import type { CardImages, QrCardContent } from './card';
import { chip, drawPhoto, fitOneLine } from './canvas';
import { COLUMN_W, MARGIN, font, type PosterLayout } from './layout';
import { drawQr, type QrLook } from './qr';


/**
 * A style, which is a palette and a background - nothing structural.
 *
 * <p>The constraint a skin cannot talk its way out of: a QR code needs dark
 * modules on a light field. `qr.plate` is how a dark page pays for that, and
 * the two dark styles both use it.
 */
export interface PosterSkin {
  /** Fills the page. Called first, so everything else is drawn over it. */
  paint: (ctx: CanvasRenderingContext2D, page: { w: number; h: number }) => void;
  /** Titles and headlines. */
  ink: string;
  /** Second-rank text: the facts line, the url, the camera hint. */
  muted: string;
  /** The price. Carries real information, so it is held to a readable contrast. */
  accent: string;
  /**
   * The second half of the wordmark.
   *
   * <p>Its own colour rather than the accent's, because the two are under
   * different constraints: this one may be the brand's orange on white, which
   * is fine for six letters nobody has to read and not fine for a price.
   */
  brand: string;
  /** Panels: the empty photo frame, and the plate behind the code. */
  surface: string;
  /** Rules and the photo's edge. */
  hairline: string;
  /** The category label at the top right. */
  pill: { bg: string; fg: string };
  /** The discount flag beside the price. */
  flag: { bg: string; fg: string };
  qr: QrLook;
  /**
   * A code bigger than the standard one, in page pixels.
   *
   * <p>For a style that will be printed and read from a distance rather than
   * scrolled past and scanned from arm's length. Everything else leaves it
   * alone and takes the layout's own figure.
   */
  qrBox?: number;
}

/** The wordmark, which is the only place the brand is spelled out. */
function drawMasthead(
  ctx: CanvasRenderingContext2D, skin: PosterSkin, logo: HTMLImageElement | null,
) {
  const top = 64;
  const size = 52;
  if (logo) ctx.drawImage(logo, MARGIN, top, size, size);

  const x = logo ? MARGIN + size + 18 : MARGIN;
  ctx.font = font(800, 34);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = skin.ink;
  ctx.fillText('Campus', x, top + size / 2);
  ctx.fillStyle = skin.brand;
  ctx.fillText('Market', x + ctx.measureText('Campus').width, top + size / 2);
}

/** The category, set against the right margin on the masthead's own line. */
function drawCategory(ctx: CanvasRenderingContext2D, skin: PosterSkin, eyebrow: string) {
  const label = eyebrow.toUpperCase();
  const pillFont = font(800, 22);
  ctx.font = pillFont;
  const width = ctx.measureText(label).width + 40;
  chip(ctx, label, ctx.canvas.width - MARGIN - width, 90, {
    bg: skin.pill.bg,
    fg: skin.pill.fg,
    font: pillFont,
    h: 44,
    padding: 20,
  });
}

/**
 * The price, with whatever qualifies it: what it used to be, and by how much
 * that is down. Both are drawn on the price's own baseline rather than under
 * it, because a second row here costs the photo its height.
 */
function drawPrice(ctx: CanvasRenderingContext2D, skin: PosterSkin, content: QrCardContent, at: {
  size: number; baseline: number;
}): number {
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = font(900, at.size);
  ctx.fillStyle = skin.accent;
  ctx.fillText(content.price, MARGIN, at.baseline);

  let x = MARGIN + ctx.measureText(content.price).width + 22;

  if (content.compareAtPrice) {
    ctx.font = font(600, 32);
    ctx.fillStyle = skin.muted;
    ctx.fillText(content.compareAtPrice, x, at.baseline - 6);
    const width = ctx.measureText(content.compareAtPrice).width;
    ctx.strokeStyle = skin.muted;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x - 2, at.baseline - 16);
    ctx.lineTo(x + width + 2, at.baseline - 16);
    ctx.stroke();
    x += width + 18;
  }

  if (content.discountPercent && content.discountPercent > 0) {
    const label = `−${content.discountPercent}%`;
    x += chip(ctx, label, x, at.baseline - 18, {
      bg: skin.flag.bg,
      fg: skin.flag.fg,
      font: font(800, 26),
      h: 44,
      radius: 12,
      padding: 18,
    });
  }

  // Where the row ended, so whatever shares it knows what is left.
  return x;
}

/**
 * Condition and campus zone, right-aligned on the price's line.
 *
 * <p>The one piece of text on the poster that may be dropped silently, and the
 * only one that can be: it shares a row with the price, a price with a
 * reduction beside it can run most of the way across, and the price has the
 * better claim to the space. Dropped whole rather than ellipsised down to a
 * stub - "Lik…" is not information.
 */
function drawFacts(
  ctx: CanvasRenderingContext2D, skin: PosterSkin, facts: string[],
  baseline: number, from: number,
) {
  if (facts.length === 0) return;
  const room = MARGIN + COLUMN_W - from - 28;

  ctx.font = font(600, 28);
  /* Both, or the first alone, or neither - never a cut-off one. These are two
     or three words each; an ellipsis through them leaves "Lik…", which takes
     the space without telling anyone anything. */
  const line = [facts.join('  ·  '), facts[0]]
    .find((candidate) => ctx.measureText(candidate).width <= room);
  if (!line) return;

  ctx.textAlign = 'right';
  ctx.fillStyle = skin.muted;
  ctx.fillText(line, MARGIN + COLUMN_W, baseline - 6);
  ctx.textAlign = 'left';
}

/** The code, and the two lines that say what to do with it. */
function drawScanRow(
  ctx: CanvasRenderingContext2D, skin: PosterSkin, content: QrCardContent,
  layout: PosterLayout, logo: HTMLImageElement | null,
) {
  const { qr } = layout;
  /* A plate is drawn outside the code's box, so a style that has one would hang
     it past the margin every other element lines up to. Pulling the code in by
     the plate's own padding is what puts that edge back on the margin, and it
     is the plate - not the modules - that the eye reads as the edge. */
  const plate = skin.qr.plate?.pad ?? 0;
  const x = qr.x - plate;
  drawQr(ctx, content.url, { x, y: qr.y, size: qr.w }, logo, skin.qr);

  const middle = qr.y + qr.h / 2;
  const room = x - plate - MARGIN - 40;

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = skin.ink;
  ctx.font = font(800, 40);
  ctx.fillText('Scan to grab it', MARGIN, middle - 14);

  ctx.fillStyle = skin.muted;
  ctx.font = font(500, 26);
  ctx.fillText(fitOneLine(ctx, content.prettyUrl, room), MARGIN, middle + 32);
}

/**
 * Draws the whole poster onto a canvas already sized by {@link layoutPoster}.
 *
 * <p>Synchronous, like the drawers it replaces: everything it needs has been
 * fetched by the time it is called, so it cannot leave a half-painted canvas
 * behind an await.
 */
export function drawPoster(
  ctx: CanvasRenderingContext2D,
  content: QrCardContent,
  { photo, logo }: CardImages,
  skin: PosterSkin,
  layout: PosterLayout,
) {
  skin.paint(ctx, layout.page);
  drawMasthead(ctx, skin, logo);
  if (content.eyebrow) drawCategory(ctx, skin, content.eyebrow);

  drawPhoto(ctx, photo, layout.frame, {
    base: skin.surface,
    border: { color: skin.hairline, width: 2 },
    /* Nothing to show, so the frame says so with the mark rather than with a
       grey rectangle that reads as a failed image. */
    fallback: (c, frame) => {
      if (!logo) return;
      c.save();
      c.globalAlpha = 0.18;
      const size = Math.min(frame.w, frame.h) * 0.4;
      c.drawImage(logo, frame.x + (frame.w - size) / 2, frame.y + (frame.h - size) / 2, size, size);
      c.restore();
    },
  });

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = skin.ink;
  ctx.font = font(800, layout.title.size);
  layout.title.lines.forEach((line, i) => {
    ctx.fillText(line, MARGIN, layout.title.baseline + i * layout.title.lead);
  });

  const priceEnd = drawPrice(ctx, skin, content, layout.price);
  drawFacts(ctx, skin, (content.chips ?? []).slice(0, 2), layout.price.baseline, priceEnd);

  ctx.strokeStyle = skin.hairline;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(MARGIN, layout.dividerY);
  ctx.lineTo(MARGIN + COLUMN_W, layout.dividerY);
  ctx.stroke();

  drawScanRow(ctx, skin, content, layout, logo);
}

