import { afterEach, describe, expect, it, vi } from 'vitest';
import { listingUrl, shareCaption, shareFiles, whatsappUrl } from './share';
import { Listing } from '../types';

const listing = (over: Partial<Listing> = {}): Listing => ({
  id: 'abc123',
  title: 'Mountain bike',
  price: 850,
  category: 'Product',
  condition: 'Good',
  location: 'Main Campus',
  image: '',
  gallery: [],
  description: '',
  seller: { id: 's1', name: 'Sam', avatar: '', verified: true, ratingAvg: 5, reviewsCount: 2 } as any,
  postedAt: '',
  isAvailable: true,
  isSaved: false,
  ...over,
} as Listing);

describe('listing links', () => {
  it('builds an absolute, shareable URL', () => {
    expect(listingUrl('abc123', 'https://campus.example')).toBe('https://campus.example/listing/abc123');
  });

  it('puts the link last, where WhatsApp previews it', () => {
    const caption = shareCaption(listing(), 'https://campus.example/listing/abc123');
    expect(caption).toContain('Mountain bike');
    // The trailing URL is what gets the preview card and the tap target.
    expect(caption.trimEnd().endsWith('https://campus.example/listing/abc123')).toBe(true);
  });

  it('encodes the message so a title with & or # survives the trip', () => {
    const url = whatsappUrl('Tools & bits #cheap https://x.test/listing/1');
    expect(url.startsWith('https://wa.me/?text=')).toBe(true);
    expect(url).toContain('%26');
    expect(url).toContain('%23');
    expect(url).not.toContain(' ');
  });
});

/*
 * The outcomes matter more than the call: dismissal and failure look the same
 * from the outside and call for opposite responses. Falling back to "we opened
 * WhatsApp instead" after somebody deliberately closed the share sheet is the
 * app overriding a decision they just made.
 */
describe('shareFiles', () => {
  const file = new File(['x'], 'card.png', { type: 'image/png' });
  const original = { share: (navigator as any).share, canShare: (navigator as any).canShare };

  afterEach(() => {
    (navigator as any).share = original.share;
    (navigator as any).canShare = original.canShare;
  });

  const stub = (canShare: boolean, share?: () => Promise<void>) => {
    (navigator as any).canShare = () => canShare;
    (navigator as any).share = share ?? vi.fn().mockResolvedValue(undefined);
  };

  it('reports unsupported when the browser cannot take files', async () => {
    stub(false);
    expect(await shareFiles([file], 'text', 'title')).toBe('unsupported');
  });

  it('reports unsupported when there is no share API at all', async () => {
    (navigator as any).share = undefined;
    (navigator as any).canShare = undefined;
    expect(await shareFiles([file], 'text', 'title')).toBe('unsupported');
  });

  it('reports shared when the sheet accepts it', async () => {
    stub(true);
    expect(await shareFiles([file], 'text', 'title')).toBe('shared');
  });

  it('separates a dismissed sheet from a broken one', async () => {
    const abort = Object.assign(new Error('cancelled'), { name: 'AbortError' });
    stub(true, () => Promise.reject(abort));
    expect(await shareFiles([file], 'text', 'title')).toBe('dismissed');

    stub(true, () => Promise.reject(new Error('boom')));
    expect(await shareFiles([file], 'text', 'title')).toBe('failed');
  });
});
