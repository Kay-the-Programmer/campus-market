import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ColorField } from './ColorField';

const FALLBACK = '#2563eb';

const PRESETS = [
  { value: '#ffffff', label: 'White' },
  { value: '#0b1c30', label: 'Ink' },
];

function setup(value = '', opts: { presets?: typeof PRESETS } = {}) {
  const onChange = vi.fn();
  render(
    <ColorField
      label="Background"
      value={value}
      onChange={onChange}
      fallback={FALLBACK}
      presets={opts.presets}
    />,
  );
  /*
   * The visible "Background" label points at the CODE box, not the swatch.
   * That is deliberate: the colour input carries its own aria-label, so
   * without htmlFor on the visible one the text field is unlabelled to a
   * screen reader - which is the accessibility bug this arrangement fixes.
   */
  const hex = screen.getByLabelText('Background') as HTMLInputElement;
  const picker = screen.getByLabelText('Background colour picker') as HTMLInputElement;
  return { onChange, picker, hex };
}

describe('ColorField', () => {
  it('labels the code box, so the field is reachable by name', () => {
    const { hex } = setup('');
    expect(hex.tagName).toBe('INPUT');
    expect(hex.getAttribute('type')).toBe('text');
  });

  it('shows the theme colour in the picker while nothing is set', () => {
    const { picker } = setup('');
    // A colour input cannot hold "unset" - it would fall back to #000000 and
    // show black, which reads as a decision nobody made.
    expect(picker.value).toBe(FALLBACK);
    expect(screen.getByText(/Following the theme/i)).toBeInTheDocument();
  });

  it('commits a complete hex typed into the code box', () => {
    const { onChange, hex } = setup('');
    fireEvent.change(hex, { target: { value: '#ff8800' } });
    expect(onChange).toHaveBeenCalledWith('#ff8800');
  });

  it('does not commit while the hex is still being typed', () => {
    /*
     * The regression this guards: committing per keystroke means "#2563eb"
     * is submitted as "#2", "#25", "#256"... none of which are colours, and
     * a controlled input normalising each one fights the person typing.
     */
    const { onChange, hex } = setup('');
    for (const partial of ['#', '#2', '#25', '#256', '#2563e']) {
      fireEvent.change(hex, { target: { value: partial } });
    }
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.change(hex, { target: { value: '#2563eb' } });
    expect(onChange).toHaveBeenCalledWith('#2563eb');
  });

  it('accepts a pasted code without the leading hash', () => {
    // How a brand colour arrives from a style guide, more often than not.
    const { onChange, hex } = setup('');
    fireEvent.change(hex, { target: { value: 'ff8800' } });
    expect(onChange).toHaveBeenCalledWith('#ff8800');
  });

  it('normalises case, so the database CHECK and equality both agree', () => {
    const { onChange, hex } = setup('');
    fireEvent.change(hex, { target: { value: '#FF8800' } });
    expect(onChange).toHaveBeenCalledWith('#ff8800');
  });

  it('rejects something that is not a colour', () => {
    const { onChange, hex } = setup('');
    fireEvent.change(hex, { target: { value: 'not-a-colour' } });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('commits from the picker', () => {
    const { onChange, picker } = setup('');
    fireEvent.change(picker, { target: { value: '#00ff00' } });
    expect(onChange).toHaveBeenCalledWith('#00ff00');
  });

  it('abandons a half-typed value on blur rather than leaving it on screen', () => {
    const { hex } = setup('#2563eb');
    fireEvent.change(hex, { target: { value: '#25' } });
    expect(hex.value).toBe('#25');
    fireEvent.blur(hex);
    expect(hex.value).toBe('#2563eb');
  });

  it('offers a reset only once a colour is actually set', () => {
    const { onChange } = setup('#ff8800');
    const reset = screen.getByRole('button', { name: /use theme/i });
    fireEvent.click(reset);
    // '' rather than undefined: the save endpoint replaces the whole panel,
    // so "cleared" and "absent" must not look the same on the wire.
    expect(onChange).toHaveBeenCalledWith('');
  });

  it('commits a preset in one tap', () => {
    const { onChange } = setup('', { presets: PRESETS });
    fireEvent.click(screen.getByRole('button', { name: 'Background: White' }));
    expect(onChange).toHaveBeenCalledWith('#ffffff');
  });

  it('draws no preset row when none are given', () => {
    setup('');
    expect(screen.queryByRole('button', { name: /Background: / })).toBeNull();
  });

  it('hides the reset while the field is following the theme', () => {
    setup('');
    expect(screen.queryByRole('button', { name: /use theme/i })).toBeNull();
  });
});
