import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { api } from '../../services/api';
import { Modal, ErrorBanner, SuccessBanner, Field } from './Modal';

const REASONS = [
  { value: 'SCAM', label: 'Scam or fraud' },
  { value: 'INAPPROPRIATE_CONTENT', label: 'Inappropriate content' },
  { value: 'PROHIBITED_ITEM', label: 'Prohibited item' },
  { value: 'HARASSMENT', label: 'Harassment' },
  { value: 'OTHER', label: 'Other' },
];

interface ReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetType: 'LISTING' | 'USER';
  targetId: string;
  targetLabel: string;
}

/** Workflow 17. Reporting never hides the target; an admin decides. */
export const ReportModal: React.FC<ReportModalProps> = ({
  isOpen,
  onClose,
  targetType,
  targetId,
  targetLabel,
}) => {
  const [reason, setReason] = useState('SCAM');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setReason('SCAM');
      setDetails('');
      setError(null);
      setDone(false);
    }
  }, [isOpen]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    const res = await api.reports.create({
      targetType,
      targetId,
      reason,
      details: details.trim() || undefined,
    });
    setBusy(false);
    if (res.ok) setDone(true);
    else setError(res.error || 'Could not submit your report.');
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Report this ${targetType === 'LISTING' ? 'listing' : 'user'}`}
      subtitle={targetLabel}
      footer={
        done ? (
          <button onClick={onClose} className="btn-primary w-full !rounded-xl !text-sm">Close</button>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <button onClick={onClose} className="btn-ghost !rounded-xl !text-sm">Cancel</button>
            <button onClick={submit} disabled={busy} className="btn-primary !rounded-xl !text-sm">
              {busy ? <><Loader2 className="w-4 h-4 animate-spin" /><span>Sending…</span></> : <span>Submit report</span>}
            </button>
          </div>
        )
      }
    >
      {done ? (
        <SuccessBanner message="Thanks, our team will review this." />
      ) : (
        <>
          <ErrorBanner message={error} />
          <Field label="Reason">
            <select value={reason} onChange={(e) => setReason(e.target.value)} className="input-base text-sm bg-white">
              {REASONS.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Details (optional)" hint="Anything that helps a moderator understand the problem.">
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              rows={4}
              className="input-base text-sm resize-none"
            />
          </Field>
        </>
      )}
    </Modal>
  );
};
