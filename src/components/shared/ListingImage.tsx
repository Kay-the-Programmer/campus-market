import React, { useEffect, useState } from 'react';
import {
  prefersLighterImages, smallUrl, thumbnailUrl, tinyUrl, SMALL_W, THUMB_W, TINY_W,
} from '../../utils/images';

interface ListingImageProps extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src' | 'loading'> {
  /** The full-size image URL, as stored. The component decides what to fetch. */
  src?: string;
  /**
   * This is the photo of the page, not one tile among many - the detail hero.
   *
   * <p>Does not mean "fetch the big file immediately": see the progressive
   * upgrade below. It means the full-size image is worth fetching at all,
   * which for a 128px card it never is.
   */
  full?: boolean;
  /**
   * Load immediately instead of lazily. For the one image that is already on
   * screen when the page paints - the hero, the detail photo - where lazy
   * loading only delays it. Everything else should stay lazy.
   */
  eager?: boolean;
  /**
   * How wide this image will actually be drawn, as a CSS `sizes` value.
   *
   * <p>Only meaningful alongside the srcset below. The browser picks a
   * candidate before layout exists, so it cannot know that a grid tile is
   * half the viewport on a phone and a quarter of it on a laptop unless it is
   * told. The default describes the browse and search grids, which is what
   * most photos in this app are.
   *
   * <p>A caller drawing a fixed-size row thumbnail must say so, and the
   * saving is not marginal: left on the grid default, a 36px avatar in a
   * search suggestion is described to the browser as 300 CSS pixels wide and
   * it fetches the card rendition accordingly. Pass the CSS width - the
   * browser applies the device pixel ratio itself.
   */
  sizes?: string;
}

/**
 * How wide a photo is actually drawn, for the grids that hold most of them:
 * two columns on a phone, three on a tablet, four on a wide screen.
 *
 * <p>The percentages are a little above the true tile width - a phone tile is
 * nearer 44vw than 48vw once gutters and the gap are taken out. Erring high
 * is deliberate: declare too much and the browser may fetch one size larger
 * than strictly needed, declare too little and it renders a blurry tile it
 * cannot recover from without a second download.
 */
const DEFAULT_SIZES = '(max-width: 639px) 48vw, (max-width: 1023px) 32vw, 300px';

/**
 * An image from the marketplace, loaded the cheap way.
 *
 * <p>Every card, tile and list row should render photos through this rather
 * than a bare {@code <img>}, because it does what they all need and none of
 * them were doing:
 *
 * <ul>
 *   <li><b>Fetches the thumbnail.</b> Cards are at most a few hundred pixels
 *       wide; the stored image is 1600. There are dozens of cards on a page.</li>
 *   <li><b>Loads lazily.</b> A browse page has more tiles below the fold than
 *       above it, and with {@code loading="lazy"} the browser fetches them as
 *       they approach the viewport instead of all at once.</li>
 *   <li><b>Upgrades progressively.</b> On the detail page it shows the
 *       thumbnail first - which the browser almost always already has, because
 *       the card that was just tapped used it - and swaps in the full image
 *       once that arrives. The photo is therefore on screen immediately
 *       instead of after a fresh download, which on a weak connection is the
 *       difference between a page and a grey rectangle.</li>
 *   <li><b>Respects a constrained connection.</b> On Save-Data or a link the
 *       browser rates as 2G, the upgrade is skipped: the thumbnail is a real
 *       photo, legible at any size the page shows it, and several hundred
 *       kilobytes cheaper.</li>
 *   <li><b>Falls back.</b> If the thumbnail 404s - an image uploaded before
 *       thumbnails existed, or one whose thumbnail failed to store - the
 *       component swaps to the full image rather than showing a broken one.</li>
 *   <li><b>Fades in.</b> An image that appears at full opacity the instant its
 *       last byte lands reads as a jolt on a slow connection; the tint it
 *       fades from also gives the tile a defined shape while it is empty.</li>
 * </ul>
 */
export const ListingImage: React.FC<ListingImageProps> = ({
  src,
  full = false,
  eager = false,
  alt = '',
  sizes,
  className = '',
  style,
  onLoad,
  onError,
  ...rest
}) => {
  const [thumbFailed, setThumbFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  /*
   * Set when a srcset candidate fails to load.
   *
   * The ".small" rendition is derived from the full image's URL by
   * convention, so it can be named for a file that was never written - every
   * photo uploaded before it existed is in exactly that position. A browser
   * that picks a candidate and gets a 404 does NOT try the next one; it fires
   * error and shows nothing. Dropping the srcset and retrying on the plain
   * thumbnail is what makes it safe to offer the candidate at all.
   */
  const [srcSetFailed, setSrcSetFailed] = useState(false);
  /** Set once the full-size file has been fetched and is safe to display. */
  const [upgraded, setUpgraded] = useState(false);

  const thumb = thumbnailUrl(src);
  const canUseThumb = thumb !== null && !thumbFailed;
  const small = smallUrl(src);
  const tiny = tinyUrl(src);

  /*
   * What to actually put in `src`.
   *
   * A card never wants the full image. The hero starts on the thumbnail and
   * moves up, so the only way it displays the big file is via `upgraded`,
   * which is set after that file has finished downloading out of band - the
   * swap is therefore instant and never leaves a half-painted image.
   */
  const resolved = !canUseThumb || (full && upgraded) ? src : thumb;

  /* The stand-in is a 640px image shown at hero size. A touch of blur reads as
     "still arriving" rather than as a low-quality photo, and costs nothing. */
  const standingIn = full && canUseThumb && !upgraded;

  /*
   * Two card sizes, offered only where one of them would actually be chosen.
   *
   * Never on the hero: that one is managing its own upgrade from thumbnail to
   * full image, and a srcset would let the browser re-pick a different file
   * underneath it. Never once a candidate has 404'd either - see above.
   */
  const srcSet = !full && !srcSetFailed && canUseThumb && small && tiny
    ? `${tiny} ${TINY_W}w, ${small} ${SMALL_W}w, ${thumb} ${THUMB_W}w`
    : undefined;

  useEffect(() => {
    if (!full || !canUseThumb || !src) return;
    // The person asked us to go easy on their data, or the link is bad enough
    // that the browser says so. The thumbnail is already a real photo.
    if (prefersLighterImages()) return;

    let cancelled = false;
    const loader = new Image();
    loader.decoding = 'async';
    loader.onload = () => { if (!cancelled) setUpgraded(true); };
    // A full image that will not load is not an error worth showing: the
    // thumbnail is on screen and perfectly readable, so we simply stay on it.
    loader.src = src;
    return () => { cancelled = true; };
  }, [full, canUseThumb, src]);

  return (
    <img
      src={resolved}
      srcSet={srcSet}
      sizes={srcSet ? (sizes ?? DEFAULT_SIZES) : undefined}
      alt={alt}
      loading={eager ? 'eager' : 'lazy'}
      // Off the main thread. Decoding a photo synchronously stalls painting
      // for everything else on the page, and there is never a reason to.
      decoding="async"
      // Hint the browser that the first, visible image matters most, so it
      // is not queued behind two dozen lazy ones that happened to start.
      fetchPriority={eager ? 'high' : 'auto'}
      className={`${className} transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'} ${
        standingIn ? 'blur-[1.5px]' : ''
      }`}
      style={{ backgroundColor: loaded ? undefined : '#e5eeff', ...style }}
      ref={(node) => {
        // A cached image can finish before React attaches onLoad, which would
        // leave it permanently at opacity 0 - invisible, with no error.
        if (node?.complete && node.naturalWidth > 0) setLoaded(true);
      }}
      onLoad={(e) => { setLoaded(true); onLoad?.(e); }}
      onError={(e) => {
        /*
         * Degrade one step at a time. A srcset candidate that 404s is the
         * likeliest failure and the cheapest to recover from, so it is tried
         * first; only once we are on a bare thumbnail and that fails too does
         * the full image become the fallback. Never leave the element faded
         * out: whatever the browser draws for a broken image beats nothing.
         */
        setLoaded(true);
        if (srcSet) {
          setSrcSetFailed(true);
        } else if (canUseThumb && resolved === thumb) {
          setThumbFailed(true);
        }
        onError?.(e);
      }}
      {...rest}
    />
  );
};
