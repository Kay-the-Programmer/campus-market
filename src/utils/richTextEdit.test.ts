import { describe, expect, it } from 'vitest';
import { plainText } from './richText';
import { TextSelection, activeMarks, blockSizeAt, setBlockSize, toggleMark } from './richTextEdit';

/*
 * A formatting button has one job: put the markers where the parser will find
 * them. So these tests mostly check the two halves agree - every wrap asserted
 * here is also run back through plainText, because markers in a position the
 * parser rejects look identical in the box and do nothing on the listing page.
 */

function at(value: string, start: number, end = start): TextSelection {
  return { value, start, end };
}

describe('toggleMark', () => {
  it('wraps the selection and keeps it on the same words', () => {
    const next = toggleMark(at('hello world', 0, 5), 'bold');

    expect(next.value).toBe('**hello** world');
    expect(next.value.slice(next.start, next.end)).toBe('hello');
  });

  it('unwraps when the selection is already marked', () => {
    const next = toggleMark(at('**hello** world', 2, 7), 'bold');

    expect(next.value).toBe('hello world');
    expect(next.value.slice(next.start, next.end)).toBe('hello');
  });

  it('unwraps when the seller selected the markers as well as the text', () => {
    // Selecting a whole bold phrase and pressing bold has to turn it off. The
    // alternative is nesting a second pair, which the parser reads as a
    // different mark entirely.
    const next = toggleMark(at('**hello** world', 0, 9), 'bold');

    expect(next.value).toBe('hello world');
  });

  it('leaves a double-clicked trailing space outside the markers', () => {
    // The failure this guards is invisible in the textarea and total on the
    // page: most browsers include the trailing space in a double-click, and
    // "**hello **" is not bold - the parser refuses a closer with a space
    // before it, which is the same rule that keeps "2 * 3" literal.
    const next = toggleMark(at('hello world', 0, 6), 'bold');

    expect(next.value).toBe('**hello** world');
    expect(plainText(next.value)).toBe('hello world');
  });

  it('inserts an empty pair and leaves the caret inside it', () => {
    const next = toggleMark(at('', 0), 'italic');

    expect(next.value).toBe('**');
    expect(next.start).toBe(1);
    expect(next.end).toBe(1);
  });

  it('adds bold to italic text rather than replacing it', () => {
    const next = toggleMark(at('*x*', 1, 2), 'bold');

    expect(next.value).toBe('***x***');
    expect(activeMarks(next)).toEqual({ bold: true, italic: true });
  });

  it('removes one mark from a span carrying both', () => {
    // Stripping italic from "***x***" must leave the bold pair standing, which
    // means removing the markers nearest the text rather than the outermost.
    const next = toggleMark(at('***x***', 3, 4), 'italic');

    expect(next.value).toBe('**x**');
    expect(activeMarks(next)).toEqual({ bold: true, italic: false });
  });

  it('round-trips: wrapping then unwrapping returns the original', () => {
    const start = at('a tidy description', 2, 6);
    const bolded = toggleMark(start, 'bold');

    expect(toggleMark(bolded, 'bold').value).toBe(start.value);
  });

  it('produces markers the parser actually honours', () => {
    const bolded = toggleMark(at('reduced price', 0, 7), 'bold');
    const both = toggleMark(bolded, 'italic');

    expect(plainText(both.value)).toBe('reduced price');
    expect(activeMarks(both)).toEqual({ bold: true, italic: true });
  });
});

describe('activeMarks', () => {
  it('reports nothing for an unmarked span', () => {
    expect(activeMarks(at('plain text', 0, 5))).toEqual({ bold: false, italic: false });
  });

  it('reads the shorter side of a lopsided pair', () => {
    // "**text*" is a typo. Calling it italic is the reading that lets one more
    // click tidy it up.
    expect(activeMarks(at('**text*', 2, 6))).toEqual({ bold: false, italic: true });
  });
});

describe('setBlockSize', () => {
  it('adds a prefix and keeps the caret on the same word', () => {
    const next = setBlockSize(at('Condition', 0), 'large');

    expect(next.value).toBe('# Condition');
    expect(next.value.slice(next.start)).toBe('Condition');
  });

  it('replaces an existing prefix instead of stacking one on top', () => {
    expect(setBlockSize(at('# Condition', 3), 'medium').value).toBe('## Condition');
  });

  it('removes the prefix again for normal', () => {
    expect(setBlockSize(at('## Condition', 4), 'normal').value).toBe('Condition');
  });

  it('applies to every line the selection touches', () => {
    const next = setBlockSize(at('one\ntwo', 0, 7), 'large');

    expect(next.value).toBe('# one\n# two');
  });

  it('sizes only the line the caret is on', () => {
    const next = setBlockSize(at('one\ntwo', 5), 'large');

    expect(next.value).toBe('one\n# two');
  });
});

describe('blockSizeAt', () => {
  it('reads the size of the line under the caret, not the first line', () => {
    expect(blockSizeAt('# big\nplain', 8)).toBe('normal');
    expect(blockSizeAt('# big\nplain', 2)).toBe('large');
  });

  it('reports medium for a "## " line', () => {
    expect(blockSizeAt('## mid', 4)).toBe('medium');
  });
});
