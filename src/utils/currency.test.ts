import { describe, expect, it } from 'vitest';
import { CURRENCY_SYMBOL, PRICE_ON_REQUEST, formatListingPrice, formatPrice } from './currency';

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

/*
 * The distinction this whole pair of functions exists to keep: a service the
 * seller quotes per job versus something that genuinely costs nothing. Both are
 * real listings on a student marketplace, and rendering the first as the second
 * advertises a price the seller never agreed to.
 */
describe('formatListingPrice', () => {
  it('says the price is on request when there is not one', () => {
    expect(formatListingPrice(null)).toBe(PRICE_ON_REQUEST);
    expect(formatListingPrice(undefined)).toBe(PRICE_ON_REQUEST);
  });

  it('still renders zero as a price, because free is not the same as unpriced', () => {
    // The failure this guards is a phone repair listed at "K0" - which reads as
    // free - because a null price was coerced somewhere on the way to the page.
    expect(formatListingPrice(0)).toBe('K0');
    expect(formatListingPrice(0)).not.toBe(PRICE_ON_REQUEST);
  });

  it('formats an ordinary price exactly as formatPrice does', () => {
    expect(formatListingPrice(12.5)).toBe(formatPrice(12.5));
    expect(formatListingPrice(75)).toBe('K75');
  });
});
