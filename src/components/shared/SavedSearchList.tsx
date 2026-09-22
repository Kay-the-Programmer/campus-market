import React from 'react';
import { BellRing, BellOff, Trash2, Search, Loader2, ChevronRight } from 'lucide-react';
import { SavedSearchRow } from '../../types';

interface SavedSearchListProps {
  searches: SavedSearchRow[];
  loading?: boolean;
  /** Re-runs the search: applies its filters to the feed and goes there. */
  onRun: (search: SavedSearchRow) => void;
  onToggleAlerts: (search: SavedSearchRow) => void;
  onRemove: (search: SavedSearchRow) => void;
  /** Which row has a request in flight, so only that one shows a spinner. */
  busyId?: string | null;
}

/**
 * The searches someone is waiting on.
 *
 * <p>Saved searches were write-only: you could create one from an empty result
 * set and then never see it again - no way to re-run it, turn its alerts off,
 * or delete it. A standing request you cannot inspect is worse than none,
 * because the only evidence it exists is a notification arriving weeks later
 * with no obvious source.
 *
 * <p>Re-running is the primary action, so the whole row is the button and the
 * two management controls sit to the side. For a returning visitor this is the
 * shortest path in the app between opening it and seeing the thing they care
 * about: one tap, filters and all.
 */
export const SavedSearchList: React.FC<SavedSearchListProps> = ({
  searches,
  loading = false,
  onRun,
  onToggleAlerts,
  onRemove,
  busyId,
}) => {
  if (loading) {
    return (
      <div className="flex items-center gap-2 py-6 text-xs text-[#737686]">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading your searches…
      </div>
    );
  }

  // Nothing at all renders nothing. The prompt to create one belongs where a
  // search actually comes up empty, not on a page about saved items.
  if (searches.length === 0) return null;

  return (
    <div className="space-y-2">
      {searches.map((s) => {
        const busy = busyId === s.id;
        return (
          <div
            key={s.id}
            className="group flex items-center gap-2 bg-white border border-[#e5eeff] rounded-2xl pl-3.5 pr-2 py-2.5 shadow-card hover:border-[#b4c5ff]/70 transition-colors"
          >
            <button
              onClick={() => onRun(s)}
              className="flex items-center gap-2.5 min-w-0 flex-1 text-left"
            >
              <span className="shrink-0 w-8 h-8 rounded-lg bg-[#eff4ff] text-[#2563eb] flex items-center justify-center">
                <Search className="w-4 h-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-[#0b1c30] truncate group-hover:text-[#2563eb] transition-colors">
                  {s.label}
                </span>
                <span className="block text-[11px] text-[#737686]">
                  {s.alerts ? "We'll tell you about new matches" : 'Alerts off'}
                </span>
              </span>
              <ChevronRight className="w-4 h-4 text-[#c3c6d7] shrink-0 ml-auto group-hover:text-[#2563eb] transition-colors" />
            </button>

            <button
              onClick={() => onToggleAlerts(s)}
              disabled={busy}
              aria-pressed={s.alerts}
              aria-label={s.alerts ? `Turn off alerts for ${s.label}` : `Turn on alerts for ${s.label}`}
              title={s.alerts ? 'Turn alerts off' : 'Turn alerts on'}
              className={`shrink-0 p-2 rounded-lg transition-colors disabled:opacity-50 ${s.alerts
                ? 'text-[#2563eb] hover:bg-[#eff4ff]'
                : 'text-[#a0a3b1] hover:bg-[#f8f9ff] hover:text-[#434655]'
                }`}
            >
              {busy ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : s.alerts ? (
                <BellRing className="w-4 h-4" />
              ) : (
                <BellOff className="w-4 h-4" />
              )}
            </button>

            {/* Alerts off and delete are deliberately separate. Someone who
                stops wanting to be interrupted usually still wants the search
                itself, to re-run by hand. */}
            <button
              onClick={() => onRemove(s)}
              disabled={busy}
              aria-label={`Delete saved search ${s.label}`}
              title="Delete"
              className="shrink-0 p-2 rounded-lg text-[#a0a3b1] hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
