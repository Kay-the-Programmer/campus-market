package com.campusmarket.service;

import com.campusmarket.domain.Category;
import com.campusmarket.domain.Listing;
import com.campusmarket.repository.CartItemRepository;
import com.campusmarket.repository.CategoryRepository;
import com.campusmarket.repository.ListingRepository;
import com.campusmarket.repository.ListingViewRepository;
import com.campusmarket.repository.OrderRepository;
import com.campusmarket.repository.SavedListingRepository;
import com.campusmarket.security.Principal;
import com.campusmarket.service.recommend.Candidate;
import com.campusmarket.service.recommend.ListingScorer;
import com.campusmarket.service.recommend.Signal;
import com.campusmarket.service.recommend.TasteProfile;
import com.campusmarket.web.dto.ListingDtos.CategoryDto;
import com.campusmarket.web.dto.ListingDtos.ListingDto;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * What to show somebody, in what order.
 *
 * <p>Three questions, one set of signals. What should the feed lead with; what
 * else should sit under the listing they are reading; where should they browse
 * next. All three come out of the same two things: what this person has done
 * ({@link TasteProfile}) and what everybody else did around the same listings
 * (co-visitation), which is the only part that can suggest something their own
 * history never would.
 *
 * <h2>No model, on purpose</h2>
 *
 * <p>Everything here is a query and a weighted sum, computed per request. On
 * one campus with a four-figure catalogue that is both fast enough and more
 * accurate than a model trained nightly, because the catalogue turns over in
 * days - a textbook sells and is gone, and a recommender working from
 * yesterday's snapshot would keep offering it. If the catalogue ever outgrows
 * this, the thing to add is caching of the co-visitation query; the scoring is
 * already pure and could move anywhere.
 *
 * <h2>What is kept</h2>
 *
 * <p>Nothing. The profile is built from rows that already exist for other
 * reasons - views, saves, baskets, orders - lives for the length of one
 * request, and is never written anywhere. A guest's history is not stored at
 * all: it arrives in the request from their own device, is used to rank that
 * response, and is dropped with it.
 */
@Service
@RequiredArgsConstructor
public class RecommendationService {

    /**
     * How far back the signals look.
     *
     * <p>A month: a term's worth of shopping is a different person from
     * freshers' week, and a profile that remembers everything keeps
     * recommending the fridge they already bought.
     */
    public static final int SIGNAL_WINDOW_DAYS = 30;

    /** How many of a person's own recent views feed their profile. */
    private static final int PROFILE_VIEWS = 60;

    /**
     * How many recently-viewed ids a guest may send.
     *
     * <p>Capped because it is a query string and because twenty listings is
     * already more than enough to characterise a session - the rest would be
     * weight on the request for no gain in the ranking.
     */
    public static final int GUEST_HISTORY_LIMIT = 20;

    /**
     * How many listings are ranked before the feed falls back to newest.
     *
     * <p>The pool is the newest N that match the filters, so everything past it
     * is strictly older and ordering it by date continues the page cleanly -
     * no row appears twice and none is skipped. Ten pages deep is far past
     * where ranking is doing anybody any good.
     */
    private static final int RANK_POOL = 240;

    /** Co-visitation seeds: how many of the person's recent listings to join from. */
    private static final int CO_VIEW_SEEDS = 12;

    /** How many co-viewed listings to pull back. */
    private static final int CO_VIEW_DEPTH = 80;

    private final ListingRepository listingRepository;
    private final ListingViewRepository listingViewRepository;
    private final SavedListingRepository savedListingRepository;
    private final CartItemRepository cartItemRepository;
    private final OrderRepository orderRepository;
    private final CategoryRepository categoryRepository;
    private final DtoMapper mapper;

    /** A page of the feed, already in order. The caller owns turning it into DTOs. */
    public record RankedPage(List<Listing> listings, long total) {
    }

    // ------------------------------------------------------------- profile

    /**
     * Everything we can say about what this person is shopping for.
     *
     * @param guestRecent listing ids the client says it has been looking at.
     *   This is how a guest gets a ranked feed at all - they have no rows on
     *   this side to build a profile from. Ignored for a signed-in caller,
     *   whose own history is better and is already here.
     */
    @Transactional(readOnly = true)
    public TasteProfile profileFor(Principal principal, List<UUID> guestRecent) {
        if (principal != null && principal.isAuthenticated()) {
            return fromAccount(principal.user().getId());
        }
        return fromGuestHistory(guestRecent);
    }

    private TasteProfile fromAccount(UUID userId) {
        /*
         * One weight per listing, strongest action wins: somebody who viewed a
         * listing and then bought it has told us one thing about themselves,
         * not two, and counting both would let a long browse outweigh a
         * purchase.
         */
        Map<UUID, Double> weights = new HashMap<>();

        listingViewRepository
                .findRecentlyViewedBy(userId, PageRequest.of(0, PROFILE_VIEWS))
                .forEach(id -> weights.merge(id, Signal.Strength.VIEWED, Math::max));

        savedListingRepository.findListingIdsByUserId(userId)
                .forEach(id -> weights.merge(id, Signal.Strength.SAVED, Math::max));

        cartItemRepository.findByUserIdOrderByAddedAtDesc(userId).stream()
                .filter(item -> item.getListing() != null)
                .forEach(item -> weights.merge(
                        item.getListing().getId(), Signal.Strength.CARTED, Math::max));

        orderRepository.findForBuyer(userId).stream()
                .flatMap(order -> order.getItems().stream())
                .filter(item -> item.getListing() != null)
                .forEach(item -> weights.merge(
                        item.getListing().getId(), Signal.Strength.ORDERED, Math::max));

        return profileOf(weights);
    }

    private TasteProfile fromGuestHistory(List<UUID> guestRecent) {
        if (guestRecent == null || guestRecent.isEmpty()) {
            return TasteProfile.empty();
        }
        Map<UUID, Double> weights = new LinkedHashMap<>();
        guestRecent.stream()
                .filter(java.util.Objects::nonNull)
                .limit(GUEST_HISTORY_LIMIT)
                .forEach(id -> weights.put(id, Signal.Strength.VIEWED));
        return profileOf(weights);
    }

    /** Turns listing ids and weights into facets, in one read. */
    private TasteProfile profileOf(Map<UUID, Double> weights) {
        if (weights.isEmpty()) {
            return TasteProfile.empty();
        }
        List<Signal> signals = listingRepository.findAllById(weights.keySet()).stream()
                .map(listing -> new Signal(
                        listing.getId(),
                        listing.getCategory() == null ? null : listing.getCategory().getId(),
                        listing.getType(),
                        listing.getPrice(),
                        listing.getCampusZone(),
                        weights.getOrDefault(listing.getId(), Signal.Strength.VIEWED)))
                .toList();
        return TasteProfile.from(signals);
    }

    // ---------------------------------------------------------------- feed

    /**
     * The browse feed, ordered by what this person is likely to want.
     *
     * <p>Ranks the newest {@link #RANK_POOL} listings that match the caller's
     * filters and pages through that, then continues in date order beyond it.
     * The two halves cannot overlap - the pool is defined as the newest N - so
     * scrolling never repeats a card or skips one.
     *
     * <p>A cold profile is not ranked at all. The scorer would still work, but
     * every personal term would be zero and the result would be a trending
     * order wearing a personalised label; honest newest-first is better.
     */
    @Transactional(readOnly = true)
    public RankedPage rank(Principal principal, TasteProfile profile,
                           Specification<Listing> spec, int page, int size) {
        Sort newest = Sort.by(Sort.Direction.DESC, "createdAt");
        int offset = page * size;

        if (profile.isCold() || offset >= RANK_POOL) {
            Page<Listing> plain = listingRepository.findAll(spec, PageRequest.of(page, size, newest));
            return new RankedPage(plain.getContent(), plain.getTotalElements());
        }

        Page<Listing> pool = listingRepository.findAll(spec, PageRequest.of(0, RANK_POOL, newest));
        List<Listing> ranked = order(principal, profile, pool.getContent());

        List<Listing> slice = new ArrayList<>(
                ranked.subList(Math.min(offset, ranked.size()),
                        Math.min(offset + size, ranked.size())));

        /*
         * The page that straddles the end of the pool. Topped up from the date
         * ordering starting exactly where the pool stopped, which is the first
         * row the pool did not contain.
         */
        if (slice.size() < size && ranked.size() >= RANK_POOL) {
            int wanted = size - slice.size();
            /* Read the pool plus what is still needed and take the tail. Paging
               cannot express "the row after the pool" when the pool is not a
               whole number of pages, and this is one extra read on the single
               page that straddles the boundary. */
            List<Listing> beyond = listingRepository
                    .findAll(spec, PageRequest.of(0, RANK_POOL + wanted, newest))
                    .getContent();
            for (int i = RANK_POOL; i < beyond.size() && slice.size() < size; i++) {
                slice.add(beyond.get(i));
            }
        }
        return new RankedPage(slice, pool.getTotalElements());
    }

    /** Scores a pool of candidates and sorts it, best first. */
    private List<Listing> order(Principal principal, TasteProfile profile, List<Listing> pool) {
        if (pool.isEmpty()) {
            return pool;
        }
        UUID viewerId = principal != null && principal.isAuthenticated()
                ? principal.user().getId() : null;
        ListingScorer.Context context = contextFor(profile, viewerId, pool);

        Map<UUID, Double> scores = new HashMap<>(pool.size());
        pool.forEach(listing -> scores.put(
                listing.getId(),
                ListingScorer.score(Candidate.of(listing), profile, context)));

        return pool.stream()
                .sorted(Comparator
                        .comparingDouble((Listing l) -> scores.getOrDefault(l.getId(), 0d))
                        .reversed()
                        // Same score, newest first - the order the feed would
                        // have been in anyway, so ties never look arbitrary.
                        .thenComparing(Listing::getCreatedAt, Comparator.reverseOrder()))
                .toList();
    }

    /** The two population-wide terms: who-else-looked-at-this, and what is busy. */
    private ListingScorer.Context contextFor(TasteProfile profile, UUID viewerId,
                                             List<Listing> pool) {
        Instant since = Instant.now().minus(SIGNAL_WINDOW_DAYS, ChronoUnit.DAYS);
        List<UUID> ids = pool.stream().map(Listing::getId).toList();

        Map<UUID, Long> trending = counts(listingViewRepository.countRecentByListingIds(since, ids));
        long topTrend = trending.values().stream().mapToLong(Long::longValue).max().orElse(0);

        List<UUID> seeds = profile.strongestTouched(CO_VIEW_SEEDS);
        Map<UUID, Double> coViews = normalisedCoViews(seeds, since);

        return new ListingScorer.Context(coViews, trending, topTrend, viewerId, Instant.now());
    }

    /** Co-visitation strengths for a set of seeds, scaled so the strongest is 1. */
    private Map<UUID, Double> normalisedCoViews(List<UUID> seeds, Instant since) {
        if (seeds.isEmpty()) {
            return Map.of();
        }
        Map<UUID, Long> raw = counts(listingViewRepository.findCoViewed(
                seeds, since, PageRequest.of(0, CO_VIEW_DEPTH)));
        long top = raw.values().stream().mapToLong(Long::longValue).max().orElse(0);
        if (top <= 0) {
            return Map.of();
        }
        Map<UUID, Double> scaled = new HashMap<>(raw.size());
        raw.forEach((id, count) -> scaled.put(id, (double) count / top));
        return scaled;
    }

    // --------------------------------------------------------- suggestions

    /**
     * What else to put under a listing somebody is reading.
     *
     * <p>Not "similar": the page already shows similar things, and a row of
     * five more of the same textbook is the least useful thing a listing page
     * can offer. This answers a different question - what did the people who
     * opened this go on to open - which is what turns a lab coat into the
     * goggles and the lab manual.
     *
     * <p>Falls back to the same category when the listing is too new or too
     * quiet to have co-visitation of its own, because an empty row is worse
     * than an obvious one. The caller is told which of the two it got, so the
     * heading can be honest about it.
     */
    @Transactional(readOnly = true)
    public Suggested alsoViewed(Principal principal, UUID listingId, int limit) {
        int cap = Math.min(Math.max(limit, 1), 12);
        Listing seed = listingRepository.findById(listingId).orElse(null);
        if (seed == null) {
            return new Suggested(List.of(), "none");
        }
        Instant since = Instant.now().minus(SIGNAL_WINDOW_DAYS, ChronoUnit.DAYS);

        Map<UUID, Long> coViewed = counts(listingViewRepository.findCoViewed(
                List.of(listingId), since, PageRequest.of(0, CO_VIEW_DEPTH)));

        List<Listing> picks = visible(coViewed.keySet()).stream()
                .filter(listing -> !listing.getId().equals(listingId))
                .sorted(Comparator.comparingLong(
                        (Listing l) -> coViewed.getOrDefault(l.getId(), 0L)).reversed())
                .limit(cap)
                .toList();

        String basis = "also-viewed";
        if (picks.size() < Math.min(cap, 4)) {
            /* Too quiet to stand on co-visitation alone. Topped up from the
               same category, newest first, without repeating anything. */
            Set<UUID> have = picks.stream().map(Listing::getId).collect(Collectors.toSet());
            have.add(listingId);
            List<Listing> filler = sameCategory(seed, have, cap - picks.size());
            if (!filler.isEmpty()) {
                List<Listing> merged = new ArrayList<>(picks);
                merged.addAll(filler);
                picks = merged;
                basis = coViewed.isEmpty() ? "category" : "mixed";
            }
        }

        Set<UUID> saved = savedIdsFor(principal);
        return new Suggested(
                picks.stream().map(l -> mapper.listing(l, principal, saved)).toList(),
                basis);
    }

    /** Suggested listings, and what they were chosen on. */
    public record Suggested(List<ListingDto> listings, String basis) {
    }

    private List<Listing> sameCategory(Listing seed, Set<UUID> exclude, int wanted) {
        if (wanted <= 0 || seed.getCategory() == null) {
            return List.of();
        }
        Specification<Listing> spec = ListingSpecifications.publiclyVisible()
                .and(ListingSpecifications.inCategory(seed.getCategory().getId()));
        return listingRepository
                .findAll(spec, PageRequest.of(0, wanted + exclude.size(),
                        Sort.by(Sort.Direction.DESC, "createdAt")))
                .getContent().stream()
                .filter(listing -> !exclude.contains(listing.getId()))
                .limit(wanted)
                .toList();
    }

    // ---------------------------------------------------------- categories

    /**
     * Where this person might want to browse next.
     *
     * <p>Built from where the people around their listings went, not from where
     * they have already been: a shelf recommending the category somebody is
     * standing in has told them nothing. Their own strongest category is
     * therefore excluded, and the rest of their affinity only breaks ties.
     *
     * <p>With nothing to go on it answers with the busiest categories of the
     * week, which is the right answer to "where should I look" for somebody we
     * know nothing about.
     */
    @Transactional(readOnly = true)
    public List<CategoryDto> suggestedCategories(Principal principal, TasteProfile profile,
                                                 int limit) {
        int cap = Math.min(Math.max(limit, 1), 12);
        Instant since = Instant.now().minus(SIGNAL_WINDOW_DAYS, ChronoUnit.DAYS);

        List<UUID> seeds = profile.strongestTouched(CO_VIEW_SEEDS);

        Map<UUID, Double> weight = new HashMap<>();
        if (!seeds.isEmpty()) {
            Map<UUID, Long> coViewed = counts(listingViewRepository.findCoViewed(
                    seeds, since, PageRequest.of(0, CO_VIEW_DEPTH)));
            visible(coViewed.keySet()).forEach(listing -> {
                if (listing.getCategory() != null) {
                    weight.merge(listing.getCategory().getId(),
                            (double) coViewed.getOrDefault(listing.getId(), 0L), Double::sum);
                }
            });
        }

        if (weight.isEmpty()) {
            // Nothing personal to go on: what the campus is looking at.
            List<UUID> busy = listingViewRepository
                    .findTrending(since, PageRequest.of(0, CO_VIEW_DEPTH)).stream()
                    .map(row -> (UUID) row[0])
                    .toList();
            visible(busy).forEach(listing -> {
                if (listing.getCategory() != null) {
                    weight.merge(listing.getCategory().getId(), 1d, Double::sum);
                }
            });
        }

        List<UUID> alreadyTheirs = profile.topCategories(1);
        List<UUID> picks = weight.entrySet().stream()
                .filter(entry -> !alreadyTheirs.contains(entry.getKey()))
                .sorted(Map.Entry.<UUID, Double>comparingByValue().reversed())
                .limit(cap)
                .map(Map.Entry::getKey)
                .toList();

        return categoryRepository.findAllById(picks).stream()
                // findAllById does not promise an order; the ranking is the product.
                .sorted(Comparator.comparingInt((Category c) -> picks.indexOf(c.getId())))
                .map(category -> mapper.category(category, countActive(category)))
                .toList();
    }

    private long countActive(Category category) {
        return listingRepository.count(ListingSpecifications.publiclyVisible()
                .and(ListingSpecifications.inCategory(category.getId())));
    }

    // --------------------------------------------------------------- utils

    /** Only the listings a stranger is allowed to see, from a set of ids. */
    private List<Listing> visible(java.util.Collection<UUID> ids) {
        if (ids == null || ids.isEmpty()) {
            return List.of();
        }
        return listingRepository.findAll(ListingSpecifications.publiclyVisible()
                .and(ListingSpecifications.withIds(ids)));
    }

    /** Turns a grouped `[id, count]` result into a map. */
    private static Map<UUID, Long> counts(List<Object[]> rows) {
        Map<UUID, Long> out = new HashMap<>(rows.size());
        for (Object[] row : rows) {
            out.put((UUID) row[0], ((Number) row[1]).longValue());
        }
        return out;
    }

    private Set<UUID> savedIdsFor(Principal principal) {
        if (principal == null || principal.isGuest()) {
            return Set.of();
        }
        return savedListingRepository.findListingIdsByUserId(principal.user().getId());
    }
}
