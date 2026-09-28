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

            /**
             * Free text, carrying the light formatting markers described in the
             * frontend's richText.ts - a couple of asterisks for bold or italic
             * and a leading hash for a bigger line. Stored exactly as typed:
             * the markers are meaningful to the reader even where nothing
             * renders them, and keeping the column plain text is what stops
             * seller-written markup ever becoming HTML on someone's screen.
             *
             * <p>The cap mirrors DESCRIPTION_MAX in SellScreen.tsx. It is far
             * above any real description and exists so neither the parser nor
             * this column is ever handed something pathological.
             */
            @Size(max = 4000, message = "Description is too long.")
            String description,

            /**
             * Null means the seller is not quoting a price here.
             *
             * <p>Allowed only on a SERVICE, because some jobs cannot be priced
             * before they are seen - a phone repair depends on what is broken.
             * The "unless it is a service" half of that rule is enforced in
             * {@code ListingService}, not here: a field-level constraint cannot
             * see {@code type}. There is a matching CHECK on the table, so the
             * rule survives a caller that forgets it.
             *
             * <p>Null is not 0. Zero is a real price meaning free, and the two
             * must keep rendering differently.
             */
            @PositiveOrZero(message = "Price cannot be negative.")
            BigDecimal price,

            /**
             * What the seller was asking before, shown struck through beside the
             * live price and used to rank the deals shelf. Optional and
             * self-service: a seller marking their OWN item down is an ordinary
             * price change, unlike the admin-curated Special Offers shelf, which
             * stays admin-only - see AdminService.setSpecialOffer.
             *
             * <p>Range-checked in ListingService rather than here because the
             * rule is relational: it has to be above {@code price}, which a
             * field-level constraint cannot see.
             */
            BigDecimal compareAtPrice,

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
