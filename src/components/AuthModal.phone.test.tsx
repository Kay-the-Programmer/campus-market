import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthModal } from './AuthModal';

const google = vi.fn();

vi.mock('../services/api', () => ({
  api: { auth: { google: (...args: unknown[]) => google(...args) } },
}));

vi.mock('../firebase', () => ({
  isGoogleSignInConfigured: true,
  signInWithGoogle: vi.fn(),
}));

/**
 * Registration happens on the second leg of Google sign-in - the popup proves
 * who someone is, then this form collects what the account needs. Handing the
 * modal a pending token is how that step is reached without a real popup.
 */
async function renderProfileStep() {
  // First call: the exchange that reports the profile is incomplete.
  google.mockResolvedValueOnce({
    ok: true, needsProfile: true, user: { email: 'student@campus.edu' },
  });
  render(<AuthModal isOpen onClose={vi.fn()} pendingGoogleToken="firebase-id-token" />);
  await screen.findByText(/few quick questions/i);
  // The zone is required too, and is not what these tests are about.
  fireEvent.click(screen.getByText(/downschool/i));
  google.mockClear();
}

const phoneBox = () => screen.getByPlaceholderText('+260 97 123 4567');
const finish = () => fireEvent.click(screen.getByRole('button', { name: /finish setup/i }));

beforeEach(() => {
  google.mockReset();
});

/*
 * The number is what lets two people find each other at a handover, which is
 * the one thing the site cannot do for them. These tests are about the rule
 * holding at the point of registration - not about the format, which is
 * checked loosely on purpose.
 */
describe('registration requires a phone number', () => {
  it('refuses to submit without one, and sends nothing', async () => {
    await renderProfileStep();

    finish();

    await screen.findByText(/add a phone number/i);
    // The point of validating here rather than letting the server answer: no
    // round trip, so nothing half-registers.
    expect(google).not.toHaveBeenCalled();
  });

  it('refuses a number that is too short to be one', async () => {
    await renderProfileStep();

    fireEvent.change(phoneBox(), { target: { value: '0971' } });
    finish();

    await screen.findByText(/does not look right/i);
    expect(google).not.toHaveBeenCalled();
  });

  it('accepts the formats people actually type, and sends the number', async () => {
    for (const typed of ['+260 97 123 4567', '0971234567', '097-123-4567']) {
      google.mockReset();
      google.mockResolvedValueOnce({
        ok: true, needsProfile: true, user: { email: 'student@campus.edu' },
      });
      const view = render(
        <AuthModal isOpen onClose={vi.fn()} pendingGoogleToken="firebase-id-token" />,
      );
      await screen.findAllByText(/few quick questions/i);
      fireEvent.click(view.getAllByText(/downschool/i)[0]);
      google.mockClear();
      google.mockResolvedValue({ ok: true, user: { email: 'student@campus.edu' } });

      fireEvent.change(view.getByPlaceholderText('+260 97 123 4567'), { target: { value: typed } });
      fireEvent.click(view.getByRole('button', { name: /finish setup/i }));

      await waitFor(() => expect(google).toHaveBeenCalled());
      expect(google.mock.calls[0][1]).toMatchObject({ phone: typed });
      view.unmount();
    }
  });

  it('no longer tells people they can add it later', async () => {
    await renderProfileStep();

    expect(screen.queryByText(/add it later/i)).toBeNull();
  });
});
