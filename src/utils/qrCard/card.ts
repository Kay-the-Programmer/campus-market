/**
 * The palette every poster draws from, and the shape of the content it is
 * handed.
 *
 * <p>Kept in its own module so a style can import it without importing the
 * registry that lists the style - which would be a cycle.
 */

/*
 * Palette. ORANGE and NAVY are the logo's own colours; PINK and VIOLET bridge
 * them, which is what lets a loud page still read as the brand. YELLOW and MINT
 * are accents, in small doses. ABYSS and SLATE belong to the dark style, and
 * the two DEEP values are the printed flyer's warmer pair - near the app's, and
 * deliberately not the same.
 */
export const ORANGE = '#ff9600';
export const ORANGE_DEEP = '#f5901e';
export const PINK = '#ff2e7e';
export const VIOLET = '#7b2cff';
export const NAVY = '#092a6c';
export const NAVY_DEEP = '#1b2a4a';
export const INK = '#150a3d';
export const SLATE_INK = '#303a4d';
export const PAPER = '#ffffff';
export const YELLOW = '#ffe14d';
export const MINT = '#5cf2c0';
export const MUTED = '#6a7391';
export const ABYSS = '#070b1c';
export const SLATE = '#0d1430';
export const HAIRLINE = '#dfe7f7';

export const LOGO_SRC = '/images/logo.png';

export interface QrCardContent {
  title: string;
  /** Pre-formatted, so the card cannot disagree with the page about currency. */
  price: string;
  /** Struck through beside the price when there is a real reduction. */
  compareAtPrice?: string;
  /** Drives the flag beside the price. Whole percent. */
  discountPercent?: number;
  /** Shown under the code. The full URL is what the code itself carries. */
  prettyUrl: string;
  /** The listing's photo. Omitted or unreachable is fine - see drawPhoto. */
  imageUrl?: string;
  /** What the code encodes. */
  url: string;
  /** Short facts set beside the price: condition, campus zone. */
  chips?: string[];
  /** A small label of its own - the category. */
  eyebrow?: string;
}

/** The images a style is handed. Either can be null; neither is required. */
export interface CardImages {
  photo: HTMLImageElement | null;
  logo: HTMLImageElement | null;
}
