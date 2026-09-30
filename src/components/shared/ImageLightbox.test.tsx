import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ImageLightbox } from './ImageLightbox';

const images = ['/uploads/a.jpg', '/uploads/b.jpg', '/uploads/c.jpg'];

const open = (over: Partial<React.ComponentProps<typeof ImageLightbox>> = {}) => {
  const props = {
    images,
    index: 0,
    onIndexChange: vi.fn(),
    onClose: vi.fn(),
    alt: 'Mountain bike',
    ...over,
  };
  return { ...render(<ImageLightbox {...props} />), props };
};

const zoomLabel = () => screen.getByText(/%$/).textContent;

/**
 * The gestures themselves (pinch, drag) need real layout to mean anything and
 * jsdom has none, so they are checked in a browser. What is pinned here is the
 * behaviour that is easy to break from a distance: the controls, the keyboard,
 * and the two bits of state that leak outside the component - the page's
 * scroll lock and the zoom level when the photo changes.
 */
describe('ImageLightbox', () => {
  it('shows the whole frame rather than a crop', () => {
    open();
    const photo = screen.getByAltText('Mountain bike');
    expect(photo).toHaveAttribute('src', '/uploads/a.jpg');
    // The listing page crops to its aspect box; this view must not.
    expect(photo.className).toContain('object-contain');
  });

  it('zooms in and out from the buttons', () => {
    open();
    expect(zoomLabel()).toBe('100%');

    fireEvent.click(screen.getByLabelText('Zoom in'));
    expect(zoomLabel()).toBe('150%');

    fireEvent.click(screen.getByLabelText('Zoom out'));
    expect(zoomLabel()).toBe('100%');
    // Nothing to zoom out of: the control says so rather than going below 1x.
    expect(screen.getByLabelText('Zoom out')).toBeDisabled();
  });

  it('steps through the gallery with the arrow keys, and wraps', () => {
    const { props } = open({ index: 2 });

    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(props.onIndexChange).toHaveBeenCalledWith(0);

    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(props.onIndexChange).toHaveBeenCalledWith(1);
  });

  it('closes on Escape', () => {
    const { props } = open();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('opens the next photo at 1x', () => {
    const { rerender, props } = open();
    fireEvent.click(screen.getByLabelText('Zoom in'));
    expect(zoomLabel()).toBe('150%');

    // Carrying the zoom over would drop someone into a corner of a photo they
    // have not seen yet.
    rerender(<ImageLightbox {...props} index={1} />);
    expect(zoomLabel()).toBe('100%');
  });

  it('holds the page still while open and lets it go afterwards', () => {
    const { unmount } = open();
    expect(document.body.style.overflow).toBe('hidden');

    unmount();
    expect(document.body.style.overflow).not.toBe('hidden');
  });

  it('offers no gallery controls for a single photo', () => {
    open({ images: ['/uploads/only.jpg'], index: 0 });
    expect(screen.queryByLabelText('Next photo')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Previous photo')).not.toBeInTheDocument();
  });
});
