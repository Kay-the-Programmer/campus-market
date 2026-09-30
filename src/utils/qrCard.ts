import QRCode from 'qrcode';

/**
 * Draws the shareable QR card for a listing.
 *
 * <p>The card has one job and it is not information: it has to survive a
 * thumb moving at speed through a WhatsApp group. Whoever sends it is doing
 * the platform a favour, and they will only do it if the thing looks like
 * something they are happy to have their name on. So the composition is built
 * the way a poster is - one photo edge to edge, one number you can read
 * across a room, and the code on a clean white slab at the foot where the eye
 * lands last.
 *
 * <p>Everything is drawn to a canvas rather than composed in the DOM, for the
 * one reason that matters here: sharing needs a PNG file, and the only way to
 * get one from markup is to rasterise it by hand anyway.
 */

/** Portrait, at the aspect ratio WhatsApp previews without cropping. */
export const CARD_W = 1080;
export const CARD_H = 1350;

/** One margin, used by everything. Nothing on this card is aligned to anything else. */
const M = 72;

const BRAND = '#2563eb';
const INK = '#0b1c30';
const PAPER = '#ffffff';
const MUTED = '#737686';
const SALE = '#e11d48';

/** Vertical anchors. Fixed, so a one-line title and a two-line one both land right. */
const PHOTO_H = 560;
const PRICE_BASELINE = 852;
const TICKET_TOP = 922;
const TICKET_H = 356;

export interface QrCardContent {
  title: string;
  /** Pre-formatted, so the card cannot disagree with the page about currency. */
  price: string;
  /** Struck through beside the price when there is a real reduction. */
  compareAtPrice?: string;
  /** Drives the corner flash. Whole percent. */
  discountPercent?: number;
  /** Shown under the code. The full URL is what the code itself carries. */
  prettyUrl: string;
  /** The listing's photo. Omitted or unreachable is fine - see drawPhoto. */
  imageUrl?: string;
  /** What the code encodes. */
  url: string;
  /** Short facts as chips over the photo: condition, campus zone. */
  chips?: string[];
  /** Small label above the title - the category. Fills the gap under the photo. */
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

/**
 * The QR itself, drawn module by module.
 *
 * <p>Hand-drawn rather than handed to the library's own renderer so it can be
 * a designed object: dots instead of squares, finder patterns as rounded
 * frames, and a hole in the middle for the mark. The library is used only for
 * the part that must not be improvised - the encoding.
 *
 * <p>Error correction is fixed at H (~30% recoverable), which is what pays for
 * the hole in the middle. Anything lower and a code with a logo on it is a
 * code that sometimes does not scan, which is worse than a plain one.
 */
function drawQr(ctx: CanvasRenderingContext2D, url: string, boxX: number, boxY: number, box: number) {
  const qr = QRCode.create(url, { errorCorrectionLevel: 'H' });
  const count = qr.modules.size;
  const data = qr.modules.data;

  /*
   * The quiet zone, and it is not decoration.
   *
   * The spec asks for four clear modules on every side, and the matrix the
   * library returns does not include them. Drawn without it the code still
   * decodes from a tight crop - the data is all there - but a scanner looking
   * at the whole card has nothing telling it where the code ends, and finds
   * nothing at all. Measured on the rendered card: no quiet zone, no decode;
   * with it, it reads first time, and still reads at a third of the size.
   */
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

  /* The three corner eyes, drawn as shapes rather than as modules. They are
     what a scanner locks onto, so their geometry is exact - only the corner
     radius is ours. */
  const eye = (row: number, col: number) => {
    const ex = x + col * cell;
    const ey = y + row * cell;
    ctx.fillStyle = INK;
    roundRect(ctx, ex, ey, cell * 7, cell * 7, cell * 2.2);
    ctx.fill();
    ctx.fillStyle = PAPER;
    roundRect(ctx, ex + cell, ey + cell, cell * 5, cell * 5, cell * 1.6);
    ctx.fill();
    ctx.fillStyle = BRAND;
    roundRect(ctx, ex + cell * 2, ey + cell * 2, cell * 3, cell * 3, cell);
    ctx.fill();
  };
  eye(0, 0);
  eye(0, count - 7);
  eye(count - 7, 0);

  // The mark in the hole: a brand disc with the app's initial.
  const holePx = holeCells * cell;
  const cx = x + holeStart * cell + holePx / 2;
  const cy = y + holeStart * cell + holePx / 2;
  ctx.fillStyle = PAPER;
  ctx.beginPath();
  ctx.arc(cx, cy, holePx * 0.66, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = BRAND;
  ctx.beginPath();
  ctx.arc(cx, cy, holePx * 0.52, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PAPER;
  ctx.font = `800 ${holePx * 0.62}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('C', cx, cy + holePx * 0.03);
}

/** Splits into at most `maxLines`, ellipsising the last. Measures with the current font. */
function wrap(
  ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
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
  const h = 52;
  const w = ctx.measureText(text).width + padding * 2;
  ctx.fillStyle = bg;
  roundRect(ctx, x, centerY - h / 2, w, h, h / 2);
  ctx.fill();
  ctx.fillStyle = fg;
  ctx.fillText(text, x + padding, centerY + 1);
  return w;
}

/**
 * Loads the listing photo for compositing.
 *
 * <p>Resolves to null rather than rejecting on anything going wrong, because
 * every failure here has the same answer: draw the card without it. Requested
 * with crossOrigin so the canvas stays untainted - a tainted canvas cannot be
 * exported, which would break the share rather than the decoration.
 */
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

/** Full-bleed photo, or a brand wash when there is none. */
function drawPhoto(ctx: CanvasRenderingContext2D, img: HTMLImageElement | null) {
  /*
   * Clipped to its band before anything is drawn.
   *
   * A cover fit is deliberately larger than the box on one axis - that is what
   * "cover" means - so without this the overflow paints straight down the card
   * and the title ends up written across the bottom of the photograph.
   */
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, CARD_W, PHOTO_H);
  ctx.clip();

  if (img) {
    // Cover, not stretch: a distorted product photo is worse than a cropped one.
    const scale = Math.max(CARD_W / img.width, PHOTO_H / img.height);
    const dw = img.width * scale;
    const dh = img.height * scale;
    ctx.drawImage(img, (CARD_W - dw) / 2, (PHOTO_H - dh) / 2, dw, dh);
  } else {
    const wash = ctx.createLinearGradient(0, 0, CARD_W, PHOTO_H);
    wash.addColorStop(0, '#1e3a8a');
    wash.addColorStop(1, BRAND);
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, CARD_W, PHOTO_H);
  }

  /* Two scrims, each earning its place: the top one so the wordmark stays
     legible over a bright photo, the bottom one so the photo dissolves into
     the card instead of ending at a hard line across the middle. */
  const top = ctx.createLinearGradient(0, 0, 0, 220);
  top.addColorStop(0, 'rgba(11,28,48,0.62)');
  top.addColorStop(1, 'rgba(11,28,48,0)');
  ctx.fillStyle = top;
  ctx.fillRect(0, 0, CARD_W, 220);

  const bottom = ctx.createLinearGradient(0, PHOTO_H - 320, 0, PHOTO_H);
  bottom.addColorStop(0, 'rgba(11,28,48,0)');
  bottom.addColorStop(0.55, 'rgba(11,28,48,0.75)');
  bottom.addColorStop(1, INK);
  ctx.fillStyle = bottom;
  ctx.fillRect(0, PHOTO_H - 320, CARD_W, 320);

  ctx.restore();
}

/**
 * Renders the whole card and hands back the canvas.
 *
 * <p>Async only because of the photo; everything else is synchronous drawing.
 */
export async function renderQrCard(content: QrCardContent): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas');
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot generate the QR card.');

  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  drawPhoto(ctx, await loadImage(content.imageUrl));

  // ── Wordmark, over the photo ──────────────────────────────────────────
  ctx.fillStyle = PAPER;
  ctx.beginPath();
  ctx.arc(M + 26, 96, 26, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = BRAND;
  ctx.font = '800 30px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('C', M + 26, 98);

  ctx.textAlign = 'left';
  ctx.fillStyle = PAPER;
  ctx.font = '700 36px system-ui, sans-serif';
  ctx.fillText('CampusMarket', M + 68, 97);

  // ── Sale flash ────────────────────────────────────────────────────────
  if (content.discountPercent && content.discountPercent > 0) {
    const label = `${content.discountPercent}% OFF`;
    ctx.font = '800 30px system-ui, sans-serif';
    const w = ctx.measureText(label).width + 52;
    ctx.fillStyle = SALE;
    roundRect(ctx, CARD_W - M - w, 96 - 27, w, 54, 27);
    ctx.fill();
    ctx.fillStyle = PAPER;
    ctx.textAlign = 'center';
    ctx.fillText(label, CARD_W - M - w / 2, 98);
    ctx.textAlign = 'left';
  }

  // ── Chips, sitting on the photo's scrim ───────────────────────────────
  let chipX = M;
  for (const text of (content.chips ?? []).slice(0, 3)) {
    chipX += chip(ctx, text, chipX, PHOTO_H - 60, 'rgba(255,255,255,0.18)', PAPER,
      '600 28px system-ui, sans-serif') + 14;
  }

  // ── Title, anchored upward from the price ─────────────────────────────
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = PAPER;
  ctx.font = '700 66px system-ui, sans-serif';
  const titleLines = wrap(ctx, content.title, CARD_W - M * 2, 2);
  const titleLead = 80;
  const lastTitleBaseline = PRICE_BASELINE - 116;
  const firstTitleBaseline = lastTitleBaseline - (titleLines.length - 1) * titleLead;
  titleLines.forEach((line, i) => {
    ctx.fillText(line, M, firstTitleBaseline + i * titleLead);
  });

  /* An eyebrow over the title. Half of its job is the category; the other half
     is filling the band between the photograph and the headline, which without
     it reads as a mistake rather than as space. */
  if (content.eyebrow) {
    ctx.fillStyle = '#8ab0ff';
    ctx.font = '700 26px system-ui, sans-serif';
    ctx.fillText(content.eyebrow.toUpperCase(), M, firstTitleBaseline - 62);
  }

  // ── Price, the loudest thing on the card ──────────────────────────────
  ctx.fillStyle = PAPER;
  ctx.font = '800 92px system-ui, sans-serif';
  ctx.fillText(content.price, M, PRICE_BASELINE);

  if (content.compareAtPrice) {
    const priceWidth = ctx.measureText(content.price).width;
    ctx.font = '500 40px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    const wasX = M + priceWidth + 24;
    ctx.fillText(content.compareAtPrice, wasX, PRICE_BASELINE - 6);
    // Struck through by hand: canvas has no text-decoration.
    const wasWidth = ctx.measureText(content.compareAtPrice).width;
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(wasX, PRICE_BASELINE - 20);
    ctx.lineTo(wasX + wasWidth, PRICE_BASELINE - 20);
    ctx.stroke();
  }

  // ── The ticket ────────────────────────────────────────────────────────
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 12;
  ctx.fillStyle = PAPER;
  roundRect(ctx, M, TICKET_TOP, CARD_W - M * 2, TICKET_H, 48);
  ctx.fill();
  ctx.restore();

  const qrBox = 300;
  const qrX = M + 28;
  const qrY = TICKET_TOP + (TICKET_H - qrBox) / 2;
  drawQr(ctx, content.url, qrX, qrY, qrBox);

  /* The text column starts where the code ends, and the whole block is
     centred on the code's own middle - which is what stops this half of the
     ticket reading as an afterthought stuck beside a square. */
  const textX = qrX + qrBox + 36;
  const textW = CARD_W - M - 40 - textX;
  const middle = TICKET_TOP + TICKET_H / 2;

  ctx.textAlign = 'left';
  ctx.fillStyle = INK;
  ctx.font = '700 46px system-ui, sans-serif';
  ctx.fillText('Scan to view', textX, middle - 34);

  ctx.fillStyle = MUTED;
  ctx.font = '400 28px system-ui, sans-serif';
  ctx.fillText('Point any camera at the code', textX, middle + 16);

  ctx.fillStyle = BRAND;
  ctx.font = '600 28px system-ui, sans-serif';
  wrap(ctx, content.prettyUrl, textW, 2)
    .forEach((line, i) => ctx.fillText(line, textX, middle + 72 + i * 36));

  // ── Footer ────────────────────────────────────────────────────────────
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = '500 26px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Buy, sell and trade with students you can actually meet.', CARD_W / 2, 1322);

  return canvas;
}

/**
 * The card as a PNG file, ready for the share sheet.
 *
 * <p>Named after the listing so a saved copy is findable, and PNG rather than
 * JPEG because the card is flat colour and text, where JPEG's artefacts show
 * worst - including on the code itself.
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
