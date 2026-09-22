import React from 'react';
import { ShoppingBag, Briefcase, Utensils, X, Sparkles } from 'lucide-react';
import type { Intent } from '../../services/intent';

interface IntentPickerProps {
  /** Applies the answer to the feed and remembers it. */
  onChoose: (intent: Intent) => void;
}

const OPTIONS: {
  key: Exclude<Intent, 'browsing'>;
  label: string;
  hint: string;
  icon: React.ReactNode;
  tone: string;
}[] = [
  {
    key: 'Product',
    label: 'Stuff to buy',
    hint: 'Textbooks, furniture, tech',
    icon: <ShoppingBag className="w-5 h-5" />,
    tone: 'hover:border-[#2563eb] hover:bg-[#eff4ff] hover:text-[#2563eb]',
  },
  {
    key: 'Service',
    label: 'Someone to help',
    hint: 'Tutors, repairs, rides',
    icon: <Briefcase className="w-5 h-5" />,
    tone: 'hover:border-[#8455ef] hover:bg-[#f3ecff] hover:text-[#8455ef]',
  },
  {
    key: 'Food',
    label: 'Something to eat',
    hint: 'Home-cooked and campus meals',
    icon: <Utensils className="w-5 h-5" />,
    tone: 'hover:border-[#007d55] hover:bg-[#e6f9f1] hover:text-[#007d55]',
  },
];

/**
 * The one question worth asking a first-time visitor.
 *
 * <p>Inline in the feed rather than a modal or a tooltip, for three reasons.
 * It does not block anything, so someone who wants to scroll past simply
 * scrolls past. It does not compete with the onboarding tour, which owns the
 * overlay layer and permits only one step on screen at a time. And it sits
 * directly above the results it changes, so the effect of answering is visible
 * in the same glance - a modal would dismiss itself and leave the person
 * wondering what just happened.
 *
 * <p>Shown once. "Just browsing" is a real answer that is stored like any
 * other, so declining is permanent rather than a question that returns on the
 * next visit.
 */
export const IntentPicker: React.FC<IntentPickerProps> = ({ onChoose }) => (
  <section
    className="mb-7 rounded-3xl border border-[#dbe1ff] bg-gradient-to-br from-white to-[#f4f7ff] p-5 shadow-card animate-fade-in"
    aria-labelledby="intent-heading"
  >
    <div className="flex items-start justify-between gap-3 mb-4">
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wider text-[#2563eb] mb-1">
          <Sparkles className="w-3 h-3" />
          First time here
        </p>
        <h2 id="intent-heading" className="text-base sm:text-lg font-bold text-[#0b1c30]">
          What are you looking for?
        </h2>
        <p className="text-xs text-[#737686] mt-0.5">
          Pick one and the feed starts there. You can change it any time.
        </p>
      </div>
      <button
        onClick={() => onChoose('browsing')}
        aria-label="Dismiss - just browsing"
        className="shrink-0 p-1.5 -mr-1 -mt-1 rounded-full text-[#a0a3b1] hover:text-[#0b1c30] hover:bg-white transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
    </div>

    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
      {OPTIONS.map((o) => (
        <button
          key={o.key}
          onClick={() => onChoose(o.key)}
          className={`flex items-center gap-3 p-3.5 rounded-2xl border border-[#e5eeff] bg-white text-left text-[#434655] transition-all duration-150 active:scale-[0.98] hover:-translate-y-0.5 hover:shadow-card ${o.tone}`}
        >
          <span className="shrink-0">{o.icon}</span>
          <span className="min-w-0">
            <span className="block text-sm font-bold">{o.label}</span>
            <span className="block text-[11px] text-[#737686] truncate">{o.hint}</span>
          </span>
        </button>
      ))}
    </div>

    {/* An explicit way out, next to the options rather than only in the
        corner: a dismissal someone has to hunt for reads as a trap. */}
    <button
      onClick={() => onChoose('browsing')}
      className="mt-3 text-[11px] font-semibold text-[#737686] hover:text-[#0b1c30] transition-colors"
    >
      Just browsing, thanks
    </button>
  </section>
);
