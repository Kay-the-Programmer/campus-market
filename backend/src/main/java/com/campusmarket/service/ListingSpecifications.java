package com.campusmarket.service;

import com.campusmarket.domain.*;
import jakarta.persistence.criteria.Expression;
import jakarta.persistence.criteria.Join;
import jakarta.persistence.criteria.Predicate;
import org.springframework.data.jpa.domain.Specification;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Query fragments for browse / search / filter (workflow 10). */
public final class ListingSpecifications {
    private ListingSpecifications() {}

    /**
     * What the public may see: not soft-deleted, live or reserved, and not owned
     * by a restricted seller.
     *
     * <p>Hiding a suspended seller's listings is done here rather than by editing
     * the listing rows, so nothing has to be undone when a suspension is lifted -
     * and a suspension that has simply run out stops hiding them automatically
     * (workflow 20).
     */
    public static Specification<Listing> publiclyVisible() {
        return (root, query, cb) -> {
            Join<Listing, User> seller = root.join("seller");
            Instant now = Instant.now();

            Predicate notDeleted = cb.isFalse(root.get("deleted"));
            Predicate liveStatus = root.get("status")
                    .in(List.of(ListingStatus.ACTIVE, ListingStatus.RESERVED));
            Predicate notBanned = cb.notEqual(seller.get("status"), UserStatus.BANNED);

            // Suspended only counts while the suspension window is still open.
            Predicate activeSuspension = cb.and(
                    cb.equal(seller.get("status"), UserStatus.SUSPENDED),
                    cb.or(
                            cb.isNull(seller.get("suspendedUntil")),
                            cb.greaterThan(seller.get("suspendedUntil"), now)));

            return cb.and(notDeleted, liveStatus, notBanned, cb.not(activeSuspension));
        };
    }

    public static Specification<Listing> textSearch(String term) {
        if (term == null || term.isBlank()) {
            return null;
        }
        String like = "%" + term.trim().toLowerCase() + "%";
        return (root, query, cb) -> cb.or(
                cb.like(cb.lower(root.get("title")), like),
                cb.like(cb.lower(root.get("description")), like),
                cb.like(cb.lower(root.get("brand")), like),
                cb.like(cb.lower(root.join("seller").get("name")), like));
    }

    /**
     * Orders a text search by how well each row actually matches the term.
     *
     * <p>{@link #textSearch} matches a title, a description, a brand and a
     * seller's name equally, so ordering the result by date put a listing
     * posted an hour ago - which merely mentions the word somewhere in its
     * description - above the one whose title IS the word. Nobody typing a
     * query means "show me the newest thing that contains this string".
     *
     * <p>The rank is a plain CASE rather than a full-text index: the catalogue
     * is a single campus, the same LIKE patterns the filter already runs are
     * enough to grade a match, and it needs no extension or schema change.
     *
     * <p>Returns no predicate - it contributes ordering only, so it composes
     * with the filter specs instead of narrowing them.
     */
    public static Specification<Listing> orderByRelevance(String term) {
        if (term == null || term.isBlank()) {
            return null;
        }
        String cleaned = term.trim().toLowerCase();
        String prefix = cleaned + "%";
        String anywhere = "%" + cleaned + "%";

        return (root, query, cb) -> {
            /*
             * Spring Data derives a COUNT query from this same spec to work out
             * the page total. An ORDER BY over an expression that query does not
             * select is at best useless and at worst a Hibernate error, so the
             * ordering is only attached to the query that returns rows.
             */
            Class<?> resultType = query.getResultType();
            if (resultType != Long.class && resultType != long.class) {
                Expression<Integer> rank = cb.<Integer>selectCase()
                        .when(cb.equal(cb.lower(root.get("title")), cleaned), 0)
                        .when(cb.like(cb.lower(root.get("title")), prefix), 1)
                        .when(cb.like(cb.lower(root.get("title")), anywhere), 2)
                        .when(cb.like(cb.lower(root.get("brand")), anywhere), 3)
                        .when(cb.like(cb.lower(root.get("description")), anywhere), 4)
                        // Everything left matched on the seller's name, which is
                        // a real hit but the weakest one.
                        .otherwise(5)
                        .as(Integer.class);
                // Newest breaks ties, so equally-relevant rows still page stably.
                query.orderBy(cb.asc(rank), cb.desc(root.get("createdAt")));
            }
            return cb.conjunction();
        };
    }

    public static Specification<Listing> ofType(String type) {
        if (type == null || type.isBlank() || "all".equalsIgnoreCase(type)) {
            return null;
        }
        ListingType parsed = ListingType.valueOf(type.trim().toUpperCase());
        return (root, query, cb) -> cb.equal(root.get("type"), parsed);
    }

    public static Specification<Listing> inCategory(UUID categoryId) {
        if (categoryId == null) {
            return null;
        }
        return (root, query, cb) -> cb.equal(root.get("category").get("id"), categoryId);
    }

    /**
     * What a shopper actually finds under one category.
     *
     * <p>Exists so the counts advertised beside a category name can be asked as
     * the very question the feed answers when that name is clicked. Counting
     * merely undeleted rows instead - which is what the derived
     * {@code countByCategoryIdAndDeletedFalse} does - advertises drafts, sold
     * items and the listings of banned or suspended sellers, so "Electronics
     * 13" opens onto three. A number shown next to a link is a promise about
     * where the link goes, and the only way to keep it is to share the
     * predicate rather than maintain a second one alongside it.
     *
     * <p>Not for the "is anything still attached to this row?" question that
     * guards category deletion - a SOLD listing still references its category
     * and would be orphaned by a delete this does not see.
     */
    public static Specification<Listing> publicInCategory(UUID categoryId) {
        return publiclyVisible().and(inCategory(categoryId));
    }

    public static Specification<Listing> priceAtLeast(BigDecimal min) {
        if (min == null) {
            return null;
        }
        return (root, query, cb) -> cb.greaterThanOrEqualTo(root.get("price"), min);
    }

    /**
     * The Special Offers shelf. Only ever filters positively - passing false
     * would mean "show me everything that is not on offer", which nothing
     * asks for and which would quietly hide the shelf's items from browse.
     */
    public static Specification<Listing> onlySpecialOffers(Boolean specialOffer) {
        if (specialOffer == null || !specialOffer) {
            return null;
        }
        return (root, query, cb) -> cb.isTrue(root.get("specialOffer"));
    }

    public static Specification<Listing> priceAtMost(BigDecimal max) {
        if (max == null) {
            return null;
        }
        return (root, query, cb) -> cb.lessThanOrEqualTo(root.get("price"), max);
    }

    public static Specification<Listing> withCondition(String condition) {
        if (condition == null || condition.isBlank()) {
            return null;
        }
        ListingCondition parsed = ListingCondition.valueOf(condition.trim().toUpperCase());
        return (root, query, cb) -> cb.equal(root.get("condition"), parsed);
    }

    public static Specification<Listing> atLocation(String location) {
        if (location == null || location.isBlank()) {
            return null;
        }
        String like = "%" + location.trim().toLowerCase() + "%";
        return (root, query, cb) -> cb.like(cb.lower(root.get("location")), like);
    }

    /**
     * Exact zone match. Unlike {@link #atLocation}, which does a fuzzy LIKE over
     * free text, the zone is a fixed enum - so this can be an equality test and
     * actually use the index.
     */
    public static Specification<Listing> inZone(String zone) {
        if (zone == null || zone.isBlank()) {
            return null;
        }
        CampusZone parsed;
        try {
            parsed = CampusZone.valueOf(zone.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            // An unknown zone matches nothing rather than 500-ing a public
            // browse request over a bad query string.
            return (root, query, cb) -> cb.disjunction();
        }
        return (root, query, cb) -> cb.equal(root.get("campusZone"), parsed);
    }

    public static Specification<Listing> bySeller(UUID sellerId) {
        if (sellerId == null) {
            return null;
        }
        return (root, query, cb) -> cb.equal(root.get("seller").get("id"), sellerId);
    }
}
