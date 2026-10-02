/**
 * Draws the shareable poster for a listing.
 *
 * <p>The point is the hand-off between a phone screen and everything that is
 * not one: a code someone can scan off a noticeboard, a table or a status, plus
 * a picture of the thing worth scanning for. Which is why there is more than one
 * style - the poster that wins a scroll is not the poster you want to print in
 * black and white - and why the photo is always fitted whole rather than cropped
 * to the layout.
 *
 * <p>Drawn to a canvas because sharing needs a PNG file. Loaded lazily by the
 * share modal; the names of the styles live in utils/qrCardStyles, which is
 * cheap enough to import eagerly.
 */

import {
  DEFAULT_QR_CARD_STYLE, QR_CARD_STYLES, resolveQrCardStyle, type QrCardStyleId,
} from '../qrCardStyles';
import { CARD_H, CARD_W, LOGO_SRC, type QrCardContent, type QrCardDrawer } from './card';
import { loadImage } from './canvas';
import { drawClassic } from './styles/classic';
import { drawClean } from './styles/clean';
import { drawNight } from './styles/night';
import { drawVibrant } from './styles/vibrant';

export { CARD_H, CARD_W };
export type { QrCardContent };

/**
 * Every style, by id.
 *
 * <p>A Record rather than a lookup with a fallback: the compiler then refuses a
 * style that is offered in the picker but cannot be drawn, which is the one
 * mistake here that would reach a user as a blank card.
 */
const DRAWERS: Record<QrCardStyleId, QrCardDrawer> = {
  classic: drawClassic,
  vibrant: drawVibrant,
  clean: drawClean,
  night: drawNight,
};

/**
 * Renders the poster in the chosen style and hands back the canvas.
 *
 * <p>Async only because of the images; everything else is synchronous drawing.
 * An unknown style falls back to the default rather than throwing - see
 * resolveQrCardStyle.
 */
export async function renderQrCard(
  content: QrCardContent,
  style: QrCardStyleId | string = DEFAULT_QR_CARD_STYLE,
): Promise<HTMLCanvasElement> {
  const id = resolveQrCardStyle(style);
  // Styles are not all the same page: Classic is a 2:3 flyer, the rest are 4:5.
  const size = QR_CARD_STYLES.find((s) => s.id === id)!.size;

  const canvas = document.createElement('canvas');
  canvas.width = size.w;
  canvas.height = size.h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot generate the QR card.');

  // Both images are fetched together: one is local, one is remote.
  const [photo, logo] = await Promise.all([
    loadImage(content.imageUrl),
    loadImage(LOGO_SRC),
  ]);

  DRAWERS[id](ctx, content, { photo, logo });
  return canvas;
}

/**
 * The card as a PNG file, ready for the share sheet.
 *
 * <p>PNG rather than JPEG because the card has flat colour, text and a QR code,
 * where JPEG's artefacts show worst.
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
