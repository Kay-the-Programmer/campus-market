package com.campusmarket.service;

import com.campusmarket.domain.*;
import jakarta.persistence.criteria.CriteriaBuilder;
import jakarta.persistence.criteria.Expression;
import jakarta.persistence.criteria.Join;
import jakarta.persistence.criteria.Predicate;
import jakarta.persistence.criteria.Root;
import jakarta.persistence.criteria.Subquery;
import org.springframework.data.jpa.domain.Specification;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.util.Arrays;
import java.util.Collection;
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

    /**
     * How many words of a query are used.
     *
     * <p>Each one costs four LIKEs, and nobody searching a campus marketplace
     * means anything by the seventh word. Past this the tail is dropped rather
     * than the query refused - a long query is clumsy, not invalid.
     */
    private static final int MAX_TOKENS = 6;

    /**
     * The words in a query that are worth matching on.
     *
     * <p>Single characters are dropped: they carry no intent and, because the
     * words are ANDed, a stray "a" would narrow the results for no reason.
     * Duplicates go too, so "bike bike" is one condition rather than two
     * identical ones.
     */
    private static List<String> tokenize(String term) {
        if (term == null || term.isBlank()) {
            return List.of();
        }
        return Arrays.stream(term.trim().toLowerCase().split("\\s+"))
                .filter(t -> t.length() > 1)
                .distinct()
                .limit(MAX_TOKENS)
                .toList();
    }

    /**
     * The seller join, reused rather than remade.
     *
     * <p>{@code root.join} creates a NEW join every time it is called, and the
     * visibility rules have already made one by the time any of this runs.
     * Each extra join is a redundant pass over the same one-to-one
     * relationship - harmless with two, wasteful once a six-word query wants
     * one apiece.
     */
    @SuppressWarnings("unchecked")
    private static Join<Listing, User> sellerJoin(Root<Listing> root) {
        return root.getJoins().stream()
                .filter(j -> "seller".equals(j.getAttribute().getName()))
                .findFirst()
                .map(j -> (Join<Listing, User>) j)
                .orElseGet(() -> root.join("seller"));
    }

    /** One LIKE pattern tested against every field a search is allowed to read. */
    private static Predicate matchesAnywhere(Root<Listing> root, Join<Listing, User> seller,
                                             CriteriaBuilder cb, String like) {
        return cb.or(
                cb.like(cb.lower(root.get("title")), like),
                cb.like(cb.lower(root.get("description")), like),
                cb.like(cb.lower(root.get("brand")), like),
                cb.like(cb.lower(seller.get("name")), like));
    }

    /**
     * Free-text search, matched word by word.
     *
     * <p>This used to build ONE pattern out of the whole query - {@code
     * %calculus textbook%} - which meant the words had to appear together, in
     * that order, as a literal substring. So "calculus textbook" found nothing
     * on a listing titled "Textbook - Calculus 101", and "lamp for desk" found
     * nothing on "Desk lamp". Any query whose word order differed from the
     * title came back empty, which reads as "the site has none" rather than
     * "the site looked for the wrong thing".
     *
     * <p>Now every word has to appear SOMEWHERE in the listing - title,
     * description, brand or seller - but they no longer have to be adjacent or
     * in order. Words are ANDed rather than ORed, because a query is a
     * description of one thing: someone typing two words wants the listings
     * matching both, not the much larger pile matching either.
     *
     * <p>The whole phrase is still tried on its own and ORed in, so a listing
     * that genuinely contains the exact phrase is never lost to a word the
     * tokenizer dropped. A single-word query behaves exactly as it always did.
     */
    public static Specification<Listing> textSearch(String term) {
        if (term == null || term.isBlank()) {
            return null;
        }
        String phrase = "%" + term.trim().toLowerCase() + "%";
        List<String> tokens = tokenize(term);

        return (root, query, cb) -> {
            Join<Listing, User> seller = sellerJoin(root);
            Predicate exactPhrase = matchesAnywhere(root, seller, cb, phrase);
            if (tokens.size() < 2) {
                return exactPhrase;
            }
            Predicate everyWord = cb.conjunction();
            for (String token : tokens) {
                everyWord = cb.and(everyWord, matchesAnywhere(root, seller, cb, "%" + token + "%"));
            }
            return cb.or(exactPhrase, everyWord);
        };
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
        List<String> tokens = tokenize(term);
        boolean multiWord = tokens.size() > 1;

        return (root, query, cb) -> {
            /*
             * Spring Data derives a COUNT query from this same spec to work out
             * the page total. An ORDER BY over an expression that query does not
             * select is at best useless and at worst a Hibernate error, so the
             * ordering is only attached to the query that returns rows.
             */
            Class<?> resultType = query.getResultType();
            if (resultType != Long.class && resultType != long.class) {
                Expression<String> title = cb.lower(root.get("title"));

                /* Every word present in the title, in any order. Only built
                   for a real multi-word query - an empty conjunction is TRUE,
                   which would rank every row as a title hit. */
                Predicate allWordsInTitle = cb.conjunction();
                for (String token : tokens) {
                    allWordsInTitle = cb.and(allWordsInTitle, cb.like(title, "%" + token + "%"));
                }

                CriteriaBuilder.Case<Integer> ranked = cb.<Integer>selectCase()
                        .when(cb.equal(title, cleaned), 0)
                        .when(cb.like(title, prefix), 1)
                        .when(cb.like(title, anywhere), 2);
                if (multiWord) {
                    /* The whole reason the search now finds these at all, so
                       they rank directly under a contiguous title match and
                       above anything that only matched a description. */
                    ranked = ranked.when(allWordsInTitle, 3);
                }
                Expression<Integer> rank = ranked
                        .when(cb.like(cb.lower(root.get("brand")), anywhere), 4)
                        .when(cb.like(cb.lower(root.get("description")), anywhere), 5)
                        // Everything left matched on the seller's name, or on
                        // words scattered across several fields - a real hit
                        // either way, and the weakest one.
                        .otherwise(6)
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

    /**
     * Listings priced genuinely below what they usually go for.
     *
     * <p>The test is the one {@code DtoMapper.discountPercent} already applies,
     * so the filter and the badge can never disagree: a comparison price has to
     * exist and has to be above the asking price. A "was" at or below the
     * current price is not a discount, and a shelf carrying those rows would be
     * quoting a saving of zero or less.
     *
     * <p>Only ever filters positively, like {@link #onlySpecialOffers} - false
     * would mean "everything that is not reduced", which nothing asks for.
     */
    public static Specification<Listing> hasDiscount(Boolean discounted) {
        if (discounted == null || !discounted) {
            return null;
        }
        return (root, query, cb) -> cb.and(
                cb.isNotNull(root.get("compareAtPrice")),
                cb.greaterThan(root.<BigDecimal>get("compareAtPrice"),
                        root.<BigDecimal>get("price")));
    }

    /**
     * Deepest saving first, as a proportion rather than an amount.
     *
     * <p>Percent is what a shopper compares: K10 off a K20 lamp is a better
     * deal than K50 off a K5,000 laptop, and ordering by the cash difference
     * would rank them the other way round.
     *
     * <p>Callers must pair this with {@link #hasDiscount}, which
     * {@code ListingService.search} does for them. The division is by the
     * comparison price, so a row without one has no defined position here and
     * would divide by null. Contributes ordering only, exactly like
     * {@link #orderByRelevance}.
     */
    public static Specification<Listing> orderByDiscount() {
        return (root, query, cb) -> {
            // Same reasoning as orderByRelevance: the COUNT query Spring Data
            // derives does not select this expression, so it must not order by
            // it either.
            Class<?> resultType = query.getResultType();
            if (resultType != Long.class && resultType != long.class) {
                Expression<BigDecimal> compareAt = root.get("compareAtPrice");
                Expression<Number> saving = cb.quot(
                        cb.diff(compareAt, root.<BigDecimal>get("price")), compareAt);
                // Newest breaks ties, so two equal percentages still page stably.
                query.orderBy(cb.desc(saving), cb.desc(root.get("createdAt")));
            }
            return cb.conjunction();
        };
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

    /**
     * Busiest recently, rather than busiest ever.
     *
     * <p>"Most popular" used to be {@code ORDER BY views_count DESC} - a
     * lifetime counter with no memory of when it was incremented. A listing
     * posted in September with 400 views therefore outranked today's hottest
     * item permanently, and the sort got more wrong every week it stayed up.
     * What people mean by popular on a marketplace is "what is moving now".
     *
     * <p>Counted with a correlated subquery over the view events rather than a
     * join, so listings with no recent views score zero and still appear -
     * ordered last, which is right - instead of being dropped from a sort that
     * was only ever meant to reorder the results, not filter them.
     *
     * <p>Contributes ordering only, like {@link #orderByRelevance}. The
     * lifetime counter is untouched and still what the seller's dashboard
     * reports; see V14__listing_views.sql.
     */
    public static Specification<Listing> orderByTrending(int windowDays) {
        Instant since = Instant.now().minus(Duration.ofDays(Math.max(windowDays, 1)));

        return (root, query, cb) -> {
            // The derived COUNT query does not select this, same as elsewhere.
            Class<?> resultType = query.getResultType();
            if (resultType != Long.class && resultType != long.class) {
                Subquery<Long> recentViews = query.subquery(Long.class);
                Root<ListingView> view = recentViews.from(ListingView.class);
                recentViews.select(cb.count(view))
                        .where(cb.and(
                                cb.equal(view.get("listingId"), root.get("id")),
                                cb.greaterThanOrEqualTo(view.<Instant>get("viewedAt"), since)));

                // Lifetime views break ties, so a page with no recent activity
                // at all still comes back in a sensible order rather than by
                // whatever the planner happened to return.
                query.orderBy(cb.desc(recentViews),
                        cb.desc(root.get("viewsCount")),
                        cb.desc(root.get("createdAt")));
            }
            return cb.conjunction();
        };
    }

    /**
     * Exactly these listings, in no particular order.
     *
     * <p>For callers that have already decided WHICH rows they want elsewhere -
     * the trending shelf ranks ids by view count first - and need them passed
     * back through the public visibility rules before anyone sees them. A view
     * row outlives its listing being sold or its seller being suspended, and
     * neither belongs on the home page.
     *
     * <p>An empty set matches nothing, which is the honest answer: "any of
     * these" over none of them is not everything.
     */
    public static Specification<Listing> withIds(Collection<UUID> ids) {
        if (ids == null) {
            return null;
        }
        if (ids.isEmpty()) {
            return (root, query, cb) -> cb.disjunction();
        }
        return (root, query, cb) -> root.get("id").in(ids);
    }

    public static Specification<Listing> bySeller(UUID sellerId) {
        if (sellerId == null) {
            return null;
        }
        return (root, query, cb) -> cb.equal(root.get("seller").get("id"), sellerId);
    }
}
