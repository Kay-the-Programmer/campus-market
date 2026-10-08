import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { VerifiedBadge } from './VerifiedBadge';

/*
 * The badge is a claim about a person, so the thing worth pinning down is that
 * the claim is still readable when the word is dropped. The compact variant
 * exists because a rail card is 160px wide; if it ever loses its accessible
 * name, a screen reader gets an unlabelled decoration where sighted users get
 * the only trust signal on the card.
 */
describe('VerifiedBadge', () => {
  it('names the seller as verified', () => {
    render(<VerifiedBadge />);

    expect(screen.getByText('Verified')).toBeInTheDocument();
  });

  it('keeps an accessible name when the word is dropped', () => {
    render(<VerifiedBadge compact />);

    expect(screen.queryByText('Verified')).toBeNull();
    expect(screen.getByText('Verified seller')).toHaveClass('sr-only');
  });

  it('takes positioning from the caller, since each grid places it differently', () => {
    const { container } = render(<VerifiedBadge className="absolute bottom-2 left-2" />);

    expect(container.firstChild).toHaveClass('absolute', 'bottom-2', 'left-2');
  });
});
