package com.campusmarket.web.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.UUID;

public final class ListingRequests {
    private ListingRequests() {}

    public record SaveListingRequest(
            @NotBlank(message = "Choose a listing type.")
            String type,

            @NotBlank(message = "Title is required.")
            @Size(max = 180, message = "Title is too long.")
            String title,

            String description,

            @NotNull(message = "Price is required.")
            @PositiveOrZero(message = "Price cannot be negative.")
            BigDecimal price,

            String priceUnit,
            UUID categoryId,
            /** Free-text meetup spot, e.g. "Hall 4 Dorms". */
            String location,
            /** DOWNSCHOOL | UPSCHOOL | ACROSS - the coarse zone used for filtering. */
            String campusZone,
            List<String> images,

            /** DRAFT skips publish-time validation so a half-filled form can be kept. */
            String status,

            // product
            String condition,
            String brand,

            // service
            String availability,
            String rateType,
            String serviceMode,

            // food
            Integer quantity,
            String pickupWindow,
            Set<String> dietaryTags
    ) {}

    public record StatusChangeRequest(
            @NotBlank(message = "Status is required.")
            String status
    ) {}

    public record MarkSoldRequest(
            @NotNull(message = "Select the buyer.")
            UUID buyerId,

            @NotNull(message = "Confirm the final price.")
            @PositiveOrZero(message = "Price cannot be negative.")
            BigDecimal price,

            String meetupLocation,
            Instant meetupTime
    ) {}
}
