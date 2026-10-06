package com.campusmarket.service.recommend;

import com.campusmarket.domain.CampusZone;
import com.campusmarket.domain.ListingType;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The order the feed comes out in.
 *
 * <p>Asserted as comparisons rather than as numbers. The weights are a
 * judgement that will be re-tuned, and a test pinning "3.4" would fail on every
 * tuning while telling nobody anything; what must not change is which listing
 * ends up above which, because that is the product.
 */
class ListingScorerTest {

    private static final UUID BOOKS = UUID.randomUUID();
    private static final UUID FOOD = UUID.randomUUID();
    private static final Instant NOW = Instant.parse("2026-03-01T12:00:00Z");

    private static Candidate listing(UUID category, String price) {
        return listing(UUID.randomUUID(), category, price, NOW.minus(1, ChronoUnit.DAYS));
    }

    private static Candidate listing(UUID id, UUID category, String price, Instant posted) {
        return new Candidate(id, UUID.randomUUID(), category, ListingType.PRODUCT,
                new BigDecimal(price), CampusZone.DOWNSCHOOL, posted);
    }

    private static TasteProfile shopsFor(UUID category, String price) {
        return TasteProfile.from(List.of(
                new Signal(UUID.randomUUID(), category, ListingType.PRODUCT,
                        new BigDecimal(price), CampusZone.DOWNSCHOOL, Signal.Strength.SAVED)));
    }

    private static ListingScorer.Context plain() {
        return ListingScorer.Context.none(NOW);
    }

    @Test
    @DisplayName("what they shop for outranks what they do not")
    void categoryLeads() {
        TasteProfile profile = shopsFor(BOOKS, "100");

        double match = ListingScorer.score(listing(BOOKS, "100"), profile, plain());
        double other = ListingScorer.score(listing(FOOD, "100"), profile, plain());

        assertThat(match).isGreaterThan(other);
    }

    @Test
    @DisplayName("a listing far above their budget loses to one within it")
    void priceBandMatters() {
        TasteProfile profile = shopsFor(BOOKS, "100");

        double affordable = ListingScorer.score(listing(BOOKS, "120"), profile, plain());
        double steep = ListingScorer.score(listing(BOOKS, "4000"), profile, plain());

        assertThat(affordable).isGreaterThan(steep);
    }

    @Test
    @DisplayName("cheaper than usual is not held against a listing")
    void bargainsAreNotPunished() {
        assertThat(ListingScorer.priceFit(new BigDecimal("50"), new BigDecimal("100")))
                .isGreaterThan(0.8);
        assertThat(ListingScorer.priceFit(new BigDecimal("400"), new BigDecimal("100")))
                .isZero();
    }

    @Test
    @DisplayName("with no price history every listing scores the same on price")
    void priceIsNeutralWithoutHistory() {
        assertThat(ListingScorer.priceFit(new BigDecimal("10"), null))
                .isEqualTo(ListingScorer.priceFit(new BigDecimal("10000"), null));
    }

    @Test
    @DisplayName("a free listing is never demoted for having no price")
    void freeIsFine() {
        assertThat(ListingScorer.priceFit(null, new BigDecimal("100"))).isGreaterThan(0.5);
        assertThat(ListingScorer.priceFit(BigDecimal.ZERO, new BigDecimal("100"))).isGreaterThan(0.5);
    }

    /*
     * The one term that knows something the person's own history does not. It
     * has to be able to lift a listing out of a category they have never
     * touched, or it is not doing anything.
     */
    @Test
    @DisplayName("co-visitation lifts a listing from a category they have never browsed")
    void coVisitationCrossesCategories() {
        TasteProfile profile = shopsFor(BOOKS, "100");
        Candidate stranger = listing(FOOD, "100");
        Candidate plainBook = listing(BOOKS, "100");

        ListingScorer.Context withCoView = new ListingScorer.Context(
                Map.of(stranger.id(), 1.0), Map.of(), 0, null, NOW);

        assertThat(ListingScorer.score(stranger, profile, withCoView))
                .isGreaterThan(ListingScorer.score(plainBook, profile, withCoView));
    }

    @Test
    @DisplayName("something they already looked at sits below an equal one they have not")
    void seenIsDemoted() {
        UUID seenId = UUID.randomUUID();
        TasteProfile profile = TasteProfile.from(List.of(
                new Signal(seenId, BOOKS, ListingType.PRODUCT, new BigDecimal("100"),
                        CampusZone.DOWNSCHOOL, Signal.Strength.VIEWED),
                new Signal(UUID.randomUUID(), BOOKS, ListingType.PRODUCT, new BigDecimal("100"),
                        CampusZone.DOWNSCHOOL, Signal.Strength.VIEWED),
                new Signal(UUID.randomUUID(), BOOKS, ListingType.PRODUCT, new BigDecimal("100"),
                        CampusZone.DOWNSCHOOL, Signal.Strength.VIEWED),
                new Signal(UUID.randomUUID(), BOOKS, ListingType.PRODUCT, new BigDecimal("100"),
                        CampusZone.DOWNSCHOOL, Signal.Strength.VIEWED)));

        Instant posted = NOW.minus(1, ChronoUnit.DAYS);
        double seen = ListingScorer.score(listing(seenId, BOOKS, "100", posted), profile, plain());
        double fresh = ListingScorer.score(
                listing(UUID.randomUUID(), BOOKS, "100", posted), profile, plain());

        assertThat(seen).isLessThan(fresh);
    }

    @Test
    @DisplayName("what is already in their basket is pushed further down than what they merely saw")
    void engagedIsDemotedHarder() {
        UUID viewed = UUID.randomUUID();
        UUID carted = UUID.randomUUID();
        TasteProfile profile = TasteProfile.from(List.of(
                new Signal(viewed, BOOKS, ListingType.PRODUCT, new BigDecimal("100"),
                        CampusZone.DOWNSCHOOL, Signal.Strength.VIEWED),
                new Signal(carted, BOOKS, ListingType.PRODUCT, new BigDecimal("100"),
                        CampusZone.DOWNSCHOOL, Signal.Strength.CARTED)));

        Instant posted = NOW.minus(1, ChronoUnit.DAYS);
        assertThat(ListingScorer.score(listing(carted, BOOKS, "100", posted), profile, plain()))
                .isLessThan(ListingScorer.score(listing(viewed, BOOKS, "100", posted), profile, plain()));
    }

    @Test
    @DisplayName("a seller is never recommended their own listing")
    void neverYourOwn() {
        UUID me = UUID.randomUUID();
        Candidate mine = new Candidate(UUID.randomUUID(), me, BOOKS, ListingType.PRODUCT,
                new BigDecimal("100"), CampusZone.DOWNSCHOOL, NOW);
        ListingScorer.Context asMe = new ListingScorer.Context(Map.of(), Map.of(), 0, me, NOW);

        assertThat(ListingScorer.score(mine, shopsFor(BOOKS, "100"), asMe)).isNegative();
        // Far below anything a real listing can score, so it sorts to the end.
        assertThat(ListingScorer.score(mine, shopsFor(BOOKS, "100"), asMe)).isLessThan(-100);
    }

    /*
     * Most sessions know nothing about the person. The ranking still has to be
     * a sensible feed, which means new and busy first rather than arbitrary.
     */
    @Test
    @DisplayName("with no profile at all, newer still beats older")
    void coldFallsBackToFresh() {
        TasteProfile nobody = TasteProfile.empty();
        Candidate today = listing(UUID.randomUUID(), BOOKS, "100", NOW.minus(1, ChronoUnit.HOURS));
        Candidate lastMonth = listing(UUID.randomUUID(), BOOKS, "100", NOW.minus(40, ChronoUnit.DAYS));

        assertThat(ListingScorer.score(today, nobody, plain()))
                .isGreaterThan(ListingScorer.score(lastMonth, nobody, plain()));
    }

    @Test
    @DisplayName("with no profile, the busier listing wins")
    void coldFallsBackToTrending() {
        TasteProfile nobody = TasteProfile.empty();
        Instant posted = NOW.minus(2, ChronoUnit.DAYS);
        Candidate busy = listing(UUID.randomUUID(), BOOKS, "100", posted);
        Candidate quiet = listing(UUID.randomUUID(), BOOKS, "100", posted);

        ListingScorer.Context context = new ListingScorer.Context(
                Map.of(), Map.of(busy.id(), 30L, quiet.id(), 1L), 30, null, NOW);

        assertThat(ListingScorer.score(busy, nobody, context))
                .isGreaterThan(ListingScorer.score(quiet, nobody, context));
    }

    @Test
    @DisplayName("freshness runs out rather than going negative")
    void freshnessIsBounded() {
        assertThat(ListingScorer.freshness(NOW, NOW)).isEqualTo(1);
        assertThat(ListingScorer.freshness(NOW.minus(7, ChronoUnit.DAYS), NOW))
                .isBetween(0.4, 0.6);
        assertThat(ListingScorer.freshness(NOW.minus(400, ChronoUnit.DAYS), NOW)).isZero();
        assertThat(ListingScorer.freshness(null, NOW)).isZero();
    }

    @Test
    @DisplayName("a missing listing scores nothing instead of throwing")
    void nullCandidate() {
        assertThat(ListingScorer.score(null, TasteProfile.empty(), plain())).isZero();
    }
}
