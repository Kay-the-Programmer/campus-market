package com.campusmarket.repository;

import com.campusmarket.domain.Deal;
import com.campusmarket.domain.DealStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.UUID;

public interface DealRepository extends JpaRepository<Deal, UUID> {

    @Query("select d from Deal d where d.buyer.id = :userId or d.seller.id = :userId "
            + "order by d.createdAt desc")
    List<Deal> findAllForUser(@Param("userId") UUID userId);

    boolean existsByListingIdAndStatus(UUID listingId, DealStatus status);

    long countByStatus(DealStatus status);

    @Query("select count(d) from Deal d where (d.buyer.id = :userId or d.seller.id = :userId) "
            + "and d.status = :status")
    long countForUserWithStatus(@Param("userId") UUID userId, @Param("status") DealStatus status);
}
