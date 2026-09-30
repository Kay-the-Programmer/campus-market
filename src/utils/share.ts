/**
 * Sharing a listing outside the app.
 *
 * <p>Pure functions, kept apart from the modal that uses them so the two
 * things worth being sure about - what the link is, and what WhatsApp is
 * handed - can be tested without a canvas or a DOM.
 */

import { Listing } from '../types';
import { formatListingPrice } from './currency';

/** The public, shareable address of a listing. */
export function listingUrl(listingId: string, origin?: string): string {
  const base = origin ?? (typeof window === 'undefined' ? '' : window.location.origin);
  return `${base}/listing/${listingId}`;
}

/**
 * The message that travels with the link.
 *
 * <p>Title and price first, because that is what someone decides on in a busy
 * group chat, and the link last so it is the final thing - WhatsApp previews
 * the last URL in a message, and a trailing link is what people tap.
 */
export function shareCaption(listing: Listing, url = listingUrl(listing.id)): string {
  return `${listing.title} — ${formatListingPrice(listing.price)}\nOn CampusMarket: ${url}`;
}

/**
 * WhatsApp's own "send this text" address.
 *
 * <p>wa.me rather than the api.whatsapp.com form: it is the link WhatsApp
 * documents for exactly this, it opens the installed app on a phone instead of
 * the web client, and it lets the person choose the recipient - we have no
 * business picking one for them.
 *
 * <p>Text only. No browser can hand a file to a named app; an image can only
 * go through the system share sheet, which is what {@link shareFiles} is for.
 */
export function whatsappUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

export type ShareOutcome = 'shared' | 'dismissed' | 'unsupported' | 'failed';

/**
 * Offers a file to the system share sheet, from which WhatsApp is one tap.
 *
 * <p>Distinguishes dismissal from failure, because they call for opposite
 * responses: someone who opened the sheet and closed it has already decided,
 * and falling back to "we copied the link instead" would be the app arguing
 * with them. Only 'unsupported' and 'failed' are worth a fallback.
 */
export async function shareFiles(files: File[], text: string, title: string): Promise<ShareOutcome> {
  const nav = navigator as Navigator & {
    canShare?: (data: ShareData & { files?: File[] }) => boolean;
  };
  const payload = { files, text, title };

  if (!nav.share || !nav.canShare?.(payload)) {
    return 'unsupported';
  }
  try {
    await nav.share(payload);
    return 'shared';
  } catch (err) {
    return (err as DOMException)?.name === 'AbortError' ? 'dismissed' : 'failed';
  }
}
