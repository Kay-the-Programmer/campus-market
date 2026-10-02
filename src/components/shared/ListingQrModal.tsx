import React, { useEffect, useRef, useState } from 'react';
import { Loader2, Download, Link2, QrCode } from 'lucide-react';
import { Listing } from '../../types';
import { formatListingPrice } from '../../utils/currency';
import { listingUrl, shareCaption, shareFiles, whatsappUrl } from '../../utils/share';
import { isStaleChunkError, reloadForNewBuild } from '../../utils/lazyChunk';
import {
  QR_CARD_STYLES, QrCardStyleId, readQrCardStyle, storeQrCardStyle,
} from '../../utils/qrCardStyles';
import { Modal, ErrorBanner } from './Modal';
import { useToast } from './ToastProvider';

interface ListingQrModalProps {
  isOpen: boolean;
  onClose: () => void;
  listing: Listing;
}

/** WhatsApp's own green, so the button is recognisable before it is read. */
const WHATSAPP_GREEN = '#25D366';

const WhatsAppIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884a9.82 9.82 0 016.988 2.896 9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.885-9.885 9.885M20.52 3.449C18.24 1.245 15.24 0 12.045 0 5.463 0 .104 5.334.101 11.892c0 2.096.549 4.142 1.595 5.945L0 24l6.335-1.652a12.062 12.062 0 005.71 1.447h.006c6.585 0 11.946-5.335 11.949-11.893a11.82 11.82 0 00-3.48-8.413Z" />
  </svg>
);

/**
 * A scannable, sendable card for one listing.
 *
 * <p>The point is the hand-off between a phone screen and everything that is
 * not one. A campus sale happens in a WhatsApp group, on a noticeboard by the
 * lecture theatre, across a table at lunch - and a URL read aloud or typed
 * from a photo is where that hand-off breaks. A code fixes the noticeboard and
 * the table; the share button fixes the group chat.
 *
 * <p>What this cannot do, and does not pretend to: hand the image straight to
 * WhatsApp. No browser lets a page choose which app receives a file - that is
 * the system share sheet's decision, and deliberately so. Where the sheet
 * exists the card goes through it and WhatsApp is one tap away; where it does
 * not, WhatsApp still opens with the message and link ready, and the card is
 * one button away as a saved image to attach.
 */
export const ListingQrModal: React.FC<ListingQrModalProps> = ({ isOpen, onClose, listing }) => {
  const toast = useToast();
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** The page is older than the build on the server - see the catch below. */
  const [stale, setStale] = useState(false);
  const [sharing, setSharing] = useState(false);
  /** Their last pick, so a seller posting several things chooses a style once. */
  const [style, setStyle] = useState<QrCardStyleId>(readQrCardStyle);
  const [drawing, setDrawing] = useState(false);
  /**
   * Which listing the visible preview belongs to. A style change can then keep
   * the old poster on screen while the new one is drawn - the whole point of the
   * picker is comparing them, and a blank box between every tap defeats that -
   * while a different listing still clears it, because showing one listing's
   * card under another one's title would be a lie.
   */
  const drawnFor = useRef<string | null>(null);

  const url = listingUrl(listing.id);
  const caption = shareCaption(listing, url);

  /*
   * Rendered on open rather than on mount: this modal is mounted with the
   * page, and drawing a card nobody asked for would cost an image fetch and a
   * canvas on every listing anyone opens.
   */
  useEffect(() => {
    if (!isOpen) return;
    let alive = true;
    setError(null);
    setStale(false);
    setFile(null);
    setDrawing(true);
    if (drawnFor.current !== listing.id) setPreview(null);

    (async () => {
      try {
        /*
         * Loaded here rather than imported at the top, so the QR encoder and
         * the card renderer are fetched the first time somebody opens this and
         * never as part of the bundle every visitor downloads to look at the
         * feed. It is one modal on one screen; it should not be on the
         * critical path of the home page.
         */
        const { renderQrCard, canvasToFile } = await import('../../utils/qrCard');

        const canvas = await renderQrCard({
          title: listing.title,
          price: formatListingPrice(listing.price),
          compareAtPrice: listing.compareAtPrice != null
            ? formatListingPrice(listing.compareAtPrice) : undefined,
          discountPercent: listing.discountPercent,
          url,
          prettyUrl: url.replace(/^https?:\/\//, ''),
          imageUrl: listing.image || undefined,
          eyebrow: listing.categoryName || listing.category,
          chips: [
            listing.condition && listing.condition !== 'N/A' ? listing.condition : null,
            listing.location,
          ].filter(Boolean) as string[],
          /* Classic sets these two out separately - a spec line under the title
             and a place of its own - where the other styles read them as chips
             over the photo. */
          details: [
            listing.categoryName || listing.category,
            listing.condition && listing.condition !== 'N/A' ? listing.condition : null,
            listing.brand,
          ].filter(Boolean).join(' | '),
          location: listing.location,
        }, style);
        if (!alive) return;
        drawnFor.current = listing.id;
        setPreview(canvas.toDataURL('image/png'));

        /*
         * The File is built here, not when Share is pressed. Safari only
         * honours navigator.share inside the gesture that triggered it, and
         * awaiting a canvas export first spends that gesture - the sheet then
         * never opens, with no error to show for it.
         */
        const asFile = await canvasToFile(canvas, `${slug(listing.title)}-campusmarket.png`);
        if (alive) setFile(asFile);
      } catch (err: any) {
        if (!alive) return;
        /*
         * A chunk this page was built to ask for is no longer on the server,
         * because a release happened while the tab was open. Nothing is broken
         * and there is nothing to retry - the page just needs loading again.
         * Offered rather than taken: the modal opens over whatever they were
         * looking at, and reloading out from under them to fix a share button
         * is a worse surprise than the message.
         */
        if (isStaleChunkError(err)) {
          setStale(true);
          return;
        }
        /*
         * Anything else gets a sentence meant for a person. The raw message
         * was being shown here, which is how a browser's internal complaint
         * about MIME types ended up in front of someone trying to share a
         * listing.
         */
        console.error('[CampusMarket] QR card failed', err);
        setError('Could not generate the code for this listing.');
      } finally {
        if (alive) setDrawing(false);
      }
    })();

    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, listing.id, style]);

  const chosen = QR_CARD_STYLES.find((option) => option.id === style) ?? QR_CARD_STYLES[0];

  /* Stored the moment it is picked: a seller who chose Clean to print one
     noticeboard poster is almost certainly printing the next one too. */
  const chooseStyle = (next: QrCardStyleId) => {
    if (next === style) return;
    setStyle(next);
    storeQrCardStyle(next);
  };

  const sendToWhatsApp = async () => {
    setSharing(true);
    const outcome = file
      ? await shareFiles([file], caption, listing.title)
      : 'unsupported';
    setSharing(false);

    if (outcome === 'shared' || outcome === 'dismissed') return;

    /*
     * No share sheet, or it refused the file. WhatsApp still opens with the
     * message written - which is the part that matters - and the card is a
     * button away if they want to attach it too.
     */
    window.open(whatsappUrl(caption), '_blank', 'noopener,noreferrer');
  };

  const download = () => {
    if (!preview) return;
    const link = document.createElement('a');
    link.href = preview;
    link.download = `${slug(listing.title)}-campusmarket.png`;
    link.click();
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link copied to your clipboard.');
    } catch {
      toast.error('Could not copy the link.');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Share this listing"
      subtitle="A code anyone can scan, on a poster you can send or print."
      footer={
        <div className="space-y-2">
          <button
            onClick={sendToWhatsApp}
            disabled={sharing || drawing || !!error}
            className="w-full h-12 rounded-xl text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50 transition-opacity"
            style={{ backgroundColor: WHATSAPP_GREEN }}
          >
            {sharing
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <WhatsAppIcon className="w-4 h-4" />}
            Share to WhatsApp
          </button>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={download}
              disabled={!preview || drawing}
              className="btn-ghost !rounded-xl !text-sm flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" /> Save image
            </button>
            <button
              onClick={copyLink}
              className="btn-ghost !rounded-xl !text-sm flex items-center justify-center gap-1.5"
            >
              <Link2 className="w-3.5 h-3.5" /> Copy link
            </button>
          </div>
        </div>
      }
    >
      <ErrorBanner message={error} />

      {/* Not an error, and worded as what it is: this page has been open since
          before the last release, so the part that draws the card is no longer
          where it was told to look. Reloading is the whole fix. */}
      {stale && (
        <div className="mb-4 rounded-xl bg-amber-50 border border-amber-200 px-3 py-3 space-y-2.5">
          <p className="text-xs text-amber-900 font-medium">
            CampusMarket was updated while this page was open, so sharing needs a fresh copy.
          </p>
          <button
            onClick={() => {
              if (!reloadForNewBuild()) {
                setStale(false);
                setError('Could not generate the code for this listing.');
              }
            }}
            className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition-colors"
          >
            Reload the page
          </button>
        </div>
      )}

      {/* The whole poster, never a crop of it: it is drawn at 1080x1350 so it
          survives being sent, saved and printed, and shown here at whatever
          height that width implies. Scaling it down is fine; cutting a corner
          off the thing they are about to send is not. */}
      <div className="flex justify-center">
        {preview ? (
          <div className="relative w-full max-w-[280px]">
            <img
              src={preview}
              alt={`Poster for ${listing.title}, with a code linking to the listing`}
              className="w-full h-auto block rounded-2xl border border-[#e5eeff] shadow-card"
            />
            {/* The old poster stays legible under this while the new style is
                drawn, so the two can actually be compared. */}
            {drawing && (
              <div
                className="absolute inset-0 rounded-2xl bg-white/65 flex items-center justify-center"
                role="status"
                aria-live="polite"
              >
                <Loader2 className="w-6 h-6 animate-spin text-[#2563eb]" />
                <span className="sr-only">Drawing your poster…</span>
              </div>
            )}
          </div>
        ) : (
          <div
            /* Reserved at the chosen style's own aspect, so picking Classic
               does not make the dialog jump when its taller page arrives. */
            style={{ aspectRatio: `${chosen.size.w} / ${chosen.size.h}` }}
            className="w-full max-w-[280px] rounded-2xl border border-[#e5eeff] bg-[#f8f9ff] flex flex-col items-center justify-center gap-2 text-[#a0a3b1]"
            role="status"
            aria-live="polite"
          >
            {error || stale
              ? <QrCode className="w-8 h-8" />
              : <Loader2 className="w-6 h-6 animate-spin" />}
            <span className="text-xs font-semibold">
              {error || stale ? 'No card to show' : 'Drawing your poster…'}
            </span>
          </div>
        )}
      </div>

      {/* The picker sits under the poster and above the share buttons: it is
          read after seeing the default, which is the order it is used in. */}
      {!stale && !error && (
        <div className="mt-5">
          <p className="text-xs font-semibold text-[#434655] mb-2">Poster style</p>
          <div className="grid grid-cols-4 gap-1.5" role="radiogroup" aria-label="Poster style">
            {QR_CARD_STYLES.map((option) => {
              const selected = option.id === style;
              return (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => chooseStyle(option.id)}
                  className={`rounded-xl border p-2 text-left transition-colors ${
                    selected
                      ? 'border-[#2563eb] bg-[#eff4ff]'
                      : 'border-[#e5eeff] hover:bg-[#f8f9ff]'
                  }`}
                >
                  <span
                    className="block h-6 rounded-lg border border-black/5"
                    style={{
                      backgroundImage: `linear-gradient(135deg, ${option.swatch.join(', ')})`,
                    }}
                  />
                  <span
                    className={`block mt-1.5 text-[11px] font-bold ${
                      selected ? 'text-[#2563eb]' : 'text-[#434655]'
                    }`}
                  >
                    {option.name}
                  </span>
                </button>
              );
            })}
          </div>
          {/* One hint, for the chosen style: three at once is a wall of text in
              a dialog whose job is a single tap. */}
          <p className="mt-2 text-[11px] text-[#737686]">
            {chosen.hint}
          </p>
        </div>
      )}
    </Modal>
  );
};

/** Filename-safe stub of the title, so a saved card is findable later. */
function slug(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)
    || 'listing';
}
