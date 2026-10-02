/**
 * Clean: the poster for a printer and a noticeboard.
 *
 * <p>White paper, navy ink, one thin band of brand colour at the top. The
 * reasoning is physical rather than aesthetic: this is the style someone prints
 * on a shared library printer and pins up by a lecture theatre, so it spends as
 * little ink as a poster can, keeps the type black-on-white, and gives the code
 * the largest box on the card - a QR read from two metres away needs size far
 * more than it needs decoration. Square modules for the same reason: they join
 * into solid runs that survive a cheap print and a phone camera at an angle.
 */

import {
  CARD_H, CARD_W, HAIRLINE, INK, MARGIN, MUTED, NAVY, ORANGE, PAPER, PINK, TAGLINE, VIOLET,
  type QrCardDrawer,
} from '../card';
import { chip, drawPhoto, fitOneLine, roundRect, wrap, type Frame } from '../canvas';
import { drawQr } from '../qr';

const M = MARGIN;

/*
 * Fixed anchors, laid out from the bottom edge upward; the photo frame takes
 * whatever the title leaves, so a two-word listing gets a taller picture.
 */
const PHOTO_TOP = 146;
const TITLE_SIZE = 56;
const TITLE_LEAD = 66;
const PRICE_SIZE = 80;
const PRICE_BASELINE = 886;
const DIVIDER_Y = 922;
const QR_BOX = 296;
const QR_TOP = 958;

/** The paper, the brand band, and a hairline so the edge is visible when printed. */
function drawPaper(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  const band = ctx.createLinearGradient(0, 0, CARD_W, 0);
  band.addColorStop(0, ORANGE);
  band.addColorStop(0.5, PINK);
  band.addColorStop(1, VIOLET);
  ctx.fillStyle = band;
  ctx.fillRect(0, 0, CARD_W, 10);

  ctx.strokeStyle = HAIRLINE;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(0.75, 0.75, CARD_W - 1.5, CARD_H - 1.5);
}

export const drawClean: QrCardDrawer = (ctx, content, { photo, logo }) => {
  drawPaper(ctx);

  // ── Header: wordmark left, category right ─────────────────────────────
  if (logo) {
    ctx.drawImage(logo, M, 54, 56, 56);
  }
  const nameX = logo ? M + 70 : M;
  ctx.font = '800 36px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = NAVY;
  ctx.fillText('Campus', nameX, 83);
  ctx.fillStyle = PINK;
  ctx.fillText('Market', nameX + ctx.measureText('Campus').width, 83);

  if (content.eyebrow) {
    const label = content.eyebrow.toUpperCase();
    ctx.font = '800 24px system-ui, sans-serif';
    const pillW = ctx.measureText(label).width + 44;
    chip(ctx, label, CARD_W - M - pillW, 83, {
      bg: '#eef3ff',
      fg: NAVY,
      font: '800 24px system-ui, sans-serif',
      h: 46,
      padding: 22,
    });
  }

  // ── Title, measured first so the photo can take the rest ──────────────
  ctx.font = `800 ${TITLE_SIZE}px system-ui, sans-serif`;
  const titleLines = wrap(ctx, content.title, CARD_W - M * 2, 2);
  const titleLast = PRICE_BASELINE - PRICE_SIZE - 20;
  const titleFirst = titleLast - (titleLines.length - 1) * TITLE_LEAD;

  const frame: Frame = {
    x: M,
    y: PHOTO_TOP,
    w: CARD_W - M * 2,
    h: titleFirst - TITLE_SIZE - 28 - PHOTO_TOP,
    radius: 32,
  };

  drawPhoto(ctx, photo, frame, {
    backdrop: 'wash',
    base: '#f3f6fd',
    /* A pale veil over the wash, not a dark one: the point of this style is
       that it survives a printer, and the letterboxing has to stay light. */
    veil: 'rgba(255,255,255,0.62)',
    border: { color: HAIRLINE, width: 2 },
    fallback: (c, f) => {
      c.fillStyle = '#f3f6fd';
      c.fillRect(f.x, f.y, f.w, f.h);
      if (logo) {
        c.save();
        c.globalAlpha = 0.16;
        const size = f.h * 0.6;
        c.drawImage(logo, f.x + (f.w - size) / 2, f.y + (f.h - size) / 2, size, size);
        c.restore();
      }
    },
  });

  if (content.discountPercent && content.discountPercent > 0) {
    // A flat tag rather than a starburst: one colour, square edges, no shadow.
    const label = `${content.discountPercent}% OFF`;
    ctx.font = '800 30px system-ui, sans-serif';
    const tagW = ctx.measureText(label).width + 48;
    chip(ctx, label, frame.x + frame.w - 26 - tagW, frame.y + 46, {
      bg: PINK,
      fg: PAPER,
      font: '800 30px system-ui, sans-serif',
      h: 56,
      radius: 14,
      padding: 24,
    });
  }

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `800 ${TITLE_SIZE}px system-ui, sans-serif`;
  ctx.fillStyle = INK;
  titleLines.forEach((line, i) => {
    ctx.fillText(line, M, titleFirst + i * TITLE_LEAD);
  });

  // ── Price row: price left, the facts right ────────────────────────────
  ctx.font = `900 ${PRICE_SIZE}px system-ui, sans-serif`;
  ctx.fillStyle = NAVY;
  ctx.fillText(content.price, M, PRICE_BASELINE);
  let afterPrice = M + ctx.measureText(content.price).width + 24;

  if (content.compareAtPrice) {
    ctx.font = '600 36px system-ui, sans-serif';
    ctx.fillStyle = MUTED;
    ctx.fillText(content.compareAtPrice, afterPrice, PRICE_BASELINE - 6);
    const w = ctx.measureText(content.compareAtPrice).width;
    ctx.strokeStyle = MUTED;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(afterPrice - 3, PRICE_BASELINE - 18);
    ctx.lineTo(afterPrice + w + 3, PRICE_BASELINE - 18);
    ctx.stroke();
    afterPrice += w + 24;
  }

  /* The facts are set against the right margin on the price's own row, which is
     the only horizontal space this layout has going spare - spending a line of
     its own on them would come straight out of the photo. */
  const facts = (content.chips ?? []).slice(0, 2);
  ctx.textAlign = 'right';
  ctx.font = '600 28px system-ui, sans-serif';
  ctx.fillStyle = MUTED;
  // One fact sits on the price's own line; two straddle it.
  const factTop = facts.length > 1 ? PRICE_BASELINE - 40 : PRICE_BASELINE - 18;
  facts.forEach((text, i) => {
    const line = fitOneLine(ctx, text, CARD_W - M - afterPrice - 20);
    ctx.fillText(line, CARD_W - M, factTop + i * 40);
  });
  ctx.textAlign = 'left';

  ctx.strokeStyle = HAIRLINE;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(M, DIVIDER_Y);
  ctx.lineTo(CARD_W - M, DIVIDER_Y);
  ctx.stroke();

  // ── The code, as large as the page allows ─────────────────────────────
  const qrX = CARD_W - M - QR_BOX;
  drawQr(ctx, content.url, { x: qrX, y: QR_TOP, size: QR_BOX }, logo, {
    shape: 'square',
    ink: INK,
    eye: NAVY,
  });

  const textW = qrX - M - 36;
  const middle = QR_TOP + QR_BOX / 2;

  ctx.fillStyle = INK;
  ctx.font = '800 46px system-ui, sans-serif';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('Scan to grab it', M, middle - 40);

  ctx.fillStyle = MUTED;
  ctx.font = '500 28px system-ui, sans-serif';
  ctx.fillText('Point any camera at the code', M, middle + 4);

  ctx.font = '700 26px system-ui, sans-serif';
  const urlText = fitOneLine(ctx, content.prettyUrl, textW - 40);
  const urlPillW = Math.min(textW, ctx.measureText(urlText).width + 40);
  ctx.fillStyle = NAVY;
  roundRect(ctx, M, middle + 26, urlPillW, 52, 26);
  ctx.fill();
  ctx.fillStyle = PAPER;
  ctx.textBaseline = 'middle';
  ctx.fillText(urlText, M + 20, middle + 53);

  // ── Footer ────────────────────────────────────────────────────────────
  ctx.fillStyle = MUTED;
  ctx.font = '600 24px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(TAGLINE, CARD_W / 2, 1306);
};
