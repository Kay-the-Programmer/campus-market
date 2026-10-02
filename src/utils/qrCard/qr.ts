/**
 * The code itself, drawn module by module.
 *
 * <p>Styling a QR is a tightrope: a scanner needs a dark-on-light matrix, a
 * clear border around it, and three intact finder patterns. Everything else -
 * the shape of a module, a hole in the middle for the mark, the colour of the
 * ink - is ours to choose. Every style on this card may restyle those; none of
 * them may touch the three things above, which is why the quiet zone, the
 * white plate and the error-correction level are decided here and not by the
 * caller.
 */

import QRCode from 'qrcode';
import { INK, NAVY, PAPER } from './card';
import { roundRect } from './canvas';

export interface QrLook {
  /**
   * The module colour. Must stay dark - contrast is what a scanner locks onto,
   * so this is where colour is spent last.
   */
  ink?: string;
  /** The finder eyes' centre square. */
  eye?: string;
  /** Dots read as designed; squares are the safer choice on paper. */
  shape?: 'dot' | 'square';
  /** A ring around the logo hole. Omitted for none. */
  ring?: string;
  /**
   * A light plate under the code. Required on any background that is not
   * already near-white: the quiet zone only works if it is actually quiet.
   */
  plate?: { fill: string; radius: number; pad: number };
  /**
   * Clear modules of margin kept inside the box. Four is the specification's
   * figure and the default; a style that already surrounds the code with white
   * of its own may lower it, never to zero, to spend the box on modules
   * instead.
   */
  quiet?: number;
  /** False leaves the middle solid - a plain code, with no mark in it. */
  hole?: boolean;
}

/**
 * Draws the code for `url` into a `size`-wide box at (x, y).
 *
 * <p>The box includes the quiet zone, so the modules themselves occupy a little
 * less than `size`. Pass `plate` and the plate is drawn around that box, which
 * is why the box is what a caller positions.
 */
export function drawQr(
  ctx: CanvasRenderingContext2D,
  url: string,
  box: { x: number; y: number; size: number },
  logo: HTMLImageElement | null,
  look: QrLook = {},
) {
  const ink = look.ink ?? INK;
  const eyeCenter = look.eye ?? NAVY;
  const shape = look.shape ?? 'dot';

  if (look.plate) {
    const { pad, fill, radius } = look.plate;
    ctx.fillStyle = fill;
    roundRect(ctx, box.x - pad, box.y - pad, box.size + pad * 2, box.size + pad * 2, radius);
    ctx.fill();
  }

  /* Error correction is fixed at H (~30% of the code recoverable), which is
     what pays for punching a hole in the middle for the mark. */
  const qr = QRCode.create(url, { errorCorrectionLevel: 'H' });
  const count = qr.modules.size;
  const data = qr.modules.data;

  /* The quiet zone is not decoration: clear modules on every side, which the
     library's matrix does not include. Without it a scanner looking at the
     whole poster cannot tell where the code ends. */
  const quiet = Math.max(1, look.quiet ?? 4);
  const cell = box.size / (count + quiet * 2);
  const x = box.x + quiet * cell;
  const y = box.y + quiet * cell;

  const wantsHole = look.hole ?? true;
  const holeCells = wantsHole ? Math.floor(count * (logo ? 0.22 : 0.18)) : 0;
  const holeStart = Math.floor((count - holeCells) / 2);
  const holeEnd = holeStart + holeCells;

  const isFinder = (row: number, col: number) => (
    (row < 7 && col < 7) || (row < 7 && col >= count - 7) || (row >= count - 7 && col < 7)
  );

  ctx.fillStyle = ink;
  for (let row = 0; row < count; row += 1) {
    for (let col = 0; col < count; col += 1) {
      if (!data[row * count + col]) continue;
      if (isFinder(row, col)) continue;
      if (holeCells && row >= holeStart && row < holeEnd && col >= holeStart && col < holeEnd) {
        continue;
      }

      const mx = x + col * cell;
      const my = y + row * cell;
      if (shape === 'square') {
        /* Drawn a hair wider than a cell so neighbours join into solid runs:
           hairline gaps between modules are what a cheap camera fails on. */
        ctx.fillRect(mx, my, cell * 1.02, cell * 1.02);
      } else {
        ctx.beginPath();
        ctx.arc(mx + cell / 2, my + cell / 2, cell * 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  /* Finder eyes: exact geometry, only the corner radius is ours. The centre
     stays dark - a bright centre would cost the contrast a scanner locks onto. */
  const eye = (row: number, col: number) => {
    const ex = x + col * cell;
    const ey = y + row * cell;
    const radius = shape === 'square' ? cell * 0.6 : cell * 2.4;
    ctx.fillStyle = ink;
    roundRect(ctx, ex, ey, cell * 7, cell * 7, radius);
    ctx.fill();
    ctx.fillStyle = look.plate?.fill ?? PAPER;
    roundRect(ctx, ex + cell, ey + cell, cell * 5, cell * 5, radius * 0.7);
    ctx.fill();
    ctx.fillStyle = eyeCenter;
    roundRect(ctx, ex + cell * 2, ey + cell * 2, cell * 3, cell * 3, radius * 0.45);
    ctx.fill();
  };
  eye(0, 0);
  eye(0, count - 7);
  eye(count - 7, 0);

  if (!holeCells) return;

  // The mark in the hole, on a light disc.
  const holePx = holeCells * cell;
  const cx = x + holeStart * cell + holePx / 2;
  const cy = y + holeStart * cell + holePx / 2;

  ctx.fillStyle = look.plate?.fill ?? PAPER;
  ctx.beginPath();
  ctx.arc(cx, cy, holePx * 0.7, 0, Math.PI * 2);
  ctx.fill();

  if (look.ring) {
    ctx.strokeStyle = look.ring;
    ctx.lineWidth = holePx * 0.07;
    ctx.beginPath();
    ctx.arc(cx, cy, holePx * 0.66, 0, Math.PI * 2);
    ctx.stroke();
  }

  if (logo) {
    const size = holePx;
    ctx.drawImage(logo, cx - size / 2, cy - size / 2, size, size);
  } else {
    ctx.fillStyle = eyeCenter;
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
