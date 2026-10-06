import React, { useEffect, useRef, useState } from 'react';
import { ExternalLink, QrCode } from 'lucide-react';
import { SocialChannel, LIVE_SOCIAL_CHANNELS } from '../../data/socialChannels';

/**
 * "Follow Campus Market" - the three off-platform channels, with a join link
 * and a scannable code for each.
 *
 * <p>The code is the point of the banner. Most of the time this is read on the
 * phone it would be scanned with, where a code is useless to its own
 * reader - but it is exactly what you hold up to the person across the table,
 * or photograph for a group chat, or project in a lecture theatre, and the
 * links alone could never do that. So both are offered: the button for the
 * person holding the phone, the code for everybody they show it to.
 *
 * <p>The channels themselves are hardcoded - see data/socialChannels, which the
 * footer reads too, so the two cannot drift apart.
 */

/** How wide the codes are generated, independent of how wide they are drawn. */
const QR_PIXELS = 320;

/** The code's ink. The navy the rest of the marketplace is drawn in. */
const QR_INK = '#0b1c30';

/**
 * Renders a scannable PNG for each channel, once the banner is near the
 * viewport.
 *
 * <p>Deferred twice over, because this sits at the foot of the landing page and
 * nothing about it belongs on that page's critical path: the encoder is
 * imported dynamically rather than bundled, and the import only happens once an
 * observer says the banner is coming into view. Someone who never scrolls that
 * far pays nothing at all.
 *
 * <p>Returns an empty record until the codes exist, and keeps returning one if
 * the encoder fails - the banner then draws its buttons and no code boxes,
 * which is a smaller banner rather than a broken one.
 */
function useChannelQrCodes(
  channels: readonly SocialChannel[],
  host: React.RefObject<HTMLElement | null>,
) {
  const [codes, setCodes] = useState<Record<string, string>>({});
  /* The urls, as one string, so the effect re-runs when a handle changes but
     not when the array is merely rebuilt. */
  const key = channels.map((c) => c.url).join('|');
  /** Guards against a second render generating the same codes again. */
  const generated = useRef<string | null>(null);

  useEffect(() => {
    const node = host.current;
    if (!node || !key || generated.current === key) return;
    let alive = true;

    const generate = async () => {
      generated.current = key;
      try {
        const QRCode = (await import('qrcode')).default;
        const pairs = await Promise.all(channels.map(async (c) => [
          c.id,
          await QRCode.toDataURL(c.url, {
            width: QR_PIXELS,
            /* Two modules of quiet zone rather than the specification's four:
               the code is drawn on its own white plate here, which already
               surrounds it with the margin a scanner needs, so the rest of the
               box is better spent on modules at this size. */
            margin: 2,
            errorCorrectionLevel: 'M',
            color: { dark: QR_INK, light: '#ffffff' },
          }),
        ] as const));
        if (alive) setCodes(Object.fromEntries(pairs));
      } catch {
        /* No code, no banner-wide failure. Allow a later attempt in case this
           was a chunk that failed to load rather than a browser that cannot. */
        generated.current = null;
      }
    };

    /* Without an observer there is nothing to wait for, so the codes are drawn
       at once rather than never - the deferral is an optimisation, and an
       optimisation that can remove the feature is a bug. */
    if (typeof IntersectionObserver === 'undefined') {
      generate();
      return () => { alive = false; };
    }

    const observer = new IntersectionObserver((entries) => {
      if (!entries[0].isIntersecting) return;
      observer.disconnect();
      generate();
    }, { rootMargin: '400px 0px' });
    observer.observe(node);

    return () => { alive = false; observer.disconnect(); };
  }, [channels, key, host]);

  return codes;
}

interface SocialChannelsBannerProps {
  /** Layout classes from the caller, e.g. the margin above it in the feed. */
  className?: string;
}

export const SocialChannelsBanner: React.FC<SocialChannelsBannerProps> = ({ className = '' }) => {
  const channels = LIVE_SOCIAL_CHANNELS;
  const hostRef = useRef<HTMLElement>(null);
  const codes = useChannelQrCodes(channels, hostRef);

  if (channels.length === 0) return null;

  return (
    <section
      ref={hostRef}
      aria-labelledby="social-channels-heading"
      className={`relative isolate overflow-hidden rounded-2xl shadow-card bg-[#0b1c30] ${className}`}
    >
      {/* The same glow the promo banners carry, so this reads as one of the
          family rather than a block bolted onto the end of the feed. */}
      <div
        className="absolute -top-16 -left-10 w-48 h-48 rounded-full bg-white/10 blur-2xl pointer-events-none"
        aria-hidden="true"
      />

      <div className="relative z-10 px-5 py-6 sm:px-8 sm:py-8">
        <div className="max-w-xl">
          <span className="inline-flex items-center gap-1.5 mb-2 px-2.5 py-0.5 rounded-full bg-white/85 text-[#0b1c30] text-[10px] font-bold uppercase tracking-wider">
            <QrCode className="w-3 h-3" aria-hidden="true" />
            Scan or tap
          </span>
          <h2
            id="social-channels-heading"
            className="text-xl sm:text-2xl lg:text-3xl font-extrabold text-white leading-tight tracking-tight"
            style={{ textWrap: 'balance' }}
          >
            Get the listings before the feed does.
          </h2>
          <p className="mt-1.5 sm:mt-2 text-xs sm:text-sm text-white/85 leading-relaxed">
            Join Campus Market where you already are. Scan a code to send it to someone else.
          </p>
        </div>

        <ul className="mt-5 sm:mt-6 grid gap-3 sm:grid-cols-3 sm:gap-4">
          {channels.map((channel) => {
            const code = codes[channel.id];
            return (
              <li
                key={channel.id}
                className="flex items-center gap-4 sm:flex-col sm:items-stretch sm:gap-0 rounded-xl bg-white/95 backdrop-blur-sm p-3.5 sm:p-4 ring-1 ring-white/25"
              >
                {/* ── Who it is, and what is posted there ──────────────── */}
                <div className="min-w-0 flex-1 sm:flex-none">
                  <div className="flex items-center gap-2.5">
                    <span
                      className="w-8 h-8 rounded-full flex items-center justify-center text-white shrink-0"
                      style={{ backgroundColor: channel.brand }}
                      aria-hidden="true"
                    >
                      <channel.icon className="w-4 h-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-[#0b1c30] truncate">{channel.label}</p>
                      <p className="text-[11px] text-[#737686] truncate">{channel.handle}</p>
                    </div>
                  </div>
                  {/* The blurb is the first thing to go when there is no room:
                      on a phone the card is a row, and three lines of copy
                      beside a code would push the button off it. */}
                  <p className="hidden sm:block mt-3 text-xs text-[#434655] leading-relaxed">
                    {channel.blurb}
                  </p>

                  {/* Outside links: a new tab, and no influence over this page
                      from the destination (noopener). */}
                  <a
                    href={channel.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Join Campus Market on ${channel.label}`}
                    className="mt-3 inline-flex items-center justify-center gap-1.5 w-full px-4 py-2 rounded-full text-xs font-bold text-white shadow-sm hover:shadow-md hover:scale-[1.02] active:scale-95 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#0b1c30]"
                    style={{ backgroundColor: channel.brand }}
                  >
                    Join
                    <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                  </a>
                </div>

                {/* ── The code ─────────────────────────────────────────────
                     A fixed box whether or not the image has arrived, so the
                     card does not jump as the codes finish generating. On a
                     phone it sits beside the copy; above sm it goes under it,
                     where there is width to give it. ── */}
                <div className="shrink-0 sm:mt-4 sm:pt-4 sm:border-t sm:border-[#eff4ff] sm:flex sm:flex-col sm:items-center">
                  <div className="w-[4.5rem] h-[4.5rem] sm:w-28 sm:h-28 rounded-lg bg-white ring-1 ring-[#e5eeff] p-1.5 sm:p-2">
                    {code ? (
                      <img
                        src={code}
                        alt={`QR code linking to the Campus Market ${channel.label}`}
                        width={QR_PIXELS}
                        height={QR_PIXELS}
                        className="w-full h-full"
                      />
                    ) : (
                      <div
                        className="w-full h-full rounded bg-[#eff4ff] cm-shimmer"
                        aria-hidden="true"
                      />
                    )}
                  </div>
                  <p className="hidden sm:block mt-2 text-[10px] font-semibold text-[#a0a3b1] uppercase tracking-wider">
                    Scan to join
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
};
