package com.campusmarket.web.dto;

import java.time.Instant;
import java.util.UUID;

public final class PromoDtos {
    private PromoDtos() {}

    /**
     * One home-page panel. The same shape serves the public feed and the admin
     * editor - {@code active} is simply always true in the public response,
     * since inactive slots are filtered out before mapping.
     */
    public record PromoSlotDto(
            UUID id,
            String placement,
            String title,
            String subtitle,
            String ctaLabel,
            /** In-app path, e.g. "/browse?type=Food". Never an external URL. */
            String ctaLink,
            String badge,
            String imageUrl,
            /** 0-100 scrim strength over the image, so text stays readable. */
            int imageOverlay,
            String theme,
            boolean wide,
            boolean active,
            int sortOrder,
            Instant updatedAt
    ) {}
}
