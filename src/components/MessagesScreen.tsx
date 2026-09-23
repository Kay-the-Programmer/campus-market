import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  MessageSquare, Send, ArrowLeft, ShoppingBag, History, Loader2, Tag, Star,
  CheckCircle2, Search, X, Check, CheckCheck, Clock, AlertCircle, ChevronDown,
} from 'lucide-react';
import { api } from '../services/api';
import { useLiveCounts } from '../hooks/useLiveCounts';
import { MarkSoldModal } from './shared/MarkSoldModal';
import { ReviewModal } from './shared/ReviewModal';
import { ErrorBanner } from './shared/Modal';
import { formatPrice } from '../utils/currency';
import { ListingImage } from './shared/ListingImage';

interface MessagesScreenProps {
  initialTab?: 'history' | 'chat';
  /** Thread to open on arrival - set when we came from a listing's chat button. */
  initialConversationId?: string;
  onBack?: () => void;
  /** Optional - lets the pinned listing bar deep-link back to the listing. */
  onViewListing?: (listingId: string) => void;
}

interface ThreadSummary {
  id: string;
  peer: { id: string; name: string; avatarUrl?: string };
  listing: { id: string; title: string; price: number; image?: string; removed: boolean };
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
  role: 'Buying' | 'Selling' | 'Mediating';
}

interface ThreadDetail {
  id: string;
  peer: { id: string; name: string; avatarUrl?: string };
  listing: { id: string; title: string; price: number; image?: string; status: string; removed: boolean };
  role: 'Buying' | 'Selling' | 'Mediating';
  canMarkSold: boolean;
  messages: { id: string; senderId: string; mine: boolean; body: string; createdAt: string; readAt?: string | null }[];
}

interface DealRow {
  id: string;
  listing: { id: string; title: string; price: number; image?: string; removed: boolean };
  counterparty: { id: string; name: string; avatarUrl?: string };
  role: 'buyer' | 'seller';
  price: number;
  status: string;
  reviewSubmitted: boolean;
  createdAt: string;
}

type ThreadFilter = 'all' | 'unread' | 'buying' | 'selling';

/** How often the open conversation re-reads itself. Fast enough to feel like
 *  delivery, slow enough to stay a poll. */
const OPEN_THREAD_POLL_MS = 5_000;

const LISTING_STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'Available',
  RESERVED: 'Reserved',
  SOLD: 'Sold',
  DRAFT: 'Draft',
};

const clock = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

/** Short relative timestamp for the thread list, e.g. "2m ago", "Yesterday". */
const relativeShort = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const minutes = Math.floor((Date.now() - d.getTime()) / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

/** "Today" / "Yesterday" / short date - buckets the message list like a real chat client. */
const dayLabel = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOf(new Date()) - startOf(d)) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
};

const timeOnly = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

/**
 * A message the viewer has sent that the server has not confirmed yet.
 *
 * <p>Sending used to be: POST, wait, refetch the entire thread, re-render. On
 * campus wifi that is a second or more where the composer has emptied and
 * nothing has appeared - which reads as a dropped message, so people send it
 * twice. Every chat app people actually use paints the bubble immediately and
 * settles the truth behind it, and that single difference is most of what
 * "feels native" means here.
 */
interface OutboxMessage {
  clientId: string;
  threadId: string;
  body: string;
  createdAt: string;
  state: 'sending' | 'failed';
}

/** One row in the rendered transcript: a real message or an unconfirmed one. */
interface UiMessage {
  key: string;
  mine: boolean;
  body: string;
  createdAt: string;
  readAt?: string | null;
  pending?: 'sending' | 'failed';
  clientId?: string;
  /** First / last of a run by the same sender, for bubble tails and spacing. */
  firstOfRun: boolean;
  lastOfRun: boolean;
}

/**
 * The state of one outgoing message, as a glyph.
 *
 * <p>Clock while it is in flight, one tick once the server has it, two
 * coloured ticks once the other person has opened the thread. This replaced
 * the words " · Seen" appended to the timestamp, which only ever appeared on
 * the read state - so the three cases before it were indistinguishable from
 * each other and from a message that had silently failed.
 */
const DeliveryTick: React.FC<{ m: UiMessage }> = ({ m }) => {
  if (m.pending === 'sending') return <Clock className="w-3 h-3" />;
  if (m.pending === 'failed') return <AlertCircle className="w-3 h-3" />;
  if (m.readAt) return <CheckCheck className="w-3.5 h-3.5 text-[#9fd8ff]" />;
  return <Check className="w-3.5 h-3.5" />;
};

export const MessagesScreen: React.FC<MessagesScreenProps> = ({
  initialTab = 'chat', initialConversationId, onBack, onViewListing,
}) => {
  const [mainMode, setMainMode] = useState<'history' | 'chat'>(initialTab);

  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [thread, setThread] = useState<ThreadDetail | null>(null);
  // Tracks the mobile slide-over independently of `thread`, so the first
  // conversation can still preload for desktop without popping over the list
  // on a phone the moment the screen opens.
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const [threadFilter, setThreadFilter] = useState<ThreadFilter>('all');
  const [search, setSearch] = useState('');
  const [replyText, setReplyText] = useState('');
  const [outbox, setOutbox] = useState<OutboxMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  /*
   * The chat card is pinned to the viewport rather than allowed to grow.
   *
   * Every pane inside it already asked to scroll, but nothing above them had a
   * height to scroll WITHIN: the screen root is min-h-screen, which is a floor,
   * and the card was flex-1 with a min-height. So the card simply grew to fit
   * whatever arrived and the whole page lengthened - the thread list and the
   * message list ran on down the document instead of scrolling in place.
   *
   * The height is measured rather than hardcoded because what sits above it
   * varies: the nav shrinks from 64px to 56px on scroll, and the dev role bar
   * exists only in development. Subtracting a guessed constant would be right
   * in exactly one of those configurations.
   */
  const chatCardRef = useRef<HTMLDivElement>(null);
  const [chatCardHeight, setChatCardHeight] = useState<number>();

  /*
   * Newest message in view whenever a thread opens or grows.
   *
   * This only became necessary once the pane started scrolling. While the page
   * grew instead, the latest message was simply the bottom of the document and
   * you scrolled to it; a pane that scrolls internally opens at its top, which
   * on a chat means the oldest message - the one thing nobody came to read.
   */
  const messagePaneRef = useRef<HTMLDivElement>(null);

  /*
   * Whether the reader is at the live end of the conversation.
   *
   * Auto-scrolling on every arrival is right only while they are already at
   * the bottom. Someone scrolled up reading yesterday gets yanked to the
   * newest message mid-sentence otherwise - so above the threshold the new
   * message is announced with a pill instead, and they choose when to jump.
   * Mirrored into a ref because the scroll effects would close over a stale
   * copy of the state.
   */
  const [atBottom, setAtBottom] = useState(true);
  const atBottomRef = useRef(true);
  const setAtBottomBoth = React.useCallback((v: boolean) => {
    atBottomRef.current = v;
    setAtBottom(v);
  }, []);
  const [hasNewBelow, setHasNewBelow] = useState(false);

  const handlePaneScroll = React.useCallback(() => {
    const el = messagePaneRef.current;
    if (!el) return;
    // 80px of slack: a reader a line or two off the bottom still counts as
    // "at the end", which is how it feels to them.
    const gap = el.scrollHeight - el.scrollTop - el.clientHeight;
    const bottom = gap < 80;
    setAtBottomBoth(bottom);
    if (bottom) setHasNewBelow(false);
  }, [setAtBottomBoth]);

  const pinToNewest = React.useCallback(() => {
    const el = messagePaneRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    /*
     * Again after the frame settles. The pane's height is set from a
     * measurement that lands in a later commit, and a pinned scroll taken
     * before that arrives is computed against the wrong client height - which
     * silently leaves the view part-way up the conversation.
     */
    requestAnimationFrame(() => {
      const node = messagePaneRef.current;
      if (node) node.scrollTop = node.scrollHeight;
    });
  }, []);

  /** Pins on attach, so a thread that renders after its first paint still lands
   *  on the newest message. */
  const attachMessagePane = React.useCallback((node: HTMLDivElement | null) => {
    messagePaneRef.current = node;
    if (node) pinToNewest();
  }, [pinToNewest]);

  /* A different conversation always opens at its newest message. */
  React.useLayoutEffect(() => {
    setAtBottomBoth(true);
    setHasNewBelow(false);
    pinToNewest();
  }, [thread?.id, chatCardHeight, pinToNewest, setAtBottomBoth]);

  /* A new message follows the reader only if the reader is at the end. */
  const messageCount = thread?.messages.length ?? 0;
  React.useLayoutEffect(() => {
    if (atBottomRef.current) pinToNewest();
    else setHasNewBelow(true);
  }, [messageCount, outbox.length, pinToNewest]);

  const jumpToNewest = React.useCallback(() => {
    setAtBottomBoth(true);
    setHasNewBelow(false);
    const el = messagePaneRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [setAtBottomBoth]);

  const measureChatCard = React.useCallback(() => {
    const el = chatCardRef.current;
    if (!el) return;
    /*
     * Bottom gap clears the fixed mobile bottom bar; on desktop it is just
     * breathing room. Measured from the card's own position, so it stays
     * correct whatever is stacked above it.
     */
    const bottomGap = window.matchMedia('(min-width: 1024px)').matches ? 24 : 96;
    const available = window.innerHeight - el.getBoundingClientRect().top - bottomGap;
    // A floor, so a short window degrades to page scrolling rather than
    // collapsing the thread list to nothing.
    setChatCardHeight(Math.max(360, Math.round(available)));
  }, []);

  /*
   * A callback ref, not an effect, because the card is behind a loading gate:
   * threads have to arrive before it renders at all. An effect keyed on the
   * view mode ran on mount, found a null ref, measured nothing and never fired
   * again - so the card kept its natural height and the page kept growing.
   * This runs at the moment the element actually enters the DOM.
   */
  const attachChatCard = React.useCallback((node: HTMLDivElement | null) => {
    chatCardRef.current = node;
    if (!node) return;
    // The measurement reads a viewport-relative top, so it is only meaningful
    // from a known scroll position. Arriving from a scrolled feed would
    // otherwise measure the card as taller than the space it actually has.
    window.scrollTo(0, 0);
    measureChatCard();
  }, [measureChatCard]);

  React.useEffect(() => {
    window.addEventListener('resize', measureChatCard);
    window.addEventListener('orientationchange', measureChatCard);
    return () => {
      window.removeEventListener('resize', measureChatCard);
      window.removeEventListener('orientationchange', measureChatCard);
    };
  }, [measureChatCard]);

  const [deals, setDeals] = useState<DealRow[]>([]);
  const [historyRole, setHistoryRole] = useState<'buyer' | 'seller'>('buyer');
  const [reviewTarget, setReviewTarget] = useState<DealRow | null>(null);
  const [markSoldOpen, setMarkSoldOpen] = useState(false);

  /** @param silent skip the skeleton - used by the background refresh, where
   *  the list is already on screen. */
  const loadThreads = async (silent = false) => {
    if (!silent) setLoading(true);
    const res = await api.messages.getAll();
    /*
     * A silent refresh never raises a banner. These run on a timer and behind
     * ordinary actions, so a single dropped poll would otherwise announce a
     * failure over an inbox that is on screen and working. A silent success
     * still clears a stale banner, since it proves the connection is back.
     */
    if (!silent) setError(res.error || null);
    else if (!res.error) setError(null);

    const list = (res.threads as ThreadSummary[]) || [];
    setThreads(list);
    // Only the loading refresh may end the loading state: a silent poll
    // resolving first would drop the spinner on a still-empty list and flash
    // "No conversations yet" at someone who has plenty.
    if (!silent) setLoading(false);
    return list;
  };

  /*
   * The id of the thread on screen, mirrored into a ref.
   *
   * The pollers below are set up once and would otherwise close over whichever
   * thread was open when they were created, and keep refreshing that one after
   * the viewer moved on.
   */
  const openThreadIdRef = useRef<string | null>(null);

  /**
   * Re-read the thread already on screen.
   *
   * Silent, which is what makes this safe to poll: an announcing read would
   * wake the very listener that called it. The late-response guard matters on
   * a slow connection - a reply that lands after the viewer has switched
   * threads must not paint itself over the new one.
   */
  const refreshOpenThread = async (id: string) => {
    const res = await api.messages.getById(id, { silent: true });
    if (res.thread && openThreadIdRef.current === id) {
      setThread(res.thread as ThreadDetail);
    }
  };

  /*
   * Keeps the conversation list and the open thread current.
   *
   * The list alone was not enough: an incoming reply moved the preview and the
   * unread badge, but the pane the viewer was actually reading never re-read
   * itself, so a message sent while they sat on the thread simply never
   * arrived. The thread goes first so it is marked read before the counts that
   * describe it are fetched.
   */
  useLiveCounts({
    enabled: true,
    refresh: async () => {
      const id = openThreadIdRef.current;
      if (id) await refreshOpenThread(id);
      await loadThreads(true);
    },
  });

  /*
   * A faster beat for the open thread only.
   *
   * Thirty seconds is fine for a badge but reads as broken in a conversation,
   * where the other person is waiting on the reply. Only the open thread is
   * fetched at this rate, and only while the tab is visible.
   */
  useEffect(() => {
    if (!thread?.id) return;
    const tick = () => {
      if (document.visibilityState !== 'visible') return;
      const id = openThreadIdRef.current;
      if (id) refreshOpenThread(id);
    };
    const timer = setInterval(tick, OPEN_THREAD_POLL_MS);
    return () => clearInterval(timer);
  }, [thread?.id]);
  const openThread = async (id: string) => {
    // Set before the await: the pollers key off this, and a reply arriving
    // during a slow open should already be attributed to the right thread.
    openThreadIdRef.current = id;
    const res = await api.messages.getById(id);
    if (res.thread) {
      setThread(res.thread as ThreadDetail);
      /*
       * Opening marks the thread read server-side, so refresh the unread
       * badges - silently. `loading` gates the whole inbox, so a loud refresh
       * here replaced the conversation with "Loading conversations…" every
       * time a thread was opened and after every message sent, which is the
       * one moment the thread must stay put.
       */
      loadThreads(true);
    } else {
      setError(res.error || 'Could not open that conversation.');
    }
  };

  /** Explicit tap on a thread row - this is what should slide the mobile chat in. */
  const selectThread = (id: string) => {
    setMobileChatOpen(true);
    openThread(id);
  };

  const loadDeals = async () => {
    const res = await api.deals.getAll();
    setDeals((res.deals as DealRow[]) || []);
  };

  useEffect(() => {
    loadThreads().then((list) => {
      /*
       * A caller that names a thread gets that thread, and on a phone it opens
       * rather than sitting behind the list - arriving from "Chat Seller" and
       * being shown the inbox is a step the person did not ask for. Only the
       * unaddressed case falls back to the most recent conversation, which is
       * the useful default for someone who just tapped Messages.
       */
      if (initialConversationId && list.some((t) => t.id === initialConversationId)) {
        setMobileChatOpen(true);
        openThread(initialConversationId);
        return;
      }
      if (list.length > 0) openThread(list[0].id);
    });
    loadDeals();
  }, [initialConversationId]);

  /**
   * Put the message on screen, then send it.
   *
   * <p>The composer clears and the bubble appears in the same frame as the
   * tap; the network happens behind it, and the bubble carries its own state
   * (clock -> tick) rather than the screen carrying a spinner. Nothing is
   * disabled while it is in flight, so a fast typer can send three in a row
   * the way they can anywhere else.
   *
   * <p>The outbox entry is removed only AFTER the refreshed thread has come
   * back holding the real message. Dropping it on the success response alone
   * leaves a frame where the server copy has not arrived and the local copy is
   * already gone, which shows up as the message blinking out and back.
   */
  const deliver = async (threadId: string, clientId: string, body: string) => {
    const res = await api.messages.send(threadId, body);
    if (!res.success) {
      setOutbox((prev) => prev.map((o) => (o.clientId === clientId ? { ...o, state: 'failed' } : o)));
      return;
    }
    await refreshOpenThread(threadId);
    setOutbox((prev) => prev.filter((o) => o.clientId !== clientId));
    // The inbox preview and the unread badges describe this thread too.
    loadThreads(true);
  };

  const sendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = replyText.trim();
    if (!body || !thread) return;

    const clientId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setOutbox((prev) => [
      ...prev,
      { clientId, threadId: thread.id, body, createdAt: new Date().toISOString(), state: 'sending' },
    ]);
    setReplyText('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    // Sending is an act of joining the live end, whatever was being read.
    setAtBottomBoth(true);
    setHasNewBelow(false);
    requestAnimationFrame(pinToNewest);

    deliver(thread.id, clientId, body);
  };

  /** A failed bubble is a button; this is what it does. */
  const retrySend = (msg: { clientId?: string; body: string }) => {
    if (!msg.clientId || !thread) return;
    setOutbox((prev) =>
      prev.map((o) => (o.clientId === msg.clientId ? { ...o, state: 'sending' } : o)));
    deliver(thread.id, msg.clientId, msg.body);
  };

  /** Give up on a message that will not send, without leaving it stuck. */
  const discardFailed = (clientId?: string) => {
    if (!clientId) return;
    setOutbox((prev) => prev.filter((o) => o.clientId !== clientId));
  };

  const handleReplyKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendReply(e as unknown as React.FormEvent);
    }
  };

  const autoResize = (el: HTMLTextAreaElement) => {
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  };

  const filteredDeals = deals.filter((d) => d.role === historyRole);

  const visibleThreads = useMemo(() => {
    const q = search.trim().toLowerCase();
    return threads.filter((t) => {
      if (threadFilter === 'unread' && t.unreadCount === 0) return false;
      if (threadFilter === 'buying' && t.role !== 'Buying') return false;
      if (threadFilter === 'selling' && t.role !== 'Selling') return false;
      if (!q) return true;
      return (
        t.peer.name.toLowerCase().includes(q) ||
        t.listing.title.toLowerCase().includes(q) ||
        t.lastMessage.toLowerCase().includes(q)
      );
    });
  }, [threads, threadFilter, search]);

  /**
   * The transcript as it is drawn: server messages, then anything still in
   * flight, bucketed by day and annotated with where each message sits in a
   * run by the same sender.
   *
   * <p>The run flags are what turn a column of identical bubbles into
   * something that reads like a conversation. Six messages from one person
   * used to be six avatars, six tails and six timestamps - the same visual
   * weight as six separate turns. Only the last of a run gets a tail and an
   * avatar, and the ones before it sit tight against each other, which is
   * the shape every messaging app converged on.
   */
  const messageGroups = useMemo(() => {
    if (!thread) return [];

    const pending = outbox.filter((o) => o.threadId === thread.id);
    const flat: Omit<UiMessage, 'firstOfRun' | 'lastOfRun'>[] = [
      ...thread.messages.map((m) => ({
        key: m.id,
        mine: m.mine,
        body: m.body,
        createdAt: m.createdAt,
        readAt: m.readAt,
      })),
      ...pending.map((o) => ({
        key: o.clientId,
        clientId: o.clientId,
        mine: true,
        body: o.body,
        createdAt: o.createdAt,
        pending: o.state,
      })),
    ];

    const groups: { label: string; messages: UiMessage[] }[] = [];
    flat.forEach((m) => {
      const label = dayLabel(m.createdAt);
      const last = groups[groups.length - 1];
      const row: UiMessage = { ...m, firstOfRun: true, lastOfRun: true };
      if (last && last.label === label) last.messages.push(row);
      else groups.push({ label, messages: [row] });
    });

    // Second pass, once neighbours are known. A run never spans a day
    // divider, which is why this walks each group rather than the flat list.
    groups.forEach((g) => {
      g.messages.forEach((m, i) => {
        const prev = g.messages[i - 1];
        const next = g.messages[i + 1];
        m.firstOfRun = !prev || prev.mine !== m.mine;
        m.lastOfRun = !next || next.mine !== m.mine;
      });
    });

    return groups;
  }, [thread, outbox]);

  const tabCls = (active: boolean) =>
    `pb-3 font-semibold text-sm transition-all duration-150 ${active ? 'text-[#2563eb] border-b-2 border-[#2563eb]' : 'text-[#737686] hover:text-[#0b1c30]'
    }`;

  const filterPill = (active: boolean) =>
    `shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all duration-150 ${active ? 'bg-[#2563eb] text-white' : 'bg-[#f1f4fb] text-[#434655] hover:bg-[#e5eeff]'
    }`;

  return (
    /* min-h-full, not min-h-screen: this sits BELOW the nav, so demanding a
       full viewport of its own made the document taller than the screen by
       exactly the height of the chrome above it - the page scrolled by ~130px
       even once the chat card itself was bounded. */
    <div className="min-h-full bg-[#f8f9ff] flex flex-col">
      {/* Top bar: back + Deal History / Messages mode switch */}
      <div className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-[#c3c6d7]/60 px-4 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3">
            {onBack && (
              <button onClick={onBack} className="p-2 -ml-2 rounded-full hover:bg-[#eff4ff] text-[#434655] hover:text-[#2563eb]">
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            <h1 className="text-lg font-bold text-[#0b1c30] hidden sm:block">
              {mainMode === 'history' ? 'Deal History' : 'Messages'}
            </h1>
          </div>

          <div className="flex items-center bg-[#f8f9ff] border border-[#c3c6d7]/60 p-1 rounded-xl">
            {(['history', 'chat'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setMainMode(mode)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-all duration-150 ${mainMode === mode ? 'bg-white text-[#2563eb] shadow-card' : 'text-[#737686] hover:text-[#0b1c30]'
                  }`}
              >
                {mode === 'history' ? <History className="w-3.5 h-3.5" /> : <MessageSquare className="w-3.5 h-3.5" />}
                <span>{mode === 'history' ? 'Deal History' : 'Messages'}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {mainMode === 'history' ? (
        <div className="max-w-4xl mx-auto w-full px-4 sm:px-6 pt-6 pb-28">
          <ErrorBanner message={error} />

          <div className="flex items-center space-x-8 border-b border-[#c3c6d7]/60 mb-6">
            <button onClick={() => setHistoryRole('buyer')} className={tabCls(historyRole === 'buyer')}>As Buyer</button>
            <button onClick={() => setHistoryRole('seller')} className={tabCls(historyRole === 'seller')}>As Seller</button>
          </div>

          <div className="space-y-4">
            {filteredDeals.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-3xl border border-[#e5eeff] shadow-card">
                <ShoppingBag className="w-10 h-10 text-[#b4c5ff] mx-auto mb-2" />
                <h3 className="font-bold text-[#0b1c30]">No deal history found</h3>
                <p className="text-xs text-[#737686] mt-1">Completed transactions show up here.</p>
              </div>
            ) : (
              filteredDeals.map((deal) => (
                <div key={deal.id} className="bg-white rounded-2xl border border-[#e5eeff] p-4 shadow-card flex items-center justify-between gap-4">
                  <div className="flex items-center space-x-4 min-w-0">
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
                      <p className="text-xs text-[#737686] mt-0.5 truncate">
                        {deal.role === 'buyer' ? 'Seller' : 'Buyer'}:{' '}
                        <span className="font-semibold text-[#434655]">{deal.counterparty.name}</span>
                      </p>
                      <span className="inline-block px-2.5 py-0.5 rounded-full bg-[#eff4ff] text-[#2563eb] text-[10px] font-bold uppercase mt-1">
                        {deal.role === 'buyer' ? 'Bought' : 'Sold'} · {formatPrice(deal.price)}
                      </span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs text-[#737686] font-medium mb-1.5">{clock(deal.createdAt)}</div>
                    {/* Only buyers review sellers; sellers get no review control. */}
                    {deal.role === 'buyer' && (deal.reviewSubmitted ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#6ffbbe]/20 text-[#006242] text-xs font-bold border border-[#007d55]/20">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Reviewed
                      </span>
                    ) : (
                      <button
                        onClick={() => setReviewTarget(deal)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 text-xs font-bold border border-amber-200 hover:bg-amber-100"
                      >
                        <Star className="w-3.5 h-3.5" /> Leave a review
                      </button>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center py-24 text-[#737686] text-sm gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading conversations…
        </div>
      ) : threads.length === 0 ? (
        <div className="max-w-4xl mx-auto w-full px-4 sm:px-6 pt-6 pb-28">
          <div className="text-center py-16 bg-white rounded-3xl border border-[#e5eeff] shadow-card">
            <MessageSquare className="w-10 h-10 text-[#b4c5ff] mx-auto mb-2" />
            <h3 className="font-bold text-[#0b1c30]">No conversations yet</h3>
            <p className="text-xs text-[#737686] mt-1">Message a seller from any listing to get started.</p>
          </div>
        </div>
      ) : (
        <div className="max-w-6xl mx-auto w-full px-4 sm:px-6 pt-6 pb-28 lg:pb-6 flex-1 flex flex-col min-h-0">
          <ErrorBanner message={error} />

          {/* height is set from the measurement above; the fallback keeps the
              card sane for the single frame before it runs. */}
          <div
            ref={attachChatCard}
            style={{ height: chatCardHeight }}
            /* No flex-1: this is a flex ITEM in a column, where flex-basis
               governs the main size and would beat the height set above. It is
               still `flex` so its own two panes sit side by side. */
            className="relative bg-white rounded-3xl border border-[#e5eeff] shadow-card overflow-hidden min-h-[360px] flex"
          >
            {/* ------------------------------------------------ Master pane */}
            <div
              className={`w-full lg:w-[340px] shrink-0 lg:border-r border-[#e5eeff] flex-col min-h-0 ${mobileChatOpen ? 'hidden lg:flex' : 'flex'
                }`}
            >
              <div className="p-4 pb-3 border-b border-[#e5eeff] space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold text-[#0b1c30]">
                    Conversations <span className="text-[#a0a3b1] font-semibold">({threads.length})</span>
                  </h2>
                </div>

                <div className="relative">
                  <Search className="w-4 h-4 text-[#a0a3b1] absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search conversations…"
                    className="w-full pl-9 pr-8 py-2 bg-[#f8f9ff] border border-[#e5eeff] rounded-xl text-xs font-medium text-[#0b1c30] placeholder:text-[#a0a3b1] focus:outline-none focus:ring-2 focus:ring-[#2563eb]/30 focus:border-[#2563eb]"
                  />
                  {search && (
                    <button
                      onClick={() => setSearch('')}
                      aria-label="Clear search"
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-[#a0a3b1] hover:text-[#434655]"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                  {(
                    [
                      ['all', 'All'],
                      ['unread', 'Unread'],
                      ['buying', 'Buying'],
                      ['selling', 'Selling'],
                    ] as const
                  ).map(([key, label]) => (
                    <button key={key} onClick={() => setThreadFilter(key)} className={filterPill(threadFilter === key)}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto">
                {visibleThreads.length === 0 ? (
                  <p className="text-xs text-[#737686] text-center py-10 px-4">No conversations match this view.</p>
                ) : (
                  visibleThreads.map((t, threadIndex) => (
                    <div
                      key={t.id}
                      // Anchor for the onboarding step about threads. The first
                      // row only - on a phone the list is the whole screen.
                      data-onboarding={threadIndex === 0 ? 'messages-thread' : undefined}
                      onClick={() => selectThread(t.id)}
                      className={`px-4 py-3 cursor-pointer transition-all duration-150 flex items-center space-x-3 border-l-[3px] ${thread?.id === t.id
                          ? 'bg-[#eff4ff] border-l-[#2563eb]'
                          : 'border-l-transparent hover:bg-[#f8f9ff]'
                        }`}
                    >
                      <div className="relative shrink-0">
                        <img src={t.peer.avatarUrl} alt="" className="w-11 h-11 rounded-full object-cover ring-2 ring-[#e5eeff] bg-[#e5eeff]" />
                        {t.unreadCount > 0 && (
                          <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-[#2563eb] rounded-full border-2 border-white" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <h3 className={`text-sm truncate ${t.unreadCount > 0 ? 'font-bold text-[#0b1c30]' : 'font-semibold text-[#0b1c30]'}`}>
                            {t.peer.name}
                          </h3>
                          <span className="text-[10px] text-[#a0a3b1] shrink-0">{relativeShort(t.lastMessageAt)}</span>
                        </div>
                        <p className={`text-xs truncate mt-0.5 ${t.unreadCount > 0 ? 'text-[#0b1c30] font-semibold' : 'text-[#737686]'}`}>
                          {t.lastMessage}
                        </p>
                      </div>
                      {t.listing.removed ? (
                        <div className="w-9 h-9 rounded-lg bg-[#eff4ff] flex items-center justify-center shrink-0">
                          <Tag className="w-3.5 h-3.5 text-[#b4c5ff]" />
                        </div>
                      ) : (
                        <ListingImage
                          src={t.listing.image}
                          alt=""
                          className={`w-9 h-9 rounded-lg object-cover border border-[#e5eeff] shrink-0 ${t.unreadCount === 0 ? 'opacity-70' : ''}`}
                        />
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* ------------------------------------------------ Detail pane */}
            <div
              className={`flex-col bg-white ${mobileChatOpen ? 'flex fixed inset-0 z-50 lg:static lg:z-auto' : 'hidden lg:flex'
                } flex-1 min-h-0 lg:bg-[#f8f9ff]/40`}
            >
              {thread ? (
                <>
                  {/*
                    Mobile chat header.

                    Carries the listing as well as the person. The pinned
                    listing bar below is lg-only, so on a phone - where most of
                    this app is used - the conversation gave no clue which item
                    it was about or what was being asked for it. In a
                    marketplace chat that is the single most relevant fact on
                    screen, and people were scrolling back through the thread
                    to find it.
                  */}
                  <div
                    className="lg:hidden shrink-0 flex items-center gap-2.5 px-3 py-2 bg-white border-b border-[#e5eeff]"
                    style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top))' }}
                  >
                    <button
                      onClick={() => setMobileChatOpen(false)}
                      className="p-2 -ml-1 rounded-full text-[#434655] active:bg-[#eff4ff]"
                      aria-label="Back to conversations"
                      style={{ WebkitTapHighlightColor: 'transparent' }}
                    >
                      <ArrowLeft className="w-5 h-5" />
                    </button>
                    <img
                      src={thread.peer.avatarUrl}
                      alt=""
                      className="w-9 h-9 rounded-full object-cover bg-[#e5eeff] shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-bold text-[#0b1c30] truncate leading-tight">
                        {thread.peer.name}
                      </h3>
                      <p className="text-[11px] text-[#737686] truncate leading-tight">
                        {thread.listing.removed ? (
                          <span className="italic">Listing removed</span>
                        ) : (
                          <>
                            <span className="font-semibold text-[#2563eb]">
                              {formatPrice(thread.listing.price)}
                            </span>
                            {' · '}
                            {thread.listing.title}
                          </>
                        )}
                      </p>
                    </div>
                    {!thread.listing.removed && onViewListing && (
                      <button
                        onClick={() => onViewListing(thread.listing.id)}
                        aria-label="View listing"
                        className="shrink-0 active:opacity-70"
                        style={{ WebkitTapHighlightColor: 'transparent' }}
                      >
                        <ListingImage
                          src={thread.listing.image}
                          alt=""
                          className="w-9 h-9 rounded-lg object-cover border border-[#e5eeff]"
                        />
                      </button>
                    )}
                  </div>
                  {/* Pinned listing bar */}
                  <div className="hidden lg:flex shrink-0 items-center justify-between gap-3 px-5 py-3 bg-white border-b border-[#e5eeff] shadow-sm z-10">
                    <div className="flex items-center gap-3 min-w-0">
                      {thread.listing.removed ? (
                        <div className="w-11 h-11 rounded-lg bg-[#eff4ff] flex items-center justify-center shrink-0">
                          <Tag className="w-4 h-4 text-[#b4c5ff]" />
                        </div>
                      ) : (
                        <ListingImage src={thread.listing.image} alt="" className="w-11 h-11 rounded-lg object-cover border border-[#e5eeff] shrink-0" />
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className={`text-sm font-bold truncate ${thread.listing.removed ? 'text-[#737686] italic' : 'text-[#0b1c30]'}`}>
                            {thread.listing.title}
                          </h4>
                          <span className="shrink-0 px-2 py-0.5 bg-[#eff4ff] rounded-full text-[10px] font-bold text-[#2563eb] uppercase">
                            {thread.listing.removed ? 'Removed' : LISTING_STATUS_LABEL[thread.listing.status] || thread.listing.status}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-[#2563eb] font-extrabold text-sm">{formatPrice(thread.listing.price)}</span>
                          {onViewListing && !thread.listing.removed && (
                            <button
                              onClick={() => onViewListing(thread.listing.id)}
                              className="text-xs text-[#2563eb] underline hover:text-[#004ac6]"
                            >
                              View listing
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                    {/* A thread an admin brokered is not one they are buying
                        or selling in, and saying so matters most to the buyer,
                        who is talking to CampusMarket rather than the seller
                        whose name is on the listing. */}
                    <span
                      className={`shrink-0 px-2.5 py-1 rounded-lg border text-xs font-bold ${
                        thread.role === 'Mediating'
                          ? 'bg-violet-50 border-violet-200 text-violet-700'
                          : 'bg-[#f8f9ff] border-[#e5eeff] text-[#434655]'
                      }`}
                    >
                      {thread.role}
                    </span>
                  </div>

                  {/* ── Messages ─────────────────────────────────────── */}
                  <div className="relative flex-1 min-h-0 flex flex-col">
                    <div
                      ref={attachMessagePane}
                      onScroll={handlePaneScroll}
                      /* A tinted pane, not white. Incoming bubbles are white,
                         and a white bubble on a white pane is only a border -
                         the tint is what makes the two sides read as sides. */
                      className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 sm:px-6 py-4 bg-[#eef1f8]"
                    >
                      {messageGroups.map((group) => (
                        <div key={group.label}>
                          <div className="flex justify-center my-3 sticky top-0 z-10">
                            <span className="px-3 py-1 bg-white/90 backdrop-blur-sm text-[#737686] text-[10px] font-bold uppercase tracking-widest rounded-full shadow-sm">
                              {group.label}
                            </span>
                          </div>

                          {group.messages.map((m) => {
                            const failed = m.pending === 'failed';
                            return (
                              <div
                                key={m.key}
                                className={`flex items-end gap-2 ${m.mine ? 'justify-end' : 'justify-start'} ${
                                  m.firstOfRun ? 'mt-3' : 'mt-0.5'
                                }`}
                              >
                                {/* Avatar on the last of a run only; a spacer
                                    holds the column for the ones above it so
                                    the run stays aligned. */}
                                {!m.mine && (
                                  m.lastOfRun ? (
                                    <img
                                      src={thread.peer.avatarUrl}
                                      alt=""
                                      className="w-7 h-7 rounded-full object-cover bg-[#e5eeff] shrink-0"
                                    />
                                  ) : (
                                    <span className="w-7 shrink-0" aria-hidden="true" />
                                  )
                                )}

                                <div className={`flex flex-col max-w-[85%] sm:max-w-[75%] ${m.mine ? 'items-end' : 'items-start'}`}>
                                  <div
                                    onClick={failed ? () => retrySend(m) : undefined}
                                    role={failed ? 'button' : undefined}
                                    className={`px-3 py-2 text-sm font-medium shadow-sm rounded-2xl ${
                                      m.mine
                                        ? `text-white ${failed ? 'bg-red-500 cursor-pointer' : 'bg-[#2563eb]'} ${
                                            m.lastOfRun ? 'rounded-br-sm' : ''
                                          }`
                                        : `bg-white text-[#0b1c30] ${m.lastOfRun ? 'rounded-bl-sm' : ''}`
                                    } ${m.pending === 'sending' ? 'opacity-80' : ''}`}
                                  >
                                    <span className="whitespace-pre-wrap break-words">{m.body}</span>
                                    {/* Floated, so a short message sits beside
                                        its timestamp instead of above it, and a
                                        long one wraps around it. */}
                                    <span
                                      className={`float-right ml-2 mt-1.5 inline-flex items-center gap-0.5 text-[10px] leading-none ${
                                        m.mine ? 'text-white/70' : 'text-[#a0a3b1]'
                                      }`}
                                    >
                                      {timeOnly(m.createdAt)}
                                      {m.mine && <DeliveryTick m={m} />}
                                    </span>
                                  </div>

                                  {failed && (
                                    <span className="mt-1 px-1 text-[10px] font-semibold text-red-600">
                                      Not sent · tap to retry ·{' '}
                                      <button
                                        onClick={() => discardFailed(m.clientId)}
                                        className="underline hover:text-red-700"
                                      >
                                        discard
                                      </button>
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </div>

                    {/* Jump to the live end. Only drawn once the reader has
                        actually left it, so it never covers a message they
                        are reading at the bottom. */}
                    {!atBottom && (
                      <button
                        onClick={jumpToNewest}
                        aria-label="Jump to newest message"
                        className="absolute bottom-3 right-4 z-20 flex items-center gap-1.5 h-9 pl-3 pr-3.5 rounded-full bg-white shadow-modal border border-[#e5eeff] text-xs font-bold text-[#2563eb] active:scale-95 transition-transform"
                      >
                        <ChevronDown className="w-4 h-4" />
                        {hasNewBelow ? 'New messages' : 'Latest'}
                      </button>
                    )}
                  </div>

                  {/* Contextual seller action - only offered to the seller, and
                      only while the item hasn't already been sold. */}
                  {thread.canMarkSold && (
                    <div className="mx-4 sm:mx-6 mb-2 shrink-0 py-2.5 px-4 bg-[#6ffbbe]/10 border border-[#007d55]/20 rounded-xl flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <CheckCircle2 className="w-4 h-4 text-[#007d55] shrink-0" />
                        <span className="text-xs text-[#006242] font-semibold truncate">
                          Ready to finalize? Mark as sold to {thread.peer.name}
                        </span>
                      </div>
                      <button
                        onClick={() => setMarkSoldOpen(true)}
                        className="shrink-0 px-3.5 py-1.5 bg-[#007d55] text-white rounded-full text-xs font-bold hover:bg-[#006242]"
                      >
                        Confirm sale
                      </button>
                    </div>
                  )}

                  {/* ── Composer ─────────────────────────────────────── */}
                  <form
                    onSubmit={sendReply}
                    data-onboarding="messages-composer"
                    className="shrink-0 px-3 py-2.5 sm:px-5 sm:py-3 bg-white border-t border-[#e5eeff]"
                    style={{ paddingBottom: 'max(0.625rem, env(safe-area-inset-bottom))' }}
                  >
                    <div className="flex items-end gap-2">
                      <div className="flex-1 min-w-0 flex items-end bg-[#f1f4fb] rounded-3xl border border-[#e5eeff] focus-within:border-[#2563eb] transition-colors">
                        <textarea
                          ref={textareaRef}
                          rows={1}
                          value={replyText}
                          onChange={(e) => {
                            setReplyText(e.target.value);
                            autoResize(e.target);
                          }}
                          onKeyDown={handleReplyKeyDown}
                          placeholder="Message"
                          aria-label={`Message ${thread.peer.name}`}
                          /* text-base is not styling: iOS Safari zooms the page
                             in on any focused field under 16px, and a composer
                             that zooms the conversation away on every tap is
                             the single most obviously-not-an-app thing a chat
                             screen can do. */
                          className="no-zoom-field flex-1 bg-transparent border-none resize-none focus:outline-none focus:ring-0 text-base py-2.5 px-4 max-h-32 placeholder:text-[#a0a3b1]"
                        />
                      </div>
                      {/* Round, constant, and never disabled mid-send - the
                          message is already on screen by the time this would
                          have finished spinning. */}
                      <button
                        type="submit"
                        disabled={!replyText.trim()}
                        aria-label="Send message"
                        className="w-11 h-11 shrink-0 rounded-full bg-[#2563eb] hover:bg-[#004ac6] disabled:bg-[#c3c6d7] text-white flex items-center justify-center transition-colors active:scale-95"
                        style={{ WebkitTapHighlightColor: 'transparent' }}
                      >
                        <Send className="w-[18px] h-[18px] translate-x-[-1px]" />
                      </button>
                    </div>
                  </form>
                </>
              ) : (
                <div className="hidden lg:flex flex-1 flex-col items-center justify-center text-[#a0a3b1] gap-3">
                  <MessageSquare className="w-14 h-14" />
                  <p className="text-sm font-medium">Select a conversation to start messaging</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {thread && (
        <MarkSoldModal
          isOpen={markSoldOpen}
          onClose={() => setMarkSoldOpen(false)}
          listingId={thread.listing.id}
          listingTitle={thread.listing.title}
          listingPrice={thread.listing.price}
          presetBuyer={{ id: thread.peer.id, name: thread.peer.name }}
          onSold={() => {
            openThread(thread.id);
            loadDeals();
          }}
        />
      )}

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
