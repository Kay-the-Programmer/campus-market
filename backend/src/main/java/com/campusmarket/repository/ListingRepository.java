package com.campusmarket.repository;

import com.campusmarket.domain.Listing;
import com.campusmarket.domain.ListingStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ListingRepository extends JpaRepository<Listing, UUID>, JpaSpecificationExecutor<Listing> {

    Optional<Listing> findByIdAndDeletedFalse(UUID id);

    List<Listing> findBySellerIdAndDeletedFalseOrderByCreatedAtDesc(UUID sellerId);

    /**
     * Backs the derived "seller" state (RBAC spec section 1): a customer with at
     * least one ACTIVE or RESERVED listing.
     */
    boolean existsBySellerIdAndDeletedFalseAndStatusIn(UUID sellerId, Collection<ListingStatus> statuses);

    long countByCategoryIdAndDeletedFalse(UUID categoryId);

    long countBySellerIdAndDeletedFalseAndStatusIn(UUID sellerId, Collection<ListingStatus> statuses);

    List<Listing> findByCategoryIdAndDeletedFalse(UUID categoryId);

    /** The admin's view of the Special Offers shelf, newest promotion first.
     *  Includes non-active rows so a sold-out offer is visible to be cleared. */
    List<Listing> findBySpecialOfferTrueAndDeletedFalseOrderBySpecialOfferAtDesc();

    long countByDeletedFalseAndStatusIn(Collection<ListingStatus> statuses);

    /**
     * Atomic status transition. Returns 0 when the listing already moved on,
     * which is how the "already marked as sold" race is detected (workflow 9).
     */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("update Listing l set l.status = :newStatus "
            + "where l.id = :id and l.status <> :newStatus and l.deleted = false")
    int transitionStatus(@Param("id") UUID id, @Param("newStatus") ListingStatus newStatus);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("update Listing l set l.category = null where l.category.id = :categoryId")
    int clearCategory(@Param("categoryId") UUID categoryId);
}
