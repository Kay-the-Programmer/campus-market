/**
 * Image handling shared by every screen that uploads or displays a photo.
 *
 * Two halves. `uploadImageFile` renders a file down to the sizes the app
 * actually needs and uploads them; `thumbnailUrl` lets any card ask for the
 * small one by name. They agree on a naming convention with the backend
 * (ImageStorageService.THUMB_SUFFIX) and nothing else - the thumbnail is not
 * in the data model, which is what makes it free to adopt and safe to lack.
 */

import { api } from '../services/api';

/** The path under which the API serves the images it stores. */
const UPLOADS_PATH = '/api/uploads/';

/** Inserted before the extension to name an image's thumbnail. Mirrors the backend. */
const THUMB_SUFFIX = '.thumb';

/** Same, for the phone-size rendition. Mirrors ImageStorageService.SMALL_SUFFIX. */
const SMALL_SUFFIX = '.small';

/** Same, for the list-row rendition. Mirrors ImageStorageService.TINY_SUFFIX. */
const TINY_SUFFIX = '.tiny';

/**
 * Longest edge of the full-size upload. Detail pages show this; nothing else
 * needs more. A phone camera's 4000px original is 6x the pixels for no gain
 * anyone can see on a phone.
 */
const FULL_MAX_EDGE = 1600;

/**
 * Longest edge of the thumbnail. Sized for the largest card in the app (the
 * browse grid tile) at 3x device pixel ratio with room to spare. Everything
 * that shows a photo in a list or grid loads this instead of the full image,
 * which is the single biggest saving in the app: a page of 24 listings used
 * to fetch 24 full-size photos to fill tiles 128px wide.
 */
const THUMB_MAX_EDGE = 640;

/**
 * Longest edge of the phone rendition.
 *
 * <p>400, and the number is arithmetic rather than taste. A browse tile is
 * about 165 CSS pixels wide on a 375px phone in the two-column grid, and
 * most phones in use are 2x, so the browser needs about 330 device pixels to
 * draw it sharply. A candidate smaller than that is not a saving, it is a
 * candidate the browser will refuse - it picks the next one up rather than
 * render something blurry. The first cut of this was 320 and would therefore
 * have been skipped by every 2x phone in existence, which is precisely the
 * audience it was added for.
 *
 * <p>400 clears 330 with room for the {@code sizes} declaration to be a
 * little generous, and is still well under half the pixel count of the 640px
 * thumbnail above - which stays, because a wide screen's four-column grid
 * draws tiles around 290 CSS pixels and genuinely needs it.
 *
 * <p>3x phones will still take the 640: 165 x 3 is 495. That is the correct
 * answer for them, and they are the devices most likely to be new enough to
 * be on a decent connection.
 */
const SMALL_MAX_EDGE = 400;

/**
 * Longest edge of the list-row rendition.
 *
 * <p>Not every photo is a grid tile. Search suggestions, cart lines, order
 * items and message threads draw the same image at 36 to 48 CSS pixels, and
 * with only the two card sizes above the browser has nothing smaller to pick
 * than the 400px one - roughly thirty times the pixels a 36px thumbnail can
 * show. Measured: six suggestion rows cost about 108KB of 400px renditions
 * where 160px ones cost about 24KB, and the search panel is on the path of
 * every single search.
 *
 * <p>160 covers a 53px element at 3x and an 80px one at 2x, which is every
 * list row in the app with margin. Anything larger falls through to the 400
 * above, which is the correct answer for it.
 */
const TINY_MAX_EDGE = 160;

/**
 * The widths ListingImage advertises in its srcset.
 *
 * <p>Exported from here so the numbers the browser is told cannot drift from
 * the numbers the encoder actually produces - a srcset that lies makes the
 * browser choose badly in whichever direction the lie points.
 *
 * <p>They are the longest edge, not strictly the width: a portrait photo is
 * narrower than this. That errs towards the browser occasionally picking the
 * larger file, which is the safe direction to be wrong in - the alternative
 * is advertising a file as smaller than it is and getting a blurry tile.
 */
export const TINY_W = TINY_MAX_EDGE;
export const SMALL_W = SMALL_MAX_EDGE;
export const THUMB_W = THUMB_MAX_EDGE;

/**
 * Whether this browser's canvas can actually ENCODE WebP.
 *
 * <p>This check is the whole reason product photos were arriving as
 * multi-megabyte PNGs. {@code canvas.toBlob(cb, 'image/webp', q)} does not
 * fail when WebP encoding is unsupported - the HTML spec says the user agent
 * falls back to {@code image/png}, and, because PNG is lossless, that it
 * <em>ignores the quality argument entirely</em>. So the call returns a blob,
 * the upload succeeds, nothing logs a warning, and what lands on disk is a
 * full-quality PNG of a photograph: measured on production, a 2.1MB "full"
 * and a 457KB "thumbnail" that should each have been a tenth of that.
 *
 * <p>Probed once on a 1x1 canvas, which is cheap enough to do synchronously
 * and stable for the life of the page.
 */
let webpEncodeSupport: boolean | null = null;
function canEncodeWebp(): boolean {
  if (webpEncodeSupport !== null) return webpEncodeSupport;
  try {
    const probe = document.createElement('canvas');
    probe.width = 1;
    probe.height = 1;
    webpEncodeSupport = probe.toDataURL('image/webp').startsWith('data:image/webp');
  } catch {
    webpEncodeSupport = false;
  }
  return webpEncodeSupport;
}

/**
 * The best lossy format this browser can produce.
 *
 * <p>Never PNG. PNG is lossless and built for flat graphics; for a camera
 * photo it is roughly an order of magnitude larger than either option here,
 * and these are photos by definition. JPEG is the floor rather than a
 * preference - canvas has been able to encode it everywhere for two decades,
 * so there is always somewhere to fall back to.
 */
function encodeType(): 'image/webp' | 'image/jpeg' {
  return canEncodeWebp() ? 'image/webp' : 'image/jpeg';
}

export interface ImageVariants {
  full: Blob;
  thumb: Blob;
  small: Blob;
  tiny: Blob;
}

export interface UploadOptions {
  /** Longest edge of the full-size rendition. Defaults to {@link FULL_MAX_EDGE}. */
  maxEdge?: number;
  /** Lossy quality for the full-size rendition, 0-1. */
  quality?: number;
  /**
   * Name for the multipart part. Cosmetic: the backend derives the stored
   * filename from the blob's real MIME type (ImageStorageService), which is
   * why a file named ".webp" could still land on disk as a .png.
   */
  filename?: string;
}

/**
 * Decodes a file once and draws it at two sizes.
 *
 * The second draw is close to free: the browser has already decoded the
 * image for the first, and a 640px canvas is a fraction of the work. This is
 * why thumbnails are made here and not on the server - the client has the
 * pixels in hand, and the server would need a WebP decoder it does not have.
 *
 * <p>Both renditions come back as WebP, or JPEG where WebP cannot be encoded.
 * Never PNG: see {@link drawToBlob}.
 */
export function renderVariants(file: File, maxEdge = FULL_MAX_EDGE, quality = 0.82): Promise<ImageVariants> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error(`Could not read "${file.name}".`));
    };

    img.onload = async () => {
      URL.revokeObjectURL(objectUrl);
      try {
        const full = await drawToBlob(img, maxEdge, quality);
        // Card renditions are compressed a little harder: at card size the
        // artefacts are below what anyone can see, and there are many of them
        // on a page. The third draw is as cheap as the second - the decode,
        // which is the expensive part, has already happened.
        const thumb = await drawToBlob(img, THUMB_MAX_EDGE, 0.7);
        const small = await drawToBlob(img, SMALL_MAX_EDGE, 0.68);
        // Harder again: at 160px across, the artefacts of a low quality
        // setting are smaller than a pixel of the element it is drawn into.
        const tiny = await drawToBlob(img, TINY_MAX_EDGE, 0.62);
        resolve({ full, thumb, small, tiny });
      } catch (err) {
        reject(err instanceof Error ? err : new Error(`Could not process "${file.name}".`));
      }
    };

    img.src = objectUrl;
  });
}

/**
 * Draws the image at the requested size and encodes it lossily.
 *
 * <p>Three things beyond the obvious:
 *
 * <ul>
 *   <li><b>Format is chosen, not assumed.</b> See {@link canEncodeWebp} - the
 *       old code asked for WebP and shipped whatever came back.</li>
 *   <li><b>Transparency is flattened onto white</b> before a JPEG encode.
 *       JPEG has no alpha channel, and an un-flattened transparent region
 *       encodes as black, which turns a cut-out product shot into a photo
 *       with an inkblot behind it.</li>
 *   <li><b>The result is checked.</b> If the blob still comes back as
 *       something lossless, it is re-encoded as JPEG rather than uploaded.
 *       Belt and braces for the exact failure that shipped: the whole point
 *       is that this path must not be able to produce a PNG silently.</li>
 * </ul>
 */
function drawToBlob(img: HTMLImageElement, maxEdge: number, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      reject(new Error('Image processing is not supported in this browser.'));
      return;
    }
    // Better downscaling than the default when shrinking by a large factor -
    // the thumbnail is typically a 4-6x reduction, where nearest-neighbour
    // sampling visibly shimmers on fine detail.
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    const type = encodeType();
    if (type === 'image/jpeg') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Could not encode the image.'));
          return;
        }
        if (blob.type === type) {
          resolve(blob);
          return;
        }
        /*
         * The browser substituted a format. In practice that means PNG, which
         * is the case this whole function exists to prevent - so flatten and
         * force JPEG, which every canvas implementation can encode.
         */
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (jpeg) => (jpeg ? resolve(jpeg) : reject(new Error('Could not encode the image.'))),
          'image/jpeg',
          quality,
        );
      },
      type,
      quality,
    );
  });
}

/**
 * Renders and uploads a file, returning the URL of the full-size image.
 *
 * That URL is what the caller stores. The thumbnail travels in the same
 * request and lands under the same id; nobody has to keep track of it.
 */
export async function uploadImageFile(file: File, options: UploadOptions = {}): Promise<string> {
  const { full, thumb, small, tiny } = await renderVariants(file, options.maxEdge, options.quality);
  const res = await api.uploads.image(full, options.filename ?? 'image.webp', thumb, small, tiny);
  if (res.ok && res.url) {
    return res.url;
  }
  throw new Error(res.error || `Could not upload "${file.name}".`);
}

/**
 * The thumbnail URL for an image this API stored, or `null` for anything else.
 *
 * Derived, not looked up. `/api/uploads/<id>.webp` becomes
 * `/api/uploads/<id>.thumb.webp`, on either the relative or the absolute form.
 * External images - a Google profile photo, a pasted link - have no thumbnail
 * and get `null`, so the caller shows the original; the same happens for an
 * uploaded image that somehow has no thumbnail, via the <img> onError fallback
 * in ListingImage.
 */
export function thumbnailUrl(url: string | undefined | null): string | null {
  return variantUrl(url, THUMB_SUFFIX);
}

/**
 * The phone-size URL for an image this API stored, or null for anything else.
 *
 * <p>Same convention and the same caveat as {@link thumbnailUrl}: it is
 * derived rather than looked up, so it can name a file that does not exist -
 * an image uploaded before this rendition was introduced has no {@code
 * .small}. ListingImage handles that by degrading to the next size up when a
 * candidate fails to load, which is why emitting it is safe for old images.
 */
export function smallUrl(url: string | undefined | null): string | null {
  return variantUrl(url, SMALL_SUFFIX);
}

/**
 * The list-row URL for an image this API stored, or null for anything else.
 *
 * <p>Same convention and the same caveat as {@link thumbnailUrl}.
 */
export function tinyUrl(url: string | undefined | null): string | null {
  return variantUrl(url, TINY_SUFFIX);
}

/** Shared derivation, so the variants cannot drift apart. */
function variantUrl(url: string | undefined | null, suffix: string): string | null {
  if (!url) return null;
  const at = url.indexOf(UPLOADS_PATH);
  if (at < 0) return null;
  const dot = url.lastIndexOf('.');
  if (dot <= at + UPLOADS_PATH.length) return null;
  const stem = url.slice(0, dot);
  // Already this variant - do not stack suffixes.
  if (stem.endsWith(suffix)) return url;
  // A different variant is not a base image; deriving from it would produce
  // "x.thumb.small.webp", which is nothing.
  if (stem.endsWith(THUMB_SUFFIX) || stem.endsWith(SMALL_SUFFIX) || stem.endsWith(TINY_SUFFIX)) {
    return null;
  }
  return stem + suffix + url.slice(dot);
}

/*
 * Test seams.
 *
 * drawToBlob is the function the PNG regression lived in, and it is not
 * reachable through the public surface without a real File, a real decode and
 * a real canvas - none of which jsdom has. Exported under names that say what
 * they are so nothing in the app reaches for them by accident.
 */
export const __drawToBlobForTests = drawToBlob;
export function __resetWebpSupportForTests(): void {
  webpEncodeSupport = null;
}

/**
 * Whether this device has asked us to be careful with its data.
 *
 * <p>Two signals, both advisory and both absent on some browsers - a missing
 * answer means "no constraint we know of", never "go ahead". `saveData` is an
 * explicit request from the person, so it outranks any measurement; the
 * effective type is the browser's own estimate of the link, derived from
 * recent round-trip times rather than from the radio's claimed generation, so
 * it also catches a nominal 4G connection that is behaving like a bad 2G one.
 *
 * <p>Used to decide whether to upgrade a thumbnail to the full-size photo.
 * Deliberately not used to skip images altogether: a marketplace listing
 * without its photo is not a lighter page, it is a useless one.
 */
export function prefersLighterImages(): boolean {
  const connection = (navigator as unknown as {
    connection?: { saveData?: boolean; effectiveType?: string };
  }).connection;
  if (!connection) return false;
  if (connection.saveData) return true;
  return connection.effectiveType === 'slow-2g' || connection.effectiveType === '2g';
}
