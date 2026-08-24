package com.campusmarket.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

/**
 * One admin-editable panel on the home page - a hero carousel slide or a
 * "Special offers" tile.
 *
 * <p>Both shapes share a table because they are the same thing wearing
 * different clothes: a headline, a line of copy, a button and somewhere to go.
 * {@link #placement} decides which grid renders it, and the two or three
 * fields that only apply to one placement are simply left null on the other.
 * Two near-identical tables would have meant two repositories, two services and
 * two admin screens for no gain.
 *
 * <p>These replace what used to be hardcoded arrays in the feed, so campaign
 * copy can change without a deploy.
 */
@Entity
@Table(name = "promo_slots")
@Getter
@Setter
@NoArgsConstructor
public class PromoSlot {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private PromoPlacement placement;

    @Column(nullable = false)
    private String title;

    /** Supporting line. Optional - a short tile often reads better without one. */
    @Column(columnDefinition = "TEXT")
    private String subtitle;

    /** Button text. When blank the panel is still clickable, just unlabelled. */
    @Column(name = "cta_label")
    private String ctaLabel;

    /**
     * Where the panel goes, as an in-app path such as {@code /browse?type=Food}.
     * Restricted to internal paths by {@code PromoService} - see the note there.
     */
    @Column(name = "cta_link")
    private String ctaLink;

    /** Small corner flag on a tile, e.g. "New" or "Hot". BENTO only. */
    private String badge;

    /**
     * Optional background image - a URL, either an upload served from
     * {@code /api/uploads/} or a direct link an admin pasted in. Sits over the
     * theme gradient, so a slot without one still looks deliberate rather than
     * broken.
     */
    @Column(name = "image_url", columnDefinition = "TEXT")
    private String imageUrl;

    /** How dark to render the scrim over the image so text stays legible, 0-100. */
    @Column(name = "image_overlay", nullable = false)
    private int imageOverlay = 40;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private PromoTheme theme = PromoTheme.BLUE;

    /** BENTO only: whether the tile spans two columns. */
    @Column(nullable = false)
    private boolean wide = false;

    /** Hidden rather than deleted, so a seasonal campaign can be brought back. */
    @Column(nullable = false)
    private boolean active = true;

    @Column(name = "sort_order", nullable = false)
    private int sortOrder = 0;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    @PreUpdate
    void onUpdate() {
        this.updatedAt = Instant.now();
    }
}
