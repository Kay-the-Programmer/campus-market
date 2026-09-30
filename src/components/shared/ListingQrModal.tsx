import React, { useEffect, useState } from 'react';
import { Loader2, Download, Link2, QrCode } from 'lucide-react';
import { Listing } from '../../types';
import { formatListingPrice } from '../../utils/currency';
import { listingUrl, shareCaption, shareFiles, whatsappUrl } from '../../utils/share';
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
  const [sharing, setSharing] = useState(false);

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
    setPreview(null);
    setFile(null);

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
          url,
          prettyUrl: url.replace(/^https?:\/\//, ''),
          imageUrl: listing.image || undefined,
          detail: [listing.condition !== 'N/A' ? listing.condition : null, listing.location]
            .filter(Boolean).join(' · ') || undefined,
        });
        if (!alive) return;
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
        if (alive) setError(err?.message || 'Could not generate the code for this listing.');
      }
    })();

    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, listing.id]);

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
      subtitle="A code anyone can scan, and a card you can send."
      footer={
        <div className="space-y-2">
          <button
            onClick={sendToWhatsApp}
            disabled={sharing || !!error}
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
              disabled={!preview}
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

      {/* The card at a fraction of its real size. It is generated at 1080px
          wide so it survives being sent, saved and printed; nobody needs to
          see that here. */}
      <div className="flex justify-center">
        {preview ? (
          <img
            src={preview}
            alt={`QR card for ${listing.title}`}
            className="w-full max-w-[260px] rounded-2xl border border-[#e5eeff] shadow-card"
          />
        ) : (
          <div
            className="w-full max-w-[260px] aspect-[1080/1350] rounded-2xl border border-[#e5eeff] bg-[#f8f9ff] flex flex-col items-center justify-center gap-2 text-[#a0a3b1]"
            role="status"
            aria-live="polite"
          >
            {error ? <QrCode className="w-8 h-8" /> : <Loader2 className="w-6 h-6 animate-spin" />}
            <span className="text-xs font-semibold">
              {error ? 'No card to show' : 'Drawing your code…'}
            </span>
          </div>
        )}
      </div>
    </Modal>
  );
};

/** Filename-safe stub of the title, so a saved card is findable later. */
function slug(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)
    || 'listing';
}
