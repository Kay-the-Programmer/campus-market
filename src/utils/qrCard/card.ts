/**
 * What every poster style shares: the page size, the palette, and the shape of
 * the content it is handed.
 *
 * <p>Kept in its own module so a style can import it without importing the
 * registry that lists the style - which would be a cycle.
 */

import { CARD_SIZE } from '../qrCardStyles';

/**
 * Portrait, at the aspect ratio WhatsApp previews without cropping. Declared
 * with the styles rather than here, because the picker has to reserve space at
 * a style's aspect before this module is fetched - the Classic poster is a
 * different shape.
 */
export const CARD_W = CARD_SIZE.w;
export const CARD_H = CARD_SIZE.h;

/** The side margin every style keeps to, so the three look related. */
export const MARGIN = 72;

/*
 * Palette. ORANGE and NAVY are the logo's own colours; PINK and VIOLET bridge
 * them, which is what lets a loud gradient still read as the brand. YELLOW and
 * MINT are sticker colours - small doses only. ABYSS and SLATE belong to the
 * dark style.
 */
export const ORANGE = '#ff9600';
export const PINK = '#ff2e7e';
export const VIOLET = '#7b2cff';
export const NAVY = '#092a6c';
export const INK = '#150a3d';
export const PAPER = '#ffffff';
export const YELLOW = '#ffe14d';
export const MINT = '#5cf2c0';
export const MUTED = '#6a7391';
export const ABYSS = '#070b1c';
export const SLATE = '#0d1430';
export const HAIRLINE = '#dfe7f7';

export const LOGO_SRC = '/images/logo.png';

/** The line at the foot of every style. */
export const TAGLINE = 'Buy, sell and trade with students you can actually meet ✨';

export interface QrCardContent {
  title: string;
  /** Pre-formatted, so the card cannot disagree with the page about currency. */
  price: string;
  /** Struck through beside the price when there is a real reduction. */
  compareAtPrice?: string;
  /** Drives the corner badge. Whole percent. */
  discountPercent?: number;
  /** Shown under the code. The full URL is what the code itself carries. */
  prettyUrl: string;
  /** The listing's photo. Omitted or unreachable is fine - see drawPhoto. */
  imageUrl?: string;
  /** What the code encodes. */
  url: string;
  /** Short facts shown with the photo: condition, campus zone. */
  chips?: string[];
  /** A small label of its own - the category. */
  eyebrow?: string;
  /**
   * The spec line under the title on the Classic poster, already joined. Falls
   * back to the chips where a style needs a line and this is absent.
   */
  details?: string;
  /** Where to meet. Kept apart from the chips: Classic gives it its own row. */
  location?: string;
}

/** The images a style is handed. Either can be null; neither is required. */
export interface CardImages {
  photo: HTMLImageElement | null;
  logo: HTMLImageElement | null;
}

/**
 * One style's whole job: draw a finished 1080x1350 poster.
 *
 * <p>Synchronous on purpose. Every fetch a card needs happens before a drawer
 * is called, so a style cannot leave a half-painted canvas behind an await.
 */
export type QrCardDrawer = (
  ctx: CanvasRenderingContext2D,
  content: QrCardContent,
  images: CardImages,
) => void;
