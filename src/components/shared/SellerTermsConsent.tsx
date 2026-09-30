import React from 'react';
import { ScrollText } from 'lucide-react';
import { SELLER_TERMS } from '../../data/sellerTerms';

interface SellerTermsConsentProps {
  accepted: boolean;
  onChange: (accepted: boolean) => void;
  /** Set while the application is being submitted, so nothing can be un-ticked mid-flight. */
  disabled?: boolean;
  /**
   * Highlights the box after someone tried to apply without ticking it. The
   * error banner says what is wrong; this says where.
   */
  invalid?: boolean;
}

/**
 * The terms a seller accepts before their application is filed, and the tick
 * box that records it.
 *
 * <p>The full text is here rather than behind a link on purpose. A link is a
 * second tap that almost nobody makes, which leaves "I have read the terms"
 * as a statement everyone knows to be false - and these terms are the thing an
 * admin points at when removing a listing, so they have to have been readable
 * at the moment of agreeing.
 *
 * <p>Scrolls rather than expands so the box cannot push the Apply button off a
 * phone screen: the terms stay on screen next to the decision instead of
 * turning it into a page someone has to scroll back up from.
 */
export const SellerTermsConsent: React.FC<SellerTermsConsentProps> = ({
  accepted,
  onChange,
  disabled = false,
  invalid = false,
}) => (
  <div
    className={`rounded-xl border ${
      invalid ? 'border-red-300 bg-red-50/40' : 'border-[#c3c6d7] bg-[#f8f9ff]'
    }`}
  >
    <div className="flex items-center gap-2 px-3 pt-3 pb-1.5">
      <ScrollText className="w-4 h-4 text-[#434655] shrink-0" />
      <p className="text-xs font-bold text-[#0b1c30]">Seller terms</p>
    </div>

    {/*
      tabIndex makes the scroll area reachable by keyboard. Without it the
      clauses are readable by mouse and by screen reader but unreachable for a
      sighted keyboard user, who would be asked to accept text they cannot
      scroll to.
    */}
    <div
      tabIndex={0}
      role="region"
      aria-label="Seller terms"
      className="max-h-44 overflow-y-auto px-3 pb-2 space-y-2.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb]/40 rounded-lg"
    >
      {SELLER_TERMS.map((clause, i) => (
        <div key={clause.title}>
          <p className="text-[11px] font-bold text-[#434655]">
            {i + 1}. {clause.title}
          </p>
          <p className="text-[11px] leading-snug text-[#737686]">{clause.body}</p>
        </div>
      ))}
    </div>

    <label className="flex items-start gap-2.5 border-t border-[#e5eeff] px-3 py-2.5 cursor-pointer">
      <input
        type="checkbox"
        checked={accepted}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 w-4 h-4 shrink-0 accent-[#007d55] cursor-pointer"
      />
      <span className="text-xs font-semibold text-[#0b1c30]">
        I have read and agree to the seller terms.
      </span>
    </label>
  </div>
);
