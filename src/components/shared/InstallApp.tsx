import React, { useEffect, useState } from 'react';
import { Download, Share, Check, X, MonitorDown } from 'lucide-react';
import {
  canPromptInstall,
  isInstalled,
  needsManualInstall,
  onInstallStateChange,
  promptInstall,
} from '../../services/pwa';
import { isIos } from '../../utils/platform';
import { readStored, writeStored } from '../../utils/storage';
import { useToast } from './ToastProvider';

const DISMISS_KEY = 'cm_install_dismissed';

interface InstallAppProps {
  /** Renders the dismissible banner form rather than the settings card. */
  variant?: 'card' | 'banner';
}

/**
 * "Install CampusMarket".
 *
 * <p>One component, two outcomes, because the platforms genuinely differ:
 * Chrome, Edge and Android hand us a real prompt we can replay from a button,
 * and Safari hands us nothing at all. Showing a button that cannot work on
 * iOS would be worse than showing nothing; showing nothing is what the app did
 * before, and it is why an iPhone could not receive notifications.
 *
 * <p>Hides itself entirely once the app is installed - {@link isInstalled}
 * covers both "launched from the Home Screen" and "installed a moment ago in
 * this tab", so the card does not linger after the user has acted on it.
 */
export const InstallApp: React.FC<InstallAppProps> = ({ variant = 'card' }) => {
  const toast = useToast();
  const [, force] = useState(0);
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState(
    () => variant === 'banner' && readStored(DISMISS_KEY) === 'true',
  );

  // beforeinstallprompt can land after this mounts - it fires when the browser
  // finishes assessing the page, not on a schedule we control.
  useEffect(() => onInstallStateChange(() => force((n) => n + 1)), []);

  const promptable = canPromptInstall();
  const manual = needsManualInstall();

  if (isInstalled() || dismissed || (!promptable && !manual)) {
    return null;
  }

  const handleInstall = async () => {
    setBusy(true);
    const outcome = await promptInstall();
    setBusy(false);
    if (outcome === 'accepted') {
      toast.success('CampusMarket is installing.');
    } else if (outcome === 'unavailable') {
      // The saved event is single-use and the browser will not re-issue it
      // in the same session. Saying so beats a button that silently does
      // nothing the second time.
      toast.info('Use your browser menu to install — look for "Install app".');
    }
  };

  const handleDismiss = () => {
    writeStored(DISMISS_KEY, 'true');
    setDismissed(true);
  };

  const wrapper = variant === 'banner'
    ? 'bg-white border border-[#e5eeff] rounded-2xl p-4 mb-4 flex items-start gap-3.5 shadow-card'
    : 'bg-white border border-[#e5eeff] rounded-3xl p-6 shadow-card';

  return (
    <div className={wrapper}>
      {variant === 'banner' && (
        <div className="w-9 h-9 rounded-xl bg-[#eff4ff] flex items-center justify-center shrink-0">
          {manual ? <Share className="w-[18px] h-[18px] text-[#2563eb]" />
            : <Download className="w-[18px] h-[18px] text-[#2563eb]" />}
        </div>
      )}

      <div className="min-w-0 flex-1">
        {variant === 'card' && (
          <div className="flex items-center gap-2 mb-1">
            <MonitorDown className="w-4 h-4 text-[#2563eb]" />
            <h2 className="text-base font-bold text-[#0b1c30]">Install the app</h2>
          </div>
        )}
        {variant === 'banner' && (
          <h3 className="font-bold text-[#0b1c30] text-sm">Install CampusMarket</h3>
        )}

        <p className="text-xs text-[#434655] mt-0.5 leading-relaxed">
          {manual
            ? 'Adds CampusMarket to your device so it opens like any other app — full screen, '
              + 'its own icon, and it can send you notifications.'
            : 'Opens full screen with its own icon, loads faster on a weak connection, and can '
              + 'send you notifications.'}
        </p>

        {manual ? (
          /*
           * Safari exposes no install API on either platform, so this is
           * directions rather than a button. The wording differs because the
           * menu item does - "Add to Home Screen" on iOS, "Add to Dock" in
           * Safari 17 on the Mac - and pointing at the wrong one is the same
           * as pointing at nothing.
           */
          <ol className="mt-2.5 space-y-1 text-xs text-[#434655]">
            <li>
              <span className="font-semibold text-[#0b1c30]">1.</span> Tap the
              {' '}<span className="font-semibold text-[#0b1c30]">Share</span> button in Safari
              {isIos() ? ' (the square with an arrow, at the bottom).' : ' (in the toolbar).'}
            </li>
            <li>
              <span className="font-semibold text-[#0b1c30]">2.</span> Choose
              {' '}<span className="font-semibold text-[#0b1c30]">
                {isIos() ? 'Add to Home Screen' : 'Add to Dock'}
              </span>.
            </li>
            <li>
              <span className="font-semibold text-[#0b1c30]">3.</span> Open CampusMarket from
              {isIos() ? ' your Home Screen' : ' your Dock'} — notifications can be turned on
              from there.
            </li>
          </ol>
        ) : (
          <button
            onClick={handleInstall}
            disabled={busy}
            className="mt-3 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#2563eb] hover:bg-[#004ac6] disabled:opacity-60 text-white text-sm font-bold transition-colors active:scale-[0.99]"
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            {busy ? <Check className="w-4 h-4" /> : <Download className="w-4 h-4" />}
            Install CampusMarket
          </button>
        )}

        {manual && (
          /* The installed app has its own storage - it opens signed out, which
             reads as a bug unless it is said in advance. */
          <p className="text-[11px] text-[#737686] mt-2 leading-relaxed">
            You'll sign in once more the first time you open it — {isIos() ? 'iOS' : 'Safari'}{' '}
            keeps the installed app's data separate.
          </p>
        )}
      </div>

      {variant === 'banner' && (
        <button
          onClick={handleDismiss}
          aria-label="Dismiss"
          className="p-1 rounded-lg text-[#a0a3b1] hover:text-[#434655] hover:bg-[#f1f2f7] shrink-0 transition-colors duration-150"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
};
