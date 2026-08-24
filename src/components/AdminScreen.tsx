import React, { useEffect, useRef, useState } from 'react';
import {
  Users, Flag, LayoutDashboard, Tag, LogOut, ShieldCheck, Loader2, Trash2,
  Plus, Pencil, AlertTriangle, CheckCircle2, Ban, RotateCcw, BadgeCheck,
  Store, PackageCheck, Eye, Mail, Phone, MapPin, User as UserIcon, MessageSquare,
} from 'lucide-react';
import { AuthSession, AuditLogEntry, Listing, Order, zoneLabel } from '../types';
import { api } from '../services/api';
import { useLiveCounts } from '../hooks/useLiveCounts';
import { Modal, ErrorBanner, SuccessBanner, Field } from './shared/Modal';
import { PromoEditor } from './admin/PromoEditor';
import { SpecialOffersEditor } from './admin/SpecialOffersEditor';
import { ListingManager } from './admin/ListingManager';
import { formatPrice } from '../utils/currency';

type Tab =
  | 'dashboard' | 'reports' | 'sellers' | 'heldOrders' | 'chats'
  | 'users' | 'listings' | 'homepage' | 'specialOffers' | 'categories' | 'auditLogs';

/** One thread in the admin's inbox - always a handover they are mediating. */
interface ChatRow {
  id: string;
  peer: { id: string; name: string; avatarUrl?: string };
  listing: { id: string; title: string; image?: string; removed?: boolean };
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
  role: string;
}

interface ChatThread {
  id: string;
  peer: { id: string; name: string; avatarUrl?: string };
  listing: { id: string; title: string; removed?: boolean };
  role: string;
  messages: ChatMessage[];
}

interface ChatMessage {
  id: string;
  senderId: string;
  body: string;
  createdAt: string;
  mine: boolean;
}

interface AdminScreenProps {
  currentUser: AuthSession;
  activeTab?: Tab;
  onTabChange?: (tab: Tab) => void;
  onNavigateToSell: () => void;
  /** Opens a listing's public page from the admin catalogue. */
  onViewListing: (listing: Listing) => void;
  /** Loads a listing into the seller form for editing. */
  onEditListing: (listing: Listing) => void;
  onExitAdmin: () => void;
}

interface ReportRow {
  id: string;
  reporter: { id: string; name: string };
  targetType: 'LISTING' | 'USER';
  targetId: string;
  targetLabel?: string;
  targetListing?: { id: string; title: string; image?: string; removed: boolean } | null;
  targetUser?: { id: string; name: string } | null;
  reason: string;
  details?: string;
  status: 'PENDING' | 'RESOLVED';
  resolution?: string;
  resolvedByAdminName?: string;
  duplicate: boolean;
  createdAt: string;
}

interface AdminUserRow {
  id: string;
  name: string;
  email: string;
  role: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'BANNED';
  emailVerified: boolean;
  verified: boolean;
  suspendedUntil?: string;
  statusReason?: string;
  accountType?: string;
  sellerApprovalStatus?: string;
  sellerApprovalReason?: string;
  sellerRequestedAt?: string;
  campusZone?: string;
  department?: string;
  activeListings: number;
}

interface CategoryRow {
  id: string;
  name: string;
  slug: string;
  icon?: string;
  parentId?: string;
  parentName?: string;
  sortOrder: number;
  listingCount: number;
}

/** The full record behind a seller application - see AdminService.sellerApplicant. */
interface SellerApplicant {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  emailVerified: boolean;
  phone?: string;
  phoneVerified: boolean;
  campusZone?: string;
  department?: string;
  year?: string;
  bio?: string;
  memberSince?: string;
  status: string;
  statusReason?: string;
  suspendedUntil?: string;
  previouslyDisciplined: boolean;
  sellerApprovalStatus: string;
  sellerRequestedAt?: string;
  previousDecisionReason?: string;
  completedDeals: number;
  ordersPlaced: number;
  draftListings: number;
  ratingAverage: number;
  reviewCount: number;
  reportsAgainst: number;
  recentReports: {
    id: string; reason: string; details?: string;
    status: string; resolution?: string; createdAt: string;
  }[];
}

const when = (iso?: string) => (iso ? new Date(iso).toLocaleString() : '');

/** "3 months" - account age is the cheapest signal that somebody is real. */
const accountAge = (iso?: string) => {
  if (!iso) return 'unknown';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (Number.isNaN(days)) return 'unknown';
  if (days < 1) return 'today';
  if (days === 1) return '1 day';
  if (days < 30) return `${days} days`;
  const months = Math.floor(days / 30);
  return months < 12 ? `${months} month${months === 1 ? '' : 's'}` : `${Math.floor(months / 12)}y`;
};

/** One labelled fact in the applicant's contact block. */
const ApplicantFact: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex items-baseline justify-between gap-4 py-1.5">
    <dt className="text-slate-500 font-semibold shrink-0">{label}</dt>
    <dd className="text-slate-900 text-right min-w-0 break-words">{children}</dd>
  </div>
);

/** One figure from the applicant's history. */
const ApplicantStat: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="rounded-xl border border-slate-200 px-3 py-2">
    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</p>
    <p className="text-sm font-bold text-slate-900 mt-0.5">{value}</p>
  </div>
);

/**
 * Whether a contact detail has actually been proved.
 *
 * <p>An unconfirmed address or number is worse than none: it looks like a way
 * to reach someone and is not, which is precisely what an admin needs to know
 * before trusting the account with other students' orders.
 */
const VerifiedTick: React.FC<{ ok: boolean }> = ({ ok }) => (
  <span
    className={`ml-1 inline-flex items-center gap-0.5 text-[10px] font-bold ${
      ok ? 'text-emerald-700' : 'text-amber-700'
    }`}
  >
    {ok ? <CheckCircle2 className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
    {ok ? 'Verified' : 'Unverified'}
  </span>
);

/**
 * The full record behind one member: who they are, what their account has
 * done, and whether it has been in trouble. Shared by the seller-application
 * review and by user management, because approving somebody to sell and
 * verifying or banning them are the same question asked twice - and both were
 * being decided from a name and an email address alone.
 */
const MemberRecord: React.FC<{
  record: SellerApplicant | null;
  loading: boolean;
  /** Tunes the wording; the facts shown are identical either way. */
  context: 'application' | 'member';
}> = ({ record, loading, context }) => (
  <>
    {loading && !record ? (
      <div className="flex items-center justify-center py-10 gap-2 text-slate-500">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-sm">{context === 'application' ? 'Loading application…' : 'Loading member…'}</span>
      </div>
    ) : !record ? (
      <p className="text-sm text-slate-500 py-6 text-center">
        {context === 'application' ? 'That application could not be loaded.' : 'That member could not be loaded.'}
      </p>
    ) : (
      <div className="space-y-4">
        {/* Anything that should stop a decision, said first and loudly. Buried
            three rows down it would be read after the decision. */}
        {(record.previouslyDisciplined
      || record.reportsAgainst > 0
      || !record.emailVerified) && (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 space-y-1">
        <p className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5" /> Worth checking first
        </p>
        <ul className="text-xs text-amber-800 space-y-0.5 list-disc pl-4">
          {!record.emailVerified && <li>Email address has never been verified.</li>}
          {record.reportsAgainst > 0 && (
            <li>
              {record.reportsAgainst} report
              {record.reportsAgainst === 1 ? '' : 's'} filed against this account.
            </li>
          )}
          {record.previouslyDisciplined && (
            <li>
              This account has been moderated before
              {record.statusReason ? `: ${record.statusReason}` : '.'}
            </li>
          )}
        </ul>
      </div>
        )}

        {record.previousDecisionReason && (
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
        <p className="text-xs font-bold text-slate-700">Previously declined</p>
        <p className="text-xs text-slate-600 mt-0.5">{record.previousDecisionReason}</p>
      </div>
        )}

        {/* ── Who they are ── */}
        <section>
      <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
        Contact
      </h3>
      <dl className="text-xs divide-y divide-slate-100">
        <ApplicantFact label="Email">
          {record.email}{' '}
          <VerifiedTick ok={record.emailVerified} />
        </ApplicantFact>
        <ApplicantFact label="Phone">
          {/* The number is the thing that makes a handover happen, so
              its absence is a fact about the application, not a blank. */}
          {record.phone
            ? <>{record.phone} <VerifiedTick ok={record.phoneVerified} /></>
            : <span className="text-amber-700 font-semibold">Not provided</span>}
        </ApplicantFact>
        <ApplicantFact label="Campus zone">
          {record.campusZone || <span className="text-slate-400">—</span>}
        </ApplicantFact>
        <ApplicantFact label="Department">
          {record.department || <span className="text-slate-400">—</span>}
          {record.year ? ` · ${record.year}` : ''}
        </ApplicantFact>
      </dl>
      {record.bio && (
        <p className="mt-2 text-xs text-slate-600 bg-slate-50 rounded-lg px-3 py-2 leading-relaxed">
          {record.bio}
        </p>
      )}
        </section>

        {/* ── What their record says ── */}
        <section>
      <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
        Track record
      </h3>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <ApplicantStat label="Member for" value={accountAge(record.memberSince)} />
        <ApplicantStat label="Completed deals" value={record.completedDeals} />
        <ApplicantStat label="Orders placed" value={record.ordersPlaced} />
        <ApplicantStat
          label="Rating"
          value={record.reviewCount > 0
            ? `${record.ratingAverage.toFixed(1)} (${record.reviewCount})`
            : 'None yet'}
        />
      </div>
      <p className="mt-2 text-[11px] text-slate-500">
        {context === 'application'
          ? `Applied ${when(record.sellerRequestedAt)}`
          : `Joined ${when(record.memberSince)}`}
        {record.draftListings > 0
          && ` · ${record.draftListings} draft listing${record.draftListings === 1 ? '' : 's'} ready to publish`}
      </p>
        </section>

        {/* ── What others have said ── */}
        {record.recentReports.length > 0 && (
      <section>
        <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
          Reports against them
        </h3>
        <div className="space-y-1.5">
          {record.recentReports.map((r) => (
            <div key={r.id} className="rounded-lg border border-slate-200 px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-800">{r.reason}</span>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                  r.status === 'RESOLVED'
                    ? 'bg-slate-100 text-slate-600'
                    : 'bg-amber-50 text-amber-700 border border-amber-200'
                }`}>
                  {r.status === 'RESOLVED' ? (r.resolution || 'Resolved') : 'Pending'}
                </span>
              </div>
              {r.details && <p className="text-[11px] text-slate-600 mt-1">{r.details}</p>}
              <p className="text-[10px] text-slate-400 mt-1">{when(r.createdAt)}</p>
            </div>
          ))}
        </div>
      </section>
        )}
      </div>
    )}
  </>
);

export const AdminScreen: React.FC<AdminScreenProps> = ({
  activeTab = 'dashboard',
  onTabChange,
  onNavigateToSell,
  onViewListing,
  onEditListing,
  onExitAdmin,
}) => {
  const [tab, setTab] = useState<Tab>(activeTab);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [accessDenied, setAccessDenied] = useState(false);

  const [stats, setStats] = useState<any>(null);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [reportFilter, setReportFilter] = useState<'pending' | 'all'>('pending');
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [pendingSellers, setPendingSellers] = useState<AdminUserRow[]>([]);
  /** The applicant currently being reviewed, and their full record. */
  const [applicantId, setApplicantId] = useState<string | null>(null);
  const [applicant, setApplicant] = useState<SellerApplicant | null>(null);
  const [applicantLoading, setApplicantLoading] = useState(false);

  /*
   * Chats. Every thread here is one this admin is mediating - they become a
   * participant by fulfilling a held order, and the buyer needs to reach the
   * person actually holding the goods.
   */
  const [chats, setChats] = useState<ChatRow[]>([]);
  const [chatId, setChatId] = useState<string | null>(null);
  const [chatThread, setChatThread] = useState<ChatThread | null>(null);
  const [chatLoading, setChatLoading] = useState(false);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  /** The member being read from user management, and their full record. */
  const [memberRow, setMemberRow] = useState<AdminUserRow | null>(null);
  const [member, setMember] = useState<SellerApplicant | null>(null);
  const [memberLoading, setMemberLoading] = useState(false);
  const [heldOrders, setHeldOrders] = useState<Order[]>([]);

  /** Seller decision + held-order decision, both needing a reason box. */
  const [sellerAction, setSellerAction] =
    useState<{ user: AdminUserRow; kind: 'approve' | 'reject' } | null>(null);
  const [orderAction, setOrderAction] =
    useState<{ order: Order; kind: 'release' | 'fulfil' } | null>(null);
  /** The held order being read in full, before deciding what to do with it. */
  const [orderDetail, setOrderDetail] = useState<Order | null>(null);

  // modal state
  const [resolveTarget, setResolveTarget] = useState<ReportRow | null>(null);
  const [resolveAction, setResolveAction] = useState<'DISMISS' | 'REMOVE_LISTING' | 'BAN_USER'>('DISMISS');
  const [userAction, setUserAction] = useState<{ user: AdminUserRow; kind: 'suspend' | 'ban' | 'reinstate' } | null>(null);
  const [catEdit, setCatEdit] = useState<CategoryRow | null>(null);
  const [catCreate, setCatCreate] = useState(false);
  const [catDelete, setCatDelete] = useState<CategoryRow | null>(null);
  const [reassignTo, setReassignTo] = useState('');
  const [reason, setReason] = useState('');
  const [durationDays, setDurationDays] = useState('7');
  const [catName, setCatName] = useState('');
  const [catIcon, setCatIcon] = useState('');
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lastLoadedAt, setLastLoadedAt] = useState<Date | null>(null);

  useEffect(() => { setTab(activeTab); }, [activeTab]);

  const switchTab = (next: Tab) => {
    setTab(next);
    setError(null);
    setNotice(null);
    onTabChange?.(next);
  };

  /**
   * Report an action that worked.
   *
   * <p>Clears any standing error on the way past. The two banners render one
   * directly above the other, so a failure left over from an earlier action sat
   * contradicting the confirmation of this one - two messages about different
   * things, with nothing on either saying which was which. Handed to the child
   * editors as their `onNotice` too, so this holds for every success in the
   * console rather than only the ones raised here.
   */
  const succeed = (message: string) => {
    setError(null);
    setNotice(message);
  };

  /**
   * @param silent re-fetch without tearing the screen down to a spinner. Used
   *   by the refresh control, where the content is already on screen and
   *   replacing it with a loader for half a second reads as a page change.
   */
  const loadAll = async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    const s = await api.admin.getStats();
    if (s.status === 403 || s.status === 401) {
      setAccessDenied(true);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    setStats(s);
    const [r, u, c, a, ps, ho] = await Promise.all([
      api.admin.getReports(reportFilter),
      api.admin.getUsers(),
      api.categories.getAll(),
      api.admin.getAuditLogs(),
      api.admin.getPendingSellers(),
      api.admin.getHeldOrders(),
    ]);
    setReports((r.reports as ReportRow[]) || []);
    setUsers((u.users as AdminUserRow[]) || []);
    setCategories((c.categories as CategoryRow[]) || []);
    setAuditLogs((a.logs as AuditLogEntry[]) || []);
    setPendingSellers((ps.sellers as AdminUserRow[]) || []);
    setHeldOrders(ho.orders || []);
    setLoading(false);
    setRefreshing(false);
    setLastLoadedAt(new Date());
  };

  // --------------------------------------------------- seller approvals
  const submitSellerAction = async () => {
    if (!sellerAction) return;
    const { user, kind } = sellerAction;

    // A refusal the applicant can't act on is worse than no answer at all.
    if (kind === 'reject' && !reason.trim()) {
      setError('Give a reason - the applicant sees it.');
      return;
    }
    setBusy(true);
    const res = kind === 'approve'
      ? await api.admin.approveSeller(user.id, reason.trim() || undefined)
      : await api.admin.rejectSeller(user.id, reason.trim());
    setBusy(false);

    if (res.success) {
      setSellerAction(null);
      setReason('');
      succeed(kind === 'approve'
        ? `${user.name} can now post listings.`
        : `${user.name}'s application was declined.`);
      /*
       * Silent, for the reason `silent` exists at all: the queues are already
       * on screen and the admin has just been told what happened. Reloading
       * loudly replaced that confirmation with "Loading admin console…" for
       * half a second - the console appearing to navigate away from the very
       * result it was reporting. The Refresh control's spinner covers it.
       */
      loadAll(true);
    } else {
      setError(res.error || 'That did not work.');
    }
  };

  // ------------------------------------------------------- held orders
  const submitOrderAction = async () => {
    if (!orderAction) return;
    const { order, kind } = orderAction;

    setBusy(true);
    const res = kind === 'release'
      ? await api.admin.releaseOrder(order.id, reason.trim() || undefined)
      : await api.admin.fulfilOrder(order.id, reason.trim() || undefined);
    setBusy(false);

    if (res.success) {
      setOrderAction(null);
      setReason('');

      /*
       * Fulfilling means this admin is personally handing the goods over, so
       * arranging that is the very next thing they do - the thread opens
       * rather than being announced and left to be found.
       *
       * It opens on the console's own Chats tab. Sending them out to the
       * customer Messages screen worked, but it dropped a moderator out of the
       * console mid-queue to finish an admin job on a shopper's page.
       */
      if (kind === 'fulfil' && 'conversationId' in res && res.conversationId) {
        succeed(`Order ${order.reference} fulfilled. Opening the chat…`);
        loadAll(true);
        await loadChats(true);
        setTab('chats');
        onTabChange?.('chats');
        openChat(String(res.conversationId));
        return;
      }

      succeed(kind === 'release'
        ? `Order ${order.reference} passed to ${order.counterparty.name}.`
        // No thread only when every listing on it was already deleted.
        : `Order ${order.reference} fulfilled.`);
      loadAll(true);
    } else {
      // Another admin may have reviewed it first; reload so the queue is honest.
      setError(res.error || 'That did not work.');
      if (res.code === 'ORDER_ALREADY_REVIEWED') {
        setOrderAction(null);
        // Silent, so the explanation of what the other admin already did
        // survives on screen instead of being flashed away by the reload.
        loadAll(true);
      }
    }
  };

  useEffect(() => { loadAll(); }, []);

  /*
   * The console's own copies of the numbers, kept current alongside the nav
   * badges. The sidebar count and the dashboard tile are fed by different
   * state, so refreshing only one left the two disagreeing on screen - the
   * badge saying five held orders next to a tile still saying four.
   *
   * Silent: this is a background top-up, and replacing the queue with loading
   * skeletons every thirty seconds would be worse than the staleness it fixes.
   */
  useLiveCounts({
    enabled: true,
    refresh: () => loadAll(true),
  });

  /* The applicant's full record, fetched only when one is opened - the queue
     itself has no use for reports or trading history. */
  useEffect(() => {
    if (!applicantId) {
      setApplicant(null);
      return;
    }
    let cancelled = false;
    setApplicantLoading(true);
    api.admin.getSellerApplicant(applicantId).then((res) => {
      if (cancelled) return;
      setApplicantLoading(false);
      if (res.applicant) setApplicant(res.applicant as SellerApplicant);
      else setError(res.error || 'Could not load that application.');
    });
    return () => { cancelled = true; };
  }, [applicantId]);

  /* Fetched when the tab is first opened rather than with the rest of the
     console: nine other tabs have no use for the admin's inbox. */
  useEffect(() => {
    if (tab === 'chats') loadChats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  /* New messages arrive while the tab sits open, so it rides the same poller
     as the queue counts. Silent - see loadChats. */
  useLiveCounts({
    enabled: tab === 'chats',
    refresh: async () => {
      if (chatId) await openChatSilently(chatId);
      await loadChats(true);
    },
  });

  /* Newest message in view whenever the thread changes or grows - a chat that
     opens showing its middle reads as broken. */
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ block: 'end' });
  }, [chatThread]);

  /* Same again for user management, which reads the identical record - see
     MemberRecord. Fetched on open, for the same reason: the table has no use
     for reports or trading history until somebody asks for them. */
  useEffect(() => {
    if (!memberRow) {
      setMember(null);
      return;
    }
    let cancelled = false;
    setMemberLoading(true);
    api.admin.getMember(memberRow.id).then((res) => {
      if (cancelled) return;
      setMemberLoading(false);
      if (res.member) setMember(res.member as SellerApplicant);
      else setError(res.error || 'Could not load that member.');
    });
    return () => { cancelled = true; };
  }, [memberRow]);

  useEffect(() => {
    api.admin.getReports(reportFilter).then((r) => setReports((r.reports as ReportRow[]) || []));
  }, [reportFilter]);

  // ---------------------------------------------------------------- actions
  const submitResolve = async () => {
    if (!resolveTarget) return;
    if (!reason.trim()) { setError('A reason is required for the audit log.'); return; }
    setBusy(true);
    const res = await api.admin.resolveReport(resolveTarget.id, resolveAction, reason.trim());
    setBusy(false);
    if (res.success) {
      succeed('Report resolved.');
      setResolveTarget(null);
      setReason('');
      loadAll(true);
    } else {
      // Another admin got there first (workflow 19).
      setError(res.error || 'Could not resolve this report.');
      if (res.code === 'REPORT_ALREADY_RESOLVED') { setResolveTarget(null); loadAll(true); }
    }
  };

  const submitUserAction = async () => {
    if (!userAction) return;
    if (userAction.kind !== 'reinstate' && !reason.trim()) {
      setError('A reason is required for the audit log.');
      return;
    }
    setBusy(true);
    const { user, kind } = userAction;
    const res =
      kind === 'suspend' ? await api.admin.suspendUser(user.id, reason.trim(), parseInt(durationDays, 10) || 7)
      : kind === 'ban' ? await api.admin.banUser(user.id, reason.trim())
      : await api.admin.reinstateUser(user.id, reason.trim() || undefined);
    setBusy(false);
    if (res.success) {
      succeed(res.message || 'Done.');
      setUserAction(null);
      setReason('');
      loadAll(true);
    } else {
      setError(res.error || 'That action failed.');
    }
  };

  /*
   * Silent by default, for the reason the flag exists everywhere else here:
   * this runs on the badge poller, and a loud reload would replace a thread
   * being read with a spinner every thirty seconds.
   */
  const loadChats = async (silent = false) => {
    if (!silent) setChatLoading(true);
    const res = await api.messages.getAll();
    if (!silent) setChatLoading(false);
    if (res.error) {
      if (!silent) setError(res.error);
      return;
    }
    setChats((res.threads as ChatRow[]) || []);
  };

  const openChat = async (id: string) => {
    setChatId(id);
    const res = await api.messages.getById(id);
    const thread = res.thread as ChatThread | undefined;
    if (!thread) {
      setError(res.error || 'Could not open that conversation.');
      return;
    }
    setChatThread(thread);
    // Opening marks it read server-side, so the unread badge needs re-reading.
    loadChats(true);
  };

  /*
   * Re-read the open thread without announcing it. The announcement is what
   * drives the poller that calls this, so a loud read would retrigger itself
   * forever; and a reply landing after the admin has moved on must not paint
   * itself over the thread they moved to.
   */
  const openChatSilently = async (id: string) => {
    const res = await api.messages.getById(id, { silent: true });
    const thread = res.thread as ChatThread | undefined;
    if (thread && chatId === id) setChatThread(thread);
  };

  const sendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reply.trim() || !chatId) return;
    setSending(true);
    const res = await api.messages.send(chatId, reply.trim());
    setSending(false);
    if (res.success) {
      setReply('');
      openChat(chatId);
      return;
    }
    setError(res.error || 'Message could not be sent.');
  };

  const toggleVerify = async (user: AdminUserRow) => {
    const res = await api.admin.verifyUser(user.id, !user.verified);
    if (res.success) { succeed(`${user.name} ${user.verified ? 'unverified' : 'verified'}.`); loadAll(true); }
    else setError(res.error || 'Could not update verification.');
  };

  const saveCategory = async () => {
    if (!catName.trim()) { setError('Name is required.'); return; }
    setBusy(true);
    const res = catEdit
      ? await api.admin.updateCategory(catEdit.id, { name: catName.trim(), icon: catIcon.trim() || undefined })
      : await api.admin.createCategory({ name: catName.trim(), icon: catIcon.trim() || undefined });
    setBusy(false);
    if (res.success) {
      succeed(catEdit ? 'Category updated.' : 'Category created.');
      setCatEdit(null); setCatCreate(false); setCatName(''); setCatIcon('');
      loadAll(true);
    } else setError(res.error || 'Could not save the category.');
  };

  const deleteCategory = async () => {
    if (!catDelete) return;
    setBusy(true);
    const res = await api.admin.deleteCategory(catDelete.id, reassignTo || undefined);
    setBusy(false);
    if (res.success) {
      succeed('Category deleted.');
      setCatDelete(null); setReassignTo('');
      loadAll(true);
    } else {
      // In use: offer to move the listings somewhere first (workflow 22).
      setError(res.error || 'Could not delete the category.');
    }
  };

  // ------------------------------------------------------------------- view
  if (accessDenied) {
    return (
      <div className="min-h-screen bg-[#f8f9ff] flex items-center justify-center p-6">
        <div className="bg-red-50 border border-red-200 rounded-2xl p-8 max-w-md text-center">
          <h2 className="text-lg font-bold text-red-700 mb-2">403 — Administrator access required</h2>
          <p className="text-sm text-red-600 mb-6">This console is restricted to admin accounts.</p>
          <button onClick={onExitAdmin} className="px-6 py-2.5 bg-red-600 text-white font-semibold rounded-xl hover:bg-red-700">
            Exit to Campus Feed
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f8f9ff] flex items-center justify-center gap-2 text-purple-600 text-sm font-semibold">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading admin console…
      </div>
    );
  }

  const metric = (label: string, value: number | string, tone: string) => (
    <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs">
      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{label}</span>
      <div className={`text-2xl font-extrabold mt-2 ${tone}`}>{value}</div>
    </div>
  );

  return (
    // Navigation (sidebar on desktop, tab strip on mobile) is supplied by the
    // app shell's AdminNav, so this screen renders content only.
    <div className="min-h-screen bg-slate-50">
      <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
        <div className="max-w-6xl mx-auto space-y-6">
          {/* These are queues other people are waiting in, and the console only
              fetched when it opened. Showing when that was - and offering to
              redo it - beats an admin reading an empty queue as "nothing to
              do" when an application arrived ten minutes ago. */}
          <div className="flex items-center justify-end gap-3">
            {lastLoadedAt && (
              <span className="text-[11px] text-slate-400">
                Updated {lastLoadedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            <button
              onClick={() => loadAll(true)}
              disabled={refreshing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>

          <ErrorBanner message={error} />
          <SuccessBanner message={notice} />

          {/* DASHBOARD */}
          {tab === 'dashboard' && (
            <div className="space-y-6">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">Dashboard</h1>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {metric('Total Users', stats?.totalUsers ?? 0, 'text-slate-900')}
                {metric('Active Listings', stats?.activeListings ?? 0, 'text-slate-900')}
                {metric('Completed Deals', stats?.completedDeals ?? 0, 'text-slate-900')}
                {metric('Pending Reports', stats?.pendingReports ?? 0, (stats?.pendingReports ?? 0) > 0 ? 'text-red-600' : 'text-slate-900')}
              </div>
              {/* The two queues that gate other people's ability to trade -
                  kept next to Reports so nothing sits unnoticed. */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {metric('Seller Approvals', stats?.pendingSellers ?? 0,
                  (stats?.pendingSellers ?? 0) > 0 ? 'text-blue-600' : 'text-slate-900')}
                {metric('Held Orders', stats?.heldOrders ?? 0,
                  (stats?.heldOrders ?? 0) > 0 ? 'text-violet-600' : 'text-slate-900')}
                {metric('Suspended Users', stats?.suspendedUsers ?? 0, 'text-amber-600')}
                {metric('Banned Users', stats?.bannedUsers ?? 0, 'text-red-600')}
              </div>
              <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-xs">
                <h3 className="font-bold text-slate-900 text-base mb-4">Recent moderation activity</h3>
                {auditLogs.slice(0, 6).map((log) => (
                  <div key={log.id} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                    <span className="text-xs font-semibold text-purple-700">{log.action}</span>
                    <span className="text-xs text-slate-500">{when(log.timestamp)}</span>
                  </div>
                ))}
                {auditLogs.length === 0 && <p className="text-xs text-slate-500">Nothing yet.</p>}
              </div>
            </div>
          )}

          {/* REPORTS */}
          {tab === 'reports' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold tracking-tight text-slate-900">Moderation queue</h1>
                <div className="flex items-center bg-white border border-slate-200 p-1 rounded-xl">
                  {(['pending', 'all'] as const).map((f) => (
                    <button
                      key={f}
                      onClick={() => setReportFilter(f)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize ${
                        reportFilter === f ? 'bg-purple-100 text-purple-800' : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>

              {reports.length === 0 ? (
                <div className="bg-white border border-slate-200/80 rounded-3xl p-12 text-center shadow-xs">
                  <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
                  <h3 className="font-bold text-slate-900">Queue is clear</h3>
                  <p className="text-xs text-slate-500 mt-1">No {reportFilter === 'pending' ? 'pending ' : ''}reports.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {reports.map((r) => (
                    <div key={r.id} className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-xs">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200 text-[11px] font-bold uppercase">
                              {r.reason.replace(/_/g, ' ')}
                            </span>
                            <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[11px] font-bold uppercase">
                              {r.targetType}
                            </span>
                            {r.duplicate && (
                              <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-[11px] font-bold">
                                DUPLICATE
                              </span>
                            )}
                            {r.status === 'RESOLVED' && (
                              <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-bold">
                                {r.resolution} {r.resolvedByAdminName ? `· ${r.resolvedByAdminName}` : ''}
                              </span>
                            )}
                          </div>
                          <p className="font-bold text-slate-900 text-sm mt-2">
                            {r.targetLabel || r.targetListing?.title || r.targetUser?.name || r.targetId}
                          </p>
                          {r.details && <p className="text-xs text-slate-600 mt-1">{r.details}</p>}
                          <p className="text-[11px] text-slate-400 mt-1">
                            Reported by {r.reporter?.name} · {when(r.createdAt)}
                          </p>
                        </div>
                        {r.status === 'PENDING' && (
                          <button
                            onClick={() => {
                              setResolveTarget(r);
                              setResolveAction(r.targetType === 'LISTING' ? 'REMOVE_LISTING' : 'BAN_USER');
                              setReason('');
                            }}
                            className="shrink-0 px-3 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold"
                          >
                            Review
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* SELLER APPROVALS */}
          {tab === 'sellers' && (
            <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-xs space-y-4">
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900">Seller approvals</h1>
                <p className="text-sm text-slate-500 mt-1">
                  Nobody can post a listing until you approve them. Approving does not grant the
                  verified badge — their orders still come here for review until it does.
                </p>
              </div>

              {pendingSellers.length === 0 ? (
                <div className="text-center py-16">
                  <Store className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                  <h3 className="font-bold text-slate-800">No applications waiting</h3>
                  <p className="text-sm text-slate-500 mt-1">
                    New seller sign-ups land here for review.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {pendingSellers.map((u) => (
                    <div key={u.id} className="border border-slate-200 rounded-2xl p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-bold text-slate-900">{u.name}</p>
                          <p className="text-xs text-slate-500 mt-0.5">{u.email}</p>
                          <div className="flex flex-wrap items-center gap-2 mt-2">
                            {!u.emailVerified && (
                              <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-[11px] font-bold">
                                Email not verified
                              </span>
                            )}
                            {u.campusZone && (
                              <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[11px] font-semibold">
                                {u.campusZone}
                              </span>
                            )}
                            {u.department && (
                              <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[11px] font-semibold">
                                {u.department}
                              </span>
                            )}
                            <span className="text-[11px] text-slate-400">
                              Applied {when(u.sellerRequestedAt)}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {/* Leads the row on purpose. Approving grants standing
                              on the marketplace, and the row above carries a
                              name and an email - nothing that separates a real
                              student from an account made ten minutes ago. */}
                          <button
                            onClick={() => setApplicantId(u.id)}
                            className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-bold transition-colors"
                          >
                            Review
                          </button>
                          <button
                            onClick={() => { setReason(''); setSellerAction({ user: u, kind: 'approve' }); }}
                            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => { setReason(''); setSellerAction({ user: u, kind: 'reject' }); }}
                            className="px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 text-xs font-bold transition-colors"
                          >
                            Decline
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* HELD ORDERS */}
          {tab === 'heldOrders' && (
            <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-xs space-y-4">
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900">Held orders</h1>
                <p className="text-sm text-slate-500 mt-1">
                  Orders placed with sellers who aren't verified yet. The seller cannot see these —
                  pass it on to them, or supply the items yourself.
                </p>
              </div>

              {heldOrders.length === 0 ? (
                <div className="text-center py-16">
                  <PackageCheck className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                  <h3 className="font-bold text-slate-800">Nothing held</h3>
                  <p className="text-sm text-slate-500 mt-1">
                    Orders on unverified sellers' listings appear here.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {heldOrders.map((o) => (
                    <div key={o.id} className="border border-slate-200 rounded-2xl p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-xs font-bold text-slate-600">{o.reference}</span>
                            <span className="px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 border border-violet-200 text-[11px] font-bold">
                              Awaiting review
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 mt-1">
                            Seller <span className="font-semibold text-slate-700">{o.counterparty.name}</span>
                            {' · '}{when(o.createdAt)}
                          </p>
                        </div>
                        <p className="text-lg font-extrabold text-slate-900 shrink-0">
                          {formatPrice(o.total)}
                        </p>
                      </div>

                      <div className="space-y-1.5 mb-3">
                        {o.items.map((item) => (
                          <div key={item.id} className="flex items-center justify-between gap-3 text-sm">
                            <span className="text-slate-700 truncate">
                              {item.title}
                              {item.quantity > 1 && (
                                <span className="text-slate-400 font-semibold"> × {item.quantity}</span>
                              )}
                            </span>
                            <span className="text-slate-500 shrink-0">
                              {formatPrice(item.lineTotal)}
                            </span>
                          </div>
                        ))}
                      </div>

                      {o.buyerNote && (
                        <p className="text-xs text-slate-600 bg-slate-50 rounded-lg px-2.5 py-1.5 mb-3">
                          <span className="font-semibold">Buyer note:</span> {o.buyerNote}
                        </p>
                      )}

                      <div className="flex items-center gap-2 pt-3 border-t border-slate-100">
                        <button
                          onClick={() => setOrderDetail(o)}
                          className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-bold transition-colors flex items-center gap-1.5"
                        >
                          <Eye className="w-3.5 h-3.5" /> View details
                        </button>
                        <button
                          onClick={() => { setReason(''); setOrderAction({ order: o, kind: 'release' }); }}
                          className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-colors"
                        >
                          Release to seller
                        </button>
                        <button
                          onClick={() => { setReason(''); setOrderAction({ order: o, kind: 'fulfil' }); }}
                          className="px-3 py-1.5 rounded-lg border border-emerald-200 text-emerald-700 hover:bg-emerald-50 text-xs font-bold transition-colors"
                        >
                          Fulfil directly
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* CHATS — handovers this admin is mediating */}
          {tab === 'chats' && (
            <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-xs space-y-4">
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900">Chats</h1>
                <p className="text-sm text-slate-500 mt-1">
                  {/* Not only mediated threads: admins may sell, so their own
                      buyers land here too. The badge on each row says which. */}
                  Handovers you're mediating, plus any conversations about your own listings.
                  Fulfilling a held order puts you in the thread with the buyer.
                </p>
              </div>

              {chatLoading && chats.length === 0 ? (
                <div className="flex items-center justify-center py-16 gap-2 text-slate-500">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span className="text-sm">Loading conversations…</span>
                </div>
              ) : chats.length === 0 ? (
                <div className="text-center py-16">
                  <MessageSquare className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                  <h3 className="font-bold text-slate-800">No conversations</h3>
                  <p className="text-sm text-slate-500 mt-1">
                    Threads appear here when you fulfil a held order, or when
                    someone messages you about a listing of your own.
                  </p>
                </div>
              ) : (
                <div className="grid md:grid-cols-[280px_1fr] gap-4 min-h-[26rem]">
                  {/* Thread list */}
                  <div className="md:border-r md:border-slate-100 md:pr-4 space-y-1.5 max-h-[32rem] overflow-y-auto">
                    {chats.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => openChat(c.id)}
                        className={`w-full text-left rounded-xl px-3 py-2.5 border transition-colors ${
                          chatId === c.id
                            ? 'border-slate-900 bg-slate-50'
                            : 'border-transparent hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-sm text-slate-900 truncate">
                            {c.peer?.name || 'Unknown'}
                          </span>
                          {c.unreadCount > 0 && (
                            <span className="shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                              {c.unreadCount}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span
                            className={`shrink-0 px-1.5 py-0.5 rounded-full text-[9px] font-bold ${
                              c.role === 'Mediating'
                                ? 'bg-violet-50 text-violet-700 border border-violet-200'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {c.role}
                          </span>
                          <p className="text-[11px] text-slate-500 truncate">
                            {c.listing?.title}
                          </p>
                        </div>
                        <p className="text-xs text-slate-600 truncate mt-1">{c.lastMessage}</p>
                      </button>
                    ))}
                  </div>

                  {/* Open thread */}
                  {!chatId ? (
                    <div className="flex items-center justify-center text-sm text-slate-500 py-16">
                      Pick a conversation to read it.
                    </div>
                  ) : (
                    <div className="flex flex-col min-h-0">
                      {chatThread && (
                        <div className="flex items-center justify-between gap-3 pb-2 mb-2 border-b border-slate-100">
                          <div className="min-w-0">
                            <p className="font-bold text-sm text-slate-900 truncate">
                              {chatThread.peer?.name || 'Unknown'}
                            </p>
                            <p className="text-[11px] text-slate-500 truncate">
                              {chatThread.listing?.title}
                            </p>
                          </div>
                          <span
                            className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              chatThread.role === 'Mediating'
                                ? 'bg-violet-50 text-violet-700 border border-violet-200'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {chatThread.role}
                          </span>
                        </div>
                      )}
                      <div className="flex-1 max-h-[26rem] overflow-y-auto space-y-2 pr-1">
                        {(chatThread?.messages || []).map((m) => (
                          <div
                            key={m.id}
                            className={`flex ${m.mine ? 'justify-end' : 'justify-start'}`}
                          >
                            <div
                              className={`max-w-[85%] rounded-2xl px-3 py-2 ${
                                m.mine
                                  ? 'bg-slate-900 text-white'
                                  : 'bg-slate-100 text-slate-800'
                              }`}
                            >
                              <p className="text-sm whitespace-pre-wrap break-words">{m.body}</p>
                              <p className="text-[10px] opacity-60 mt-0.5 text-right">
                                {new Date(m.createdAt).toLocaleTimeString([], {
                                  hour: '2-digit', minute: '2-digit',
                                })}
                              </p>
                            </div>
                          </div>
                        ))}
                        <div ref={chatEndRef} />
                      </div>

                      <form onSubmit={sendReply} className="flex items-center gap-2 pt-3 mt-3 border-t border-slate-100">
                        <input
                          value={reply}
                          onChange={(e) => setReply(e.target.value)}
                          placeholder="Message the buyer…"
                          className="input-base text-sm flex-1"
                        />
                        <button
                          type="submit"
                          disabled={sending || !reply.trim()}
                          className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-bold disabled:opacity-50 shrink-0"
                        >
                          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Send'}
                        </button>
                      </form>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* HOME PAGE — self-contained, owns its own data and modals. */}
          {tab === 'homepage' && <PromoEditor onNotice={succeed} />}

          {tab === 'specialOffers' && <SpecialOffersEditor onNotice={succeed} />}

          {tab === 'listings' && (
            <ListingManager
              onNotice={succeed}
              onViewListing={onViewListing}
              onEditListing={onEditListing}
              onCreateListing={onNavigateToSell}
            />
          )}

          {/* USERS */}
          {tab === 'users' && (
            <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-xs space-y-4">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">User management</h1>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs font-bold uppercase tracking-wider text-slate-400">
                      <th className="py-3 px-3">Name</th>
                      <th className="py-3 px-3">Email</th>
                      <th className="py-3 px-3">Role</th>
                      <th className="py-3 px-3">Status</th>
                      <th className="py-3 px-3">Listings</th>
                      <th className="py-3 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {users.map((u) => (
                      <tr key={u.id} className="hover:bg-slate-50/50">
                        <td className="py-3 px-3 font-semibold text-slate-900">
                          {u.name}
                          {u.verified && <BadgeCheck className="w-3.5 h-3.5 text-blue-600 inline ml-1" />}
                        </td>
                        <td className="py-3 px-3 text-slate-600">{u.email}</td>
                        <td className="py-3 px-3">
                          <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${
                            u.role === 'ADMIN' || u.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                          }`}>{u.role}</span>
                        </td>
                        <td className="py-3 px-3">
                          {u.status === 'BANNED' ? (
                            <span className="px-2.5 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-bold">Banned</span>
                          ) : u.status === 'SUSPENDED' ? (
                            <span className="px-2.5 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs font-bold" title={u.statusReason}>
                              Suspended{u.suspendedUntil ? ` → ${new Date(u.suspendedUntil).toLocaleDateString()}` : ''}
                            </span>
                          ) : (
                            <span className="px-2.5 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-xs font-bold">Active</span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-slate-600">{u.activeListings}</td>
                        <td className="py-3 px-3 text-right space-x-1.5 whitespace-nowrap">
                          {/* Leads the row, as it does in the seller queue.
                              Verifying vouches for someone and banning cuts
                              them off; neither should be decided from a name
                              and an email address. */}
                          <button
                            onClick={() => setMemberRow(u)}
                            className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg text-xs inline-flex items-center gap-1"
                          >
                            <Eye className="w-3 h-3" /> View
                          </button>
                          <button onClick={() => toggleVerify(u)} className="px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold rounded-lg text-xs">
                            {u.verified ? 'Unverify' : 'Verify'}
                          </button>
                          {/* Admins are never offered Suspend/Ban - the API refuses it. */}
                          {u.role.toUpperCase() !== 'ADMIN' && (
                            u.status === 'ACTIVE' ? (
                              <>
                                <button onClick={() => { setUserAction({ user: u, kind: 'suspend' }); setReason(''); }} className="px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-700 font-semibold rounded-lg text-xs">
                                  Suspend
                                </button>
                                <button onClick={() => { setUserAction({ user: u, kind: 'ban' }); setReason(''); }} className="px-2 py-1 bg-red-50 hover:bg-red-100 text-red-700 font-semibold rounded-lg text-xs">
                                  Ban
                                </button>
                              </>
                            ) : (
                              <button onClick={() => { setUserAction({ user: u, kind: 'reinstate' }); setReason(''); }} className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-semibold rounded-lg text-xs inline-flex items-center gap-1">
                                <RotateCcw className="w-3 h-3" /> Reinstate
                              </button>
                            )
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* CATEGORIES */}
          {tab === 'categories' && (
            <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold tracking-tight text-slate-900">Categories</h1>
                <button
                  onClick={() => { setCatCreate(true); setCatName(''); setCatIcon(''); }}
                  className="px-3 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" /> New category
                </button>
              </div>
              <div className="divide-y divide-slate-100">
                {categories.map((c) => (
                  <div key={c.id} className="flex items-center justify-between py-3">
                    <div>
                      <p className="font-semibold text-slate-900 text-sm">{c.name}</p>
                      <p className="text-xs text-slate-500">
                        {c.slug} · {c.listingCount} listing{c.listingCount === 1 ? '' : 's'}
                        {c.parentName ? ` · under ${c.parentName}` : ''}
                      </p>
                    </div>
                    <div className="space-x-1.5">
                      <button
                        onClick={() => { setCatEdit(c); setCatName(c.name); setCatIcon(c.icon || ''); }}
                        className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg text-xs inline-flex items-center gap-1"
                      >
                        <Pencil className="w-3 h-3" /> Edit
                      </button>
                      <button
                        onClick={() => { setCatDelete(c); setReassignTo(''); setError(null); }}
                        className="px-2 py-1 bg-red-50 hover:bg-red-100 text-red-700 font-semibold rounded-lg text-xs inline-flex items-center gap-1"
                      >
                        <Trash2 className="w-3 h-3" /> Delete
                      </button>
                    </div>
                  </div>
                ))}
                {categories.length === 0 && <p className="text-xs text-slate-500 py-4">No categories yet.</p>}
              </div>
            </div>
          )}

          {/* AUDIT */}
          {tab === 'auditLogs' && (
            <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-xs space-y-4">
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900">Audit trail</h1>
                <p className="text-xs text-slate-500">Every admin action that changes another user's data is recorded here.</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs font-bold uppercase tracking-wider text-slate-400">
                      <th className="py-3 px-3">When</th>
                      <th className="py-3 px-3">Admin</th>
                      <th className="py-3 px-3">Action</th>
                      <th className="py-3 px-3">Reason / details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {auditLogs.map((log: any) => (
                      <tr key={log.id} className="hover:bg-slate-50/50">
                        <td className="py-3 px-3 text-xs text-slate-500">{when(log.createdAt || log.timestamp)}</td>
                        <td className="py-3 px-3 font-semibold text-slate-900">{log.adminName || log.adminId}</td>
                        <td className="py-3 px-3">
                          <span className="px-2.5 py-0.5 bg-purple-50 text-purple-700 border border-purple-200 rounded-full text-xs font-bold uppercase">
                            {log.action}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-xs text-slate-700">
                          <span className="font-semibold">{log.reason}</span>
                          {log.details && <span className="block text-slate-500">{log.details}</span>}
                        </td>
                      </tr>
                    ))}
                    {auditLogs.length === 0 && (
                      <tr><td colSpan={4} className="py-6 text-center text-xs text-slate-500">No entries yet.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* ---------------------------------------------------------- modals */}
      <Modal
        isOpen={!!resolveTarget}
        onClose={() => setResolveTarget(null)}
        title="Resolve report"
        subtitle={resolveTarget?.targetLabel || resolveTarget?.targetListing?.title || resolveTarget?.targetUser?.name}
        footer={
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => setResolveTarget(null)} className="btn-ghost !rounded-xl !text-sm">Cancel</button>
            <button onClick={submitResolve} disabled={busy} className="px-4 py-3 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-semibold text-sm">
              {busy ? 'Working…' : 'Apply'}
            </button>
          </div>
        }
      >
        <Field label="Action">
          <select value={resolveAction} onChange={(e) => setResolveAction(e.target.value as any)} className="input-base text-sm bg-white">
            <option value="DISMISS">Dismiss — no action needed</option>
            {resolveTarget?.targetType === 'LISTING' && <option value="REMOVE_LISTING">Remove listing</option>}
            <option value="BAN_USER">Ban the user</option>
          </select>
        </Field>
        {resolveAction !== 'DISMISS' && (
          <div className="flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5 mb-4">
            <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-800 font-medium">
              {resolveAction === 'BAN_USER'
                ? 'Banning ends their sessions immediately and hides their listings.'
                : 'The listing is removed from all public views.'}
            </p>
          </div>
        )}
        <Field label="Reason (recorded in the audit log)">
          <input value={reason} onChange={(e) => setReason(e.target.value)} className="input-base text-sm" placeholder="Explain the decision" />
        </Field>
      </Modal>

      {/*
        Member record, opened from user management. Read-only, like the
        applicant review: each moderation action keeps its own confirmation,
        because each one asks for a reason that goes into the audit log.
      */}
      <Modal
        isOpen={!!memberRow}
        onClose={() => setMemberRow(null)}
        title={memberRow ? memberRow.name : ''}
        subtitle={memberRow ? `${memberRow.email} · ${memberRow.role}` : undefined}
        footer={
          <div className="flex items-center justify-between gap-3">
            <button onClick={() => setMemberRow(null)} className="btn-ghost !rounded-xl !text-sm">
              Close
            </button>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { const u = memberRow!; setMemberRow(null); toggleVerify(u); }}
                className="px-3 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold text-xs"
              >
                {memberRow?.verified ? 'Unverify' : 'Verify'}
              </button>
              {/* Admins are never offered Suspend/Ban - the API refuses it. */}
              {memberRow && memberRow.role.toUpperCase() !== 'ADMIN' && (
                memberRow.status === 'ACTIVE' ? (
                  <>
                    <button
                      onClick={() => {
                        const u = memberRow; setMemberRow(null);
                        setReason(''); setUserAction({ user: u, kind: 'suspend' });
                      }}
                      className="px-3 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-700 font-semibold text-xs"
                    >
                      Suspend
                    </button>
                    <button
                      onClick={() => {
                        const u = memberRow; setMemberRow(null);
                        setReason(''); setUserAction({ user: u, kind: 'ban' });
                      }}
                      className="px-3 py-2 rounded-xl bg-red-50 hover:bg-red-100 text-red-700 font-semibold text-xs"
                    >
                      Ban
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => {
                      const u = memberRow; setMemberRow(null);
                      setReason(''); setUserAction({ user: u, kind: 'reinstate' });
                    }}
                    className="px-3 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-semibold text-xs inline-flex items-center gap-1"
                  >
                    <RotateCcw className="w-3 h-3" /> Reinstate
                  </button>
                )
              )}
            </div>
          </div>
        }
      >
        <MemberRecord record={member} loading={memberLoading} context="member" />
      </Modal>

      {/* Applicant review - the step before a decision */}
      <Modal
        isOpen={!!applicantId}
        onClose={() => setApplicantId(null)}
        title="Seller application"
        subtitle={applicant ? `${applicant.name} · ${applicant.email}` : undefined}
        footer={
          <div className="grid grid-cols-3 gap-3">
            <button onClick={() => setApplicantId(null)} className="btn-ghost !rounded-xl !text-sm">
              Close
            </button>
            <button
              onClick={() => {
                const u = pendingSellers.find((p) => p.id === applicantId);
                setApplicantId(null);
                if (u) { setReason(''); setSellerAction({ user: u, kind: 'reject' }); }
              }}
              disabled={!applicant}
              className="px-4 py-3 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 font-semibold text-sm disabled:opacity-50"
            >
              Decline
            </button>
            <button
              onClick={() => {
                const u = pendingSellers.find((p) => p.id === applicantId);
                setApplicantId(null);
                if (u) { setReason(''); setSellerAction({ user: u, kind: 'approve' }); }
              }}
              disabled={!applicant}
              className="px-4 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm disabled:opacity-50"
            >
              Approve
            </button>
          </div>
        }
      >
        <MemberRecord record={applicant} loading={applicantLoading} context="application" />
      </Modal>

      {/* Seller approval decision */}
      <Modal
        isOpen={!!sellerAction}
        onClose={() => setSellerAction(null)}
        title={
          sellerAction?.kind === 'approve'
            ? `Approve ${sellerAction.user.name} to sell?`
            : `Decline ${sellerAction?.user.name}'s application?`
        }
        subtitle={sellerAction?.user.email}
        footer={
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => setSellerAction(null)} className="btn-ghost !rounded-xl !text-sm">
              Cancel
            </button>
            <button
              onClick={submitSellerAction}
              disabled={busy}
              className={`px-4 py-3 rounded-xl text-white font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50 ${
                sellerAction?.kind === 'approve'
                  ? 'bg-emerald-600 hover:bg-emerald-700'
                  : 'bg-red-600 hover:bg-red-700'
              }`}
            >
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}
              {sellerAction?.kind === 'approve' ? 'Approve' : 'Decline'}
            </button>
          </div>
        }
      >
        {sellerAction?.kind === 'approve' ? (
          <p className="text-xs text-slate-600 mb-3">
            They'll be able to post listings straight away. Orders on those listings still come
            to you for review until you give them the verified badge.
          </p>
        ) : (
          <p className="text-xs text-slate-600 mb-3">
            They'll be told why and can apply again later.
          </p>
        )}
        <Field
          label={sellerAction?.kind === 'approve' ? 'Note (optional)' : 'Reason (required)'}
          hint="Recorded in the audit log."
        >
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="input-base text-sm"
            placeholder={
              sellerAction?.kind === 'approve'
                ? 'e.g. Verified student ID in person'
                : 'e.g. Campus email could not be confirmed'
            }
          />
        </Field>
      </Modal>

      {/*
        Held-order details.
        Read-only: the two decisions stay on their own confirmations, each of
        which asks for a note. This is the page you read before choosing.
      */}
      <Modal
        isOpen={!!orderDetail}
        onClose={() => setOrderDetail(null)}
        title={orderDetail ? `Order ${orderDetail.reference}` : ''}
        subtitle={orderDetail ? `Placed ${when(orderDetail.createdAt)}` : undefined}
        footer={
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setOrderDetail(null)}
              className="btn-ghost !rounded-xl !text-sm"
            >
              Close
            </button>
            <button
              onClick={() => {
                const order = orderDetail!;
                setOrderDetail(null);
                setReason('');
                setOrderAction({ order, kind: 'release' });
              }}
              className="px-4 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-sm"
            >
              Release to seller
            </button>
          </div>
        }
      >
        {orderDetail && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-slate-200 p-3">
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-1.5">
                  Buyer
                </p>
                {orderDetail.buyer ? (
                  <>
                    <p className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                      <UserIcon className="w-3.5 h-3.5 text-slate-400" />
                      {orderDetail.buyer.name}
                    </p>
                    {orderDetail.buyer.email && (
                      <p className="text-xs text-slate-600 mt-1 flex items-center gap-1.5 break-all">
                        <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        {orderDetail.buyer.email}
                      </p>
                    )}
                    {orderDetail.buyer.phone && (
                      <p className="text-xs text-slate-600 mt-1 flex items-center gap-1.5">
                        <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        {orderDetail.buyer.phone}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-slate-500">Not available.</p>
                )}
              </div>

              <div className="rounded-xl border border-slate-200 p-3">
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-1.5">
                  Seller (unverified)
                </p>
                <p className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                  <Store className="w-3.5 h-3.5 text-slate-400" />
                  {orderDetail.counterparty.name}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Cannot see this order yet.
                </p>
              </div>
            </div>

            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-1.5">
                Items
              </p>
              <div className="space-y-1.5">
                {orderDetail.items.map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-slate-700 min-w-0 truncate">
                      {item.title}
                      {item.quantity > 1 && (
                        <span className="text-slate-400 font-semibold"> × {item.quantity}</span>
                      )}
                    </span>
                    <span className="text-slate-500 shrink-0">{formatPrice(item.lineTotal)}</span>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between border-t border-slate-200 mt-2 pt-2">
                <span className="text-sm font-bold text-slate-900">Total</span>
                <span className="text-base font-extrabold text-slate-900">
                  {formatPrice(orderDetail.total)}
                </span>
              </div>
            </div>

            {orderDetail.meetupZone && (
              <p className="text-xs text-slate-600 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-slate-400" />
                Pickup around{' '}
                <span className="font-semibold text-slate-700">
                  {zoneLabel(orderDetail.meetupZone)}
                </span>
              </p>
            )}

            {orderDetail.buyerNote && (
              <p className="text-xs text-slate-600 bg-slate-50 rounded-lg px-2.5 py-1.5">
                <span className="font-semibold">Buyer note:</span> {orderDetail.buyerNote}
              </p>
            )}
          </div>
        )}
      </Modal>

      {/* Held-order decision */}
      <Modal
        isOpen={!!orderAction}
        onClose={() => setOrderAction(null)}
        title={
          orderAction?.kind === 'release'
            ? `Release ${orderAction.order.reference} to the seller?`
            : `Fulfil ${orderAction?.order.reference} yourself?`
        }
        subtitle={orderAction ? `Seller: ${orderAction.order.counterparty.name}` : undefined}
        footer={
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => setOrderAction(null)} className="btn-ghost !rounded-xl !text-sm">
              Cancel
            </button>
            <button
              onClick={submitOrderAction}
              disabled={busy}
              className={`px-4 py-3 rounded-xl text-white font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50 ${
                orderAction?.kind === 'release'
                  ? 'bg-slate-900 hover:bg-slate-800'
                  : 'bg-emerald-600 hover:bg-emerald-700'
              }`}
            >
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}
              {orderAction?.kind === 'release' ? 'Release' : 'Mark fulfilled'}
            </button>
          </div>
        }
      >
        <p className="text-xs text-slate-600 mb-3">
          {orderAction?.kind === 'release'
            ? 'The seller will see the order and can accept or decline it. A chat thread opens between them and the buyer.'
            : 'The order completes now and you supply the items. A chat opens between the buyer and the seller with you in it, so the buyer can arrange collection with you. The seller is told an item sold but sees no order details until they are verified. The sale is still credited to them, so their history and the buyer’s review stay correct.'}
        </p>
        <Field label="Note (optional)" hint="Shown to the buyer and recorded in the audit log.">
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="input-base text-sm"
            placeholder={
              orderAction?.kind === 'release'
                ? 'e.g. Seller ID checked'
                : 'e.g. Collected from seller, handing over at the Union'
            }
          />
        </Field>
      </Modal>

      <Modal
        isOpen={!!userAction}
        onClose={() => setUserAction(null)}
        title={
          userAction?.kind === 'suspend' ? `Suspend ${userAction.user.name}`
          : userAction?.kind === 'ban' ? `Ban ${userAction.user.name}?`
          : `Reinstate ${userAction?.user.name}`
        }
        footer={
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => setUserAction(null)} className="btn-ghost !rounded-xl !text-sm">Cancel</button>
            <button
              onClick={submitUserAction}
              disabled={busy}
              className={`px-4 py-3 rounded-xl text-white font-semibold text-sm ${
                userAction?.kind === 'ban' ? 'bg-red-600 hover:bg-red-700'
                : userAction?.kind === 'suspend' ? 'bg-amber-500 hover:bg-amber-600'
                : 'bg-emerald-600 hover:bg-emerald-700'
              }`}
            >
              {busy ? 'Working…' : userAction?.kind === 'ban' ? 'Ban permanently' : userAction?.kind === 'suspend' ? 'Suspend' : 'Reinstate'}
            </button>
          </div>
        }
      >
        {userAction?.kind === 'ban' && (
          <div className="flex items-start gap-2 rounded-xl bg-red-50 border border-red-200 px-3 py-2.5 mb-4">
            <Ban className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
            <p className="text-xs text-red-700 font-medium">
              Their active sessions end on their next request and their listings stop appearing publicly.
            </p>
          </div>
        )}
        <Field label={userAction?.kind === 'reinstate' ? 'Reason (optional)' : 'Reason (recorded in the audit log)'}>
          <input value={reason} onChange={(e) => setReason(e.target.value)} className="input-base text-sm" />
        </Field>
        {userAction?.kind === 'suspend' && (
          <Field label="Duration (days)">
            <input type="number" min={1} value={durationDays} onChange={(e) => setDurationDays(e.target.value)} className="input-base text-sm" />
          </Field>
        )}
      </Modal>

      <Modal
        isOpen={catCreate || !!catEdit}
        onClose={() => { setCatCreate(false); setCatEdit(null); }}
        title={catEdit ? 'Edit category' : 'New category'}
        footer={
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => { setCatCreate(false); setCatEdit(null); }} className="btn-ghost !rounded-xl !text-sm">Cancel</button>
            <button onClick={saveCategory} disabled={busy} className="btn-primary !rounded-xl !text-sm">
              {busy ? 'Saving…' : 'Save'}
            </button>
          </div>
        }
      >
        <Field label="Name"><input value={catName} onChange={(e) => setCatName(e.target.value)} className="input-base text-sm" /></Field>
        <Field label="Icon (optional)" hint="A lucide icon name, e.g. book-open."><input value={catIcon} onChange={(e) => setCatIcon(e.target.value)} className="input-base text-sm" /></Field>
      </Modal>

      <Modal
        isOpen={!!catDelete}
        onClose={() => { setCatDelete(null); setReassignTo(''); }}
        title={`Delete "${catDelete?.name}"?`}
        subtitle={catDelete && catDelete.listingCount > 0 ? `${catDelete.listingCount} listing(s) currently use it.` : undefined}
        footer={
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => { setCatDelete(null); setReassignTo(''); }} className="btn-ghost !rounded-xl !text-sm">Cancel</button>
            <button onClick={deleteCategory} disabled={busy} className="px-4 py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold text-sm">
              {busy ? 'Working…' : 'Delete'}
            </button>
          </div>
        }
      >
        <ErrorBanner message={error} />
        {catDelete && catDelete.listingCount > 0 && (
          <Field label="Move its listings to" hint="A category in use cannot be deleted until its listings have somewhere to go.">
            <select value={reassignTo} onChange={(e) => setReassignTo(e.target.value)} className="input-base text-sm bg-white">
              <option value="">Select a category…</option>
              {categories.filter((c) => c.id !== catDelete.id).map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </Field>
        )}
        <p className="text-xs text-[#737686]">This cannot be undone.</p>
      </Modal>
    </div>
  );
};
