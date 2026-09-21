import React, { useEffect, useRef, useState } from 'react';
import { Loader2, Send, MessageSquare } from 'lucide-react';
import { ApplicationMessage } from '../../types';

interface ApplicationThreadProps {
  /** Which side of the conversation the viewer is on. Decides which bubbles are "mine". */
  viewer: 'admin' | 'applicant';
  /** Fetches the whole thread. Called on mount; opening it marks the other side's messages read on the server. */
  load: () => Promise<{ messages: ApplicationMessage[]; error?: string }>;
  /** Posts one message and returns it as stored. */
  send: (body: string) => Promise<{ success: boolean; message?: ApplicationMessage; error?: string }>;
  /** Shown when the thread is empty - each side has a different reason to be here. */
  emptyHint: string;
  /** Composer placeholder. */
  placeholder?: string;
  /** Disables the composer, with a reason shown in its place. */
  closedReason?: string;
}

/**
 * The conversation between an admin and a seller applicant.
 *
 * <p>One component for both sides, parameterised by which side is looking:
 * the thread is the same data and the same shape, and two implementations
 * would drift the moment one gained a feature. The admin embeds it in the
 * application review; the applicant sees it in the "your application is being
 * reviewed" panel, which is where they land when they tap Sell.
 *
 * <p>Deliberately simple - no polling, no typing indicators. An application
 * exchange is a few messages over hours or days, not a live chat. The thread
 * reloads when reopened and after each send, and the applicant is notified of
 * every admin message, which is enough for its pace.
 */
export const ApplicationThread: React.FC<ApplicationThreadProps> = ({
  viewer,
  load,
  send,
  emptyHint,
  placeholder = 'Write a message…',
  closedReason,
}) => {
  const [messages, setMessages] = useState<ApplicationMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    load().then((res) => {
      if (cancelled) return;
      if (res.error) setError(res.error);
      else setMessages(res.messages);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Newest message in view, on load and after every send. Optional call:
  // scrolling is a nicety, and not every environment that renders this
  // (jsdom, for one) implements it.
  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: 'end' });
  }, [messages.length]);

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    const res = await send(body);
    setSending(false);
    if (!res.success || !res.message) {
      setError(res.error || 'Could not send that message.');
      return;
    }
    // Append what the server stored rather than the draft, so the id and
    // timestamp are real and a reload shows exactly the same thing.
    setMessages((prev) => [...prev, res.message as ApplicationMessage]);
    setDraft('');
  };

  const isMine = (m: ApplicationMessage) => (viewer === 'admin') === m.fromAdmin;

  return (
    <div className="flex flex-col rounded-2xl border border-[#e5eeff] bg-[#f8f9ff] overflow-hidden">
      <div className="max-h-72 overflow-y-auto p-3 space-y-2">
        {loading ? (
          <div className="flex items-center gap-2 text-xs text-[#737686] py-4 justify-center">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading conversation…
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-start gap-2 text-xs text-[#737686] py-3 px-1">
            <MessageSquare className="w-4 h-4 mt-0.5 shrink-0 text-[#a0a3b1]" />
            <p className="leading-relaxed">{emptyHint}</p>
          </div>
        ) : (
          messages.map((m) => {
            const mine = isMine(m);
            return (
              <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                    mine
                      ? 'bg-[#2563eb] text-white rounded-br-md'
                      : 'bg-white text-[#0b1c30] border border-[#e5eeff] rounded-bl-md'
                  }`}
                >
                  <p className="whitespace-pre-wrap break-words">{m.body}</p>
                  <p className={`mt-1 text-[10px] ${mine ? 'text-white/70' : 'text-[#a0a3b1]'}`}>
                    {mine ? 'You' : m.senderName} · {new Date(m.createdAt).toLocaleString([], {
                      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                    })}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={endRef} />
      </div>

      {error && (
        <p className="px-3 pb-2 text-xs text-red-600 font-medium">{error}</p>
      )}

      {closedReason ? (
        <p className="px-3 py-2.5 text-xs text-[#737686] border-t border-[#e5eeff] bg-white">
          {closedReason}
        </p>
      ) : (
        <form onSubmit={submit} className="flex items-end gap-2 p-2 border-t border-[#e5eeff] bg-white">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              // Enter sends; Shift+Enter makes a new line, the convention
              // every chat this person has used already follows.
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            rows={2}
            maxLength={2000}
            placeholder={placeholder}
            aria-label="Message"
            className="input-base text-sm flex-1 resize-none"
          />
          <button
            type="submit"
            disabled={!draft.trim() || sending}
            aria-label="Send"
            className="shrink-0 h-10 w-10 rounded-xl bg-[#2563eb] hover:bg-[#1d4ed8] text-white
                       flex items-center justify-center disabled:opacity-50 transition-colors"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </form>
      )}
    </div>
  );
};
