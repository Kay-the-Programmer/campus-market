/**
 * Classic: the standard CampusMarket flyer, and the default.
 *
 * <p>A port of the designed poster (campusmarket_auto_listing_poster.html) from
 * HTML to canvas, because sharing needs a PNG and a page cannot hand one over.
 * Every measurement here was read off that document's own layout - the margins,
 * the pill sizes, the card and QR columns, the benefit grid, the two elliptical
 * bands at the foot - so the two render the same poster. Where a number looks
 * arbitrary, it is the design's.
 *
 * <p>Three deliberate departures, all forced:
 * <ul>
 * <li>The photo is fitted whole rather than cropped to the box. The original
 *     used object-fit:cover, which cuts the top and bottom off a portrait phone
 *     photo - the one thing a listing poster must not do.</li>
 * <li>A long title takes a second line and the photo gives up exactly that line
 *     of height, so the card's content still ends where the design ends it. The
 *     original's title was one line of sample text; real ones are longer.</li>
 * <li>The graduation cap at bottom right is left out. It is in the markup, but
 *     with no z-index of its own it renders underneath the navy footer, so it
 *     does not appear in the design as drawn.</li>
 * </ul>
 */

import { POSTER_SIZE } from '../../qrCardStyles';
import { type QrCardDrawer } from '../card';
import {
  drawPhoto, fillTracked, fitContain, fitOneLine, measureTracked, roundRect, wrap,
  type Frame,
} from '../canvas';
import { drawQr } from '../qr';

const W = POSTER_SIZE.w;
const H = POSTER_SIZE.h;

/* The poster's own palette. Deeper and warmer than the app's navy and orange,
   and not interchangeable with them: these two are what the printed design is. */
const NAVY = '#1B2A4A';
const ORANGE = '#F5901E';
const WHITE = '#ffffff';
const DETAIL = '#303a4d';
const CARD_EDGE = '#f1f4f8';
const PHOTO_BASE = '#edf1f5';
const ICON_BG = '#f1f4f9';
const ICON_BG_FIRST = '#fff2e5';
const SEPARATOR = '#dce2eb';

const FONT = 'Arial, Helvetica, sans-serif';

const CONTENT_X = 76;
const CONTENT_W = W - CONTENT_X * 2;
const CENTER = W / 2;

/** The card column, and the fixed rows inside it. */
const CARD = { x: 76, y: 581.7, w: 475.2, h: 550.6 };
const CARD_PAD_X = 37; // 13px border + 24px padding
const INNER_X = CARD.x + CARD_PAD_X;
const INNER_W = CARD.w - CARD_PAD_X * 2;
const PHOTO_Y = CARD.y + 25;
const NAME_SIZE = 31;
const NAME_LEAD = 35.65;
const NAME_BOTTOM = 941.35;
const DETAILS_MID = 958.3;
const PRICE_Y = 986.3;
const PRICE_H = 60;
const LOCATION_MID = 1079.3;

/** The QR column. */
const QRBOX = { x: 582.2, y: 581.7, w: 365.8, h: 550.6 };
const QRWRAP = { x: 607.6, y: 659.7, size: 315 };
const QRCODE = { x: 624.6, y: 676.7, size: 281 };

const BENEFITS_Y = 1159.3;
const BENEFITS_H = 139;
const COL_W = 212;
const COL_STEP = 220;

const BENEFITS: Array<[string, string, string]> = [
  ['✓', 'Safe & Trusted', 'Transactions'],
  ['●●●', 'Connect with', 'Students'],
  ['🤝', 'Buy, Sell &', 'Trade Easily'],
  ['●', 'Right Here', 'on Campus'],
];

/** Tracked text, centred on `cx`. */
function centredTracked(
  ctx: CanvasRenderingContext2D, text: string, cx: number, y: number, tracking: number,
) {
  fillTracked(ctx, text, cx - measureTracked(ctx, text, tracking) / 2, y, tracking);
}

/**
 * The two corner ornaments: a navy disc with an orange one behind it, offset.
 *
 * <p>In the design they are a circle and its own box-shadow, which paints
 * underneath - hence the orange first here.
 */
function drawCorners(ctx: CanvasRenderingContext2D) {
  const disc = (cx: number, cy: number, r: number, color: string) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  };
  // Top left: 285px circle at (-175, -165), shadow offset (52, 42).
  disc(19.5, 19.5, 142.5, ORANGE);
  disc(-32.5, -22.5, 142.5, NAVY);
  // Top right: 155px circle at (921, -63), shadow offset (-20, 58).
  disc(978.5, 72.5, 77.5, ORANGE);
  disc(998.5, 14.5, 77.5, NAVY);
}

/** Logo and wordmark, centred as one group. */
function drawBrand(ctx: CanvasRenderingContext2D, logo: HTMLImageElement | null) {
  ctx.font = `800 60px ${FONT}`;
  const tracking = -3;
  const campusW = measureTracked(ctx, 'Campus', tracking);
  const marketW = measureTracked(ctx, 'Market', tracking);
  const logoSpace = logo ? 106 + 17 : 0;
  let x = CENTER - (logoSpace + campusW + marketW) / 2;

  if (logo) {
    const fitted = fitContain(logo.width, logo.height, 106, 106);
    ctx.drawImage(
      logo, x + (106 - fitted.w) / 2, 58 + (106 - fitted.h) / 2, fitted.w, fitted.h,
    );
    x += logoSpace;
  }

  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = NAVY;
  x += fillTracked(ctx, 'Campus', x, 111, tracking);
  ctx.fillStyle = ORANGE;
  fillTracked(ctx, 'Market', x, 111, tracking);
}

/** The two rotated banner pills. */
function drawHeadline(ctx: CanvasRenderingContext2D) {
  const PILL_H = 94;
  const PAD = 37;
  const BOX_X = 122;
  const BOX_W = 780;

  ctx.save();
  // The design tilts the pair about the middle of their own block.
  ctx.translate(CENTER, 335);
  ctx.rotate((-2.5 * Math.PI) / 180);
  ctx.translate(-CENTER, -335);

  ctx.font = `900 58px ${FONT}`;
  const pill = (text: string, top: number, bg: string, nudge: number) => {
    const w = ctx.measureText(text).width + PAD * 2;
    // `nudge` is the design's negative right margin on the first pill, which
    // shifts how the line centres without changing the pill itself.
    const x = BOX_X + (BOX_W - (w + nudge)) / 2;

    ctx.save();
    ctx.shadowColor = 'rgba(27,42,74,0.12)';
    ctx.shadowBlur = 20;
    ctx.shadowOffsetY = 8;
    ctx.fillStyle = bg;
    roundRect(ctx, x, top, w, PILL_H, 15);
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = WHITE;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + w / 2, top + 17 + 29);
  };
  pill('Check Out', 241, NAVY, -12);
  pill('This Listing!', 335, ORANGE, 0);
  ctx.restore();
}

/**
 * The curved arrow pointing at the code.
 *
 * <p>Both pieces are the right and bottom borders of a box, which is why the
 * stroke is a path rather than a shape. The sizes are 7px larger than the
 * design's declared widths on purpose: the stylesheet sets box-sizing on `*`,
 * and `*` does not match pseudo-elements, so these two keep the default
 * content-box and their borders sit outside the width they are given. Reading
 * it the other way puts the whole flourish 7px off.
 */
function drawArrow(ctx: CanvasRenderingContext2D) {
  ctx.save();
  ctx.translate(894 + 41, 570 + 50);
  ctx.rotate((13 * Math.PI) / 180);
  ctx.translate(-41, -50);

  ctx.strokeStyle = ORANGE;
  ctx.lineWidth = 7;
  ctx.lineCap = 'butt';
  // 78px of content plus two 7px borders, with the bottom-right corner rounded
  // to 55px - so the stroke's own centre line turns on a radius of 51.5.
  ctx.beginPath();
  ctx.moveTo(81.5, 0);
  ctx.arcTo(81.5, 81.5, 30, 81.5, 51.5);
  ctx.lineTo(0, 81.5);
  ctx.stroke();

  // The head: the same two borders on a 29px box at the arrow's bottom right,
  // turned on its corner.
  ctx.translate(66.5, 84.5);
  ctx.rotate((-45 * Math.PI) / 180);
  ctx.beginPath();
  ctx.moveTo(11, -14.5);
  ctx.lineTo(11, 11);
  ctx.lineTo(-14.5, 11);
  ctx.stroke();
  ctx.restore();
}

function drawBenefits(ctx: CanvasRenderingContext2D) {
  BENEFITS.forEach(([glyph, line1, line2], i) => {
    const colX = CONTENT_X + i * COL_STEP;
    const cx = colX + COL_W / 2;

    ctx.fillStyle = i === 0 ? ICON_BG_FIRST : ICON_BG;
    ctx.beginPath();
    ctx.arc(cx, 1163.3 + 38, 38, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = NAVY;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `900 35px ${FONT}`;
    ctx.fillText(glyph, cx, 1163.3 + 40);

    ctx.font = `900 18px ${FONT}`;
    ctx.fillText(line1, cx, 1249.3 + 11.25);
    ctx.fillText(line2, cx, 1249.3 + 33.75);

    if (i < BENEFITS.length - 1) {
      ctx.strokeStyle = SEPARATOR;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(colX + COL_W - 1, BENEFITS_Y);
      ctx.lineTo(colX + COL_W - 1, BENEFITS_Y + BENEFITS_H);
      ctx.stroke();
    }
  });
}

/**
 * The foot: an orange band and a navy one, each an ellipse showing through a
 * strip. The orange goes down first and the navy covers most of it, which is
 * what leaves the thin crescent along the top.
 */
function drawFooter(ctx: CanvasRenderingContext2D) {
  const band = (
    clip: [number, number, number, number], cx: number, cy: number,
    rx: number, ry: number, color: string,
  ) => {
    ctx.save();
    ctx.beginPath();
    ctx.rect(clip[0], clip[1], clip[2], clip[3]);
    ctx.clip();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };
  band([-51.2, 1345, 1126.4, 34], 489.5, 1379, 585.7, 25.5, ORANGE);
  band([0, 1334, W, 202], 522.24, 1536, 819.2, 181.8, NAVY);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = WHITE;
  ctx.font = 'italic 700 35px "Trebuchet MS", Arial, sans-serif';
  ctx.fillText('Support', 86, 1441.5);
  ctx.fillStyle = ORANGE;
  ctx.font = 'italic 700 38px "Trebuchet MS", Arial, sans-serif';
  ctx.fillText('Fellow Students', 86, 1478.7);
}

/** The map pin beside the location: a disc with one square corner, on its point. */
function drawPin(ctx: CanvasRenderingContext2D, cx: number, cy: number) {
  const r = 23 / 2 - 2;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-Math.PI / 4);
  ctx.beginPath();
  ctx.moveTo(-r, 0);
  ctx.arcTo(-r, -r, 0, -r, r);
  ctx.arcTo(r, -r, r, 0, r);
  ctx.arcTo(r, r, 0, r, r);
  ctx.lineTo(-r, r);
  ctx.closePath();
  ctx.strokeStyle = NAVY;
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.restore();
}

/** The phone outline beside "Scan to View Listing". */
function drawPhone(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.strokeStyle = WHITE;
  ctx.lineWidth = 4;
  roundRect(ctx, x + 2, y + 2, 37 - 4, 53 - 4, 8);
  ctx.stroke();
  ctx.fillStyle = WHITE;
  ctx.beginPath();
  ctx.arc(x + 37 / 2, y + 53 - 8, 3, 0, Math.PI * 2);
  ctx.fill();
}

export const drawClassic: QrCardDrawer = (ctx, content, { photo, logo }) => {
  ctx.fillStyle = WHITE;
  ctx.fillRect(0, 0, W, H);

  drawCorners(ctx);
  drawBrand(ctx, logo);

  ctx.font = `23px ${FONT}`;
  ctx.fillStyle = NAVY;
  ctx.textBaseline = 'middle';
  centredTracked(ctx, 'Buy, sell, and trade with students near you.', CENTER, 185.5, 2);

  drawHeadline(ctx);

  ctx.font = `700 27px ${FONT}`;
  ctx.fillStyle = NAVY;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Scan the QR code to view the full details,', CENTER, 486.2);
  ctx.fillText('price and contact the seller.', CENTER, 524.5);

  // ── The listing card ──────────────────────────────────────────────────
  // A 13px border with a 28px radius is two filled rectangles, which is also
  // how the browser draws one.
  ctx.save();
  ctx.shadowColor = 'rgba(27,42,74,0.07)';
  ctx.shadowBlur = 22;
  ctx.shadowOffsetY = 7;
  ctx.fillStyle = CARD_EDGE;
  roundRect(ctx, CARD.x, CARD.y, CARD.w, CARD.h, 28);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = WHITE;
  roundRect(ctx, CARD.x + 13, CARD.y + 13, CARD.w - 26, CARD.h - 26, 15);
  ctx.fill();

  ctx.font = `900 ${NAME_SIZE}px ${FONT}`;
  const nameLines = wrap(ctx, content.title, INNER_W, 2);
  /* The title grows upward into the photo rather than downward into the rest of
     the card: everything below it is where the design put it. */
  const nameTop = NAME_BOTTOM - nameLines.length * NAME_LEAD;
  const photoFrame: Frame = {
    x: INNER_X,
    y: PHOTO_Y,
    w: INNER_W,
    h: nameTop - 17 - PHOTO_Y,
    radius: 17,
  };

  drawPhoto(ctx, photo, photoFrame, {
    backdrop: 'wash',
    base: PHOTO_BASE,
    veil: 'rgba(255,255,255,0.55)',
    fallback: (c, f) => {
      c.fillStyle = PHOTO_BASE;
      c.fillRect(f.x, f.y, f.w, f.h);
      if (logo) {
        c.save();
        c.globalAlpha = 0.2;
        const size = Math.min(f.h * 0.6, f.w * 0.4);
        c.drawImage(logo, f.x + (f.w - size) / 2, f.y + (f.h - size) / 2, size, size);
        c.restore();
      }
    },
  });

  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = NAVY;
  ctx.font = `900 ${NAME_SIZE}px ${FONT}`;
  nameLines.forEach((line, i) => {
    ctx.fillText(line, INNER_X, nameTop + NAME_LEAD * (i + 0.5));
  });

  const details = content.details
    || (content.chips ?? []).filter((c) => c !== content.location).join(' | ')
    || content.eyebrow
    || '';
  if (details) {
    ctx.font = `21px ${FONT}`;
    ctx.fillStyle = DETAIL;
    ctx.fillText(fitOneLine(ctx, details, INNER_W), INNER_X, DETAILS_MID);
  }

  ctx.font = `900 27px ${FONT}`;
  const priceW = ctx.measureText(content.price).width + 44;
  ctx.fillStyle = ORANGE;
  roundRect(ctx, INNER_X, PRICE_Y, priceW, PRICE_H, 10);
  ctx.fill();
  ctx.fillStyle = WHITE;
  ctx.fillText(content.price, INNER_X + 22, PRICE_Y + PRICE_H / 2);

  /* The was-price is the one thing the design has no slot for, and dropping it
     would misstate an offer. Set beside the pill in the details colour, so it
     adds no new shape to the poster. */
  if (content.compareAtPrice) {
    ctx.font = `21px ${FONT}`;
    const room = INNER_W - priceW - 16;
    if (ctx.measureText(content.compareAtPrice).width <= room) {
      const wasX = INNER_X + priceW + 16;
      const wasY = PRICE_Y + PRICE_H / 2;
      ctx.fillStyle = DETAIL;
      ctx.fillText(content.compareAtPrice, wasX, wasY);
      const wasW = ctx.measureText(content.compareAtPrice).width;
      ctx.strokeStyle = DETAIL;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(wasX - 2, wasY);
      ctx.lineTo(wasX + wasW + 2, wasY);
      ctx.stroke();
    }
  }

  const place = content.location ?? (content.chips ?? [])[1] ?? '';
  if (place) {
    drawPin(ctx, INNER_X + 11.5, LOCATION_MID);
    ctx.font = `800 21px ${FONT}`;
    ctx.fillStyle = NAVY;
    ctx.fillText(fitOneLine(ctx, place, INNER_W - 33), INNER_X + 33, LOCATION_MID);
  }

  // ── The code ──────────────────────────────────────────────────────────
  ctx.fillStyle = ORANGE;
  roundRect(ctx, QRBOX.x, QRBOX.y, QRBOX.w, QRBOX.h, 29);
  ctx.fill();

  ctx.fillStyle = WHITE;
  roundRect(ctx, QRWRAP.x, QRWRAP.y, QRWRAP.size, QRWRAP.size, 19);
  ctx.fill();

  /* Plain black squares, no mark in the middle: the design's code, and the one
     a cheap camera reads fastest. Two modules of quiet zone rather than four,
     because the white tile around it already adds nearly three more. */
  drawQr(ctx, content.url, { x: QRCODE.x, y: QRCODE.y, size: QRCODE.size }, null, {
    shape: 'square',
    ink: '#000000',
    eye: '#000000',
    quiet: 2,
    hole: false,
  });

  ctx.font = `900 28px ${FONT}`;
  const scanLines = ['Scan to View', 'Listing'];
  const scanTextW = Math.max(...scanLines.map((l) => ctx.measureText(l).width));
  const scanX = QRBOX.x + (QRBOX.w - (37 + 14 + scanTextW)) / 2;
  drawPhone(ctx, scanX, 997);
  ctx.fillStyle = WHITE;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  scanLines.forEach((line, i) => {
    ctx.fillText(line, scanX + 51, 992.7 + 30.8 * (i + 0.5));
  });

  drawArrow(ctx);
  drawBenefits(ctx);
  drawFooter(ctx);
};

