import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ListingImage } from './ListingImage';

const FULL = '/api/uploads/abc.webp';
const THUMB = '/api/uploads/abc.thumb.webp';

describe('ListingImage', () => {
  it('fetches the thumbnail and loads lazily by default', () => {
    render(<ListingImage src={FULL} alt="a listing" />);
    const img = screen.getByRole('img', { name: 'a listing' });
    expect(img).toHaveAttribute('src', THUMB);
    expect(img).toHaveAttribute('loading', 'lazy');
    expect(img).toHaveAttribute('decoding', 'async');
  });

  it('fetches the full image, eagerly and at high priority, when asked', () => {
    render(<ListingImage src={FULL} alt="hero" full eager />);
    const img = screen.getByRole('img', { name: 'hero' });
    expect(img).toHaveAttribute('src', FULL);
    expect(img).toHaveAttribute('loading', 'eager');
    expect(img).toHaveAttribute('fetchpriority', 'high');
  });

  it('falls back to the full image if the thumbnail fails to load', () => {
    // An image uploaded before thumbnails existed, or whose thumbnail was
    // rejected: the card must show the photo, not a broken image.
    render(<ListingImage src={FULL} alt="old" />);
    const img = screen.getByRole('img', { name: 'old' });
    expect(img).toHaveAttribute('src', THUMB);

    fireEvent.error(img);
    expect(img).toHaveAttribute('src', FULL);
  });

  it('loads an external image as-is - there is no thumbnail to try', () => {
    const external = 'https://lh3.googleusercontent.com/photo.jpg';
    render(<ListingImage src={external} alt="ext" />);
    expect(screen.getByRole('img', { name: 'ext' })).toHaveAttribute('src', external);
  });

  it('passes other attributes through to the img', () => {
    render(<ListingImage src={FULL} alt="styled" className="w-full object-cover" />);
    expect(screen.getByRole('img', { name: 'styled' })).toHaveClass('object-cover');
  });
});
