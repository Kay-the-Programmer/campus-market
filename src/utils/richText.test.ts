import { describe, expect, it } from 'vitest';
import { Block, InlineNode, parseRichText, plainText } from './richText';

/*
 * The parser reads text a seller typed, so the cases worth pinning down are the
 * ones where it would get eager: an asterisk in "2 * 3" is arithmetic, one at
 * the end of "in stock *" is a footnote, and turning either into italics would
 * eat the character and leave the seller with no way to type it back.
 *
 * The other half is the opposite failure - formatting the seller did mean that
 * silently comes out as literal asterisks on the listing page.
 */

/** Flatten a block to a shape that is readable in an assertion. */
function shape(nodes: InlineNode[]): unknown[] {
  return nodes.map((node) =>
    node.kind === 'text' ? node.text : { [node.kind]: shape(node.children) },
  );
}

function firstBlock(source: string): Block {
  const blocks = parseRichText(source);
  return blocks[0]!;
}

describe('parseRichText inline marks', () => {
  it('reads two asterisks as bold', () => {
    expect(shape(firstBlock('**bold**').children)).toEqual([{ bold: ['bold'] }]);
  });

  it('reads one asterisk as italic', () => {
    expect(shape(firstBlock('*soft*').children)).toEqual([{ italic: ['soft'] }]);
  });

  it('reads three asterisks as both, so the toolbar can stack them', () => {
    expect(shape(firstBlock('***loud***').children)).toEqual([
      { bold: [{ italic: ['loud'] }] },
    ]);
  });

  it('nests bold inside italic without the italic closing early', () => {
    // The bug this guards: scanning for the italic's closing "*" stops on the
    // first half of the bold's "**", so "a" comes out italic and the rest of
    // the line loses its formatting.
    expect(shape(firstBlock('*a **b** c*').children)).toEqual([
      { italic: ['a ', { bold: ['b'] }, ' c'] },
    ]);
  });

  it('keeps arithmetic literal', () => {
    // "2 * 3 * 4" must not italicise " 3 ". The giveaway is the space after the
    // opening asterisk.
    expect(shape(firstBlock('2 * 3 * 4').children)).toEqual(['2 * 3 * 4']);
  });

  it('keeps a trailing footnote asterisk literal', () => {
    expect(shape(firstBlock('Negotiable *').children)).toEqual(['Negotiable *']);
  });

  it('leaves an unclosed marker as text rather than swallowing the line', () => {
    expect(shape(firstBlock('**half finished').children)).toEqual(['**half finished']);
  });

  it('salvages the formatting from a lopsided run', () => {
    // A seller who typed one asterisk too many still gets bold text and a
    // stray character, not a line of literal markers.
    expect(shape(firstBlock('***bold**').children)).toEqual(['*', { bold: ['bold'] }]);
  });

  it('skips a candidate closer that has a space before it', () => {
    // "*a *b*" has two closing candidates; the first is preceded by a space and
    // so cannot close, but the parser must keep looking instead of giving up.
    expect(shape(firstBlock('*a *b*').children)).toEqual([{ italic: ['a *b'] }]);
  });

  it('does not italicise an underscored model number', () => {
    // Underscores are not italic markers precisely so this stays intact.
    expect(shape(firstBlock('RTX_3060_Ti').children)).toEqual(['RTX_3060_Ti']);
  });

  it('lets a backslash escape a marker the seller means literally', () => {
    expect(shape(firstBlock('\\*not italic\\*').children)).toEqual(['*not italic*']);
  });

  it('keeps a row of asterisks whole instead of pairing it with itself', () => {
    // The bug this caught: a divider line pairs up as bold-around-"**", the
    // outer markers are consumed as formatting, and the seller's 40-asterisk
    // rule renders as 16. Markers are only markers when they wrap something.
    expect(plainText('*'.repeat(40))).toBe('*'.repeat(40));
    expect(plainText('***')).toBe('***');
  });

  it('never drops a character that is not a marker', () => {
    // The invariant that makes the "leave it literal" fallbacks safe: whatever
    // the seller types, every letter, digit and space survives parsing, however
    // ragged the markers around them are.
    const ragged = [
      '**a',
      '*b**',
      '***c**',
      '**d***',
      '*e *f*',
      '**g** *h* ***i***',
      'j * k ** l',
      '*',
      '**',
    ];
    for (const source of ragged) {
      const letters = (text: string) => text.replace(/[^a-z]/g, '');
      expect(letters(plainText(source))).toBe(letters(source));
    }
  });
});

describe('parseRichText blocks', () => {
  it('reads "# " as the large size and drops the prefix', () => {
    const block = firstBlock('# Condition');
    expect(block.size).toBe('large');
    expect(shape(block.children)).toEqual(['Condition']);
  });

  it('reads "## " as the medium size', () => {
    const block = firstBlock('## Extras');
    expect(block.size).toBe('medium');
    expect(shape(block.children)).toEqual(['Extras']);
  });

  it('needs the space, so a hashtag stays a hashtag', () => {
    const block = firstBlock('#bargain');
    expect(block.size).toBe('normal');
    expect(shape(block.children)).toEqual(['#bargain']);
  });

  it('applies a size and inline marks on the same line', () => {
    const block = firstBlock('# A **great** deal');
    expect(block.size).toBe('large');
    expect(shape(block.children)).toEqual(['A ', { bold: ['great'] }, ' deal']);
  });

  it('keeps a blank line as an empty block so paragraph breaks survive', () => {
    const blocks = parseRichText('first\n\nsecond');
    expect(blocks).toHaveLength(3);
    expect(blocks[1]!.children).toEqual([]);
  });

  it('normalises Windows line endings', () => {
    expect(parseRichText('a\r\nb')).toHaveLength(2);
  });

  it('treats null and undefined as an empty description', () => {
    expect(plainText(null)).toBe('');
    expect(plainText(undefined)).toBe('');
  });
});

describe('plainText', () => {
  it('resolves every marker away', () => {
    expect(plainText('# Title\n**bold** and *soft*')).toBe('Title\nbold and soft');
  });

  it('measures what the reader sees, not what the seller typed', () => {
    // Why this matters: DetailScreen decides whether to collapse a description
    // behind "Read more" from this length. Counting markers would hide a short
    // description behind a button that reveals almost nothing.
    expect(plainText('**short**').length).toBeLessThan('**short**'.length);
    expect(plainText('**short**')).toBe('short');
  });
});
