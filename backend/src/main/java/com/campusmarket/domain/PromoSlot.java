package com.campusmarket.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * One admin-editable panel - a hero carousel slide, a "Special offers" tile, or
 * a call-to-action banner on the browse pages.
 *
 * <p>They share a table because they are the same thing wearing different
 * clothes: a headline, a line of copy, a button and somewhere to go. {@link
 * #placement} decides which surface renders it, and the fields that apply to
 * only one placement are simply left empty on the others. Near-identical
 * tables would have meant a repository, a service and an admin screen each,
 * for no gain.
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

    /*
     * Custom colours, as "#rrggbb".
     *
     * Null means "use the theme", which is what every panel did before these
     * existed and what most still do. They are overrides rather than a
     * replacement precisely so an admin who only wants to change the headline
     * never has to make four colour decisions to do it - and so the five
     * preset gradients, which are the ones that were actually designed, stay
     * the path of least resistance.
     */

    /** Replaces the theme gradient with a flat colour. */
    @Column(name = "bg_color", length = 7)
    private String bgColor;

    /** Headline, subtitle and badge. */
    @Column(name = "text_color", length = 7)
    private String textColor;

    @Column(name = "button_color", length = 7)
    private String buttonColor;

    /**
     * The button's label.
     *
     * <p>Separate from {@link #textColor} because the button sits on its own
     * background: a panel with white copy over a dark photo and a white button
     * needs a dark label, and one colour cannot be both.
     */
    @Column(name = "button_text_color", length = 7)
    private String buttonTextColor;

    /**
     * CTA_BANNER only: the pictures stacked beside the copy.
     *
     * <p>Order matters and is the admin's - the first is drawn largest, the
     * last is the first to be dropped on a narrow screen - so this is a List
     * with an explicit order column rather than a Set. Empty is a supported
     * state, not a broken one: a banner with no collage renders as copy on a
     * colour, which is where every new banner starts.
     *
     * <p>EAGER because every caller maps straight to a DTO and the list is at
     * most a handful of short strings; making it lazy would buy nothing and
     * cost a LazyInitializationException the first time one of these is
     * mapped outside a transaction.
     */
    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "promo_slot_images", joinColumns = @JoinColumn(name = "promo_id"))
    @OrderColumn(name = "position")
    @Column(name = "url", nullable = false, columnDefinition = "TEXT")
    private List<String> collageImages = new ArrayList<>();

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
