package com.campusmarket.web.dto;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class CommerceDtos {
    private CommerceDtos() {}

    public record CartItemDto(
            UUID id,
            ListingDtos.ListingRefDto listing,
            UserDtos.PublicUserDto seller,
            int quantity,
            BigDecimal lineTotal,
            boolean available,
            String unavailableReason,
            Instant addedAt
    ) {}

    public record CartDto(
            List<CartItemDto> items,
            BigDecimal subtotal,
            int itemCount,
            boolean hasUnavailableItems
    ) {}

    /** One chat thread opened per seller by checkout (workflow 13). */
    public record CheckoutResultDto(
            List<SellerRequestDto> requests,
            List<String> skipped,
            int threadsOpened
    ) {}

    public record SellerRequestDto(
            UUID conversationId,
            UUID sellerId,
            String sellerName,
            List<String> items
    ) {}

    public record DealDto(
            UUID id,
            ListingDtos.ListingRefDto listing,
            UserDtos.PublicUserDto counterparty,
            String role,
            BigDecimal price,
            String meetupLocation,
            Instant meetupTime,
            String status,
            boolean reviewSubmitted,
            Instant createdAt
    ) {}

    public record ReviewDto(
            UUID id,
            UUID dealId,
            UserDtos.PublicUserDto reviewer,
            UUID revieweeId,
            int rating,
            String comment,
            Instant createdAt
    ) {}

    // ------------------------------------------------------------------ orders
    /**
     * One order as either party sees it. {@code role} says which side the viewer
     * is on, so a single screen can render both the seller's inbox and the
     * buyer's history without two endpoints.
     */
    public record OrderDto(
            UUID id,
            String reference,
            UserDtos.PublicUserDto counterparty,
            /**
             * Who placed the order. Populated for admins only - the two trading
             * parties already have each other as {@code counterparty}, and an
             * unverified seller must not learn who is behind a held order.
             */
            UserDtos.PublicUserDto buyer,
            /** "buyer" or "seller", from the viewer's perspective. */
            String role,
            String status,
            BigDecimal total,
            String meetupZone,
            String buyerNote,
            String sellerNote,
            /** Note an admin left when releasing or fulfilling a held order. */
            String adminNote,
            /** Set only when an admin supplied the goods instead of the seller. */
            String fulfilledByAdminName,
            List<OrderItemDto> items,
            int itemCount,
            /** Which transitions the viewer may perform right now. */
            List<String> availableActions,
            Instant respondedAt,
            Instant completedAt,
            Instant createdAt
    ) {}

    public record OrderItemDto(
            UUID id,
            /** Null once the seller removes the listing; the snapshot still renders. */
            UUID listingId,
            String title,
            String image,
            BigDecimal unitPrice,
            int quantity,
            BigDecimal lineTotal
    ) {}

    /** Result of a checkout: the orders written, plus anything dropped. */
    public record CheckoutOrdersDto(
            List<OrderDto> orders,
            List<String> skipped,
            int ordersPlaced
    ) {}

    /**
     * Result of an admin fulfilling a held order: the order, and the thread
     * opened for it so the caller can go straight there. Null only when every
     * line's listing had been hard-deleted, leaving nothing to pin a
     * conversation to.
     */
    public record FulfilledOrderDto(
            OrderDto order,
            UUID conversationId
    ) {}
}
