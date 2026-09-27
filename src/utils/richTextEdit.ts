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

import { BlockSize, ITALIC_MARKER, SIZE_PREFIX } from './richText';

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

/**
 * Narrow a selection to the text the seller actually meant.
 *
 * Two things get absorbed. Whitespace first: a double-click selects the
 * trailing space in most browsers, and "**word **" is not bold - the parser
 * refuses a closer with a space before it, which is what stops "2 * 3" being
 * italic. Then the markers themselves, so selecting the whole of "**word**"
 * and pressing bold turns it off instead of nesting another pair.
 */
function core(selection: TextSelection): { start: number; end: number } {
  const { value } = selection;
  let start = Math.min(selection.start, selection.end);
  let end = Math.max(selection.start, selection.end);

  while (start < end && /\s/.test(value[start] ?? '')) start += 1;
  while (end > start && /\s/.test(value[end - 1] ?? '')) end -= 1;

  const inside = Math.min(runAfter(value, start), runBefore(value, end));
  // Only step inside if doing so leaves something between the markers.
  if (inside > 0 && start + inside <= end - inside) {
    start += inside;
    end -= inside;
  }

  return { start, end };
}

/**
 * The marks already applied to a selection, from the asterisk runs on either
 * side of it.
 *
 * The shorter of the two runs decides: "**text*" is a typo, not bold, and
 * treating it as italic is the reading that lets one more click fix it.
 */
export function activeMarks(selection: TextSelection): ActiveMarks {
  const { start, end } = core(selection);
  if (start === end) return { bold: false, italic: false };
  const run = Math.min(runBefore(selection.value, start), runAfter(selection.value, end));
  return { bold: run >= 2, italic: run === 1 || run >= 3 };
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
  const { start, end } = core(selection);

  // Nothing selected: drop in an empty pair and leave the caret between them,
  // so the next keystroke is formatted.
  if (start === end) {
    const markers = ITALIC_MARKER.repeat(size);
    const at = Math.min(selection.start, selection.end);
    return {
      value: value.slice(0, at) + markers + markers + value.slice(at),
      start: at + size,
      end: at + size,
    };
  }

  if (activeMarks(selection)[mark]) {
    // Remove the markers nearest the text, so stripping italic from "***x***"
    // leaves the bold pair standing.
    return {
      value: value.slice(0, start - size) + value.slice(start, end) + value.slice(end + size),
      start: start - size,
      end: end - size,
    };
  }

  const markers = ITALIC_MARKER.repeat(size);
  return {
    value: value.slice(0, start) + markers + value.slice(start, end) + markers + value.slice(end),
    start: start + size,
    end: end + size,
  };
}

/** Strip whichever size prefix a line carries. */
function withoutPrefix(line: string): string {
  if (line.startsWith(SIZE_PREFIX.medium)) return line.slice(SIZE_PREFIX.medium.length);
  if (line.startsWith(SIZE_PREFIX.large)) return line.slice(SIZE_PREFIX.large.length);
  return line;
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
  const rewritten = lines.map((line) => SIZE_PREFIX[size] + withoutPrefix(line));

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
