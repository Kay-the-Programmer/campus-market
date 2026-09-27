import { describe, expect, it } from 'vitest';
import { contrastRatio, promoAppearance, PROMO_THEME_GRADIENT, PROMO_THEME_TILE } from './types';

const base = { theme: 'BLUE' as const, bgColor: null, textColor: null, buttonColor: null, buttonTextColor: null };

/**
 * Custom colours are overrides, not a replacement, and the seam between them
 * is fiddly: a theme is Tailwind *classes* while a custom colour is an inline
 * *style*, and leaving both on one element lets the cascade decide. Every case
 * below is really asking "does exactly one of the two win?".
 */
describe('promoAppearance', () => {
  it('falls back to the theme gradient when nothing is customised', () => {
    const look = promoAppearance(base, 'carousel');
    expect(look.backgroundClass).toContain(PROMO_THEME_GRADIENT.BLUE);
    expect(look.panelStyle).toEqual({});
    expect(look.customBackground).toBe(false);
  });

  it('falls back to the tile tint for bento panels, not the gradient', () => {
    // A tile sits on a light page and a slide does not; showing one the
    // other's colours is the bug this split exists to prevent.
    const look = promoAppearance(base, 'tile');
    expect(look.backgroundClass).toBe(PROMO_THEME_TILE.BLUE.bg);
    expect(look.textClass).toBe(PROMO_THEME_TILE.BLUE.text);
  });

  it('drops the gradient class entirely once a background is set', () => {
    const look = promoAppearance({ ...base, bgColor: '#123456' }, 'carousel');
    expect(look.backgroundClass).toBe('');
    expect(look.panelStyle.backgroundColor).toBe('#123456');
    expect(look.customBackground).toBe(true);
  });

  it('drops the theme text class once a text colour is set', () => {
    const look = promoAppearance({ ...base, textColor: '#ffffff' }, 'tile');
    expect(look.textClass).toBe('');
    expect(look.panelStyle.color).toBe('#ffffff');
  });

  it('overrides one colour without disturbing the others', () => {
    // The common case: a sponsor's button colour on an otherwise stock panel.
    const look = promoAppearance({ ...base, buttonColor: '#ff0000' }, 'carousel');
    expect(look.buttonStyle).toEqual({ backgroundColor: '#ff0000' });
    expect(look.backgroundClass).toContain(PROMO_THEME_GRADIENT.BLUE);
    expect(look.panelStyle).toEqual({});
  });

  it('treats empty strings as unset - the editor sends "" for cleared', () => {
    const look = promoAppearance({ ...base, bgColor: '', textColor: '' }, 'carousel');
    expect(look.backgroundClass).toContain(PROMO_THEME_GRADIENT.BLUE);
    expect(look.panelStyle).toEqual({});
  });
});

describe('contrastRatio', () => {
  it('is 21 for black on white, the maximum', () => {
    expect(Math.round(contrastRatio('#000000', '#ffffff'))).toBe(21);
  });

  it('is 1 for a colour against itself', () => {
    expect(contrastRatio('#2563eb', '#2563eb')).toBeCloseTo(1, 5);
  });

  it('is symmetric - neither argument is "the background"', () => {
    expect(contrastRatio('#2563eb', '#ffffff')).toBeCloseTo(contrastRatio('#ffffff', '#2563eb'), 10);
  });

  it('flags white on light grey as below the 4.5 threshold the editor warns at', () => {
    expect(contrastRatio('#ffffff', '#eeeeee')).toBeLessThan(4.5);
  });

  it('passes white on the brand blue, which the presets rely on', () => {
    expect(contrastRatio('#ffffff', '#2563eb')).toBeGreaterThan(4.5);
  });
});
