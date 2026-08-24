package com.campusmarket.util;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.text.DecimalFormat;

/**
 * Currency rendering for anything the server writes in words - notification
 * bodies, emails, push payloads.
 *
 * <p>Amounts are Zambian kwacha, written as a bare prefix: {@code K120}. The
 * symbol lives here rather than being concatenated at each call site, which is
 * how the previous '$' ended up scattered across two services.
 *
 * <p>The frontend has its own copy of this rule in {@code utils/currency.ts}.
 * Two implementations is the cost of the server phrasing its own sentences;
 * they are kept deliberately simple so they cannot drift far.
 */
public final class Money {

    private Money() {
    }

    public static final String SYMBOL = "K";

    /**
     * Format an amount for display: {@code K1,200}, or {@code K12.50} when
     * there is ngwee to show.
     *
     * <p>Whole amounts drop the minor units so a price reads like a price tag,
     * but fractions are never rounded away - the figure is one someone is
     * about to hand over in cash.
     */
    public static String format(BigDecimal amount) {
        if (amount == null) {
            return SYMBOL + "0";
        }
        BigDecimal value = amount.setScale(2, RoundingMode.HALF_UP);
        boolean whole = value.stripTrailingZeros().scale() <= 0;
        DecimalFormat format = new DecimalFormat(whole ? "#,##0" : "#,##0.00");
        return SYMBOL + format.format(value);
    }
}
