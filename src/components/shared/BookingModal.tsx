import React, { useEffect, useState } from 'react';
import { Loader2, AlertTriangle } from 'lucide-react';
import { api } from '../../services/api';
import { Modal, ErrorBanner, SuccessBanner, Field } from './Modal';

/** `datetime-local` wants "YYYY-MM-DDTHH:mm" in the viewer's own timezone,
 *  not UTC - toISOString would quietly shift the floor by whole hours for
 *  anyone not on UTC. */
const toLocalInputValue = (date: Date) => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

interface BookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  listingId: string;
  listingTitle: string;
  statedAvailability?: string;
  onBooked?: () => void;
}

/** Workflow 14. A time outside the seller's stated availability warns but still sends. */
export const BookingModal: React.FC<BookingModalProps> = ({
  isOpen,
  onClose,
  listingId,
  listingTitle,
  statedAvailability,
  onBooked,
}) => {
  const [preferredTime, setPreferredTime] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ message: string; outside: boolean } | null>(null);

  useEffect(() => {
    if (isOpen) {
      setPreferredTime('');
      setNote('');
      setError(null);
      setResult(null);
    }
  }, [isOpen]);

  const submit = async () => {
    if (!preferredTime) {
      setError('Choose a preferred date and time.');
      return;
    }
    if (new Date(preferredTime).getTime() < Date.now()) {
      setError('Choose a time that hasn\'t already passed.');
      return;
    }
    setBusy(true);
    setError(null);
    const res = await api.listings.requestBooking(
      listingId,
      new Date(preferredTime).toISOString(),
      note.trim() || undefined,
    );
    setBusy(false);

    if (res.ok) {
      setResult({
        message: res.data?.message || 'Booking request sent.',
        outside: !!res.data?.outsideStatedAvailability,
      });
      onBooked?.();
    } else {
      setError(res.error || 'Could not send the booking request.');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Request a booking"
      subtitle={listingTitle}
      footer={
        result ? (
          <button onClick={onClose} className="btn-primary w-full !rounded-xl !text-sm">Done</button>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <button onClick={onClose} className="btn-ghost !rounded-xl !text-sm">Cancel</button>
            <button onClick={submit} disabled={busy} className="btn-primary !rounded-xl !text-sm">
              {busy ? <><Loader2 className="w-4 h-4 animate-spin" /><span>Sending…</span></> : <span>Send request</span>}
            </button>
          </div>
        )
      }
    >
      {result ? (
        <>
          <SuccessBanner message={result.message} />
          {result.outside && (
            <div className="flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-800 font-medium">
                This falls outside their stated availability — they may suggest another time in chat.
              </p>
            </div>
          )}
        </>
      ) : (
        <>
          <ErrorBanner message={error} />
          {statedAvailability && (
            <p className="mb-4 text-xs text-[#434655] bg-[#eff4ff] border border-[#dbe1ff] rounded-xl px-3 py-2">
              <span className="font-semibold">Seller availability:</span> {statedAvailability}
            </p>
          )}
          <Field label="Preferred date and time">
            <input
              type="datetime-local"
              value={preferredTime}
              min={toLocalInputValue(new Date())}
              onChange={(e) => setPreferredTime(e.target.value)}
              className="input-base text-sm"
            />
          </Field>
          <Field label="Note (optional)">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="What do you need help with?"
              className="input-base text-sm resize-none"
            />
          </Field>
        </>
      )}
    </Modal>
  );
};
