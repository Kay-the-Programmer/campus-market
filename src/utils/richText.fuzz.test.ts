import { describe, expect, it } from 'vitest';
import { parseRichText, plainText } from './richText';
import { BlockSize } from './richText';
import { blockSizeAt, setBlockSize, toggleMark } from './richTextEdit';

/*
 * A bounded, deterministic sweep over the shapes a seller can actually type.
 *
 * The parser's fallbacks all say "leave it literal", and the invariant that
 * makes them safe is that no ordinary character is ever consumed - only
 * markers. That is easy to assert and hard to eyeball across every combination
 * of ragged asterisks, so it is swept rather than enumerated.
 *
 * The generator is seeded, so a failure here reproduces exactly.
 */

/** Small deterministic PRNG - no dependency, same sequence every run. */
function makeRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

const ALPHABET = ['a', 'b', ' ', '*', '*', '*', '#', '\\', '\n', '1', '.'];

function randomSource(next: () => number, maxLength: number): string {
  const length = Math.floor(next() * maxLength);
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += ALPHABET[Math.floor(next() * ALPHABET.length)];
  }
  return out;
}

/** Markers, wherever they appear in a line's body. */
function withoutMarkers(text: string): string {
  return text.replace(/[*#\\\n]/g, '');
}

/**
 * Everything in the source that is not syntax, in order.
 *
 * The size prefix is two characters, not one: "# " spends a space as well as a
 * hash, and the parser is right to consume both. Stripped from the source only
 * - the rendered text has already lost it, and stripping it twice would eat a
 * real leading space from a line whose content legitimately begins "# ".
 */
function meaningfulInSource(source: string): string {
  return withoutMarkers(
    source
      .replace(/\r\n?/g, '\n')
      .split('\n')
      .map((line) => line.replace(/^#{1,2} /, ''))
      .join('\n'),
  );
}

describe('parseRichText over arbitrary seller input', () => {
  it('never drops a character that carries meaning', () => {
    const next = makeRandom(20260928);

    for (let i = 0; i < 1200; i += 1) {
      const source = randomSource(next, 40);
      const rendered = plainText(source);

      // Markers may vanish - that is their job. Letters, digits, punctuation
      // and the spaces between them may not.
      expect(withoutMarkers(rendered), `lost text for input ${JSON.stringify(source)}`)
        .toBe(meaningfulInSource(source));
    }
  });

  it('always returns one block per line, however ragged the markers', () => {
    const next = makeRandom(7);

    for (let i = 0; i < 1200; i += 1) {
      const source = randomSource(next, 40);
      const lineCount = source.replace(/\r\n?/g, '\n').split('\n').length;

      expect(parseRichText(source), `wrong block count for ${JSON.stringify(source)}`)
        .toHaveLength(lineCount);
    }
  });

  it('terminates on long runs of nothing but markers', () => {
    // Guards against a pathological input pairing up into deep recursion.
    for (const length of [50, 200, 1000]) {
      const marks = '*'.repeat(length);
      expect(plainText(marks)).toBe(marks);
      expect(() => parseRichText(`${marks}\n${marks}`)).not.toThrow();
    }
  });
});

/*
 * The toolbar's transforms get the same treatment, for a blunter reason: these
 * run against text a seller has already written. A wrong offset here does not
 * render oddly, it eats a word out of the middle of their description.
 *
 * Formatting is allowed not to take - markers the seller typed themselves can
 * leave a wrap unpaired, and the parser then shows it literally. What is never
 * allowed is for the words to change.
 */
describe('toolbar transforms over arbitrary selections', () => {
  const MARKS = ['bold', 'italic'] as const;
  const SIZES: BlockSize[] = ['normal', 'medium', 'large'];

  /**
   * The words a reader ends up seeing.
   *
   * Compared through the parser rather than by stripping characters, because
   * syntax is contextual: the space in a "# " prefix belongs to the marker,
   * while the same space one column later is the seller's. Only the parser
   * knows which is which, and both sides of the comparison go through it.
   */
  const rendersAs = (source: string) => withoutMarkers(plainText(source));

  it('toggleMark never changes the words, only their markers', () => {
    const next = makeRandom(4242);

    for (let i = 0; i < 1500; i += 1) {
      const value = randomSource(next, 30);
      const a = Math.floor(next() * (value.length + 1));
      const b = Math.floor(next() * (value.length + 1));
      const mark = MARKS[Math.floor(next() * MARKS.length)]!;

      const result = toggleMark({ value, start: a, end: b }, mark);
      const where = `${mark} on ${JSON.stringify(value)} [${Math.min(a, b)},${Math.max(a, b)}]`;

      expect(rendersAs(result.value), `words changed: ${where}`)
        .toBe(rendersAs(value));
      // An offset past either end would put the caret somewhere that does not
      // exist, and setSelectionRange would silently clamp it somewhere wrong.
      expect(result.start >= 0 && result.start <= result.end, `bad range: ${where}`).toBe(true);
      expect(result.end <= result.value.length, `end past the text: ${where}`).toBe(true);
    }
  });

  it('setBlockSize never changes the words either', () => {
    const next = makeRandom(99);

    for (let i = 0; i < 1500; i += 1) {
      const value = randomSource(next, 30);
      const a = Math.floor(next() * (value.length + 1));
      const b = Math.floor(next() * (value.length + 1));
      const size = SIZES[Math.floor(next() * SIZES.length)]!;

      const result = setBlockSize({ value, start: a, end: b }, size);
      const where = `${size} on ${JSON.stringify(value)}`;

      expect(rendersAs(result.value), `words changed: ${where}`)
        .toBe(rendersAs(value));
      expect(result.start >= 0 && result.start <= result.end, `bad range: ${where}`).toBe(true);
      expect(result.end <= result.value.length, `end past the text: ${where}`).toBe(true);
    }
  });

  it('never leaves a marker pair straddling a line break', () => {
    // The bug this exists for: one pair around a two-line selection renders as
    // literal asterisks, because blocks are split on newlines before any inline
    // parsing happens.
    const next = makeRandom(31337);

    for (let i = 0; i < 1500; i += 1) {
      // Markers are stripped from the source, so every asterisk below is one
      // the toolbar put there and each line's count should balance.
      const words = randomSource(next, 25).replace(/[*#\\]/g, 'x');
      if (!words.includes('\n')) continue;

      for (const mark of MARKS) {
        const result = toggleMark({ value: words, start: 0, end: words.length }, mark);
        for (const line of result.value.split('\n')) {
          const markers = (line.match(/\*/g) ?? []).length;
          expect(markers % 2, `unpaired markers on a line from ${JSON.stringify(words)}: ${line}`)
            .toBe(0);
        }
      }
    }
  });
});

/*
 * Sellers do not perform one operation and stop. They bold a phrase, resize the
 * line, change their mind, unbold. Each step feeds the next its own output, so
 * a transform that is individually correct can still drift when composed - and
 * a chain is where the awkward intermediate states (a stray marker, a hash
 * pushed to the front of a line) actually get built.
 */
describe('chains of toolbar operations', () => {
  const words = (source: string) => withoutMarkers(plainText(source));

  it('never change the words, however they are combined', () => {
    for (let seed = 1; seed <= 12; seed += 1) {
      const next = makeRandom(seed * 7919);

      for (let i = 0; i < 250; i += 1) {
        const start = randomSource(next, 36);
        let current = { value: start, start: 0, end: 0 };

        for (let step = 0; step < 4; step += 1) {
          const a = Math.floor(next() * (current.value.length + 1));
          const b = Math.floor(next() * (current.value.length + 1));
          const roll = next();
          const selection = { value: current.value, start: a, end: b };

          current = roll < 0.5
            ? toggleMark(selection, roll < 0.25 ? 'bold' : 'italic')
            : setBlockSize(selection, roll < 0.7 ? 'large' : roll < 0.85 ? 'medium' : 'normal');

          expect(
            current.start >= 0 && current.start <= current.end
              && current.end <= current.value.length,
            `selection left the text, from ${JSON.stringify(start)} at step ${step}`,
          ).toBe(true);
        }

        expect(words(current.value), `words changed from ${JSON.stringify(start)}`)
          .toBe(words(start));
      }
    }
  });

  it('leave a line at the size the toolbar last asked for', () => {
    // Pressing a size button twice must not differ from pressing it once, and
    // the button must light up for the size the line actually ended at.
    for (let seed = 1; seed <= 10; seed += 1) {
      const next = makeRandom(seed * 104729);

      for (let i = 0; i < 250; i += 1) {
        const value = randomSource(next, 30).replace(/\n/g, 'x');
        const caret = Math.floor(next() * (value.length + 1));
        const size = SIZES_FOR_CHAIN[Math.floor(next() * SIZES_FOR_CHAIN.length)]!;

        const once = setBlockSize({ value, start: caret, end: caret }, size);
        const twice = setBlockSize(once, size);

        expect(twice.value, `not idempotent: ${JSON.stringify(value)} -> ${size}`)
          .toBe(once.value);
        expect(blockSizeAt(once.value, once.start), `size not reported back for ${JSON.stringify(value)}`)
          .toBe(size);
      }
    }
  });
});

const SIZES_FOR_CHAIN: BlockSize[] = ['normal', 'medium', 'large'];
