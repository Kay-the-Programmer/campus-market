import React, { useEffect, useState } from 'react';
import {
  ArrowLeft, Share2, Star, Calendar, ShieldCheck, MessageSquare, Heart, Lock,
  Loader2, Flag, LogOut, Mail, Phone, Package, CheckCircle2, Pencil, AlertTriangle,
} from 'lucide-react';
import { Listing, SellerProfile, AuthSession } from '../types';
import { api } from '../services/api';
import { NotificationSettings } from './shared/PushOptIn';
import { ReportModal } from './shared/ReportModal';
import { Modal, ErrorBanner, SuccessBanner, Field } from './shared/Modal';
import { ProfileEditor } from './shared/ProfileEditor';
import { formatPrice } from '../utils/currency';

interface ProfileScreenProps {
  listings: Listing[];
  onBack: () => void;
  onSelectListing: (listing: Listing) => void;
  onNavigateToSell: () => void;
  onOpenChatWithSeller?: (seller: SellerProfile) => void;
  initialSellerId?: string;
  currentUser: AuthSession;
  onOpenAuthModal: () => void;
  onNavigateToSaved?: () => void;
  onNavigateToOrders?: () => void;
  onLogout?: () => void;
  /** Re-reads the session after a profile edit so the change is reflected. */
  onProfileUpdated?: () => void;
}

interface SellerStats {
  activeListings: number;
  soldListings: number;
  completedDeals: number;
  ratingAvg: number;
  reviewsCount: number;
}

interface ReviewRow {
  id: string;
  reviewer: { id: string; name: string; avatarUrl?: string };
  rating: number;
  comment?: string;
  createdAt: string;
}

export const ProfileScreen: React.FC<ProfileScreenProps> = ({
  onBack,
  onSelectListing,
  onNavigateToSell,
  onOpenChatWithSeller,
  initialSellerId,
  currentUser,
  onOpenAuthModal,
  onNavigateToSaved,
  onNavigateToOrders,
  onLogout,
  onProfileUpdated,
}) => {
  const [profile, setProfile] = useState<SellerProfile | null>(null);
  const [stats, setStats] = useState<SellerStats | null>(null);
  const [profileListings, setProfileListings] = useState<Listing[]>([]);
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [isSelf, setIsSelf] = useState(false);
  const [activeTab, setActiveTab] = useState<'active' | 'sold' | 'reviews'>('active');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [reportOpen, setReportOpen] = useState(false);
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [banOpen, setBanOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [durationDays, setDurationDays] = useState('7');
  const [busy, setBusy] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const isGuest = currentUser.role === 'guest';
  const isAdmin = currentUser.role === 'admin';
  const targetId = initialSellerId || currentUser.id;

  const load = async () => {
    if (isGuest && !initialSellerId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const res = await api.users.getById(targetId);
    if (res.error) {
      setError(res.error);
    } else {
      setProfile(res.user || null);
      setStats(res.stats || null);
      setProfileListings(res.listings || []);
      setIsSelf(res.isSelf);
      setError(null);
    }
    const rev = await api.users.reviews(targetId);
    setReviews((rev.reviews as ReviewRow[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [targetId]);

  const runAdminAction = async (kind: 'suspend' | 'ban') => {
    if (!reason.trim()) {
      setError('A reason is required and goes into the audit log.');
      return;
    }
    setBusy(true);
    const res =
      kind === 'suspend'
        ? await api.admin.suspendUser(targetId, reason.trim(), parseInt(durationDays, 10) || 7)
        : await api.admin.banUser(targetId, reason.trim());
    setBusy(false);
    if (res.success) {
      setNotice(res.message || 'Done.');
      setSuspendOpen(false);
      setBanOpen(false);
      setReason('');
      load();
    } else {
      setError(res.error || 'That action failed.');
    }
  };

  const handleLogout = async () => {
    if (onLogout) return onLogout();
    await api.auth.logout();
    window.location.assign('/browse');
  };

  /* ── Loading skeleton — mirrors the page's actual shape (avatar, name, stats) ── */
  if (loading) {
    return (
      <div className="min-h-screen bg-[#f8f9ff]">
        <div className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-[#c3c6d7]/60 px-4 py-3 flex items-center">
          <div className="p-2 -ml-2"><ArrowLeft className="w-5 h-5 text-[#dbe1ff]" /></div>
          <div className="h-4 w-28 bg-[#eff4ff] rounded animate-pulse ml-2" />
        </div>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-10 flex flex-col items-center">
          <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-[#eff4ff] animate-pulse" />
          <div className="h-6 w-40 bg-[#eff4ff] rounded animate-pulse mt-4" />
          <div className="h-3.5 w-28 bg-[#eff4ff] rounded animate-pulse mt-3" />
          <div className="grid grid-cols-3 gap-3 w-full max-w-sm mt-6">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-16 bg-white border border-[#e5eeff] rounded-2xl animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-[#f8f9ff] flex items-center justify-center p-6">
        <div className="bg-white border border-[#e5eeff] rounded-3xl p-8 max-w-md text-center shadow-card">
          <h2 className="text-lg font-bold text-[#0b1c30] mb-2">Profile unavailable</h2>
          <p className="text-sm text-[#737686] mb-6">{error || 'Log in to view your profile.'}</p>
          <button onClick={isGuest ? onOpenAuthModal : onBack} className="btn-primary !rounded-xl !text-sm px-6">
            {isGuest ? 'Log in' : 'Go back'}
          </button>
        </div>
      </div>
    );
  }

  const activeListings = profileListings.filter((l) => l.badgeText !== 'Sold');
  const soldListings = profileListings.filter((l) => l.badgeText === 'Sold');
  const shown = activeTab === 'sold' ? soldListings : activeListings;

  // Reviews only ever rate sellers, so a profile that has never listed or sold
  // anything shows no rating and no Reviews tab - an empty "0.0 (0 reviews)"
  // on a pure buyer reads as a bad score rather than as "not applicable".
  const isSellerProfile =
    reviews.length > 0 ||
    (profile.reviewsCount ?? 0) > 0 ||
    profileListings.length > 0 ||
    (stats?.activeListings ?? 0) > 0 ||
    (stats?.soldListings ?? 0) > 0;

  const tabs: { key: 'active' | 'sold' | 'reviews'; label: string; count: number }[] = [
    { key: 'active', label: 'Listings', count: activeListings.length },
    { key: 'sold', label: 'Sold', count: soldListings.length },
    ...(isSellerProfile
      ? [{ key: 'reviews' as const, label: 'Reviews', count: reviews.length }]
      : []),
  ];

  const tabCls = (active: boolean) =>
    `shrink-0 flex items-center gap-1.5 px-5 py-3 font-semibold text-sm transition-all duration-150 border-b-2 ${active ? 'text-[#2563eb] border-[#2563eb]' : 'text-[#737686] border-transparent hover:text-[#0b1c30]'
    }`;

  return (
    <div className="min-h-screen bg-[#f8f9ff] pb-28">
      <div className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-[#c3c6d7]/60 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center space-x-3 min-w-0">
          <button onClick={onBack} aria-label="Back" className="p-2 -ml-2 rounded-full hover:bg-[#eff4ff] text-[#434655] hover:text-[#2563eb] shrink-0">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <span className="text-base font-bold text-[#0b1c30] truncate">
            {isSelf ? 'My profile' : `${profile.name}'s profile`}
          </span>
        </div>

        <div className="flex items-center space-x-2 shrink-0">
          {isSelf && currentUser && (
            <button
              onClick={() => setEditOpen(true)}
              className="px-3 py-1.5 rounded-full text-xs font-bold bg-[#0b1c30] text-white hover:bg-[#213145] flex items-center gap-1"
            >
              <Pencil className="w-3.5 h-3.5" />
              <span>Edit profile</span>
            </button>
          )}
          {/* The bottom bar is full at five slots, so Orders lives here - this
              screen is the account hub on mobile, where the desktop account
              menu isn't available. */}
          {isSelf && onNavigateToOrders && (
            <button
              onClick={onNavigateToOrders}
              className="px-3 py-1.5 rounded-full text-xs font-bold bg-[#eff4ff] text-[#2563eb] hover:bg-[#dbe1ff] flex items-center gap-1"
            >
              <Package className="w-3.5 h-3.5" />
              <span>Orders</span>
              {(currentUser?.openOrders ?? 0) > 0 && (
                <span className="ml-0.5 bg-[#2563eb] text-white text-[9px] font-bold min-w-[16px] h-4 px-1 rounded-full flex items-center justify-center">
                  {currentUser?.openOrders}
                </span>
              )}
            </button>
          )}
          {isSelf && onNavigateToSaved && (
            <button onClick={onNavigateToSaved} className="px-3 py-1.5 rounded-full text-xs font-bold bg-[#eff4ff] text-[#2563eb] hover:bg-[#dbe1ff] flex items-center space-x-1">
              <Heart className="w-3.5 h-3.5 fill-[#2563eb]" />
              <span>Saved</span>
            </button>
          )}
          <button
            onClick={() => { navigator.clipboard.writeText(window.location.href); setNotice('Profile link copied.'); }}
            aria-label="Share profile"
            className="p-2 rounded-full bg-[#f8f9ff] border border-[#c3c6d7] hover:bg-[#eff4ff] text-[#434655]"
            title="Share profile"
          >
            <Share2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-8">
        <ErrorBanner message={error} />
        <SuccessBanner message={notice} />

        {/* A phone number is what makes a handover actually happen, so its
            absence is worth interrupting for - but as a prompt, not a wall:
            locking someone out of their own profile page to demand it would
            be the one screen where they could go and add it. */}
        {isSelf && !isAdmin && !currentUser.phoneVerified && (
          <div className="mb-5 flex items-start gap-3 rounded-2xl bg-amber-50 border border-amber-200 px-4 py-3.5">
            <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-amber-900">
                {currentUser.phone ? 'Confirm your phone number' : 'Add your phone number'}
              </p>
              <p className="text-xs text-amber-800 mt-0.5 leading-relaxed">
                Buyers and sellers use it to reach you when arranging a handover. We send a code to
                check it works.
              </p>
            </div>
            <button
              onClick={() => setEditOpen(true)}
              className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shrink-0 transition-colors"
            >
              {currentUser.phone ? 'Verify' : 'Add number'}
            </button>
          </div>
        )}

        <div className="flex flex-col items-center text-center">
          <div className="relative">
            <img src={profile.avatar} alt={profile.name} className="w-24 h-24 sm:w-28 sm:h-28 rounded-full object-cover ring-4 ring-white shadow-[0_4px_20px_0_rgba(37,99,235,0.15)] bg-[#e5eeff]" />
            {profile.verified && (
              <div className="absolute bottom-1 right-1 w-7 h-7 rounded-full bg-[#2563eb] text-white flex items-center justify-center ring-2 ring-white">
                <ShieldCheck className="w-4 h-4" />
              </div>
            )}
          </div>

          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#0b1c30] mt-4">{profile.name}</h1>
          {profile.verified && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-[#dbe1ff] text-[#004ac6] text-xs font-bold mt-1.5">
              <ShieldCheck className="w-3.5 h-3.5 mr-1" /> Verified student
            </span>
          )}
          <p className="text-sm text-[#737686] mt-2 font-medium">
            {profile.department}{profile.year ? ` • ${profile.year}` : ''}
          </p>
          {profile.bio && <p className="text-sm text-[#434655] mt-2 max-w-md">{profile.bio}</p>}

          <div className="flex items-center justify-center space-x-5 mt-2 text-xs text-[#737686] font-medium">
            {isSellerProfile && (
              <div className="flex items-center text-amber-500 font-bold">
                <Star className="w-4 h-4 fill-amber-400 text-amber-400 mr-1" />
                <span>{Number(profile.rating || 0).toFixed(1)}</span>
                <span className="text-[#737686] font-normal ml-1">({profile.reviewsCount} reviews)</span>
              </div>
            )}
            <div className="flex items-center">
              <Calendar className="w-3.5 h-3.5 mr-1" />
              <span>{profile.joinedDate}</span>
            </div>
          </div>

          {/* Contact details only exist on the payload when the API permits them. */}
          {(profile.email || profile.phone) && (
            <div className="mt-3 flex flex-wrap items-center justify-center gap-3 text-xs text-[#434655] bg-white border border-[#e5eeff] rounded-xl px-4 py-2 shadow-card">
              {profile.email && <span className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5 text-[#2563eb]" />{profile.email}</span>}
              {profile.phone && <span className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5 text-[#2563eb]" />{profile.phone}</span>}
            </div>
          )}

          {stats && (
            <div className="grid grid-cols-3 gap-3 w-full max-w-sm mt-5">
              {[
                { label: 'Active', value: stats.activeListings },
                { label: 'Sold', value: stats.soldListings },
                { label: 'Deals', value: stats.completedDeals },
              ].map((s) => (
                <div key={s.label} className="bg-white border border-[#e5eeff] rounded-2xl py-3 shadow-card">
                  <div className="text-xl font-extrabold text-[#0b1c30]">{s.value}</div>
                  <div className="text-[11px] text-[#737686] font-semibold uppercase tracking-wider">{s.label}</div>
                </div>
              ))}
            </div>
          )}

          <div className="w-full max-w-sm mt-5 flex items-center gap-3">
            {isSelf ? (
              <>
                <button onClick={onNavigateToSell} className="btn-primary flex-1 !rounded-xl">
                  <Package className="w-4 h-4" />
                  <span>New listing</span>
                </button>
                <button
                  onClick={handleLogout}
                  className="px-4 h-12 rounded-xl border border-[#c3c6d7] bg-white hover:bg-red-50 hover:border-red-200 hover:text-red-600 text-[#434655] font-semibold text-sm flex items-center gap-2 shrink-0"
                >
                  <LogOut className="w-4 h-4" /> Log out
                </button>
              </>
            ) : isGuest ? (
              <button onClick={onOpenAuthModal} className="btn-primary flex-1 !rounded-xl">
                <Lock className="w-4 h-4" />
                <span>Log in to contact</span>
              </button>
            ) : isAdmin ? (
              <div className="flex items-center gap-3 w-full">
                <button onClick={() => { setReason(''); setSuspendOpen(true); }} className="flex-1 h-12 px-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-sm">
                  Suspend
                </button>
                <button onClick={() => { setReason(''); setBanOpen(true); }} className="flex-1 h-12 px-3 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-sm">
                  Ban
                </button>
              </div>
            ) : (
              <>
                <button onClick={() => onOpenChatWithSeller?.(profile)} className="btn-primary flex-1 !rounded-xl">
                  <MessageSquare className="w-4 h-4" />
                  <span>Contact</span>
                </button>
                <button
                  onClick={() => setReportOpen(true)}
                  aria-label="Report this user"
                  className="p-3 h-12 w-12 flex items-center justify-center rounded-xl border border-[#c3c6d7] bg-white hover:bg-red-50 hover:border-red-200 hover:text-red-600 text-[#434655] shrink-0"
                  title="Report this user"
                >
                  <Flag className="w-5 h-5" />
                </button>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center border-b border-[#c3c6d7]/60 mt-8 -mx-4 sm:-mx-6 px-4 sm:px-6 overflow-x-auto no-scrollbar">
          {tabs.map(({ key, label, count }) => (
            <button key={key} onClick={() => setActiveTab(key)} className={tabCls(activeTab === key)}>
              {label}
              <span className={`px-1.5 py-0.5 rounded-full text-[11px] font-bold ${activeTab === key ? 'bg-[#eff4ff] text-[#2563eb]' : 'bg-[#f1f2f7] text-[#737686]'
                }`}>
                {count}
              </span>
            </button>
          ))}
        </div>

        {activeTab === 'reviews' ? (
          <div className="mt-5 space-y-3 pb-6">
            {reviews.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-3xl border border-[#e5eeff] shadow-card">
                <Star className="w-8 h-8 text-[#b4c5ff] mx-auto mb-2" />
                <p className="text-sm font-bold text-[#0b1c30]">No reviews yet</p>
                <p className="text-xs text-[#737686] mt-1">Reviews appear after a completed deal.</p>
              </div>
            ) : (
              reviews.map((r) => (
                <div key={r.id} className="bg-white rounded-2xl border border-[#e5eeff] p-4 shadow-card">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <img src={r.reviewer.avatarUrl} alt="" className="w-9 h-9 rounded-full object-cover bg-[#e5eeff]" />
                      <div>
                        <p className="font-bold text-sm text-[#0b1c30]">{r.reviewer.name}</p>
                        <div className="flex items-center gap-0.5">
                          {[1, 2, 3, 4, 5].map((n) => (
                            <Star key={n} className={`w-3.5 h-3.5 ${n <= r.rating ? 'fill-amber-400 text-amber-400' : 'text-[#c3c6d7]'}`} />
                          ))}
                        </div>
                      </div>
                    </div>
                    <span className="text-[11px] text-[#737686] shrink-0">{new Date(r.createdAt).toLocaleDateString()}</span>
                  </div>
                  {r.comment && <p className="text-sm text-[#434655] mt-3">{r.comment}</p>}
                </div>
              ))
            )}
          </div>
        ) : (
          <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-4 pb-6">
            {shown.length === 0 ? (
              <div className="sm:col-span-2 text-center py-12 bg-white rounded-3xl border border-[#e5eeff] shadow-card">
                <Package className="w-8 h-8 text-[#b4c5ff] mx-auto mb-2" />
                <p className="text-sm font-bold text-[#0b1c30]">Nothing to show here</p>
              </div>
            ) : (
              shown.map((item) => (
                <div
                  key={item.id}
                  onClick={() => onSelectListing(item)}
                  className="bg-white rounded-2xl border border-[#e5eeff] p-3.5 shadow-card hover:shadow-card-hover hover:-translate-y-0.5 transition-all duration-200 cursor-pointer group flex space-x-3"
                >
                  <div className="relative w-24 h-24 rounded-xl overflow-hidden bg-[#e5eeff] shrink-0">
                    <img src={item.image} alt={item.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200" />
                  </div>
                  <div className="flex-1 flex flex-col justify-between min-w-0">
                    <div>
                      <h3 className="font-bold text-[#0b1c30] text-sm line-clamp-1 group-hover:text-[#2563eb]">{item.title}</h3>
                      <p className="text-xs text-[#737686] mt-1">{item.location}</p>
                      {item.badgeText === 'Sold' && (
                        <span className="inline-flex items-center gap-1 mt-1 text-[10px] font-bold text-[#006242]">
                          <CheckCircle2 className="w-3 h-3" /> Sold
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-[#2563eb] font-extrabold text-base">{formatPrice(item.price)}</span>
                      <span className="text-xs text-[#737686] font-medium">{item.postedAt}</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Only on your own profile: these are account settings, not public detail. */}
        {isSelf && (
          <div className="pb-8">
            <NotificationSettings />
          </div>
        )}
      </div>

      <ProfileEditor
        isOpen={editOpen}
        onClose={() => setEditOpen(false)}
        currentUser={currentUser}
        onSaved={() => { onProfileUpdated?.(); load(); }}
      />

      <ReportModal
        isOpen={reportOpen}
        onClose={() => setReportOpen(false)}
        targetType="USER"
        targetId={targetId}
        targetLabel={profile.name}
      />

      <Modal
        isOpen={suspendOpen}
        onClose={() => setSuspendOpen(false)}
        title={`Suspend ${profile.name}`}
        subtitle="They keep their account but cannot post or transact until it lifts."
        footer={
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => setSuspendOpen(false)} className="btn-ghost !rounded-xl !text-sm">Cancel</button>
            <button onClick={() => runAdminAction('suspend')} disabled={busy} className="px-4 py-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-semibold text-sm">
              {busy ? 'Working…' : 'Suspend'}
            </button>
          </div>
        }
      >
        <Field label="Reason (recorded in the audit log)">
          <input value={reason} onChange={(e) => setReason(e.target.value)} className="input-base text-sm" placeholder="Policy violation reported" />
        </Field>
        <Field label="Duration (days)">
          <input type="number" min={1} value={durationDays} onChange={(e) => setDurationDays(e.target.value)} className="input-base text-sm" />
        </Field>
      </Modal>

      <Modal
        isOpen={banOpen}
        onClose={() => setBanOpen(false)}
        title={`Ban ${profile.name}?`}
        subtitle="Their sessions end immediately and their listings are hidden. This is not automatically reversible."
        footer={
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => setBanOpen(false)} className="btn-ghost !rounded-xl !text-sm">Cancel</button>
            <button onClick={() => runAdminAction('ban')} disabled={busy} className="px-4 py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold text-sm">
              {busy ? 'Working…' : 'Ban permanently'}
            </button>
          </div>
        }
      >
        <Field label="Reason (recorded in the audit log)">
          <input value={reason} onChange={(e) => setReason(e.target.value)} className="input-base text-sm" placeholder="Severe violation or scam" />
        </Field>
      </Modal>
    </div>
  );
};
