import { describe, expect, it } from 'vitest';
import { COLUMN_W, MARGIN, PAGE_W, layoutPoster } from './layout';
import type { QrCardContent } from './card';

/*
 * jsdom has no canvas, and this does not need one: layoutPoster only ever asks
 * the context how wide a string is. A monospace stand-in answers that
 * consistently, which is all the arithmetic under test depends on.
 */
const measure = (() => {
  let size = 54;
  return {
    set font(value: string) {
      size = Number(value.match(/(\d+)px/)?.[1] ?? 54);
    },
    get font() {
      return `${size}px`;
    },
    measureText: (text: string) => ({ width: text.length * size * 0.5 }),
  } as unknown as CanvasRenderingContext2D;
})();

/** An <img> as far as the layout is concerned: two numbers. */
const photo = (w: number, h: number) => ({ width: w, height: h }) as HTMLImageElement;

const content = (over: Partial<QrCardContent> = {}): QrCardContent => ({
  title: 'Mountain bike',
  price: 'K1,250',
  url: 'https://campusmarket.app/listing/abc',
  prettyUrl: 'campusmarket.app/listing/abc',
  ...over,
});

const SHAPES: Array<[string, number, number]> = [
  ['wide panorama', 4000, 900],
  ['landscape phone', 1920, 1080],
  ['4:3 camera', 1600, 1200],
  ['square', 1200, 1200],
  ['3:4 portrait', 1080, 1440],
  ['9:16 phone', 1080, 1920],
  ['tall screenshot', 828, 2400],
];

describe('the frame the photo is given', () => {
  /*
   * The promise the whole redesign rests on. The frame is cut to the photo
   * rather than the photo to the frame, so there is nothing to crop and nothing
   * to letterbox - which is what the old blurred wash existed to hide.
   */
  it.each(SHAPES)('takes the aspect of a %s exactly', (_name, w, h) => {
    const { frame } = layoutPoster(measure, content(), photo(w, h));
    expect(frame.w / frame.h).toBeCloseTo(w / h, 4);
  });

  it.each(SHAPES)('keeps a %s inside the column and the height cap', (_name, w, h) => {
    const { frame, page } = layoutPoster(measure, content(), photo(w, h));
    expect(frame.w).toBeLessThanOrEqual(COLUMN_W + 0.001);
    expect(frame.x).toBeGreaterThanOrEqual(MARGIN - 0.001);
    expect(frame.x + frame.w).toBeLessThanOrEqual(PAGE_W - MARGIN + 0.001);
    // A floor rather than a target: see the panorama note below for why this
    // one is a fifth and not the third everything else manages.
    expect(frame.h / page.h).toBeGreaterThan(0.2);
  });

  /* The photo is the reason the poster exists, so on the shapes a phone
     actually produces it is the largest thing on the page. */
  it.each(SHAPES.slice(1))('gives a %s at least a third of the page', (_name, w, h) => {
    const { frame, page } = layoutPoster(measure, content(), photo(w, h));
    expect(frame.h / page.h).toBeGreaterThan(0.33);
  });

  /*
   * The one shape that cannot win: a 4:1 panorama fitted to the column is 200px
   * tall, and the title, price and code below it are not. Shown whole anyway -
   * a strip of the whole photo beats a crop of a quarter of it - but recorded
   * here so that the thin result reads as a decision rather than a bug.
   */
  it('shows a panorama whole even though it ends up a strip', () => {
    const { frame } = layoutPoster(measure, content(), photo(4000, 900));
    expect(frame.w).toBe(COLUMN_W);
    expect(frame.w / frame.h).toBeCloseTo(4000 / 900, 4);
  });

  it('centres a photo too tall to use the full column', () => {
    const { frame } = layoutPoster(measure, content(), photo(828, 2400));
    expect(frame.w).toBeLessThan(COLUMN_W);
    expect(frame.x - MARGIN).toBeCloseTo(PAGE_W - MARGIN - (frame.x + frame.w), 4);
  });

  it('reserves a sane box when there is no photo at all', () => {
    const { frame, page } = layoutPoster(measure, content(), null);
    expect(frame.w).toBe(COLUMN_W);
    expect(frame.h).toBeGreaterThan(0);
    expect(frame.y + frame.h).toBeLessThan(page.h);
  });
});

describe('the page the frame produces', () => {
  it('is always the same width, so a style’s numbers are all in one scale', () => {
    SHAPES.forEach(([, w, h]) => {
      expect(layoutPoster(measure, content(), photo(w, h)).page.w).toBe(PAGE_W);
    });
  });

  /* The point of the exercise: the poster is as tall as its photo asks it to
     be, so a landscape listing is not a portrait page with a strip in it. */
  it('gets shorter as the photo gets wider', () => {
    const heights = SHAPES.map(([, w, h]) => layoutPoster(measure, content(), photo(w, h)).page.h);
    const sorted = [...heights].sort((a, b) => a - b);
    expect(heights).toEqual(sorted);
  });

  it('is markedly shorter for a landscape photo than a portrait one', () => {
    const wide = layoutPoster(measure, content(), photo(1920, 1080)).page;
    const tall = layoutPoster(measure, content(), photo(1080, 1440)).page;
    expect(wide.h).toBeLessThan(tall.h * 0.8);
  });

  it('grows by exactly one line for a title that needs two', () => {
    const one = layoutPoster(measure, content({ title: 'Kettle' }), photo(1200, 1200));
    const two = layoutPoster(
      measure,
      content({ title: 'A listing title long enough to need a second line of its own' }),
      photo(1200, 1200),
    );
    expect(one.title.lines).toHaveLength(1);
    expect(two.title.lines).toHaveLength(2);
    expect(two.page.h - one.page.h).toBe(one.title.lead);
  });

  it('leaves room for everything it placed, in order', () => {
    const { frame, title, price, dividerY, qr, page } = layoutPoster(
      measure, content({ title: 'Something with a reasonably long name' }), photo(1200, 1600),
    );
    expect(frame.y + frame.h).toBeLessThan(title.baseline - title.size);
    expect(title.baseline + (title.lines.length - 1) * title.lead).toBeLessThan(price.baseline);
    expect(price.baseline).toBeLessThan(dividerY);
    expect(dividerY).toBeLessThan(qr.y);
    // The bottom margin matches the side margins, which is what makes the page
    // look deliberate rather than cut off.
    expect(page.h - (qr.y + qr.h)).toBeCloseTo(MARGIN, 0);
  });
});
