import QRCode from 'qrcode';

/**
 * Draws the shareable QR card for a listing.
 *
 * <p>Redesigned to be the kind of thing people post to a Status or a story
 * rather than merely forward: a saturated sunset gradient, a tilted
 * polaroid-style photo, sticker-shaped price and discount badges, and the
 * code on a clean white ticket at the foot. Loud on purpose - it has to win a
 * scroll - but the one thing that must stay boring is the QR, which keeps
 * dark modules on pure white with a full quiet zone so it still scans first
 * time.
 *
 * <p>Drawn to a canvas because sharing needs a PNG file.
 */

/** Portrait, at the aspect ratio WhatsApp previews without cropping. */
export const CARD_W = 1080;
export const CARD_H = 1350;

const M = 72;

/*
 * Palette. ORANGE and NAVY are still the logo's own colours; the gradient
 * runs from the logo orange through hot pink and violet and lands on the logo
 * navy, so the card is loud but still recognisably the brand. YELLOW and MINT
 * are sticker colours - small doses only.
 */
const ORANGE = '#ff9600';
const PINK = '#ff2e7e';
const VIOLET = '#7b2cff';
const NAVY = '#092a6c';
const INK = '#150a3d';
const PAPER = '#ffffff';
const YELLOW = '#ffe14d';
const MINT = '#5cf2c0';
const MUTED = '#6a7391';

const LOGO_SRC = '/images/logo.png';

/** Layout anchors. */
const PHOTO_X = M;
const PHOTO_Y = 168;
const PHOTO_W = CARD_W - M * 2;
const PHOTO_H = 450;
const PRICE_TOP = 832;
const PRICE_H = 108;
const TICKET_TOP = 972;
const TICKET_H = 312;

export interface QrCardContent {
  title: string;
  /** Pre-formatted, so the card cannot disagree with the page about currency. */
  price: string;
  /** Struck through beside the price when there is a real reduction. */
  compareAtPrice?: string;
  /** Drives the corner burst. Whole percent. */
  discountPercent?: number;
  /** Shown under the code. The full URL is what the code itself carries. */
  prettyUrl: string;
  /** The listing's photo. Omitted or unreachable is fine - see drawPhoto. */
  imageUrl?: string;
  /** What the code encodes. */
  url: string;
  /** Short facts as chips over the photo: condition, campus zone. */
  chips?: string[];
  /** Small label above the title - the category. */
  eyebrow?: string;
}

/** Rounded rectangle path, since Safari still lacks roundRect in some versions. */
function roundRect(
  ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number,
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

/** A four-point sparkle, the cheapest way to make a flat gradient feel alive. */
function sparkle(
  ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string, alpha = 1,
) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx, cy - r);
  ctx.quadraticCurveTo(cx, cy, cx + r, cy);
  ctx.quadraticCurveTo(cx, cy, cx, cy + r);
  ctx.quadraticCurveTo(cx, cy, cx - r, cy);
  ctx.quadraticCurveTo(cx, cy, cx, cy - r);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** A starburst badge path: `points` spikes between two radii. */
function burst(
  ctx: CanvasRenderingContext2D, cx: number, cy: number, outer: number, inner: number, points: number,
) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i += 1) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (Math.PI * i) / points - Math.PI / 2;
    const px = cx + Math.cos(a) * r;
    const py = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

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

  sparkle(ctx, 960, 70, 26, PAPER, 0.9);
  sparkle(ctx, 905, 120, 12, YELLOW, 0.95);
  sparkle(ctx, 60, 700, 22, YELLOW, 0.9);
  sparkle(ctx, 1010, 690, 18, PAPER, 0.8);
  sparkle(ctx, 540, 940, 14, MINT, 0.9);
  sparkle(ctx, 1020, 940, 24, YELLOW, 0.9);
}

/**
 * The QR itself, drawn module by module.
 *
 * <p>Dots instead of squares, finder patterns as rounded frames, and a hole
 * in the middle for the mark. The library is used only for the encoding.
 * Error correction is fixed at H (~30% recoverable), which is what pays for
 * the hole.
 */
function drawQr(
  ctx: CanvasRenderingContext2D, url: string, boxX: number, boxY: number, box: number,
  logo: HTMLImageElement | null,
) {
  const qr = QRCode.create(url, { errorCorrectionLevel: 'H' });
  const count = qr.modules.size;
  const data = qr.modules.data;

  /* The quiet zone is not decoration: four clear modules on every side, which
     the library's matrix does not include. Without it a scanner looking at the
     whole card cannot tell where the code ends. */
  const QUIET = 4;
  const cell = box / (count + QUIET * 2);
  const x = boxX + QUIET * cell;
  const y = boxY + QUIET * cell;

  const holeCells = Math.floor(count * 0.22);
  const holeStart = Math.floor((count - holeCells) / 2);
  const holeEnd = holeStart + holeCells;

  const isFinder = (row: number, col: number) => (
    (row < 7 && col < 7) || (row < 7 && col >= count - 7) || (row >= count - 7 && col < 7)
  );

  /* Colour lives in the ink, never in the contrast: modules are a deep indigo
     (about 17:1 on white), so the code can look designed and still scan. */
  ctx.fillStyle = INK;
  for (let row = 0; row < count; row += 1) {
    for (let col = 0; col < count; col += 1) {
      if (!data[row * count + col]) continue;
      if (isFinder(row, col)) continue;
      if (row >= holeStart && row < holeEnd && col >= holeStart && col < holeEnd) continue;

      ctx.beginPath();
      ctx.arc(x + col * cell + cell / 2, y + row * cell + cell / 2, cell * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /* Finder eyes: exact geometry, only the corner radius is ours. The centre
     stays dark navy - a bright centre would cost the contrast a scanner locks
     onto. */
  const eye = (row: number, col: number) => {
    const ex = x + col * cell;
    const ey = y + row * cell;
    ctx.fillStyle = INK;
    roundRect(ctx, ex, ey, cell * 7, cell * 7, cell * 2.4);
    ctx.fill();
    ctx.fillStyle = PAPER;
    roundRect(ctx, ex + cell, ey + cell, cell * 5, cell * 5, cell * 1.7);
    ctx.fill();
    ctx.fillStyle = NAVY;
    roundRect(ctx, ex + cell * 2, ey + cell * 2, cell * 3, cell * 3, cell * 1.1);
    ctx.fill();
  };
  eye(0, 0);
  eye(0, count - 7);
  eye(count - 7, 0);

  // The mark in the hole, on a white disc with a pink ring.
  const holePx = holeCells * cell;
  const cx = x + holeStart * cell + holePx / 2;
  const cy = y + holeStart * cell + holePx / 2;

  ctx.fillStyle = PAPER;
  ctx.beginPath();
  ctx.arc(cx, cy, holePx * 0.7, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = PINK;
  ctx.lineWidth = holePx * 0.07;
  ctx.beginPath();
  ctx.arc(cx, cy, holePx * 0.66, 0, Math.PI * 2);
  ctx.stroke();

  if (logo) {
    const size = holePx * 1.0;
    ctx.drawImage(logo, cx - size / 2, cy - size / 2, size, size);
  } else {
    ctx.fillStyle = NAVY;
    ctx.beginPath();
    ctx.arc(cx, cy, holePx * 0.52, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PAPER;
    ctx.font = `800 ${holePx * 0.62}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('C', cx, cy + holePx * 0.03);
  }
}

/** Breaks a single word wider than the column into pieces that fit. */
function splitLongWord(
  ctx: CanvasRenderingContext2D, word: string, maxWidth: number,
): string[] {
  if (ctx.measureText(word).width <= maxWidth) return [word];
  const pieces: string[] = [];
  let piece = '';
  for (const ch of word) {
    if (piece && ctx.measureText(piece + ch).width > maxWidth) {
      pieces.push(piece);
      piece = ch;
    } else {
      piece += ch;
    }
  }
  if (piece) pieces.push(piece);
  return pieces;
}

/** One line, truncated with an ellipsis rather than wrapped or overflowed. */
function fitOneLine(
  ctx: CanvasRenderingContext2D, text: string, maxWidth: number,
): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let cut = text;
  while (cut && ctx.measureText(`${cut}…`).width > maxWidth) cut = cut.slice(0, -1);
  return `${cut}…`;
}

/** Splits into at most `maxLines`, ellipsising the last. Measures with the current font. */
function wrap(
  ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean)
    .flatMap((word) => splitLongWord(ctx, word, maxWidth));
  const lines: string[] = [];
  let line = '';

  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth || !line) {
      line = next;
    } else {
      lines.push(line);
      line = word;
      if (lines.length === maxLines) break;
    }
  }
  if (lines.length < maxLines && line) lines.push(line);

  const lastIndex = lines.length - 1;
  if (lines.length === maxLines && ctx.measureText(lines[lastIndex]).width > maxWidth) {
    let last = lines[lastIndex];
    while (last && ctx.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1);
    lines[lastIndex] = `${last}…`;
  }
  return lines;
}

/** A pill of text. Returns the width used, so a row of them can be laid out. */
function chip(
  ctx: CanvasRenderingContext2D, text: string, x: number, centerY: number,
  bg: string, fg: string, font: string,
): number {
  ctx.font = font;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const padding = 26;
  const h = 56;
  const w = ctx.measureText(text).width + padding * 2;

  ctx.save();
  ctx.shadowColor = 'rgba(21,10,61,0.35)';
  ctx.shadowBlur = 14;
  ctx.shadowOffsetY = 4;
  ctx.fillStyle = bg;
  roundRect(ctx, x, centerY - h / 2, w, h, h / 2);
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = fg;
  ctx.fillText(text, x + padding, centerY + 1);
  return w;
}

/** Loads an image for compositing; resolves to null on any failure. */
function loadImage(src?: string): Promise<HTMLImageElement | null> {
  if (!src) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/**
 * The photo as a slightly tilted, white-bordered print with a deep shadow -
 * the "stuck on a wall" look. With no photo the print becomes a brand panel
 * with the logo large behind it, so the card is never left with a hole.
 */
function drawPhoto(
  ctx: CanvasRenderingContext2D, img: HTMLImageElement | null, logo: HTMLImageElement | null,
) {
  const BORDER = 14;
  const cx = PHOTO_X + PHOTO_W / 2;
  const cy = PHOTO_Y + PHOTO_H / 2;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.022);
  ctx.translate(-cx, -cy);

  // The white print, with the shadow.
  ctx.save();
  ctx.shadowColor = 'rgba(21,10,61,0.5)';
  ctx.shadowBlur = 50;
  ctx.shadowOffsetY = 22;
  ctx.fillStyle = PAPER;
  roundRect(ctx, PHOTO_X, PHOTO_Y, PHOTO_W, PHOTO_H, 44);
  ctx.fill();
  ctx.restore();

  // The picture, clipped inside the border.
  const ix = PHOTO_X + BORDER;
  const iy = PHOTO_Y + BORDER;
  const iw = PHOTO_W - BORDER * 2;
  const ih = PHOTO_H - BORDER * 2;

  ctx.save();
  roundRect(ctx, ix, iy, iw, ih, 32);
  ctx.clip();

  if (img) {
    // Cover, not stretch: a distorted product photo is worse than a cropped one.
    const scale = Math.max(iw / img.width, ih / img.height);
    const dw = img.width * scale;
    const dh = img.height * scale;
    ctx.drawImage(img, ix + (iw - dw) / 2, iy + (ih - dh) / 2, dw, dh);
  } else {
    const wash = ctx.createLinearGradient(ix, iy, ix + iw, iy + ih);
    wash.addColorStop(0, VIOLET);
    wash.addColorStop(0.55, PINK);
    wash.addColorStop(1, ORANGE);
    ctx.fillStyle = wash;
    ctx.fillRect(ix, iy, iw, ih);
    sparkle(ctx, ix + 90, iy + 90, 28, PAPER, 0.85);
    sparkle(ctx, ix + iw - 110, iy + ih - 150, 20, YELLOW, 0.9);
    if (logo) {
      ctx.save();
      ctx.globalAlpha = 0.3;
      const size = ih * 0.8;
      ctx.drawImage(logo, ix + (iw - size) / 2, iy + (ih - size) / 2, size, size);
      ctx.restore();
    }
  }

  // Bottom scrim so the chips stay readable on any photograph.
  const scrim = ctx.createLinearGradient(0, iy + ih - 190, 0, iy + ih);
  scrim.addColorStop(0, 'rgba(21,10,61,0)');
  scrim.addColorStop(1, 'rgba(21,10,61,0.7)');
  ctx.fillStyle = scrim;
  ctx.fillRect(ix, iy + ih - 190, iw, 190);

  ctx.restore();
  ctx.restore();
}

/**
 * Renders the whole card and hands back the canvas.
 *
 * <p>Async only because of the images; everything else is synchronous drawing.
 */
export async function renderQrCard(content: QrCardContent): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas');
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot generate the QR card.');

  // Both images are fetched together: one is local, one is remote.
  const [photo, logo] = await Promise.all([
    loadImage(content.imageUrl),
    loadImage(LOGO_SRC),
  ]);

  drawBackground(ctx);

  // ── Wordmark pill ─────────────────────────────────────────────────────
  ctx.font = '800 36px system-ui, sans-serif';
  const campusW = ctx.measureText('Campus').width;
  const marketW = ctx.measureText('Market').width;
  const pillW = 14 + 56 + 14 + campusW + marketW + 26;

  ctx.save();
  ctx.shadowColor = 'rgba(21,10,61,0.35)';
  ctx.shadowBlur = 20;
  ctx.shadowOffsetY = 6;
  ctx.fillStyle = PAPER;
  roundRect(ctx, M, 62, pillW, 76, 38);
  ctx.fill();
  ctx.restore();

  if (logo) {
    ctx.drawImage(logo, M + 14, 72, 56, 56);
  } else {
    ctx.fillStyle = NAVY;
    ctx.beginPath();
    ctx.arc(M + 42, 100, 28, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PAPER;
    ctx.font = '800 30px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('C', M + 42, 102);
  }
  ctx.font = '800 36px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = NAVY;
  ctx.fillText('Campus', M + 84, 101);
  ctx.fillStyle = PINK;
  ctx.fillText('Market', M + 84 + campusW, 101);

  // ── Photo ─────────────────────────────────────────────────────────────
  drawPhoto(ctx, photo, logo);

  // ── Chips, riding the bottom edge of the photo ────────────────────────
  const chipColors: Array<[string, string]> = [[YELLOW, NAVY], [MINT, NAVY], [PAPER, NAVY]];
  let chipX = M + 36;
  (content.chips ?? []).slice(0, 3).forEach((text, i) => {
    const [bg, fg] = chipColors[i % chipColors.length];
    chipX += chip(ctx, text, chipX, PHOTO_Y + PHOTO_H - 62, bg, fg,
      '700 28px system-ui, sans-serif') + 14;
  });

  // ── Discount burst, stuck over the photo's top-right corner ───────────
  if (content.discountPercent && content.discountPercent > 0) {
    const bx = CARD_W - M - 54;
    const by = PHOTO_Y + 20;
    ctx.save();
    ctx.translate(bx, by);
    ctx.rotate(0.2);
    ctx.shadowColor = 'rgba(21,10,61,0.45)';
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 10;
    ctx.fillStyle = YELLOW;
    burst(ctx, 0, 0, 108, 90, 18);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(bx, by);
    ctx.rotate(0.2);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = PINK;
    ctx.font = '900 54px system-ui, sans-serif';
    ctx.fillText(`${content.discountPercent}%`, 0, -10);
    ctx.fillStyle = NAVY;
    ctx.font = '800 28px system-ui, sans-serif';
    ctx.fillText('OFF', 0, 30);
    ctx.restore();
  }

  // ── Eyebrow + title ───────────────────────────────────────────────────
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = '800 66px system-ui, sans-serif';
  const titleLines = wrap(ctx, content.title, CARD_W - M * 2, 2);
  const titleLead = 76;
  const lastTitleBaseline = PRICE_TOP - 34;
  const firstTitleBaseline = lastTitleBaseline - (titleLines.length - 1) * titleLead;

  ctx.save();
  ctx.shadowColor = 'rgba(21,10,61,0.4)';
  ctx.shadowBlur = 16;
  ctx.shadowOffsetY = 4;
  ctx.fillStyle = PAPER;
  titleLines.forEach((line, i) => {
    ctx.fillText(line, M, firstTitleBaseline + i * titleLead);
  });
  ctx.restore();

  if (content.eyebrow) {
    ctx.font = '800 24px system-ui, sans-serif';
    const label = content.eyebrow.toUpperCase();
    const w = ctx.measureText(label).width + 40;
    const ey = firstTitleBaseline - 66 - 34;
    ctx.fillStyle = 'rgba(21,10,61,0.55)';
    roundRect(ctx, M, ey, w, 46, 23);
    ctx.fill();
    ctx.fillStyle = YELLOW;
    ctx.textBaseline = 'middle';
    ctx.fillText(label, M + 20, ey + 24);
    ctx.textBaseline = 'alphabetic';
  }

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
    const wasY = PRICE_TOP + PRICE_H / 2 + 14;
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

  const qrBox = 284;
  const qrX = M + 20;
  const qrY = TICKET_TOP + 14 + (TICKET_H - 14 - qrBox) / 2;
  drawQr(ctx, content.url, qrX, qrY, qrBox, logo);

  // Text column, centred on the code's own middle.
  const textX = qrX + qrBox + 30;
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
  ctx.fillText('Buy, sell and trade with students you can actually meet ✨', CARD_W / 2, 1324);

  return canvas;
}

/**
 * The card as a PNG file, ready for the share sheet.
 *
 * <p>PNG rather than JPEG because the card has flat colour, text and a QR
 * code, where JPEG's artefacts show worst.
 */
export function canvasToFile(canvas: HTMLCanvasElement, filename: string): Promise<File> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Could not turn the card into an image.'));
        return;
      }
      resolve(new File([blob], filename, { type: 'image/png' }));
    }, 'image/png');
  });
}