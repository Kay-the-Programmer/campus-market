import React, { useEffect, useState } from 'react';
import {
  Award, ArrowLeft, ShieldCheck, CheckCircle2, Clock, Star, Tag, Loader2, MapPin,
} from 'lucide-react';
import { api } from '../services/api';
import { ReviewModal } from './shared/ReviewModal';
import { ErrorBanner } from './shared/Modal';
import { formatPrice } from '../utils/currency';
import { ListingImage } from './shared/ListingImage';

interface DealsScreenProps {
  onBack: () => void;
  onExplore: () => void;
}

interface DealRow {
  id: string;
  listing: { id: string; title: string; price: number; image?: string; status: string; removed: boolean };
  counterparty: { id: string; name: string; avatarUrl?: string };
  role: 'buyer' | 'seller';
  price: number;
  meetupLocation?: string;
  meetupTime?: string;
  status: string;
  reviewSubmitted: boolean;
  createdAt: string;
}

const formatDate = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' });
};

export const DealsScreen: React.FC<DealsScreenProps> = ({ onBack, onExplore }) => {
  const [deals, setDeals] = useState<DealRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'buyer' | 'seller'>('all');
  const [reviewTarget, setReviewTarget] = useState<DealRow | null>(null);

  const loadDeals = async () => {
    setLoading(true);
    const res = await api.deals.getAll();
    setError(res.error || null);
    setDeals((res.deals as DealRow[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    loadDeals();
    // A review prompt can be deep-linked from a notification (/deals?review=<id>).
    const target = new URLSearchParams(window.location.search).get('review');
    if (target) {
      api.deals.getAll().then((res) => {
        const found = ((res.deals as DealRow[]) || []).find((d) => d.id === target);
        if (found && found.role === 'buyer' && !found.reviewSubmitted) setReviewTarget(found);
      });
    }
  }, []);

  const statusBadge = (status: string) => {
    if (status === 'COMPLETED') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#6ffbbe]/20 text-[#006242] border border-[#007d55]/20 text-xs font-semibold">
          <CheckCircle2 className="w-3.5 h-3.5" />Completed
        </span>
      );
    }
    if (status === 'PENDING') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-xs font-semibold">
          <Clock className="w-3.5 h-3.5" />Pending
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#f8f9ff] text-[#737686] border border-[#c3c6d7] text-xs font-semibold">
        {status}
      </span>
    );
  };

  const visible = deals.filter((d) => filter === 'all' || d.role === filter);

  return (
    <div className="min-h-screen bg-[#f8f9ff] pb-28">
      <div className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-[#c3c6d7]/60 px-4 py-3">
        <div className="max-w-4xl mx-auto flex items-center space-x-3">
          <button onClick={onBack} className="p-2 -ml-2 rounded-full hover:bg-[#eff4ff] text-[#434655] hover:text-[#2563eb]">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-xl font-bold text-[#0b1c30]">Deal History</h1>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-6">
        <ErrorBanner message={error} />

        <div className="flex items-center gap-6 border-b border-[#c3c6d7]/60 mb-6">
          {([['all', 'All deals'], ['buyer', 'As Buyer'], ['seller', 'As Seller']] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`pb-3 font-semibold text-sm transition-all ${
                filter === key ? 'text-[#2563eb] border-b-2 border-[#2563eb]' : 'text-[#737686] hover:text-[#0b1c30]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24 gap-2 text-[#737686] text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading your deals…
          </div>
        ) : visible.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-3xl border border-[#e5eeff] shadow-card">
            <Award className="w-10 h-10 text-[#b4c5ff] mx-auto mb-2" />
            <h3 className="font-bold text-[#0b1c30]">No deals yet</h3>
            <p className="text-xs text-[#737686] mt-1 mb-6">
              Deals appear here once a sale is confirmed by the seller.
            </p>
            <button onClick={onExplore} className="btn-primary !rounded-xl !text-sm px-6">Explore the marketplace</button>
          </div>
        ) : (
          <div className="space-y-4">
            {visible.map((deal) => (
              <div key={deal.id} className="bg-white rounded-2xl border border-[#e5eeff] p-4 shadow-card">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start space-x-4 min-w-0">
                    {deal.listing.removed ? (
                      <div className="w-16 h-16 rounded-xl bg-[#eff4ff] border border-[#dbe1ff] flex items-center justify-center shrink-0">
                        <Tag className="w-5 h-5 text-[#b4c5ff]" />
                      </div>
                    ) : (
                      <ListingImage src={deal.listing.image} alt="" className="w-16 h-16 rounded-xl object-cover border border-[#e5eeff] shrink-0" />
                    )}
                    <div className="min-w-0">
                      <h3 className={`font-bold text-sm sm:text-base truncate ${deal.listing.removed ? 'text-[#737686] italic' : 'text-[#0b1c30]'}`}>
                        {deal.listing.title}
                      </h3>
                      <p className="text-xs text-[#737686] mt-0.5">
                        {deal.role === 'buyer' ? 'Bought from' : 'Sold to'}{' '}
                        <span className="font-semibold text-[#434655]">{deal.counterparty.name}</span>
                      </p>
                      <p className="text-base font-extrabold text-[#2563eb] mt-1">{formatPrice(deal.price)}</p>
                      {deal.meetupLocation && (
                        <p className="text-[11px] text-[#737686] mt-1 flex items-center gap-1">
                          <MapPin className="w-3 h-3" /> {deal.meetupLocation}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="text-right shrink-0 space-y-2">
                    <div className="text-xs text-[#737686] font-medium">{formatDate(deal.createdAt)}</div>
                    {statusBadge(deal.status)}
                    {/* Only buyers review sellers; sellers get no review control. */}
                    {deal.role === 'buyer' && (
                    <div>
                      {deal.reviewSubmitted ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#006242]">
                          <ShieldCheck className="w-3.5 h-3.5" /> Reviewed
                        </span>
                      ) : (
                        <button
                          onClick={() => setReviewTarget(deal)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-50 text-amber-700 text-xs font-bold border border-amber-200 hover:bg-amber-100"
                        >
                          <Star className="w-3.5 h-3.5" /> Leave a review
                        </button>
                      )}
                    </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {reviewTarget && (
        <ReviewModal
          isOpen={!!reviewTarget}
          onClose={() => setReviewTarget(null)}
          dealId={reviewTarget.id}
          counterpartyName={reviewTarget.counterparty.name}
          listingTitle={reviewTarget.listing.title}
          onSubmitted={loadDeals}
        />
      )}
    </div>
  );
};
