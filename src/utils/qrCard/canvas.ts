/**
 * Drawing primitives shared by the poster styles: shapes, text fitting, and
 * the photo frame.
 *
 * <p>Pure canvas work. Nothing here knows which style is drawing.
 */

/** A rectangle on the card, with its corner radius. */
export interface Frame {
  x: number;
  y: number;
  w: number;
  h: number;
  radius: number;
}

/** Rounded rectangle path, since Safari still lacks roundRect in some versions. */
export function roundRect(
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
export function fitOneLine(
  ctx: CanvasRenderingContext2D, text: string, maxWidth: number,
): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let cut = text;
  while (cut && ctx.measureText(`${cut}…`).width > maxWidth) cut = cut.slice(0, -1);
  return `${cut}…`;
}

/** Splits into at most `maxLines`, ellipsising the last. Measures with the current font. */
export function wrap(
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

export interface ChipLook {
  bg: string;
  fg: string;
  font: string;
  /** Pill height. The radius follows it unless `radius` says otherwise. */
  h?: number;
  radius?: number;
  padding?: number;
}

/** A pill of text. Returns the width used, so a row of them can be laid out. */
export function chip(
  ctx: CanvasRenderingContext2D, text: string, x: number, centerY: number, look: ChipLook,
): number {
  const h = look.h ?? 56;
  const padding = look.padding ?? 26;
  const radius = look.radius ?? h / 2;

  ctx.font = look.font;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const w = ctx.measureText(text).width + padding * 2;

  ctx.fillStyle = look.bg;
  roundRect(ctx, x, centerY - h / 2, w, h, radius);
  ctx.fill();

  ctx.fillStyle = look.fg;
  ctx.fillText(text, x + padding, centerY + 1);
  return w;
}

/** Loads an image for compositing; resolves to null on any failure. */
export function loadImage(src?: string): Promise<HTMLImageElement | null> {
  if (!src) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

export interface Size {
  w: number;
  h: number;
}

/**
 * The largest the source fits inside the box with nothing cropped off.
 *
 * <p>The whole point of the poster is the thing being sold, and a listing photo
 * is whatever shape the seller's camera produced - tall, square, panoramic.
 * Fitting instead of filling is what guarantees a reader sees all of it.
 *
 * <p>Used twice over now: once to size the frame itself from the photo's own
 * aspect, and once to place the photo inside the frame that produced. The
 * second is a no-op in every case the first could satisfy exactly, and the
 * safety net when it could not.
 */
export function fitContain(sw: number, sh: number, bw: number, bh: number): Size {
  if (!(sw > 0) || !(sh > 0)) return { w: bw, h: bh };
  const scale = Math.min(bw / sw, bh / sh);
  return { w: sw * scale, h: sh * scale };
}

export interface PhotoLook {
  /** The flat fill under the photo, and the colour an empty frame starts from. */
  base: string;
  /** A hairline around the frame. */
  border?: { color: string; width: number };
  /** Drawn inside the frame when there is no photo at all. */
  fallback?: (ctx: CanvasRenderingContext2D, frame: Frame) => void;
}

/**
 * The photo, whole, inside the frame.
 *
 * <p>Nothing is cropped and, because the frame was sized from this photo's own
 * aspect, nothing is boxed either: the image lands on all four edges. With no
 * photo the frame falls back to the style's own panel, so a card is never left
 * with a hole.
 */
export function drawPhoto(
  ctx: CanvasRenderingContext2D, img: HTMLImageElement | null, frame: Frame, look: PhotoLook,
) {
  ctx.save();
  roundRect(ctx, frame.x, frame.y, frame.w, frame.h, frame.radius);
  ctx.clip();

  ctx.fillStyle = look.base;
  ctx.fillRect(frame.x, frame.y, frame.w, frame.h);

  if (img) {
    const { w, h } = fitContain(img.width, img.height, frame.w, frame.h);
    ctx.drawImage(img, frame.x + (frame.w - w) / 2, frame.y + (frame.h - h) / 2, w, h);
  } else {
    look.fallback?.(ctx, frame);
  }

  ctx.restore();

  if (look.border) {
    ctx.save();
    ctx.strokeStyle = look.border.color;
    ctx.lineWidth = look.border.width;
    const inset = look.border.width / 2;
    roundRect(
      ctx, frame.x + inset, frame.y + inset,
      frame.w - look.border.width, frame.h - look.border.width, frame.radius,
    );
    ctx.stroke();
    ctx.restore();
  }
}
