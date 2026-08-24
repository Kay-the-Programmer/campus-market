import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from 'react';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';

export type ToastVariant = 'info' | 'success' | 'warning' | 'error';

export interface ToastOptions {
  title?: string;
  /** Milliseconds on screen. Pass 0 to require a manual dismiss. */
  duration?: number;
  action?: { label: string; onClick: () => void };
}

interface Toast extends ToastOptions {
  id: number;
  variant: ToastVariant;
  message: string;
  /** How many times this same thing has been said. Rendered as "x3". */
  count: number;
}

interface ToastApi {
  toast: (variant: ToastVariant, message: string, options?: ToastOptions) => number;
  info: (message: string, options?: ToastOptions) => number;
  success: (message: string, options?: ToastOptions) => number;
  warning: (message: string, options?: ToastOptions) => number;
  error: (message: string, options?: ToastOptions) => number;
  dismiss: (id: number) => void;
  dismissAll: () => void;
}

const ToastContext = createContext<ToastApi | null>(null);

/** Longer for the things a user must actually read. */
const DEFAULT_DURATION: Record<ToastVariant, number> = {
  info: 4000,
  success: 4000,
  warning: 6000,
  error: 8000,
};

/**
 * A runaway guard, not a display limit.
 *
 * The stack used to keep only the last four and throw the rest away the instant
 * they arrived - which is exactly backwards for a burst. The notification poller
 * fires one toast per unread item in a single tick, so ten arriving at once
 * meant six were destroyed before they were ever drawn, and an error could be
 * evicted by three trivial successes that happened to land after it.
 *
 * Everything is kept now and shown in turn. This cap exists only so a runaway
 * caller cannot grow the array without bound.
 */
const HARD_CAP = 12;

/**
 * Floors for a shortened dwell. A pile is drained by giving each card less time
 * than it would get alone, but never so little that it cannot be read.
 */
const MIN_DWELL = 2000;
/** Errors keep more of their time: they are the ones worth stopping for. */
const MIN_DWELL_ERROR = 3500;

/** Identity for coalescing. The same sentence twice is one event, said twice. */
const toastKey = (t: Pick<Toast, 'variant' | 'title' | 'message'>) =>
  `${t.variant}|${t.title ?? ''}|${t.message}`;

export const useToast = (): ToastApi => {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used inside a <ToastProvider>.');
  }
  return ctx;
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const dismissAll = useCallback(() => setToasts([]), []);

  const toast = useCallback(
    (variant: ToastVariant, message: string, options: ToastOptions = {}) => {
      const id = nextId.current++;
      setToasts((prev) => {
        const next: Toast = {
          id,
          variant,
          message,
          title: options.title,
          duration: options.duration ?? DEFAULT_DURATION[variant],
          action: options.action,
          count: 1,
        };

        /*
         * Already saying this? Say it once, louder.
         *
         * A double-tapped button and a poller that re-reports the same event
         * both produce identical cards, and three of those are three times the
         * space to convey nothing extra. The existing card takes a count and a
         * fresh countdown, which also keeps it in view while it is still true.
         */
        const key = toastKey(next);
        const dupeAt = prev.findIndex((t) => toastKey(t) === key);
        if (dupeAt !== -1) {
          const copy = [...prev];
          copy[dupeAt] = { ...copy[dupeAt], count: copy[dupeAt].count + 1 };
          return copy;
        }

        const grown = [...prev, next];
        if (grown.length <= HARD_CAP) return grown;

        /*
         * At the cap something has to go, and it should not be whatever
         * happens to be oldest: an error is the one card that was worth
         * interrupting for. Drop the oldest non-error first, and only fall
         * back to the oldest outright if errors are all there is.
         */
        const victim = grown.findIndex((t) => t.variant !== 'error');
        return grown.filter((_, i) => i !== (victim === -1 ? 0 : victim));
      });
      return id;
    },
    [],
  );

  const api = useMemo<ToastApi>(
    () => ({
      toast,
      info: (m, o) => toast('info', m, o),
      success: (m, o) => toast('success', m, o),
      warning: (m, o) => toast('warning', m, o),
      error: (m, o) => toast('error', m, o),
      dismiss,
      dismissAll,
    }),
    [toast, dismiss, dismissAll],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} onDismissAll={dismissAll} />
    </ToastContext.Provider>
  );
};

/**
 * One accent colour per variant, carried by the icon chip rather than the
 * card. A white card with a coloured chip stays legible over any page behind
 * it; four full-colour cards stacked read as a warning in themselves.
 */
const VARIANT_STYLES: Record<ToastVariant, { wrap: string; chip: string; icon: React.ReactNode }> = {
  info: {
    wrap: 'border-[#e5eeff]',
    chip: 'bg-[#eff4ff] text-[#2563eb]',
    icon: <Info className="w-4 h-4" />,
  },
  success: {
    wrap: 'border-[#007d55]/25',
    chip: 'bg-emerald-50 text-[#007d55]',
    icon: <CheckCircle2 className="w-4 h-4" />,
  },
  warning: {
    wrap: 'border-amber-200',
    chip: 'bg-amber-50 text-amber-600',
    icon: <AlertTriangle className="w-4 h-4" />,
  },
  error: {
    wrap: 'border-red-200',
    chip: 'bg-red-50 text-red-600',
    icon: <AlertCircle className="w-4 h-4" />,
  },
};

/**
 * What gets shown first when several are waiting. Success and info share a
 * band: neither is more urgent than the other, so between them recency wins.
 */
const SEVERITY: Record<ToastVariant, number> = {
  error: 0,
  warning: 1,
  success: 2,
  info: 2,
};

/** Cards still drawn behind the front one before the rest are hidden. */
const PEEK_DEPTH = 2;
/** Vertical sliver of each card behind, and how much each shrinks. */
const PEEK_OFFSET_PX = 9;
const PEEK_SCALE_STEP = 0.045;

const ToastViewport: React.FC<{
  toasts: Toast[];
  onDismiss: (id: number) => void;
  onDismissAll: () => void;
}> = ({ toasts, onDismiss, onDismissAll }) => {
  /**
   * Collapsed by default and expanded on hover or focus.
   *
   * <p>Four separate order updates used to fill the screen top to bottom,
   * covering the page they were reporting on. Stacked, any number of them
   * occupies one card's worth of space; opening the pile is a deliberate act.
   */
  const [expanded, setExpanded] = useState(false);

  // Nothing left to expand once the pile is down to one.
  useEffect(() => {
    if (toasts.length <= 1) setExpanded(false);
  }, [toasts.length]);

  if (toasts.length === 0) return null;

  /*
   * Newest at the front, except that something went wrong.
   *
   * Only the front card is on the clock, so position decides what you see now
   * and what you see in half a minute. In a flood - fifteen cart additions and
   * one failure among them - pure recency buried the failure at the back and
   * showed it last, after every trivial success had had its turn. The one card
   * worth interrupting for was the one made to wait.
   *
   * Severity bands first, recency within each, so info and success keep their
   * natural order relative to one another.
   */
  const ordered = [...toasts].sort(
    (a, b) => SEVERITY[a.variant] - SEVERITY[b.variant] || b.id - a.id,
  );
  const stacked = !expanded && ordered.length > 1;

  return (
    <div
      /* Top centre. The z-index clears the sticky header, which is z-40, so a
         toast is never tucked behind the nav it is often reporting on. */
      className="fixed z-[100] top-4 left-4 right-4 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:w-[380px] pointer-events-none"
      // Screen readers announce new toasts without moving focus away from the
      // user's current task.
      aria-live="polite"
      aria-relevant="additions"
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
      onFocusCapture={() => setExpanded(true)}
      onBlurCapture={(e) => {
        // Only collapse once focus has genuinely left the pile, not while it
        // moves between the buttons inside it.
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setExpanded(false);
      }}
    >
      {/* Expanded, the pile is a real list, and a real list of twelve would
          cover the page it is reporting on. It scrolls instead. */}
      <div
        className={
          stacked
            ? 'relative'
            : 'flex flex-col gap-2 max-h-[70vh] overflow-y-auto no-scrollbar pointer-events-auto'
        }
      >
        {ordered.map((t, i) => (
          <div
            key={t.id}
            className={
              stacked && i > 0
                ? 'absolute inset-x-0 top-0 transition-all duration-300 ease-out'
                : 'transition-all duration-300 ease-out'
            }
            style={
              stacked
                ? {
                    // Behind cards peek out below and shrink, so the pile reads
                    // as depth rather than as a list that failed to lay out.
                    transform: `translateY(${i * PEEK_OFFSET_PX}px) scale(${1 - i * PEEK_SCALE_STEP})`,
                    zIndex: 50 - i,
                    opacity: i > PEEK_DEPTH ? 0 : 1,
                    pointerEvents: i === 0 ? 'auto' : 'none',
                  }
                : undefined
            }
            aria-hidden={stacked && i > 0 ? true : undefined}
          >
            <ToastCard
              toast={t}
              onDismiss={onDismiss}
              // A card buried in the pile must not tick down while it is
              // unreadable; only the front one is on the clock.
              paused={stacked && i > 0}
              muted={stacked && i > 0}
              // How many are still waiting behind this one. Only the front card
              // is ever ticking, so without this a burst of eight order updates
              // at eight seconds each would hold the corner for over a minute.
              backlog={stacked ? ordered.length - 1 : 0}
            />
          </div>
        ))}

        {/* The count doubles as the affordance: it says how many are hidden
            and that hovering will show them. */}
        {stacked && (
          <div
            className="absolute -bottom-6 inset-x-0 flex justify-center"
            style={{ transform: `translateY(${Math.min(ordered.length - 1, PEEK_DEPTH) * PEEK_OFFSET_PX}px)` }}
          >
            <span className="px-2 py-0.5 rounded-full bg-[#0b1c30]/75 backdrop-blur-sm text-white text-[10px] font-bold">
              {ordered.length} notifications
            </span>
          </div>
        )}
      </div>

      {expanded && ordered.length > 1 && (
        <div className="flex justify-center mt-2">
          <button
            onClick={onDismissAll}
            className="pointer-events-auto px-3 py-1 rounded-full bg-[#0b1c30]/80 backdrop-blur-sm text-white text-[11px] font-bold hover:bg-[#0b1c30] transition-colors"
          >
            Clear all
          </button>
        </div>
      )}
    </div>
  );
};

const ToastCard: React.FC<{
  toast: Toast;
  onDismiss: (id: number) => void;
  /** Buried in the pile: hold its countdown until it reaches the front. */
  paused?: boolean;
  /** Buried in the pile: drop the body text so the stack reads as one object. */
  muted?: boolean;
  /** Cards still waiting behind this one. */
  backlog?: number;
}> = ({
  toast,
  onDismiss,
  paused = false,
  muted = false,
  backlog = 0,
}) => {
  const [leaving, setLeaving] = useState(false);
  const [entered, setEntered] = useState(false);

  /*
   * Time on screen, shortened by the queue behind it.
   *
   * Alone, a toast gets its full duration. With a pile waiting, holding each
   * one for the full time just postpones the last one - eight order updates
   * would have taken over a minute to drain, long after the person had stopped
   * caring. The floor keeps every card readable, and errors keep more of it.
   */
  const effectiveDuration = React.useMemo(() => {
    const base = toast.duration ?? 0;
    if (!base || backlog <= 0) return base;
    const floor = toast.variant === 'error' ? MIN_DWELL_ERROR : MIN_DWELL;
    return Math.max(Math.min(base, floor), Math.round(base / (1 + backlog * 0.6)));
  }, [toast.duration, toast.variant, backlog]);

  // Countdown is held in a ref so hovering can pause it without re-rendering.
  const remaining = useRef(effectiveDuration);
  const startedAt = useRef(Date.now());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const close = useCallback(() => {
    setLeaving(true);
    // Let the exit transition finish before the node is removed.
    setTimeout(() => onDismiss(toast.id), 180);
  }, [onDismiss, toast.id]);

  const clear = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };

  const resume = useCallback(() => {
    if (!remaining.current) return; // duration 0 => sticky
    startedAt.current = Date.now();
    timer.current = setTimeout(close, remaining.current);
  }, [close]);

  const pause = () => {
    if (!remaining.current) return;
    clear();
    remaining.current -= Date.now() - startedAt.current;
    if (remaining.current < 400) remaining.current = 400;
  };

  useEffect(() => {
    const raf = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  /*
   * Restarts the clock whenever the time it should get changes: on reaching the
   * front of the pile, when the backlog behind it shrinks, and when a duplicate
   * bumps the count - a thing being said again should stay up, not inherit the
   * remains of the previous countdown.
   */
  useEffect(() => {
    remaining.current = effectiveDuration;
    startedAt.current = Date.now();
    clear();
    // A card nobody can read must not be timing out behind the front one.
    if (!paused) resume();
    return clear;
  }, [resume, paused, effectiveDuration, toast.count]);

  const styles = VARIANT_STYLES[toast.variant];

  return (
    <div
      role={toast.variant === 'error' ? 'alert' : 'status'}
      onMouseEnter={pause}
      onMouseLeave={resume}
      /* Enters and leaves upward, towards the edge it is anchored to - a toast
         at the top sliding up from below would cross the content it sits over. */
      className={`w-full pointer-events-auto rounded-2xl border bg-white/95 backdrop-blur-xl
        shadow-[0_8px_30px_-6px_rgba(11,28,48,0.18)] px-3.5 py-3 flex items-start gap-3
        transition-all duration-200 ease-out ${styles.wrap}
        ${entered && !leaving ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'}`}
    >
      <span
        className={`shrink-0 w-7 h-7 rounded-xl flex items-center justify-center ${styles.chip}`}
      >
        {styles.icon}
      </span>

      <div className="flex-1 min-w-0">
        {toast.title && (
          <p className="font-bold text-[13px] leading-snug text-[#0b1c30] truncate">
            {toast.title}
          </p>
        )}
        {/* A repeat is worth knowing about - three identical "added to cart"
            means three went in - so the count is shown rather than the event
            silently collapsing to one. */}
        {toast.count > 1 && (
          <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded-md bg-[#eff4ff] text-[#2563eb] text-[10px] font-bold leading-none">
            ×{toast.count}
          </span>
        )}
        {/* Buried cards keep their title and lose the body: the pile should
            read as one object with a hint of what is underneath, not as three
            paragraphs fighting for the same space. */}
        {!muted && (
          <p className={`text-[13px] leading-snug ${toast.title ? 'text-[#434655] mt-0.5' : 'font-medium text-[#0b1c30]'}`}>
            {toast.message}
          </p>
        )}
        {toast.action && !muted && (
          <button
            onClick={() => { toast.action!.onClick(); close(); }}
            className="mt-1.5 text-xs font-bold text-[#2563eb] hover:text-[#004ac6]"
          >
            {toast.action.label} →
          </button>
        )}
      </div>

      {!muted && (
        <button
          onClick={close}
          aria-label="Dismiss notification"
          className="shrink-0 -mr-0.5 -mt-0.5 p-1.5 rounded-lg text-[#a0a3b1] hover:text-[#0b1c30] hover:bg-[#f1f2f7] transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
};
