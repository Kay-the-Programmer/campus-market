package com.campusmarket.web.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.util.List;
import java.util.UUID;

public final class PromoRequests {
    private PromoRequests() {}

    /**
     * Create or replace a promo slot. Used for both, so an edit that omits a
     * field clears it rather than silently keeping a stale value - the admin
     * form always submits the whole panel.
     */
    public record SavePromoRequest(
            @NotBlank(message = "Choose where this appears.")
            String placement,

            @NotBlank(message = "Give the panel a headline.")
            @Size(max = 180, message = "Headline is too long.")
            String title,

            String subtitle,

            @Size(max = 60, message = "Button text is too long.")
            String ctaLabel,

            @Size(max = 300, message = "Link is too long.")
            String ctaLink,

            @Size(max = 30, message = "Badge is too long.")
            String badge,

            /** URL from the upload endpoint, or a pasted external link. */
            String imageUrl,

            Integer imageOverlay,
            String theme,
            Boolean wide,
            Boolean active,
            Integer sortOrder
    ) {}

    /** New display order for one placement, as a list of ids. */
    public record ReorderPromosRequest(
            @NotBlank(message = "Choose which section to reorder.")
            String placement,
            List<UUID> orderedIds
    ) {}
}
