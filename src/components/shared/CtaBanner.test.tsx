import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  CtaBanner, ctaBannersFrom, placeCtaBanners, CTA_INLINE_AFTER, CTA_MIN_TAIL_CARDS,
} from './CtaBanner';
import { PromoSlot } from '../../types';

const banner = (over: Partial<PromoSlot> = {}): PromoSlot => ({
  id: 'b1', placement: 'CTA_BANNER', theme: 'PURPLE', wide: false,
  active: true, sortOrder: 0, imageOverlay: 40,
  title: 'Sell what you are not using.',
  subtitle: 'Zero platform fees.',
  ctaLabel: 'Start selling', ctaLink: '/sell',
  ...over,
});

/** Just enough results for both banners to be drawn. */
const ENOUGH = CTA_INLINE_AFTER + CTA_MIN_TAIL_CARDS;

describe('ctaBannersFrom', () => {
  it('takes only published banners, in the admin’s order', () => {
    const picked = ctaBannersFrom([
      banner({ id: 'second', sortOrder: 1 }),
      banner({ id: 'hidden', sortOrder: 0, active: false }),
      banner({ id: 'first', sortOrder: 0 }),
      { ...banner({ id: 'slide' }), placement: 'CAROUSEL' },
      { ...banner({ id: 'tile' }), placement: 'BENTO' },
    ]);
    expect(picked.map((p) => p.id)).toEqual(['first', 'second']);
  });

  it('ignores anything past the two the pages can draw', () => {
    const picked = ctaBannersFrom([0, 1, 2, 3].map((i) => banner({ id: `b${i}`, sortOrder: i })));
    expect(picked.map((p) => p.id)).toEqual(['b0', 'b1']);
  });
});

describe('placeCtaBanners', () => {
  const two = [banner({ id: 'first' }), banner({ id: 'second', sortOrder: 1 })];

  it('splits the two apart when there are results to separate them', () => {
    const { inline, tail } = placeCtaBanners(two, ENOUGH);
    expect(inline?.id).toBe('first');
    expect(tail?.id).toBe('second');
  });

  /*
   * The rule the whole arrangement exists for: two banners back to back is an
   * advert break. One card short of the gap, the inline one is dropped rather
   * than pushed up against the tail one.
   */
  it('never draws both when the grid is too short to keep them apart', () => {
    const { inline, tail } = placeCtaBanners(two, ENOUGH - 1);
    expect(inline).toBeNull();
    expect(tail?.id).toBe('first');
  });

  it('puts a lone banner at the foot of the page, never mid-grid', () => {
    const { inline, tail } = placeCtaBanners([banner({ id: 'only' })], 200);
    expect(inline).toBeNull();
    expect(tail?.id).toBe('only');
  });

  it('draws nothing when an admin has published nothing', () => {
    expect(placeCtaBanners([], 200)).toEqual({ inline: null, tail: null });
  });
});

describe('CtaBanner', () => {
  it('renders the admin’s copy and follows the link from the button', () => {
    const onNavigate = vi.fn();
    render(<CtaBanner slot={banner()} onNavigate={onNavigate} />);

    expect(screen.getByRole('heading', { name: 'Sell what you are not using.' })).toBeInTheDocument();
    expect(screen.getByText('Zero platform fees.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Start selling/ }));
    expect(onNavigate).toHaveBeenCalledWith('/sell');
  });

  /* A panel that goes somewhere but cannot be pressed is a dead end, so the
     banner itself becomes the button when the label is left empty. */
  it('makes the whole banner clickable when there is no button label', () => {
    const onNavigate = vi.fn();
    render(<CtaBanner slot={banner({ ctaLabel: undefined })} onNavigate={onNavigate} />);

    fireEvent.click(screen.getByRole('button', { name: 'Sell what you are not using.' }));
    expect(onNavigate).toHaveBeenCalledWith('/sell');
  });

  it('draws the collage pictures, capped at what the layout holds', () => {
    const images = ['/a.webp', '/b.webp', '/c.webp', '/d.webp', '/e.webp', '/f.webp', '/g.webp'];
    const { container } = render(
      <CtaBanner slot={banner({ collageImages: images })} onNavigate={vi.fn()} />,
    );
    // Decorative, so they are hidden from the accessibility tree and counted
    // from the DOM rather than by role.
    expect(container.querySelectorAll('img').length).toBe(6);
  });

  it('still renders without a collage - the state every new banner starts in', () => {
    const { container } = render(<CtaBanner slot={banner()} onNavigate={vi.fn()} />);
    expect(container.querySelectorAll('img').length).toBe(0);
    expect(screen.getByRole('heading', { name: 'Sell what you are not using.' })).toBeInTheDocument();
  });

  it('applies an admin’s custom colours over the theme', () => {
    const { container } = render(
      <CtaBanner
        slot={banner({ bgColor: '#123456', textColor: '#ffffff' })}
        onNavigate={vi.fn()}
      />,
    );
    const panel = container.querySelector('section') as HTMLElement;
    expect(panel.style.backgroundColor).toBe('rgb(18, 52, 86)');
    // The theme gradient must be gone: a class and an inline background do not
    // compose, and leaving both leaves the result to the cascade.
    expect(panel.className).not.toContain('bg-gradient-to-br');
  });
});
