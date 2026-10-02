import React, { useEffect, useState } from 'react';
import { Loader2, Phone, ShieldCheck, CheckCircle2, KeyRound, MessageSquare } from 'lucide-react';
import { AuthSession, CAMPUS_ZONES, CampusZone } from '../../types';
import { api } from '../../services/api';
import { Modal, ErrorBanner, Field } from './Modal';
import { buildSmsLink } from '../../utils/smsLink';
import { isIos } from '../../utils/platform';

interface ProfileEditorProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: AuthSession;
  /** Refreshes the session so the new name, zone and phone state propagate. */
  onSaved: () => void;
}

type Step = 'details' | 'code' | 'password';

/**
 * Edit your own profile, including the phone number.
 *
 * <p>The number is handled apart from the rest of the form because it cannot
 * be saved by typing it: it changes only once a code sent to it comes back.
 * A number nobody proved is worse than a blank field - it looks like a way to
 * reach someone at handover and isn't.
 */
export const ProfileEditor: React.FC<ProfileEditorProps> = ({
  isOpen,
  onClose,
  currentUser,
  onSaved,
}) => {
  const [name, setName] = useState(currentUser.name);
  const [bio, setBio] = useState('');
  const [department, setDepartment] = useState(currentUser.department ?? '');
  const [year, setYear] = useState(currentUser.year ?? '');
  const [campusZone, setCampusZone] = useState<CampusZone | ''>(currentUser.campusZone ?? '');

  const [phone, setPhone] = useState(currentUser.phone ?? '');
  const [step, setStep] = useState<Step>('details');
  /** What the student has to text us, and where. Set by beginPhoneVerification. */
  const [challenge, setChallenge] = useState<{
    code: string; gatewayNumber: string; messageBody: string;
  } | null>(null);
  const [phoneVerified, setPhoneVerified] = useState(!!currentUser.phoneVerified);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setName(currentUser.name);
    setDepartment(currentUser.department ?? '');
    setYear(currentUser.year ?? '');
    setCampusZone(currentUser.campusZone ?? '');
    setPhone(currentUser.phone ?? '');
    setPhoneVerified(!!currentUser.phoneVerified);
    setStep('details');
    setChallenge(null);
    setError(null);
    setNotice(null);
    /*
     * Seeded when the editor opens, and only then.
     *
     * `currentUser` was a dependency, but the session is refetched every
     * thirty seconds by the badge poller and `setCurrentUser` always stores a
     * freshly mapped object - so the identity changed on a timer even when
     * nothing about the account had. That re-ran this effect mid-edit and
     * overwrote whatever was being typed with the stored values, and knocked
     * anyone waiting on an SMS code back to the details step. Reopening the
     * editor re-runs this and picks up any genuine change.
     */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  /* Typing a different number invalidates the badge in the UI immediately -
     the old number is still what is verified server-side until a new code is
     confirmed, and showing "verified" beside an unsent number would be a lie. */
  const phoneChanged = phone.trim() !== (currentUser.phone ?? '').trim();
  const showAsVerified = phoneVerified && !phoneChanged;

  const beginVerification = async () => {
    setBusy(true);
    setError(null);
    const res = await api.users.beginPhoneVerification(phone.trim());
    setBusy(false);
    if (res.success && res.verificationCode && res.gatewayNumber && res.messageBody) {
      setChallenge({
        code: res.verificationCode,
        gatewayNumber: res.gatewayNumber,
        messageBody: res.messageBody,
      });
      setStep('code');
      setNotice(null);
    } else {
      setError(res.error || 'Could not start verification.');
    }
  };

  /*
   * Waits for the text to reach the gateway.
   *
   * Polled rather than pushed: the message arrives over the mobile network at
   * a handset we do not control, so there is no moment the server could push
   * from, and the round trip is a single cheap read. Stops as soon as it lands
   * - and stops on unmount, so a closed editor is not still polling.
   */
  useEffect(() => {
    if (step !== 'code' || !challenge) return;
    let alive = true;

    const timer = setInterval(async () => {
      const res = await api.users.phoneStatus();
      if (!alive) return;
      if (res.phoneVerified) {
        setPhoneVerified(true);
        setPhone(res.phone ?? phone);
        setStep('details');
        setChallenge(null);
        setNotice('Phone number verified.');
        onSaved();
      } else if (!res.waiting) {
        // The code expired before anything arrived.
        setStep('details');
        setChallenge(null);
        setError('That code expired before your message arrived. Try again.');
      }
    }, 3000);

    return () => { alive = false; clearInterval(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, challenge]);

  const changePassword = async () => {
    setBusy(true);
    setError(null);
    const res = await api.auth.changePassword(currentPassword, newPassword, confirmPassword);
    setBusy(false);
    if (res.success) {
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
      setStep('details');
      setNotice('Password changed.');
    } else {
      setError(res.error || 'Could not change your password.');
    }
  };

  const save = async () => {
    if (!name.trim()) {
      setError('Your name cannot be empty.');
      return;
    }
    setBusy(true);
    setError(null);
    const res = await api.users.updateProfile({
      name: name.trim(),
      bio: bio.trim() || undefined,
      department: department.trim() || undefined,
      year: year.trim() || undefined,
      campusZone: campusZone || undefined,
    });
    setBusy(false);
    if (res.success) {
      onSaved();
      onClose();
    } else {
      setError(res.error || 'Could not save your profile.');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Edit your profile"
      subtitle={currentUser.email}
      footer={
        step === 'details' ? (
          <div className="grid grid-cols-2 gap-3">
            <button onClick={onClose} className="btn-ghost !rounded-xl !text-sm">Cancel</button>
            <button
              onClick={save}
              disabled={busy}
              className="btn-primary !rounded-xl !text-sm flex items-center justify-center gap-2"
            >
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}
              Save changes
            </button>
          </div>
        ) : step === 'password' ? (
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => setStep('details')} className="btn-ghost !rounded-xl !text-sm">
              Back
            </button>
            <button
              onClick={changePassword}
              disabled={busy || !currentPassword || !newPassword}
              className="btn-primary !rounded-xl !text-sm flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}
              Change password
            </button>
          </div>
        ) : (
          /* No confirm button on this step, because there is nothing for it to
             submit: the number is proven by a text arriving from it, not by
             anything this page can send. The step's own body carries the one
             action there is - opening the messaging app. */
          <button onClick={() => setStep('details')} className="btn-ghost !rounded-xl !text-sm w-full">
            Back
          </button>
        )
      }
    >
      <ErrorBanner message={error} />
      {notice && (
        <div className="mb-3 flex items-start gap-2 rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2.5">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
          <p className="text-xs text-emerald-800 font-medium">{notice}</p>
        </div>
      )}

      {step === 'password' ? (
        <div className="space-y-3">
          <p className="text-sm text-[#434655]">
            You stay signed in here. Other devices are not signed out - use
            Settings if you need that.
          </p>
          <Field label="Current password">
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoFocus
              className="input-base text-sm"
            />
          </Field>
          <Field label="New password">
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="input-base text-sm"
            />
          </Field>
          <Field label="Confirm new password">
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="input-base text-sm"
            />
          </Field>
        </div>
      ) : step === 'code' && challenge ? (
        <div className="space-y-4">
          <p className="text-sm text-[#434655]">
            Text this code to us from <span className="font-semibold">{phone}</span>. Receiving it
            from that number is what proves the number is yours.
          </p>

          <div className="rounded-xl border border-[#c3c6d7] bg-[#f8f9ff] px-4 py-3 text-center">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#737686]">
              Send this
            </p>
            <p className="text-lg font-bold tracking-[0.2em] text-[#0b1c30] mt-0.5">
              {challenge.messageBody}
            </p>
            <p className="text-xs text-[#737686] mt-1">
              to <span className="font-semibold">{challenge.gatewayNumber}</span>
            </p>
          </div>

          {/* A plain link, not a fetch: only the device's own messaging app can
              send from the student's number, which is the thing being proven.
              The page cannot do it for them, and should not look like it can. */}
          <a
            href={buildSmsLink({
              to: challenge.gatewayNumber,
              body: challenge.messageBody,
              ios: isIos(),
            })}
            className="w-full h-11 rounded-xl bg-[#2563eb] hover:bg-[#004ac6] text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors"
          >
            <MessageSquare className="w-4 h-4" /> Open messages
          </a>

          <p className="flex items-center justify-center gap-2 text-xs text-[#737686]">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Waiting for your message…
          </p>

          <p className="text-[11px] text-[#737686] text-center">
            Standard SMS rates apply — one message. Nothing is charged by CampusMarket.
          </p>

          <button
            onClick={() => { setStep('details'); setChallenge(null); }}
            className="w-full text-xs font-bold text-[#737686] hover:text-[#0b1c30]"
          >
            Cancel
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <Field label="Name">
            <input value={name} onChange={(e) => setName(e.target.value)} className="input-base text-sm" />
          </Field>

          {/* Phone sits inside the form but saves through its own path, which
              the badge and button make explicit. */}
          <div>
            <label className="block text-xs font-semibold text-[#434655] mb-1.5">
              Phone number <span className="text-red-500">*</span>
            </label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Phone className="w-4 h-4 text-[#a0a3b1] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+260 97 123 4567"
                  className="input-base text-sm !pl-9"
                />
              </div>
              {showAsVerified ? (
                <span className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold shrink-0">
                  <ShieldCheck className="w-3.5 h-3.5" /> Verified
                </span>
              ) : (
                <button
                  onClick={beginVerification}
                  disabled={busy || phone.trim().length < 7}
                  className="px-3.5 py-2.5 rounded-xl bg-[#2563eb] hover:bg-[#004ac6] text-white text-xs font-bold shrink-0 disabled:opacity-50 transition-colors"
                >
                  {busy ? 'Starting…' : 'Verify'}
                </button>
              )}
            </div>
            <p className="mt-1.5 text-xs text-[#737686]">
              {showAsVerified
                ? 'This is how buyers and sellers reach you to arrange a handover.'
                : 'Required. You text us a short code from this number to confirm it is yours.'}
            </p>
          </div>

          <Field label="Campus zone">
            <select
              value={campusZone}
              onChange={(e) => setCampusZone(e.target.value as CampusZone | '')}
              className="input-base text-sm"
            >
              <option value="">Choose a zone…</option>
              {CAMPUS_ZONES.map((z) => (
                <option key={z.value} value={z.value}>{z.label}</option>
              ))}
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Department">
              <input
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                placeholder="Engineering"
                className="input-base text-sm"
              />
            </Field>
            <Field label="Year">
              <input
                value={year}
                onChange={(e) => setYear(e.target.value)}
                placeholder="Year 2"
                className="input-base text-sm"
              />
            </Field>
          </div>

          <button
            onClick={() => { setError(null); setNotice(null); setStep('password'); }}
            className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl border border-[#c3c6d7] text-sm font-semibold text-[#434655] hover:border-[#2563eb] hover:text-[#2563eb] transition-colors"
          >
            <span className="flex items-center gap-2"><KeyRound className="w-4 h-4" /> Change password</span>
            <span className="text-xs text-[#a0a3b1]">••••••••</span>
          </button>

          <Field label="About you">
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={3}
              placeholder="What you sell, what you're looking for…"
              className="input-base text-sm resize-none"
            />
          </Field>
        </div>
      )}
    </Modal>
  );
};
