/**
 * Where Campus Market lives off-platform.
 *
 * <p>Hardcoded on purpose. These are three accounts the marketplace itself
 * owns; they do not change per campus, per user or per release, and routing
 * them through the promo admin would mean the footer could silently lose its
 * links because someone unpublished a banner.
 *
 * <p>Two surfaces read this list - the footer's icon row and the browse
 * screen's join banner - which is the whole reason it is a module rather than
 * a literal inside a component. A handle that changes is then one edit, in one
 * file, and the two surfaces cannot disagree about where WhatsApp is.
 *
 * <p>`icon` holds the component, not an element, so each surface picks its own
 * size: the footer draws these at 16px inside a bordered square, the banner at
 * 20px on a coloured disc.
 */

import { Facebook, MessageCircle, Music2, type LucideIcon } from 'lucide-react';

export interface SocialChannel {
  id: 'whatsapp' | 'facebook' | 'tiktok';
  /** The platform, as people call it. Also the link's accessible name. */
  label: string;
  /** The handle as the platform shows it, for recognition over the QR code. */
  handle: string;
  /** One line on what is actually posted there - read on a phone, so short. */
  blurb: string;
  /** Empty string hides the channel everywhere - see `SOCIAL_CHANNELS`. */
  url: string;
  icon: LucideIcon;
  /** The platform's own colour, for its icon and its join button. */
  brand: string;
  /** Tailwind hover classes for the footer's bordered icon buttons. */
  hover: string;
}

/**
 * Every channel, in the order they are offered.
 *
 * <p>WhatsApp leads: it is the one students already have open, and a channel
 * post reaches them without them choosing to visit anything. A link is only
 * rendered when its `url` is set, so an account that does not exist yet is
 * absent rather than sending people to a dead page.
 */
export const SOCIAL_CHANNELS: SocialChannel[] = [
  {
    id: 'whatsapp',
    label: 'WhatsApp channel',
    handle: 'Campus Market',
    blurb: 'New listings and price drops, straight to the app you already have open.',
    url: 'https://whatsapp.com/channel/0029Vb7qiIlADTO5fqOBq91s',
    icon: MessageCircle,
    brand: '#25d366',
    hover: 'hover:text-[#25d366] hover:border-[#25d366]',
  },
  {
    id: 'facebook',
    label: 'Facebook page',
    handle: 'Campus Market',
    blurb: 'Deals, campus notices and the longer posts worth reading twice.',
    url: 'https://www.facebook.com/profile.php?id=61593716265353&mibextid=wwXIfr&mibextid=wwXIfr',
    icon: Facebook,
    brand: '#1877f2',
    hover: 'hover:text-[#1877f2] hover:border-[#1877f2]',
  },
  {
    id: 'tiktok',
    label: 'TikTok',
    handle: '@campus.market.mu',
    blurb: 'Quick looks at what just landed, and how a campus trade actually goes.',
    url: 'https://www.tiktok.com/@campus.market.mu',
    icon: Music2,
    brand: '#0b1c30',
    hover: 'hover:text-[#0b1c30] hover:border-[#0b1c30]',
  },
];

/**
 * The channels with a real destination. Everything rendering reads this.
 *
 * <p>Filtered once, at module load, rather than per render: the list is
 * hardcoded, so there is nothing to recompute - and a fresh array on every
 * render is a new dependency for every effect that watches it, which is a real
 * bug waiting rather than a theoretical one.
 */
export const LIVE_SOCIAL_CHANNELS: readonly SocialChannel[] = SOCIAL_CHANNELS.filter((c) => c.url);
