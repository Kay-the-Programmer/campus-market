package com.campusmarket.repository;

import com.campusmarket.domain.AccountType;
import com.campusmarket.domain.SellerApprovalStatus;

import java.util.UUID;

/**
 * One addressable recipient of a campaign, flattened out of the user and
 * preference rows.
 *
 * <p>A projection rather than the {@link com.campusmarket.domain.User} entity:
 * a campaign reads six fields and writes none, and loading managed entities for
 * every recipient would put the whole audience in the persistence context for
 * no reason - then keep it there for the length of the send.
 */
public record MarketingRecipient(
        UUID userId,
        String email,
        String name,
        AccountType accountType,
        SellerApprovalStatus sellerApprovalStatus,
        UUID unsubscribeToken
) {
}
