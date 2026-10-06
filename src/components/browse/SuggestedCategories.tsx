import React, { useEffect, useState } from 'react';
import { Compass, ChevronRight } from 'lucide-react';
import { api } from '../../services/api';
import { categoryEmoji } from '../shared/categoryEmoji';

/**
 * "Worth a look" - categories this person has not been browsing, chosen from
 * where the people around their listings went.
 *
 * <p>Deliberately not the categories they already use. The strip at the top of
 * the page is the whole catalogue and their own history is the feed; a shelf
 * that recommends the aisle somebody is standing in has told them nothing. The
 * server excludes their strongest category for exactly that reason, and falls
 * back to the busiest categories of the week when it knows nothing about them
 * - which is the right answer to "where should I look" for a stranger.
 *
 * <p>Renders nothing at all rather than a heading over an empty row: on a thin
 * catalogue there may genuinely be nowhere else worth sending anyone.
 */

interface SuggestedCategory {
  id: string;
  name: string;
  slug?: string;
  listingCount?: number;
  imageUrl?: string;
}

interface SuggestedCategoriesProps {
  /** Listing ids from this device, so a signed-out visitor gets suggestions too. */
  recentIds: string[];
  onSelect: (categoryId: string) => void;
  /** Re-fetches when this changes - signing in is a different person's taste. */
  userId?: string;
}

/** Fewer than this and it is a list, not a shelf. */
const MIN_TO_SHOW = 3;

export const SuggestedCategories: React.FC<SuggestedCategoriesProps> = ({
  recentIds, onSelect, userId,
}) => {
  const [categories, setCategories] = useState<SuggestedCategory[]>([]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    api.categories.suggested(8, recentIds, controller.signal).then((res) => {
      if (cancelled || res.aborted || res.error) return;
      const picks = (res.categories as SuggestedCategory[]).filter((c) => c?.id && c.name);
      setCategories(picks.length >= MIN_TO_SHOW ? picks.slice(0, 8) : []);
    });

    return () => { cancelled = true; controller.abort(); };
    // The ids are joined rather than passed as an array: a new array every
    // render would refetch on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recentIds.join(','), userId]);

  if (categories.length === 0) return null;

  return (
    <section className="mb-7">
      <div className="flex items-center gap-2 mb-3">
        <Compass className="w-4 h-4 text-[#2563eb]" />
        <h2 className="text-sm font-bold text-[#0b1c30]">Worth a look</h2>
        <span className="text-xs text-[#a0a3b1]">Based on what students like you browse</span>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
        {categories.map((category) => (
          <button
            key={category.id}
            onClick={() => onSelect(category.id)}
            className="shrink-0 flex items-center gap-2 pl-2.5 pr-3 py-2 rounded-xl bg-white border border-[#dbe1ff] hover:border-[#2563eb] hover:shadow-sm transition-all duration-150 active:scale-95 group"
          >
            <span
              className="w-8 h-8 rounded-lg bg-[#eff4ff] flex items-center justify-center text-base shrink-0"
              aria-hidden="true"
            >
              {categoryEmoji(category.name)}
            </span>
            <span className="text-left min-w-0">
              <span className="block text-xs font-bold text-[#0b1c30] truncate max-w-[140px] group-hover:text-[#2563eb] transition-colors">
                {category.name}
              </span>
              {typeof category.listingCount === 'number' && category.listingCount > 0 && (
                <span className="block text-[10px] text-[#a0a3b1]">
                  {category.listingCount} listing{category.listingCount === 1 ? '' : 's'}
                </span>
              )}
            </span>
            <ChevronRight className="w-3.5 h-3.5 text-[#c3c6d7] shrink-0 group-hover:text-[#2563eb] transition-colors" />
          </button>
        ))}
      </div>
    </section>
  );
};
