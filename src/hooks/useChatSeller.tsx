import React, { useState } from 'react';
import { Loader2, MessageSquare } from 'lucide-react';
import { AuthSession, Listing } from '../types';
import { api } from '../services/api';
import { useToast } from '../components/shared/ToastProvider';

type OpenChat = (listing: Listing, conversationId?: string) => void;

/*
 * Starting a chat from a card.
 *
 * Resolving the thread is a round trip, and until it lands there is nothing to
 * open. Card grids used to call onOpenChat straight away, which dropped the
 * caller into the inbox on whatever thread sorted first - the wrong seller as
 * soon as you have more than one. So the id is fetched first, and the wait is
 * shown rather than hidden: a tap that appears to do nothing for a second
 * reads as a broken button and gets pressed again.
 */
export function useChatSeller(currentUser: AuthSession | undefined, onOpenChat?: OpenChat) {
  const toast = useToast();
  const [connectingTo, setConnectingTo] = useState<Listing | null>(null);

  const chatSeller = async (listing: Listing, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!onOpenChat || connectingTo) return;

    /* Guest and admin never get a thread: hand straight to the parent, which
       raises the sign-in modal or explains the admin case. Calling the API
       first would just be a guaranteed 401 in front of the same outcome. */
    if (!currentUser || currentUser.role === 'guest' || currentUser.role === 'admin') {
      onOpenChat(listing);
      return;
    }

    setConnectingTo(listing);
    try {
      const res = await api.listings.startChat(listing.id);
      if (!res.ok) {
        toast.error(res.error || 'Could not open a chat with this seller.');
        return;
      }
      onOpenChat(listing, (res.data as { thread?: { id?: string } })?.thread?.id);
    } finally {
      setConnectingTo(null);
    }
  };

  return { chatSeller, connectingTo, isConnecting: connectingTo !== null };
}

/**
 * The "Connecting to seller" wait.
 *
 * Modal on purpose: the next thing to happen is a full screen change to the
 * inbox, so letting the shelf stay tappable underneath would only invite a
 * second press that lands somewhere else.
 */
export const ConnectingToSellerOverlay: React.FC<{ listing: Listing | null }> = ({ listing }) => {
  if (!listing) return null;

  const sellerName = listing.seller?.name?.split(' ')[0];

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-[70] flex items-center justify-center bg-[#0b1020]/45 backdrop-blur-sm"
    >
      <div className="flex flex-col items-center gap-3 px-7 py-6 rounded-2xl bg-white shadow-2xl shadow-slate-900/20">
        <span className="relative flex items-center justify-center w-11 h-11">
          <span className="absolute inset-0 rounded-full bg-[#eff4ff] animate-ping" />
          <span className="relative flex items-center justify-center w-11 h-11 rounded-full bg-[#eff4ff]">
            <MessageSquare className="w-5 h-5 text-[#2563eb]" />
          </span>
        </span>
        <div className="flex items-center gap-2 text-sm font-bold text-[#0b1020]">
          <Loader2 className="w-4 h-4 animate-spin text-[#2563eb]" />
          Connecting to seller
        </div>
        <p className="text-xs font-medium text-[#737686] max-w-[15rem] text-center">
          Opening your chat{sellerName ? ` with ${sellerName}` : ''} about “{listing.title}”.
        </p>
      </div>
    </div>
  );
};
