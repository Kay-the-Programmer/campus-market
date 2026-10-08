import React from 'react';
import { ShieldCheck } from 'lucide-react';

/**
 * The seller's verification, said on a listing card.
 *
 * <p>It already appeared on the detail page, the public profile and the saved
 * grid - everywhere except the feed, which is the one place a buyer is choosing
 * between strangers. The flag rides on every listing payload, so showing it
 * costs nothing but the pixels.
 *
 * <p>Sits over the photo, bottom-left: the top corners are taken by the type
 * chip and Save, and the bottom-right by the photo count. Callers hide it on a
 * sold or reserved card, where the dark strip covers the same edge and the
 * seller's standing has stopped mattering.
 */
export const VerifiedBadge: React.FC<{
  /** Compact drops the word to just the shield, for the densest grids. */
  compact?: boolean;
  className?: string;
}> = ({ compact = false, className = '' }) => (
  <span
    className={`inline-flex items-center rounded-lg bg-white/95 text-[#0b1c30] font-bold shadow-sm backdrop-blur-[1px] ${compact ? 'p-1' : 'px-2 py-1 text-[10px]'
      } ${className}`}
    title="This seller's student identity has been checked"
  >
    <ShieldCheck className={`text-[#2563eb] ${compact ? 'w-3.5 h-3.5' : 'w-3 h-3 mr-1'}`} />
    {!compact && 'Verified'}
    {compact && <span className="sr-only">Verified seller</span>}
  </span>
);
