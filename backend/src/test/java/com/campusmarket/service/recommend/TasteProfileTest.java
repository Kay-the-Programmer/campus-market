package com.campusmarket.service.recommend;

import com.campusmarket.domain.CampusZone;
import com.campusmarket.domain.ListingType;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * What the recommender believes about a person.
 *
 * <p>This is the half of the engine that reads somebody's own behaviour, so the
 * failures worth guarding against are the ones that would quietly produce a
 * confident wrong answer: a single glance outweighing a purchase, one
 * expensive listing dragging a student's price band up with it, or a profile
 * built from nothing at all claiming to know something.
 */
class TasteProfileTest {

    private static final UUID BOOKS = UUID.randomUUID();
    private static final UUID FOOD = UUID.randomUUID();
    private static final UUID TECH = UUID.randomUUID();

    private static Signal signal(UUID category, double weight, String price) {
        return new Signal(UUID.randomUUID(), category, ListingType.PRODUCT,
                new BigDecimal(price), CampusZone.DOWNSCHOOL, weight);
    }

    @Test
    @DisplayName("knowing nothing is a profile that scores nothing, not a crash")
    void emptyProfile() {
        TasteProfile profile = TasteProfile.from(List.of());

        assertThat(profile.isCold()).isTrue();
        assertThat(profile.categoryAffinity(BOOKS)).isZero();
        assertThat(profile.typicalPrice()).isNull();
        assertThat(profile.topCategories(5)).isEmpty();
    }

    @Test
    @DisplayName("null and zero-weight signals are ignored rather than counted")
    void ignoresEmptySignals() {
        TasteProfile profile = TasteProfile.from(java.util.Arrays.asList(
                null, signal(BOOKS, 0, "100"), signal(BOOKS, Signal.Strength.SAVED, "100")));

        assertThat(profile.totalWeight()).isEqualTo(Signal.Strength.SAVED);
    }

    @Test
    @DisplayName("the favourite category always scores 1, however much history there is")
    void normalisedAgainstTheTop() {
        TasteProfile light = TasteProfile.from(List.of(
                signal(BOOKS, Signal.Strength.VIEWED, "100"),
                signal(BOOKS, Signal.Strength.VIEWED, "100"),
                signal(BOOKS, Signal.Strength.VIEWED, "100"),
                signal(BOOKS, Signal.Strength.VIEWED, "100")));

        List<Signal> lots = new java.util.ArrayList<>();
        for (int i = 0; i < 200; i++) {
            lots.add(signal(BOOKS, Signal.Strength.VIEWED, "100"));
        }
        TasteProfile heavy = TasteProfile.from(lots);

        /* The point of normalising: the scorer's weights mean the same thing in
           somebody's first week as in their third month. */
        assertThat(light.categoryAffinity(BOOKS)).isEqualTo(1.0);
        assertThat(heavy.categoryAffinity(BOOKS)).isEqualTo(1.0);
    }

    @Test
    @DisplayName("ranks categories by weight, so a purchase beats a pile of glances")
    void intentOutweighsBrowsing() {
        TasteProfile profile = TasteProfile.from(List.of(
                signal(FOOD, Signal.Strength.VIEWED, "30"),
                signal(FOOD, Signal.Strength.VIEWED, "30"),
                signal(FOOD, Signal.Strength.VIEWED, "30"),
                signal(TECH, Signal.Strength.ORDERED, "900")));

        assertThat(profile.topCategories(2)).containsExactly(TECH, FOOD);
        assertThat(profile.categoryAffinity(TECH)).isEqualTo(1.0);
        assertThat(profile.categoryAffinity(FOOD)).isLessThan(1.0).isGreaterThan(0);
    }

    @Test
    @DisplayName("a category they have never touched scores zero, not a default")
    void unknownCategory() {
        TasteProfile profile = TasteProfile.from(List.of(signal(BOOKS, Signal.Strength.SAVED, "100")));

        assertThat(profile.categoryAffinity(TECH)).isZero();
        assertThat(profile.categoryAffinity(null)).isZero();
    }

    /*
     * The price band is what stops a student who shops at K50 being shown the
     * K4,000 listing all day. A mean would let one look at the most expensive
     * thing on the marketplace do exactly that.
     */
    @Test
    @DisplayName("one expensive glance does not move the price band")
    void medianNotMean() {
        TasteProfile profile = TasteProfile.from(List.of(
                signal(BOOKS, Signal.Strength.VIEWED, "40"),
                signal(BOOKS, Signal.Strength.VIEWED, "50"),
                signal(BOOKS, Signal.Strength.VIEWED, "60"),
                signal(TECH, Signal.Strength.VIEWED, "9000")));

        assertThat(profile.typicalPrice()).isLessThanOrEqualTo(new BigDecimal("60"));
    }

    @Test
    @DisplayName("the price band follows what they buy, not what they browse")
    void purchasesWeighTheBand() {
        TasteProfile profile = TasteProfile.from(List.of(
                signal(BOOKS, Signal.Strength.VIEWED, "20"),
                signal(BOOKS, Signal.Strength.VIEWED, "25"),
                signal(TECH, Signal.Strength.ORDERED, "800")));

        // The order outweighs both glances, so the middle of the weight sits on it.
        assertThat(profile.typicalPrice()).isEqualTo(new BigDecimal("800"));
    }

    @Test
    @DisplayName("one listing touched twice counts once, at its strongest")
    void strongestActionWins() {
        UUID listing = UUID.randomUUID();
        TasteProfile profile = TasteProfile.from(List.of(
                new Signal(listing, BOOKS, ListingType.PRODUCT, new BigDecimal("100"),
                        CampusZone.DOWNSCHOOL, Signal.Strength.VIEWED),
                new Signal(listing, BOOKS, ListingType.PRODUCT, new BigDecimal("100"),
                        CampusZone.DOWNSCHOOL, Signal.Strength.ORDERED)));

        assertThat(profile.touched(listing)).isEqualTo(Signal.Strength.ORDERED);
    }

    /*
     * Two views is a coincidence. Ranking a feed on it produces something that
     * looks personalised and is not, which is worse than being honestly ordered
     * by what is new.
     */
    @Test
    @DisplayName("a couple of glances is too little to rank by; a save is enough")
    void coldUntilThereIsSomethingToGoOn() {
        assertThat(TasteProfile.from(List.of(
                signal(BOOKS, Signal.Strength.VIEWED, "10"),
                signal(BOOKS, Signal.Strength.VIEWED, "10"))).isCold()).isTrue();

        assertThat(TasteProfile.from(List.of(
                signal(BOOKS, Signal.Strength.SAVED, "10"))).isCold()).isFalse();

        assertThat(TasteProfile.from(List.of(
                signal(BOOKS, Signal.Strength.VIEWED, "10"),
                signal(BOOKS, Signal.Strength.VIEWED, "10"),
                signal(FOOD, Signal.Strength.VIEWED, "10"),
                signal(FOOD, Signal.Strength.VIEWED, "10"))).isCold()).isFalse();
    }

    @Test
    @DisplayName("seeds for co-visitation come back strongest first, not in hash order")
    void strongestTouchedIsOrdered() {
        UUID glanced = UUID.randomUUID();
        UUID bought = UUID.randomUUID();
        TasteProfile profile = TasteProfile.from(List.of(
                new Signal(glanced, BOOKS, ListingType.PRODUCT, new BigDecimal("10"),
                        CampusZone.DOWNSCHOOL, Signal.Strength.VIEWED),
                new Signal(bought, TECH, ListingType.PRODUCT, new BigDecimal("10"),
                        CampusZone.DOWNSCHOOL, Signal.Strength.ORDERED)));

        assertThat(profile.strongestTouched(2)).containsExactly(bought, glanced);
        assertThat(profile.strongestTouched(1)).containsExactly(bought);
    }

    @Test
    @DisplayName("facets a listing does not have are simply absent")
    void toleratesMissingFacets() {
        TasteProfile profile = TasteProfile.from(List.of(
                new Signal(UUID.randomUUID(), null, null, null, null, Signal.Strength.SAVED)));

        assertThat(profile.totalWeight()).isEqualTo(Signal.Strength.SAVED);
        assertThat(profile.typicalPrice()).isNull();
        assertThat(profile.typeAffinity(ListingType.PRODUCT)).isZero();
        assertThat(profile.zoneAffinity(CampusZone.DOWNSCHOOL)).isZero();
    }
}
