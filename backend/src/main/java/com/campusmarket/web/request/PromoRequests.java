package com.campusmarket.web.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.util.List;
import java.util.UUID;

public final class PromoRequests {
    private PromoRequests() {}

    /**
     * A six-digit hex colour, or nothing at all.
     *
     * <p>The empty alternative is load-bearing: the admin form submits every
     * field on every save, so "no custom colour" arrives as an empty string
     * rather than as an absent key, and a pattern without it would reject a
     * panel for declining to set a colour.
     */
    private static final String HEX_COLOR = "^(#[0-9a-fA-F]{6})?$";

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

            /**
             * CTA_BANNER only: the collage beside the copy, in draw order.
             *
             * <p>Capped here as well as in the layout because the banner draws
             * six at most and anything past that is weight nobody sees. Null
             * and empty both mean "no collage" - the form omits the key
             * entirely for the placements that have no collage to send.
             */
            @Size(max = 6, message = "A banner can hold six pictures at most.")
            List<String> collageImages,

            Integer imageOverlay,
            String theme,

            /*
             * Colours as "#rrggbb", or null/blank to fall back to the theme.
             *
             * Validated here as well as in PromoService and the database: this
             * value ends up inside a style attribute on the home page, so the
             * shape is checked at every boundary it crosses rather than
             * trusted because the admin form uses a colour picker.
             */
            @Pattern(regexp = HEX_COLOR, message = "Background colour must be a hex value like #2563eb.")
            String bgColor,

            @Pattern(regexp = HEX_COLOR, message = "Text colour must be a hex value like #ffffff.")
            String textColor,

            @Pattern(regexp = HEX_COLOR, message = "Button colour must be a hex value like #2563eb.")
            String buttonColor,

            @Pattern(regexp = HEX_COLOR, message = "Button text colour must be a hex value like #ffffff.")
            String buttonTextColor,

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
