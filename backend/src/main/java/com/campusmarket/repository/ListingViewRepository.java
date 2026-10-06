package com.campusmarket.repository;

import com.campusmarket.domain.ListingView;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.UUID;

public interface ListingViewRepository extends JpaRepository<ListingView, UUID> {

    /**
     * Has this person already been counted for this listing today?
     *
     * <p>Checked before inserting rather than relying on the unique index to
     * reject the duplicate: a constraint violation inside a transaction poisons
     * it in Postgres, and this insert rides along with the request that serves
     * the listing page. Losing the whole read because someone pressed refresh
     * would be a poor trade for a statistic.
     *
     * <p>Only meaningful for a signed-in viewer. Guests all share a null viewer
     * id, so they are not de-duplicated at all - see the migration for why that
     * is preferred to fingerprinting them.
     */
    boolean existsByListingIdAndViewerIdAndViewedOn(UUID listingId, UUID viewerId, LocalDate viewedOn);

    /**
     * The trending shelf: listing ids by view count since a cutoff, busiest
     * first.
     *
     * <p>Returns ids and counts rather than entities, because the ordering is
     * the product here - the listings themselves are fetched afterwards and
     * re-sorted into this order. Paged so the caller decides how many, and so
     * the database stops rather than sorting the whole window.
     */
    @Query("""
            select v.listingId, count(v)
            from ListingView v
            where v.viewedAt >= :since
            group by v.listingId
            order by count(v) desc, max(v.viewedAt) desc
            """)
    List<Object[]> findTrending(@Param("since") Instant since, Pageable pageable);

    /**
     * Recent view counts for a specific set of listings.
     *
     * <p>One grouped query for a whole page of cards, so showing "seen N times
     * this week" on a grid costs one round trip rather than one per card.
     * Listings with no views in the window are simply absent from the result
     * rather than present with a zero - the caller defaults them.
     */
    @Query("""
            select v.listingId, count(v)
            from ListingView v
            where v.viewedAt >= :since and v.listingId in :listingIds
            group by v.listingId
            """)
    List<Object[]> countRecentByListingIds(@Param("since") Instant since,
                                           @Param("listingIds") Collection<UUID> listingIds);

    /**
     * What else the people who looked at these listings looked at.
     *
     * <p>Co-visitation, and the only thing the recommender knows that a
     * person's own history cannot tell it: that the people who open a lab coat
     * tend to go on to open a particular calculator. No model and no training -
     * on one campus the join is small enough to ask the database directly, and
     * the answer is current rather than as of the last batch run.
     *
     * <p>Counted by distinct viewer rather than by row, so one person opening
     * the same pair every day for a week contributes once. Guests are excluded
     * by the join on viewer id - every guest shares a null, so counting them
     * would pair strangers with each other.
     *
     * <p>Seeds are excluded from their own results, and the window keeps this
     * proportional to recent traffic rather than to the table.
     */
    @Query("""
            select other.listingId, count(distinct other.viewerId)
            from ListingView seed, ListingView other
            where seed.listingId in :seedIds
              and seed.viewerId is not null
              and other.viewerId = seed.viewerId
              and other.listingId not in :seedIds
              and seed.viewedAt >= :since
              and other.viewedAt >= :since
            group by other.listingId
            order by count(distinct other.viewerId) desc
            """)
    List<Object[]> findCoViewed(@Param("seedIds") Collection<UUID> seedIds,
                                @Param("since") Instant since,
                                Pageable pageable);

    /**
     * The listings one person has opened, most recent first.
     *
     * <p>The backbone of their taste profile. Capped by the caller: a profile
     * is a summary of what somebody is in the market for now, and a year of
     * history would mostly describe a person who no longer exists.
     */
    @Query("""
            select v.listingId
            from ListingView v
            where v.viewerId = :viewerId
            order by v.viewedAt desc
            """)
    List<UUID> findRecentlyViewedBy(@Param("viewerId") UUID viewerId, Pageable pageable);
}
