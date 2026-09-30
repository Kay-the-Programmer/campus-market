import { describe, expect, it } from 'vitest';
import { categoryEmoji } from './categoryEmoji';

/*
 * The fallback is what most categories will show, because most will never have
 * a picture set. A guess being slightly off is fine - the name is printed
 * underneath it - but a guess being absurd is not, and every absurd one so far
 * has had the same cause: a short word sitting inside a longer, unrelated one.
 */
describe('categoryEmoji', () => {
  it('matches the obvious ones', () => {
    expect(categoryEmoji('Textbooks')).toBe('📚');
    expect(categoryEmoji('Food & Snacks')).toBe('🍔');
    expect(categoryEmoji('Furniture')).toBe('🛋️');
    expect(categoryEmoji('Pet Supplies')).toBe('🐾');
    expect(categoryEmoji('Tools & Home Improvement')).toBe('🔧');
  });

  it('is case and punctuation insensitive', () => {
    expect(categoryEmoji('SPORTS & OUTDOORS')).toBe('⚽');
    expect(categoryEmoji('sports')).toBe('⚽');
  });

  /*
   * The one that shipped: "Tutoring" contains "ring", so the jewellery rule
   * claimed it and the strip offered a wedding ring for a maths tutor.
   */
  it('does not let a short word inside a longer one win', () => {
    expect(categoryEmoji('Tutoring')).toBe('🎓');
    expect(categoryEmoji('Carpets')).not.toBe('🐾');
    expect(categoryEmoji('Outfits')).not.toBe('⚽');
    expect(categoryEmoji('Smart Devices')).not.toBe('🎨');
  });

  it('prefers the more specific rule where two could match', () => {
    // "Footwear" contains "wear", which is the clothing rule.
    expect(categoryEmoji('Footwear')).toBe('👟');
  });

  it('falls back rather than returning nothing', () => {
    expect(categoryEmoji('Miscellaneous bits')).toBe('🛍️');
    expect(categoryEmoji('')).toBe('🛍️');
    expect(categoryEmoji(undefined as unknown as string)).toBe('🛍️');
  });
});
