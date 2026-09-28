import { describe, expect, it } from 'vitest';
import { parseRichText, plainText } from './richText';
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

describe('toggleMark across lines', () => {
  it('gives each line its own pair', () => {
    // The bug this guards: one pair around the whole selection produces
    // "**first\nsecond**", and because the parser splits blocks on newlines
    // before looking for markers, neither asterisk finds a partner. The seller
    // gets literal asterisks on their listing and no bold at all.
    const source = 'first line\nsecond line';
    const next = toggleMark(at(source, 0, source.length), 'bold');

    expect(next.value).toBe('**first line**\n**second line**');
    expect(plainText(next.value)).toBe(source);
  });

  it('round-trips a multi-line selection', () => {
    const source = 'first line\nsecond line';
    const bolded = toggleMark(at(source, 0, source.length), 'bold');

    expect(toggleMark(bolded, 'bold').value).toBe(source);
  });

  it('keeps the selection on the same words afterwards', () => {
    const source = 'first line\nsecond line';
    const next = toggleMark(at(source, 0, source.length), 'bold');
    const selected = next.value.slice(next.start, next.end);

    // The selection sits inside the outer pair and spans the inner ones, so it
    // still covers exactly the words the seller had highlighted. It is not run
    // through plainText here: a fragment's markers are unpaired by definition,
    // which says nothing about how the whole description renders.
    expect(selected.startsWith('first line')).toBe(true);
    expect(selected.endsWith('second line')).toBe(true);
    expect(next.value.slice(0, next.start)).toBe('**');
    expect(next.value.slice(next.end)).toBe('**');
  });

  it('skips blank lines instead of marking the emptiness', () => {
    const source = 'first\n\nthird';
    const next = toggleMark(at(source, 0, source.length), 'italic');

    expect(next.value).toBe('*first*\n\n*third*');
  });

  it('finishes a half-marked paragraph rather than undoing it', () => {
    // One line already bold, one not. The mark is not "active" until every
    // line carries it, so a press completes the job.
    const source = '**first**\nsecond';
    const selection = at(source, 0, source.length);

    expect(activeMarks(selection).bold).toBe(false);
    expect(toggleMark(selection, 'bold').value).toBe('**first**\n**second**');
  });

  it('reports the mark as active once every line carries it', () => {
    const source = '**first**\n**second**';

    expect(activeMarks(at(source, 0, source.length)).bold).toBe(true);
  });
});

describe('toggleMark around a size prefix', () => {
  it('bolds a heading without destroying the heading', () => {
    // The bug this guards: wrapping the whole line gives "**# Condition**",
    // which no longer starts with "# ", so the line silently stops being large
    // AND the hash appears on the listing as a literal character.
    const source = '# Condition';
    const next = toggleMark(at(source, 0, source.length), 'bold');

    expect(next.value).toBe('# **Condition**');
    expect(parseRichText(next.value)[0]!.size).toBe('large');
    expect(plainText(next.value)).toBe('Condition');
  });

  it('bolds a medium heading in the same way', () => {
    const source = '## Extras';

    expect(toggleMark(at(source, 0, source.length), 'bold').value).toBe('## **Extras**');
  });

  it('never drops markers inside the prefix itself', () => {
    // Caret on the space of "# ". Markers there would break the prefix apart.
    const source = '# Condition';
    const next = toggleMark(at(source, 1, 2), 'italic');

    expect(parseRichText(next.value)[0]!.size).toBe('large');
    expect(next.value.startsWith('# ')).toBe(true);
  });
});

describe('a hash the seller typed themselves', () => {
  // "# of pages: 300" is an ordinary thing to write on a textbook listing, and
  // the parser reads a prefix exactly once, so it renders fine as typed. What
  // must not happen is an edit sliding those characters to the front of the
  // line, where they become syntax.

  it('survives un-italicising the line it sits on', () => {
    const before = '*# of pages: 300*';
    const next = toggleMark(at(before, 0, before.length), 'italic');

    // Without the escape this becomes "# of pages: 300": a large heading whose
    // hash has vanished from what the buyer reads.
    expect(parseRichText(next.value)[0]!.size).toBe('normal');
    expect(plainText(next.value)).toBe('# of pages: 300');
  });

  it('survives its line being set back to normal', () => {
    // The worst version: the seller presses Normal, the line stays large, the
    // hash is eaten, and the toolbar still reports Large - a button that
    // visibly does nothing.
    const before = '# # of pages: 300';
    const next = setBlockSize(at(before, before.length), 'normal');

    expect(parseRichText(next.value)[0]!.size).toBe('normal');
    expect(plainText(next.value)).toBe('# of pages: 300');
    expect(blockSizeAt(next.value, next.start)).toBe('normal');
  });

  it('is left alone when nothing puts it at risk', () => {
    // No stray backslashes where the hash was never going to be read as syntax.
    const before = 'pages: 300';

    expect(setBlockSize(at(before, 0), 'large').value).toBe('# pages: 300');
    expect(toggleMark(at(before, 0, before.length), 'bold').value).toBe('**pages: 300**');
  });

  it('keeps a heading whose text also starts with a hash', () => {
    const source = '# # of pages: 300';

    expect(parseRichText(source)[0]!.size).toBe('large');
    expect(plainText(source)).toBe('# of pages: 300');
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
