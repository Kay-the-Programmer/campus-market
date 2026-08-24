package com.campusmarket.repository;

import com.campusmarket.domain.Message;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface MessageRepository extends JpaRepository<Message, UUID> {

    List<Message> findByConversationIdOrderByCreatedAtAsc(UUID conversationId);

    /** Thread-list preview. Skips flagged messages so a blocked sender's text
     *  never surfaces in the recipient's inbox. */
    Optional<Message> findFirstByConversationIdAndFlaggedFalseOrderByCreatedAtDesc(UUID conversationId);

    /** The same preview for a seller who is sealed out of the order details -
     *  otherwise the inbox would show them, in full, the one thing the thread
     *  is withholding. */
    Optional<Message> findFirstByConversationIdAndFlaggedFalseAndWithheldFromSellerFalseOrderByCreatedAtDesc(
            UUID conversationId);

    /** Flagged messages stay hidden from the recipient but visible to admins. */
    List<Message> findByFlaggedTrueOrderByCreatedAtDesc();

    /*
     * Both counts drop withheld messages for the SELLER of that thread only.
     * A badge is a promise that there is something to open; pointing a seller
     * at a message they cannot read is a notification they can never clear.
     * The buyer wrote it and the admin brokered it, so neither is affected.
     */
    @Query("select count(m) from Message m where m.conversation.id = :conversationId "
            + "and m.sender.id <> :userId and m.readAt is null and m.flagged = false "
            + "and not (m.withheldFromSeller = true and m.conversation.seller.id = :userId)")
    long countUnread(@Param("conversationId") UUID conversationId, @Param("userId") UUID userId);

    /**
     * Unread across every thread the user is a party to.
     *
     * <p>Mediated threads count too. An admin who fulfilled a held order is a
     * participant - the buyer is arranging collection with them - but the
     * badge counted only buyer and seller rows, so their replies arrived
     * silently against a permanent zero.
     */
    @Query("select count(m) from Message m where (m.conversation.buyer.id = :userId "
            + "or m.conversation.seller.id = :userId "
            + "or m.conversation.mediatorAdmin.id = :userId) "
            + "and m.sender.id <> :userId and m.readAt is null and m.flagged = false "
            + "and not (m.withheldFromSeller = true and m.conversation.seller.id = :userId)")
    long countUnreadForUser(@Param("userId") UUID userId);

    /**
     * Unseals everything withheld from one seller, on verification.
     *
     * <p>Scoped by the conversation's seller rather than by recipient: these
     * messages were withheld because of who the seller was, so that is what
     * lifts them.
     */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("update Message m set m.withheldFromSeller = false "
            + "where m.withheldFromSeller = true and m.conversation.seller.id = :sellerId")
    int releaseWithheldForSeller(@Param("sellerId") UUID sellerId);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("update Message m set m.readAt = :now where m.conversation.id = :conversationId "
            + "and m.sender.id <> :userId and m.readAt is null")
    int markThreadRead(@Param("conversationId") UUID conversationId,
                       @Param("userId") UUID userId,
                       @Param("now") Instant now);
}
