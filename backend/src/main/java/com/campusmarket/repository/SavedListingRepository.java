package com.campusmarket.repository;

import com.campusmarket.domain.SavedListing;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Set;
import java.util.UUID;

public interface SavedListingRepository extends JpaRepository<SavedListing, SavedListing.Key> {

    List<SavedListing> findByUserIdOrderByCreatedAtDesc(UUID userId);

    boolean existsByUserIdAndListingId(UUID userId, UUID listingId);

    void deleteByUserIdAndListingId(UUID userId, UUID listingId);

    @org.springframework.data.jpa.repository.Query(
            "select s.listingId from SavedListing s where s.userId = :userId")
    Set<UUID> findListingIdsByUserId(@org.springframework.data.repository.query.Param("userId") UUID userId);

    /** Who to tell when a saved listing gets cheaper (workflow 18, PRICE_DROP). */
    @org.springframework.data.jpa.repository.Query(
            "select s.userId from SavedListing s where s.listingId = :listingId")
    List<UUID> findUserIdsByListingId(
            @org.springframework.data.repository.query.Param("listingId") UUID listingId);
}
