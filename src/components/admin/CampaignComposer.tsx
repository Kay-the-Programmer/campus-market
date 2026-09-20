import React, { useCallback, useEffect, useState } from 'react';
import { Mail, Loader2, Send, AlertTriangle, Users, CheckCircle2 } from 'lucide-react';
import { CampaignAudience, EmailCampaign } from '../../types';
import { api } from '../../services/api';
import { Modal, ErrorBanner } from '../shared/Modal';

interface CampaignComposerProps {
  onNotice: (message: string) => void;
}

const AUDIENCES: { value: CampaignAudience; label: string; hint: string }[] = [
  { value: 'ALL', label: 'Everyone', hint: 'Every account that accepts announcements.' },
  { value: 'BUYERS', label: 'Buyers', hint: 'Accounts that chose to buy only.' },
  { value: 'SELLERS', label: 'Sellers', hint: 'Anyone set up to sell, approved or not.' },
  {
    value: 'APPROVED_SELLERS',
    label: 'Approved sellers',
    hint: 'Sellers cleared to list - the ones seller features apply to.',
  },
];

/**
 * Writes and sends a campaign email.
 *
 * <p>Three things this screen does on purpose, all of them about the fact that
 * a send cannot be taken back:
 *
 * <ul>
 *   <li>It states the recipient count next to the audience, refreshed whenever
 *       the audience changes. Nobody should press Send to find out how many
 *       people that was.</li>
 *   <li>It confirms in a dialog that names the number and the segment, rather
 *       than sending on the first click.</li>
 *   <li>It shows the history underneath, so "did that go out?" is answerable
 *       without reading a log.</li>
 * </ul>
 */
export const CampaignComposer: React.FC<CampaignComposerProps> = ({ onNotice }) => {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState<CampaignAudience>('ALL');

  const [recipientCount, setRecipientCount] = useState<number | null>(null);
  const [countingAudience, setCountingAudience] = useState(false);

  const [campaigns, setCampaigns] = useState<EmailCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);

  /*
   * Two error slots, one owner each.
   *
   * They started as one, and it swallowed the message that matters most: every
   * send ends by reloading the history, and the reload's success path cleared
   * the error - so a campaign the server had just refused flashed its reason
   * and then wiped it, leaving an admin who had sent nothing with no idea why.
   * A shared slot means whichever request finishes last wins, which is never
   * the semantics you want between an action and a background refresh.
   */
  const [error, setError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  const loadCampaigns = useCallback(async () => {
    const res = await api.admin.getCampaigns();
    if (res.error) {
      setListError(res.error);
    } else {
      setCampaigns(res.campaigns);
      setListError(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadCampaigns();
  }, [loadCampaigns]);

  // Re-counted on every audience change rather than once on mount: the number
  // is the main thing stopping someone mailing the wrong segment, so it must
  // never be stale relative to the dropdown beside it.
  useEffect(() => {
    let cancelled = false;
    setCountingAudience(true);
    api.admin.getCampaignAudience(audience).then((res) => {
      if (cancelled) return;
      setRecipientCount(res.error ? null : res.recipientCount);
      setCountingAudience(false);
    });
    return () => {
      cancelled = true;
    };
  }, [audience]);

  const canSend = subject.trim().length > 0 && body.trim().length > 0 && !sending;

  const send = async () => {
    setSending(true);
    // Cleared here, at the start of the action that owns it, rather than by
    // whatever finishes last.
    setError(null);
    const res = await api.admin.sendCampaign(subject.trim(), body.trim(), audience);
    setSending(false);
    setConfirming(false);

    if (!res.success) {
      setError(res.error || 'Could not send the campaign.');
      return;
    }

    /*
     * A campaign can come back FAILED from a successful request - the server
     * refuses up front when SMTP or the base URL is missing, rather than
     * queueing something that cannot go out. Surfacing the row's own error is
     * the only way the admin learns which setting is missing.
     */
    if (res.campaign?.status === 'FAILED') {
      setError(res.campaign.error || 'The campaign could not be sent.');
    } else {
      onNotice('Campaign queued. The counts below update as it sends.');
      setSubject('');
      setBody('');
    }
    loadCampaigns();
  };

  const audienceLabel =
    AUDIENCES.find((a) => a.value === audience)?.label ?? audience;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Email Campaigns</h1>
        <p className="text-sm text-slate-500 mt-1">
          Announcements to people who have not opted out. Everyone still gets email about their
          own orders and messages regardless.
        </p>
      </div>

      <ErrorBanner message={error} />
      <ErrorBanner message={listError} />

      {/* ── Composer ── */}
      <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-xs space-y-5">
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">Audience</label>
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={audience}
              onChange={(e) => setAudience(e.target.value as CampaignAudience)}
              className="input-base text-sm max-w-xs"
            >
              {AUDIENCES.map((a) => (
                <option key={a.value} value={a.value}>{a.label}</option>
              ))}
            </select>
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600
                             bg-slate-100 rounded-full px-3 py-1.5">
              {countingAudience ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Users className="w-3.5 h-3.5" />
              )}
              {countingAudience
                ? 'Counting…'
                : recipientCount === null
                  ? 'Count unavailable'
                  : `${recipientCount} recipient${recipientCount === 1 ? '' : 's'}`}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1.5">
            {AUDIENCES.find((a) => a.value === audience)?.hint}
          </p>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">Subject</label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Textbook season starts Monday"
            maxLength={150}
            className="input-base text-sm"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">Message</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={9}
            placeholder={'Write it as plain text.\n\nLeave a blank line between paragraphs.'}
            className="input-base text-sm font-normal leading-relaxed"
          />
          <p className="text-xs text-slate-500 mt-1.5">
            Plain text. Blank lines become paragraphs, and the server wraps it in the
            CampusMarket layout with an unsubscribe link. Any markup you type is shown
            literally rather than rendered.
          </p>
        </div>

        <div className="flex items-center justify-between gap-4 pt-1">
          <p className="text-xs text-slate-500">
            Sending cannot be undone or recalled.
          </p>
          <button
            onClick={() => setConfirming(true)}
            disabled={!canSend}
            className="shrink-0 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600
                       text-white text-sm font-bold hover:bg-blue-700 disabled:opacity-50
                       disabled:cursor-not-allowed transition-colors"
          >
            <Send className="w-4 h-4" />
            Send campaign
          </button>
        </div>
      </div>

      {/* ── History ── */}
      <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-xs">
        <h3 className="font-bold text-slate-900 text-base mb-4">Sent campaigns</h3>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-slate-500 py-4">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : campaigns.length === 0 ? (
          <p className="text-xs text-slate-500">Nothing sent yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400">
                  <th className="pb-2 font-semibold">Subject</th>
                  <th className="pb-2 font-semibold">Audience</th>
                  <th className="pb-2 font-semibold">Status</th>
                  <th className="pb-2 font-semibold">Sent</th>
                  <th className="pb-2 font-semibold">When</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => (
                  <tr key={c.id} className="border-t border-slate-100">
                    <td className="py-3 pr-4">
                      <p className="font-semibold text-slate-900">{c.subject}</p>
                      {c.error && (
                        <p className="text-xs text-red-600 mt-0.5">{c.error}</p>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-xs text-slate-600">{c.audience}</td>
                    <td className="py-3 pr-4"><StatusPill status={c.status} /></td>
                    <td className="py-3 pr-4 text-xs text-slate-600">
                      {c.sentCount}/{c.recipientCount}
                      {c.failedCount > 0 && (
                        <span className="text-red-600 font-semibold"> · {c.failedCount} failed</span>
                      )}
                    </td>
                    <td className="py-3 text-xs text-slate-500">
                      {new Date(c.sentAt || c.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/*
          Manual refresh rather than polling. A send finishes in seconds to
          minutes and this screen is not usually being watched, so a timer
          would mostly be requests nobody reads.
        */}
        {!loading && campaigns.some((c) => c.status === 'SENDING') && (
          <button
            onClick={loadCampaigns}
            className="mt-4 text-xs font-semibold text-blue-600 hover:text-blue-700"
          >
            Refresh counts
          </button>
        )}
      </div>

      {/* ── Confirmation ── */}
      <Modal
        isOpen={confirming}
        onClose={() => setConfirming(false)}
        title="Send this campaign?"
      >
        <div className="space-y-4">
            <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-amber-50 border border-amber-200">
              <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-900 leading-relaxed">
                This emails{' '}
                <strong>
                  {recipientCount === null ? 'an unknown number of' : recipientCount}
                </strong>{' '}
                {recipientCount === 1 ? 'person' : 'people'} in{' '}
                <strong>{audienceLabel}</strong>. It cannot be undone or recalled once sent.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 p-3.5">
              <p className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold mb-1">
                Subject
              </p>
              <p className="text-sm font-semibold text-slate-900 mb-3">{subject}</p>
              <p className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold mb-1">
                Message
              </p>
              <p className="text-xs text-slate-600 whitespace-pre-wrap leading-relaxed max-h-40 overflow-y-auto">
                {body}
              </p>
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setConfirming(false)}
                disabled={sending}
                className="px-3.5 py-2 rounded-xl text-sm font-semibold text-slate-600
                           hover:bg-slate-100 disabled:opacity-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={send}
                disabled={sending}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600
                           text-white text-sm font-bold hover:bg-blue-700 disabled:opacity-50
                           transition-colors"
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                {sending ? 'Sending…' : 'Send now'}
              </button>
            </div>
        </div>
      </Modal>
    </div>
  );
};

const StatusPill: React.FC<{ status: EmailCampaign['status'] }> = ({ status }) => {
  const styles: Record<EmailCampaign['status'], string> = {
    DRAFT: 'bg-slate-100 text-slate-600',
    SENDING: 'bg-blue-100 text-blue-700',
    SENT: 'bg-emerald-100 text-emerald-700',
    FAILED: 'bg-red-100 text-red-700',
  };
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${styles[status]}`}>
      {status === 'SENDING' && <Loader2 className="w-3 h-3 animate-spin" />}
      {status === 'SENT' && <CheckCircle2 className="w-3 h-3" />}
      {status}
    </span>
  );
};
