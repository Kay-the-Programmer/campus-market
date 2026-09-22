package com.campusmarket.repository;

import com.campusmarket.domain.SavedSearch;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface SavedSearchRepository extends JpaRepository<SavedSearch, UUID> {

    List<SavedSearch> findByUserIdOrderByCreatedAtDesc(UUID userId);

    Optional<SavedSearch> findByIdAndUserId(UUID id, UUID userId);

    long countByUserId(UUID userId);

    /**
     * Every search that wants to be told about new listings.
     *
     * <p>Read on the write path - once per published listing - so it is
     * deliberately the narrowest question that can be asked: the index behind
     * it is partial on {@code notify = true}, and the matching itself happens
     * in memory afterwards. On a single-campus catalogue the set of active
     * alerts is small; if that ever stops being true this becomes a query that
     * pre-filters by category and type rather than a full scan.
     */
    List<SavedSearch> findByNotifyTrue();
}
