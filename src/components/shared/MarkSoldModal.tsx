import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { SellerProfile } from '../../types';
import { api } from '../../services/api';
import { Modal, ErrorBanner, Field } from './Modal';

interface MarkSoldModalProps {
  isOpen: boolean;
  onClose: () => void;
  listingId: string;
  listingTitle: string;
  listingPrice: number;
  /** Supplied when launched from a chat thread - the buyer is already known. */
  presetBuyer?: { id: string; name: string };
  onSold: () => void;
}

/**
 * Workflow 9. Launched either from a chat thread (buyer pre-filled) or from
 * My Listings, where the seller picks from the people who messaged about the item.
 */
export const MarkSoldModal: React.FC<MarkSoldModalProps> = ({
  isOpen,
  onClose,
  listingId,
  listingTitle,
  listingPrice,
  presetBuyer,
  onSold,
}) => {
  const [buyers, setBuyers] = useState<SellerProfile[]>([]);
  const [buyerId, setBuyerId] = useState(presetBuyer?.id || '');
  const [price, setPrice] = useState(String(listingPrice ?? ''));
  const [meetupLocation, setMeetupLocation] = useState('');
  const [meetupTime, setMeetupTime] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setPrice(String(listingPrice ?? ''));
    setBuyerId(presetBuyer?.id || '');
    // Cleared with the rest. Left behind, the previous sale's meeting point and
    // time were still sitting in the form when the modal reopened for a
    // different listing - and they are written straight onto the new deal.
    setMeetupLocation('');
    setMeetupTime('');

    if (presetBuyer) return;
    setLoading(true);
    api.listings.candidateBuyers(listingId).then((res) => {
      setBuyers(res.buyers || []);
      if (res.buyers?.length === 1) setBuyerId(res.buyers[0].id);
      setLoading(false);
    });
  }, [isOpen, listingId, presetBuyer, listingPrice]);

  const submit = async () => {
    if (!buyerId) {
      setError('Select the buyer.');
      return;
    }
    const numeric = parseFloat(price);
    if (Number.isNaN(numeric) || numeric < 0) {
      setError('Enter the confirmed price.');
      return;
    }

    setBusy(true);
    setError(null);
    const res = await api.listings.markSold(listingId, {
      buyerId,
      price: numeric,
      meetupLocation: meetupLocation.trim() || undefined,
      meetupTime: meetupTime ? new Date(meetupTime).toISOString() : undefined,
    });
    setBusy(false);

    if (res.success) {
      onSold();
      onClose();
      return;
    }
    // Another chat confirmed the same item first (workflow 9 race condition).
    setError(res.error || 'Could not mark this as sold.');
    if (res.code === 'ALREADY_SOLD') onSold();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Mark as sold"
      subtitle={listingTitle}
      footer={
        <div className="grid grid-cols-2 gap-3">
          <button onClick={onClose} className="btn-ghost !rounded-xl !text-sm">Cancel</button>
          <button onClick={submit} disabled={busy} className="btn-primary !rounded-xl !text-sm">
            {busy ? <><Loader2 className="w-4 h-4 animate-spin" /><span>Confirming…</span></> : <span>Confirm sale</span>}
          </button>
        </div>
      }
    >
      <ErrorBanner message={error} />

      <Field label="Buyer">
        {presetBuyer ? (
          <div className="input-base text-sm bg-[#f8f9ff] font-semibold text-[#0b1c30]">
            {presetBuyer.name}
          </div>
        ) : loading ? (
          <div className="flex items-center gap-2 text-xs text-[#737686] py-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading buyers…
          </div>
        ) : buyers.length === 0 ? (
          <p className="text-xs text-[#737686] py-2">
            Nobody has messaged you about this listing yet. Once a buyer starts a
            conversation they will appear here.
          </p>
        ) : (
          <select value={buyerId} onChange={(e) => setBuyerId(e.target.value)} className="input-base text-sm bg-white">
            <option value="">Select a buyer…</option>
            {buyers.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        )}
      </Field>

      <Field label="Confirmed price (K)">
        <input type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} className="input-base text-sm font-bold" />
      </Field>

      <Field label="Meetup location (optional)">
        <input type="text" value={meetupLocation} onChange={(e) => setMeetupLocation(e.target.value)} placeholder="e.g. Student Union" className="input-base text-sm" />
      </Field>

      <Field label="Meetup time (optional)" hint="Both of you will be asked to leave a review afterwards.">
        <input type="datetime-local" value={meetupTime} onChange={(e) => setMeetupTime(e.target.value)} className="input-base text-sm" />
      </Field>
    </Modal>
  );
};
