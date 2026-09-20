import React, { useEffect, useState } from 'react';
import {
  X, CheckCircle2, AlertCircle, MailCheck, Loader2, ArrowLeft,
  ShoppingBag, Store, MapPin,
} from 'lucide-react';
import { api } from '../services/api';
import { isGoogleSignInConfigured, signInWithGoogle } from '../firebase';
import { AccountType, CampusZone, CAMPUS_ZONES } from '../types';

/**
 * `profile` is the second leg of Google sign-in: the popup proves who someone
 * is but says nothing about what kind of account they want, so a brand-new
 * Google user lands here to answer that before entering the app.
 */
export type AuthMode = 'login' | 'signup' | 'verify' | 'forgot' | 'reset' | 'profile';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess?: (email: string) => void;
  initialMode?: AuthMode;
  resetToken?: string;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onLoginSuccess,
  initialMode = 'login',
  resetToken,
}) => {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [department, setDepartment] = useState('');

  // Both required at signup. Buyer is the default because it is the
  // lower-privilege option - nobody gets selling rights by rushing the form.
  const [accountType, setAccountType] = useState<AccountType>('BUYER');
  const [campusZone, setCampusZone] = useState<CampusZone | ''>('');

  /** Held between the two legs of Google sign-in so the second can replay it. */
  const [googleToken, setGoogleToken] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Dev-only: the API echoes verification/reset tokens when
  // campusmarket.expose-dev-tokens is on, so the email flows are clickable
  // without a mail provider wired up.
  const [devToken, setDevToken] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      resetFeedback();
      /*
       * Passwords never survive a reopen.
       *
       * This modal is mounted for the whole session rather than created on
       * demand, so every field kept its value indefinitely - including after a
       * successful sign-in, and after a sign-out. On a shared campus laptop
       * that left the previous person's password sitting in a populated field
       * for whoever opened the modal next. The address is not a secret and is
       * left alone, since retrying a typo'd login is the common case.
       */
      setPassword('');
      setConfirmPassword('');
    }
  }, [isOpen, initialMode]);

  if (!isOpen) return null;

  function resetFeedback() {
    setError(null);
    setErrorCode(null);
    setNotice(null);
    setDevToken(null);
  }

  function switchMode(next: AuthMode) {
    setMode(next);
    resetFeedback();
  }

  /**
   * Dismissing during the Google profile step still has to report the sign-in:
   * the first leg already stored a session token, so skipping the callback
   * would leave the app rendering a guest while actually being authenticated.
   * They keep the safe BUYER default and get asked for a zone when it matters.
   */
  function handleDismiss() {
    if (mode === 'profile') {
      setGoogleToken(null);
      onLoginSuccess?.(email.trim());
    }
    onClose();
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    resetFeedback();

    const res = await api.auth.login(email.trim(), password);
    setBusy(false);

    if (res.ok) {
      // Dropped the moment it is no longer needed, rather than being held
      // until something happens to reopen the modal.
      setPassword('');
      onLoginSuccess?.(email.trim());
      onClose();
      return;
    }

    setError(res.error || 'Could not sign you in.');
    setErrorCode(res.code || null);

    // An unverified account is not a dead end - move them straight to the
    // resend screen (workflow 3 step 2).
    if (res.code === 'EMAIL_NOT_VERIFIED') {
      setMode('verify');
      setNotice('Verify your email before logging in.');
      setError(null);
    }
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    if (!campusZone) {
      setError('Choose your campus location.');
      return;
    }
    setBusy(true);
    resetFeedback();

    const res = await api.auth.signup({
      name: name.trim(),
      email: email.trim(),
      password,
      accountType,
      campusZone,
      phone: phone.trim() || undefined,
      department: department.trim() || undefined,
    });
    setBusy(false);

    if (res.ok) {
      // The account exists now; nothing left in this flow needs the password.
      setPassword('');
      setConfirmPassword('');
      setMode('verify');
      setNotice(res.data?.message || 'Check your email to verify your account.');
      setDevToken(res.data?.devToken || null);
      return;
    }
    setError(res.error || 'Could not create your account.');
    setErrorCode(res.code || null);
  }

  /**
   * First leg: run the popup and sign in. A returning user is done here. A
   * brand-new account has no zone yet, so the server answers `needsProfile`
   * and we hold the token to replay once they've answered.
   */
  async function handleGoogle() {
    setBusy(true);
    resetFeedback();
    try {
      const idToken = await signInWithGoogle();
      const res = await api.auth.google(idToken);
      setBusy(false);

      if (!res.ok) {
        setError(res.error || 'Could not sign in with Google.');
        setErrorCode(res.code || null);
        return;
      }
      if (res.needsProfile) {
        setGoogleToken(idToken);
        setEmail(res.user?.email || '');
        setMode('profile');
        return;
      }
      onLoginSuccess?.(res.user?.email || email.trim());
      onClose();
    } catch (err: any) {
      setBusy(false);
      // The user closing the popup themselves isn't an error worth reporting.
      if (err?.code === 'auth/popup-closed-by-user' || err?.code === 'auth/cancelled-popup-request') {
        return;
      }
      setError(err?.message || 'Could not sign in with Google.');
    }
  }

  /** Second leg: replay the same token with the answers attached. */
  async function handleCompleteProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!campusZone) {
      setError('Choose your campus location.');
      return;
    }
    if (!googleToken) {
      // The held token is gone (a reopened modal, say) - restart cleanly rather
      // than half-finishing a signup.
      setError('That sign-in expired. Please sign in with Google again.');
      setMode('login');
      return;
    }
    setBusy(true);
    resetFeedback();

    const res = await api.auth.google(googleToken, {
      accountType,
      campusZone,
      // Was being dropped here: the request has always carried a phone, and
      // the form now asks for one.
      phone: phone.trim() || undefined,
    });
    setBusy(false);

    if (res.ok) {
      setGoogleToken(null);
      onLoginSuccess?.(res.user?.email || email.trim());
      onClose();
      return;
    }
    setError(res.error || 'Could not finish setting up your account.');
    setErrorCode(res.code || null);
  }

  async function handleResend() {
    setBusy(true);
    resetFeedback();
    const res = await api.auth.resendVerification(email.trim());
    setBusy(false);
    if (res.ok) {
      setNotice(res.data?.message || 'Verification email sent.');
      setDevToken(res.data?.devToken || null);
    } else {
      setError(res.error || 'Could not resend the email.');
    }
  }

  async function handleVerifyWithToken(token: string) {
    setBusy(true);
    resetFeedback();
    const res = await api.auth.verifyEmail(token);
    setBusy(false);
    if (res.ok) {
      onLoginSuccess?.(email.trim());
      onClose();
    } else {
      setError(res.error || 'Verification failed.');
      setErrorCode(res.code || null);
    }
  }

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    resetFeedback();
    const res = await api.auth.forgotPassword(email.trim());
    setBusy(false);
    // Deliberately the same message whether or not the address is registered.
    setNotice(res.data?.message || 'If an account exists, a reset link is on its way.');
    setDevToken(res.data?.devToken || null);
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setBusy(true);
    resetFeedback();
    const res = await api.auth.resetPassword(resetToken || devToken || '', password, confirmPassword);
    setBusy(false);
    if (res.ok) {
      setMode('login');
      setPassword('');
      setConfirmPassword('');
      setNotice('Password updated. Log in with your new password.');
    } else {
      setError(res.error || 'Could not reset your password.');
      setErrorCode(res.code || null);
    }
  }

  const titles: Record<AuthMode, string> = {
    login: 'Log In',
    signup: 'Sign Up',
    verify: 'Check your email',
    forgot: 'Reset your password',
    reset: 'Choose a new password',
    profile: 'Finish setting up',
  };

  /* The two pickers are shared between the signup form and the Google profile
     step, so the choice reads identically however someone arrived here. */
  const accountTypePicker = (
    <div>
      <label className="block text-xs font-semibold text-[#434655] mb-1.5">
        What best describes you?
      </label>
      <div className="grid grid-cols-2 gap-2">
        {([
          {
            value: 'BUYER' as const,
            label: 'Buy',
            hint: 'Buy items for personal use or consumption',
            icon: <ShoppingBag className="w-4 h-4" />,
            active: 'border-[#2563eb] bg-[#eff4ff] text-[#2563eb]',
          },
          {
            value: 'SELLER' as const,
            label: 'Sell',
            hint: 'Selling items or offering services.',
            icon: <Store className="w-4 h-4" />,
            active: 'border-[#007d55] bg-emerald-50 text-[#006242]',
          },
        ]).map((option) => {
          const selected = accountType === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => setAccountType(option.value)}
              aria-pressed={selected}
              className={`flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-all duration-150 ${selected
                ? `${option.active} shadow-xs`
                : 'border-[#c3c6d7] bg-white text-[#434655] hover:border-[#737686]'
                }`}
            >
              {option.icon}
              <span className="text-sm font-bold leading-none">{option.label}</span>
              <span className="text-[10px] font-medium opacity-80 leading-tight">{option.hint}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-1.5 text-[11px] text-[#737686]">
        {accountType === 'BUYER'
          ? "You can switch to selling any time - it's one click, no new account."
          : 'You can browse and buy as well.'}
      </p>
    </div>
  );

  const zonePicker = (
    <div>
      <label className="block text-xs font-semibold text-[#434655] mb-1.5">
        Where are you on campus?
      </label>
      <div className="space-y-1.5">
        {CAMPUS_ZONES.map((zone) => {
          const selected = campusZone === zone.value;
          return (
            <button
              key={zone.value}
              type="button"
              onClick={() => setCampusZone(zone.value)}
              aria-pressed={selected}
              className={`w-full flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-all duration-150 ${selected
                ? 'border-[#2563eb] bg-[#eff4ff] shadow-xs'
                : 'border-[#c3c6d7] bg-white hover:border-[#737686]'
                }`}
            >
              <MapPin className={`w-4 h-4 shrink-0 ${selected ? 'text-[#2563eb]' : 'text-[#a0a3b1]'}`} />
              <span className="min-w-0">
                <span className={`block text-sm font-bold leading-tight ${selected ? 'text-[#2563eb]' : 'text-[#0b1c30]'}`}>
                  {zone.label}
                </span>
                <span className="block text-[10px] text-[#737686] leading-tight">{zone.hint}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#213145]/50 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-sm bg-white rounded-3xl shadow-modal overflow-hidden border border-[#e5eeff] p-6 sm:p-8 animate-slide-up max-h-[92vh] overflow-y-auto">
        <button
          onClick={handleDismiss}
          className="absolute top-4 right-4 p-2 text-[#737686] hover:text-[#0b1c30] rounded-full hover:bg-[#f8f9ff] transition-all duration-150"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Campus illustration, shown only on the two entry modes. The deeper
            flows (verify, reset, finish setup) are tasks to complete rather
            than a front door, and the artwork would only push them down. */}
        {(mode === 'login' || mode === 'signup') && (
          <div className="-mx-6 sm:-mx-8 -mt-6 sm:-mt-8 mb-2 h-48 bg-gradient-to-b from-[#eff4ff] to-white flex items-center justify-center overflow-hidden">
            {/*
              Sized by HEIGHT so the whole square illustration fits the band
              rather than being cropped to its lower half.

              width/height are set explicitly and lazy loading is off on
              purpose: a lazy image with no intrinsic size collapses to zero
              height, never intersects the viewport, and so never loads at all.
            */}
            <img
              src="/images/screen.png"
              alt=""
              aria-hidden="true"
              width={1024}
              height={1024}
              decoding="async"
              className="h-full w-auto object-contain select-none pointer-events-none"
            />
          </div>
        )}

        {(mode === 'login' || mode === 'signup') && (
          <div className="grid grid-cols-2 border-b border-[#c3c6d7]/60 mb-6">
            {(['login', 'signup'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => switchMode(tab)}
                className={`py-2.5 text-center font-semibold text-sm transition-all duration-150 ${mode === tab
                  ? 'text-[#2563eb] border-b-2 border-[#2563eb]'
                  : 'text-[#737686] hover:text-[#0b1c30]'
                  }`}
              >
                {tab === 'login' ? 'Log In' : 'Sign Up'}
              </button>
            ))}
          </div>
        )}

        {mode !== 'login' && mode !== 'signup' && (
          <h3 className="text-base font-bold text-[#0b1c30] mb-4 text-center">{titles[mode]}</h3>
        )}

        {(mode === 'login' || mode === 'signup') && isGoogleSignInConfigured && (
          <>
            <button
              type="button"
              onClick={handleGoogle}
              disabled={busy}
              className="w-full h-11 rounded-xl border border-[#c3c6d7] bg-white hover:bg-[#f8f9ff] text-[#0b1c30] font-semibold text-sm flex items-center justify-center gap-2.5 disabled:opacity-50 transition-colors"
            >
              <GoogleIcon className="w-4 h-4" />
              <span>Sign in with Google</span>
            </button>
          </>
        )}

        {error && (
          <div className="mb-4 flex items-start gap-2 rounded-xl bg-red-50 border border-red-200 px-3 py-2.5">
            <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
            <div className="text-xs text-red-700">
              <p className="font-semibold">{error}</p>
              {errorCode === 'EMAIL_EXISTS' && (
                <button
                  onClick={() => switchMode('login')}
                  className="mt-1 underline font-semibold hover:text-red-900"
                >
                  Log in instead
                </button>
              )}
              {errorCode === 'TOKEN_EXPIRED' && (
                <button
                  onClick={() => switchMode(mode === 'reset' ? 'forgot' : 'verify')}
                  className="mt-1 underline font-semibold hover:text-red-900"
                >
                  Request a new link
                </button>
              )}
            </div>
          </div>
        )}

        {notice && (
          <div className="mb-4 flex items-start gap-2 rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
            <p className="text-xs text-emerald-800 font-medium">{notice}</p>
          </div>
        )}

        {/* ---------------------------------------------------------- login */}
        {mode === 'login' && (
          <form onSubmit={handleLogin} className="space-y-4">
            <Field label="Email">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@campus.edu"
                required
                autoComplete="email"
                className="input-base text-sm"
              />
            </Field>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-[#434655]">Password</label>
                <button
                  type="button"
                  onClick={() => switchMode('forgot')}
                  className="text-xs font-semibold text-[#2563eb] hover:text-[#004ac6]"
                >
                  Forgot password?
                </button>
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="input-base text-sm"
              />
            </div>
            <SubmitButton busy={busy} label="Log In" />
          </form>
        )}

        {/* --------------------------------------------------------- signup */}
        {mode === 'signup' && (
          <form onSubmit={handleSignup} className="space-y-4">
            <Field label="Full name">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="input-base text-sm"
              />
            </Field>
            <Field label="Campus email">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@campus.edu"
                required
                autoComplete="email"
                className="input-base text-sm"
              />
            </Field>
            <Field label="Password">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="new-password"
                className="input-base text-sm"
              />
              <p className="mt-1 text-[11px] text-[#737686]">
                At least 8 characters, including a letter and a number.
              </p>
            </Field>

            {accountTypePicker}
            {zonePicker}

            <Field label="Phone number (optional)">
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+1 (555) 000-0000"
                autoComplete="tel"
                className="input-base text-sm"
              />
            </Field>
            <Field label="Faculty / department (optional)">
              <input
                type="text"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="input-base text-sm"
              />
            </Field>
            <SubmitButton busy={busy} label="Create account" />
          </form>
        )}

        {/* ------------------------------------ Google: finish setting up */}
        {mode === 'profile' && (
          <form onSubmit={handleCompleteProfile} className="space-y-4">
            <p className="text-sm text-[#434655]">
              Signed in as <span className="font-semibold text-[#0b1c30]">{email}</span>. A few quick
              questions and you're in.
            </p>
            {accountTypePicker}
            {zonePicker}

            {/* Optional, and said so plainly. Nothing here is payment or
                delivery - the number exists so the two of you can find each
                other at a handover that happens in person, which is why the
                hint says what it is FOR rather than just asking for it. */}
            <Field label="Phone number (optional)">
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+260 97 123 4567"
                autoComplete="tel"
                inputMode="tel"
                className="input-base text-sm"
              />
              <p className="mt-1 text-[11px] text-[#737686]">
                Shared only with someone you're trading with, so you can meet up.
                You can add it later.
              </p>
            </Field>

            <SubmitButton busy={busy} label="Finish setup" />
          </form>
        )}

        {/* --------------------------------------------------- verification */}
        {mode === 'verify' && (
          <div className="space-y-4 text-center">
            <MailCheck className="w-10 h-10 text-[#2563eb] mx-auto" />
            <p className="text-sm text-[#434655]">
              We sent a verification link to{' '}
              <span className="font-semibold text-[#0b1c30]">{email || 'your email'}</span>.
            </p>
            {!email && (
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@campus.edu"
                className="input-base text-sm"
              />
            )}
            <button
              onClick={handleResend}
              disabled={busy}
              className="text-xs font-semibold text-[#2563eb] hover:text-[#004ac6] disabled:opacity-50"
            >
              Resend verification email
            </button>

            {devToken && (
              <DevTokenBox
                label="Dev shortcut - verify now"
                onClick={() => handleVerifyWithToken(devToken)}
              />
            )}

            <button
              onClick={() => switchMode('login')}
              className="w-full text-xs text-[#737686] hover:text-[#0b1c30] pt-2"
            >
              Back to log in
            </button>
          </div>
        )}

        {/* ------------------------------------------------- forgot password */}
        {mode === 'forgot' && (
          <form onSubmit={handleForgot} className="space-y-4">
            <button
              type="button"
              onClick={() => switchMode('login')}
              className="flex items-center gap-1 text-xs font-semibold text-[#737686] hover:text-[#0b1c30]"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back
            </button>
            <Field label="Email">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@campus.edu"
                required
                className="input-base text-sm"
              />
            </Field>
            <SubmitButton busy={busy} label="Send reset link" />
            {devToken && (
              <DevTokenBox
                label="Dev shortcut - set a new password"
                onClick={() => {
                  setPassword('');
                  setConfirmPassword('');
                  setMode('reset');
                }}
              />
            )}
          </form>
        )}

        {/* -------------------------------------------------- reset password */}
        {mode === 'reset' && (
          <form onSubmit={handleReset} className="space-y-4">
            <Field label="New password">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="new-password"
                className="input-base text-sm"
              />
            </Field>
            <Field label="Confirm new password">
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                autoComplete="new-password"
                className="input-base text-sm"
              />
              {confirmPassword && password !== confirmPassword && (
                <p className="mt-1 text-[11px] text-red-600 font-medium">Passwords do not match.</p>
              )}
            </Field>
            <SubmitButton busy={busy} label="Update password" />
          </form>
        )}

        <div className="flex items-center justify-center space-x-6 mt-7 text-xs text-[#737686] font-medium">
          <a href="#support" onClick={onClose} className="hover:text-[#0b1c30]">Support</a>
          <a href="#privacy" onClick={onClose} className="hover:text-[#0b1c30]">Privacy</a>
        </div>
      </div>
    </div>
  );
};

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div>
    <label className="block text-xs font-semibold text-[#434655] mb-1.5">{label}</label>
    {children}
  </div>
);

const SubmitButton: React.FC<{ busy: boolean; label: string }> = ({ busy, label }) => (
  <button type="submit" disabled={busy} className="btn-primary w-full !rounded-lg mt-2">
    {busy ? (
      <>
        <Loader2 className="w-4 h-4 animate-spin" />
        <span>Please wait…</span>
      </>
    ) : (
      <span>{label}</span>
    )}
  </button>
);

/** Google's multi-color "G" mark. Not in lucide-react (it has no brand icons). */
const GoogleIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
    <path
      fill="#4285F4"
      d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.63h6.47a5.53 5.53 0 0 1-2.4 3.63v3h3.89c2.28-2.1 3.6-5.19 3.6-8.81z"
    />
    <path
      fill="#34A853"
      d="M12 24c3.24 0 5.96-1.07 7.95-2.92l-3.89-3c-1.08.72-2.46 1.15-4.06 1.15-3.12 0-5.77-2.11-6.71-4.94H1.28v3.1A12 12 0 0 0 12 24z"
    />
    <path
      fill="#FBBC05"
      d="M5.29 14.29a7.2 7.2 0 0 1 0-4.58v-3.1H1.28a12 12 0 0 0 0 10.78z"
    />
    <path
      fill="#EA4335"
      d="M12 4.75c1.76 0 3.34.6 4.59 1.79l3.44-3.44C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.69 1.28 6.61l4.01 3.1C6.23 6.86 8.88 4.75 12 4.75z"
    />
  </svg>
);

/** Only ever rendered when the API is running with dev tokens enabled. */
const DevTokenBox: React.FC<{ label: string; onClick: () => void }> = ({ label, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="w-full rounded-xl border border-dashed border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 hover:bg-amber-100"
  >
    {label}
  </button>
);
