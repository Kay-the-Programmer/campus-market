package com.campusmarket.service.recommend;

import com.campusmarket.domain.CampusZone;
import com.campusmarket.domain.ListingType;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * What one person appears to be in the market for.
 *
 * <p>Built by collapsing their {@link Signal}s into weights per facet -
 * category, type, campus zone - plus the price they actually engage at. It is
 * a summary, not a history: once built, nothing here can say which listing
 * produced which weight, which is the point. The feed only ever needs to know
 * "how much is this person a textbooks person", and a summary that cannot
 * answer anything else is a summary that cannot leak anything else.
 *
 * <p>Weights are normalised against the strongest facet rather than the total,
 * so the top category always scores 1.0 whether it came from three views or
 * three hundred. Scores from a quiet first week and a busy third one are then
 * on the same scale, and the weights the scorer multiplies by do not have to
 * be re-tuned as somebody's history grows.
 *
 * <h2>Everything is deliberately shallow</h2>
 *
 * <p>No matrix factorisation, no embeddings, no model to train or serve. On one
 * campus with a four-figure catalogue the signal is thin and the latency budget
 * is a single request, so the win is in using the obvious facts at all rather
 * than in using them cleverly. What this cannot do - find that people who buy
 * lab coats also buy a particular calculator - is exactly what co-visitation
 * does instead, and that lives in the service where the data is.
 */
public final class TasteProfile {

    /**
     * Signal weight below which a profile is not worth ranking by.
     *
     * <p>Two views is a coincidence, not a taste. Ranking on it produces a feed
     * that looks personalised and is not, which is worse than a feed that is
     * honestly ordered by what is new and busy - so below this the caller is
     * told to leave the ordering alone. One save or four views clears it.
     */
    private static final double COLD_BELOW = 3.5;

    /** Facets, each normalised so its strongest entry is 1.0. */
    private final Map<UUID, Double> categories;
    private final Map<ListingType, Double> types;
    private final Map<CampusZone, Double> zones;

    /** Listing ids they have already engaged with, by how strongly. */
    private final Map<UUID, Double> touched;

    /** What they engage at, in money. Null when nothing they touched had a price. */
    private final BigDecimal typicalPrice;

    private final double totalWeight;

    private TasteProfile(Map<UUID, Double> categories,
                         Map<ListingType, Double> types,
                         Map<CampusZone, Double> zones,
                         Map<UUID, Double> touched,
                         BigDecimal typicalPrice,
                         double totalWeight) {
        this.categories = categories;
        this.types = types;
        this.zones = zones;
        this.touched = touched;
        this.typicalPrice = typicalPrice;
        this.totalWeight = totalWeight;
    }

    /** The profile of somebody we know nothing about. Scores everything zero. */
    public static TasteProfile empty() {
        return new TasteProfile(Map.of(), Map.of(), Map.of(), Map.of(), null, 0);
    }

    public static TasteProfile from(Collection<Signal> signals) {
        if (signals == null || signals.isEmpty()) {
            return empty();
        }

        Map<UUID, Double> categories = new HashMap<>();
        Map<ListingType, Double> types = new HashMap<>();
        Map<CampusZone, Double> zones = new HashMap<>();
        Map<UUID, Double> touched = new HashMap<>();
        List<WeightedPrice> prices = new ArrayList<>();
        double total = 0;

        for (Signal signal : signals) {
            if (signal == null || signal.weight() <= 0) {
                continue;
            }
            total += signal.weight();
            if (signal.categoryId() != null) {
                categories.merge(signal.categoryId(), signal.weight(), Double::sum);
            }
            if (signal.type() != null) {
                types.merge(signal.type(), signal.weight(), Double::sum);
            }
            if (signal.zone() != null) {
                zones.merge(signal.zone(), signal.weight(), Double::sum);
            }
            if (signal.listingId() != null) {
                touched.merge(signal.listingId(), signal.weight(), Math::max);
            }
            if (signal.price() != null && signal.price().signum() > 0) {
                prices.add(new WeightedPrice(signal.price(), signal.weight()));
            }
        }

        return new TasteProfile(
                normalise(categories), normalise(types), normalise(zones),
                touched, weightedMedian(prices), total);
    }

    /**
     * Divides through by the largest entry, so the favourite scores 1.0.
     *
     * <p>Against the total instead, a person with one interest and a person
     * with six would produce top scores an order of magnitude apart, and the
     * scorer's weights would mean different things for each of them.
     */
    private static <K> Map<K, Double> normalise(Map<K, Double> raw) {
        double top = raw.values().stream().mapToDouble(Double::doubleValue).max().orElse(0);
        if (top <= 0) {
            return Map.of();
        }
        Map<K, Double> out = new HashMap<>(raw.size());
        raw.forEach((key, value) -> out.put(key, value / top));
        return Map.copyOf(out);
    }

    private record WeightedPrice(BigDecimal price, double weight) {
    }

    /**
     * The middle of what they engage at, by weight.
     *
     * <p>A median rather than a mean, because one look at the most expensive
     * thing on the marketplace should not move somebody's price band; and
     * weighted, because the price of a thing they bought says more about their
     * budget than the price of a thing they glanced at.
     */
    private static BigDecimal weightedMedian(List<WeightedPrice> prices) {
        if (prices.isEmpty()) {
            return null;
        }
        prices.sort((a, b) -> a.price().compareTo(b.price()));
        double half = prices.stream().mapToDouble(WeightedPrice::weight).sum() / 2;
        double running = 0;
        for (WeightedPrice entry : prices) {
            running += entry.weight();
            if (running >= half) {
                return entry.price();
            }
        }
        return prices.get(prices.size() - 1).price();
    }

    /** True when there is too little here to rank by. See {@link #COLD_BELOW}. */
    public boolean isCold() {
        return totalWeight < COLD_BELOW;
    }

    /** 0 when they have never touched this category, 1 for their favourite. */
    public double categoryAffinity(UUID categoryId) {
        return categoryId == null ? 0 : categories.getOrDefault(categoryId, 0d);
    }

    public double typeAffinity(ListingType type) {
        return type == null ? 0 : types.getOrDefault(type, 0d);
    }

    public double zoneAffinity(CampusZone zone) {
        return zone == null ? 0 : zones.getOrDefault(zone, 0d);
    }

    /** How strongly they have already engaged with this listing. 0 if never. */
    public double touched(UUID listingId) {
        return listingId == null ? 0 : touched.getOrDefault(listingId, 0d);
    }

    public BigDecimal typicalPrice() {
        return typicalPrice;
    }

    public double totalWeight() {
        return totalWeight;
    }

    /** Their categories, strongest first. Used to suggest where to browse next. */
    public List<UUID> topCategories(int limit) {
        return categories.entrySet().stream()
                .sorted(Map.Entry.<UUID, Double>comparingByValue().reversed())
                .limit(Math.max(limit, 0))
                .map(Map.Entry::getKey)
                .toList();
    }

    /** Everything they have touched, for excluding it from what they are shown. */
    public Set<UUID> touchedIds() {
        return new HashSet<>(touched.keySet());
    }

    /**
     * The listings they engaged with most strongly, for asking the population
     * what else goes with them.
     *
     * <p>Ordered, where {@link #touchedIds()} is not: co-visitation is seeded
     * from a handful of these, and seeding it from whatever a hash set happened
     * to iterate first would make the suggestions wobble between requests for
     * no reason a reader could ever see.
     */
    public List<UUID> strongestTouched(int limit) {
        return touched.entrySet().stream()
                .sorted(Map.Entry.<UUID, Double>comparingByValue().reversed())
                .limit(Math.max(limit, 0))
                .map(Map.Entry::getKey)
                .toList();
    }
}
