import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, Layers, Loader2, ShoppingBag, Briefcase, Utensils } from 'lucide-react';
import { api } from '../../services/api';
import { categoryEmoji } from '../shared/categoryEmoji';

interface CategoryRow {
  id: string;
  name: string;
  listingCount: number;
}

export interface CategoryMenuProps {
  /** Browse one category, with the other feed filters cleared. */
  onSelectCategory: (categoryId: string) => void;
  /** The three core types - not categories, but how people actually ask. */
  onSelectType: (type: 'Product' | 'Service' | 'Food') => void;
  /** The full page, for everything that did not fit in the panel. */
  onSeeAll: () => void;
}

const CORE_TYPES = [
  { key: 'Product' as const, label: 'Products', hint: 'Things to buy and collect', icon: ShoppingBag, tone: 'bg-[#eff4ff] text-[#2563eb]' },
  { key: 'Service' as const, label: 'Services', hint: 'Tutoring, repairs, rides', icon: Briefcase, tone: 'bg-[#f3ecff] text-[#8455ef]' },
  { key: 'Food' as const, label: 'Food', hint: 'Home-cooked and campus meals', icon: Utensils, tone: 'bg-[#e6f9f1] text-[#007d55]' },
];

/**
 * How many categories the panel shows before deferring to the full page.
 *
 * <p>Twelve is two rows of six. Past that the panel stops being a glance and
 * becomes a page drawn over a page, which is what the categories screen is
 * already for.
 */
const PANEL_LIMIT = 12;

/**
 * The catalogue's shape, on desktop, without a second nav row.
 *
 * <p>A category strip used to live under the search bar and was removed - it
 * cost a categories fetch on every single page load to render chips most
 * people scrolled past. Desktop has had no persistent view of what the site
 * sells since. This is the compromise: the same information, behind one
 * press, fetched the first time somebody actually asks for it and then kept
 * for the rest of the session.
 *
 * <p>Click, not hover. A hover menu cannot be reached from a keyboard without
 * extra machinery, and opens itself at every accidental pass of the cursor on
 * the way to the search box directly beneath it.
 */
export const CategoryMenu: React.FC<CategoryMenuProps> = ({
  onSelectCategory,
  onSelectType,
  onSeeAll,
}) => {
  const [open, setOpen] = useState(false);
  const [categories, setCategories] = useState<CategoryRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  /* Fetched on first open and kept. The panel is navigation, not a report:
     a category appearing mid-session is not worth a request per press. */
  const load = useCallback(async () => {
    if (categories || loading) return;
    setLoading(true);
    setFailed(false);
    const res = await api.categories.getAll();
    const rows = (res.categories as CategoryRow[])
      .filter((c) => c.listingCount > 0)
      .sort((a, b) => b.listingCount - a.listingCount);
    /* An empty list after a failed request would read as "this campus sells
       nothing", which is a lie the navigation should not tell. */
    if (res.error && !rows.length) setFailed(true);
    else setCategories(rows);
    setLoading(false);
  }, [categories, loading]);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      /* Back to the control that opened it, or the focus ring is stranded
         on a panel that no longer exists. */
      buttonRef.current?.focus();
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const choose = (run: () => void) => {
    setOpen(false);
    run();
  };

  const shown = categories?.slice(0, PANEL_LIMIT) ?? [];
  const more = Math.max((categories?.length ?? 0) - shown.length, 0);

  return (
    <div ref={wrapRef} className="hidden lg:block relative shrink-0">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => { setOpen((v) => !v); void load(); }}
        aria-expanded={open}
        aria-haspopup="true"
        className={`flex items-center gap-1.5 h-10 px-3 rounded-xl text-sm font-bold transition-all duration-150 ${open
          ? 'bg-[#eff4ff] text-[#2563eb]'
          : 'text-[#434655] hover:bg-[#eff4ff] hover:text-[#2563eb]'
          }`}
      >
        <Layers className="w-4 h-4" />
        <span>Categories</span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-150 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Browse categories"
          className="absolute left-0 top-full mt-2 w-[620px] max-w-[calc(100vw-3rem)] bg-white rounded-2xl border border-[#e5eeff] shadow-[0_12px_40px_-8px_rgba(11,28,48,0.18)] p-4 z-50 animate-card-in"
        >
          {/* The three types first: most people arrive wanting one of them,
              and the long tail below is for when they don't. */}
          <div className="grid grid-cols-3 gap-2">
            {CORE_TYPES.map(({ key, label, hint, icon: Icon, tone }) => (
              <button
                key={key}
                role="menuitem"
                onClick={() => choose(() => onSelectType(key))}
                className="flex items-start gap-2.5 p-3 rounded-xl border border-[#e5eeff] hover:border-[#b4c5ff] hover:bg-[#f8f9ff] text-left transition-all duration-150"
              >
                <span className={`shrink-0 p-2 rounded-lg ${tone}`}>
                  <Icon className="w-4 h-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-[#0b1c30]">{label}</span>
                  <span className="block text-[11px] text-[#737686] leading-tight">{hint}</span>
                </span>
              </button>
            ))}
          </div>

          <div className="my-3 h-px bg-[#e5eeff]" />

          {loading && (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-[#737686]">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading categories…
            </div>
          )}

          {failed && (
            <p className="py-5 text-center text-sm text-[#737686]">
              Categories could not be loaded.{' '}
              <button onClick={() => void load()} className="font-bold text-[#2563eb] hover:underline">
                Try again
              </button>
            </p>
          )}

          {!loading && !failed && !shown.length && (
            <p className="py-5 text-center text-sm text-[#737686]">
              No categories have listings yet.
            </p>
          )}

          {!!shown.length && (
            <>
              <div className="grid grid-cols-3 gap-x-2 gap-y-0.5">
                {shown.map((c) => (
                  <button
                    key={c.id}
                    role="menuitem"
                    onClick={() => choose(() => onSelectCategory(c.id))}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-[#f8f9ff] text-left transition-colors duration-150 min-w-0"
                  >
                    <span aria-hidden="true" className="shrink-0 text-base leading-none">
                      {categoryEmoji(c.name)}
                    </span>
                    <span className="flex-1 min-w-0 truncate text-sm text-[#434655]">{c.name}</span>
                    {/* The count is the honest part: it says which shelves are
                        worth walking to before the click, not after. */}
                    <span className="shrink-0 text-[11px] font-bold text-[#a0a3b1] tabular-nums">
                      {c.listingCount}
                    </span>
                  </button>
                ))}
              </div>

              <button
                role="menuitem"
                onClick={() => choose(onSeeAll)}
                className="mt-3 w-full py-2 rounded-xl bg-[#f8f9ff] hover:bg-[#eff4ff] text-sm font-bold text-[#2563eb] transition-colors duration-150"
              >
                {more ? `See all categories (${more} more)` : 'See all categories'}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};
