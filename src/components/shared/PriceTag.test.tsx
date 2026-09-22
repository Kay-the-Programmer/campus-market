import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { PriceTag, DiscountFlag } from './PriceTag';

/*
 * These are claims about money, which is why they are pinned down here.
 *
 * A struck-through price tells a buyer they are saving something. If this
 * component ever draws one from `compareAtPrice` alone - rather than from the
 * `discountPercent` the server computes against the same test the deals filter
 * uses - the app starts advertising savings that the filter does not agree
 * exist, and in the worst case advertises a "saving" on an item whose old
 * price was lower than the new one.
 */
describe('PriceTag', () => {
  it('shows only the asking price when nothing is reduced', () => {
    render(<PriceTag listing={{ price: 120 }} />);

    expect(screen.getByText(/120/)).toBeInTheDocument();
    expect(document.querySelector('.line-through')).toBeNull();
  });

  it('shows the old price and the saving when the server says there is one', () => {
    render(<PriceTag listing={{ price: 80, compareAtPrice: 120, discountPercent: 33 }} />);

    expect(document.querySelector('.line-through')).toHaveTextContent(/120/);
    expect(screen.getByText('−33%')).toBeInTheDocument();
  });

  it('draws no saving when the server sent a comparison but no percentage', () => {
    // The server withholds discountPercent whenever the comparison is not a
    // real one - equal prices, or a "was" below what is being asked. Trusting
    // compareAtPrice on its own here is exactly how a fake discount ships.
    render(<PriceTag listing={{ price: 100, compareAtPrice: 90 }} />);

    expect(document.querySelector('.line-through')).toBeNull();
  });

  it('keeps the unit attached to the price it qualifies', () => {
    render(<PriceTag listing={{ price: 50, priceUnit: '/hr' }} />);

    expect(screen.getByText('/hr')).toBeInTheDocument();
  });
});

describe('DiscountFlag', () => {
  it('renders nothing without a percentage, so cards stay unmarked', () => {
    const { container } = render(<DiscountFlag />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the saving when there is one', () => {
    render(<DiscountFlag percent={25} />);
    expect(screen.getByText('25% off')).toBeInTheDocument();
  });
});
