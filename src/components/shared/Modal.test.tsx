import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Modal } from './Modal';

const open = (onClose = vi.fn(), extra?: React.ReactNode) => {
  render(
    <>
      <button>behind the overlay</button>
      <Modal isOpen title="Report listing" onClose={onClose}>
        <input aria-label="Reason" />
        {extra}
      </Modal>
    </>,
  );
  return onClose;
};

/*
 * This shell was a plain div for a long time: no role, no Escape, no focus
 * handling. Every dialog in the app wears it, so each of these is a claim
 * about all of them at once - and the Tab tests are the ones that matter
 * most, because the page behind an overlay stays rendered and focusable, so
 * without a trap a keyboard user silently ends up operating a page they
 * cannot see.
 */
describe('Modal', () => {
  it('announces itself as a dialog named by its title', () => {
    open();

    expect(screen.getByRole('dialog', { name: 'Report listing' })).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
  });

  it('renders nothing when closed', () => {
    render(<Modal isOpen={false} title="Report listing" onClose={vi.fn()}>body</Modal>);

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('closes on Escape', () => {
    const onClose = open();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('moves focus to the panel, not to its close button', () => {
    open();

    /* Landing on the × would mean Enter dismisses a dialog that has only
       just opened. */
    expect(screen.getByRole('dialog')).toHaveFocus();
  });

  it('gives focus back to whatever opened it', () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();

    const { unmount } = render(
      <Modal isOpen title="Report listing" onClose={vi.fn()}>
        <input aria-label="Reason" />
      </Modal>,
    );
    expect(screen.getByRole('dialog')).toHaveFocus();

    unmount();

    expect(opener).toHaveFocus();
    opener.remove();
  });

  it('wraps Tab from the last control back to the first', () => {
    open();
    const close = screen.getByRole('button', { name: 'Close' });
    const reason = screen.getByLabelText('Reason');

    reason.focus();
    fireEvent.keyDown(document, { key: 'Tab' });

    expect(close).toHaveFocus();
  });

  it('wraps Shift+Tab from the first control back to the last', () => {
    open();
    const close = screen.getByRole('button', { name: 'Close' });
    const reason = screen.getByLabelText('Reason');

    close.focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });

    expect(reason).toHaveFocus();
  });

  it('pulls focus back when it has escaped to the page behind', () => {
    open();
    const behind = screen.getByRole('button', { name: 'behind the overlay' });

    behind.focus();
    fireEvent.keyDown(document, { key: 'Tab' });

    expect(behind).not.toHaveFocus();
    expect(screen.getByRole('dialog')).toContainElement(document.activeElement as HTMLElement);
  });
});
