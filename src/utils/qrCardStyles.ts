/**
 * The poster styles a seller can pick between, and nothing else.
 *
 * <p>Deliberately separate from the drawing code in utils/qrCard: the share
 * modal needs the list to render its picker the moment it opens, while the
 * renderer - the QR encoder, three layouts, a canvas - is fetched lazily the
 * first time somebody actually shares something. Keeping the names here means
 * the picker costs the bundle a few hundred bytes instead of pulling the whole
 * chunk back onto the critical path.
 *
 * <p>So: no canvas, no `qrcode`, no imports beyond storage.
 */

import { readStored, writeStored } from './storage';

export type QrCardStyleId = 'classic' | 'vibrant' | 'clean' | 'night';

export interface CardSize {
  w: number;
  h: number;
}

/**
 * 4:5 portrait - the tallest aspect WhatsApp previews without cropping, which
 * is what the three in-app styles are drawn to.
 */
export const CARD_SIZE: CardSize = { w: 1080, h: 1350 };

/** 2:3, the flyer proportion the Classic poster was designed at. */
export const POSTER_SIZE: CardSize = { w: 1024, h: 1536 };

export interface QrCardStyleMeta {
  id: QrCardStyleId;
  /** The picker's label. One word, so four fit across a phone. */
  name: string;
  /** Said in terms of where the poster is going, not what it looks like. */
  hint: string;
  /** Three colours, drawn as a diagonal gradient on the picker's swatch. */
  swatch: [string, string, string];
  /** The page it is drawn at. The preview reserves space at this aspect. */
  size: CardSize;
}

/**
 * Order is the picker's order, and the first is the default.
 *
 * <p>Four, not more: a style you have to scroll to find is a style nobody uses,
 * and each one has to be worth maintaining as a layout.
 */
export const QR_CARD_STYLES: readonly QrCardStyleMeta[] = [
  {
    id: 'classic',
    name: 'Classic',
    hint: 'The standard CampusMarket flyer',
    swatch: ['#1B2A4A', '#F5901E', '#ffffff'],
    size: POSTER_SIZE,
  },
  {
    id: 'vibrant',
    name: 'Vibrant',
    hint: 'Loud, for a status or story',
    swatch: ['#ff9600', '#ff2e7e', '#7b2cff'],
    size: CARD_SIZE,
  },
  {
    id: 'clean',
    name: 'Clean',
    hint: 'Light on ink, for printing and pinning up',
    swatch: ['#ffffff', '#eaf0ff', '#092a6c'],
    size: CARD_SIZE,
  },
  {
    id: 'night',
    name: 'Night',
    hint: 'Dark, for a feed that is already dark',
    swatch: ['#070b1c', '#7b2cff', '#5cf2c0'],
    size: CARD_SIZE,
  },
];

export const DEFAULT_QR_CARD_STYLE: QrCardStyleId = QR_CARD_STYLES[0].id;

/**
 * A known style id, whatever came in.
 *
 * <p>Anything stored by an older build, or a style that has since been
 * removed, falls back to the default rather than failing to draw: a poster in
 * the wrong style is recoverable in one tap, a blank modal is not.
 */
export function resolveQrCardStyle(id: string | null | undefined): QrCardStyleId {
  return QR_CARD_STYLES.some((style) => style.id === id)
    ? (id as QrCardStyleId)
    : DEFAULT_QR_CARD_STYLE;
}

const STORAGE_KEY = 'cm_qr_card_style';

/** Their last pick, so a seller listing ten things chooses a style once. */
export function readQrCardStyle(): QrCardStyleId {
  return resolveQrCardStyle(readStored(STORAGE_KEY));
}

export function storeQrCardStyle(id: QrCardStyleId): void {
  writeStored(STORAGE_KEY, id);
}
