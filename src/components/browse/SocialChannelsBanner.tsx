import React from 'react';
import { ExternalLink } from 'lucide-react';
import { LIVE_SOCIAL_CHANNELS } from '../../data/socialChannels';

/**
 * "Follow Campus Market" - the three off-platform channels, each a tap away.
 *
 * <p>This is read on the phone it is acted on, so a link is the whole
 * interaction: tap, the app opens, you are in. Nothing here needs to survive
 * leaving the screen.
 *
 * <p>The channels themselves are hardcoded - see data/socialChannels, which the
 * footer reads too, so the two cannot drift apart.
 */

interface SocialChannelsBannerProps {
  /** Layout classes from the caller, e.g. the margin above it in the feed. */
  className?: string;
}

export const SocialChannelsBanner: React.FC<SocialChannelsBannerProps> = ({ className = '' }) => {
  const channels = LIVE_SOCIAL_CHANNELS;
  if (channels.length === 0) return null;

  return (
    <section
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
          <h2
            id="social-channels-heading"
            className="text-xl sm:text-2xl lg:text-3xl font-extrabold text-white leading-tight tracking-tight"
            style={{ textWrap: 'balance' }}
          >
            Get the listings before the feed does.
          </h2>
          <p className="mt-1.5 sm:mt-2 text-xs sm:text-sm text-white/85 leading-relaxed">
            Join Campus Market where you already are.
          </p>
        </div>

        <ul className="mt-5 sm:mt-6 grid gap-3 sm:grid-cols-3 sm:gap-4">
          {channels.map((channel) => (
            <li
              key={channel.id}
              className="flex flex-col rounded-xl bg-white/95 backdrop-blur-sm p-3.5 sm:p-4 ring-1 ring-white/25"
            >
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

              {/* flex-1 on the copy rather than mt-auto on the button: the
                  blurbs are different lengths, and this is what keeps the three
                  buttons on one line across the row. */}
              <p className="mt-3 flex-1 text-xs text-[#434655] leading-relaxed">{channel.blurb}</p>

              {/* Outside links: a new tab, and no influence over this page from
                  the destination (noopener). */}
              <a
                href={channel.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Join Campus Market on ${channel.label}`}
                className="mt-3 sm:mt-4 inline-flex items-center justify-center gap-1.5 w-full px-4 py-2 rounded-full text-xs font-bold text-white shadow-sm hover:shadow-md hover:scale-[1.02] active:scale-95 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#0b1c30]"
                style={{ backgroundColor: channel.brand }}
              >
                Join
                <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
};
