import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft, Package, Loader2, CheckCircle2, XCircle, Clock,
  MapPin, MessageSquare, Inbox, ShoppingBag, Ban, ShieldCheck,
} from 'lucide-react';
import { AuthSession, Order, OrderAction, OrderStatus, zoneLabel } from '../types';
import { api } from '../services/api';
import { useLiveCounts } from '../hooks/useLiveCounts';
import { Modal, ErrorBanner } from './shared/Modal';
import { canSell } from './nav/navShared';
import { formatPrice } from '../utils/currency';
import { ListingImage } from './shared/ListingImage';

interface OrdersScreenProps {
  onBack: () => void;
  onExplore: () => void;
  onOpenMessages: () => void;
  currentUser: AuthSession;
  /** Lets App refresh the session badge after a status change. */
  onOrdersChanged?: () => void;
  /** Set from /orders/:id - renders that order's own page instead of the list. */
  selectedOrderId?: string;
  onOpenOrder?: (orderId: string) => void;
  onCloseOrder?: () => void;
  /**
   * Which tab to open on, when the caller knows why the person came.
   * Overrides the account-type default below - see the note there.
   */
  initialSide?: Side;
}

/**
 * Which set of orders is on screen.
 *
 * <p>`all` merges both sides. Someone who buys and sells had no single place to
 * see everything they had going on - two tabs meant two half-answers, and an
 * order you remembered but not which side it was on took two looks to find.
 */
type Side = 'all' | 'incoming' | 'placed';

const STATUS_STYLE: Record<OrderStatus, { label: string; className: string; icon: React.ReactNode }> = {
  HELD: {
    label: 'Under review',
    className: 'bg-violet-50 text-violet-700 border-violet-200',
    icon: <ShieldCheck className="w-3.5 h-3.5" />,
  },
  PENDING: {
    label: 'Awaiting response',
    className: 'bg-amber-50 text-amber-700 border-amber-200',
    icon: <Clock className="w-3.5 h-3.5" />,
  },
  ACCEPTED: {
    label: 'Accepted',
    className: 'bg-[#eff4ff] text-[#2563eb] border-[#dbe1ff]',
    icon: <CheckCircle2 className="w-3.5 h-3.5" />,
  },
  COMPLETED: {
    label: 'Completed',
    className: 'bg-emerald-50 text-[#006242] border-emerald-200',
    icon: <CheckCircle2 className="w-3.5 h-3.5" />,
  },
  DECLINED: {
    label: 'Declined',
    className: 'bg-red-50 text-red-700 border-red-200',
    icon: <XCircle className="w-3.5 h-3.5" />,
  },
  CANCELLED: {
    label: 'Cancelled',
    className: 'bg-slate-100 text-slate-600 border-slate-200',
    icon: <Ban className="w-3.5 h-3.5" />,
  },
};

const ACTION_LABEL: Record<OrderAction, string> = {
  accept: 'Accept',
  decline: 'Decline',
  complete: 'Mark handed over',
  cancel: 'Cancel order',
  // Admin-only, and never rendered here - the review queue lives in the admin
  // console. Present so the map stays exhaustive over OrderAction.
  release: 'Release to seller',
  fulfil: 'Fulfil directly',
};

const formatDate = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
};

/** Short form for the timeline, where the year is noise and space is tight. */
const formatStep = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

/** Statuses that are still going somewhere, as opposed to filed away. */
const ACTIVE_STATUSES: OrderStatus[] = ['HELD', 'PENDING', 'ACCEPTED'];
const isActive = (order: Order) => ACTIVE_STATUSES.includes(order.status);

/**
 * The three points every order passes through, and where it currently sits.
 *
 * <p>Returns null for orders that ended early: a declined or cancelled order
 * never reaches a handover, and drawing it as an unfinished journey would
 * suggest it is still going. Those say what happened in the status pill and
 * the accompanying note instead.
 */
function timelineFor(order: Order): { label: string; at?: string; done: boolean }[] | null {
  if (order.status === 'DECLINED' || order.status === 'CANCELLED') return null;

  const accepted = order.status === 'ACCEPTED' || order.status === 'COMPLETED';
  return [
    { label: 'Placed', at: order.createdAt, done: true },
    {
      // "Under review" is where a held order genuinely is, and calling that
      // step "Accepted" would credit a seller who has not seen it yet.
      label: order.status === 'HELD' ? 'Under review' : 'Accepted',
      at: accepted ? order.respondedAt : undefined,
      done: accepted,
    },
    {
      label: 'Handed over',
      at: order.completedAt,
      done: order.status === 'COMPLETED',
    },
  ];
}

/**
 * Where an order has got to, as three dots and two connectors.
 *
 * <p>The status pill already names the current state; this answers the
 * question the pill cannot, which is what has happened so far and what is
 * still to come. Buyers ask that question far more often than they ask
 * anything else about an order.
 */
const OrderTimeline: React.FC<{ order: Order }> = ({ order }) => {
  const steps = timelineFor(order);
  if (!steps) return null;

  return (
    <div className="mt-3 pt-3 border-t border-[#e5eeff] flex items-start">
      {steps.map((step, i) => (
        <div key={step.label} className="flex-1 flex flex-col items-center relative">
          {/* Connector to the previous dot, drawn behind it and coloured only
              as far as the order has actually progressed. */}
          {i > 0 && (
            <span
              aria-hidden="true"
              className={`absolute top-[5px] right-1/2 w-full h-0.5 ${
                step.done ? 'bg-[#007d55]' : 'bg-[#e5eeff]'
              }`}
            />
          )}
          <span
            className={`relative z-10 w-3 h-3 rounded-full border-2 ${
              step.done
                ? 'bg-[#007d55] border-[#007d55]'
                : 'bg-white border-[#c3c6d7]'
            }`}
          />
          <span className={`mt-1.5 text-[10px] font-bold ${step.done ? 'text-[#0b1c30]' : 'text-[#a0a3b1]'}`}>
            {step.label}
          </span>
          {step.at && (
            <span className="text-[10px] text-[#737686] leading-tight">{formatStep(step.at)}</span>
          )}
        </div>
      ))}
    </div>
  );
};

/**
 * What happens next, in a sentence, for the person reading.
 *
 * <p>The status pill names the state and the timeline shows the shape of the
 * journey, but neither answers the question people actually open an order to
 * ask: is this on me, or am I waiting on them? "Accepted" reads as finished
 * to a buyer and as a to-do to a seller, and the same three dots were shown
 * to both. This is the only part of the page that differs by side.
 *
 * <p>Which side is decided by availableActions, not by role. The server is
 * the authority on who may do what next (OrderService#availableActions), and
 * a sentence derived independently from the buttons it sits above is a
 * sentence that will eventually contradict them - telling someone to wait
 * directly underneath the button only they can press.
 */
function nextStepHint(order: Order): { text: string; tone: 'wait' | 'you' | 'done' } | null {
  const them = order.counterparty.name;
  switch (order.status) {
    case 'HELD':
      return { text: 'Our team is reviewing this order. Nothing is needed from you yet.', tone: 'wait' };
    case 'PENDING':
      return order.availableActions.includes('accept')
        ? { text: 'Waiting on you — accept or decline so the buyer knows where they stand.', tone: 'you' }
        : { text: `Waiting on ${them} to accept. You can cancel while it is pending.`, tone: 'wait' };
    case 'ACCEPTED':
      return order.availableActions.includes('complete')
        ? { text: `Agree a time and place with ${them} in chat, then mark it handed over once you have met.`, tone: 'you' }
        : { text: `${them} accepted. Agree a time in chat — they confirm the handover when you meet.`, tone: 'wait' };
    case 'COMPLETED':
      return { text: 'Handed over. Nothing left to do.', tone: 'done' };
    case 'DECLINED':
      return { text: 'Declined, and the items went back to being available.', tone: 'done' };
    case 'CANCELLED':
      return { text: 'Cancelled. Nothing was charged.', tone: 'done' };
    default:
      return null;
  }
}

/** The one-line "what now", styled by whether it is on the reader. */
const NextStep: React.FC<{ order: Order }> = ({ order }) => {
  const hint = nextStepHint(order);
  if (!hint) return null;
  const tone =
    hint.tone === 'you'
      ? 'bg-amber-50 border-amber-200 text-amber-900'
      : hint.tone === 'wait'
        ? 'bg-[#eff4ff] border-[#dbe1ff] text-[#0b1c30]'
        : 'bg-[#f8f9ff] border-[#e5eeff] text-[#737686]';
  return (
    <p className={`mt-3 rounded-xl border px-3 py-2 text-xs font-medium ${tone}`}>
      {hint.text}
    </p>
  );
};

/** One labelled fact in the detail page's summary block. */
const DetailRow: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex items-baseline justify-between gap-4 py-2 border-b border-[#f1f2f7] last:border-0">
    <span className="text-xs font-semibold text-[#737686] shrink-0">{label}</span>
    <span className="text-sm text-[#0b1c30] text-right min-w-0">{children}</span>
  </div>
);

/**
 * One order, in full.
 *
 * <p>The list card is a summary built for scanning - it truncates, it drops the
 * dates that are not the current one, and it says nothing about when anything
 * happened beyond the timeline dots. This is the page for the other question,
 * the one someone opens a specific order to ask: what exactly did I order, from
 * whom, for how much, where are we meeting, and what has happened so far.
 */
const OrderDetail: React.FC<{
  order: Order;
  busy: boolean;
  error: string | null;
  notice: string | null;
  onAct: (order: Order, action: OrderAction, note?: string) => void;
  onDecline: (order: Order) => void;
  onOpenMessages: () => void;
}> = ({ order, busy, error, notice, onAct, onDecline, onOpenMessages }) => {
  const status = STATUS_STYLE[order.status];
  const [copied, setCopied] = useState(false);

  const copyReference = async () => {
    try {
      await navigator.clipboard.writeText(order.reference);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // A denied clipboard is not worth an error banner; the reference is on
      // screen and can be read off it.
    }
  };

  return (
    <div className="space-y-4">
      <ErrorBanner message={error} />
      {notice && (
        <div className="flex items-start gap-2 rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2.5">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
          <p className="text-xs text-emerald-800 font-medium">{notice}</p>
        </div>
      )}

      {/* ── Heading: what this is and where it has got to ── */}
      <div className="bg-white rounded-2xl border border-[#e5eeff] p-5 shadow-card">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={copyReference}
                title="Copy reference"
                className="text-sm font-mono font-bold text-[#0b1c30] hover:text-[#2563eb] transition-colors"
              >
                {order.reference}
              </button>
              {/* Both sides quote this reference to each other in chat, so it
                  is worth being able to lift rather than retype. */}
              {copied && <span className="text-[10px] font-bold text-[#007d55]">Copied</span>}
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-bold ${status.className}`}
              >
                {status.icon}
                {status.label}
              </span>
            </div>
            <p className="text-xs text-[#737686] mt-1.5">
              {order.role === 'seller' ? 'Ordered by' : 'Ordered from'}{' '}
              <span className="font-semibold text-[#434655]">{order.counterparty.name}</span>
              {' · '}
              Placed {formatDate(order.createdAt)}
            </p>
          </div>
          <p className="text-xl font-extrabold text-[#2563eb] shrink-0">{formatPrice(order.total)}</p>
        </div>

        <OrderTimeline order={order} />
        <NextStep order={order} />
      </div>

      {/* ── The goods ── */}
      <div className="bg-white rounded-2xl border border-[#e5eeff] p-5 shadow-card">
        <h2 className="text-xs font-bold text-[#a0a3b1] uppercase tracking-wider mb-3">
          {order.itemCount === 1 ? 'Item' : `Items (${order.itemCount})`}
        </h2>
        <div className="space-y-3">
          {order.items.map((item) => (
            <div key={item.id} className="flex items-center gap-3">
              {item.image ? (
                <ListingImage src={item.image} alt="" className="w-12 h-12 rounded-lg object-cover border border-[#e5eeff] shrink-0" />
              ) : (
                <div className="w-12 h-12 rounded-lg bg-[#eff4ff] border border-[#dbe1ff] flex items-center justify-center shrink-0">
                  <Package className="w-5 h-5 text-[#b4c5ff]" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                {/* Snapshotted at order time, so it still reads correctly after
                    the seller renames or removes the listing. */}
                <p className="text-sm font-semibold text-[#0b1c30]">{item.title}</p>
                <p className="text-[11px] text-[#737686]">
                  {formatPrice(item.unitPrice)} × {item.quantity}
                </p>
              </div>
              <p className="text-sm font-bold text-[#434655] shrink-0">{formatPrice(item.lineTotal)}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 pt-3 border-t border-[#e5eeff] flex items-center justify-between">
          <span className="text-sm font-bold text-[#0b1c30]">Total</span>
          <span className="text-lg font-extrabold text-[#2563eb]">{formatPrice(order.total)}</span>
        </div>
        <p className="mt-1 text-[11px] text-[#737686]">
          Paid in person at handover. Nothing was charged online.
        </p>
      </div>

      {/* ── The arrangements ── */}
      <div className="bg-white rounded-2xl border border-[#e5eeff] p-5 shadow-card">
        <h2 className="text-xs font-bold text-[#a0a3b1] uppercase tracking-wider mb-1">
          Handover
        </h2>
        <DetailRow label={order.role === 'seller' ? 'Buyer' : 'Seller'}>
          {order.counterparty.name}
        </DetailRow>
        <DetailRow label="Meeting point">
          {order.meetupZone ? (
            <span className="inline-flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-[#a0a3b1]" />
              {zoneLabel(order.meetupZone)}
            </span>
          ) : (
            <span className="text-[#737686]">To be agreed in chat</span>
          )}
        </DetailRow>
        <DetailRow label="Placed">{formatDate(order.createdAt)}</DetailRow>
        {order.respondedAt && (
          <DetailRow label={order.status === 'DECLINED' ? 'Declined' : order.status === 'CANCELLED' ? 'Cancelled' : 'Accepted'}>
            {formatDate(order.respondedAt)}
          </DetailRow>
        )}
        {order.completedAt && (
          <DetailRow label="Handed over">{formatDate(order.completedAt)}</DetailRow>
        )}
        {order.fulfilledByAdminName && (
          <DetailRow label="Handled by">CampusMarket team</DetailRow>
        )}
      </div>

      {/* ── Anything anyone wrote about it ── */}
      {(order.buyerNote || order.sellerNote || order.adminNote || order.status === 'HELD') && (
        <div className="bg-white rounded-2xl border border-[#e5eeff] p-5 shadow-card space-y-2">
          <h2 className="text-xs font-bold text-[#a0a3b1] uppercase tracking-wider mb-1">Notes</h2>
          {order.status === 'HELD' && (
            <p className="text-xs text-violet-800 bg-violet-50 border border-violet-200 rounded-lg px-3 py-2">
              Our team is reviewing this order before it goes ahead. You can still cancel it.
            </p>
          )}
          {order.adminNote && (
            <p className="text-xs text-violet-800 bg-violet-50 rounded-lg px-3 py-2">
              <span className="font-semibold">From our team:</span> {order.adminNote}
            </p>
          )}
          {order.buyerNote && (
            <p className="text-xs text-[#434655] bg-[#f8f9ff] rounded-lg px-3 py-2">
              <span className="font-semibold">Buyer note:</span> {order.buyerNote}
            </p>
          )}
          {order.sellerNote && (
            <p className="text-xs text-red-700 bg-red-50 rounded-lg px-3 py-2">
              <span className="font-semibold">Seller note:</span> {order.sellerNote}
            </p>
          )}
        </div>
      )}

      {/*
        ── What can be done about it ──

        Sticky, and above the mobile bottom bar rather than behind it.

        This used to be the last card on a page with four above it, so on a
        phone "Mark handed over" - the whole point of opening the order - was
        a full screen of scrolling below the fold, and the two people doing it
        are standing in front of each other at the time. Keeping it in view
        costs a strip of the transcript above and saves the one interaction
        that has to happen while someone is waiting.
      */}
      <div className="sticky bottom-[84px] lg:bottom-4 z-20 bg-white/95 backdrop-blur-md rounded-2xl border border-[#e5eeff] p-3 shadow-modal">
        <div className="flex flex-wrap items-center gap-2">
          {order.availableActions.map((action) => {
            const destructive = action === 'decline' || action === 'cancel';
            const primary = action === 'accept' || action === 'complete';
            return (
              <button
                key={action}
                disabled={busy}
                onClick={() => (action === 'decline' ? onDecline(order) : onAct(order, action))}
                /* The primary action takes the row; everything else shrinks to
                   what it needs. A decline sitting at equal width to an accept
                   is how the wrong one gets tapped in a hurry. */
                className={`rounded-xl text-sm font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5 ${
                  primary
                    ? 'flex-1 min-w-[160px] px-4 py-3 bg-[#007d55] text-white hover:bg-[#006242] active:scale-[0.99]'
                    : destructive
                      ? 'px-4 py-3 text-red-600 border border-red-200 hover:bg-red-50'
                      : 'px-4 py-3 text-[#434655] border border-[#c3c6d7] hover:bg-[#f8f9ff]'
                }`}
                style={{ WebkitTapHighlightColor: 'transparent' }}
              >
                {busy ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    {action === 'complete' && <CheckCircle2 className="w-4 h-4" />}
                    {ACTION_LABEL[action]}
                  </>
                )}
              </button>
            );
          })}
          <button
            onClick={onOpenMessages}
            className={`rounded-xl text-sm font-semibold text-[#2563eb] hover:bg-[#eff4ff] flex items-center justify-center gap-1.5 transition-colors px-4 py-3 border border-[#dbe1ff] ${
              order.availableActions.length === 0 ? 'flex-1' : ''
            }`}
          >
            <MessageSquare className="w-4 h-4" /> Open chat
          </button>
        </div>
        {/* Says what the green button will do before it is pressed. Completing
            is terminal - there is no action list afterwards. */}
        {order.availableActions.includes('complete') && (
          <p className="mt-2 px-1 text-[11px] text-[#737686]">
            Only mark this handed over once you have the item and have paid. It cannot be undone.
          </p>
        )}
      </div>
    </div>
  );
};

/**
 * Both sides of the order book.
 *
 * <p>A seller opens this to act on what buyers have requested; a buyer opens it
 * to see where their requests stand. Which tab leads is chosen by account type
 * rather than being fixed, because those two people want opposite things first.
 *
 * <p>That default is only a guess about intent, so a caller who actually knows
 * the intent overrides it with `initialSide`. Someone who sells is still a
 * buyer when they have just checked out, and "Track my orders" landing them on
 * the orders they received rather than the one they placed answered a question
 * they had not asked.
 */
export const OrdersScreen: React.FC<OrdersScreenProps> = ({
  onBack,
  onExplore,
  onOpenMessages,
  currentUser,
  onOrdersChanged,
  selectedOrderId,
  onOpenOrder,
  onCloseOrder,
  initialSide,
}) => {
  const sellerFirst = canSell(currentUser);
  const [side, setSide] = useState<Side>(initialSide ?? (sellerFirst ? 'incoming' : 'placed'));
  /** The order named by the URL, once resolved. */
  const [detail, setDetail] = useState<Order | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  // Declining asks for a reason: "no" without one is the most annoying
  // outcome for the buyer, and the seller usually has a one-line answer.
  const [declineTarget, setDeclineTarget] = useState<Order | null>(null);
  const [declineNote, setDeclineNote] = useState('');

  /*
   * A silent refresh never raises a banner and never ends the loading state.
   * These run on a timer: a single dropped poll would otherwise announce a
   * failure over a list that is on screen and correct, and one resolving
   * before the initial load would drop the spinner on an empty list. A silent
   * success still clears a stale banner - it proves the connection is back.
   */
  const report = (silent: boolean, message: string | null) => {
    if (!silent || !message) setError(message);
  };

  const load = useCallback(async (which: Side, silent = false) => {
    if (!silent) setLoading(true);

    if (which === 'all') {
      /*
       * Both sides at once. A seller account with nothing bought, or a buyer
       * with nothing sold, simply contributes an empty list - the request that
       * does not apply is not an error, so a rejection on one side must not
       * blank the other.
       */
      const [incoming, placed] = await Promise.all([
        api.orders.incoming(),
        api.orders.placed(),
      ]);
      const merged = [...(incoming.orders || []), ...(placed.orders || [])]
        .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      report(silent, merged.length === 0 ? (incoming.error || placed.error || null) : null);
      setOrders(merged);
      if (!silent) setLoading(false);
      return;
    }

    const res = which === 'incoming' ? await api.orders.incoming() : await api.orders.placed();
    report(silent, res.error || null);
    setOrders(res.orders || []);
    if (!silent) setLoading(false);
  }, []);

  useEffect(() => { load(side); }, [side, load]);

  /*
   * A seller sitting on this screen when an order arrives, or a buyer watching
   * one they placed, should see it change without reaching for reload. Silent,
   * so the list does not blink back to skeletons every half minute.
   */
  useLiveCounts({
    enabled: true,
    refresh: () => load(side, true),
  });

  /*
   * Resolve the order the URL names.
   *
   * Fetched by id when it is not in the loaded list, which is the normal case
   * for a notification: the order it points at is very often on the other tab,
   * or completed weeks ago.
   */
  useEffect(() => {
    if (!selectedOrderId) {
      setDetail(null);
      setDetailError(null);
      return;
    }
    const local = orders.find((o) => o.id === selectedOrderId);
    if (local) {
      setDetail(local);
      setDetailError(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    api.orders.getById(selectedOrderId).then((res) => {
      if (cancelled) return;
      setDetailLoading(false);
      if (res.order) {
        setDetail(res.order);
        setDetailError(null);
      } else {
        setDetailError(res.error || 'That order could not be found.');
      }
    });
    return () => { cancelled = true; };
  }, [selectedOrderId, orders]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  const act = async (order: Order, action: OrderAction, note?: string) => {
    setPendingId(order.id);
    const res = await api.orders.act(order.id, action, note);
    setPendingId(null);

    if (!res.success) {
      setError(res.error || 'Could not update that order.');
      return;
    }
    // Whatever failed last time did not fail this time. Left standing, the red
    // banner sat directly above the green one contradicting it, both describing
    // different orders and neither saying which.
    setError(null);
    // Patch in place rather than refetching: the server returns the updated
    // row, and a full reload would jump the list under the user's cursor.
    setOrders((prev) => prev.map((o) => (o.id === order.id && res.order ? res.order : o)));
    // The detail view is a separate copy, so acting from it has to update it
    // too or the buttons stay as they were on a status that has moved on.
    setDetail((prev) => (prev && prev.id === order.id && res.order ? res.order : prev));
    setNotice(
      action === 'accept' ? `Order ${order.reference} accepted.`
        : action === 'decline' ? `Order ${order.reference} declined.`
        : action === 'complete' ? `Order ${order.reference} marked as handed over.`
        : `Order ${order.reference} cancelled.`,
    );
    onOrdersChanged?.();
  };

  const confirmDecline = async () => {
    if (!declineTarget) return;
    const target = declineTarget;
    setDeclineTarget(null);
    await act(target, 'decline', declineNote.trim() || undefined);
    setDeclineNote('');
  };

  const openOrders = orders.filter((o) => o.status === 'PENDING' || o.status === 'ACCEPTED');

  /* Split rather than sorted. Sorting still leaves a seller scrolling past
     last month's completed handovers to find the two orders waiting on them,
     and "waiting on you" is the only reason most people open this screen. */
  const activeOrders = orders.filter(isActive);
  const pastOrders = orders.filter((o) => !isActive(o));

  /*
   * Orders the reader is the blocker on.
   *
   * "Active" lumps together an order waiting on you to accept and one waiting
   * on the other person to show up, and those are opposite situations - the
   * first is a task, the second is a diary entry. Derived from
   * availableActions rather than from status, so the server stays the single
   * authority on who may do what next and this cannot disagree with the
   * buttons it is describing.
   */
  const needsYou = activeOrders.filter(
    (o) => o.availableActions.includes('accept') || o.availableActions.includes('complete'));
  const waitingOnThem = activeOrders.filter((o) => !needsYou.includes(o));

  /* ------------------------------------------------------------------ */
  const renderActions = (order: Order) => {
    if (order.availableActions.length === 0) return null;
    const busy = pendingId === order.id;

    return (
      <div
        className="flex flex-wrap items-center gap-2 pt-3 mt-3 border-t border-[#e5eeff]"
        data-onboarding="orders-actions"
        onClick={(e) => e.stopPropagation()}
      >
        {order.availableActions.map((action) => {
          const destructive = action === 'decline' || action === 'cancel';
          const primary = action === 'accept' || action === 'complete';
          return (
            <button
              key={action}
              disabled={busy}
              onClick={() => {
                if (action === 'decline') {
                  setDeclineNote('');
                  setDeclineTarget(order);
                } else {
                  act(order, action);
                }
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors disabled:opacity-50 ${
                primary
                  ? 'bg-[#007d55] text-white hover:bg-[#006242]'
                  : destructive
                    ? 'text-red-600 border border-red-200 hover:bg-red-50'
                    : 'text-[#434655] border border-[#c3c6d7] hover:bg-[#f8f9ff]'
              }`}
            >
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : ACTION_LABEL[action]}
            </button>
          );
        })}
        <button
          onClick={onOpenMessages}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold text-[#2563eb] hover:bg-[#eff4ff] flex items-center gap-1.5 transition-colors"
        >
          <MessageSquare className="w-3.5 h-3.5" /> Open chat
        </button>
      </div>
    );
  };

  const renderOrder = (order: Order) => {
    const status = STATUS_STYLE[order.status];
    return (
      <div
        key={order.id}
        /* The whole card opens the order. Buttons inside it stop propagation
           so accepting from the list does not also navigate away from it. */
        onClick={() => onOpenOrder?.(order.id)}
        role={onOpenOrder ? 'button' : undefined}
        tabIndex={onOpenOrder ? 0 : undefined}
        onKeyDown={(e) => {
          /*
           * Only when the card itself holds focus.
           *
           * That stopPropagation above is on the click handler alone, so it
           * never covered the keyboard: Space on a focused "Accept" bubbled to
           * here, and the preventDefault below suppressed the button's own
           * activation before navigating. The order went un-accepted and the
           * page changed instead - the one combination worse than doing
           * nothing, because it looks like something happened.
           */
          if (e.target !== e.currentTarget) return;
          if (onOpenOrder && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            onOpenOrder(order.id);
          }
        }}
        className={`bg-white rounded-2xl border border-[#e5eeff] p-4 shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] focus-visible:ring-offset-2 ${
          onOpenOrder ? 'cursor-pointer hover:shadow-card-hover hover:border-[#b4c5ff]/60 transition-all' : ''
        }`}
      >
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-mono font-bold text-[#434655]">{order.reference}</span>
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-bold ${status.className}`}
              >
                {status.icon}
                {status.label}
              </span>
              {/* Only in the merged view, where the two sides sit together and
                  "From" vs "To" alone is a subtle thing to have to notice. */}
              {side === 'all' && (
                <span className="px-2 py-0.5 rounded-full bg-[#f8f9ff] border border-[#e5eeff] text-[10px] font-bold text-[#737686]">
                  {order.role === 'seller' ? 'Selling' : 'Buying'}
                </span>
              )}
            </div>
            <p className="text-xs text-[#737686] mt-1">
              {order.role === 'seller' ? 'From' : 'To'}{' '}
              <span className="font-semibold text-[#434655]">{order.counterparty.name}</span>
              {' · '}
              {formatDate(order.createdAt)}
            </p>
          </div>
          <p className="text-base font-extrabold text-[#2563eb] shrink-0">
            {formatPrice(order.total)}
          </p>
        </div>

        <div className="space-y-2">
          {order.items.map((item) => (
            <div key={item.id} className="flex items-center gap-3">
              {item.image ? (
                <ListingImage src={item.image} alt="" className="w-10 h-10 rounded-lg object-cover border border-[#e5eeff] shrink-0" />
              ) : (
                <div className="w-10 h-10 rounded-lg bg-[#eff4ff] border border-[#dbe1ff] flex items-center justify-center shrink-0">
                  <Package className="w-4 h-4 text-[#b4c5ff]" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-[#0b1c30] truncate">{item.title}</p>
                <p className="text-[11px] text-[#737686]">
                  {formatPrice(item.unitPrice)} × {item.quantity}
                </p>
              </div>
              <p className="text-sm font-bold text-[#434655] shrink-0">
                {formatPrice(item.lineTotal)}
              </p>
            </div>
          ))}
        </div>

        {/* A buyer whose order is held would otherwise just see silence. */}
        {order.status === 'HELD' && (
          <div className="mt-3 flex items-start gap-2 rounded-lg bg-violet-50 border border-violet-200 px-2.5 py-2">
            <ShieldCheck className="w-3.5 h-3.5 text-violet-600 mt-0.5 shrink-0" />
            <p className="text-[11px] text-violet-800">
              This seller isn't verified yet, so our team is reviewing your order before it
              goes ahead. You can still cancel it.
            </p>
          </div>
        )}

        {order.fulfilledByAdminName && (
          <div className="mt-3 flex items-start gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-2.5 py-2">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 mt-0.5 shrink-0" />
            <p className="text-[11px] text-emerald-800">
              Handled directly by the CampusMarket team.
            </p>
          </div>
        )}

        {(order.meetupZone || order.buyerNote || order.sellerNote || order.adminNote) && (
          <div className="mt-3 space-y-1.5">
            {order.meetupZone && (
              <p className="text-[11px] text-[#737686] flex items-center gap-1">
                <MapPin className="w-3 h-3" /> Pickup: {zoneLabel(order.meetupZone)}
              </p>
            )}
            {order.adminNote && (
              <p className="text-[11px] text-violet-800 bg-violet-50 rounded-lg px-2.5 py-1.5">
                <span className="font-semibold">From our team:</span> {order.adminNote}
              </p>
            )}
            {order.buyerNote && (
              <p className="text-[11px] text-[#434655] bg-[#f8f9ff] rounded-lg px-2.5 py-1.5">
                <span className="font-semibold">Buyer note:</span> {order.buyerNote}
              </p>
            )}
            {order.sellerNote && (
              <p className="text-[11px] text-red-700 bg-red-50 rounded-lg px-2.5 py-1.5">
                <span className="font-semibold">Seller note:</span> {order.sellerNote}
              </p>
            )}
          </div>
        )}

        <OrderTimeline order={order} />
        <NextStep order={order} />

        {renderActions(order)}
      </div>
    );
  };

  const emptyState = () => {
    if (side === 'incoming') {
      return (
        <div className="text-center py-16 bg-white rounded-3xl border border-[#e5eeff] shadow-card">
          <div className="w-16 h-16 bg-[#eff4ff] text-[#2563eb] rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Inbox className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold text-[#0b1c30]">No orders yet</h3>
          <p className="text-sm text-[#737686] mt-1.5 max-w-sm mx-auto">
            {canSell(currentUser)
              ? 'When someone orders one of your listings, it lands here for you to accept or decline.'
              : 'Switch to a seller account to start receiving orders.'}
          </p>
        </div>
      );
    }
    return (
      <div className="text-center py-16 bg-white rounded-3xl border border-[#e5eeff] shadow-card">
        <div className="w-16 h-16 bg-[#eff4ff] text-[#2563eb] rounded-2xl flex items-center justify-center mx-auto mb-4">
          <ShoppingBag className="w-8 h-8" />
        </div>
        <h3 className="text-lg font-bold text-[#0b1c30]">You haven't ordered anything yet</h3>
        <p className="text-sm text-[#737686] mt-1.5 mb-6 max-w-sm mx-auto">
          Add something to your cart and check out to place your first order.
        </p>
        <button onClick={onExplore} className="btn-primary !rounded-xl !text-sm px-6">
          Explore the marketplace
        </button>
      </div>
    );
  };

  /* Declining is reachable from the list and from an order's own page, so the
     dialog is built once and rendered by whichever of the two is on screen. */
  const declineModal = (
    <Modal
      isOpen={!!declineTarget}
      onClose={() => setDeclineTarget(null)}
      title="Decline this order?"
      subtitle={declineTarget ? `${declineTarget.reference} · ${declineTarget.counterparty.name}` : undefined}
      footer={
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => setDeclineTarget(null)} className="btn-ghost !rounded-xl !text-sm">
            Keep it
          </button>
          <button
            onClick={confirmDecline}
            className="px-4 py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold text-sm"
          >
            Decline order
          </button>
        </div>
      }
    >
      <label className="block text-xs font-semibold text-[#434655] mb-1.5">
        Reason (optional, shown to the buyer)
      </label>
      <textarea
        value={declineNote}
        onChange={(e) => setDeclineNote(e.target.value)}
        rows={3}
        placeholder="e.g. Sorry, this sold earlier today."
        className="input-base text-sm resize-none"
      />
      <p className="mt-2 text-xs text-[#737686]">
        The items go back to being available and the buyer is notified.
      </p>
    </Modal>
  );

  /* ─────────────────────────── One order's own page ─────────────────────── */
  if (selectedOrderId) {
    const shell = (children: React.ReactNode) => (
      <div className="min-h-screen bg-[#f8f9ff] pb-28">
        <div className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-[#c3c6d7]/60 px-4 py-3">
          <div className="max-w-3xl mx-auto flex items-center gap-3">
            <button
              onClick={() => (onCloseOrder ? onCloseOrder() : onBack())}
              aria-label="Back to orders"
              className="p-2 -ml-2 rounded-full hover:bg-[#eff4ff] text-[#434655] hover:text-[#2563eb] transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-lg font-bold text-[#0b1c30]">Order details</h1>
          </div>
        </div>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-6">{children}</div>
        {declineModal}
      </div>
    );

    if (detailLoading && !detail) {
      return shell(
        <div className="flex items-center justify-center py-24 text-[#434655] gap-3">
          <Loader2 className="w-6 h-6 animate-spin text-[#2563eb]" />
          <span className="text-sm font-medium">Loading order…</span>
        </div>,
      );
    }

    if (!detail) {
      return shell(
        <div className="text-center py-16 bg-white rounded-3xl border border-[#e5eeff] shadow-card">
          <div className="w-16 h-16 bg-[#eff4ff] text-[#2563eb] rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Package className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold text-[#0b1c30]">Order not available</h3>
          <p className="text-sm text-[#737686] mt-1.5 max-w-sm mx-auto">
            {detailError || 'This order may belong to another account.'}
          </p>
          <button
            onClick={() => (onCloseOrder ? onCloseOrder() : onBack())}
            className="btn-primary !rounded-xl !text-sm px-6 mt-6"
          >
            Back to orders
          </button>
        </div>,
      );
    }

    return shell(<OrderDetail
      order={detail}
      busy={pendingId === detail.id}
      error={error}
      notice={notice}
      onAct={act}
      onDecline={(o) => { setDeclineNote(''); setDeclineTarget(o); }}
      onOpenMessages={onOpenMessages}
    />);
  }

  return (
    <div className="min-h-screen bg-[#f8f9ff] pb-28">
      <div className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-[#c3c6d7]/60 px-4 py-3">
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 -ml-2 rounded-full hover:bg-[#eff4ff] text-[#434655] hover:text-[#2563eb] transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-xl font-bold text-[#0b1c30]">Orders</h1>
          {openOrders.length > 0 && (
            <span className="ml-auto text-xs font-bold text-[#2563eb] bg-[#eff4ff] px-2.5 py-1 rounded-full">
              {openOrders.length} open
            </span>
          )}
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-6">
        <div className="flex items-center gap-6 border-b border-[#c3c6d7]/60 mb-6">
          {([
            ['all', 'All orders'],
            ['incoming', 'Orders received'],
            ['placed', 'Orders placed'],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setSide(key)}
              className={`pb-3 font-semibold text-sm transition-all ${
                side === key
                  ? 'text-[#2563eb] border-b-2 border-[#2563eb]'
                  : 'text-[#737686] hover:text-[#0b1c30]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <ErrorBanner message={error} />
        {notice && (
          <div className="mb-4 flex items-start gap-2 rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2.5 animate-fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
            <p className="text-xs text-emerald-800 font-medium">{notice}</p>
          </div>
        )}

        {loading ? (
          <div className="space-y-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="bg-white rounded-2xl border border-[#e5eeff] p-4 shadow-card">
                <div className="flex justify-between mb-3">
                  <div className="space-y-2">
                    <div className="w-36 h-4 bg-slate-200 rounded animate-pulse" />
                    <div className="w-24 h-3 bg-slate-200 rounded animate-pulse" />
                  </div>
                  <div className="w-16 h-5 bg-slate-200 rounded animate-pulse" />
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-slate-200 rounded-lg animate-pulse" />
                  <div className="w-40 h-4 bg-slate-200 rounded animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        ) : orders.length === 0 ? (
          emptyState()
        ) : (
          <div className="space-y-8">
            {needsYou.length > 0 && (
              <section>
                <h2 className="text-xs font-bold text-amber-700 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  Waiting on you
                  <span className="text-amber-600">{needsYou.length}</span>
                </h2>
                <div className="space-y-4">{needsYou.map(renderOrder)}</div>
              </section>
            )}

            {waitingOnThem.length > 0 && (
              <section>
                <h2 className="text-xs font-bold text-[#a0a3b1] uppercase tracking-wider mb-3">
                  In progress
                  <span className="ml-1.5 text-[#2563eb]">{waitingOnThem.length}</span>
                </h2>
                <div className="space-y-4">{waitingOnThem.map(renderOrder)}</div>
              </section>
            )}

            {pastOrders.length > 0 && (
              <section>
                <h2 className="text-xs font-bold text-[#a0a3b1] uppercase tracking-wider mb-3">
                  Completed &amp; closed
                  <span className="ml-1.5 text-[#737686]">{pastOrders.length}</span>
                </h2>
                <div className="space-y-4">{pastOrders.map(renderOrder)}</div>
              </section>
            )}
          </div>
        )}
      </div>

      {declineModal}
    </div>
  );
};
