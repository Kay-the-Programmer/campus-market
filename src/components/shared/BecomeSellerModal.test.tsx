import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BecomeSellerModal } from './BecomeSellerModal';
import { SELLER_TERMS_VERSION } from '../../data/sellerTerms';
import { AuthSession } from '../../types';

const becomeSeller = vi.fn();

vi.mock('../../services/api', () => ({
  api: {
    auth: {
      becomeSeller: (...args: unknown[]) => becomeSeller(...args),
      getSellerApplicationMessages: vi.fn().mockResolvedValue({ messages: [] }),
      replyToSellerApplication: vi.fn(),
    },
  },
}));

const buyer: AuthSession = {
  id: 'u1',
  name: 'Sam',
  email: 'sam@campus.edu',
  avatar: '',
  role: 'customer',
  accountType: 'BUYER',
  sellerApprovalStatus: 'NOT_REQUESTED',
  canSell: false,
  hasActiveListings: false,
  campusZone: 'DOWNSCHOOL',
};

const openModal = (user: Partial<AuthSession> = {}) =>
  render(
    <BecomeSellerModal
      isOpen
      onClose={vi.fn()}
      currentUser={{ ...buyer, ...user }}
      onUpgraded={vi.fn()}
    />,
  );

const tickTerms = () => fireEvent.click(screen.getByRole('checkbox'));
const apply = () => fireEvent.click(screen.getByRole('button', { name: /apply to sell/i }));

/**
 * The terms are what an admin points at when they refuse an application or
 * pull a listing, so what is pinned here is that nothing can be filed without
 * them: the acceptance is a deliberate act, it reaches the server, and it is
 * never carried over from a previous attempt.
 */
describe('BecomeSellerModal seller terms', () => {
  beforeEach(() => {
    becomeSeller.mockReset();
    becomeSeller.mockResolvedValue({ success: true, user: { ...buyer, accountType: 'SELLER' } });
  });

  it('shows the terms next to the decision, not behind a link', () => {
    openModal();
    expect(screen.getByRole('region', { name: /seller terms/i })).toBeInTheDocument();
    // A clause, to catch the box rendering empty.
    expect(screen.getByText(/Applying is not approval/)).toBeInTheDocument();
    expect(screen.getByRole('checkbox')).not.toBeChecked();
  });

  it('refuses to apply until the terms are accepted, and says why', async () => {
    openModal();
    apply();

    expect(await screen.findByText(/accept the seller terms/i)).toBeInTheDocument();
    // The point of the test: no application was filed.
    expect(becomeSeller).not.toHaveBeenCalled();
  });

  it('sends the accepted version, so the server can record what was shown', async () => {
    openModal();
    tickTerms();
    apply();

    await waitFor(() => expect(becomeSeller).toHaveBeenCalledTimes(1));
    expect(becomeSeller).toHaveBeenCalledWith(
      expect.objectContaining({ acceptedTermsVersion: SELLER_TERMS_VERSION }),
    );
  });

  it('asks again when someone re-applies after a refusal', async () => {
    // A rejected applicant is filing a NEW application, against whatever the
    // terms say today - so a tick left over from the last attempt would be an
    // acceptance nobody made.
    openModal({ sellerApprovalStatus: 'REJECTED', sellerApprovalReason: 'Tell us what you sell.' });

    expect(screen.getByRole('checkbox')).not.toBeChecked();
    // The rejected view also mounts the admin thread; waiting for it keeps its
    // load out of the next test's console.
    await screen.findByText(/If an admin has a question/);
  });
});
