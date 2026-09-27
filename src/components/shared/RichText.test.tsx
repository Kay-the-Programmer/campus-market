import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { RichText } from './RichText';

/*
 * A description is text one student writes and every other student's browser
 * renders. The test that matters most here is the last one: if this component
 * ever gains a dangerouslySetInnerHTML, a listing becomes a place to put a
 * script tag, and it will keep working for everyone who reads it.
 */

describe('RichText', () => {
  it('renders bold as emphasis a screen reader can also see', () => {
    render(<RichText value="a **firm** price" />);

    const strong = screen.getByText('firm');
    expect(strong.tagName).toBe('STRONG');
  });

  it('renders italic as em', () => {
    render(<RichText value="*roughly* new" />);

    expect(screen.getByText('roughly').tagName).toBe('EM');
  });

  it('gives a large line a bigger type size', () => {
    const { container } = render(<RichText value="# Condition" />);

    expect(container.querySelector('.text-lg')).not.toBeNull();
    expect(screen.getByText('Condition')).toBeInTheDocument();
  });

  it('does not show the markers themselves', () => {
    const { container } = render(<RichText value="# Big **bold** *soft*" />);

    expect(container.textContent).toBe('Big bold soft');
  });

  it('keeps each source line on its own line', () => {
    const { container } = render(<RichText value={'first\nsecond'} />);

    expect(container.querySelectorAll('p')).toHaveLength(2);
  });

  it('passes the base look through to the wrapper so callers keep control', () => {
    const { container } = render(<RichText value="text" className="text-slate-600 text-sm" />);

    expect(container.firstElementChild).toHaveClass('text-slate-600', 'text-sm');
  });

  it('renders markup in a description as characters, not as elements', () => {
    // The whole reason descriptions are stored as markers rather than HTML. A
    // hostile description must be able to spell a script tag and nothing more.
    const hostile = '<script>alert(1)</script><b>bold?</b><img src=x onerror=alert(1)>';
    const { container } = render(<RichText value={hostile} />);

    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('b')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toBe(hostile);
  });

  it('renders an empty description without falling over', () => {
    const { container } = render(<RichText value="" />);

    expect(container.textContent).toBe('');
  });
});
