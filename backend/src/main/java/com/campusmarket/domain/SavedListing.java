package com.campusmarket.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.io.Serializable;
import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

@Entity
@Table(name = "saved_listings")
@IdClass(SavedListing.Key.class)
@Getter
@Setter
@NoArgsConstructor
public class SavedListing {

    @Id
    @Column(name = "user_id")
    private UUID userId;

    @Id
    @Column(name = "listing_id")
    private UUID listingId;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    public SavedListing(UUID userId, UUID listingId) {
        this.userId = userId;
        this.listingId = listingId;
    }

    @Getter
    @Setter
    @NoArgsConstructor
    public static class Key implements Serializable {
        private UUID userId;
        private UUID listingId;

        @Override
        public boolean equals(Object o) {
            if (this == o) return true;
            if (!(o instanceof Key key)) return false;
            return Objects.equals(userId, key.userId) && Objects.equals(listingId, key.listingId);
        }

        @Override
        public int hashCode() {
            return Objects.hash(userId, listingId);
        }
    }
}
