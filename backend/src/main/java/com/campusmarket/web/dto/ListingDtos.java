package com.campusmarket.web.dto;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.UUID;

public final class ListingDtos {
    private ListingDtos() {}

    public record CategoryDto(
            UUID id,
            String name,
            String slug,
            String icon,
            UUID parentId,
            String parentName,
            int sortOrder,
            long listingCount
    ) {}

    public record ListingDto(
            UUID id,
            String type,
            String title,
            String description,
            BigDecimal price,
            String priceUnit,
            CategoryDto category,
            String location,
            /** DOWNSCHOOL | UPSCHOOL | ACROSS, or null on pre-V3 listings. */
            String campusZone,
            String status,
            String condition,
            String brand,
            String availability,
            String rateType,
            /** Services only: BOOKING or WALK_IN. Null on products. */
            String serviceMode,
            Integer quantity,
            String pickupWindow,
            Set<String> dietaryTags,
            List<String> images,
            UserDtos.PublicUserDto seller,
            int viewsCount,
            boolean saved,
            boolean available,
            /** On the admin-curated Special Offers shelf. */
            boolean specialOffer,
            /** Usual price, for the struck-through comparison. Null when none. */
            BigDecimal compareAtPrice,
            /** How many can be bought at once; null when unlimited or n/a. */
            Integer availableStock,
            /** Whole-percent saving, or null when there is nothing to compare. */
            Integer discountPercent,
            Instant createdAt
    ) {}

    /**
     * Minimal shape used where a listing is only referenced - chat threads, deal
     * history, cart rows. Survives soft deletion so history stays readable
     * ("Listing removed") instead of breaking (workflow 8).
     */
    public record ListingRefDto(
            UUID id,
            String title,
            BigDecimal price,
            String image,
            String status,
            boolean removed,
            /** How many can still be bought; null when unlimited or n/a. */
            Integer availableStock
    ) {}

    /**
     * One row in the search-as-you-type dropdown.
     *
     * <p>Carries enough to render the row AND to act on it: a listing
     * suggestion navigates straight to that listing rather than running a
     * search that would return it plus noise.
     */
    public record SuggestionDto(
            /** "listing" or "category" - decides what selecting it does. */
            String kind,
            UUID id,
            String label,
            /** Type chip for listings, listing count for categories. */
            String detail,
            String image,
            BigDecimal price
    ) {}

    public record SuggestionsDto(
            List<SuggestionDto> listings,
            List<SuggestionDto> categories
    ) {}

    public record PageDto<T>(
            List<T> items,
            int page,
            int size,
            long totalItems,
            int totalPages
    ) {}
}
