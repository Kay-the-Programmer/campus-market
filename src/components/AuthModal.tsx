import React, { useEffect, useRef, useState } from 'react';
import {
  X, CheckCircle2, AlertCircle, MailCheck, Loader2, ArrowLeft,
  ShoppingBag, Store, MapPin } from 'lucide-react';
import { api } from '../services/api';
import { isGoogleSignInConfigured, signInWithGoogle } from '../firebase';
import { AccountType, CampusZone, CAMPUS_ZONES } from '../types';
import { SellerTermsConsent } from './shared/SellerTermsConsent';
import { useDialog } from './shared/useDialog';
import { SELLER_TERMS_VERSION } from '../data/sellerTerms';

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
  /**
   * A Firebase ID token from a redirect-based Google sign-in, handed in by
   * App on the page load that returns from Google. The modal exchanges it
   * exactly as it would one from the popup, so the profile step still runs
   * for a brand-new account.
   */
  pendingGoogleToken?: string | null;
  /** Called once the pending token has been used, so App can drop it. */
  onPendingGoogleTokenConsumed?: () => void;
  /**
   * The browser is on its way back from Google but the token has not arrived
   * yet, so there is nothing to exchange and nothing to show - which is
   * exactly the moment this is for. App sets it from the marker left behind
   * before the redirect, and the modal shows progress instead of a sign-in
   * button the person has already pressed.
   */
  googleRedirectPending?: boolean;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onLoginSuccess,
  initialMode = 'login',
  resetToken,
  pendingGoogleToken,
  onPendingGoogleTokenConsumed,
  googleRedirectPending = false }) => {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState('');
  const panelRef = useRef<HTMLDivElement>(null);

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [phone, setPhone] = useState('');

  // Both required at signup. Buyer is the default because it is the
  // lower-privilege option - nobody gets selling rights by rushing the form.
  const [accountType, setAccountType] = useState<AccountType>('BUYER');
  const [campusZone, setCampusZone] = useState<CampusZone | ''>('');
  /**
   * Picking Seller here files a seller application, the same one the upgrade
   * modal files - so it asks for the same acceptance. Without this, "accept
   * the terms first" would be a rule that only applied to people who happened
   * to sign up as a buyer and change their mind later.
   */
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  /** Held between the two legs of Google sign-in so the second can replay it. */
  const [googleToken, setGoogleToken] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  /**
   * Which leg of the Google handshake is in flight, and so what to say about
   * it. `busy` alone only ever disabled the button, which is why the wait
   * between the account picker closing and the "Finish setting up" step read
   * as the site having done nothing at all.
   *
   *   popup       - their account picker is open, ours is idle
   *   redirecting - we are handing the whole page to Google
   *   exchange    - Google is done; the server is minting the session
   */
  const [googlePhase, setGooglePhase] =
    useState<'idle' | 'popup' | 'redirecting' | 'exchange'>('idle');
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
      setAcceptedTerms(false);
    }
  }, [isOpen, initialMode]);

  /*
   * The return leg of a redirect sign-in. Runs the same exchange as the popup
   * path; the only difference is where the token came from.
   *
   * Consumed-then-cleared through the callback, not by the modal forgetting
   * it: a token still sitting in App state would be exchanged again on the
   * next open, and the backend would mint a second session for one sign-in.
   */
  useEffect(() => {
    if (!isOpen || !pendingGoogleToken) return;
    const token = pendingGoogleToken;
    onPendingGoogleTokenConsumed?.();
    setBusy(true);
    setGooglePhase('exchange');
    resetFeedback();
    exchangeGoogleToken(token).catch((err: any) => {
      setBusy(false);
      setGooglePhase('idle');
      setError(err?.message || 'Could not sign in with Google.');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, pendingGoogleToken]);

  /* The same dialog behaviour the shared Modal shell has. AuthModal keeps its
     own layout - the illustration and the step flow do not fit that shell -
     but the keyboard contract should not depend on which shell you landed in. */
  useDialog(isOpen, () => handleDismiss(), panelRef);

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
    setGooglePhase('idle');
    if (mode === 'profile') {
      setGoogleToken(null);
      onLoginSuccess?.(email.trim());
    }
    onClose();
  }

  /*
   * There is deliberately no email/password login or signup here.
   *
   * Google is the only way in, and the reason is the signup flow rather than
   * the login one: creating an account with an address means proving you own
   * it, which means a verification mail, a token, and a person sitting on a
   * "check your email" screen. Google has already done that work, so a Google
   * signup lands verified (AuthService sets emailVerified on creation) and
   * goes straight into the app.
   *
   * The forms used to exist, commented out, which read as an accident and was
   * restored as one. They are gone now; `git log` has them if the decision is
   * ever revisited. The reset/verify modes below are kept because their email
   * links are still reachable by URL for accounts that predate this.
   */

  /**
   * First leg: run the popup and sign in. A returning user is done here. A
   * brand-new account has no zone yet, so the server answers `needsProfile`
   * and we hold the token to replay once they've answered.
   */
  async function handleGoogle() {
    setBusy(true);
    setGooglePhase('popup');
    resetFeedback();
    try {
      const idToken = await signInWithGoogle();
      if (idToken === null) {
        /*
         * The popup was blocked and Firebase is redirecting the whole page to
         * Google instead. Leave `busy` on - the page is about to unload, and a
         * re-enabled button would only invite a second click into the gap.
         * When the browser comes back, App hands the result in through
         * `pendingGoogleToken` and the effect below finishes the sign-in.
         */
        setGooglePhase('redirecting');
        return;
      }
      /* Picker closed, token in hand - the wait from here is ours, not
         Google's, and it is the one that used to be silent. */
      setGooglePhase('exchange');
      await exchangeGoogleToken(idToken);
    } catch (err: any) {
      setBusy(false);
      setGooglePhase('idle');
      // The user closing the popup themselves isn't an error worth reporting.
      if (err?.code === 'auth/popup-closed-by-user' || err?.code === 'auth/cancelled-popup-request') {
        return;
      }
      setError(err?.message || 'Could not sign in with Google.');
    }
  }

  /**
   * Trades a Firebase ID token for an app session. Shared by the popup path
   * above and the redirect return, so the profile step and error handling
   * exist once and behave identically however the token was obtained.
   */
  async function exchangeGoogleToken(idToken: string) {
    const res = await api.auth.google(idToken);
    setBusy(false);
    setGooglePhase('idle');

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
  }

  /** Second leg: replay the same token with the answers attached. */
  async function handleCompleteProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!campusZone) {
      setError('Choose your campus location.');
      return;
    }
    if (accountType === 'SELLER' && !acceptedTerms) {
      setError('Read and accept the seller terms to apply.');
      return;
    }
    /*
     * Counted in digits rather than matched against a pattern. People type a
     * number as +260 97 123 4567, 0971234567 or 097-123-4567, and a regex
     * strict enough to be worth having rejects at least one of those. Nine
     * digits is a local mobile without the leading zero; fifteen is E.164's
     * ceiling, so anything longer is a typo rather than a country we have not
     * thought of.
     */
    const phoneDigits = phone.replace(/\D/g, '');
    if (!phoneDigits) {
      setError('Add a phone number so you can be reached at a handover.');
      return;
    }
    if (phoneDigits.length < 9 || phoneDigits.length > 15) {
      setError('That phone number does not look right. Check the digits and try again.');
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
      // the form now asks for one. Required from here on, so no `|| undefined`
      // - an empty string reaching the server would be a bug worth a 400
      // rather than something to quietly turn into "not provided".
      phone: phone.trim(),
      // Only meaningful for a seller; the server ignores it for a buyer.
      acceptedTermsVersion: accountType === 'SELLER' ? SELLER_TERMS_VERSION : undefined });
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

  /*
   * A page coming back from Google has a wait of its own before any token
   * exists to exchange, and it is the longest one in the whole flow. Folding
   * it in here means the progress panel is on screen from the first paint of
   * the return leg rather than only once the token lands.
   */
  const googleProgress = googleRedirectPending && googlePhase === 'idle' ? 'exchange' : googlePhase;

  const titles: Record<AuthMode, string> = {
    login: 'Log In',
    signup: 'Sign Up',
    verify: 'Check your email',
    forgot: 'Reset your password',
    reset: 'Choose a new password',
    profile: 'Finish setting up' };

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
            label: 'Buyer',
            hint: 'Buying items for personal use or consumption',
            icon: <ShoppingBag className="w-4 h-4" />,
            active: 'border-[#2563eb] bg-[#eff4ff] text-[#2563eb]' },
          {
            value: 'SELLER' as const,
            label: 'Seller',
            hint: 'Selling items or offering services.',
            icon: <Store className="w-4 h-4" />,
            active: 'border-[#007d55] bg-emerald-50 text-[#006242]' },
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
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        /* aria-label, not labelledby: the two visible headings are each
           conditional, and the Google progress step renders neither - a
           labelledby pointing at an element that is not there names the
           dialog nothing at all. titles[mode] is always accurate. */
        aria-label={titles[mode]}
        tabIndex={-1}
        className="relative w-full max-w-sm bg-white rounded-3xl shadow-modal overflow-hidden border border-[#e5eeff] p-6 sm:p-8 animate-slide-up max-h-[92vh] overflow-y-auto focus:outline-none"
      >
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
        {(mode === 'login' || mode === 'signup') && googleProgress === 'idle' && (
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

        {/*
          No Log In / Sign Up tabs. Google is the only way in, and it does not
          distinguish the two - the same button signs an existing account in and
          creates a new one. Two tabs that render identical content only invite
          the question of what the difference is.
        */}
        {mode !== 'login' && mode !== 'signup' && (
          <h3 className="text-base font-bold text-[#0b1c30] mb-4 text-center">{titles[mode]}</h3>
        )}

        {/*
          The sign-in button is not a place to wait. Once it has been pressed
          the person has nothing left to do here, and leaving the front door on
          screen - greyed out, no movement - was read as the click not having
          landed. Progress takes the whole panel instead, and says which of the
          three waits this is.
        */}
        {(mode === 'login' || mode === 'signup') && googleProgress !== 'idle' && (
          <GoogleProgress phase={googleProgress} />
        )}

        {(mode === 'login' || mode === 'signup') && googleProgress === 'idle' && (
          <>
            <h3 className="text-base font-bold text-[#0b1c30] mb-1 text-center">
              Continue to CampusMarket
            </h3>
            <p className="text-xs text-[#737686] mb-5 text-center">
              Sign in with your Google account.
              <br></br>
              <span className="text-red-500">Quickly get started</span>
            </p>

            {isGoogleSignInConfigured ? (
              <button
                type="button"
                onClick={handleGoogle}
                disabled={busy}
                className="w-full h-11 rounded-xl border border-[#c3c6d7] bg-white hover:bg-[#f8f9ff] text-[#0b1c30] font-semibold text-sm flex items-center justify-center gap-2.5 disabled:opacity-50 transition-colors"
              >
                <GoogleIcon className="w-4 h-4" />
                <span>Continue with Google</span>
              </button>
            ) : (
              /*
               * Load-bearing, not defensive padding. Google is now the only way
               * in, so an unconfigured build is a locked door - and the version
               * of this that rendered nothing at all produced a modal with a
               * heading, a footer, and no way to sign in, which read as a bug in
               * the site rather than a missing setting. Say which setting.
               */
              <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-3 text-xs text-amber-900">
                <p className="font-semibold mb-1">Sign-in is unavailable</p>
                <p>
                  This build has no Google sign-in configuration, so there is no way to
                  log in. Whoever deployed it needs to set the{' '}
                  <code className="font-mono">VITE_FIREBASE_*</code> environment variables
                  and redeploy — they are read when the site is built, not when it runs.
                </p>
              </div>
            )}
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

        {/* ------------------------------------ Google: finish setting up */}
        {mode === 'profile' && (
          <form onSubmit={handleCompleteProfile} className="space-y-4">
            <p className="text-sm text-[#434655]">
              Signed in as <span className="font-semibold text-[#0b1c30]">{email}</span>. A few quick
              questions and you're in.
            </p>
            {accountTypePicker}
            {zonePicker}

            {/* Appears with the choice it belongs to. A buyer is not asked to
                accept seller terms, and a seller cannot miss them. */}
            {accountType === 'SELLER' && (
              <SellerTermsConsent
                accepted={acceptedTerms}
                onChange={setAcceptedTerms}
                disabled={busy}
                invalid={!!error && !acceptedTerms}
              />
            )}

            {/* Required, and said so plainly. Nothing here is payment or
                delivery - the number exists so the two of you can find each
                other at a handover that happens in person, which is why the
                hint says what it is FOR rather than just demanding it. Asking
                for something mandatory without saying why is what makes a
                signup form feel like it is collecting data on you. */}
            <Field label="Phone number">
              {/* aria-required rather than required: the native attribute
                  would block submit with the browser's own "please fill out
                  this field" bubble, which says nothing about why the number
                  is wanted - and would pre-empt the message below, which
                  does. Every other rule on this form is checked the same way,
                  into the one error banner. */}
              <input
                type="tel"
                aria-required="true"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+260 97 123 4567"
                autoComplete="tel"
                inputMode="tel"
                aria-invalid={!!error && !phone.trim()}
                className="input-base text-sm"
              />
              <p className="mt-1 text-[11px] text-[#737686]">
                Shared only with someone you're trading with, so you can meet up.
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

/**
 * The waiting state of Google sign-in.
 *
 * aria-live so it is announced rather than only seen - the person who most
 * needs to be told the site is working is the one who cannot watch a spinner.
 */
const GoogleProgress: React.FC<{ phase: 'popup' | 'redirecting' | 'exchange' }> = ({ phase }) => {
  const copy = {
    popup: {
      title: 'Waiting for Google…',
      detail: 'Choose your account in the Google window. We pick things up from there.' },
    redirecting: {
      title: 'Taking you to Google…',
      detail: 'Your browser is opening the Google sign-in page.' },
    /* Deliberately vague about which of the two it is. The server answers
       "existing account" and "brand-new account" through the same call, so
       promising a setup step we might not show would be worse than this. */
    exchange: {
      title: 'Signing you in…',
      detail: 'Setting up your CampusMarket account. This only takes a moment.' },
  }[phase];

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col items-center text-center gap-3 py-10"
    >
      <Loader2 className="w-8 h-8 text-[#2563eb] animate-spin" aria-hidden="true" />
      <div>
        <p className="text-sm font-bold text-[#0b1c30]">{copy.title}</p>
        <p className="mt-1 text-xs text-[#737686] max-w-[16rem]">{copy.detail}</p>
      </div>
    </div>
  );
};

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
