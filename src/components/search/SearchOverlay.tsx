import React, { useEffect, useRef } from 'react';
import { ArrowLeft, Search, X } from 'lucide-react';
import { SearchSuggestions } from './SearchSuggestions';

interface SearchOverlayProps {
  open: boolean;
  onClose: () => void;
  userId: string;
  query: string;
  onQueryChange: (value: string) => void;
  /** Run a full-text search for this term. Closing is the caller's job. */
  onSearch: (term: string) => void;
  onSelectListing: (listingId: string) => void;
  onSelectCategory: (categoryId: string) => void;
  onShowDeals?: () => void;
}

/**
 * Search, as a screen rather than a dropdown.
 *
 * On a phone the panel under the nav box was a ~70vh sliver sharing the
 * viewport with a header, a soft keyboard and whatever page it was drawn over,
 * which left room for about three suggestions and put the rest behind a scroll
 * inside a scroll. Taking the whole screen is what every shopping app does for
 * the same reason: while you are searching, nothing else on the page is worth
 * the pixels.
 *
 * Deliberately UI state and not a route. It has no shareable content of its
 * own - the results page at /search does - and giving it a history entry would
 * mean Back out of a search you never ran lands on the results you never
 * asked for.
 */
export const SearchOverlay: React.FC<SearchOverlayProps> = ({
  open,
  onClose,
  userId,
  query,
  onQueryChange,
  onSearch,
  onSelectListing,
  onSelectCategory,
  onShowDeals,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  /*
   * Focus after paint, not during it. Calling focus() while the element is
   * still being inserted gets dropped on iOS, and the overlay opens with the
   * keyboard down - one wasted tap on the single control the screen exists
   * for. rAF also lets the entrance animation start before the keyboard
   * shoves the layout upward.
   */
  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => {
      inputRef.current?.focus();
      // Caret at the end, so reopening with a previous term is an edit rather
      // than an accidental overwrite.
      const len = inputRef.current?.value.length ?? 0;
      inputRef.current?.setSelectionRange(len, len);
    });
    return () => cancelAnimationFrame(id);
  }, [open]);

  /* Nothing behind the overlay should scroll while it owns the screen -
     otherwise a flick aimed at the suggestions drags the feed underneath. */
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [open]);

  /* Escape closes, for the keyboard case and for tablets with one attached.
     SearchSuggestions also listens for Escape; both end in the same close. */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = query.trim();
    // An empty box has nothing to search for, and blanking the results page is
    // not what pressing the key meant.
    if (!clean) return;
    onSearch(clean);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Search"
      /* dvh, not vh: on mobile Safari 100vh is the height the page would have
         WITHOUT the browser chrome, so a vh-sized overlay hides its own last
         rows behind the address bar. */
      className="fixed inset-0 z-50 bg-white flex flex-col animate-search-in"
      style={{ height: '100dvh' }}
    >
      {/* ── Search bar: the only thing pinned, everything else scrolls ──── */}
      <div className="shrink-0 border-b border-[#e5eeff] bg-white px-3 py-2.5">
        <form onSubmit={submit} className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close search"
            className="p-2.5 -ml-1 rounded-full text-[#434655] hover:text-[#2563eb] hover:bg-[#eff4ff] transition-colors shrink-0"
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <div className="relative flex-1 min-w-0">
            <Search className="w-4 h-4 text-[#737686] absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              ref={inputRef}
              /* Not type="search": WebKit draws its own clear button inside
                 it, next to the one below, and the two behave differently. */
              type="text"
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder="Search CampusMarket…"
              aria-label="Search listings"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              inputMode="search"
              enterKeyHint="search"
              /* text-base is load-bearing, not styling: iOS Safari zooms the
                 whole page in on any focused input under 16px, and the way
                 back out is a manual pinch. See .no-zoom-field in index.css
                 for the same rule applied to the rest of the forms. */
              className="w-full pl-11 pr-10 py-2.5 text-base font-medium bg-[#f8f9ff] border border-[#e5eeff] rounded-full text-[#0b1c30] placeholder:text-[#a0a3b1] focus:outline-none focus:ring-2 focus:ring-[#2563eb]/30 focus:border-[#2563eb] focus:bg-white transition-all duration-200"
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  onQueryChange('');
                  inputRef.current?.focus();
                }}
                aria-label="Clear search"
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full text-[#a0a3b1] hover:text-[#434655]"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Only once there is something to submit. An always-on button next
              to an empty box is a control that does nothing when tapped. */}
          {query.trim() && (
            <button
              type="submit"
              className="shrink-0 px-3 py-2 text-sm font-bold text-[#2563eb] active:opacity-60"
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              Search
            </button>
          )}
        </form>
      </div>

      {/* ── Suggestions: the same rows as the desktop dropdown ──────────── */}
      <div className="flex-1 overflow-y-auto overscroll-contain">
        <SearchSuggestions
          variant="page"
          query={query}
          userId={userId}
          open
          onClose={onClose}
          onSearch={onSearch}
          onSelectListing={onSelectListing}
          onSelectCategory={onSelectCategory}
          onShowDeals={onShowDeals}
        />
      </div>
    </div>
  );
};
