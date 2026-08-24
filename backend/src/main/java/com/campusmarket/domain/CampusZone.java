package com.campusmarket.domain;

/**
 * Which part of campus someone is based in, and where a listing is handed over.
 *
 * <p>Replaces the free-text {@code location} string for matching purposes: three
 * fixed zones are coarse enough that everyone picks the same value for the same
 * place, which is what makes "show me listings near me" work at all. The old
 * free-text field is kept alongside this for the specific meetup spot
 * ("Hall 4 Dorms"), since the zone alone is too vague to meet at.
 */
public enum CampusZone {
    DOWNSCHOOL("Downschool"),
    UPSCHOOL("Upschool"),
    ACROSS("Across");

    private final String label;

    CampusZone(String label) {
        this.label = label;
    }

    public String label() {
        return label;
    }
}
