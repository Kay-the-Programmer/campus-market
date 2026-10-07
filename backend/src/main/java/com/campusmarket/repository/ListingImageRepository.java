package com.campusmarket.repository;

import com.campusmarket.domain.ListingImage;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

public interface ListingImageRepository extends JpaRepository<ListingImage, UUID> {

    /**
     * How many photos each of these listings has.
     *
     * <p>For ranking, which needs to know whether a listing has a photograph at
     * all - the single largest difference between a listing somebody buys from
     * and one they scroll past. One grouped query for a whole pool of
     * candidates, because the alternative is touching the lazy image collection
     * on every row and paying a query per listing to rank it.
     *
     * <p>Listings with no photos are absent from the result rather than present
     * with a zero; the caller defaults them, which is the same convention the
     * view counts use.
     */
    @Query("""
            select i.listing.id, count(i)
            from ListingImage i
            where i.listing.id in :listingIds
            group by i.listing.id
            """)
    List<Object[]> countByListingIds(@Param("listingIds") Collection<UUID> listingIds);
}
