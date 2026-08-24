package com.campusmarket.repository;

import com.campusmarket.domain.Review;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.UUID;

public interface ReviewRepository extends JpaRepository<Review, UUID> {

    /** Enforces "you've already reviewed this transaction" (workflow 16). */
    boolean existsByDealIdAndReviewerId(UUID dealId, UUID reviewerId);

    List<Review> findByRevieweeIdOrderByCreatedAtDesc(UUID revieweeId);

    @Query("select coalesce(avg(r.rating), 0) from Review r where r.reviewee.id = :userId")
    Double averageRatingFor(@Param("userId") UUID userId);

    long countByRevieweeId(UUID revieweeId);

    /**
     * Reviews of a listing.
     *
     * <p>Reached through the deal rather than a column on the review: a review
     * has always been about one completed handover, and that handover already
     * knows which listing it was for. Adding a listing_id here would be a
     * second copy of that fact, free to disagree with the first.
     *
     * <p>Restricted to reviews whose subject is the seller. Reviews run both
     * ways, and a seller rating their buyer says nothing about the item -
     * counting it would let a seller pad their own listing's score.
     */
    @Query("""
            select r from Review r
            where r.deal.listing.id = :listingId
              and r.reviewee.id = r.deal.seller.id
            order by r.createdAt desc
            """)
    List<Review> findAboutListing(@Param("listingId") UUID listingId);

    @Query("""
            select coalesce(avg(r.rating), 0) from Review r
            where r.deal.listing.id = :listingId
              and r.reviewee.id = r.deal.seller.id
            """)
    Double averageRatingForListing(@Param("listingId") UUID listingId);

    @Query("""
            select count(r) from Review r
            where r.deal.listing.id = :listingId
              and r.reviewee.id = r.deal.seller.id
            """)
    long countForListing(@Param("listingId") UUID listingId);
}
