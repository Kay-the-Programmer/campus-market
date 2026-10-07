package com.campusmarket.service.recommend;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;

/**
 * How likely somebody is to want a given listing, as one number.
 *
 * <p>A weighted sum of things we can actually observe, with every term bounded
 * to 0..1 before its weight is applied - so a term cannot run away and quietly
 * become the whole ranking, and the weights below mean what they say relative
 * to each other. Pure: same inputs, same number, no clock and no database, so
 * the ranking can be reasoned about and tested directly.
 *
 * <h2>What the weights say</h2>
 *
 * <p>Category dominates, because on a marketplace what somebody is shopping
 * for is overwhelmingly predicted by what they have been shopping for. Then
 * co-visitation, which is the only term that knows anything the person's own
 * history does not - it is what lets a lab coat suggest a particular
 * calculator. Price fit matters more than it looks: a student who browses at
 * K50 is not in the market for the K4,000 listing however well it matches on
 * every other facet.
 *
 * <p>Freshness and trending are deliberately small. They are what the ranking
 * falls back to when it knows nothing about the person - which is most
 * sessions - and a feed that leads with what is new and busy is a perfectly
 * good feed. They are not meant to beat a real preference.
 */
public final class ListingScorer {

    /** They have been shopping in this category. The strongest honest signal. */
    private static final double W_CATEGORY = 3.0;
    /** People who looked at what they looked at, looked at this. */
    private static final double W_CO_VIEW = 1.6;
    /** Within reach of what they actually spend. */
    private static final double W_PRICE = 1.2;
    /** Goods, services or food - a coarse but stable preference. */
    private static final double W_TYPE = 0.9;
    /** The side of campus they shop on. Real, but the smallest of the facets. */
    private static final double W_ZONE = 0.6;
    /** What the campus is looking at this week. */
    private static final double W_TRENDING = 0.7;
    /** Just posted. Also the tie-breaker that keeps a cold feed sensible. */
    private static final double W_FRESH = 0.8;
    /**
     * Has a photograph, a description, a price.
     *
     * <p>Weighted close to freshness on purpose, and this is the term that
     * stopped the feed being a list by date. An hour-old listing with no
     * photograph and no description is not the best thing to lead with, and
     * under a pure recency order it always was.
     */
    private static final double W_COMPLETE = 0.9;

    /**
     * Already seen it.
     *
     * <p>Demoted, not removed: something they looked at twice and did not save
     * is still more interesting than a random listing, and dropping it outright
     * makes the feed feel like it is hiding things. Enough to push it below an
     * equally good listing they have not seen.
     */
    private static final double P_SEEN = 1.4;

    /**
     * Already saved, carted or bought it.
     *
     * <p>Heavier, because this is the one case where showing it again is
     * actively unhelpful - it is on their list, they know where it is, and a
     * feed that keeps recommending the thing already in their basket looks
     * broken.
     */
    private static final double P_ENGAGED = 3.0;

    /** Their own listing. Never a recommendation; this is removal, not demotion. */
    private static final double P_OWN = 1000;

    /** How long a new listing keeps any of the freshness term. */
    private static final Duration FRESH_FOR = Duration.ofDays(14);

    /**
     * Above this multiple of their usual price, a listing scores nothing for
     * price fit. Two and a half times is roughly where "a bit of a stretch"
     * becomes "not for this person".
     */
    private static final double PRICE_TOLERANCE = 2.5;

    private ListingScorer() {
    }

    /**
     * Everything the score depends on besides the person and the listing.
     *
     * @param coViews   listing id to co-visitation strength, already normalised to 0..1
     * @param trending  listing id to recent view count, raw
     * @param topTrend  the busiest count in {@code trending}, for normalising it
     * @param viewerId  who is being ranked for, so their own listings can be dropped
     * @param now       the clock, passed in so freshness is testable
     */
    public record Context(
            Map<UUID, Double> coViews,
            Map<UUID, Long> trending,
            long topTrend,
            UUID viewerId,
            Instant now
    ) {
        public static Context none(Instant now) {
            return new Context(Map.of(), Map.of(), 0, null, now);
        }
    }

    public static double score(Candidate candidate, TasteProfile profile, Context context) {
        if (candidate == null) {
            return 0;
        }
        if (context.viewerId() != null && context.viewerId().equals(candidate.sellerId())) {
            return -P_OWN;
        }

        double score = 0;
        score += W_CATEGORY * profile.categoryAffinity(candidate.categoryId());
        score += W_TYPE * profile.typeAffinity(candidate.type());
        score += W_ZONE * profile.zoneAffinity(candidate.zone());
        score += W_PRICE * priceFit(candidate.price(), profile.typicalPrice());
        score += W_CO_VIEW * clamp(context.coViews().getOrDefault(candidate.id(), 0d));
        score += W_TRENDING * trendingFit(candidate.id(), context);
        score += W_FRESH * freshness(candidate.createdAt(), context.now());
        score += W_COMPLETE * clamp(candidate.completeness());

        double touched = profile.touched(candidate.id());
        if (touched >= Signal.Strength.SAVED) {
            score -= P_ENGAGED;
        } else if (touched > 0) {
            score -= P_SEEN;
        }
        return score;
    }

    /**
     * How close the price is to what this person engages at, 0..1.
     *
     * <p>Asymmetric on purpose. Cheaper than usual is barely a mark against a
     * listing - nobody is put off by a bargain - while more expensive runs out
     * fast, because a budget is a ceiling in a way it is not a floor. With no
     * price history at all every listing scores the same neutral half, so the
     * term adds nothing rather than guessing.
     */
    static double priceFit(BigDecimal price, BigDecimal typical) {
        if (typical == null || typical.signum() <= 0) {
            return 0.5;
        }
        if (price == null || price.signum() <= 0) {
            // Free, or a service quoting on request. Never a reason to demote.
            return 0.75;
        }
        double ratio = price.doubleValue() / typical.doubleValue();
        if (ratio <= 1) {
            // Down to a tenth of their usual spend still reads as in-budget.
            return clamp(0.75 + 0.25 * ratio);
        }
        double over = (ratio - 1) / (PRICE_TOLERANCE - 1);
        return clamp(1 - over);
    }

    /** The listing's share of the busiest listing's recent views, 0..1. */
    private static double trendingFit(UUID id, Context context) {
        if (context.topTrend() <= 0) {
            return 0;
        }
        long views = context.trending().getOrDefault(id, 0L);
        return clamp((double) views / context.topTrend());
    }

    /** 1.0 the moment it is posted, nothing a fortnight later, linear between. */
    static double freshness(Instant createdAt, Instant now) {
        if (createdAt == null || now == null) {
            return 0;
        }
        long age = Duration.between(createdAt, now).toMinutes();
        if (age <= 0) {
            return 1;
        }
        return clamp(1 - (double) age / FRESH_FOR.toMinutes());
    }

    private static double clamp(double value) {
        if (Double.isNaN(value)) {
            return 0;
        }
        return Math.max(0, Math.min(1, value));
    }
}
