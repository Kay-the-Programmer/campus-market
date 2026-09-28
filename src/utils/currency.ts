/**
 * Money formatting for the whole app.
 *
 * Everything here trades in Zambian kwacha. The symbol is a prefix with no
 * space - K120 - which is how it is written locally and on the listings people
 * are copying prices from.
 *
 * This exists so the symbol appears in exactly one place. It used to be a
 * literal '$' typed into a dozen components, which is the kind of thing that
 * gets missed one screen at a time when it changes.
 */

export const CURRENCY_SYMBOL = 'K';

/**
 * What a listing says where a number would go when it has no asking price.
 *
 * Some services cannot be quoted before the seller has seen the job, so the
 * figure is settled in chat. The one thing this must never render as is "K0",
 * which reads as free - and free is a real, separate thing on a marketplace
 * where people give away furniture at the end of term.
 */
export const PRICE_ON_REQUEST = 'Price on request';

/** ISO code, for anywhere that needs to be unambiguous rather than short. */
export const CURRENCY_CODE = 'ZMW';

interface FormatOptions {
  /**
   * Force minor units on a whole number - K75 becomes K75.00.
   *
   * Rarely needed. By default a fractional price keeps its ngwee and a whole
   * one does not, so K75 reads like a price tag while K12.50 stays honest.
   * Blanket rounding is not an option for money: a cart that renders K12.50 as
   * "K13" is wrong by an amount someone is about to hand over in person.
   */
  decimals?: boolean;
}

/**
 * Format a number as kwacha: `formatPrice(1200)` → `K1,200`.
 *
 * Non-finite input formats as `K0` rather than throwing or rendering "KNaN" -
 * a price is chrome on a page that has other things to say, and a broken one
 * should not be what the reader takes away.
 */
export function formatPrice(value: number | string | null | undefined, opts: FormatOptions = {}): string {
  const n = typeof value === 'string' ? Number(value) : value;
  if (n === null || n === undefined || !Number.isFinite(n)) return `${CURRENCY_SYMBOL}0`;

  const fractional = opts.decimals || !Number.isInteger(n);

  return (
    CURRENCY_SYMBOL +
    n.toLocaleString(undefined, {
      minimumFractionDigits: fractional ? 2 : 0,
      maximumFractionDigits: fractional ? 2 : 0,
    })
  );
}

/**
 * A listing's price for display, including the case where there is not one.
 *
 * Separate from {@link formatPrice} rather than folded into it, because the two
 * absences mean opposite things. A null reaching formatPrice is a bad value on
 * something that does have a price, and "K0" is the right way to fail quietly.
 * A null Listing.price is the seller deliberately not quoting, and "K0" would
 * be a false claim about what the thing costs.
 */
export function formatListingPrice(value: number | null | undefined): string {
  return value == null ? PRICE_ON_REQUEST : formatPrice(value);
}
