import React from 'react';
import { ChevronRight, Home } from 'lucide-react';

export interface Crumb {
  label: string;
  /** Omitted on the last crumb, which is where you already are. */
  onClick?: () => void;
}

/**
 * The trail from Home to the current page.
 *
 * Two jobs, both of which the app was doing without: saying where you are in
 * the catalogue, and offering the step back up to it. "Back" only ever returns
 * you the way you came - after arriving on a listing from a shared link there
 * is no way up to its category at all, and a trail is the standard answer.
 *
 * Rendered as an ordered list inside a labelled <nav>, which is what assistive
 * technology expects of a breadcrumb; the final crumb carries aria-current and
 * is deliberately not a button, since it goes nowhere.
 */
export const Breadcrumbs: React.FC<{ items: Crumb[]; className?: string }> = ({
  items,
  className = '',
}) => {
  if (items.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb" className={className}>
      <ol className="flex items-center gap-1 text-xs font-medium text-[#737686] overflow-x-auto no-scrollbar">
        {items.map((crumb, i) => {
          const isLast = i === items.length - 1;
          return (
            <li key={`${crumb.label}-${i}`} className="flex items-center gap-1 shrink-0 min-w-0">
              {i > 0 && (
                <ChevronRight className="w-3.5 h-3.5 text-[#c3c6d7] shrink-0" aria-hidden="true" />
              )}
              {isLast || !crumb.onClick ? (
                /* The page you are on. Truncated rather than wrapped: a long
                   listing title should not push the trail onto a second line. */
                <span
                  aria-current={isLast ? 'page' : undefined}
                  className="text-[#0b1c30] font-semibold truncate max-w-[180px] sm:max-w-[280px]"
                >
                  {crumb.label}
                </span>
              ) : (
                <button
                  onClick={crumb.onClick}
                  className="flex items-center gap-1 hover:text-[#2563eb] hover:underline underline-offset-2 transition-colors shrink-0"
                >
                  {i === 0 && <Home className="w-3.5 h-3.5" aria-hidden="true" />}
                  {crumb.label}
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
};
