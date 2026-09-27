import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ColorField } from './ColorField';
import { contrastRatio, readableTextOn } from '../../types';

/**
 * The contrast remedy the warning offers.
 *
 * <p>Worth pinning independently of the JSX, because the entire value of the
 * warning is that the button beside it actually fixes the problem. The first
 * version of this preferred the brand ink unconditionally and returned 4.35:1
 * on a mid-grey background - so taking the advice left the warning up.
 */
const remedy = readableTextOn;

describe('contrast remedy', () => {
  it('offers white text on a dark background', () => {
    expect(remedy('#0b1c30')).toBe('#ffffff');
    expect(remedy('#2563eb')).toBe('#ffffff');
  });

  it('offers dark text on a light background', () => {
    expect(remedy('#ffffff')).toBe('#0b1c30');
    expect(remedy('#ffe08a')).toBe('#0b1c30');
  });

  it('always proposes something that actually clears the threshold', () => {
    // If the remedy itself failed 4.5:1 the button would be theatre. Mid-tone
    // greys are the hard case and the reason for the pure black/white
    // fallback: brand ink on #808080 is 4.35:1.
    for (const bg of ['#000000', '#ffffff', '#2563eb', '#007d55', '#c2410c', '#8455ef', '#808080', '#767676', '#999999']) {
      expect(contrastRatio(remedy(bg), bg)).toBeGreaterThan(4.5);
    }
  });

  it('clears the threshold for every colour in the spectrum, not just samples', () => {
    // The guarantee is arithmetic, not a lucky choice of fixtures: where white
    // and black are equally legible the ratio bottoms out around 4.58:1.
    let worst = Infinity;
    for (let r = 0; r < 256; r += 51) {
      for (let g = 0; g < 256; g += 51) {
        for (let b = 0; b < 256; b += 51) {
          const bg = '#' + [r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('');
          worst = Math.min(worst, contrastRatio(remedy(bg), bg));
        }
      }
    }
    expect(worst).toBeGreaterThan(4.5);
  });

  it('prefers the brand ink over pure black where it is legible', () => {
    // The fallback exists for the cases brand colours cannot serve; it should
    // not take over the cases they can.
    expect(remedy('#ffffff')).toBe('#0b1c30');
  });
});

describe('ColorField in the shape the editor uses it', () => {
  const PRESETS = [
    { value: '#ffffff', label: 'White' },
    { value: '#0b1c30', label: 'Ink' },
    { value: '#2563eb', label: 'Blue' },
  ];

  it('drives picker, code and preset onto one value', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <ColorField label="Background" value="" onChange={onChange} fallback="#2563eb" presets={PRESETS} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Background: Ink' }));
    expect(onChange).toHaveBeenLastCalledWith('#0b1c30');

    fireEvent.change(screen.getByLabelText('Background colour picker'), { target: { value: '#123456' } });
    expect(onChange).toHaveBeenLastCalledWith('#123456');

    fireEvent.change(screen.getByLabelText('Background'), { target: { value: '#abcdef' } });
    expect(onChange).toHaveBeenLastCalledWith('#abcdef');

    // A committed value reaches the code box, not just the swatch.
    rerender(
      <ColorField label="Background" value="#abcdef" onChange={onChange} fallback="#2563eb" presets={PRESETS} />,
    );
    expect((screen.getByLabelText('Background') as HTMLInputElement).value).toBe('#abcdef');
  });

  it('marks the active preset', () => {
    render(
      <ColorField label="Background" value="#2563eb" onChange={() => {}} fallback="#2563eb" presets={PRESETS} />,
    );
    expect(screen.getByRole('button', { name: 'Background: Blue' }).className).toContain('ring-1');
    expect(screen.getByRole('button', { name: 'Background: White' }).className).not.toContain('ring-1');
  });
});
