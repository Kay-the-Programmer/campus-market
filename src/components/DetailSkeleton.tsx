import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

/**
 * The listing page before its listing has arrived.
 *
 * <p>A shared `/listing/:id` link is resolved by two sequential requests - the
 * feed, then the listing by id - and until they finish there is no listing to
 * render. The detail view was simply not mounted for that whole stretch, so
 * anyone following a link from a group chat got the nav, the footer, and a
 * band of empty page between them: indistinguishable from a broken site, on
 * the one screen most likely to be someone's first.
 *
 * <p>The shape mirrors the real page - gallery left, details right - so the
 * arrival of the content is a fill rather than a jump.
 */
export const DetailSkeleton: React.FC = () => (
  <div className="min-h-screen bg-slate-50">
    <div className="sticky top-0 z-30 bg-white/80 backdrop-blur-xl border-b border-slate-200/60">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center">
        <div className="h-5 w-16 rounded bg-slate-200 animate-pulse" />
      </div>
    </div>

    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 sm:pt-6 pb-32 lg:pb-12">
      <div className="h-3 w-48 rounded bg-slate-200 animate-pulse mb-4" />

      <div className="lg:grid lg:grid-cols-12 lg:gap-8">
        {/* Gallery */}
        <div className="lg:col-span-7 xl:col-span-8">
          <div className="aspect-[4/3] sm:aspect-[16/10] lg:aspect-[4/3] rounded-2xl sm:rounded-3xl bg-slate-200 animate-pulse" />
          <div className="mt-3 sm:mt-4 flex gap-2 sm:gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl bg-slate-200 animate-pulse"
              />
            ))}
          </div>
        </div>

        {/* Details */}
        <div className="lg:col-span-5 xl:col-span-4 mt-6 lg:mt-0 space-y-4 sm:space-y-5">
          <div className="bg-white rounded-2xl sm:rounded-3xl p-5 sm:p-6 shadow-sm ring-1 ring-slate-900/5">
            <div className="flex gap-2 mb-4">
              <div className="h-7 w-24 rounded-full bg-slate-200 animate-pulse" />
              <div className="h-7 w-20 rounded-full bg-slate-100 animate-pulse" />
            </div>
            <div className="h-7 w-4/5 rounded bg-slate-200 animate-pulse" />
            <div className="h-7 w-2/5 rounded bg-slate-200 animate-pulse mt-2" />
            <div className="h-10 w-1/2 rounded bg-slate-200 animate-pulse mt-5" />
            <div className="mt-5 pt-5 border-t border-slate-100 flex gap-2">
              <div className="h-9 w-28 rounded-lg bg-slate-100 animate-pulse" />
              <div className="h-9 w-32 rounded-lg bg-slate-100 animate-pulse" />
            </div>
          </div>

          <div className="hidden lg:block bg-white rounded-2xl sm:rounded-3xl p-5 sm:p-6 shadow-sm ring-1 ring-slate-900/5 space-y-3">
            <div className="h-14 w-full rounded-xl bg-slate-200 animate-pulse" />
            <div className="h-12 w-full rounded-xl bg-slate-100 animate-pulse" />
          </div>

          <div className="bg-white rounded-2xl sm:rounded-3xl p-5 sm:p-6 shadow-sm ring-1 ring-slate-900/5">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-slate-200 animate-pulse shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-1/2 rounded bg-slate-200 animate-pulse" />
                <div className="h-3 w-2/3 rounded bg-slate-100 animate-pulse" />
                <div className="h-3 w-1/3 rounded bg-slate-100 animate-pulse" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl sm:rounded-3xl p-5 sm:p-6 shadow-sm ring-1 ring-slate-900/5 space-y-2.5">
            <div className="h-3 w-24 rounded bg-slate-200 animate-pulse mb-4" />
            <div className="h-3 w-full rounded bg-slate-100 animate-pulse" />
            <div className="h-3 w-full rounded bg-slate-100 animate-pulse" />
            <div className="h-3 w-3/4 rounded bg-slate-100 animate-pulse" />
          </div>
        </div>
      </div>
    </main>
  </div>
);

/**
 * The listing could not be fetched - the server was unreachable, rather than
 * the listing being gone. Retrying is the whole point, so it leads with that
 * instead of sending someone back to a feed they did not ask for.
 */
export const DetailUnavailable: React.FC<{
  onRetry: () => void;
  onGoHome: () => void;
}> = ({ onRetry, onGoHome }) => (
  <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
    <div className="bg-white rounded-3xl p-10 max-w-md text-center shadow-sm ring-1 ring-slate-900/5">
      <div className="w-16 h-16 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-5">
        <AlertTriangle className="w-8 h-8" />
      </div>
      <h2 className="text-xl font-bold text-slate-900 mb-2">Couldn't load this listing</h2>
      <p className="text-sm text-slate-500 mb-8 leading-relaxed">
        We couldn't reach the marketplace just now. The listing is probably fine —
        this looks like a connection problem.
      </p>
      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <button
          onClick={onRetry}
          className="px-6 py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl font-semibold text-sm transition-colors flex items-center justify-center gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          Try again
        </button>
        <button
          onClick={onGoHome}
          className="px-6 py-3 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-2xl font-semibold text-sm transition-colors"
        >
          Go to marketplace
        </button>
      </div>
    </div>
  </div>
);
