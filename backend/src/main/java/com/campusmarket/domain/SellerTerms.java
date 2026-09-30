package com.campusmarket.domain;

/**
 * The version of the seller terms currently in force.
 *
 * <p>The text itself lives in the client ({@code src/data/sellerTerms.ts}),
 * which is what a human reads; the server keeps only the version string,
 * because the version is the part it has to enforce.
 *
 * <p>Applications are refused unless the client says it showed <em>this</em>
 * version. That turns the one failure worth catching - a cached bundle
 * displaying last month's clauses - into a loud error instead of a record
 * saying someone accepted terms they were never shown. Change this string and
 * {@code SELLER_TERMS_VERSION} in the client together.
 */
public final class SellerTerms {
    private SellerTerms() {}

    public static final String CURRENT_VERSION = "2026-09-30";
}
