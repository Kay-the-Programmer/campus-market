import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationSettings } from './PushOptIn';
import { ToastProvider } from './ToastProvider';
import { api } from '../../services/api';
import { NotificationPreferences } from '../../types';

/**
 * Email turned these settings from one channel into two, and the interesting
 * cases are all about the boundary between them:
 *
 * <ul>
 *   <li>The category rows are shared, so they must stay usable for someone who
 *       keeps email on and push off. They used to be gated on pushEnabled
 *       alone, which would have shown them as unavailable.</li>
 *   <li>Marketing is a separate consent from notification email, and the copy
 *       has to say so - otherwise turning off announcements reads as though it
 *       also stops order emails.</li>
 *   <li>A toggle with no SMTP behind it must be disabled rather than silently
 *       doing nothing.</li>
 * </ul>
 */

const prefs = (over: Partial<NotificationPreferences> = {}): NotificationPreferences => ({
  pushEnabled: true,
  emailEnabled: true,
  marketingEmails: true,
  messages: true,
  orders: true,
  reviews: true,
  priceDrops: true,
  systemUpdates: true,
  deviceCount: 1,
  pushConfigured: true,
  emailConfigured: true,
  ...over,
});

const getPreferences = vi.fn();
const updatePreferences = vi.fn();

beforeEach(() => {
  getPreferences.mockReset().mockResolvedValue({ preferences: prefs() });
  updatePreferences.mockReset().mockResolvedValue({ success: true, preferences: prefs() });
  vi.spyOn(api.notifications, 'getPreferences').mockImplementation(getPreferences);
  vi.spyOn(api.notifications, 'updatePreferences').mockImplementation(updatePreferences);
});

/**
 * NotificationSettings calls useToast, which throws outside a provider - so
 * every render goes through this rather than repeating the wrapper six times.
 */
const show = () => render(
  <ToastProvider>
    <NotificationSettings />
  </ToastProvider>,
);

/**
 * Queried as `switch`, not `button`: Switch sets role="switch" explicitly,
 * which replaces the element's implicit button role rather than adding to it.
 */
const toggle = (label: string) => screen.getByRole('switch', { name: label });

describe('NotificationSettings', () => {
  it('offers both channel switches', async () => {
    show();
    expect(await screen.findByText('Push notifications')).toBeInTheDocument();
    expect(screen.getByText('Email')).toBeInTheDocument();
  });

  it('keeps shared categories usable when push is off but email is on', async () => {
    getPreferences.mockResolvedValue({ preferences: prefs({ pushEnabled: false }) });
    show();
    await screen.findByText('Push notifications');

    // The wrapper around the category rows must not be the dimmed/inert one:
    // these rows govern email too, and email is still on.
    const row = screen.getByText('Orders').closest('div')?.parentElement?.parentElement;
    expect(row?.className ?? '').not.toContain('pointer-events-none');
  });

  it('dims the categories only when both channels are off', async () => {
    getPreferences.mockResolvedValue({
      preferences: prefs({ pushEnabled: false, emailEnabled: false }),
    });
    show();
    await screen.findByText('Push notifications');

    const row = screen.getByText('Orders').closest('div')?.parentElement?.parentElement;
    expect(row?.className ?? '').toContain('pointer-events-none');
  });

  it('disables the email switches when the server has no SMTP', async () => {
    getPreferences.mockResolvedValue({ preferences: prefs({ emailConfigured: false }) });
    show();
    await screen.findByText('Push notifications');

    expect(toggle('Email notifications')).toBeDisabled();
    expect(toggle('Announcements and offers')).toBeDisabled();
    expect(screen.getByText(/isn.t set up on this server/)).toBeInTheDocument();
    // Push is unaffected by email being unconfigured.
    expect(toggle('Push notifications')).toBeEnabled();
  });

  it('sends marketing consent as its own field, not as emailEnabled', async () => {
    show();
    await screen.findByText('Push notifications');

    fireEvent.click(toggle('Announcements and offers'));
    // waitFor, not a bare expect: the click starts an async save that sets
    // state when it resolves, and asserting synchronously leaves that update
    // outside act() - which React reports as a warning on an otherwise
    // passing test.
    await waitFor(() =>
      expect(updatePreferences).toHaveBeenCalledWith({ marketingEmails: false }),
    );
  });

  it('says that opting out of announcements leaves order email alone', async () => {
    show();
    await screen.findByText('Push notifications');
    expect(
      screen.getByText(/never affects email about\s+your own orders and messages/),
    ).toBeInTheDocument();
  });
});
