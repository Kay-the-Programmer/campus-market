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

/** A four-point sparkle, the cheapest way to make a flat gradient feel alive. */
export function sparkle(
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
export function burst(
  ctx: CanvasRenderingContext2D, cx: number, cy: number,
  outer: number, inner: number, points: number,
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

/**
 * CSS letter-spacing, which canvas only has on newer engines.
 *
 * <p>ctx.letterSpacing arrived in Chrome 99 and Safari 17.4, and a poster that
 * loses its tracking on an older phone is a poster that does not match the
 * design. Spacing the glyphs by hand costs one measureText per character and
 * works everywhere. CSS puts the space *after* every character, including the
 * last, so the width includes one trailing gap - which is what centring a
 * tracked line has to agree with.
 */
export function measureTracked(
  ctx: CanvasRenderingContext2D, text: string, tracking: number,
): number {
  return ctx.measureText(text).width + tracking * [...text].length;
}

/** Draws tracked text from `x` (left) at baseline `y`. Returns the width used. */
export function fillTracked(
  ctx: CanvasRenderingContext2D, text: string, x: number, y: number, tracking: number,
): number {
  let cursor = x;
  for (const ch of text) {
    ctx.fillText(ch, cursor, y);
    cursor += ctx.measureText(ch).width + tracking;
  }
  return cursor - x;
}

export interface ChipLook {
  bg: string;
  fg: string;
  font: string;
  /** Pill height. The radius follows it unless `radius` says otherwise. */
  h?: number;
  radius?: number;
  padding?: number;
  shadow?: boolean;
  border?: string;
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

  ctx.save();
  if (look.shadow) {
    ctx.shadowColor = 'rgba(21,10,61,0.35)';
    ctx.shadowBlur = 14;
    ctx.shadowOffsetY = 4;
  }
  ctx.fillStyle = look.bg;
  roundRect(ctx, x, centerY - h / 2, w, h, radius);
  ctx.fill();
  ctx.restore();

  if (look.border) {
    ctx.strokeStyle = look.border;
    ctx.lineWidth = 2;
    roundRect(ctx, x + 1, centerY - h / 2 + 1, w - 2, h - 2, radius);
    ctx.stroke();
  }

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
 */
export function fitContain(sw: number, sh: number, bw: number, bh: number): Size {
  if (!(sw > 0) || !(sh > 0)) return { w: bw, h: bh };
  const scale = Math.min(bw / sw, bh / sh);
  return { w: sw * scale, h: sh * scale };
}

/** The smallest source size that covers the box. Used only behind a fitted photo. */
export function fitCover(sw: number, sh: number, bw: number, bh: number): Size {
  if (!(sw > 0) || !(sh > 0)) return { w: bw, h: bh };
  const scale = Math.max(bw / sw, bh / sh);
  return { w: sw * scale, h: sh * scale };
}

/**
 * A blurred wash of the photo's own colours, filling the frame behind it.
 *
 * <p>Fitting a whole photo into a fixed frame leaves space at two of its edges,
 * and that space has to be something. A blur of the same photo is the one
 * filler that always belongs: it carries the picture's own colours, so a tall
 * phone photo reads as floating on its own background rather than as a mistake
 * with bars down the sides.
 *
 * <p>Blurred by shrinking the photo to a couple of dozen pixels and scaling it
 * back up with smoothing on, not by ctx.filter: filter is missing on older
 * Safari, where the fallback would be a sharp, visibly cropped copy behind the
 * real one. This is a real blur in every browser, and cheap.
 */
function drawWash(ctx: CanvasRenderingContext2D, img: HTMLImageElement, frame: Frame) {
  const TINY = 24;
  const small = document.createElement('canvas');
  small.width = TINY;
  small.height = Math.max(1, Math.round((TINY * frame.h) / frame.w));
  const sctx = small.getContext('2d');
  if (!sctx) return;

  // Cover into the thumbnail, so the wash is cropped rather than squashed and
  // its colours sit roughly where the photo's own do.
  const { w, h } = fitCover(img.width, img.height, small.width, small.height);
  sctx.drawImage(img, (small.width - w) / 2, (small.height - h) / 2, w, h);

  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  /* Overdrawn past the frame: the thumbnail's outer row of pixels stretches
     into a hard band, and growing the rectangle keeps that band outside the
     clip instead of along the visible edge. */
  const bleed = frame.w * 0.07;
  ctx.drawImage(small, frame.x - bleed, frame.y - bleed, frame.w + bleed * 2, frame.h + bleed * 2);
  ctx.restore();
}

export interface PhotoLook {
  /** What sits behind a fitted photo: a blur of itself, or just the base. */
  backdrop: 'wash' | 'solid';
  /** The flat fill under everything, and the colour an empty frame starts from. */
  base: string;
  /** Laid over the backdrop only, to keep the photo itself the brightest thing. */
  veil?: string;
  /** A bottom-edge gradient, so chips over the frame stay readable. */
  scrim?: { color: string; height: number };
  /** A hairline around the frame. */
  border?: { color: string; width: number };
  /** Drawn inside the frame when there is no photo at all. */
  fallback?: (ctx: CanvasRenderingContext2D, frame: Frame) => void;
}

/**
 * The photo, whole, inside the frame.
 *
 * <p>Nothing is cropped: the image is scaled to fit and centred, and whatever
 * the fit leaves over is filled by the wash. With no photo the frame falls back
 * to the style's own panel, so a card is never left with a hole.
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
    if (look.backdrop === 'wash') drawWash(ctx, img, frame);
    if (look.veil) {
      ctx.fillStyle = look.veil;
      ctx.fillRect(frame.x, frame.y, frame.w, frame.h);
    }
    const { w, h } = fitContain(img.width, img.height, frame.w, frame.h);
    ctx.drawImage(img, frame.x + (frame.w - w) / 2, frame.y + (frame.h - h) / 2, w, h);
  } else {
    look.fallback?.(ctx, frame);
  }

  if (look.scrim) {
    const top = frame.y + frame.h - look.scrim.height;
    const scrim = ctx.createLinearGradient(0, top, 0, frame.y + frame.h);
    scrim.addColorStop(0, 'rgba(21,10,61,0)');
    scrim.addColorStop(1, look.scrim.color);
    ctx.fillStyle = scrim;
    ctx.fillRect(frame.x, top, frame.w, look.scrim.height);
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
