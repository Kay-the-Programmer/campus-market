/**
 * A deliberately tiny formatting language for seller-written descriptions.
 *
 * Sellers asked to be able to bold a warning, italicise a note and make a line
 * bigger. The obvious way to do that is a contenteditable box that produces
 * HTML - and that is the one option this app cannot afford. A description is
 * text one student types and every other student's browser renders, so storing
 * HTML would mean keeping markup from an untrusted author and needing a
 * sanitiser to stay correct forever. Instead descriptions stay plain text with
 * a few markers, and {@link parseRichText} turns them into a node tree that
 * RichText renders as real React elements. No HTML string exists anywhere in
 * the pipeline, so there is nothing to sanitise: the worst a hostile
 * description can do is render bold text.
 *
 * The other thing plain text buys is graceful degradation. The column is
 * already TEXT, so nothing migrates, and every consumer that predates this
 * file - the search LIKE, a notification body, an older app build still in
 * someone's cache - keeps working and shows the markers at worst, which is
 * still perfectly readable.
 *
 * The syntax is smaller than Markdown on purpose; the marker constants below
 * record what was left out and why.
 */

/** Text carrying no formatting of its own. */
export interface TextNode {
  kind: 'text';
  text: string;
}

/** Bold and italic nest, so they carry children rather than a string. */
export interface MarkNode {
  kind: 'bold' | 'italic';
  children: InlineNode[];
}

export type InlineNode = TextNode | MarkNode;

/**
 * Line sizes. Three is the whole range on offer: a description is not a
 * document, and an unbounded size picker only ever produces listings that
 * shout.
 */
export type BlockSize = 'normal' | 'medium' | 'large';

/** One source line, with the size that applies to all of it. */
export interface Block {
  size: BlockSize;
  children: InlineNode[];
}

/**
 * Bold and italic share a delimiter, as in Markdown: one asterisk is italic,
 * two are bold, three are both.
 *
 * Underscores are deliberately not accepted for italic. Markdown takes them,
 * but they are a trap for this content in particular - descriptions are full of
 * model numbers and file names, and RTX_3060_Ti would come out half-italic with
 * no way for the seller to guess why. Asterisks mid-word are rare enough to
 * ignore, and the toolbar only ever emits these.
 */
export const ITALIC_MARKER = '*';
export const BOLD_MARKER = '**';

/** Line prefixes for the two non-default sizes. */
export const SIZE_PREFIX: Record<BlockSize, string> = {
  normal: '',
  medium: '## ',
  large: '# ',
};

/** Backslash, the one way to keep a marker literal. */
export const ESCAPE = '\\';

/** Only characters that actually mean something need escaping. */
const ESCAPABLE = [ITALIC_MARKER, '#', ESCAPE];

/**
 * How deep bold/italic may nest before the parser stops looking.
 *
 * Bold inside italic is worth supporting and nothing past that is. The cap also
 * means a description consisting only of asterisks cannot drive the recursion
 * deeper than this however long it runs.
 */
const MAX_DEPTH = 4;

/** Longest delimiter run the syntax gives a meaning to. */
const MAX_RUN = 3;

function isSpace(char: string | undefined): boolean {
  return char === undefined || /\s/.test(char);
}

/** How many asterisks start at {@code i}, capped at the longest useful run. */
function runLengthAt(source: string, i: number): number {
  let n = 0;
  while (n < MAX_RUN && source[i + n] === ITALIC_MARKER) n += 1;
  return n;
}

/**
 * Whether a span has anything in it besides more markers.
 *
 * Without this, a row of asterisks typed as a divider pairs up with itself:
 * "****" reads as bold wrapped around "**", and the wrapper is consumed, so the
 * divider comes out visibly shorter than the seller typed it.
 */
function hasContent(text: string): boolean {
  return /[^*]/.test(text);
}

/**
 * Find the delimiter run that closes one of {@code size} opened at
 * {@code from}, or -1 if the run is unterminated and the opener should stay
 * literal.
 *
 * The whitespace rules are what keep arithmetic and footnotes out of the
 * parser's hands: "2 * 3" and "in stock *" are asterisks nobody meant as
 * formatting, and the giveaway in both is the space beside them.
 */
function findCloser(source: string, from: number, size: number): number {
  // "* 5 each" - a marker with a space after it opens nothing.
  if (from >= source.length || isSpace(source[from])) return -1;

  let i = from;
  while (i < source.length) {
    if (source[i] === ESCAPE) {
      i += 2;
      continue;
    }
    const run = runLengthAt(source, i);
    if (run === 0) {
      i += 1;
      continue;
    }
    // A run only closes a run of its own length, so the italic in
    // "*a **b** c*" does not close on the bold's opening pair. Three is the top
    // of the scale and closes anything that opened with three.
    const closes = size === MAX_RUN ? run >= MAX_RUN : run === size;
    // An empty run, or a space before the closer as in "*a *b*", is not it.
    // Keep scanning rather than giving up: a real closer may follow.
    if (!closes || i === from || isSpace(source[i - 1])) {
      i += run;
      continue;
    }
    return i;
  }
  return -1;
}

function parseInline(source: string, depth: number): InlineNode[] {
  const nodes: InlineNode[] = [];
  let buffer = '';

  const flush = () => {
    if (buffer) {
      nodes.push({ kind: 'text', text: buffer });
      buffer = '';
    }
  };

  let i = 0;
  while (i < source.length) {
    const char = source[i];

    if (char === ESCAPE && ESCAPABLE.includes(source[i + 1] ?? '')) {
      buffer += source[i + 1];
      i += 2;
      continue;
    }

    if (char === ITALIC_MARKER && depth < MAX_DEPTH) {
      const size = runLengthAt(source, i);
      const close = findCloser(source, i + size, size);
      const inner = close === -1 ? '' : source.slice(i + size, close);
      if (close !== -1 && hasContent(inner)) {
        const children = parseInline(inner, depth + 1);
        flush();
        if (size === 1) {
          nodes.push({ kind: 'italic', children });
        } else if (size === 2) {
          nodes.push({ kind: 'bold', children });
        } else {
          nodes.push({ kind: 'bold', children: [{ kind: 'italic', children }] });
        }
        i = close + size;
        continue;
      }
      // No closer for a run this long, or nothing inside it worth formatting.
      // Fall through and emit one asterisk as text, so the next pass sees a
      // shorter run and a lopsided "***bold**" still bolds rather than losing
      // the words entirely.
    }

    buffer += char;
    i += 1;
  }

  flush();
  return nodes;
}

/** Strip the size prefix from a line, if it has one. */
function splitSize(line: string): { size: BlockSize; body: string } {
  if (line.startsWith(SIZE_PREFIX.medium)) {
    return { size: 'medium', body: line.slice(SIZE_PREFIX.medium.length) };
  }
  if (line.startsWith(SIZE_PREFIX.large)) {
    return { size: 'large', body: line.slice(SIZE_PREFIX.large.length) };
  }
  return { size: 'normal', body: line };
}

/**
 * Parse a description into blocks, one per source line.
 *
 * Blank lines survive as empty blocks so the renderer can keep the seller's
 * paragraph breaks, which is what the old whitespace-pre-line did.
 */
export function parseRichText(source: string | null | undefined): Block[] {
  const text = (source ?? '').replace(/\r\n?/g, '\n');
  return text.split('\n').map((line) => {
    const { size, body } = splitSize(line);
    return { size, children: parseInline(body, 0) };
  });
}

function inlineText(nodes: InlineNode[]): string {
  return nodes
    .map((node) => (node.kind === 'text' ? node.text : inlineText(node.children)))
    .join('');
}

/**
 * The description with every marker resolved away.
 *
 * Anything measuring or excerpting a description wants this rather than the
 * source: "how long is it" and "does it contain this word" are both questions
 * about what the reader sees, and markers answer them wrong.
 */
export function plainText(source: string | null | undefined): string {
  return parseRichText(source)
    .map((block) => inlineText(block.children))
    .join('\n');
}
