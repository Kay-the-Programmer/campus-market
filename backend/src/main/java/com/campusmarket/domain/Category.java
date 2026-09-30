package com.campusmarket.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "categories")
@Getter
@Setter
@NoArgsConstructor
public class Category {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false)
    private String name;

    @Column(nullable = false, unique = true)
    private String slug;

    /**
     * Lucide icon name. Predates the picture below and is no longer set by the
     * admin form; kept because existing rows carry one.
     */
    private String icon;

    /**
     * Picture for the category, shown in the browse strip and the index.
     *
     * <p>Null is the ordinary case, not a failure: an admin who has not chosen
     * one gets an emoji picked from the name, which is why nothing here has a
     * default. A category with no picture must look deliberate rather than
     * broken, because most of them will never have one.
     */
    @Column(name = "image_url", length = 512)
    private String imageUrl;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "parent_id")
    private Category parent;

    @Column(name = "sort_order", nullable = false)
    private int sortOrder = 0;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();
}
