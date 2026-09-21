import React, { useEffect, useState } from 'react';
import { Store, Loader2, MapPin, Check, Clock, AlertCircle } from 'lucide-react';
import { AuthSession, CampusZone, CAMPUS_ZONES } from '../../types';
import { api } from '../../services/api';
import { Modal, ErrorBanner } from './Modal';
import { ApplicationThread } from './ApplicationThread';

interface BecomeSellerModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: AuthSession;
  /** Fired with the refreshed session once the upgrade lands. */
  onUpgraded: (user: AuthSession) => void;
}

/**
 * Files a seller application against an existing buying-only account.
 *
 * <p>An upgrade rather than a second registration: making someone re-register
 * to sell a textbook would split their reviews, saved items and chat history
 * across two identities for no benefit.
 *
 * <p>Submitting does not unlock selling - an admin reviews it first - so the
 * copy promises a review, not access. Over-promising here and then bouncing
 * them off the Sell form would be the worse failure.
 */
export const BecomeSellerModal: React.FC<BecomeSellerModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onUpgraded,
}) => {
  const [zone, setZone] = useState<CampusZone | ''>(currentUser.campusZone ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* This modal is mounted for the whole session rather than created on demand,
     so the initialisers above run once - a stale error from a refused attempt
     was still on screen the next time it opened. */
  useEffect(() => {
    if (!isOpen) return;
    setZone(currentUser.campusZone ?? '');
    setError(null);
    // Seeded on open only; see ProfileEditor for why currentUser is not a dep.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const needsZone = !currentUser.campusZone;
  const status = currentUser.sellerApprovalStatus;
  const awaitingReview = status === 'PENDING';
  const wasRejected = status === 'REJECTED';

  /*
   * The applicant's side of the conversation with an admin. Shown while the
   * application is pending and after a refusal - the two states in which
   * there is something to discuss - and with the same thread in both, so a
   * question asked before a decision and an answer given after it read as
   * one conversation.
   */
  const thread = (
    <ApplicationThread
      viewer="applicant"
      load={() => api.auth.getSellerApplicationMessages()}
      send={(body) => api.auth.replyToSellerApplication(body)}
      emptyHint="If an admin has a question about your application, it appears here and you can answer. You can also write first if there is something you want them to know."
      placeholder="Message the admin…"
    />
  );

  const submit = async () => {
    if (needsZone && !zone) {
      setError('Choose your campus location so buyers know where to meet you.');
      return;
    }
    setBusy(true);
    setError(null);

    const res = await api.auth.becomeSeller(zone || undefined);
    setBusy(false);

    if (res.success && res.user) {
      onUpgraded(res.user);
      onClose();
      return;
    }
    setError(res.error || 'Could not switch your account to selling.');
  };

  // Already applied: there is nothing to submit, so the modal becomes a status
  // report rather than a form that would just resubmit the same application.
  if (awaitingReview) {
    return (
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title="Your application is being reviewed"
        subtitle="We'll let you know as soon as it's decided."
        footer={
          <button onClick={onClose} className="btn-primary w-full !rounded-xl !text-sm">
            Got it
          </button>
        }
      >
        <div className="flex items-start gap-3 rounded-xl bg-amber-50 border border-amber-200 px-3 py-3">
          <Clock className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-800">
            An admin is checking your seller application. You can keep browsing and buying
            in the meantime - nothing else about your account changes.
          </p>
        </div>

        <p className="mt-4 mb-2 text-[11px] font-bold uppercase tracking-wide text-[#a0a3b1]">
          Conversation with the admin
        </p>
        {thread}
      </Modal>
    );
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={wasRejected ? 'Apply again to sell' : 'Apply to sell on campus'}
      subtitle="An admin reviews every new seller before listings go live."
      footer={
        <div className="grid grid-cols-2 gap-3">
          <button onClick={onClose} className="btn-ghost !rounded-xl !text-sm">
            Not now
          </button>
          <button
            onClick={submit}
            disabled={busy}
            className="px-4 py-3 rounded-xl bg-[#007d55] hover:bg-[#006242] text-white font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50 transition-colors"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Store className="w-4 h-4" />}
            Apply to sell
          </button>
        </div>
      }
    >
      <ErrorBanner message={error} />

      {wasRejected && currentUser.sellerApprovalReason && (
        <div className="mb-4 flex items-start gap-2 rounded-xl bg-red-50 border border-red-200 px-3 py-2.5">
          <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
          <div className="text-xs text-red-700">
            <p className="font-semibold">Your last application wasn't approved</p>
            <p className="mt-0.5">{currentUser.sellerApprovalReason}</p>
          </div>
        </div>
      )}

      {wasRejected && (
        <div className="mb-4">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-[#a0a3b1]">
            Conversation with the admin
          </p>
          {thread}
        </div>
      )}

      <ul className="space-y-2 mb-4">
        {[
          'Post products, services and food once approved',
          'Take orders and arrange pickup in chat',
          'Keep buying exactly as you do now',
        ].map((line) => (
          <li key={line} className="flex items-start gap-2 text-sm text-[#434655]">
            <Check className="w-4 h-4 text-[#007d55] mt-0.5 shrink-0" />
            {line}
          </li>
        ))}
      </ul>

      {needsZone ? (
        <div>
          <label className="block text-xs font-semibold text-[#434655] mb-1.5">
            Where are you on campus?
          </label>
          <div className="space-y-1.5">
            {CAMPUS_ZONES.map((option) => {
              const selected = zone === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setZone(option.value)}
                  aria-pressed={selected}
                  className={`w-full flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-all duration-150 ${
                    selected
                      ? 'border-[#007d55] bg-emerald-50 shadow-xs'
                      : 'border-[#c3c6d7] bg-white hover:border-[#737686]'
                  }`}
                >
                  <MapPin className={`w-4 h-4 shrink-0 ${selected ? 'text-[#007d55]' : 'text-[#a0a3b1]'}`} />
                  <span className="min-w-0">
                    <span className={`block text-sm font-bold leading-tight ${selected ? 'text-[#006242]' : 'text-[#0b1c30]'}`}>
                      {option.label}
                    </span>
                    <span className="block text-[10px] text-[#737686] leading-tight">{option.hint}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <p className="text-xs text-[#737686]">
          Buyers will see you're based in{' '}
          <span className="font-semibold text-[#434655]">
            {CAMPUS_ZONES.find((z) => z.value === currentUser.campusZone)?.label}
          </span>
          . You can change this per listing.
        </p>
      )}
    </Modal>
  );
};
