/**
 * The write side of the description format: turning a toolbar click into an
 * edit of the textarea's text and selection.
 *
 * These are plain functions over {@link TextSelection} rather than methods that
 * poke at a DOM node, because every interesting case here is a string case -
 * the seller double-clicked a word and got the trailing space too, or pressed
 * bold on text that is already italic - and those are worth testing without a
 * browser in the way.
 *
 * Kept beside the parser in richText.ts so the markers this file writes and the
 * markers that file reads cannot drift apart.
 */

import { BlockSize, ESCAPE, ITALIC_MARKER, SIZE_PREFIX } from './richText';

/** A textarea's value and selection, which is all these transforms need. */
export interface TextSelection {
  value: string;
  start: number;
  end: number;
}

export type Mark = 'bold' | 'italic';

/** Which marks are on a span. Both can be true at once. */
export interface ActiveMarks {
  bold: boolean;
  italic: boolean;
}

/** Asterisks per mark: one for italic, two for bold, three for both. */
const RUN_FOR: Record<Mark, number> = { italic: 1, bold: 2 };

const MAX_RUN = 3;

/** Length of the asterisk run ending at {@code index}, capped at MAX_RUN. */
function runBefore(value: string, index: number): number {
  let n = 0;
  while (n < MAX_RUN && value[index - 1 - n] === ITALIC_MARKER) n += 1;
  return n;
}

/** Length of the asterisk run starting at {@code index}, capped at MAX_RUN. */
function runAfter(value: string, index: number): number {
  let n = 0;
  while (n < MAX_RUN && value[index + n] === ITALIC_MARKER) n += 1;
  return n;
}

/** A single-line span of text that a pair of markers can actually wrap. */
interface Span {
  start: number;
  end: number;
}

/**
 * Narrow a range to the text the seller actually meant.
 *
 * Two things get absorbed. Whitespace first: a double-click selects the
 * trailing space in most browsers, and "**word **" is not bold - the parser
 * refuses a closer with a space before it, which is what stops "2 * 3" being
 * italic. Then the markers themselves, so selecting the whole of "**word**"
 * and pressing bold turns it off instead of nesting another pair.
 */
function trimToContent(value: string, from: number, to: number): Span {
  let start = from;
  let end = to;

  /*
   * Each side is absorbed on its own rather than by the smaller of the two,
   * because a selection is often lopsided: splitting a bolded paragraph by line
   * hands this the range "first line**", where the closing pair is inside the
   * range and the opening pair is not. Requiring both sides to match would read
   * that as unformatted and add a second pair.
   *
   * Looping matters too - taking a marker off the end can expose a space, and
   * "**word **" is not bold.
   */
  for (;;) {
    const wasStart = start;
    const wasEnd = end;

    while (start < end && /\s/.test(value[start] ?? '')) start += 1;
    while (end > start && /\s/.test(value[end - 1] ?? '')) end -= 1;

    const lead = runAfter(value, start);
    if (lead > 0 && start + lead <= end) start += lead;

    const trail = runBefore(value, end);
    if (trail > 0 && end - trail >= start) end -= trail;

    if (start === wasStart && end === wasEnd) return { start, end };
  }
}

/**
 * The selection broken into one span per line, skipping any that hold nothing
 * but whitespace.
 *
 * Splitting is not a nicety. Marks are line-scoped in the parser - blocks are
 * split on newlines before any inline parsing - so a pair opened on one line
 * and closed on the next is not a pair at all. Wrapping a two-line selection in
 * a single pair would leave "**first\nsecond**" on the listing, rendering the
 * asterisks as literal text and applying no formatting whatsoever. Selecting a
 * paragraph and pressing bold is about the most ordinary thing a seller can do
 * with this toolbar, so each line gets its own pair.
 */
function lineSpans(value: string, from: number, to: number): Span[] {
  const spans: Span[] = [];
  let lineStart = from;

  for (let i = from; i <= to; i += 1) {
    if (i !== to && value[i] !== '\n') continue;
    const span = trimToContent(value, Math.max(lineStart, bodyStart(value, lineStart)), i);
    if (span.start < span.end) spans.push(span);
    lineStart = i + 1;
  }

  return spans;
}

/**
 * Where a line's text begins, after any size prefix.
 *
 * A mark must not be allowed to open before the prefix. "# Condition" bolded as
 * a whole line becomes "**# Condition**", and since the line no longer starts
 * with "# " it stops being a heading AND renders the hash as a literal
 * character - so a seller who makes a line large and then bolds it loses both
 * the size and gains a stray "#". Starting the span after the prefix instead
 * gives "# **Condition**", which is both.
 */
function bodyStart(value: string, position: number): number {
  const lineStart = value.lastIndexOf('\n', position - 1) + 1;
  for (const prefix of [SIZE_PREFIX.medium, SIZE_PREFIX.large]) {
    if (prefix && value.startsWith(prefix, lineStart)) return lineStart + prefix.length;
  }
  return lineStart;
}

/**
 * The marks on one span, from the asterisk runs on either side of it.
 *
 * The shorter of the two runs decides: "**text*" is a typo, not bold, and
 * treating it as italic is the reading that lets one more click fix it.
 */
function marksOn(value: string, span: Span): ActiveMarks {
  const run = Math.min(runBefore(value, span.start), runAfter(value, span.end));
  return { bold: run >= 2, italic: run === 1 || run >= 3 };
}

/**
 * The marks already applied to a selection.
 *
 * Across several lines a mark counts as active only when every line carries it,
 * so a half-bold paragraph shows the button as off and one press finishes the
 * job rather than undoing the part that was already done.
 */
export function activeMarks(selection: TextSelection): ActiveMarks {
  const { value } = selection;
  const spans = lineSpans(
    value,
    Math.min(selection.start, selection.end),
    Math.max(selection.start, selection.end),
  );
  if (spans.length === 0) return { bold: false, italic: false };

  return {
    bold: spans.every((span) => marksOn(value, span).bold),
    italic: spans.every((span) => marksOn(value, span).italic),
  };
}

/** Wrap or unwrap one span, which must not contain a newline. */
function applyToSpan(value: string, span: Span, size: number, remove: boolean): string {
  if (remove) {
    // Take the markers nearest the text, so stripping italic from "***x***"
    // leaves the bold pair standing.
    return (
      value.slice(0, span.start - size) + value.slice(span.start, span.end)
      + value.slice(span.end + size)
    );
  }
  const markers = ITALIC_MARKER.repeat(size);
  return (
    value.slice(0, span.start) + markers + value.slice(span.start, span.end)
    + markers + value.slice(span.end)
  );
}

/**
 * Add or remove one mark, leaving any other mark on the span alone.
 *
 * Bolding already-italic text takes it from one asterisk to three rather than
 * replacing the italic, and un-bolding it goes back to one.
 */
export function toggleMark(selection: TextSelection, mark: Mark): TextSelection {
  const { value } = selection;
  const size = RUN_FOR[mark];
  const from = Math.min(selection.start, selection.end);
  const to = Math.max(selection.start, selection.end);
  const spans = lineSpans(value, from, to);

  // Nothing but whitespace selected, or nothing at all: drop in an empty pair
  // and leave the caret between the markers, so the next keystroke is formatted.
  // Clamped past any size prefix for the same reason spans are - markers landing
  // inside "# " would stop the line being a heading and strip the hash of its
  // meaning, turning the prefix's space into ordinary text.
  if (spans.length === 0) {
    const markers = ITALIC_MARKER.repeat(size);
    const at = Math.max(from, bodyStart(value, from));
    return {
      value: value.slice(0, at) + markers + markers + value.slice(at),
      start: at + size,
      end: at + size,
    };
  }

  const remove = spans.every((span) => marksOn(value, span)[mark]);

  /*
   * Turning the mark ON only touches the lines that lack it. A paragraph where
   * one line is already bold would otherwise come back as "****first****",
   * which is not bolder - it is a broken run of markers the parser gives up on.
   */
  const targets = remove ? spans : spans.filter((span) => !marksOn(value, span)[mark]);
  if (targets.length === 0) return selection;

  // Last target first, so the offsets of the ones before it stay valid.
  let next = value;
  for (let i = targets.length - 1; i >= 0; i -= 1) {
    next = applyToSpan(next, targets[i]!, size, remove);
  }

  /*
   * Keep the selection on the same words, by counting how many markers were
   * added or taken away ahead of each end of it. The start moves past its own
   * line's opening marker; the end stops short of its own line's closer.
   */
  const markersBefore = (position: number, includeAtPosition: boolean) => {
    let count = 0;
    for (const target of targets) {
      if (target.start < position || (includeAtPosition && target.start === position)) count += 1;
      if (target.end < position || (includeAtPosition && target.end === position)) count += 1;
    }
    return count;
  };

  const step = remove ? -size : size;
  const first = spans[0]!;
  const last = spans[spans.length - 1]!;
  const start = first.start + step * markersBefore(first.start, true);
  const end = last.end + step * markersBefore(last.end, false);

  return shiftPast(keepSizesStable(value, next), start, end);
}

/**
 * Re-escape any hash that this edit has just promoted to a size prefix.
 *
 * Emphasis is not supposed to change a line's size, but taking markers off can
 * expose the seller's own text to the prefix rule: un-italicising
 * "*# of pages: 300*" leaves "# of pages: 300", which the parser then reads as
 * a large heading and whose hash disappears from the listing. Only lines whose
 * size actually moved are touched, so no stray backslash appears where nothing
 * was at risk.
 */
function keepSizesStable(before: string, after: string): { value: string; escapedAt: number[] } {
  const beforeLines = before.split('\n');
  const afterLines = after.split('\n');
  if (beforeLines.length !== afterLines.length) return { value: after, escapedAt: [] };

  const escapedAt: number[] = [];
  let offset = 0;
  const lines = afterLines.map((line, index) => {
    const lineStart = offset;
    offset += line.length + 1;
    if (sizeOfLine(line) === sizeOfLine(beforeLines[index] ?? '')) return line;
    escapedAt.push(lineStart);
    return ESCAPE + line;
  });

  return { value: lines.join('\n'), escapedAt };
}

/** Move a selection past any backslashes that were just inserted before it. */
function shiftPast(
  guarded: { value: string; escapedAt: number[] },
  start: number,
  end: number,
): TextSelection {
  const before = (position: number, inclusive: boolean) =>
    guarded.escapedAt.filter((at) => at < position || (inclusive && at === position)).length;

  return {
    value: guarded.value,
    start: start + before(start, true),
    end: end + before(end, false),
  };
}

/** Strip whichever size prefix a line carries. */
function withoutPrefix(line: string): string {
  if (line.startsWith(SIZE_PREFIX.medium)) return line.slice(SIZE_PREFIX.medium.length);
  if (line.startsWith(SIZE_PREFIX.large)) return line.slice(SIZE_PREFIX.large.length);
  return line;
}

function startsWithSizePrefix(line: string): boolean {
  return line.startsWith(SIZE_PREFIX.medium) || line.startsWith(SIZE_PREFIX.large);
}

/** The size a line would be read as. */
function sizeOfLine(line: string): BlockSize {
  if (line.startsWith(SIZE_PREFIX.medium)) return 'medium';
  if (line.startsWith(SIZE_PREFIX.large)) return 'large';
  return 'normal';
}

/**
 * Escape a hash that the line's own text begins with.
 *
 * A description can legitimately start a line "# of pages: 300", and the parser
 * reads a prefix exactly once, so that line is fine as written. The danger is
 * an edit that moves those characters to the front: taking the prefix off
 * "# # of pages: 300" leaves "# of pages: 300", where the seller's hash is now
 * the prefix - so the line stays large when they asked for normal AND loses the
 * hash from what the buyer reads. Escaping renders identically and cannot be
 * mistaken for syntax.
 */
function protectBody(body: string): string {
  return startsWithSizePrefix(body) ? ESCAPE + body : body;
}

/** Bounds of the whole lines a selection touches. */
function lineRange(value: string, start: number, end: number): { from: number; to: number } {
  const from = value.lastIndexOf('\n', start - 1) + 1;
  const next = value.indexOf('\n', end);
  return { from, to: next === -1 ? value.length : next };
}

/**
 * Apply a size to every line the selection touches.
 *
 * Size is a property of a line, not of a span: half a line at 20px and the
 * other half at 14px is not something a description needs and not something the
 * markers can express.
 */
export function setBlockSize(selection: TextSelection, size: BlockSize): TextSelection {
  const { value } = selection;
  const start = Math.min(selection.start, selection.end);
  const end = Math.max(selection.start, selection.end);
  const { from, to } = lineRange(value, start, end);

  const original = value.slice(from, to);
  const lines = original.split('\n');
  const rewritten = lines.map((line) => SIZE_PREFIX[size] + protectBody(withoutPrefix(line)));

  // Keep the seller's selection on the same words it was on before, which means
  // shifting it by however much the first line's prefix grew or shrank.
  const firstDelta = (rewritten[0]?.length ?? 0) - (lines[0]?.length ?? 0);
  const joined = rewritten.join('\n');
  const totalDelta = joined.length - original.length;
  const nextStart = Math.max(from, start + firstDelta);

  return {
    value: value.slice(0, from) + joined + value.slice(to),
    start: nextStart,
    end: Math.max(nextStart, end + totalDelta),
  };
}

/** The size of the line the caret sits on, for the toolbar's active state. */
export function blockSizeAt(value: string, caret: number): BlockSize {
  const { from, to } = lineRange(value, caret, caret);
  const line = value.slice(from, to);
  if (line.startsWith(SIZE_PREFIX.medium)) return 'medium';
  if (line.startsWith(SIZE_PREFIX.large)) return 'large';
  return 'normal';
}
