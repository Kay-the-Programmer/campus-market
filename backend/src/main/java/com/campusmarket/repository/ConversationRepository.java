package com.campusmarket.repository;

import com.campusmarket.domain.Conversation;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ConversationRepository extends JpaRepository<Conversation, UUID> {

    /** One thread per listing+buyer+seller triple (workflow 15 step 1). */
    Optional<Conversation> findByListingIdAndBuyerIdAndSellerId(UUID listingId, UUID buyerId, UUID sellerId);

    /** Threads this user is a party to, including any they brokered as the
     *  mediating admin - an admin who fulfilled an order has to be reachable
     *  by the buyer they are handing the goods to. */
    @Query("select c from Conversation c where c.buyer.id = :userId or c.seller.id = :userId "
            + "or c.mediatorAdmin.id = :userId "
            + "order by c.lastMessageAt desc")
    List<Conversation> findAllForUser(@Param("userId") UUID userId);

    /** Buyers who have messaged about a listing - populates the Mark-as-Sold picker. */
    @Query("select c from Conversation c where c.listing.id = :listingId order by c.lastMessageAt desc")
    List<Conversation> findByListingId(@Param("listingId") UUID listingId);
}
