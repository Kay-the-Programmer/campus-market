/**
 * Where everything on a poster goes.
 *
 * <p>One layout, measured rather than drawn, so the four styles differ only in
 * how they are painted and never in where things sit. Separating the two is
 * what lets the page size be decided before a single pixel is committed: the
 * canvas has to be sized before it is drawn on, and the size is not known until
 * the photo and the title have been measured.
 *
 * <h2>The page follows the photo</h2>
 *
 * <p>A listing photo is whatever shape the seller's phone produced, and the old
 * posters answered that with a fixed frame and a blurred wash filling whatever
 * the photo did not - which is to say, a landscape photo was shown small
 * between two bands of its own blur. Here the frame <em>is</em> the photo: it
 * takes the photo's aspect exactly, as large as the column and the height cap
 * allow, so nothing is ever cropped and nothing is ever letterboxed. The page
 * then grows or shrinks to suit, which is why a landscape listing comes out as
 * a near-square poster and a portrait one as a tall poster.
 *
 * <p>The height cap is the one compromise. Left uncapped, a 9:16 phone photo
 * would make a poster twice as tall as it is wide - unreadable as a preview in
 * any feed it is going to be sent to. Capped, a very tall photo is drawn
 * narrower than the column instead of being cut or boxed, which keeps the
 * promise that matters: all of the photo, at its own shape.
 */

import { fitContain, wrap, type Frame } from './canvas';
import type { QrCardContent } from './card';

/** One width for every poster, so a style's numbers are all in one scale. */
export const PAGE_W = 1080;

/** The side margin everything lines up to. */
export const MARGIN = 72;

/** The content column: the photo's widest, and the measure text wraps to. */
export const COLUMN_W = PAGE_W - MARGIN * 2;

/** The tallest a photo may be drawn. See the note on the height cap above. */
const PHOTO_MAX_H = 1040;

/** The top of the photo, which is the bottom of the header row. */
const PHOTO_TOP = 152;

/** The shape an absent photo reserves - 4:3, the least opinionated box. */
const EMPTY_ASPECT = 4 / 3;

const TITLE_SIZE = 54;
const TITLE_LEAD = 64;
const TITLE_MAX_LINES = 2;
const PRICE_SIZE = 72;

/**
 * The code's box, quiet zone included.
 *
 * <p>Sized for the hardest case rather than the typical one: on A4 this is
 * about 47mm of code, which a phone reads across a corridor. The style that is
 * actually printed asks for more - see `qrBox` below.
 */
const QR_BOX = 240;

/** Font stack. One family, three weights - the whole type system. */
export const FONT = 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif';

/** `font(800, 54)` - because the string form is unreadable inline. */
export const font = (weight: number, size: number) => `${weight} ${size}px ${FONT}`;

export interface Size {
  w: number;
  h: number;
}

export interface PosterLayout {
  page: Size;
  /** The photo, at the photo's own aspect. Centred in the column. */
  frame: Frame;
  title: {
    lines: string[];
    size: number;
    lead: number;
    /** Baseline of the first line. */
    baseline: number;
  };
  price: {
    size: number;
    baseline: number;
  };
  /** The hairline between the listing and the code. */
  dividerY: number;
  /** The code's box, including its quiet zone. */
  qr: Frame;
}

/**
 * Measures a poster for `content`.
 *
 * <p>`measure` only needs to be a context with the same font metrics as the one
 * that will draw - it is never drawn on, and its canvas size is irrelevant,
 * which is what allows this to run before the real canvas has a size.
 */
export function layoutPoster(
  measure: CanvasRenderingContext2D,
  content: QrCardContent,
  photo: HTMLImageElement | null,
  /**
   * How big the code is drawn, for the one style that has a reason to differ.
   * The row is as tall as the code, so this changes the page height with it.
   */
  qrBox: number = QR_BOX,
): PosterLayout {
  /* The frame takes the photo's own aspect, as large as fits the column and the
     cap. fitContain does exactly this and is the function the no-cropping
     promise is already tested through. */
  const aspect = photo && photo.width > 0 && photo.height > 0
    ? photo.width / photo.height
    : EMPTY_ASPECT;
  const fitted = fitContain(aspect, 1, COLUMN_W, PHOTO_MAX_H);

  const frame: Frame = {
    x: MARGIN + (COLUMN_W - fitted.w) / 2,
    y: PHOTO_TOP,
    w: fitted.w,
    h: fitted.h,
    radius: 28,
  };

  measure.font = font(800, TITLE_SIZE);
  const lines = wrap(measure, content.title, COLUMN_W, TITLE_MAX_LINES);

  const titleBaseline = frame.y + frame.h + 44 + TITLE_SIZE;
  const titleBottom = titleBaseline + (lines.length - 1) * TITLE_LEAD;
  const priceBaseline = titleBottom + 20 + PRICE_SIZE;
  const dividerY = priceBaseline + 40;
  const qrY = dividerY + 40;

  return {
    page: { w: PAGE_W, h: Math.round(qrY + qrBox + MARGIN) },
    frame,
    title: { lines, size: TITLE_SIZE, lead: TITLE_LEAD, baseline: titleBaseline },
    price: { size: PRICE_SIZE, baseline: priceBaseline },
    dividerY,
    qr: { x: PAGE_W - MARGIN - qrBox, y: qrY, w: qrBox, h: qrBox, radius: 0 },
  };
}
