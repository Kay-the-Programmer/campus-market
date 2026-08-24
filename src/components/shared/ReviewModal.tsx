import React, { useEffect, useState } from 'react';
import { Loader2, Star } from 'lucide-react';
import { api } from '../../services/api';
import { Modal, ErrorBanner, Field } from './Modal';

interface ReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  dealId: string;
  counterpartyName: string;
  listingTitle: string;
  onSubmitted: () => void;
}

/** Workflow 16. One review per deal per person; the backend enforces it too. */
export const ReviewModal: React.FC<ReviewModalProps> = ({
  isOpen,
  onClose,
  dealId,
  counterpartyName,
  listingTitle,
  onSubmitted,
}) => {
  const [rating, setRating] = useState(5);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setRating(5);
      setHover(0);
      setComment('');
      setError(null);
    }
  }, [isOpen]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    const res = await api.deals.review(dealId, rating, comment.trim() || undefined);
    setBusy(false);

    if (res.success) {
      onSubmitted();
      onClose();
      return;
    }
    setError(res.error || 'Could not submit your review.');
    // Already reviewed: refresh so the UI stops offering the action.
    if (res.code === 'ALREADY_REVIEWED') onSubmitted();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Rate your deal with ${counterpartyName}`}
      subtitle={listingTitle}
      footer={
        <div className="grid grid-cols-2 gap-3">
          <button onClick={onClose} className="btn-ghost !rounded-xl !text-sm">Not now</button>
          <button onClick={submit} disabled={busy} className="btn-primary !rounded-xl !text-sm">
            {busy ? <><Loader2 className="w-4 h-4 animate-spin" /><span>Sending…</span></> : <span>Submit review</span>}
          </button>
        </div>
      }
    >
      <ErrorBanner message={error} />

      <Field label="Rating">
        <div className="flex items-center gap-1.5">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              aria-label={`${n} star${n > 1 ? 's' : ''}`}
              onClick={() => setRating(n)}
              onMouseEnter={() => setHover(n)}
              onMouseLeave={() => setHover(0)}
              className="p-1"
            >
              <Star
                className={`w-7 h-7 transition-colors ${
                  n <= (hover || rating)
                    ? 'fill-amber-400 text-amber-400'
                    : 'text-[#c3c6d7]'
                }`}
              />
            </button>
          ))}
          <span className="ml-2 text-sm font-bold text-[#0b1c30]">{rating}.0</span>
        </div>
      </Field>

      <Field label="Comment (optional)">
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={4}
          placeholder="How was the handover? Was the item as described?"
          className="input-base text-sm resize-none"
        />
      </Field>
    </Modal>
  );
};
