package com.campusmarket.web.request;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.time.Instant;
import java.util.UUID;

public final class CommerceRequests {
    private CommerceRequests() {}

    public record AddToCartRequest(
            @NotNull(message = "Listing is required.")
            UUID listingId,
            Integer quantity
    ) {}

    public record QuantityRequest(
            @NotNull(message = "Quantity is required.")
            Integer quantity
    ) {}

    public record SendMessageRequest(
            @NotBlank(message = "Message cannot be empty.")
            String body
    ) {}

    public record StartChatRequest(
            String body
    ) {}

    public record BookingRequest(
            @NotNull(message = "Choose a preferred date and time.")
            Instant preferredTime,
            String note
    ) {}

    public record ReviewRequest(
            @Min(value = 1, message = "Rating must be between 1 and 5 stars.")
            @Max(value = 5, message = "Rating must be between 1 and 5 stars.")
            int rating,
            String comment
    ) {}

    /**
     * Checkout options. Both fields are optional - the zone falls back to the
     * buyer's profile zone, which is the answer in almost every case.
     */
    public record CheckoutRequest(
            String meetupZone,
            String note
    ) {}

    /**
     * A seller responding to an order, or a buyer cancelling one. The note is
     * required for a decline (the buyer deserves a reason) and ignored otherwise.
     */
    public record OrderActionRequest(
            String note
    ) {}
}
