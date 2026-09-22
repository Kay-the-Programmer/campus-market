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
}
