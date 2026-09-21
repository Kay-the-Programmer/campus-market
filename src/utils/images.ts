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

export interface ImageVariants {
  full: Blob;
  thumb: Blob;
}

export interface UploadOptions {
  /** Longest edge of the full-size rendition. Defaults to {@link FULL_MAX_EDGE}. */
  maxEdge?: number;
  /** WebP quality for the full-size rendition, 0-1. */
  quality?: number;
  /** Name for the multipart part; only the extension is meaningful. */
  filename?: string;
}

/**
 * Decodes a file once and draws it at two sizes.
 *
 * The second draw is close to free: the browser has already decoded the
 * image for the first, and a 640px canvas is a fraction of the work. This is
 * why thumbnails are made here and not on the server - the client has the
 * pixels in hand, and the server would need a WebP decoder it does not have.
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
        const full = await drawToWebp(img, maxEdge, quality);
        // Thumbnails are compressed a little harder: at card size the
        // artefacts are below what anyone can see, and there are many of them
        // on a page.
        const thumb = await drawToWebp(img, THUMB_MAX_EDGE, 0.75);
        resolve({ full, thumb });
      } catch (err) {
        reject(err instanceof Error ? err : new Error(`Could not process "${file.name}".`));
      }
    };

    img.src = objectUrl;
  });
}

function drawToWebp(img: HTMLImageElement, maxEdge: number, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
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
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not encode the image.'))),
      'image/webp',
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
  const { full, thumb } = await renderVariants(file, options.maxEdge, options.quality);
  const res = await api.uploads.image(full, options.filename ?? 'image.webp', thumb);
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
  if (!url) return null;
  const at = url.indexOf(UPLOADS_PATH);
  if (at < 0) return null;
  const dot = url.lastIndexOf('.');
  if (dot <= at + UPLOADS_PATH.length) return null;
  // Already a thumbnail - do not stack suffixes.
  if (url.slice(0, dot).endsWith(THUMB_SUFFIX)) return url;
  return url.slice(0, dot) + THUMB_SUFFIX + url.slice(dot);
}
