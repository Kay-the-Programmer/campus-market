import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_QR_CARD_STYLE, QR_CARD_STYLES, readQrCardStyle, resolveQrCardStyle, storeQrCardStyle,
} from './qrCardStyles';

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('the poster styles on offer', () => {
  it('has no duplicate ids, and a default that is one of them', () => {
    const ids = QR_CARD_STYLES.map((style) => style.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain(DEFAULT_QR_CARD_STYLE);
  });

  /* The Classic flyer is the house poster, so it is what someone who never
     opens the picker sends. Pinned here because it is a product decision, not
     an accident of array order. */
  it('offers the Classic flyer first, and uses it by default', () => {
    expect(QR_CARD_STYLES[0].id).toBe('classic');
    expect(DEFAULT_QR_CARD_STYLE).toBe('classic');
  });

  it('gives every style a name, a hint and three swatch colours', () => {
    QR_CARD_STYLES.forEach((style) => {
      expect(style.name).toBeTruthy();
      expect(style.hint).toBeTruthy();
      expect(style.swatch).toHaveLength(3);
    });
  });

  /* The preview reserves space at these before the renderer is even fetched, so
     a zero or a transposed pair would show as a collapsed box in the dialog. */
  it('declares a sane page size for every style', () => {
    QR_CARD_STYLES.forEach((style) => {
      expect(style.size.w).toBeGreaterThanOrEqual(1000);
      expect(style.size.h).toBeGreaterThan(style.size.w);
    });
  });
});

describe('resolving a stored id', () => {
  it('keeps one it recognises', () => {
    QR_CARD_STYLES.forEach((style) => {
      expect(resolveQrCardStyle(style.id)).toBe(style.id);
    });
  });

  /*
   * The case this exists for: a style named in an older build, or one since
   * removed, is still sitting in localStorage. A poster in the wrong style is
   * one tap from being right; a modal that cannot draw is not.
   */
  it.each([null, undefined, '', 'retro', 'CLASSIC'])('falls back for %p', (stored) => {
    expect(resolveQrCardStyle(stored)).toBe(DEFAULT_QR_CARD_STYLE);
  });
});

describe('remembering the choice', () => {
  it('reads back what was stored', () => {
    storeQrCardStyle('clean');
    expect(readQrCardStyle()).toBe('clean');
  });

  it('starts from the default with nothing stored', () => {
    expect(readQrCardStyle()).toBe(DEFAULT_QR_CARD_STYLE);
  });

  /* Reading localStorage throws outright in Safari's private mode and with
     site data blocked, which must not take the share modal down with it. */
  it('survives storage that throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });

    expect(() => storeQrCardStyle('night')).not.toThrow();
    expect(readQrCardStyle()).toBe(DEFAULT_QR_CARD_STYLE);
  });
});
