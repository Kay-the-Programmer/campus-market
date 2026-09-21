import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ApplicationThread } from './ApplicationThread';
import { ApplicationMessage } from '../../types';

const msg = (over: Partial<ApplicationMessage>): ApplicationMessage => ({
  id: 'm1',
  fromAdmin: true,
  senderName: 'Admin',
  body: 'What will you be selling?',
  createdAt: new Date().toISOString(),
  read: false,
  ...over,
});

/**
 * One component serves both sides of the conversation, so the tests pin the
 * thing that differs between them - which bubbles read as "mine" - and the
 * behaviour they share: load on mount, send appends what the server stored,
 * and the composer disappears when the conversation is closed.
 */
describe('ApplicationThread', () => {
  it('loads the thread on mount and attributes messages by side', async () => {
    const load = vi.fn().mockResolvedValue({
      messages: [msg({ id: 'a', fromAdmin: true, senderName: 'Admin', body: 'Question?' }),
                 msg({ id: 'b', fromAdmin: false, senderName: 'Sam', body: 'Textbooks.' })],
    });
    render(<ApplicationThread viewer="applicant" load={load} send={vi.fn()} emptyHint="" />);

    expect(await screen.findByText('Question?')).toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(1);
    // The applicant is viewing: the admin's message is theirs-to-read, the
    // applicant's own is "You".
    expect(screen.getByText(/^Admin ·/)).toBeInTheDocument();
    expect(screen.getByText(/^You ·/)).toBeInTheDocument();
  });

  it('shows the empty hint when there is nothing yet', async () => {
    const load = vi.fn().mockResolvedValue({ messages: [] });
    render(<ApplicationThread viewer="admin" load={load} send={vi.fn()} emptyHint="Ask them anything." />);
    expect(await screen.findByText('Ask them anything.')).toBeInTheDocument();
  });

  it('sends on submit and appends the stored message, not the draft', async () => {
    const stored = msg({ id: 'srv-1', fromAdmin: true, body: 'Where do you live on campus?' });
    const send = vi.fn().mockResolvedValue({ success: true, message: stored });
    render(
      <ApplicationThread viewer="admin" load={vi.fn().mockResolvedValue({ messages: [] })} send={send} emptyHint="" />,
    );
    await screen.findByLabelText('Message');

    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Where do you live on campus?' } });
    fireEvent.click(screen.getByLabelText('Send'));

    await waitFor(() => expect(send).toHaveBeenCalledWith('Where do you live on campus?'));
    expect(await screen.findByText('Where do you live on campus?')).toBeInTheDocument();
    // Draft cleared after a successful send.
    expect(screen.getByLabelText('Message')).toHaveValue('');
  });

  it('Enter sends, Shift+Enter does not', async () => {
    const send = vi.fn().mockResolvedValue({ success: true, message: msg({ id: 'x', body: 'hi' }) });
    render(
      <ApplicationThread viewer="admin" load={vi.fn().mockResolvedValue({ messages: [] })} send={send} emptyHint="" />,
    );
    const box = await screen.findByLabelText('Message');
    fireEvent.change(box, { target: { value: 'hi' } });

    fireEvent.keyDown(box, { key: 'Enter', shiftKey: true });
    expect(send).not.toHaveBeenCalled();

    fireEvent.keyDown(box, { key: 'Enter' });
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
  });

  it('surfaces a send failure and keeps the draft so nothing is lost', async () => {
    const send = vi.fn().mockResolvedValue({ success: false, error: 'Keep it under 2000 characters.' });
    render(
      <ApplicationThread viewer="applicant" load={vi.fn().mockResolvedValue({ messages: [] })} send={send} emptyHint="" />,
    );
    const box = await screen.findByLabelText('Message');
    fireEvent.change(box, { target: { value: 'a long message' } });
    fireEvent.click(screen.getByLabelText('Send'));

    expect(await screen.findByText('Keep it under 2000 characters.')).toBeInTheDocument();
    expect(box).toHaveValue('a long message');
  });

  it('replaces the composer with the reason when the conversation is closed', async () => {
    render(
      <ApplicationThread
        viewer="applicant"
        load={vi.fn().mockResolvedValue({ messages: [] })}
        send={vi.fn()}
        emptyHint=""
        closedReason="Your application has been approved."
      />,
    );
    expect(await screen.findByText('Your application has been approved.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Message')).toBeNull();
  });
});
