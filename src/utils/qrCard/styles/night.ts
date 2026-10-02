/**
 * Night: the poster for a feed that is already dark.
 *
 * <p>Near-black, with two soft glows and neon edges. The hard constraint is the
 * one thing that cannot go dark: a QR needs a light field and a quiet border, so
 * the code sits on its own white plate here rather than being inverted. Inverted
 * codes do scan on some phones, which is exactly the problem - "some".
 */

import {
  ABYSS, CARD_H, CARD_W, INK, MARGIN, MINT, NAVY, PAPER, PINK, SLATE, TAGLINE, VIOLET,
  type QrCardDrawer,
} from '../card';
import { chip, drawPhoto, fitOneLine, roundRect, sparkle, wrap, type Frame } from '../canvas';
import { drawQr } from '../qr';

const M = MARGIN;

/* The same skeleton as the vibrant style, so the two feel like one product. */
const PHOTO_TOP = 152;
const TITLE_SIZE = 62;
const TITLE_LEAD = 72;
const TITLE_LAST_BASELINE = 810;
const PRICE_TOP = 838;
const PRICE_H = 104;
const PANEL_TOP = 972;
const PANEL_H = 300;
const QR_BOX = 226;
const QR_PAD = 18;

function drawNightBackground(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = ABYSS;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  const glow = (x: number, y: number, r: number, color: string, alpha: number) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(7,11,28,0)');
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
    ctx.restore();
  };
  glow(CARD_W - 60, 80, 560, VIOLET, 0.75);
  glow(40, 1240, 520, MINT, 0.28);
  glow(CARD_W / 2, 700, 520, PINK, 0.14);

  /* Scan lines. Faint enough to read as texture rather than stripes, and they
     stop above the panel so the code's surroundings stay plain. */
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.035)';
  ctx.lineWidth = 1;
  for (let y = 0; y < PANEL_TOP - 30; y += 8) {
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(CARD_W, y + 0.5);
    ctx.stroke();
  }
  ctx.restore();

  sparkle(ctx, 980, 660, 20, MINT, 0.7);
  sparkle(ctx, 70, 620, 14, VIOLET, 0.9);
  sparkle(ctx, 930, 128, 12, PAPER, 0.5);
}

export const drawNight: QrCardDrawer = (ctx, content, { photo, logo }) => {
  drawNightBackground(ctx);

  // ── Wordmark, no plate: on this background white type is enough ────────
  if (logo) {
    ctx.drawImage(logo, M, 56, 58, 58);
  }
  const nameX = logo ? M + 74 : M;
  ctx.font = '800 38px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = PAPER;
  ctx.fillText('Campus', nameX, 86);
  ctx.fillStyle = MINT;
  ctx.fillText('Market', nameX + ctx.measureText('Campus').width, 86);

  // ── Title first, so the photo frame can take what is left ─────────────
  ctx.font = `800 ${TITLE_SIZE}px system-ui, sans-serif`;
  const titleLines = wrap(ctx, content.title, CARD_W - M * 2, 2);
  const titleFirst = TITLE_LAST_BASELINE - (titleLines.length - 1) * TITLE_LEAD;

  const frame: Frame = {
    x: M,
    y: PHOTO_TOP,
    w: CARD_W - M * 2,
    h: titleFirst - TITLE_SIZE - 26 - PHOTO_TOP,
    radius: 40,
  };

  ctx.save();
  ctx.shadowColor = 'rgba(123,44,255,0.55)';
  ctx.shadowBlur = 60;
  ctx.shadowOffsetY = 16;
  ctx.fillStyle = SLATE;
  roundRect(ctx, frame.x, frame.y, frame.w, frame.h, frame.radius);
  ctx.fill();
  ctx.restore();

  drawPhoto(ctx, photo, frame, {
    backdrop: 'wash',
    base: SLATE,
    /* Darker than the other styles' veils: on a near-black card the fitted
       photo should be the only bright thing, and its own blur behind it would
       otherwise read as a second light source. */
    veil: 'rgba(7,11,28,0.58)',
    scrim: { color: 'rgba(7,11,28,0.85)', height: 180 },
    border: { color: 'rgba(92,242,192,0.45)', width: 2 },
    fallback: (c, f) => {
      const wash = c.createLinearGradient(f.x, f.y, f.x + f.w, f.y + f.h);
      wash.addColorStop(0, '#171042');
      wash.addColorStop(1, SLATE);
      c.fillStyle = wash;
      c.fillRect(f.x, f.y, f.w, f.h);
      if (logo) {
        c.save();
        c.globalAlpha = 0.22;
        const size = f.h * 0.66;
        c.drawImage(logo, f.x + (f.w - size) / 2, f.y + (f.h - size) / 2, size, size);
        c.restore();
      }
    },
  });

  if (content.eyebrow) {
    chip(ctx, content.eyebrow.toUpperCase(), frame.x + 30, frame.y + 56, {
      bg: 'rgba(7,11,28,0.72)',
      fg: MINT,
      font: '800 26px system-ui, sans-serif',
      h: 50,
      padding: 22,
      border: 'rgba(92,242,192,0.5)',
    });
  }

  let chipX = frame.x + 30;
  (content.chips ?? []).slice(0, 3).forEach((text) => {
    chipX += chip(ctx, text, chipX, frame.y + frame.h - 52, {
      bg: 'rgba(255,255,255,0.14)',
      fg: PAPER,
      font: '700 28px system-ui, sans-serif',
      border: 'rgba(255,255,255,0.22)',
    }) + 14;
  });

  if (content.discountPercent && content.discountPercent > 0) {
    const cx = frame.x + frame.w - 40;
    const cy = frame.y + 40;
    ctx.save();
    ctx.shadowColor = PINK;
    ctx.shadowBlur = 40;
    ctx.fillStyle = PINK;
    ctx.beginPath();
    ctx.arc(cx, cy, 78, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = PAPER;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '900 50px system-ui, sans-serif';
    ctx.fillText(`${content.discountPercent}%`, cx, cy - 12);
    ctx.font = '800 26px system-ui, sans-serif';
    ctx.fillText('OFF', cx, cy + 26);
  }

  // ── Title ─────────────────────────────────────────────────────────────
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `800 ${TITLE_SIZE}px system-ui, sans-serif`;
  ctx.fillStyle = PAPER;
  titleLines.forEach((line, i) => {
    ctx.fillText(line, M, titleFirst + i * TITLE_LEAD);
  });

  // ── Price: a neon outline rather than a fill ───────────────────────────
  ctx.font = '900 84px system-ui, sans-serif';
  const priceW = ctx.measureText(content.price).width + 68;
  ctx.save();
  ctx.shadowColor = 'rgba(92,242,192,0.5)';
  ctx.shadowBlur = 34;
  ctx.fillStyle = 'rgba(92,242,192,0.12)';
  roundRect(ctx, M, PRICE_TOP, priceW, PRICE_H, 30);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = MINT;
  ctx.lineWidth = 4;
  roundRect(ctx, M + 2, PRICE_TOP + 2, priceW - 4, PRICE_H - 4, 28);
  ctx.stroke();
  ctx.fillStyle = MINT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(content.price, M + priceW / 2, PRICE_TOP + PRICE_H / 2 + 4);

  if (content.compareAtPrice) {
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.font = '600 40px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    const wasX = M + priceW + 28;
    const wasY = PRICE_TOP + PRICE_H / 2 + 14;
    ctx.fillText(content.compareAtPrice, wasX, wasY);
    const wasWidth = ctx.measureText(content.compareAtPrice).width;
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(wasX - 4, wasY - 14);
    ctx.lineTo(wasX + wasWidth + 4, wasY - 14);
    ctx.stroke();
  }

  // ── The panel, and the code on its white plate ────────────────────────
  const pw = CARD_W - M * 2;
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  roundRect(ctx, M, PANEL_TOP, pw, PANEL_H, 48);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.16)';
  ctx.lineWidth = 2;
  roundRect(ctx, M + 1, PANEL_TOP + 1, pw - 2, PANEL_H - 2, 47);
  ctx.stroke();

  const plate = QR_BOX + QR_PAD * 2;
  const qrX = M + 22 + QR_PAD;
  const qrY = PANEL_TOP + (PANEL_H - plate) / 2 + QR_PAD;
  drawQr(ctx, content.url, { x: qrX, y: qrY, size: QR_BOX }, logo, {
    ink: INK,
    eye: NAVY,
    ring: VIOLET,
    plate: { fill: PAPER, radius: 26, pad: QR_PAD },
  });

  const textX = qrX + QR_BOX + QR_PAD + 30;
  const textW = CARD_W - M - 36 - textX;
  const middle = PANEL_TOP + PANEL_H / 2;

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = PAPER;
  ctx.font = '800 48px system-ui, sans-serif';
  ctx.fillText('Scan to grab it', textX, middle - 24);

  ctx.fillStyle = 'rgba(255,255,255,0.62)';
  ctx.font = '500 26px system-ui, sans-serif';
  ctx.fillText('Point any camera at the code', textX, middle + 18);

  ctx.font = '700 26px system-ui, sans-serif';
  const urlText = fitOneLine(ctx, content.prettyUrl, textW - 40);
  const urlPillW = Math.min(textW, ctx.measureText(urlText).width + 40);
  ctx.fillStyle = MINT;
  roundRect(ctx, textX, middle + 44, urlPillW, 52, 26);
  ctx.fill();
  ctx.fillStyle = ABYSS;
  ctx.textBaseline = 'middle';
  ctx.fillText(urlText, textX + 20, middle + 71);

  // ── Footer ────────────────────────────────────────────────────────────
  ctx.fillStyle = 'rgba(255,255,255,0.72)';
  ctx.font = '600 26px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(TAGLINE, CARD_W / 2, 1322);
};
