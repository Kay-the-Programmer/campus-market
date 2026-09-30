import QRCode from 'qrcode';

/**
 * Draws the shareable QR card for a listing.
 *
 * <p>A card rather than a bare QR code, because of where it ends up: pasted
 * into a WhatsApp group among a hundred other messages, or printed and stuck
 * on a noticeboard. A naked black square says nothing about what scanning it
 * will do, and nobody scans a square they cannot place. The title, the price
 * and the photo do the persuading; the code is only the door.
 *
 * <p>Everything is drawn to a canvas rather than composed in the DOM, for the
 * one reason that matters here: sharing needs a PNG file, and the only way to
 * get one from markup is to rasterise it by hand anyway.
 */

/** Portrait, at the aspect ratio WhatsApp previews without cropping. */
export const CARD_W = 1080;
export const CARD_H = 1350;

const BRAND = '#2563eb';
const INK = '#0b1c30';
const MUTED = '#737686';
const PAPER = '#ffffff';

export interface QrCardContent {
  title: string;
  /** Pre-formatted, so the card cannot disagree with the page about currency. */
  price: string;
  /** Shown under the code. The full URL is what the code itself carries. */
  prettyUrl: string;
  /** The listing's photo. Omitted or unreachable is fine - see drawPhoto. */
  imageUrl?: string;
  /** What the code encodes. */
  url: string;
  /** Condition, zone - a couple of words of context at most. */
  detail?: string;
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
function drawQr(ctx: CanvasRenderingContext2D, url: string, x: number, y: number, size: number) {
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
   * with it, it reads first time.
   */
  const QUIET = 4;
  const cell = size / (count + QUIET * 2);

  // White under the whole box, including the margin, so the panel's tint
  // cannot eat into the contrast the scanner is looking for.
  ctx.fillStyle = PAPER;
  roundRect(ctx, x, y, size, size, cell * 2);
  ctx.fill();

  x += QUIET * cell;
  y += QUIET * cell;

  /* The middle is left blank for the mark. Kept to a small share of the code
     - the 30% budget is for damage and dirt as well, and spending all of it on
     decoration is how a pretty code becomes an unscannable one. */
  const holeCells = Math.floor(count * 0.22);
  const holeStart = Math.floor((count - holeCells) / 2);
  const holeEnd = holeStart + holeCells;

  const isFinder = (row: number, col: number) => {
    const inTopLeft = row < 7 && col < 7;
    const inTopRight = row < 7 && col >= count - 7;
    const inBottomLeft = row >= count - 7 && col < 7;
    return inTopLeft || inTopRight || inBottomLeft;
  };

  ctx.fillStyle = INK;
  for (let row = 0; row < count; row += 1) {
    for (let col = 0; col < count; col += 1) {
      if (!data[row * count + col]) continue;
      if (isFinder(row, col)) continue;
      if (row >= holeStart && row < holeEnd && col >= holeStart && col < holeEnd) continue;

      // Dots, insetscornerwise so neighbours stay visually separate - a solid
      // run of squares reads as a bar and loses the texture that makes the
      // thing look deliberate.
      const cx = x + col * cell + cell / 2;
      const cy = y + row * cell + cell / 2;
      ctx.beginPath();
      ctx.arc(cx, cy, cell * 0.42, 0, Math.PI * 2);
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
    roundRect(ctx, ex + cell * 2, ey + cell * 2, cell * 3, cell * 3, cell * 1);
    ctx.fill();
  };
  eye(0, 0);
  eye(0, count - 7);
  eye(count - 7, 0);

  // The mark in the hole: a brand-coloured disc with the app's initial.
  const holePx = holeCells * cell;
  const hx = x + holeStart * cell;
  const hy = y + holeStart * cell;
  ctx.fillStyle = PAPER;
  ctx.beginPath();
  ctx.arc(hx + holePx / 2, hy + holePx / 2, holePx * 0.62, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = BRAND;
  ctx.beginPath();
  ctx.arc(hx + holePx / 2, hy + holePx / 2, holePx * 0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PAPER;
  ctx.font = `700 ${holePx * 0.6}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('C', hx + holePx / 2, hy + holePx / 2 + holePx * 0.02);
}

/** Wraps to at most `maxLines`, ellipsising the last one. */
function drawWrapped(
  ctx: CanvasRenderingContext2D, text: string, x: number, y: number,
  maxWidth: number, lineHeight: number, maxLines: number,
): number {
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

  let last = lines[lines.length - 1] ?? '';
  if (lines.length === maxLines && ctx.measureText(last).width > maxWidth) {
    while (last && ctx.measureText(`${last}…`).width > maxWidth) {
      last = last.slice(0, -1);
    }
    lines[lines.length - 1] = `${last}…`;
  }

  lines.forEach((l, i) => ctx.fillText(l, x, y + i * lineHeight));
  return y + lines.length * lineHeight;
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

/** Draws the photo panel, or a brand-coloured stand-in when there is none. */
function drawPhoto(
  ctx: CanvasRenderingContext2D, img: HTMLImageElement | null,
  x: number, y: number, w: number, h: number,
) {
  ctx.save();
  roundRect(ctx, x, y, w, h, 40);
  ctx.clip();

  if (img) {
    // Cover, not stretch: a distorted product photo is worse than a cropped one.
    const scale = Math.max(w / img.width, h / img.height);
    const dw = img.width * scale;
    const dh = img.height * scale;
    ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  } else {
    const wash = ctx.createLinearGradient(x, y, x + w, y + h);
    wash.addColorStop(0, '#dbe1ff');
    wash.addColorStop(1, '#eff4ff');
    ctx.fillStyle = wash;
    ctx.fillRect(x, y, w, h);
  }
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

  // ── Background ────────────────────────────────────────────────────────
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  const header = ctx.createLinearGradient(0, 0, CARD_W, 520);
  header.addColorStop(0, '#eff4ff');
  header.addColorStop(1, '#ffffff');
  ctx.fillStyle = header;
  ctx.fillRect(0, 0, CARD_W, 520);

  // ── Brand line ────────────────────────────────────────────────────────
  ctx.fillStyle = BRAND;
  ctx.beginPath();
  ctx.arc(90, 92, 26, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PAPER;
  ctx.font = '700 30px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('C', 90, 94);

  ctx.textAlign = 'left';
  ctx.fillStyle = INK;
  ctx.font = '700 34px system-ui, sans-serif';
  ctx.fillText('CampusMarket', 130, 94);

  // ── Photo ─────────────────────────────────────────────────────────────
  const photo = await loadImage(content.imageUrl);
  drawPhoto(ctx, photo, 80, 150, CARD_W - 160, 420);

  // ── Title, price, detail ──────────────────────────────────────────────
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = INK;
  ctx.font = '700 58px system-ui, sans-serif';
  const afterTitle = drawWrapped(ctx, content.title, 80, 660, CARD_W - 160, 70, 2);

  ctx.fillStyle = BRAND;
  ctx.font = '800 64px system-ui, sans-serif';
  ctx.fillText(content.price, 80, afterTitle + 42);

  if (content.detail) {
    ctx.fillStyle = MUTED;
    ctx.font = '400 32px system-ui, sans-serif';
    ctx.fillText(content.detail, 80, afterTitle + 96);
  }

  // ── The code, on its own panel ────────────────────────────────────────
  const panelY = 900;
  const panelH = 360;
  ctx.fillStyle = '#f8f9ff';
  roundRect(ctx, 80, panelY, CARD_W - 160, panelH, 48);
  ctx.fill();
  ctx.strokeStyle = '#e5eeff';
  ctx.lineWidth = 3;
  ctx.stroke();

  /* The box includes the quiet zone, so the code inside it is smaller than
     this number - sized up accordingly rather than shrinking the code. */
  const qrSize = 300;
  drawQr(ctx, content.url, 120, panelY + (panelH - qrSize) / 2, qrSize);

  const textX = 120 + qrSize + 40;
  ctx.textAlign = 'left';
  ctx.fillStyle = INK;
  ctx.font = '700 40px system-ui, sans-serif';
  ctx.fillText('Scan to view', textX, panelY + 150);
  ctx.fillStyle = MUTED;
  ctx.font = '400 28px system-ui, sans-serif';
  ctx.fillText('Point a camera at the code', textX, panelY + 196);
  drawWrapped(ctx, content.prettyUrl, textX, panelY + 244, CARD_W - textX - 130, 34, 2);

  // ── Footer ────────────────────────────────────────────────────────────
  ctx.fillStyle = MUTED;
  ctx.font = '400 26px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Buy, sell and trade with students you can actually meet.', CARD_W / 2, CARD_H - 48);

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
