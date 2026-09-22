import React from 'react';
import { MapPin, ShieldCheck, Facebook, MessageCircle, Music2 } from 'lucide-react';
import { ViewType } from '../../types';
import { GUEST_ALLOWED } from './navShared';

interface SiteFooterProps {
  currentView: ViewType;
  onNavigate: (view: ViewType) => void;
  onOpenAuthModal: () => void;
  isGuest: boolean;
}

/**
 * Views that own the whole viewport, where a footer would be an interruption
 * rather than a landing place.
 *
 * <p>Sell is a form someone is part-way through; the messages and cart screens
 * are working surfaces with their own bottom-anchored controls, and a footer
 * under them competes for the same thumb. Everything else - browse, search, a
 * listing, a profile - ends, and something should be there when it does.
 */
const HIDES_FOOTER: ViewType[] = ['sell', 'messages', 'cart', 'admin', 'notFound'];

interface FooterLink {
  label: string;
  view: ViewType;
}

const DISCOVER: FooterLink[] = [
  { label: 'Browse listings', view: 'browse' },
  { label: 'Search', view: 'search' },
  { label: 'Saved items', view: 'saved' },
  { label: 'Deal history', view: 'deals' },
];

const ACCOUNT: FooterLink[] = [
  { label: 'My orders', view: 'orders' },
  { label: 'My listings', view: 'my-listings' },
  { label: 'Sell an item', view: 'sell' },
  { label: 'Profile', view: 'profile' },
];

const SUPPORT: FooterLink[] = [
  { label: 'Help & support', view: 'support' },
  { label: 'Terms & safety', view: 'legal' },
];

/**
 * Where the marketplace lives off-platform.
 *
 * <p>Placeholders until the real handles are supplied - each is a single
 * string to change. A link is only rendered when its `url` is set, so an
 * unfilled one is absent rather than sending people to a dead page.
 */
const SOCIAL_LINKS: { label: string; url: string; icon: React.ReactNode; hover: string }[] = [
  {
    label: 'Facebook',
    url: 'https://www.facebook.com/profile.php?id=61593716265353&mibextid=wwXIfr&mibextid=wwXIfr',
    hover: 'hover:text-[#1877f2] hover:border-[#1877f2]',
    icon: <Facebook className="w-4 h-4" />,
  },
  {
    label: 'WhatsApp channel',
    url: 'https://whatsapp.com/channel/0029Vb7qiIlADTO5fqOBq91s',
    hover: 'hover:text-[#25d366] hover:border-[#25d366]',
    icon: <MessageCircle className="w-4 h-4" />,
  },
  {
    label: 'TikTok',
    url: 'https://www.tiktok.com/@campus.market.mu',
    hover: 'hover:text-[#0b1c30] hover:border-[#0b1c30]',
    icon: <Music2 className="w-4 h-4" />,
  },
];

/**
 * Site footer.
 *
 * <p>Deliberately quiet: this is a marketplace people use on a phone between
 * lectures, not a corporate site, so it carries the handful of destinations
 * that are otherwise buried behind an account menu - plus the safety line,
 * which is the one piece of guidance worth repeating on every page.
 */
export const SiteFooter: React.FC<SiteFooterProps> = ({
  currentView,
  onNavigate,
  onOpenAuthModal,
  isGuest,
}) => {
  if (HIDES_FOOTER.includes(currentView)) return null;

  /* A guest tapping "My orders" gets the sign-in prompt rather than a dead
     link, matching how the rest of the navigation treats them. */
  const go = (view: ViewType) => {
    if (isGuest && !GUEST_ALLOWED.includes(view)) {
      onOpenAuthModal();
      return;
    }
    onNavigate(view);
  };

  const column = (heading: string, links: FooterLink[]) => (
    <div>
      <h3 className="text-[11px] font-bold text-[#a0a3b1] uppercase tracking-wider mb-3">
        {heading}
      </h3>
      <ul className="space-y-2">
        {links.map((l) => (
          <li key={l.label}>
            <button
              onClick={() => go(l.view)}
              className="text-sm text-[#434655] hover:text-[#2563eb] transition-colors duration-150 text-left"
            >
              {l.label}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    /* pb-28 on mobile clears the fixed bottom nav, which would otherwise sit
       on top of the last row of links. */
    <footer className="mt-16 border-t border-[#e5eeff] bg-white pb-28 lg:pb-0">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-8 lg:gap-6">
          {/* Brand + the safety reminder, given the width it deserves */}
          <div className="col-span-2">
            <button
              onClick={() => onNavigate('browse')}
              className="flex items-center gap-2.5 group"
              aria-label="CampusMarket home"
            >
              <img
                src="/images/logo.png"
                alt=""
                width={32}
                height={32}
                className="w-8 h-8 object-contain rounded-lg group-hover:scale-105 transition-transform duration-150"
              />
              <span className="font-extrabold text-[#0b1c30] tracking-tight">Campus Market</span>
            </button>
            <p className="text-sm text-[#737686] mt-3 max-w-xs leading-relaxed">
              Buy, sell and trade with students you can actually meet.
            </p>
            <div className="flex items-start gap-2 mt-4 max-w-xs">
              <ShieldCheck className="w-4 h-4 text-[#007d55] mt-0.5 shrink-0" />
              <p className="text-xs text-[#434655] leading-relaxed">
                Meet in busy, public spots and keep payment until the item is in your hands.
              </p>
            </div>

            {/* Outside links, so they open in a new tab and cannot hand the
                destination any influence over this page (noopener). */}
            <div className="mt-5">
              <p className="text-[11px] font-bold text-[#a0a3b1] uppercase tracking-wider mb-2.5">
                Follow us
              </p>
              <div className="flex items-center gap-2">
                {SOCIAL_LINKS.filter((s) => s.url).map((s) => (
                  <a
                    key={s.label}
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={s.label}
                    title={s.label}
                    className={`w-9 h-9 rounded-xl border border-[#c3c6d7] text-[#737686] flex items-center justify-center transition-colors duration-150 ${s.hover}`}
                  >
                    {s.icon}
                  </a>
                ))}
              </div>
            </div>
          </div>

          {column('Discover', DISCOVER)}
          {column('Your account', ACCOUNT)}
          {column('Help', SUPPORT)}
        </div>

        <div className="mt-10 pt-6 border-t border-[#eff4ff] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <p className="text-xs text-[#a0a3b1]">
            © {new Date().getFullYear()} QuickBine. Built for campus.
          </p>
          <p className="text-xs text-[#a0a3b1] flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-[#b4c5ff]" />
            Shop smart, save time.
          </p>
        </div>
      </div>
    </footer>
  );
};
