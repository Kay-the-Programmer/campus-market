import React, { useEffect, useMemo, useState } from 'react';
import {
  Bell, ArrowLeft, MessageSquare, ShoppingBag, ShieldCheck, Info, CheckCheck, Inbox,
  Star, TrendingDown,
} from 'lucide-react';
import { NotificationItem } from '../types';
import { api } from '../services/api';
import { PushOptIn } from './shared/PushOptIn';
import { useToast } from './shared/ToastProvider';

interface NotificationsScreenProps {
  onBack: () => void;
  onNavigateToLink?: (link: string) => void;
}

type FilterKey = 'all' | 'unread' | 'message' | 'order' | 'moderation' | 'review' | 'price-drop';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'unread', label: 'Unread' },
  { key: 'message', label: 'Messages' },
  { key: 'order', label: 'Orders' },
  { key: 'price-drop', label: 'Price drops' },
  { key: 'review', label: 'Reviews' },
  { key: 'moderation', label: 'Moderation' },
];

/* Per-type visual identity, kept in one place so icon, accent bar,
   and filter chip always agree with each other. */
const TYPE_STYLES: Record<string, { icon: React.ReactNode; iconBg: string; accent: string; dot: string }> = {
  message: {
    icon: <MessageSquare className="w-[18px] h-[18px] text-[#2563eb]" />,
    iconBg: 'bg-[#eff4ff]',
    accent: 'before:bg-[#2563eb]',
    dot: 'bg-[#2563eb]',
  },
  order: {
    icon: <ShoppingBag className="w-[18px] h-[18px] text-[#007d55]" />,
    iconBg: 'bg-[#e6faf1]',
    accent: 'before:bg-[#007d55]',
    dot: 'bg-[#007d55]',
  },
  moderation: {
    icon: <ShieldCheck className="w-[18px] h-[18px] text-[#8455ef]" />,
    iconBg: 'bg-[#f2ecff]',
    accent: 'before:bg-[#8455ef]',
    dot: 'bg-[#8455ef]',
  },
  review: {
    icon: <Star className="w-[18px] h-[18px] text-[#d97706]" />,
    iconBg: 'bg-[#fff5e5]',
    accent: 'before:bg-[#d97706]',
    dot: 'bg-[#d97706]',
  },
  'price-drop': {
    icon: <TrendingDown className="w-[18px] h-[18px] text-[#007d55]" />,
    iconBg: 'bg-[#e6faf1]',
    accent: 'before:bg-[#007d55]',
    dot: 'bg-[#007d55]',
  },
  default: {
    icon: <Info className="w-[18px] h-[18px] text-[#737686]" />,
    iconBg: 'bg-[#f1f2f7]',
    accent: 'before:bg-[#c3c6d7]',
    dot: 'bg-[#737686]',
  },
};

const getTypeStyle = (type: string) => TYPE_STYLES[type] ?? TYPE_STYLES.default;

export const NotificationsScreen: React.FC<NotificationsScreenProps> = ({ onBack, onNavigateToLink }) => {
  const toast = useToast();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>('all');

  const loadNotifications = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.notifications.getAll();
      if (res.error) setError(res.error);
      else setNotifications(res.notifications || []);
    } catch (e) {
      setError('Failed to load notifications.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadNotifications(); }, []);

  const handleMarkRead = async (id: string) => {
    await api.notifications.markRead(id);
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  };

  const handleMarkAllRead = async () => {
    const res = await api.notifications.markAllRead();
    if (res.data?.success ?? res.ok) {
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      toast.success('All notifications marked as read.');
    } else {
      toast.error('Could not mark them all as read.');
    }
  };

  /**
   * A notification outlives what it points at. The API clears `link` when the
   * target is gone, so the row stays but stops being a dead end (workflow 18).
   */
  const handleOpen = (item: NotificationItem) => {
    if (!item.read) handleMarkRead(item.id);
    if (item.link) {
      onNavigateToLink?.(item.link);
    } else {
      toast.info('That item is no longer available.');
    }
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  /* Counts per filter chip, computed once per notifications change. */
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: notifications.length, unread: unreadCount };
    for (const n of notifications) c[n.type] = (c[n.type] ?? 0) + 1;
    return c;
  }, [notifications, unreadCount]);

  const visible = useMemo(() => {
    if (filter === 'all') return notifications;
    if (filter === 'unread') return notifications.filter((n) => !n.read);
    return notifications.filter((n) => n.type === filter);
  }, [notifications, filter]);

  /* ── Loading skeleton ── */
  if (loading) {
    return (
      <div className="min-h-screen bg-[#f8f9ff] py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <div className="h-4 w-16 bg-[#e5eeff] rounded animate-pulse" />
            <div className="h-7 w-40 bg-[#e5eeff] rounded animate-pulse" />
          </div>
          <div className="space-y-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-2xl p-4 flex items-start gap-3.5 shadow-card">
                <div className="w-10 h-10 rounded-xl bg-[#f1f2f7] animate-pulse shrink-0" />
                <div className="flex-1 space-y-2 py-0.5">
                  <div className="h-3.5 w-1/3 bg-[#f1f2f7] rounded animate-pulse" />
                  <div className="h-3 w-2/3 bg-[#f1f2f7] rounded animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#f8f9ff] flex items-center justify-center p-6">
        <div className="bg-white border border-red-100 rounded-3xl p-10 max-w-md text-center shadow-card">
          <div className="w-12 h-12 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <Info className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-[#0b1c30] mb-2">Couldn't load notifications</h2>
          <p className="text-sm text-[#737686] mb-6">{error}</p>
          <button onClick={onBack} className="btn-primary !rounded-xl">Go back</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8f9ff] py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">

        {/* ── Header ── */}
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-[#434655] hover:text-[#2563eb] transition-colors duration-150 font-medium text-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back</span>
          </button>

          <div className="flex items-center gap-2.5">
            <div className="relative">
              <Bell className="w-5 h-5 text-[#2563eb]" />
              {unreadCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-[#2563eb] text-white text-[10px] font-bold flex items-center justify-center">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </div>
            <h1 className="text-xl font-bold tracking-tight text-[#0b1c30]">Notifications</h1>
          </div>
        </div>

        {/* Asks once, and only where notifications are already the subject. */}
        <PushOptIn />

        {/* ── Filter chips + mark all read ── */}
        <div className="flex items-center justify-between gap-3 mb-5">
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {FILTERS.map(({ key, label }) => {
              const count = counts[key] ?? 0;
              const active = filter === key;
              if (key !== 'all' && key !== 'unread' && count === 0) return null;
              return (
                <button
                  key={key}
                  onClick={() => setFilter(key)}
                  className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-colors duration-150 ${active
                      ? 'bg-[#0b1c30] text-white'
                      : 'bg-white text-[#434655] border border-[#e5eeff] hover:bg-[#eff4ff]'
                    }`}
                >
                  {label}
                  {key === 'unread' && count > 0 ? ` · ${count}` : ''}
                </button>
              );
            })}
          </div>

          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllRead}
              className="shrink-0 px-3 py-1.5 rounded-full text-xs font-bold text-[#2563eb] hover:bg-[#eff4ff] flex items-center gap-1.5 transition-colors duration-150"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Mark all as read</span>
            </button>
          )}
        </div>

        {/* ── List / empty states ── */}
        {notifications.length === 0 ? (
          <div className="bg-white border border-[#e5eeff] rounded-3xl p-16 text-center shadow-card">
            <div className="w-16 h-16 bg-[#eff4ff] text-[#2563eb] rounded-full flex items-center justify-center mx-auto mb-4">
              <Bell className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-bold text-[#0b1c30] mb-2">All caught up</h2>
            <p className="text-[#737686] max-w-sm mx-auto text-sm">You have no notifications right now — new activity will show up here.</p>
          </div>
        ) : visible.length === 0 ? (
          <div className="bg-white border border-[#e5eeff] rounded-3xl p-14 text-center shadow-card">
            <div className="w-14 h-14 bg-[#f1f2f7] text-[#737686] rounded-full flex items-center justify-center mx-auto mb-4">
              <Inbox className="w-7 h-7" />
            </div>
            <h2 className="text-base font-bold text-[#0b1c30] mb-1.5">Nothing here</h2>
            <p className="text-[#737686] max-w-sm mx-auto text-sm">
              No notifications match this filter.{' '}
              <button onClick={() => setFilter('all')} className="text-[#2563eb] font-semibold hover:underline">
                Show all
              </button>
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {visible.map((item) => {
              const { icon, iconBg, accent, dot } = getTypeStyle(item.type);
              return (
                <div
                  key={item.id}
                  onClick={() => handleOpen(item)}
                  className={`relative bg-white rounded-2xl pl-5 pr-4 py-3.5 flex items-start gap-3.5 cursor-pointer transition-all duration-200 shadow-card hover:shadow-card-hover hover:-translate-y-0.5 overflow-hidden before:absolute before:left-0 before:top-0 before:bottom-0 before:w-1 ${accent} ${item.read ? 'opacity-75 hover:opacity-100' : 'ring-1 ring-[#dbe1ff]'
                    }`}
                >
                  <div className={`w-9 h-9 rounded-xl ${iconBg} flex items-center justify-center shrink-0`}>
                    {icon}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-bold text-[#0b1c30] text-sm leading-snug">{item.title}</h3>
                      {!item.read && <span className={`w-2 h-2 rounded-full shrink-0 mt-1.5 ${dot}`} title="Unread" />}
                    </div>
                    <p className="text-xs text-[#434655] mt-0.5 leading-relaxed">{item.message}</p>
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <span className="text-[11px] font-medium text-[#a0a3b1]">{item.time}</span>
                      {!item.link && (
                        <>
                          <span className="text-[11px] text-[#c3c6d7]">·</span>
                          <span className="text-[11px] italic text-[#a0a3b1]">no longer available</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};