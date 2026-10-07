import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useHideOnScroll } from './useHideOnScroll';

/** jsdom never scrolls anything, so the position is set and the event faked. */
const scrollTo = (y: number) => {
  act(() => {
    Object.defineProperty(window, 'scrollY', { value: y, configurable: true, writable: true });
    window.dispatchEvent(new Event('scroll'));
  });
};

beforeEach(() => {
  Object.defineProperty(window, 'scrollY', { value: 0, configurable: true, writable: true });
});

describe('useHideOnScroll', () => {
  it('starts visible', () => {
    const { result } = renderHook(() => useHideOnScroll());
    expect(result.current.hidden).toBe(false);
  });

  it('hides on the way down and comes back on the way up', () => {
    const { result } = renderHook(() => useHideOnScroll());

    scrollTo(400);
    expect(result.current.hidden).toBe(true);

    scrollTo(300);
    expect(result.current.hidden).toBe(false);
  });

  /* The top of a page is where someone arrives and looks for their bearings,
     and a short page that barely scrolls must not flicker the chrome away. */
  it('stays visible near the top however the page got there', () => {
    const { result } = renderHook(() => useHideOnScroll({ revealAbove: 72 }));

    scrollTo(400);
    expect(result.current.hidden).toBe(true);

    // Down, but still inside the reveal band - a jump back to the top rather
    // than a scroll away from it.
    scrollTo(0);
    expect(result.current.hidden).toBe(false);
    scrollTo(60);
    expect(result.current.hidden).toBe(false);
  });

  it('ignores jitter below the threshold', () => {
    const { result } = renderHook(() => useHideOnScroll({ threshold: 8 }));

    scrollTo(400);
    expect(result.current.hidden).toBe(true);

    // A few pixels of settle after a fling is not a change of mind.
    scrollTo(395);
    expect(result.current.hidden).toBe(true);
  });

  /*
   * The anchor is deliberately not reset by sub-threshold movement, so a slow
   * deliberate drag still adds up to a decision. Without that, a gentle
   * scroll never moves the bar however far it travels.
   */
  it('lets small movements accumulate into a direction', () => {
    const { result } = renderHook(() => useHideOnScroll({ threshold: 8 }));

    scrollTo(400);
    // Each of these is under the threshold against the 400 anchor, so none of
    // them moves the bar - and none of them moves the anchor either.
    scrollTo(397);
    scrollTo(395);
    expect(result.current.hidden).toBe(true);
    // 400 -> 392 finally clears it, measured from the anchor rather than from
    // the previous event, which was three pixels away.
    scrollTo(392);
    expect(result.current.hidden).toBe(false);
  });

  /* iOS reports a negative scrollY while rubber-banding past the top; the
     elastic snap back would otherwise read as a scroll down. */
  it('treats an over-scroll past the top as the top', () => {
    const { result } = renderHook(() => useHideOnScroll());

    scrollTo(400);
    scrollTo(-60);
    expect(result.current.hidden).toBe(false);
    scrollTo(0);
    expect(result.current.hidden).toBe(false);
  });

  /*
   * The bug this default was raised for, caught on the real feed: scrolling
   * to 500 landed at 492, because the images above were still arriving and
   * the browser corrected the scroll position as the page settled. At the old
   * eight-pixel default that correction cleared the bar on its own, so the
   * nav popped back into view mid-scroll with nobody having scrolled up.
   */
  it('ignores the scroll correction a page makes as it settles', () => {
    const { result } = renderHook(() => useHideOnScroll());

    scrollTo(500);
    expect(result.current.hidden).toBe(true);

    scrollTo(492);
    expect(result.current.hidden).toBe(true);
  });

  it('never hides while disabled - reduced motion, or a screen with no bar', () => {
    const { result } = renderHook(() => useHideOnScroll({ disabled: true }));

    scrollTo(400);
    expect(result.current.hidden).toBe(false);
  });

  it('shows again when it becomes disabled mid-scroll', () => {
    const { result, rerender } = renderHook(
      ({ disabled }) => useHideOnScroll({ disabled }),
      { initialProps: { disabled: false } },
    );

    scrollTo(400);
    expect(result.current.hidden).toBe(true);

    rerender({ disabled: true });
    expect(result.current.hidden).toBe(false);
  });

  it('reveal() brings it back without waiting for a scroll up', () => {
    const { result } = renderHook(() => useHideOnScroll());

    scrollTo(400);
    expect(result.current.hidden).toBe(true);

    act(() => result.current.reveal());
    expect(result.current.hidden).toBe(false);

    /* And it re-anchors: without that, the next pixel of downward movement
       would measure from 400 and hide the bar again immediately. */
    scrollTo(404);
    expect(result.current.hidden).toBe(false);
  });

  it('stops listening once unmounted', () => {
    const { result, unmount } = renderHook(() => useHideOnScroll());
    unmount();
    expect(() => scrollTo(400)).not.toThrow();
    expect(result.current.hidden).toBe(false);
  });
});
