import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, Search, Loader2, ShoppingBag, Briefcase, Utensils, Layers,
  BookOpen, Sofa, Bike, Shirt, Laptop, Dumbbell, Music, Wrench,
} from 'lucide-react';
import { api } from '../services/api';
import { ErrorBanner } from './shared/Modal';

interface CategoryRow {
  id: string;
  name: string;
  slug: string;
  listingCount: number;
  icon?: string;
}

interface CategoriesScreenProps {
  onBack: () => void;
  /** Browse one category. The feed owns the filtering; this only points at it. */
  onSelectCategory: (categoryId: string, name: string) => void;
  /** The three core types, which are not categories but are how people think. */
  onSelectType: (type: 'Product' | 'Service' | 'Food') => void;
}

/**
 * Icon for a category, guessed from its name.
 *
 * <p>Categories are admin-created and carry no icon in practice, so the
 * alternative to guessing is the same grey square forty times - which makes a
 * grid people are supposed to scan impossible to scan. A wrong-but-plausible
 * icon costs nothing here because the name is right next to it; the icon is
 * doing wayfinding, not identification.
 */
function iconFor(name: string): React.ReactNode {
  const n = name.toLowerCase();
  const cls = 'w-5 h-5';
  if (/book|text|stud|note/.test(n)) return <BookOpen className={cls} />;
  if (/furni|sofa|desk|chair|bed/.test(n)) return <Sofa className={cls} />;
  if (/bike|cycle|scoot/.test(n)) return <Bike className={cls} />;
  if (/cloth|shirt|wear|fashion|shoe/.test(n)) return <Shirt className={cls} />;
  if (/laptop|comput|phone|electr|tech/.test(n)) return <Laptop className={cls} />;
  if (/sport|gym|fit/.test(n)) return <Dumbbell className={cls} />;
  if (/music|instrum|audio/.test(n)) return <Music className={cls} />;
  if (/food|meal|snack|drink|cook/.test(n)) return <Utensils className={cls} />;
  if (/tutor|service|repair|clean|ride/.test(n)) return <Wrench className={cls} />;
  return <ShoppingBag className={cls} />;
}

const CORE_TYPES = [
  {
    key: 'Product' as const,
    label: 'Products',
    hint: 'Things to buy and collect',
    icon: <ShoppingBag className="w-6 h-6" />,
    tone: 'bg-[#eff4ff] text-[#2563eb] border-[#dbe1ff]',
  },
  {
    key: 'Service' as const,
    label: 'Services',
    hint: 'Tutoring, repairs, rides',
    icon: <Briefcase className="w-6 h-6" />,
    tone: 'bg-[#f3ecff] text-[#8455ef] border-[#e4d8ff]',
  },
  {
    key: 'Food' as const,
    label: 'Food',
    hint: 'Home-cooked and campus meals',
    icon: <Utensils className="w-6 h-6" />,
    tone: 'bg-[#e6f9f1] text-[#007d55] border-[#c8f0e0]',
  },
];

/**
 * Everything the site sells, on one page.
 *
 * <p>Categories previously existed only as chips in a horizontally-scrolling
 * strip above the feed. That works for narrowing results you are already
 * looking at, and not at all for the question a newcomer actually has - "what
 * is on this site?" - because the answer was only discoverable by swiping a
 * strip sideways and hoping to recognise something.
 *
 * <p>Every row carries its listing count, and empty categories are not shown.
 * A category that leads to an empty feed is worse than no category: it teaches
 * someone that the navigation lies.
 */
export const CategoriesScreen: React.FC<CategoriesScreenProps> = ({
  onBack,
  onSelectCategory,
  onSelectType,
}) => {
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    api.categories.getAll().then((res) => {
      const list = (res.categories as CategoryRow[]) || [];
      setCategories(
        list
          .filter((c) => c.listingCount > 0)
          .sort((a, b) => b.listingCount - a.listingCount),
      );
      setError(res.error || null);
      setLoading(false);
    });
  }, []);

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter((c) => c.name.toLowerCase().includes(q));
  }, [categories, filter]);

  const total = useMemo(
    () => categories.reduce((sum, c) => sum + c.listingCount, 0),
    [categories],
  );

  return (
    <div className="min-h-screen bg-[#f8f9ff] pb-28">
      <div className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-[#c3c6d7]/60 px-4 py-3">
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 -ml-2 rounded-full hover:bg-[#eff4ff] text-[#434655] hover:text-[#2563eb]"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-xl font-bold text-[#0b1c30]">Browse categories</h1>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-6">
        <ErrorBanner message={error} />

        {/* The three core types first. They are not categories - they cut
            across all of them - but "am I after a thing, a service or a meal"
            is the first cut most people make, and it is a much shorter list
            to read than the categories below. */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
          {CORE_TYPES.map((t) => (
            <button
              key={t.key}
              onClick={() => onSelectType(t.key)}
              className={`flex items-center gap-3 p-4 rounded-2xl border text-left transition-all duration-150 hover:-translate-y-0.5 hover:shadow-card ${t.tone}`}
            >
              <span className="shrink-0">{t.icon}</span>
              <span className="min-w-0">
                <span className="block text-sm font-bold">{t.label}</span>
                <span className="block text-[11px] opacity-75 truncate">{t.hint}</span>
              </span>
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between gap-3 mb-3">
          <h2 className="text-sm font-bold text-[#0b1c30]">
            All categories
            {!loading && categories.length > 0 && (
              <span className="ml-2 text-xs font-semibold text-[#737686]">
                {categories.length} with {total} listing{total !== 1 ? 's' : ''}
              </span>
            )}
          </h2>
        </div>

        {/* A filter, not a search: it narrows the list on this page rather than
            querying the catalogue. Only worth showing once there are enough
            categories that reading them all is a chore. */}
        {categories.length > 8 && (
          <div className="relative mb-4">
            <Search className="w-4 h-4 text-[#a0a3b1] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter categories…"
              aria-label="Filter categories"
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white border border-[#e5eeff] text-sm text-[#0b1c30] placeholder:text-[#a0a3b1] focus:outline-none focus:ring-2 focus:ring-[#2563eb]/25 focus:border-[#2563eb]"
            />
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20 gap-2 text-[#737686] text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading categories…
          </div>
        ) : visible.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-3xl border border-[#e5eeff] shadow-card">
            <Layers className="w-10 h-10 text-[#b4c5ff] mx-auto mb-2" />
            <h3 className="font-bold text-[#0b1c30]">
              {filter.trim() ? `Nothing called “${filter.trim()}”` : 'No categories yet'}
            </h3>
            <p className="text-xs text-[#737686] mt-1">
              {filter.trim()
                ? 'Try a shorter word, or clear the filter to see everything.'
                : 'Categories appear here once listings are posted into them.'}
            </p>
            {filter.trim() && (
              <button
                onClick={() => setFilter('')}
                className="btn-primary !h-9 !px-4 !text-xs mt-4 !rounded-lg mx-auto"
              >
                Clear filter
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {visible.map((c) => (
              <button
                key={c.id}
                onClick={() => onSelectCategory(c.id, c.name)}
                className="group flex items-center gap-3 p-3.5 rounded-2xl bg-white border border-[#e5eeff]/80 shadow-card hover:shadow-card-hover hover:border-[#b4c5ff]/60 hover:-translate-y-0.5 transition-all duration-200 text-left"
              >
                <span className="shrink-0 w-10 h-10 rounded-xl bg-[#eff4ff] text-[#2563eb] flex items-center justify-center group-hover:bg-[#2563eb] group-hover:text-white transition-colors">
                  {iconFor(c.name)}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-[#0b1c30] truncate group-hover:text-[#2563eb] transition-colors">
                    {c.name}
                  </span>
                  {/* The count is the point: it says how much is waiting, so
                      nothing offered here is a guess. */}
                  <span className="block text-[11px] font-medium text-[#737686]">
                    {c.listingCount} listing{c.listingCount !== 1 ? 's' : ''}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
