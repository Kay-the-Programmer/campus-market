import React, { useEffect, useState } from 'react';
import { BellRing, BellOff, Loader2, Check, X } from 'lucide-react';
import { NotificationPreferences } from '../../types';
import { api } from '../../services/api';
import {
  disablePush,
  enablePush,
  getPushPermission,
  isPushAvailable,
  isPushEnabledHere,
  type PushPermission,
} from '../../services/push';
import { useToast } from './ToastProvider';
import { readStored, writeStored } from '../../utils/storage';

/**
 * The push opt-in prompt and the settings panel behind it.
 *
 * Both live here because they answer the same question from different angles -
 * "do you want notifications on this device?" and "which ones?" - and they have
 * to stay consistent about a state neither of them owns: browser permission,
 * which the user can change from the address bar at any time.
 */

const DISMISS_KEY = 'cm_push_prompt_dismissed';

/** Permission cannot be re-requested once denied, so asking again is pointless. */
function canPrompt(permission: PushPermission) {
  return permission === 'default';
}

interface PushOptInProps {
  /** Hidden for guests: there is no account to attach a device to. */
  visible?: boolean;
}

/**
 * The banner on the notifications screen. It stays silent when push is
 * unsupported, unconfigured, or already on - there is nothing to ask for.
 *
 * Being *blocked* is the exception. The browser will not re-prompt once someone
 * has denied permission, and a silent screen in that state is indistinguishable
 * from a broken feature, so it says so plainly instead of pretending the option
 * does not exist. Either version can be dismissed for good.
 */
export const PushOptIn: React.FC<PushOptInProps> = ({ visible = true }) => {
  const toast = useToast();
  const [permission, setPermission] = useState<PushPermission>(() => getPushPermission());
  const [enabledHere, setEnabledHere] = useState(() => isPushEnabledHere());
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState(() => readStored(DISMISS_KEY) === 'true');

  // Permission can be changed from the address bar at any time, and the tab is
  // not told. Re-reading on focus keeps the banner honest without polling.
  useEffect(() => {
    const sync = () => {
      setPermission(getPushPermission());
      setEnabledHere(isPushEnabledHere());
    };
    window.addEventListener('focus', sync);
    return () => window.removeEventListener('focus', sync);
  }, []);

  const blocked = permission === 'denied';

  if (!visible || !isPushAvailable() || enabledHere || dismissed || (!blocked && !canPrompt(permission))) {
    return null;
  }

  const handleEnable = async () => {
    setBusy(true);
    const result = await enablePush();
    setBusy(false);
    setPermission(result.permission);
    setEnabledHere(isPushEnabledHere());
    if (result.ok) {
      toast.success('Push notifications are on for this device.');
    } else if (result.error) {
      toast.error(result.error);
    }
  };

  const handleDismiss = () => {
    writeStored(DISMISS_KEY, 'true');
    setDismissed(true);
  };

  /**
   * Nothing here can undo a block - only the browser's own site settings can,
   * which is why this offers instructions rather than a button that would do
   * nothing. requestPermission() resolves instantly with "denied" forever.
   */
  if (blocked) {
    return (
      <div className="bg-white border border-[#e5eeff] rounded-2xl p-4 mb-4 flex items-start gap-3.5 shadow-card">
        <div className="w-9 h-9 rounded-xl bg-[#f1f2f7] flex items-center justify-center shrink-0">
          <BellOff className="w-[18px] h-[18px] text-[#737686]" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-bold text-[#0b1c30] text-sm">Notifications are blocked for this site</h3>
          <p className="text-xs text-[#434655] mt-0.5 leading-relaxed">
            Your browser is set to block notifications here, so we can't ask again. Click the
            padlock (or the bell icon) next to the address bar, allow notifications, then reload
            this page.
          </p>
        </div>
        <button
          onClick={handleDismiss}
          aria-label="Dismiss"
          className="p-1 rounded-lg text-[#a0a3b1] hover:text-[#434655] hover:bg-[#f1f2f7] shrink-0 transition-colors duration-150"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white border border-[#dbe1ff] rounded-2xl p-4 mb-4 flex items-start gap-3.5 shadow-card">
      <div className="w-9 h-9 rounded-xl bg-[#eff4ff] flex items-center justify-center shrink-0">
        <BellRing className="w-[18px] h-[18px] text-[#2563eb]" />
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="font-bold text-[#0b1c30] text-sm">Get notified when it matters</h3>
        <p className="text-xs text-[#434655] mt-0.5 leading-relaxed">
          Messages, order updates and price drops on things you saved — even when this tab is closed.
        </p>
        <div className="flex items-center gap-2 mt-3">
          <button
            onClick={handleEnable}
            disabled={busy}
            className="px-3.5 py-1.5 rounded-full bg-[#2563eb] text-white text-xs font-bold hover:bg-[#1d4ed8] disabled:opacity-60 transition-colors duration-150 flex items-center gap-1.5"
          >
            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Turn on notifications
          </button>
          <button
            onClick={handleDismiss}
            className="px-3 py-1.5 rounded-full text-xs font-bold text-[#737686] hover:bg-[#f1f2f7] transition-colors duration-150"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
};

/**
 * What a user cares about, shared by push and email.
 *
 * <p>These are categories of activity, not channels. The same row governs
 * whether an order update reaches a phone and whether it reaches an inbox,
 * which is why the block is no longer nested under the push switch - doing
 * that implied turning push off also stopped the emails.
 *
 * <p>`systemUpdates` was labelled "Announcements", which now collides with the
 * marketing toggle below it. Renamed to say what it actually covers: notices
 * the app generates about the service, not mail an admin composed.
 */
const TOGGLES: { key: keyof NotificationPreferences; label: string; hint: string }[] = [
  { key: 'messages', label: 'Messages', hint: 'Someone replies in a chat thread.' },
  { key: 'orders', label: 'Orders', hint: 'Order placed, accepted, ready for pickup or cancelled.' },
  { key: 'reviews', label: 'Reviews', hint: 'A trade completes and a review is left for you.' },
  {
    key: 'priceDrops',
    label: 'Saved items',
    // Covers PRICE_DROP and SAVED_UPDATE both. The field is still called
    // priceDrops server-side; the label says what it actually governs.
    hint: 'Something you saved gets cheaper, sells, or comes back in stock.',
  },
  { key: 'systemUpdates', label: 'Service notices', hint: 'Changes to your account or the service.' },
];

const Switch: React.FC<{ on: boolean; disabled?: boolean; onChange: () => void; label: string }> = ({
  on, disabled, onChange, label,
}) => (
  <button
    role="switch"
    aria-checked={on}
    aria-label={label}
    disabled={disabled}
    onClick={onChange}
    className={`relative w-10 h-6 rounded-full shrink-0 transition-colors duration-150 disabled:opacity-40 ${
      on ? 'bg-[#2563eb]' : 'bg-[#c3c6d7]'
    }`}
  >
    <span
      className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform duration-150 ${
        on ? 'translate-x-4' : ''
      }`}
    />
  </button>
);

/**
 * The settings panel. Preferences are per-account and follow the user to every
 * device; permission is per-device and cannot. Keeping both in one panel is the
 * only way the combination stays explicable - a user with push allowed on their
 * phone and blocked on this laptop should not have to guess why it is quiet.
 */
export const NotificationSettings: React.FC = () => {
  const toast = useToast();
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [permission, setPermission] = useState<PushPermission>(() => getPushPermission());
  const [enabledHere, setEnabledHere] = useState(() => isPushEnabledHere());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.notifications.getPreferences().then((res) => {
      if (cancelled) return;
      if (res.preferences) setPreferences(res.preferences);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const save = async (key: keyof NotificationPreferences, value: boolean) => {
    if (!preferences) return;
    const previous = preferences;
    // Optimistic: a toggle that lags behind the finger feels broken. Rolled back
    // below if the server disagrees.
    setPreferences({ ...preferences, [key]: value });
    setSaving(key);
    const res = await api.notifications.updatePreferences({ [key]: value });
    setSaving(null);
    if (res.preferences) {
      setPreferences(res.preferences);
    } else {
      setPreferences(previous);
      toast.error(res.error || 'Could not save that setting.');
    }
  };

  const handleDeviceToggle = async () => {
    setBusy(true);
    if (enabledHere) {
      await disablePush();
      toast.info('Push notifications are off for this device.');
    } else {
      const result = await enablePush();
      setPermission(result.permission);
      if (result.ok) toast.success('Push notifications are on for this device.');
      else if (result.error) toast.error(result.error);
    }
    setEnabledHere(isPushEnabledHere());
    setBusy(false);
    // Device count moved; re-read rather than guess.
    const res = await api.notifications.getPreferences();
    if (res.preferences) setPreferences(res.preferences);
  };

  if (loading) {
    return (
      <div className="bg-white border border-[#e5eeff] rounded-3xl p-6 shadow-card">
        <div className="h-4 w-40 bg-[#f1f2f7] rounded animate-pulse mb-4" />
        <div className="space-y-3">
          {[0, 1, 2].map((i) => <div key={i} className="h-9 bg-[#f8f9ff] rounded-xl animate-pulse" />)}
        </div>
      </div>
    );
  }

  if (!preferences) return null;

  const supported = isPushAvailable();
  const blocked = permission === 'denied';

  return (
    <div className="bg-white border border-[#e5eeff] rounded-3xl p-6 shadow-card">
      <h2 className="text-base font-bold text-[#0b1c30] mb-1">Notifications</h2>
      <p className="text-xs text-[#737686] mb-5">
        These choices follow your account. Everything still appears in your notifications list —
        this only controls what interrupts you.
      </p>

      {/* ── This device ── */}
      {!preferences.pushConfigured ? (
        <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-[#f8f9ff] border border-[#e5eeff] mb-5">
          <BellOff className="w-4 h-4 text-[#737686] mt-0.5 shrink-0" />
          <p className="text-xs text-[#434655] leading-relaxed">
            Push notifications aren't set up on this server yet, so nothing can be sent to your devices.
          </p>
        </div>
      ) : !supported ? (
        <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-[#f8f9ff] border border-[#e5eeff] mb-5">
          <BellOff className="w-4 h-4 text-[#737686] mt-0.5 shrink-0" />
          <p className="text-xs text-[#434655] leading-relaxed">
            This browser can't receive push notifications. Try a recent Chrome, Edge, Firefox or Safari.
          </p>
        </div>
      ) : (
        <div className="flex items-start justify-between gap-4 p-3.5 rounded-2xl bg-[#f8f9ff] border border-[#e5eeff] mb-5">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {enabledHere
                ? <BellRing className="w-4 h-4 text-[#2563eb] shrink-0" />
                : <BellOff className="w-4 h-4 text-[#737686] shrink-0" />}
              <span className="text-sm font-bold text-[#0b1c30]">This device</span>
              {enabledHere && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#007d55] bg-[#e6faf1] px-2 py-0.5 rounded-full">
                  <Check className="w-3 h-3" /> On
                </span>
              )}
            </div>
            <p className="text-xs text-[#737686] mt-1 leading-relaxed">
              {blocked
                ? 'Notifications are blocked for this site. Allow them in your browser settings to turn them back on.'
                : preferences.deviceCount > 0
                  ? `Registered on ${preferences.deviceCount} device${preferences.deviceCount === 1 ? '' : 's'}.`
                  : 'No devices registered yet.'}
            </p>
          </div>
          <button
            onClick={handleDeviceToggle}
            disabled={busy || blocked}
            className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-bold transition-colors duration-150 disabled:opacity-50 flex items-center gap-1.5 ${
              enabledHere
                ? 'text-[#434655] bg-white border border-[#e5eeff] hover:bg-[#f1f2f7]'
                : 'text-white bg-[#2563eb] hover:bg-[#1d4ed8]'
            }`}
          >
            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {enabledHere ? 'Turn off' : 'Turn on'}
          </button>
        </div>
      )}

      {/* ── Channel master switches ── */}
      <p className="text-[11px] font-bold uppercase tracking-wide text-[#a0a3b1] mb-1">
        How we reach you
      </p>

      <div className="flex items-center justify-between gap-4 py-3 border-b border-[#eef1fa]">
        <div className="min-w-0">
          <p className="text-sm font-bold text-[#0b1c30]">Push notifications</p>
          <p className="text-xs text-[#737686] mt-0.5">Every device on your account.</p>
        </div>
        <Switch
          label="Push notifications"
          on={preferences.pushEnabled}
          disabled={saving === 'pushEnabled'}
          onChange={() => save('pushEnabled', !preferences.pushEnabled)}
        />
      </div>

      <div className="flex items-center justify-between gap-4 py-3 border-b border-[#eef1fa]">
        <div className="min-w-0">
          <p className="text-sm font-bold text-[#0b1c30]">Email</p>
          <p className="text-xs text-[#737686] mt-0.5">
            {preferences.emailConfigured
              ? 'Sent to the address on your account.'
              : 'Email isn’t set up on this server yet, so nothing can be sent.'}
          </p>
        </div>
        <Switch
          label="Email notifications"
          on={preferences.emailEnabled && preferences.emailConfigured}
          /*
           * Disabled rather than hidden when the server has no SMTP. A toggle
           * that silently does nothing is the failure this codebase already
           * avoids for push, and the hint above says which it is.
           */
          disabled={saving === 'emailEnabled' || !preferences.emailConfigured}
          onChange={() => save('emailEnabled', !preferences.emailEnabled)}
        />
      </div>

      {/* ── Categories, shared by both channels ── */}
      <p className="text-[11px] font-bold uppercase tracking-wide text-[#a0a3b1] mt-5 mb-1">
        What to tell you about
      </p>

      {/*
        Dimmed only when BOTH channels are off, not when push is. These rows
        are shared, so gating them on pushEnabled alone would have shown email
        categories as unavailable to someone who had deliberately chosen email
        over push.
      */}
      <div
        className={
          preferences.pushEnabled || (preferences.emailEnabled && preferences.emailConfigured)
            ? ''
            : 'opacity-50 pointer-events-none'
        }
      >
        {TOGGLES.map(({ key, label, hint }) => (
          <div key={key} className="flex items-center justify-between gap-4 py-3 border-b border-[#eef1fa] last:border-0">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[#0b1c30]">{label}</p>
              <p className="text-xs text-[#737686] mt-0.5">{hint}</p>
            </div>
            <Switch
              label={label}
              on={preferences[key] as boolean}
              disabled={saving === key}
              onChange={() => save(key, !(preferences[key] as boolean))}
            />
          </div>
        ))}
      </div>

      {/* ── Marketing, deliberately apart from everything above ── */}
      <p className="text-[11px] font-bold uppercase tracking-wide text-[#a0a3b1] mt-5 mb-1">
        Announcements
      </p>

      <div className="flex items-center justify-between gap-4 py-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[#0b1c30]">Announcements and offers</p>
          <p className="text-xs text-[#737686] mt-0.5">
            Occasional email about CampusMarket. Turning this off never affects email about
            your own orders and messages.
          </p>
        </div>
        <Switch
          label="Announcements and offers"
          on={preferences.marketingEmails && preferences.emailConfigured}
          disabled={saving === 'marketingEmails' || !preferences.emailConfigured}
          onChange={() => save('marketingEmails', !preferences.marketingEmails)}
        />
      </div>

      <p className="text-[11px] text-[#a0a3b1] mt-4 leading-relaxed">
        Everything still appears in your notifications list either way. Account and moderation
        notices are always sent on any channel you have on — they explain actions taken on your
        account, so they can't be switched off separately.
      </p>
    </div>
  );
};
