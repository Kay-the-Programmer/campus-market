/**
 * Draws the shareable poster for a listing.
 *
 * <p>The point is the hand-off between a phone screen and everything that is
 * not one: a code someone can scan off a noticeboard, a table or a status, plus
 * a picture of the thing worth scanning for. Which is why the photo is the
 * largest thing on the page and is never cropped - see layout.ts, which sizes
 * the page around it.
 *
 * <p>Drawn to a canvas because sharing needs a PNG. Loaded lazily by the share
 * modal; the names of the styles live in utils/qrCardStyles, which is cheap
 * enough to import eagerly.
 */

import { DEFAULT_QR_CARD_STYLE, resolveQrCardStyle, type QrCardStyleId } from '../qrCardStyles';
import { LOGO_SRC, type QrCardContent } from './card';
import { loadImage } from './canvas';
import { layoutPoster } from './layout';
import { drawPoster, type PosterSkin } from './poster';
import { classicSkin } from './styles/classic';
import { cleanSkin } from './styles/clean';
import { nightSkin } from './styles/night';
import { vibrantSkin } from './styles/vibrant';

export type { QrCardContent };

/**
 * Every style, by id.
 *
 * <p>A Record rather than a lookup with a fallback: the compiler then refuses a
 * style that is offered in the picker but cannot be drawn, which is the one
 * mistake here that would reach a user as a blank card.
 */
const SKINS: Record<QrCardStyleId, PosterSkin> = {
  classic: classicSkin,
  vibrant: vibrantSkin,
  clean: cleanSkin,
  night: nightSkin,
};

/**
 * Renders the poster in the chosen style and hands back the canvas.
 *
 * <p>Async only because of the images; everything else is synchronous drawing.
 * An unknown style falls back to the default rather than throwing - see
 * resolveQrCardStyle.
 *
 * <p>The order matters: the photo has to be loaded before the page can be
 * measured, because its shape is what the page is sized from, and the canvas
 * has to be sized before anything is drawn on it - setting width or height
 * clears it.
 */
export async function renderQrCard(
  content: QrCardContent,
  style: QrCardStyleId | string = DEFAULT_QR_CARD_STYLE,
): Promise<HTMLCanvasElement> {
  const skin = SKINS[resolveQrCardStyle(style)];

  // Both images are fetched together: one is local, one is remote.
  const [photo, logo] = await Promise.all([
    loadImage(content.imageUrl),
    loadImage(LOGO_SRC),
  ]);

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot generate the QR card.');

  /* Measured on the context before it has a size. Font metrics do not depend on
     the canvas' dimensions, and the sizing below would wipe anything drawn. */
  const layout = layoutPoster(ctx, content, photo, skin.qrBox);
  canvas.width = layout.page.w;
  canvas.height = layout.page.h;

  drawPoster(ctx, content, { photo, logo }, skin, layout);
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
