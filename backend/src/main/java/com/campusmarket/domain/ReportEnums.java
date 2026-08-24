package com.campusmarket.domain;

/** Container for the report-related enums so they stay together. */
public final class ReportEnums {
    private ReportEnums() {}

    public enum TargetType { LISTING, USER }

    public enum Reason { SCAM, INAPPROPRIATE_CONTENT, PROHIBITED_ITEM, HARASSMENT, OTHER }

    public enum Status { PENDING, RESOLVED }

    public enum Resolution { DISMISSED, LISTING_REMOVED, USER_BANNED }
}
