import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BottomNav } from './BottomNav';
import { AuthSession, ViewType } from '../../types';

/**
 * Regression cover for React error #300 ("Rendered fewer hooks than
 * expected").
 *
 * BottomNav returns null for admins and on the Sell screen. Those early
 * returns once sat above a useCallback, so the component ran eight hooks as
 * a customer and seven the moment it exited early - and React treats a change
 * in hook count between renders as a corrupted component. Signing in as an
 * admin took the whole app to the error screen.
 *
 * Both tests re-render the SAME mounted instance across the transition. A
 * fresh mount in the early-return state would pass even with the bug, because
 * there is no previous render to disagree with.
 */

const session = (over: Partial<AuthSession>): AuthSession => ({
  id: 'u1',
  name: 'Test',
  email: 'test@example.com',
  avatar: '',
  role: 'customer',
  accountType: 'BUYER',
  sellerApprovalStatus: 'NOT_REQUESTED',
  canSell: false,
  hasActiveListings: false,
  ...over,
});

const props = (currentUser: AuthSession, currentView: ViewType = 'browse') => ({
  currentView,
  onNavigate: () => {},
  onOpenAuthModal: () => {},
  savedCount: 0,
  cartCount: 0,
  unreadMessagesCount: 0,
  currentUser,
});

describe('BottomNav hook stability', () => {
  it('survives a customer becoming an admin without remounting', () => {
    const { rerender, container } = render(<BottomNav {...props(session({ role: 'guest' }))} />);
    expect(container.firstChild).not.toBeNull();

    // The exact transition that crashed production: same instance, role flips.
    expect(() => rerender(<BottomNav {...props(session({ role: 'admin' }))} />)).not.toThrow();
    expect(container.firstChild).toBeNull();
  });

  it('survives navigating to a screen that hides it, and back', () => {
    const user = session({ role: 'customer', accountType: 'SELLER', canSell: true });
    const { rerender, container } = render(<BottomNav {...props(user, 'browse')} />);
    expect(container.firstChild).not.toBeNull();

    // 'sell' is in HIDES_BOTTOM_NAV - the same early return, hit by sellers.
    expect(() => rerender(<BottomNav {...props(user, 'sell')} />)).not.toThrow();
    expect(container.firstChild).toBeNull();

    // And the hook count has to come back up cleanly too (#310 is the mirror bug).
    expect(() => rerender(<BottomNav {...props(user, 'browse')} />)).not.toThrow();
    expect(container.firstChild).not.toBeNull();
  });
});

/**
 * Who the bar offers Sell to, and the fact that Search is not in it.
 *
 * Sell was the centrepiece of the bar for everyone, so the largest control on
 * a buyer's screen was the one they were not allowed to press - every tap
 * answered with the upgrade modal. Search was added to the bar and then moved
 * to the header's full-screen search, which is the only place it should be
 * reachable from now.
 */
describe('BottomNav, who gets which tabs', () => {
  const sellButton = () => screen.queryByLabelText('Sell an item');

  it('gives a buyer no Sell button', () => {
    render(<BottomNav {...props(session({ role: 'customer', canSell: false }))} />);
    expect(sellButton()).toBeNull();
  });

  it('gives a guest no Sell button', () => {
    render(<BottomNav {...props(session({ role: 'guest' }))} />);
    expect(sellButton()).toBeNull();
  });

  it('gives an approved seller the Sell button', () => {
    render(<BottomNav {...props(session({
      role: 'customer', accountType: 'SELLER', canSell: true,
    }))} />);
    expect(sellButton()).not.toBeNull();
  });

  it('keeps Sell for a seller who has not listed anything yet', () => {
    // canSell, not isSellerState: being allowed to post is the whole point of
    // the button, and someone with nothing live yet is exactly who needs it.
    render(<BottomNav {...props(session({
      role: 'customer', accountType: 'SELLER', canSell: true, hasActiveListings: false,
    }))} />);
    expect(sellButton()).not.toBeNull();
  });

  it('has no Search tab - the header owns search now', () => {
    render(<BottomNav {...props(session({ role: 'customer' }))} />);
    expect(screen.queryByLabelText('Search')).toBeNull();
  });
});
