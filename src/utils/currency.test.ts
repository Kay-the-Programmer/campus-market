import { describe, expect, it } from 'vitest';
import { formatPrice, CURRENCY_SYMBOL } from './currency';

/*
 * Money is the one thing on the page a person will act on, so the cases that
 * matter here are the ones where a wrong answer costs someone real kwacha: a
 * fractional price silently rounded, or a bad value rendering as "KNaN" on a
 * listing card.
 */

describe('formatPrice', () => {
  it('renders a whole number without decimals, like a price tag', () => {
    expect(formatPrice(75)).toBe('K75');
  });

  it('keeps ngwee on a fractional price rather than rounding it away', () => {
    // The failure this guards: K12.50 shown as "K13" is wrong by an amount
    // someone is about to hand over in person.
    expect(formatPrice(12.5)).toBe('K12.50');
  });

  it('groups thousands', () => {
    expect(formatPrice(1200)).toBe('K1,200');
  });

  it('forces decimals when asked, even on a whole number', () => {
    expect(formatPrice(75, { decimals: true })).toBe('K75.00');
  });

  it('accepts a numeric string, since API payloads are not always typed', () => {
    expect(formatPrice('1200')).toBe('K1,200');
  });

  it.each([null, undefined, NaN, Infinity, 'not a number'])(
    'renders %p as zero rather than throwing or showing NaN',
    (input) => {
      // A price is chrome on a page with other things to say; a broken one
      // should not be what the reader takes away.
      expect(formatPrice(input as never)).toBe(`${CURRENCY_SYMBOL}0`);
    },
  );

  it('handles zero as a real value, not as missing', () => {
    expect(formatPrice(0)).toBe('K0');
  });
});
