import React, { useState } from 'react';
import { thumbnailUrl } from '../../utils/images';

interface ListingImageProps extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src' | 'loading'> {
  /** The full-size image URL, as stored. The component decides what to fetch. */
  src?: string;
  /**
   * Fetch the full-size image rather than the thumbnail. For the detail
   * page's main photo, where the thumbnail would visibly blur.
   */
  full?: boolean;
  /**
   * Load immediately instead of lazily. For the one image that is already on
   * screen when the page paints - the hero, the detail photo - where lazy
   * loading only delays it. Everything else should stay lazy.
   */
  eager?: boolean;
}

/**
 * An image from the marketplace, loaded the cheap way.
 *
 * <p>Every card, tile and list row should render photos through this rather
 * than a bare {@code <img>}, because it does three things they all need and
 * none of them were doing:
 *
 * <ul>
 *   <li><b>Fetches the thumbnail.</b> Cards are at most a few hundred pixels
 *       wide; the stored image is 1600. The thumbnail is roughly a tenth of
 *       the bytes, and there are dozens of cards on a page.</li>
 *   <li><b>Loads lazily.</b> A browse page has more tiles below the fold than
 *       above it. With {@code loading="lazy"} the browser fetches them as they
 *       approach the viewport instead of all at once on page load - which is
 *       the difference between the first tiles appearing immediately and the
 *       whole grid waiting on the slowest image.</li>
 *   <li><b>Falls back.</b> If the thumbnail 404s - an image uploaded before
 *       thumbnails existed, or one whose thumbnail failed to store - the
 *       component swaps to the full image rather than showing a broken one.
 *       Costs a second request in a case that should never happen, and
 *       nothing otherwise.</li>
 * </ul>
 *
 * <p>External images (a Google avatar, a pasted link) have no thumbnail; the
 * component simply loads them as they are.
 */
export const ListingImage: React.FC<ListingImageProps> = ({
  src,
  full = false,
  eager = false,
  alt = '',
  ...rest
}) => {
  const [thumbFailed, setThumbFailed] = useState(false);

  const thumb = full ? null : thumbnailUrl(src);
  const useThumb = thumb !== null && !thumbFailed;
  const resolved = useThumb ? thumb : src;

  return (
    <img
      src={resolved}
      alt={alt}
      loading={eager ? 'eager' : 'lazy'}
      // Off the main thread. Decoding a photo synchronously stalls painting
      // for everything else on the page, and there is never a reason to.
      decoding="async"
      // Hint the browser that the first, visible image matters most, so it
      // is not queued behind two dozen lazy ones that happened to start.
      fetchPriority={eager ? 'high' : 'auto'}
      onError={useThumb ? () => setThumbFailed(true) : undefined}
      {...rest}
    />
  );
};
