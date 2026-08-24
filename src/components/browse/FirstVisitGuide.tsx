import React, { useState } from 'react';
import { MapPin, MessagesSquare, HandCoins, X } from 'lucide-react';
import { readStored, writeStored } from '../../utils/storage';

const DISMISS_KEY = 'cm_first_visit_guide_dismissed';

const STEPS = [
  {
    icon: <MapPin className="w-4 h-4" />,
    title: 'Find it near you',
    body: 'Filter by campus zone so you are not walking across town for a phone charger.',
  },
  {
    icon: <MessagesSquare className="w-4 h-4" />,
    title: 'Agree in chat',
    body: 'Ordering opens a thread with the seller. Sort out where and when there.',
  },
  {
    icon: <HandCoins className="w-4 h-4" />,
    title: 'Pay on handover',
    body: 'Nothing is paid through the app. Money changes hands when the item does.',
  },
];

/**
 * A three-line explanation of how trading here works, for a first visit.
 *
 * <p>Campus trading has rules that are obvious once but opaque before: nothing
 * is paid online, ordering starts a conversation rather than a transaction, and
 * zones decide how far you walk. Someone who assumes this behaves like a
 * regular shop gets a surprise at exactly the wrong moment - after ordering.
 *
 * <p>Shown once and dismissible for good. It sits above the feed rather than
 * over it: a modal on first paint is the thing people close without reading.
 */
export const FirstVisitGuide: React.FC = () => {
  const [dismissed, setDismissed] = useState(
    () => readStored(DISMISS_KEY) === 'true',
  );

  if (dismissed) return null;

  const dismiss = () => {
    writeStored(DISMISS_KEY, 'true');
    setDismissed(true);
  };

  return (
    <section className="mb-6 relative bg-white rounded-2xl border border-[#dbe1ff] shadow-card p-4 sm:p-5">
      <button
        onClick={dismiss}
        aria-label="Dismiss"
        className="absolute top-3 right-3 p-1.5 rounded-lg text-[#a0a3b1] hover:text-[#434655] hover:bg-[#f1f2f7] transition-colors"
      >
        <X className="w-4 h-4" />
      </button>

      <h2 className="text-sm font-bold text-[#0b1c30] mb-3 pr-8">
        New here? This is how it works
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        {STEPS.map((step, i) => (
          <div key={step.title} className="flex items-start gap-2.5">
            <span className="w-8 h-8 rounded-xl bg-[#eff4ff] text-[#2563eb] flex items-center justify-center shrink-0">
              {step.icon}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-bold text-[#0b1c30]">
                <span className="text-[#a0a3b1] mr-1">{i + 1}.</span>
                {step.title}
              </p>
              <p className="text-xs text-[#737686] mt-0.5 leading-relaxed">{step.body}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};
