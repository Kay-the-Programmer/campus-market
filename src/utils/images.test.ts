import { describe, expect, it } from 'vitest';
import { thumbnailUrl } from './images';

/**
 * The thumbnail is derived from the full image's URL by convention, on both
 * sides of the API. If this derivation drifts from the backend's naming
 * (ImageStorageService.THUMB_SUFFIX), every card silently falls back to the
 * full image and the whole optimisation evaporates without an error - so the
 * exact string shape is worth pinning.
 */
describe('thumbnailUrl', () => {
  it('inserts .thumb before the extension of a stored image', () => {
    expect(thumbnailUrl('/api/uploads/abc-123.webp')).toBe('/api/uploads/abc-123.thumb.webp');
  });

  it('works on the absolute form the API boundary produces', () => {
    expect(thumbnailUrl('https://api.example.test/api/uploads/abc.jpg'))
      .toBe('https://api.example.test/api/uploads/abc.thumb.jpg');
  });

  it('returns null for images the API did not store - nothing to derive', () => {
    expect(thumbnailUrl('https://lh3.googleusercontent.com/photo.jpg')).toBeNull();
    expect(thumbnailUrl('https://images.unsplash.com/photo-1.jpg?w=800')).toBeNull();
    expect(thumbnailUrl('data:image/png;base64,AAAA')).toBeNull();
  });

  it('returns null for empty input', () => {
    expect(thumbnailUrl('')).toBeNull();
    expect(thumbnailUrl(undefined)).toBeNull();
    expect(thumbnailUrl(null)).toBeNull();
  });

  it('does not stack the suffix on a URL that is already a thumbnail', () => {
    const thumb = '/api/uploads/abc.thumb.webp';
    expect(thumbnailUrl(thumb)).toBe(thumb);
  });

  it('is unfazed by a dot in the id', () => {
    // UUIDs have none, but the rule should key off the LAST dot regardless.
    expect(thumbnailUrl('/api/uploads/a.b.c.png')).toBe('/api/uploads/a.b.c.thumb.png');
  });
});
