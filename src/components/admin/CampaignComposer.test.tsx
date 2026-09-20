import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CampaignComposer } from './CampaignComposer';
import { api } from '../../services/api';

/**
 * The composer is the one admin screen whose mistakes reach people outside the
 * app and cannot be recalled, so these cover the guardrails rather than the
 * layout: that the recipient count tracks the audience, that a first click
 * confirms instead of sending, and that a refused campaign surfaces the
 * server's reason instead of a success toast.
 *
 * fireEvent rather than user-event, which is not a dependency of this project
 * and is not worth adding for five tests - none of these need real pointer or
 * keyboard sequencing, only a changed value and a click.
 */

const getCampaignAudience = vi.fn();
const getCampaigns = vi.fn();
const sendCampaign = vi.fn();

/** Fills both required fields so the Send button is enabled. */
function compose(subject = 'Hello', body = 'Body text') {
  fireEvent.change(screen.getByPlaceholderText(/Textbook season/), { target: { value: subject } });
  fireEvent.change(document.querySelector('textarea') as HTMLTextAreaElement, {
    target: { value: body },
  });
}

beforeEach(() => {
  getCampaignAudience.mockReset().mockResolvedValue({ recipientCount: 214 });
  getCampaigns.mockReset().mockResolvedValue({ campaigns: [] });
  sendCampaign.mockReset().mockResolvedValue({ success: true, campaign: undefined });

  vi.spyOn(api.admin, 'getCampaignAudience').mockImplementation(getCampaignAudience);
  vi.spyOn(api.admin, 'getCampaigns').mockImplementation(getCampaigns);
  vi.spyOn(api.admin, 'sendCampaign').mockImplementation(sendCampaign);
});

describe('CampaignComposer', () => {
  it('states the recipient count for the selected audience', async () => {
    render(<CampaignComposer onNotice={() => {}} />);
    expect(await screen.findByText('214 recipients')).toBeInTheDocument();
    expect(getCampaignAudience).toHaveBeenCalledWith('ALL');
  });

  it('re-counts when the audience changes, so the number is never stale', async () => {
    render(<CampaignComposer onNotice={() => {}} />);
    await screen.findByText('214 recipients');

    getCampaignAudience.mockResolvedValue({ recipientCount: 7 });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'APPROVED_SELLERS' } });

    expect(await screen.findByText('7 recipients')).toBeInTheDocument();
    expect(getCampaignAudience).toHaveBeenLastCalledWith('APPROVED_SELLERS');
  });

  it('confirms before sending rather than sending on the first click', async () => {
    render(<CampaignComposer onNotice={() => {}} />);
    await screen.findByText('214 recipients');
    compose();

    fireEvent.click(screen.getByRole('button', { name: /Send campaign/ }));

    expect(await screen.findByText(/cannot be undone or recalled once sent/)).toBeInTheDocument();
    expect(sendCampaign).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Send now/ }));
    await waitFor(() => expect(sendCampaign).toHaveBeenCalledWith('Hello', 'Body text', 'ALL'));
  });

  it('shows the server reason when a campaign comes back FAILED', async () => {
    // A 200 whose campaign is FAILED: the server refuses up front when SMTP is
    // unconfigured rather than queueing something undeliverable.
    sendCampaign.mockResolvedValue({
      success: true,
      campaign: {
        id: '1',
        subject: 'Hello',
        body: 'Body text',
        audience: 'ALL',
        status: 'FAILED',
        recipientCount: 0,
        sentCount: 0,
        failedCount: 0,
        error: 'No SMTP is configured, so nothing was sent.',
        createdAt: new Date().toISOString(),
      },
    });

    const onNotice = vi.fn();
    render(<CampaignComposer onNotice={onNotice} />);
    await screen.findByText('214 recipients');
    compose();

    fireEvent.click(screen.getByRole('button', { name: /Send campaign/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Send now/ }));

    expect(await screen.findByText(/No SMTP is configured/)).toBeInTheDocument();
    // No success toast for something that did not send.
    expect(onNotice).not.toHaveBeenCalled();
  });

  it('keeps Send disabled until there is both a subject and a message', async () => {
    render(<CampaignComposer onNotice={() => {}} />);
    await screen.findByText('214 recipients');

    const send = screen.getByRole('button', { name: /Send campaign/ });
    expect(send).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText(/Textbook season/), {
      target: { value: 'Subject only' },
    });
    expect(send).toBeDisabled();

    fireEvent.change(document.querySelector('textarea') as HTMLTextAreaElement, {
      target: { value: 'Now a body' },
    });
    expect(send).toBeEnabled();
  });
});
