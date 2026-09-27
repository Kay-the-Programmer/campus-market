import { describe, expect, it } from 'vitest';
import { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { FormattedTextarea } from './FormattedTextarea';

/*
 * The transforms themselves are covered in richTextEdit.test.ts. What is left
 * to check here is the wiring that only exists in a live textarea: that the
 * buttons act on the seller's current selection rather than the end of the box,
 * and that the caret comes back where they left it.
 */

const Harness: React.FC<{ initial?: string; maxLength?: number }> = ({ initial = '', maxLength }) => {
  const [value, setValue] = useState(initial);
  return (
    <>
      <FormattedTextarea value={value} onChange={setValue} maxLength={maxLength} />
      <output data-testid="value">{value}</output>
    </>
  );
};

/**
 * Move the seller's selection.
 *
 * The setTimeout is not padding: jsdom queues its own `select` event from
 * setSelectionRange rather than firing it inline, and letting that land inside
 * act keeps React from warning about a state update it cannot see.
 */
async function selectRange(textarea: HTMLTextAreaElement, start: number, end: number) {
  await act(async () => {
    textarea.setSelectionRange(start, end);
    fireEvent.select(textarea);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function getTextarea(): HTMLTextAreaElement {
  return screen.getByRole('textbox') as HTMLTextAreaElement;
}

describe('FormattedTextarea', () => {
  it('bolds the selected words, not the whole box', async () => {
    render(<Harness initial="a fair price" />);
    const textarea = getTextarea();

    await selectRange(textarea, 2, 6);
    fireEvent.click(screen.getByRole('button', { name: /bold/i }));

    expect(screen.getByTestId('value')).toHaveTextContent('a **fair** price');
  });

  it('puts the caret back on the text it just wrapped', async () => {
    // Without the selection being restored after the re-render, the caret jumps
    // to the end of the box on every button press and the seller has to find
    // their place again.
    render(<Harness initial="a fair price" />);
    const textarea = getTextarea();

    await selectRange(textarea, 2, 6);
    fireEvent.click(screen.getByRole('button', { name: /bold/i }));

    expect(textarea.value.slice(textarea.selectionStart, textarea.selectionEnd)).toBe('fair');
  });

  it('shows the button as pressed when the caret sits in marked text', async () => {
    render(<Harness initial="a **fair** price" />);
    const textarea = getTextarea();

    await selectRange(textarea, 4, 8);

    expect(screen.getByRole('button', { name: /bold/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /italic/i })).toHaveAttribute('aria-pressed', 'false');
  });

  it('takes Ctrl+B as well as the button', async () => {
    render(<Harness initial="a fair price" />);
    const textarea = getTextarea();

    await selectRange(textarea, 2, 6);
    fireEvent.keyDown(textarea, { key: 'b', ctrlKey: true });

    expect(screen.getByTestId('value')).toHaveTextContent('a **fair** price');
  });

  it('takes Cmd+I for the Mac', async () => {
    render(<Harness initial="a fair price" />);
    const textarea = getTextarea();

    await selectRange(textarea, 2, 6);
    fireEvent.keyDown(textarea, { key: 'i', metaKey: true });

    expect(screen.getByTestId('value')).toHaveTextContent('a *fair* price');
  });

  it('leaves an ordinary keystroke to the textarea', async () => {
    render(<Harness initial="x" />);
    const textarea = getTextarea();

    // A plain "b" must not toggle bold, or the box cannot be typed in.
    fireEvent.keyDown(textarea, { key: 'b' });

    expect(screen.getByTestId('value')).toHaveTextContent('x');
  });

  it('sizes the line the caret is on', async () => {
    render(<Harness initial="Condition" />);
    const textarea = getTextarea();

    await selectRange(textarea, 0, 0);
    fireEvent.click(screen.getByRole('button', { name: 'Large' }));

    expect(screen.getByTestId('value')).toHaveTextContent('# Condition');
  });

  it('swaps one size for another rather than stacking prefixes', async () => {
    render(<Harness initial="Condition" />);
    const textarea = getTextarea();

    await selectRange(textarea, 0, 0);
    fireEvent.click(screen.getByRole('button', { name: 'Large' }));
    fireEvent.click(screen.getByRole('button', { name: 'Medium' }));

    expect(screen.getByTestId('value')).toHaveTextContent('## Condition');
  });

  it('shows the formatted result in preview and the markers again on the way back', async () => {
    render(<Harness initial="a **fair** price" />);

    fireEvent.click(screen.getByRole('button', { name: /preview/i }));

    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByText('fair').tagName).toBe('STRONG');

    fireEvent.click(screen.getByRole('button', { name: /edit/i }));

    expect(getTextarea().value).toBe('a **fair** price');
  });

  it('disables the formatting buttons while the preview is up', async () => {
    // There is no caret to act on in preview mode, so the transforms no-op.
    // Buttons that look live and do nothing are worse than disabled ones.
    render(<Harness initial="a fair price" />);

    fireEvent.click(screen.getByRole('button', { name: /preview/i }));

    expect(screen.getByRole('button', { name: /bold/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Large' })).toBeDisabled();
  });

  it('refuses a wrap that would push the value past its limit', async () => {
    // The markers are characters too. Silently exceeding maxLength here would
    // hand the server a description it rejects.
    render(<Harness initial="abcde" maxLength={6} />);
    const textarea = getTextarea();

    await selectRange(textarea, 0, 5);
    fireEvent.click(screen.getByRole('button', { name: /bold/i }));

    expect(screen.getByTestId('value')).toHaveTextContent('abcde');
  });

  it('counts what the seller has left', async () => {
    render(<Harness initial="abc" maxLength={100} />);

    expect(screen.getByText('3/100')).toBeInTheDocument();
  });
});
