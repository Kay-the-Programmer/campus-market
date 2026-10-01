import React, { useEffect, useState } from 'react';
import { MapPin, Tag, Layers, Coins, ArrowRight, Loader2, Search as SearchIcon } from 'lucide-react';
import { api } from '../../services/api';
import { CAMPUS_ZONES, CampusZone } from '../../types';

/** The feed's query, in the shape the API takes it. */
export interface FeedQuery {
  search?: string;
  /** PRODUCT | SERVICE | FOOD, already in API form. */
  type?: string;
  categoryId?: string;
  campusZone?: CampusZone | '';
  minPrice?: string;
  maxPrice?: string;
  dealsOnly?: boolean;
}

/** What a suggestion changes when pressed. Empty string clears that filter. */
export interface FeedPatch {
  campusZone?: CampusZone | '';
  categoryId?: string;
  type?: 'All';
  price?: ['', ''];
  /** Replaces the search term - used by the single-word fallback. */
  search?: string;
}

interface Suggestion {
  key: string;
  icon: React.ReactNode;
  label: string;
  count: number;
  patch: FeedPatch;
}

interface NoResultsSuggestionsProps {
  query: FeedQuery;
  /** For naming the category in "All categories" rather than showing an id. */
  categoryName?: string;
  onApply: (patch: FeedPatch) => void;
  /**
   * `empty` is the full panel on a feed with no results at all.
   *
   * <p>`inline` is the quiet one-line version for a feed that found two or
   * three things. It only ever offers other zones, because the rest would be
   * noise: somebody looking at results does not need to be told their price
   * band exists, only that there are nine more of these across campus.
   */
  variant?: 'empty' | 'inline';
}

/**
 * "Nothing here - but there are seven in Upschool."
 *
 * <p>An empty result set is where people leave, and the reason they leave is
 * that the page says what is missing without saying what to do about it. The
 * honest answer is usually one filter away: the thing exists, just not in the
 * corner of campus, the price band or the category they narrowed to.
 *
 * <p>So rather than advise "try removing a filter" and leave them to guess
 * which, this asks the server what each relaxation would actually return and
 * offers only the ones with something behind them. A suggestion that leads to
 * another empty page is worse than no suggestion, because it spends the one
 * bit of patience they had left.
 *
 * <p>The probes run only on an empty feed, one per candidate, asking for a
 * single row each - they are counted, not listed.
 */
export const NoResultsSuggestions: React.FC<NoResultsSuggestionsProps> = ({
  query,
  categoryName,
  onApply,
  variant = 'empty',
}) => {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [probing, setProbing] = useState(false);

  const {
    search, type, categoryId, campusZone, minPrice, maxPrice, dealsOnly,
  } = query;

  useEffect(() => {
    const controller = new AbortController();
    let alive = true;

    /** The current query with one thing changed. Everything else is held. */
    const probe = async (override: Record<string, string | undefined>) => {
      const res = await api.listings.search({
        search: search?.trim() || undefined,
        type,
        categoryId: categoryId || undefined,
        campusZone: campusZone || undefined,
        minPrice: minPrice || undefined,
        maxPrice: maxPrice || undefined,
        hasDiscount: dealsOnly ? 'true' : undefined,
        // Counted, not listed: the number is the whole point of the probe.
        size: 1,
        ...override,
      }, controller.signal);
      return res.aborted ? -1 : res.totalItems;
    };

    (async () => {
      setProbing(true);
      const found: Suggestion[] = [];

      /*
       * Zones first, and they are the reason this exists. "Clothes, Across"
       * finding nothing does not mean the campus has no clothes - it means
       * they are in the other two zones, which is a fact the person cannot
       * discover without undoing the filter they deliberately set.
       */
      if (campusZone) {
        for (const z of CAMPUS_ZONES) {
          if (z.value === campusZone) continue;
          const count = await probe({ campusZone: z.value });
          if (!alive) return;
          if (count > 0) {
            found.push({
              key: `zone-${z.value}`,
              icon: <MapPin className="w-3.5 h-3.5" />,
              label: z.label,
              count,
              patch: { campusZone: z.value },
            });
          }
        }
      }

      /*
       * Everything past this point widens the query by dropping a filter,
       * which is the right offer for an empty feed and the wrong one for a
       * feed that already has results on it. Inline stops at zones.
       */
      if (variant === 'inline') {
        if (!alive) return;
        setSuggestions(found.sort((a, b) => b.count - a.count));
        setProbing(false);
        return;
      }

      if (minPrice || maxPrice) {
        const count = await probe({ minPrice: undefined, maxPrice: undefined });
        if (!alive) return;
        if (count > 0) {
          found.push({
            key: 'any-price',
            icon: <Coins className="w-3.5 h-3.5" />,
            label: 'Any price',
            count,
            patch: { price: ['', ''] },
          });
        }
      }

      if (categoryId) {
        const count = await probe({ categoryId: undefined });
        if (!alive) return;
        if (count > 0) {
          found.push({
            key: 'any-category',
            icon: <Tag className="w-3.5 h-3.5" />,
            label: categoryName ? `Outside ${categoryName}` : 'All categories',
            count,
            patch: { categoryId: '' },
          });
        }
      }

      if (type) {
        const count = await probe({ type: undefined });
        if (!alive) return;
        if (count > 0) {
          found.push({
            key: 'any-type',
            icon: <Layers className="w-3.5 h-3.5" />,
            label: 'Products, services and food',
            count,
            patch: { type: 'All' },
          });
        }
      }

      /*
       * The phrase found nothing, so try its words.
       *
       * "winter clothes bundle" is three chances to miss: the seller wrote
       * "winter coat", and a search that only matches the whole phrase turns
       * a near miss into a dead end. Longest word first - it carries the most
       * meaning - and only when the filters above offered nothing, so a page
       * never shows two different theories about what went wrong.
       */
      const words = (search ?? '')
        .trim().split(/\s+/)
        .filter((w) => w.length > 2)
        .sort((a, b) => b.length - a.length)
        .slice(0, 3);

      if (found.length === 0 && words.length > 1) {
        for (const word of words) {
          const count = await probe({ search: word });
          if (!alive) return;
          if (count > 0) {
            found.push({
              key: `word-${word}`,
              icon: <SearchIcon className="w-3.5 h-3.5" />,
              label: `Search “${word}” instead`,
              count,
              patch: { search: word },
            });
            // One alternative phrasing is a help; three is a quiz.
            break;
          }
        }
      }

      if (!alive) return;
      // Most to least, so the best way out is the first thing read.
      setSuggestions(found.sort((a, b) => b.count - a.count));
      setProbing(false);
    })();

    return () => {
      alive = false;
      controller.abort();
    };
  }, [search, type, categoryId, campusZone, minPrice, maxPrice, dealsOnly, categoryName, variant]);

  /*
   * Inline says nothing while it is thinking. The empty panel can afford a
   * spinner because the page has nothing else on it; under a grid of real
   * results, a line that appears, says "looking", then vanishes is just the
   * page twitching at someone who is already reading.
   */
  if (variant === 'inline') {
    if (suggestions.length === 0) return null;
    return (
      <div className="mt-6 flex flex-wrap items-center gap-2 px-1">
        <span className="text-xs font-semibold text-[#737686]">
          More of this elsewhere on campus:
        </span>
        {suggestions.map((s) => (
          <button
            key={s.key}
            onClick={() => onApply(s.patch)}
            className="group inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white border border-[#c3c6d7] hover:border-[#2563eb] hover:text-[#2563eb] text-xs font-semibold text-[#434655] transition-colors"
          >
            <MapPin className="w-3 h-3 text-[#a0a3b1] group-hover:text-[#2563eb] transition-colors" />
            {s.label}
            <span className="text-[#a0a3b1] group-hover:text-[#2563eb]">{s.count}</span>
          </button>
        ))}
      </div>
    );
  }

  if (probing && suggestions.length === 0) {
    return (
      <p className="mt-6 flex items-center justify-center gap-2 text-xs text-[#a0a3b1]">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        Looking for this elsewhere…
      </p>
    );
  }

  if (suggestions.length === 0) return null;

  /*
   * When the only way out is a different search term, the filters are not the
   * problem - and saying they are sends somebody off to widen a price band
   * that was never in the way. Nothing matched the phrase: say that instead.
   */
  const onlyRewording = suggestions.every((s) => s.key.startsWith('word-'));

  return (
    <div className="mt-8 pt-6 border-t border-[#eff4ff] max-w-md mx-auto">
      {/*
        One heading for every kind of suggestion, because "elsewhere" is a lie
        about a price band and "in another price range" is a lie about a zone.
        This one is true of all of them, and it is the sentence that matters:
        the thing exists, the filters are what is hiding it.
      */}
      <p className="text-xs font-bold text-[#a0a3b1] uppercase tracking-wider mb-3">
        {onlyRewording
          ? 'Nothing matches all of those words'
          : search?.trim()
            ? <>“{search.trim()}” is listed — just not with these filters</>
            : 'There are listings — just not with these filters'}
      </p>
      <div className="flex flex-col gap-2">
        {suggestions.map((s) => (
          <button
            key={s.key}
            onClick={() => onApply(s.patch)}
            className="group flex items-center gap-2.5 w-full px-3.5 py-2.5 rounded-xl bg-white border border-[#c3c6d7] hover:border-[#2563eb] hover:bg-[#f8f9ff] transition-colors text-left"
          >
            <span className="shrink-0 text-[#2563eb]">{s.icon}</span>
            <span className="flex-1 min-w-0 text-sm font-semibold text-[#0b1c30] truncate">
              {s.label}
            </span>
            <span className="shrink-0 text-xs font-bold text-[#737686]">
              {s.count} {s.count === 1 ? 'listing' : 'listings'}
            </span>
            <ArrowRight className="w-3.5 h-3.5 shrink-0 text-[#a0a3b1] group-hover:text-[#2563eb] transition-colors" />
          </button>
        ))}
      </div>
    </div>
  );
};
