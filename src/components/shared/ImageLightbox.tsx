import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Loader2 } from 'lucide-react';
import { thumbnailUrl } from '../../utils/images';

interface ImageLightboxProps {
  /** Full-size URLs, in gallery order. */
  images: string[];
  /** Which one is open. Controlled, so the page and the viewer never disagree. */
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  /** Describes the listing, not the photo - there is no per-photo caption. */
  alt?: string;
}

const MIN_SCALE = 1;
const MAX_SCALE = 5;
/** Where a double-tap lands. Enough to read a label or see a scuff. */
const DOUBLE_TAP_SCALE = 2.5;

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

/**
 * Full-screen photo viewer with zoom.
 *
 * <p>The listing page crops its photo to a fixed aspect box, which is right
 * for the layout and wrong for the decision: a buyer is being asked to hand
 * over cash for a second-hand thing, and the answer to "what condition is it
 * actually in?" is in the corner that the crop cut off, at a size the page
 * never shows. This is where the whole frame is visible, at full resolution,
 * and where it can be magnified.
 *
 * <p>Zoom works the way it does everywhere else, because nobody reads
 * instructions for a photo: pinch, wheel, double-tap, or the buttons. Panning
 * is only possible while zoomed in, and the image is clamped so it cannot be
 * flung off screen and lost.
 */
export const ImageLightbox: React.FC<ImageLightboxProps> = ({
  images,
  index,
  onIndexChange,
  onClose,
  alt = '',
}) => {
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [loaded, setLoaded] = useState(false);

  const stageRef = useRef<HTMLDivElement>(null);
  /** The photo itself, for its laid-out size - what the pan is clamped to. */
  const imageRef = useRef<HTMLImageElement>(null);
  /** Live pointers, so one finger pans and two pinch. */
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; scale: number } | null>(null);
  /** Focus goes back where it came from on close, as a dialog must. */
  const returnFocus = useRef<HTMLElement | null>(null);

  const src = images[index];
  const thumb = thumbnailUrl(src);
  const zoomed = scale > 1;

  /**
   * Keeps the image from being panned into the void.
   *
   * <p>Measured against the photo, not the stage. A portrait photo in a wide
   * window is letterboxed - it is drawn far narrower than the black area
   * around it - and clamping to the stage let it be dragged sideways until
   * half the screen was empty, with the thing being examined pushed off the
   * edge. The legal travel is however much the scaled photo overhangs the
   * stage, and nothing when it is smaller than the stage, which is what
   * re-centres it on zooming back out.
   */
  const clampOffset = useCallback((next: { x: number; y: number }, atScale: number) => {
    const stage = stageRef.current;
    const image = imageRef.current;
    if (!stage || !image) return next;
    // offsetWidth is the untransformed layout size; the transform is ours.
    const maxX = Math.max(0, (image.offsetWidth * atScale - stage.clientWidth) / 2);
    const maxY = Math.max(0, (image.offsetHeight * atScale - stage.clientHeight) / 2);
    return {
      x: clamp(next.x, -maxX, maxX),
      y: clamp(next.y, -maxY, maxY),
    };
  }, []);

  /**
   * Zooms about a point rather than about the middle.
   *
   * <p>Zooming about the centre moves whatever you were looking at away from
   * the cursor, so you chase it with a pan after every step. Solving for the
   * offset that keeps the anchored point still is what makes wheel and pinch
   * feel like they are grabbing the photo instead of nudging it.
   */
  const zoomAbout = useCallback((nextScale: number, anchor?: { x: number; y: number }) => {
    const stage = stageRef.current;
    const target = clamp(nextScale, MIN_SCALE, MAX_SCALE);

    setScale((current) => {
      setOffset((currentOffset) => {
        if (!stage || !anchor || target === current) {
          return clampOffset(target === MIN_SCALE ? { x: 0, y: 0 } : currentOffset, target);
        }
        const box = stage.getBoundingClientRect();
        // The anchor as a vector from the centre, which is the transform origin.
        const ax = anchor.x - (box.left + box.width / 2);
        const ay = anchor.y - (box.top + box.height / 2);
        const ratio = target / current;
        return clampOffset(
          { x: ax - (ax - currentOffset.x) * ratio, y: ay - (ay - currentOffset.y) * ratio },
          target,
        );
      });
      return target;
    });
  }, [clampOffset]);

  const reset = useCallback(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  const step = useCallback((delta: number) => {
    if (images.length < 2) return;
    onIndexChange((index + delta + images.length) % images.length);
  }, [images.length, index, onIndexChange]);

  /* A new photo arrives at 1x. Carrying the previous zoom over would open the
     next image already halfway into a corner of it. */
  useEffect(() => {
    reset();
    setLoaded(false);
  }, [index, reset]);

  /* Open as a dialog: take focus, stop the page behind from scrolling, and
     give both back on the way out. */
  useEffect(() => {
    returnFocus.current = document.activeElement as HTMLElement | null;
    stageRef.current?.focus();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
      returnFocus.current?.focus?.();
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape': onClose(); break;
        case 'ArrowRight': step(1); break;
        case 'ArrowLeft': step(-1); break;
        case '+': case '=': zoomAbout(scale + 0.5); break;
        case '-': zoomAbout(scale - 0.5); break;
        case '0': reset(); break;
        default: return;
      }
      // Only for keys handled above: the page behind must not also scroll or
      // step through its own gallery.
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, step, zoomAbout, reset, scale]);

  /*
   * Wheel is bound by hand because React's listener is passive, and a passive
   * listener may not call preventDefault - so ctrl+wheel would zoom the whole
   * browser page and a plain wheel would scroll the listing underneath while
   * the viewer sat there ignoring it.
   */
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      // Trackpad pinch arrives as ctrl+wheel; both mean the same thing here.
      const factor = e.deltaY > 0 ? 0.85 : 1.18;
      zoomAbout(scale * factor, { x: e.clientX, y: e.clientY });
    };
    stage.addEventListener('wheel', onWheel, { passive: false });
    return () => stage.removeEventListener('wheel', onWheel);
  }, [zoomAbout, scale]);

  const distance = () => {
    const [a, b] = [...pointers.current.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  const midpoint = () => {
    const [a, b] = [...pointers.current.values()];
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      pinch.current = { dist: distance(), scale };
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const previous = pointers.current.get(e.pointerId);
    if (!previous) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 2 && pinch.current) {
      const started = pinch.current;
      zoomAbout(started.scale * (distance() / started.dist), midpoint());
      return;
    }
    // One finger pans, and only when there is something to pan: at 1x a drag
    // would otherwise slide the whole photo around its own empty box.
    if (pointers.current.size === 1 && zoomed) {
      setOffset((current) => clampOffset(
        { x: current.x + (e.clientX - previous.x), y: current.y + (e.clientY - previous.y) },
        scale,
      ));
    }
  };

  const endPointer = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  };

  /** Double-click and double-tap both land here: in, or all the way back out. */
  const onDoubleClick = (e: React.MouseEvent) => {
    if (zoomed) reset();
    else zoomAbout(DOUBLE_TAP_SCALE, { x: e.clientX, y: e.clientY });
  };

  return (
    <div
      className="fixed inset-0 z-[60] bg-slate-950 flex flex-col animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-label={alt ? `Photo of ${alt}` : 'Photo viewer'}
    >
      {/* ------------------------------------------------------------ chrome */}
      <div className="relative z-10 flex items-center justify-between gap-3 p-3 sm:p-4 text-white">
        <span className="text-xs font-semibold tabular-nums text-white/70 px-2">
          {images.length > 1 ? `${index + 1} / ${images.length}` : 'Photo'}
        </span>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => zoomAbout(scale - 0.5)}
            disabled={scale <= MIN_SCALE}
            aria-label="Zoom out"
            className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-30 disabled:hover:bg-white/10 flex items-center justify-center transition-colors"
          >
            <ZoomOut className="w-5 h-5" />
          </button>
          <span className="text-xs font-bold tabular-nums w-12 text-center" aria-live="polite">
            {Math.round(scale * 100)}%
          </span>
          <button
            type="button"
            onClick={() => zoomAbout(scale + 0.5)}
            disabled={scale >= MAX_SCALE}
            aria-label="Zoom in"
            className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-30 disabled:hover:bg-white/10 flex items-center justify-center transition-colors"
          >
            <ZoomIn className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close photo viewer"
            className="ml-1 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* ------------------------------------------------------------- stage */}
      {/*
        touch-none hands every gesture to the handlers below. Without it the
        browser claims the pinch and scrolls or page-zooms instead, which on a
        phone is most of the feature.
      */}
      <div
        ref={stageRef}
        tabIndex={-1}
        className={`relative flex-1 overflow-hidden touch-none select-none outline-none ${
          zoomed ? 'cursor-grab active:cursor-grabbing' : 'cursor-zoom-in'
        }`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        onDoubleClick={onDoubleClick}
      >
        {/* Clicking the backdrop closes, the way every viewer does - but never
            while zoomed, where a click is the end of a pan and closing would
            throw away the thing being examined. */}
        {!zoomed && (
          <button
            type="button"
            onClick={onClose}
            tabIndex={-1}
            aria-hidden="true"
            className="absolute inset-0 w-full h-full cursor-zoom-in"
          />
        )}

        <div className="absolute inset-0 flex items-center justify-center p-2 sm:p-6 pointer-events-none">
          {/* The thumbnail is almost certainly already cached from the page
              that opened this, so it stands in - blurred, at full frame -
              instead of a black rectangle while the large file downloads. */}
          {thumb && !loaded && (
            <img
              src={thumb}
              alt=""
              aria-hidden="true"
              className="absolute inset-0 w-full h-full object-contain blur-sm opacity-60 p-2 sm:p-6"
            />
          )}

          <img
            src={src}
            alt={alt}
            draggable={false}
            ref={(node) => {
              imageRef.current = node;
              /*
               * A cached photo can finish decoding before React attaches the
               * onLoad below, which never fires then - leaving the image at
               * opacity 0 behind a spinner that never stops. Reopening a photo
               * you just looked at is the common case, not the edge one, so
               * this is the path most viewings take.
               */
              if (node?.complete && node.naturalWidth > 0) setLoaded(true);
            }}
            onLoad={() => setLoaded(true)}
            // object-contain, not cover: this is the view that shows the whole
            // frame, including the corner the listing page crops away.
            className={`max-w-full max-h-full object-contain transition-opacity duration-200 ${
              loaded ? 'opacity-100' : 'opacity-0'
            }`}
            style={{
              transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
              // Animate the button and double-tap steps, but never a drag or a
              // live pinch - a transition there lags a finger that is still moving.
              transition: pointers.current.size ? 'none' : 'transform 150ms ease-out',
            }}
          />

          {!loaded && (
            <Loader2 className="absolute w-8 h-8 text-white/80 animate-spin" aria-hidden="true" />
          )}
        </div>

        {images.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => step(-1)}
              aria-label="Previous photo"
              className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/10 hover:bg-white/25 backdrop-blur-sm text-white flex items-center justify-center transition-colors active:scale-90"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
            <button
              type="button"
              onClick={() => step(1)}
              aria-label="Next photo"
              className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/10 hover:bg-white/25 backdrop-blur-sm text-white flex items-center justify-center transition-colors active:scale-90"
            >
              <ChevronRight className="w-6 h-6" />
            </button>
          </>
        )}
      </div>

      {/* ------------------------------------------------------- filmstrip */}
      {images.length > 1 && (
        <div className="relative z-10 flex gap-2 overflow-x-auto p-3 sm:p-4 scrollbar-thin justify-start sm:justify-center">
          {images.map((url, i) => (
            <button
              key={i}
              type="button"
              onClick={() => onIndexChange(i)}
              aria-label={`Photo ${i + 1}`}
              aria-current={i === index}
              className={`relative shrink-0 w-14 h-14 rounded-lg overflow-hidden ring-2 transition-all ${
                i === index ? 'ring-white' : 'ring-transparent opacity-50 hover:opacity-100'
              }`}
            >
              <img src={thumbnailUrl(url) ?? url} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}

      <p className="pb-3 text-center text-[11px] text-white/40 px-4">
        Double-tap or pinch to zoom · drag to move · Esc to close
      </p>
    </div>
  );
};
