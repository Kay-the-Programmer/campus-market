package com.campusmarket.service;

import com.campusmarket.domain.*;
import com.campusmarket.repository.*;
import com.campusmarket.security.AccessGuard;
import com.campusmarket.security.Principal;
import com.campusmarket.web.dto.MessagingDtos.ConversationDetailDto;
import com.campusmarket.web.dto.MessagingDtos.ConversationSummaryDto;
import com.campusmarket.web.dto.MessagingDtos.MessageDto;
import com.campusmarket.web.error.ApiException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Workflow 15: conversations pinned to a listing, and message delivery. */
@Service
@RequiredArgsConstructor
public class ConversationService {

    private final ConversationRepository conversationRepository;
    private final MessageRepository messageRepository;
    private final ListingRepository listingRepository;
    private final UserBlockRepository userBlockRepository;
    private final NotificationService notificationService;
    private final AccessGuard accessGuard;
    private final DtoMapper mapper;

    /**
     * Finds the thread for this listing+buyer+seller triple or opens one.
     *
     * <p>Shared entry point for "Chat with Seller", checkout (workflow 13) and
     * booking requests (workflow 14) so all three converge on one thread per
     * listing rather than spawning duplicates.
     */
    @Transactional
    public Conversation findOrCreate(Listing listing, User buyer) {
        User seller = listing.getSeller();
        if (seller.getId().equals(buyer.getId())) {
            throw ApiException.badRequest("SELF_CONVERSATION",
                    "You cannot start a conversation about your own listing.");
        }
        return conversationRepository
                .findByListingIdAndBuyerIdAndSellerId(listing.getId(), buyer.getId(), seller.getId())
                .orElseGet(() -> {
                    Conversation conversation = new Conversation();
                    conversation.setListing(listing);
                    conversation.setBuyer(buyer);
                    conversation.setSeller(seller);
                    return conversationRepository.save(conversation);
                });
    }

    @Transactional
    public Message postMessage(Conversation conversation, User sender, String body) {
        return postMessage(conversation, sender, body, false);
    }

    /**
     * @param withheldFromSeller order details the seller may not see yet. Used
     *        by the admin-mediated fulfil path; see {@link Message}.
     */
    @Transactional
    public Message postMessage(Conversation conversation, User sender, String body,
                               boolean withheldFromSeller) {
        User recipient = conversation.counterpartyOf(sender.getId());

        Message message = new Message();
        message.setConversation(conversation);
        message.setSender(sender);
        message.setBody(body.trim());
        message.setWithheldFromSeller(withheldFromSeller);

        // If the recipient has blocked this sender the message is still written and
        // still visible to moderators - it is simply withheld from the recipient's
        // inbox. Failing loudly would tell a bad actor they had been blocked.
        if (userBlockRepository.existsByBlockerIdAndBlockedId(recipient.getId(), sender.getId())) {
            message.setFlagged(true);
            message.setFlagReason("RECIPIENT_BLOCKED_SENDER");
        }

        messageRepository.save(message);
        conversation.setLastMessageAt(Instant.now());

        // A withheld message must not announce itself either: the notification
        // carries a preview, so telling the seller about it would deliver by
        // push exactly the text the thread is holding back.
        boolean recipientIsSealedSeller = withheldFromSeller
                && conversation.getSeller().getId().equals(recipient.getId());

        if (!message.isFlagged() && !recipientIsSealedSeller) {
            notificationService.notify(recipient, NotificationType.MESSAGE,
                    "New message from " + sender.getName(),
                    truncate(message.getBody()),
                    "/messages/" + conversation.getId());
        }
        return message;
    }

    // ------------------------------------------------------------- read side
    @Transactional(readOnly = true)
    public List<ConversationSummaryDto> listForUser(Principal principal) {
        // Participant-scoped below. Admins appear here only for threads about
        // their own listings - a seller who cannot answer a buyer cannot sell.
        accessGuard.requireOwnerContext(principal);
        UUID me = principal.id();

        return conversationRepository.findAllForUser(me).stream()
                .map(conversation -> {
                    // A sealed seller gets the newest message they are allowed
                    // to see. Using the plain preview here would print the
                    // withheld order details straight into their inbox list.
                    boolean sealed = conversation.getSeller().getId().equals(me)
                            && principal.user().ordersNeedReview();

                    String preview = (sealed
                            ? messageRepository
                                .findFirstByConversationIdAndFlaggedFalseAndWithheldFromSellerFalseOrderByCreatedAtDesc(
                                        conversation.getId())
                            : messageRepository
                                .findFirstByConversationIdAndFlaggedFalseOrderByCreatedAtDesc(
                                        conversation.getId()))
                            .map(Message::getBody)
                            .orElse("No messages yet");

                    return new ConversationSummaryDto(
                            conversation.getId(),
                            mapper.user(conversation.counterpartyOf(me), principal),
                            mapper.listingRef(conversation.getListing()),
                            truncate(preview),
                            conversation.getLastMessageAt(),
                            messageRepository.countUnread(conversation.getId(), me),
                            threadRole(conversation, me));
                })
                .toList();
    }

    @Transactional
    public ConversationDetailDto getThread(Principal principal, UUID conversationId) {
        accessGuard.requireOwnerContext(principal);
        UUID me = principal.id();

        Conversation conversation = conversationRepository.findById(conversationId)
                .orElseThrow(() -> ApiException.notFound("Conversation not found."));

        // Ownership check before anything is returned (RBAC rule 1) - a customer
        // must never be able to read a thread they are not part of.
        if (!conversation.involves(me)) {
            throw ApiException.forbidden("You can only read your own conversations.");
        }

        messageRepository.markThreadRead(conversationId, me, Instant.now());

        // That bulk update flushes and clears the persistence context, which
        // detaches everything loaded above. Re-read the conversation so the
        // listing's lazy collections are still attached when they are mapped.
        conversation = conversationRepository.findById(conversationId)
                .orElseThrow(() -> ApiException.notFound("Conversation not found."));

        // Only the seller is sealed out of withheld messages, and only while
        // unverified. The buyer wrote them and the admin brokered them, so for
        // those two the thread reads normally.
        boolean sealed = conversation.getSeller().getId().equals(me)
                && principal.user().ordersNeedReview();

        List<MessageDto> messages = messageRepository
                .findByConversationIdOrderByCreatedAtAsc(conversationId).stream()
                // Withheld messages stay visible to their sender so nothing looks
                // broken to them, but never reach the person who blocked them.
                .filter(m -> !m.isFlagged() || m.getSender().getId().equals(me))
                // Order details an unverified seller is not yet entitled to see.
                .filter(m -> !(sealed && m.isWithheldFromSeller()))
                .map(m -> new MessageDto(
                        m.getId(),
                        m.getSender().getId(),
                        m.getSender().getId().equals(me),
                        m.getBody(),
                        m.getCreatedAt(),
                        m.getReadAt()))
                .toList();

        Listing listing = conversation.getListing();
        boolean canMarkSold = conversation.getSeller().getId().equals(me)
                && !listing.isDeleted()
                && listing.getStatus() != ListingStatus.SOLD;

        return new ConversationDetailDto(
                conversation.getId(),
                mapper.user(conversation.counterpartyOf(me), principal),
                mapper.listingRef(listing),
                threadRole(conversation, me),
                canMarkSold,
                messages);
    }

    // ------------------------------------------------------------ write side
    @Transactional
    public MessageDto send(Principal principal, UUID conversationId, String body) {
        accessGuard.requireOwnerContext(principal);
        requireBody(body);

        Conversation conversation = conversationRepository.findById(conversationId)
                .orElseThrow(() -> ApiException.notFound("Conversation not found."));

        if (!conversation.involves(principal.id())) {
            throw ApiException.forbidden("You are not a participant in this conversation.");
        }

        Message message = postMessage(conversation, principal.user(), body);
        return new MessageDto(message.getId(), message.getSender().getId(), true,
                message.getBody(), message.getCreatedAt(), message.getReadAt());
    }

    /** "Chat with Seller" from a listing detail page. */
    @Transactional
    public ConversationDetailDto startFromListing(Principal principal, UUID listingId, String body) {
        accessGuard.requireCustomer(principal);

        Listing listing = listingRepository.findByIdAndDeletedFalse(listingId)
                .orElseThrow(() -> ApiException.notFound("This listing is no longer available."));

        Conversation conversation = findOrCreate(listing, principal.user());
        if (body != null && !body.isBlank()) {
            postMessage(conversation, principal.user(), body);
        }
        return getThread(principal, conversation.getId());
    }

    /**
     * Which side of the thread this viewer is on - the label the inbox shows.
     *
     * <p>A mediating admin is neither buying nor selling: they brokered it. The
     * two-way version called them a buyer, which is the one thing an admin must
     * never appear to be on a marketplace they also police.
     */
    private String threadRole(Conversation conversation, UUID me) {
        if (conversation.getMediatorAdmin() != null
                && conversation.getMediatorAdmin().getId().equals(me)) {
            return "Mediating";
        }
        return conversation.getSeller().getId().equals(me) ? "Selling" : "Buying";
    }

    private void requireBody(String body) {
        if (body == null || body.isBlank()) {
            throw ApiException.badRequest("Message cannot be empty.");
        }
    }

    private String truncate(String text) {
        if (text == null) {
            return null;
        }
        return text.length() <= 140 ? text : text.substring(0, 137) + "...";
    }
}
