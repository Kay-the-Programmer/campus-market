/**
 * Vibrant: the poster for a status or a story.
 *
 * <p>A saturated sunset gradient, sticker-shaped price and discount badges, and
 * the code on a clean white ticket at the foot. Loud on purpose - it has to win
 * a scroll - but the one thing that stays boring is the QR, which keeps dark
 * modules on pure white with a full quiet zone so it still scans first time.
 */

import {
  CARD_H, CARD_W, INK, MARGIN, MINT, NAVY, ORANGE, PAPER, PINK, TAGLINE, VIOLET, YELLOW, MUTED,
  type QrCardDrawer,
} from '../card';
import {
  burst, chip, drawPhoto, fitOneLine, roundRect, sparkle, wrap, type Frame,
} from '../canvas';
import { drawQr } from '../qr';

const M = MARGIN;

/*
 * Vertical anchors. Everything below the photo is fixed, because the ticket has
 * to clear the bottom edge and the price has to clear the ticket; the photo then
 * takes whatever height is left over, which is how a short title turns into a
 * bigger picture instead of a bigger gap.
 */
const PHOTO_TOP = 152;
const TITLE_SIZE = 62;
const TITLE_LEAD = 72;
const TITLE_LAST_BASELINE = 810;
const PRICE_TOP = 838;
const PRICE_H = 104;
const TICKET_TOP = 972;
const TICKET_H = 300;
const QR_BOX = 258;

/**
 * The backdrop: a diagonal sunset gradient, soft colour blobs for depth, a
 * faint dot grid for texture, and a handful of sparkles. Positions are fixed,
 * not random, so the same listing always renders the same card.
 */
function drawBackground(ctx: CanvasRenderingContext2D) {
  const bg = ctx.createLinearGradient(0, 0, CARD_W, CARD_H);
  bg.addColorStop(0, ORANGE);
  bg.addColorStop(0.32, PINK);
  bg.addColorStop(0.68, VIOLET);
  bg.addColorStop(1, NAVY);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  const blob = (x: number, y: number, r: number, color: string, alpha: number) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
    ctx.restore();
  };
  blob(120, 140, 420, YELLOW, 0.55);
  blob(CARD_W - 80, 760, 380, MINT, 0.32);
  blob(80, 1180, 420, ORANGE, 0.4);

  // Dot grid, fading out downward so it never competes with the ticket.
  ctx.save();
  ctx.fillStyle = PAPER;
  for (let gy = 24; gy < 960; gy += 36) {
    for (let gx = 24; gx < CARD_W; gx += 36) {
      ctx.globalAlpha = 0.14 * (1 - gy / 960);
      ctx.beginPath();
      ctx.arc(gx, gy, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();

  /* Kept out of the column the title and price are set in - x 72 to 1008. A
     sparkle behind a letter reads as a smudge, and the title's own height moves
     with the listing, so the only safe place for them is the margins. */
  sparkle(ctx, 520, 64, 26, PAPER, 0.9);
  sparkle(ctx, 600, 116, 12, YELLOW, 0.95);
  sparkle(ctx, 28, 742, 22, YELLOW, 0.9);
  sparkle(ctx, 1046, 742, 18, PAPER, 0.8);
  sparkle(ctx, 1046, 500, 14, MINT, 0.9);
  sparkle(ctx, 1040, 958, 24, YELLOW, 0.9);
}

/** The logo and name on a white pill, top left. */
function drawWordmark(ctx: CanvasRenderingContext2D, logo: HTMLImageElement | null) {
  ctx.font = '800 36px system-ui, sans-serif';
  const campusW = ctx.measureText('Campus').width;
  const marketW = ctx.measureText('Market').width;
  const pillW = 14 + 56 + 14 + campusW + marketW + 26;

  ctx.save();
  ctx.shadowColor = 'rgba(21,10,61,0.35)';
  ctx.shadowBlur = 20;
  ctx.shadowOffsetY = 6;
  ctx.fillStyle = PAPER;
  roundRect(ctx, M, 56, pillW, 76, 38);
  ctx.fill();
  ctx.restore();

  if (logo) {
    ctx.drawImage(logo, M + 14, 66, 56, 56);
  } else {
    ctx.fillStyle = NAVY;
    ctx.beginPath();
    ctx.arc(M + 42, 94, 28, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PAPER;
    ctx.font = '800 30px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('C', M + 42, 96);
  }

  ctx.font = '800 36px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = NAVY;
  ctx.fillText('Campus', M + 84, 95);
  ctx.fillStyle = PINK;
  ctx.fillText('Market', M + 84 + campusW, 95);
}

/** The brand panel a frame falls back to when the listing has no photo. */
function photoFallback(logo: HTMLImageElement | null) {
  return (ctx: CanvasRenderingContext2D, frame: Frame) => {
    const wash = ctx.createLinearGradient(frame.x, frame.y, frame.x + frame.w, frame.y + frame.h);
    wash.addColorStop(0, VIOLET);
    wash.addColorStop(0.55, PINK);
    wash.addColorStop(1, ORANGE);
    ctx.fillStyle = wash;
    ctx.fillRect(frame.x, frame.y, frame.w, frame.h);
    sparkle(ctx, frame.x + 90, frame.y + 90, 28, PAPER, 0.85);
    sparkle(ctx, frame.x + frame.w - 110, frame.y + frame.h - 150, 20, YELLOW, 0.9);
    if (logo) {
      ctx.save();
      ctx.globalAlpha = 0.3;
      const size = frame.h * 0.7;
      ctx.drawImage(logo, frame.x + (frame.w - size) / 2, frame.y + (frame.h - size) / 2, size, size);
      ctx.restore();
    }
  };
}

export const drawVibrant: QrCardDrawer = (ctx, content, { photo, logo }) => {
  drawBackground(ctx);
  drawWordmark(ctx, logo);

  /* The title is measured before anything is positioned, because how many lines
     it needs decides where the photo frame ends. */
  ctx.font = `800 ${TITLE_SIZE}px system-ui, sans-serif`;
  const titleLines = wrap(ctx, content.title, CARD_W - M * 2, 2);
  const firstTitleBaseline = TITLE_LAST_BASELINE - (titleLines.length - 1) * TITLE_LEAD;

  const frame: Frame = {
    x: M,
    y: PHOTO_TOP,
    w: CARD_W - M * 2,
    h: firstTitleBaseline - TITLE_SIZE - 26 - PHOTO_TOP,
    radius: 44,
  };

  // The print: a white border and a deep shadow, so it reads as stuck on.
  ctx.save();
  ctx.shadowColor = 'rgba(21,10,61,0.5)';
  ctx.shadowBlur = 50;
  ctx.shadowOffsetY = 22;
  ctx.fillStyle = PAPER;
  roundRect(ctx, frame.x, frame.y, frame.w, frame.h, frame.radius);
  ctx.fill();
  ctx.restore();

  const BORDER = 14;
  drawPhoto(ctx, photo, {
    x: frame.x + BORDER,
    y: frame.y + BORDER,
    w: frame.w - BORDER * 2,
    h: frame.h - BORDER * 2,
    radius: frame.radius - 12,
  }, {
    backdrop: 'wash',
    base: '#1b1140',
    veil: 'rgba(21,10,61,0.3)',
    scrim: { color: 'rgba(21,10,61,0.72)', height: 190 },
    fallback: photoFallback(logo),
  });

  // ── Eyebrow, on the photo's top-left corner ───────────────────────────
  if (content.eyebrow) {
    chip(ctx, content.eyebrow.toUpperCase(), frame.x + 34, frame.y + 60, {
      bg: 'rgba(21,10,61,0.62)',
      fg: YELLOW,
      font: '800 26px system-ui, sans-serif',
      h: 50,
      padding: 22,
    });
  }

  // ── Chips, riding the bottom edge of the photo ────────────────────────
  const chipColors: Array<[string, string]> = [[YELLOW, NAVY], [MINT, NAVY], [PAPER, NAVY]];
  let chipX = frame.x + 34;
  (content.chips ?? []).slice(0, 3).forEach((text, i) => {
    const [bg, fg] = chipColors[i % chipColors.length];
    chipX += chip(ctx, text, chipX, frame.y + frame.h - 54, {
      bg, fg, font: '700 28px system-ui, sans-serif', shadow: true,
    }) + 14;
  });

  /* ── Discount burst ───────────────────────────────────────────────────
     Centred on the frame's corner rather than inside it, so it reads as stuck
     on the edge and takes a bite out of the photo instead of a mouthful - the
     photo being whole is the point of the frame. */
  if (content.discountPercent && content.discountPercent > 0) {
    const bx = frame.x + frame.w - 24;
    const by = frame.y + 10;
    ctx.save();
    ctx.translate(bx, by);
    ctx.rotate(0.2);
    ctx.shadowColor = 'rgba(21,10,61,0.45)';
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 10;
    ctx.fillStyle = YELLOW;
    burst(ctx, 0, 0, 94, 78, 18);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = PINK;
    ctx.font = '900 48px system-ui, sans-serif';
    ctx.fillText(`${content.discountPercent}%`, 0, -10);
    ctx.fillStyle = NAVY;
    ctx.font = '800 26px system-ui, sans-serif';
    ctx.fillText('OFF', 0, 26);
    ctx.restore();
  }

  // ── Title ─────────────────────────────────────────────────────────────
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `800 ${TITLE_SIZE}px system-ui, sans-serif`;
  ctx.save();
  ctx.shadowColor = 'rgba(21,10,61,0.4)';
  ctx.shadowBlur = 16;
  ctx.shadowOffsetY = 4;
  ctx.fillStyle = PAPER;
  titleLines.forEach((line, i) => {
    ctx.fillText(line, M, firstTitleBaseline + i * TITLE_LEAD);
  });
  ctx.restore();

  // ── Price: a tilted yellow sticker ────────────────────────────────────
  ctx.font = '900 84px system-ui, sans-serif';
  const priceW = ctx.measureText(content.price).width + 64;
  const pcx = M + priceW / 2;
  const pcy = PRICE_TOP + PRICE_H / 2;

  ctx.save();
  ctx.translate(pcx, pcy);
  ctx.rotate(-0.035);
  ctx.shadowColor = 'rgba(21,10,61,0.45)';
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 10;
  ctx.fillStyle = YELLOW;
  roundRect(ctx, -priceW / 2, -PRICE_H / 2, priceW, PRICE_H, 30);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = NAVY;
  ctx.font = '900 84px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(content.price, 0, 4);
  ctx.restore();

  if (content.compareAtPrice) {
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.font = '600 40px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    const wasX = M + priceW + 28;
    const wasY = pcy + 14;
    ctx.fillText(content.compareAtPrice, wasX, wasY);
    const wasWidth = ctx.measureText(content.compareAtPrice).width;
    ctx.strokeStyle = PAPER;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(wasX - 4, wasY - 14);
    ctx.lineTo(wasX + wasWidth + 4, wasY - 14);
    ctx.stroke();
  }

  // ── The ticket ────────────────────────────────────────────────────────
  const tw = CARD_W - M * 2;
  ctx.save();
  ctx.shadowColor = 'rgba(21,10,61,0.5)';
  ctx.shadowBlur = 50;
  ctx.shadowOffsetY = 18;
  ctx.fillStyle = PAPER;
  roundRect(ctx, M, TICKET_TOP, tw, TICKET_H, 52);
  ctx.fill();
  ctx.restore();

  // A candy-stripe gradient cap along the top edge of the ticket.
  ctx.save();
  roundRect(ctx, M, TICKET_TOP, tw, TICKET_H, 52);
  ctx.clip();
  const cap = ctx.createLinearGradient(M, 0, M + tw, 0);
  cap.addColorStop(0, ORANGE);
  cap.addColorStop(0.5, PINK);
  cap.addColorStop(1, VIOLET);
  ctx.fillStyle = cap;
  ctx.fillRect(M, TICKET_TOP, tw, 14);
  ctx.restore();

  const qrX = M + 22;
  const qrY = TICKET_TOP + 14 + (TICKET_H - 14 - QR_BOX) / 2;
  drawQr(ctx, content.url, { x: qrX, y: qrY, size: QR_BOX }, logo, { ring: PINK });

  // Text column, centred on the ticket's own middle.
  const textX = qrX + QR_BOX + 30;
  const textW = CARD_W - M - 36 - textX;
  const middle = TICKET_TOP + 14 + (TICKET_H - 14) / 2;

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = INK;
  ctx.font = '800 50px system-ui, sans-serif';
  ctx.fillText('Scan to grab it', textX, middle - 24);

  ctx.fillStyle = MUTED;
  ctx.font = '500 28px system-ui, sans-serif';
  ctx.fillText('Point any camera at the code', textX, middle + 20);

  /* The URL in a gradient pill, one line, truncated from the tail: the domain
     is the only part a reader uses, so it must never be wrapped. */
  ctx.font = '700 26px system-ui, sans-serif';
  const urlText = fitOneLine(ctx, content.prettyUrl, textW - 40);
  const urlPillW = Math.min(textW, ctx.measureText(urlText).width + 40);
  const pillGrad = ctx.createLinearGradient(textX, 0, textX + urlPillW, 0);
  pillGrad.addColorStop(0, NAVY);
  pillGrad.addColorStop(1, VIOLET);
  ctx.fillStyle = pillGrad;
  roundRect(ctx, textX, middle + 46, urlPillW, 52, 26);
  ctx.fill();
  ctx.fillStyle = PAPER;
  ctx.textBaseline = 'middle';
  ctx.fillText(urlText, textX + 20, middle + 73);

  // ── Footer ────────────────────────────────────────────────────────────
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.font = '700 26px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(TAGLINE, CARD_W / 2, 1322);
};
